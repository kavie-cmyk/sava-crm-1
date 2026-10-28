(function () {
  'use strict';
  const F = window.PublishingScore, DATA = window.PublishingData, KEY = 'sava_publishing_v1';
  const role = document.body.dataset.role === 'mkt' ? 'mkt' : 'bd';
  const params = new URLSearchParams(location.search);
  let tab = ['market','reviews','framework'].includes(params.get('tab')) ? params.get('tab') : 'market';
  let query = '', category = 'Puzzle', reviewFilter = 'all', active = null, focusBefore = null;
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (v,d=0) => typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US',{maximumFractionDigits:d}) : '—';
  const pct = v => typeof v === 'number' ? num(v*100,1)+'%' : '—';
  const usd = v => typeof v === 'number' ? '$'+num(v,2) : '—';
  const stamp = v => v ? new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}) : '';
  const uuid = () => crypto.randomUUID();
  const REVIEW_STATUSES = ['Chờ đánh giá','Đang đánh giá','Chờ bổ sung','Hoàn tất'];
  function sanitizeRequest(r, i) {
    if (!r || typeof r !== 'object') return null;
    // Thiếu kind/entityId -> không xác định được hồ sơ: LOẠI khỏi danh sách (lựa chọn có chủ đích,
    // request như vậy không mở/chấm được và từng làm sập render khi truy cập sâu).
    if (!['company','game'].includes(r.kind) || !r.entityId) return null;
    if (!r.id) r.id = 'REV-restored-' + i;
    r.revisions = (Array.isArray(r.revisions) ? r.revisions : []).filter(h => h && typeof h === 'object');
    r.current = r.current && typeof r.current === 'object' ? r.current : (r.revisions[r.revisions.length - 1] || {});
    if (!REVIEW_STATUSES.includes(r.status)) {
      const fromRev = [...r.revisions].reverse().map(h => h.status).find(st => REVIEW_STATUSES.includes(st));
      r.status = fromRev || (REVIEW_STATUSES.includes(r.current?.status) ? r.current.status : 'Chờ đánh giá');
    }
    r.intake = r.intake && typeof r.intake === 'object' ? r.intake : {};
    if (typeof r.revision !== 'number' || !Number.isFinite(r.revision)) r.revision = r.revisions.length;
    return r;
  }
  function read() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {version:1,requests:[],marketUpdates:[]};
    const x = JSON.parse(raw);
    if (x.version !== 1) throw Error('Dữ liệu Publishing không đúng định dạng. Hãy giữ bản sao trước khi sửa.');
    const requests = (Array.isArray(x.requests) ? x.requests : []).map(sanitizeRequest).filter(Boolean);
    const marketUpdates = (Array.isArray(x.marketUpdates) ? x.marketUpdates : [])
      .filter(u => u && typeof u === 'object' && u.id)
      .map(u => ({...u, audit: Array.isArray(u.audit) ? u.audit : []}));
    return {...x, requests, marketUpdates};
  }
  function write(s) { localStorage.setItem(KEY,JSON.stringify(s)); }
  function deleteRequest(id) {
    const store = read(), r = store.requests.find(x => x.id === id); if (!r) return;
    const name = label(entity(crm(), r.kind, r.entityId));
    const n = (r.revisions || []).length;
    if (!confirm(`Xóa yêu cầu đánh giá "${name}" (${r.kind === 'company' ? 'company' : 'game'})?\nSẽ xóa vĩnh viễn yêu cầu này cùng ${n} phiên bản đánh giá đã lưu. Hành động này KHÔNG khôi phục được.`)) return;
    store.requests = store.requests.filter(x => x.id !== id);
    write(store);
    if ($('#editor').open) closeDialog();
    render(); notify('Đã xóa yêu cầu đánh giá.');
  }
  function deleteMarketObs(id) {
    const store = read(), u = store.marketUpdates.find(x => x.id === id); if (!u) return;
    const isOriginal = DATA.records.some(x => x.id === id);
    const msg = isOriginal
      ? `Gỡ dữ liệu bổ sung của "${u.name || id}" và khôi phục bản gốc workbook?\nLịch sử cập nhật (${(u.audit || []).length} mục) của phần bổ sung sẽ mất. KHÔNG khôi phục được.`
      : `Xóa quan sát thị trường "${u.name || id}"?\nQuan sát này sẽ bị xóa vĩnh viễn. KHÔNG khôi phục được.`;
    if (!confirm(msg)) return;
    store.marketUpdates = store.marketUpdates.filter(x => x.id !== id);
    write(store);
    if ($('#editor').open) closeDialog();
    render(); notify(isOriginal ? 'Đã gỡ dữ liệu bổ sung, khôi phục bản gốc.' : 'Đã xóa quan sát thị trường.');
  }
  const crm = () => loadState();
  const isStudio = c => Object.hasOwn(c.roles || {},'publishing') && !/publisher/i.test(c.type || '');
  const entity = (s,kind,id) => (kind === 'company' ? s.companies : s.games).find(x=>x.id===id);
  const label = x => x?.name || x?.title || 'Hồ sơ đã được gỡ';
  const eligibleGames = s => s.games.filter(g=>g.own === 'ours' || g.own === 'partner');
  function notify(text) { $('#toast').textContent=text; $('#toast').classList.add('on'); clearTimeout(notify.timer); notify.timer=setTimeout(()=>$('#toast').classList.remove('on'),3000); }
  const badge = text => {
    const t = String(text ?? '');
    // Thứ tự quan trọng: âm tính trước ("Chưa đạt" chứa "Đạt"), rồi cảnh báo, rồi tích cực.
    const cls = /Chưa đạt|NO-GO|Bị chặn|Từ chối/.test(t) ? 'blocked'
      : /Test thêm|TEST MORE|Có điều kiện/.test(t) ? 'warning'
      : /Greenlight|GREENLIGHT|Ưu tiên|Hoàn tất/.test(t) || /Đạt\s*$/.test(t) ? 'positive'
      : 'pending';
    return `<span class="badge ${cls}">${esc(text)}</span>`;
  };
  const options = (values,current) => values.map(v=>`<option value="${esc(Array.isArray(v)?v[0]:v)}" ${String(current??'')===String(Array.isArray(v)?v[0]:v)?'selected':''}>${esc(Array.isArray(v)?v[1]:v)}</option>`).join('');
  const field = (name,text,value='',type='text',extra='') => `<label>${esc(text)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const area = (name,text,value='') => `<label class="full">${esc(text)}<textarea name="${esc(name)}">${esc(value)}</textarea></label>`;
  const select = (name,text,vals,value) => `<label>${esc(text)}<select name="${esc(name)}">${options(vals,value)}</select></label>`;
  /* ---- Members (hợp đồng shared.js: S.members + memberName/memberList; KHÔNG fallback USERS) ---- */
  function memberList() {
    // S7b: CHỈ lấy từ CRM state thật qua window.memberList(crmState) của shared.js, nguồn state
    // là crm()/loadState() như cơ chế sẵn có của file — ĐÃ BỎ hẳn nhánh fallback hằng USERS cũ
    // (không bịa thêm Linh/Tuấn "ma"). Chỉ gồm member đang active; khi CRM không còn member
    // active nào (mọi member bị tắt active — mảng members vẫn được CRM giữ nguyên), trả rỗng.
    try {
      const s = crm();
      const raw = (typeof window !== 'undefined' && typeof window.memberList === 'function') ? window.memberList(s) : (Array.isArray(s?.members) ? s.members : []);
      return (raw || []).filter(m => m && m.active !== false).map(m => ({id:String(m.id ?? ''), name:String(m.name || m.id || ''), role:m.role || 'Khác'}));
    } catch { return []; }
  }
  function effectiveMembers(roleFilter) {
    const all = memberList();
    if (!roleFilter) return all;
    const filtered = all.filter(m => m.role === roleFilter);
    return filtered.length ? filtered : all;
  }
  function memberOptionsHtml(roleFilter,current) {
    const all=memberList();
    let list=roleFilter?all.filter(m=>m.role===roleFilter):all;
    if (roleFilter && !list.length) list=all;
    let html=list.map(m=>`<option value="${esc(m.id)}" ${String(current??'')===String(m.id)?'selected':''}>${esc(m.name||m.id)}</option>`).join('');
    const cur=String(current??'').trim();
    if (cur && !list.some(m=>String(m.id)===cur)) html+=`<option value="${esc(cur)}" selected>${esc(cur)} (dữ liệu cũ)</option>`;
    return html;
  }
  const memberField = (name,text,roleFilter,current='',opts={}) => {
    // S7b: không còn member active (theo role lọc, có fallback toàn bộ như memberOptionsHtml)
    // -> bỏ required để không chặn submit + hiện ghi chú cạnh field.
    const noActive = effectiveMembers(roleFilter).length === 0;
    const req = opts.required && !noActive;
    return `<label>${esc(text)}<select name="${esc(name)}" ${req?'required':''}><option value="">— Chưa gán —</option>${memberOptionsHtml(roleFilter,current)}</select>${noActive?'<small class="mut member-empty-note">Chưa có thành viên đang hoạt động — hãy thêm/kích hoạt thành viên trong CRM.</small>':''}</label>`;
  };
  function displayName(v) {
    const cur=String(v??'').trim(); if(!cur) return '';
    // M6: ưu tiên window.memberName(crmState, id) của shared.js; không tra được thì fallback chính id.
    try { const s=crm(); const fn=(typeof window!=='undefined'&&typeof window.memberName==='function')?window.memberName:(typeof memberName!=='undefined'&&typeof memberName==='function'?memberName:null); if (fn) { const n=fn(s,cur); if (n) return String(n); } } catch {}
    const m=memberList().find(x=>String(x.id)===cur); return m?m.name:cur;
  }
  /* ---- Intake (hồ sơ đầu vào BD thu thập) ---- */
  const GAME_INTAKE_LABELS=[['mechanicId','Mechanic khớp dữ liệu thị trường'],['genre','Genre'],['subGenre','Sub-genre'],['artStyle','Art style'],['coreLoop','Core loop'],['gameFeel','Game feel / archetype'],['platforms','Nền tảng'],['devStage','Giai đoạn phát triển'],['monetizationModel','Mô hình monetization'],['targetGeo','Thị trường mục tiêu'],['metricDownloads','Downloads (studio báo)'],['metricRetention','Retention (studio báo)'],['metricCpi','CPI test thực tế (USD)'],['metricRevenue','Revenue (studio báo)'],['storeUrl','Link store'],['videoUrl','Link video / trailer'],['expectations','Kỳ vọng publishing']];
  const COMPANY_INTAKE_LABELS=[['teamSize','Quy mô team'],['country','Quốc gia'],['mainGenres','Genre chính'],['mainPlatforms','Nền tảng chính'],['trackRecord','Track record'],['website','Website studio']];
  function mechanicField(current='') {
    const cats=[...new Set(DATA.records.map(r=>r.category))];
    const groups=cats.map(cat=>`<optgroup label="${esc(cat)}">${DATA.records.filter(r=>r.category===cat).map(r=>`<option value="${esc(r.id)}" ${String(current??'')===r.id?'selected':''}>${esc(r.name)} — ${esc(r.category)}</option>`).join('')}</optgroup>`).join('');
    const extra=current && !DATA.records.some(r=>r.id===current) ? `<option value="${esc(current)}" selected>${esc(current)} (dữ liệu cũ)</option>` : '';
    return `<label>Mechanic khớp dữ liệu thị trường<select name="mechanicId"><option value="">— Chưa khớp mechanic trong dữ liệu —</option>${groups}${extra}</select></label>`;
  }
  function intakeFieldsHTML(kind,intake={}) {
    const v=intake||{};
    if (kind==='game') return `<div class="mk-intake-edit"><h3>Hồ sơ đầu vào — thông tin game &amp; studio</h3><p class="mut">BD thu thập từ studio; mọi trường đều không bắt buộc, nhưng mechanic khớp dữ liệu là khóa để tính điểm thị trường tự động.</p><div class="fields">${mechanicField(v.mechanicId||'')}${field('genre','Genre',v.genre||'')}${field('subGenre','Sub-genre',v.subGenre||'')}${select('artStyle','Art style',['','2D','3D','Pixel','Anime','Hand-drawn','Low-poly','Realistic','Khác'],v.artStyle||'')}${area('coreLoop','Core loop',v.coreLoop||'')}${field('gameFeel','Game feel / archetype',v.gameFeel||'')}${select('platforms','Nền tảng',['','Android','iOS','Android + iOS','PC','Nhiều nền tảng'],v.platforms||'')}${select('devStage','Giai đoạn phát triển',['','Concept','Prototype','Alpha','Beta','Soft launch','Live'],v.devStage||'')}${select('monetizationModel','Mô hình monetization',['','Hybrid IAP','Hybrid IAA','IAP thuần','IAA thuần','Premium','Chưa rõ'],v.monetizationModel||'')}${field('targetGeo','Thị trường mục tiêu',v.targetGeo||'','text','placeholder="VD: US, SEA, Global"')}${field('metricDownloads','Downloads đã có (studio báo)',v.metricDownloads||'')}${field('metricRetention','Retention (studio báo)',v.metricRetention||'','text','placeholder="VD: D1 40% · D7 18%"')}${field('metricCpi','CPI test thực tế (USD)',v.metricCpi??'','number','step="0.01" min="0"')}${field('metricRevenue','Revenue đã có (studio báo)',v.metricRevenue||'')}${field('storeUrl','Link store',v.storeUrl||'','url')}${field('videoUrl','Link video / trailer',v.videoUrl||'','url')}${area('expectations','Kỳ vọng publishing (rev share mong muốn, thị trường muốn đánh, hỗ trợ cần từ SAVA…)',v.expectations||'')}</div></div>`;
    return `<div class="mk-intake-edit"><h3>Hồ sơ đầu vào — thông tin studio</h3><div class="fields">${field('teamSize','Quy mô team',v.teamSize||'')}${field('country','Quốc gia',v.country||'')}${field('mainGenres','Genre chính',v.mainGenres||'')}${field('mainPlatforms','Nền tảng chính',v.mainPlatforms||'')}${area('trackRecord','Track record — game đã phát hành / kết quả',v.trackRecord||'')}${field('website','Website studio',v.website||'','url')}</div></div>`;
  }
  function readIntake(d,kind,fallback) {
    const labels=kind==='game'?GAME_INTAKE_LABELS:COMPANY_INTAKE_LABELS, keys=labels.map(([k])=>k);
    if (!keys.some(k=>d.get(k)!==null)) return fallback;
    const out={};
    for (const k of keys) { const raw=d.get(k), val=raw===null?'':String(raw).trim(); out[k]=k==='metricCpi'?(val===''? '' : Number(val)):val; }
    return out;
  }
  function intakeDisplayHTML(r) {
    const intake=r.intake||{}, labels=r.kind==='game'?GAME_INTAKE_LABELS:COMPANY_INTAKE_LABELS;
    const fmt=(k,v)=>{
      if (v===undefined||v===null||String(v).trim()==='') return '—';
      if (k==='mechanicId') { const rec=DATA.records.find(x=>x.id===v); return rec?`${rec.name} — ${rec.category} (${rec.id})`:String(v); }
      if (k==='metricCpi') { const n=typeof v==='number'?v:Number(v); return Number.isFinite(n)?usd(n):String(v); }
      return String(v);
    };
    return `<section class="section"><h3>Hồ sơ đầu vào (BD thu thập từ studio)</h3><dl class="mk-dl">${labels.map(([k,t])=>`<div class="mk-dl-row"><dt>${esc(t)}</dt><dd>${esc(fmt(k,intake[k]))}</dd></div>`).join('')}</dl></section>`;
  }
  /* ---- Chi tiết mechanic mở rộng (data v2 từ sheets-data.json) ---- */
  const noData = '<p class="mut">chưa có dữ liệu</p>';
  const kvTable = rows => { const vis = rows.filter(([, v]) => v !== '—'); return vis.length ? `<div class="table-scroll"><table><tbody>${vis.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="numeric">${v}</td></tr>`).join('')}</tbody></table></div>` : noData; };
  function detailExtrasHTML(r) {
    const e = r.entry, u = r.uaBenchmark, vd = r.verifiedDaily, na = r.newApps, el = r.eligible, sr = r.simRange, ch = r.cohortHistory;
    const entryHTML = e ? kvTable([['Top1 Rev concentration', pct(e.top1RevConc)], ['Top3 Rev concentration', pct(e.top3RevConc)], ['Top5 Rev concentration', pct(e.top5RevConc)], ['Top10 Rev concentration', pct(e.top10RevConc)], ['Top5 DL concentration', pct(e.top5DlConc)], ['#Publishers Top20', num(e.publishersTop20)], ['Median age Top20 (tháng)', num(e.medianAgeTop20Months, 1)], ['#Incumbents >24m', num(e.incumbentsOver24m)], ['#New launches 12m', num(e.newLaunches12m)], ['#Entrants Top200 / Top100 / Top50', [e.entrantsTop200, e.entrantsTop100, e.entrantsTop50].some(v => v != null) ? [e.entrantsTop200, e.entrantsTop100, e.entrantsTop50].map(v => num(v)).join(' / ') : '—'], ['Newcomer share Top100 Grossing', pct(e.newcomerShare)]]) : noData;
    const uaHTML = u ? kvTable([['CPI P25 / Median / P75', [u.cpiP25, u.cpiMedian, u.cpiP75].some(v => v != null) ? [u.cpiP25, u.cpiMedian, u.cpiP75].map(v => usd(v)).join(' / ') : '—'], ['CPM median', usd(u.cpmMedian)], ['CTR median', num(u.ctrMedian, 3)], ['IPM median', num(u.ipmMedian, 2)], ['Store CVR median', pct(u.storeCvrMedian)], ['ROAS D7 / D30', [u.roasD7, u.roasD30].some(v => v != null) ? [u.roasD7, u.roasD30].map(v => num(v, 3)).join(' / ') : '—'], ['CPI coverage', pct(u.cpiCoverage)], ['Valid / Eligible titles', num(u.cpiValidTitles) + ' / ' + num(u.eligibleTitles)]]) + `<p class="mut">${esc(u.period || '')} · ${esc(u.platform || '')}</p>` : noData;
    const vdHTML = vd ? kvTable([['Downloads / ngày (verified)', num(vd.downloadsDay)], ['Revenue / ngày (verified)', usd(vd.revenueDay)], ['DL share / Rev share (Puzzle Top100)', pct(vd.dlShare) + ' / ' + pct(vd.revShare)], ['Title free / grossing duy nhất', num(vd.uniqueFreeTitles) + ' / ' + num(vd.uniqueGrossingTitles)]]) : noData;
    const storeHTML = r.verifiedByStore?.length ? `<div class="table-scroll"><table><thead><tr><th>Store</th><th class="numeric">DL / ngày</th><th class="numeric">Revenue / ngày</th><th class="numeric">DL share</th><th class="numeric">Rev share</th><th class="numeric">Free / Grossing titles</th></tr></thead><tbody>${r.verifiedByStore.map(s => `<tr><td>${esc(s.store)}</td><td class="numeric">${num(s.downloadsDay)}</td><td class="numeric">${usd(s.revenueDay)}</td><td class="numeric">${pct(s.dlShare)}</td><td class="numeric">${pct(s.revShare)}</td><td class="numeric">${num(s.freeTitles)} / ${num(s.grossingTitles)}</td></tr>`).join('')}</tbody></table></div>` : noData;
    const titles = r.topTitles || [];
    const titlesHTML = titles.length ? `<div class="table-scroll"><table><thead><tr><th>Game</th><th>Publisher</th><th class="numeric">DL / ngày</th><th class="numeric">Revenue / ngày</th><th class="numeric">GP DL · Rev</th><th class="numeric">iOS DL · Rev</th><th class="numeric">Rev 90d</th></tr></thead><tbody>${titles.slice(0, 15).map(t => `<tr><td>${esc(t.game)}<div class="mut">${esc(t.gamefeel || '')}</div></td><td>${esc(t.publisher || '—')}</td><td class="numeric">${num(t.downloadsDay)}</td><td class="numeric">${usd(t.revenueDay)}</td><td class="numeric">${num(t.gpDownloadsDay)} · ${usd(t.gpRevenueDay)}</td><td class="numeric">${num(t.iosDownloadsDay)} · ${usd(t.iosRevenueDay)}</td><td class="numeric">${usd(t.revenue90d)}</td></tr>`).join('')}</tbody></table></div>${titles.length > 15 ? `<p class="mut">Hiển thị 15/${titles.length} title có revenue/ngày cao nhất trong nguồn.</p>` : ''}` : noData;
    const misc = [];
    if (na) misc.push(['New gainers quan sát 12m (tab 25)', num(na.observedNewGainers12m) + ' · GP ' + num(na.observedOnGP) + ' · iOS ' + num(na.observedOnIOS)]);
    if (el) misc.push(['Eligible titles có coverage (tab 39)', num(el.titlesWithCoverage)], ['Eligible RPD 12m', usd(el.rpd12m)], ['Eligible titles', el.includedTitles?.length ? esc(el.includedTitles.join('; ')) : '—']);
    if (ch) misc.push(['Verified core titles (tab 17)', num(ch.verifiedCoreTitles)], ['Cohort RPD 12m', usd(ch.rpd12m)], ['Coverage status', esc(ch.coverageStatus || '—')]);
    if (sr) misc.push(['Simulation: title duy nhất (tab 34)', num(sr.uniqueTitles)], ['Simulation: title ≥10K DL/ngày', num(sr.dlRanges?.d10kPlus)], ['Simulation: title ≥$100K Rev/ngày', num(sr.revRanges?.r100kPlus)]);
    return `<section class="section"><h3>Cạnh tranh &amp; khả năng thâm nhập (tab 03)</h3>${entryHTML}</section><section class="section"><h3>UA benchmark mở rộng (tab 05)</h3>${uaHTML}</section><section class="section"><h3>Số đã xác minh theo ngày (tab 20)</h3>${vdHTML}</section><section class="section"><h3>Số đã xác minh theo store (tab 16 / Simulation: tab 31)</h3>${storeHTML}</section><section class="section"><h3>Top titles theo mechanic (tab 04)</h3>${titlesHTML}</section><section class="section"><h3>Tín hiệu bổ sung (tab 25 / 39 / 17 / 34)</h3>${misc.length ? kvTable(misc) : noData}</section>`;
  }
  /* ---- Market Score v2 (panel trong hồ sơ đánh giá game) ---- */
  const V2_MANUAL = ['economics', 'rtw', 'whitespace'];
  const fmtRaw = raw => !raw ? '—' : Object.entries(raw).map(([k, v]) => `${k}=${typeof v === 'number' ? (Math.abs(v) < 1 && v !== 0 ? num(v, 4) : num(v, 2)) : v}`).join(' · ');
  function v2Context(r) {
    if (r.kind !== 'game' || !F.marketSuggest) return null;
    const mid = r.intake?.mechanicId; if (!mid) return null;
    const all = observations(), rec = all.find(x => x.id === mid); if (!rec) return null;
    return {rec, suggest: F.marketSuggest(all, rec)};
  }
  function v2PanelHTML(r, a) {
    if (r.kind !== 'game' || !F.gameV2) return '';
    const ctx = v2Context(r), saved = a.scoresV2 || null;
    // S6: mechanic đã dùng cho điểm v2 đã lưu (fromMechanicId ghi khi lưu) vs mechanic hiện tại của intake.
    const curMech = r.intake?.mechanicId || null;
    const savedMech = saved ? (saved.fromMechanicId ?? saved.mechanicId ?? null) : null;
    const mechChanged = !!(saved && savedMech && curMech && savedMech !== curMech);
    const mechName = id => { const rec = DATA.records.find(x => x.id === id); return rec ? `${rec.name} (${rec.id})` : String(id || '—'); };
    const draftM = {}; if (ctx && !mechChanged) for (const [k] of F.market) { const sg = ctx.suggest[k]; if (sg) draftM[k] = {score: sg.score, source: 'auto', rawInputs: sg.rawInputs}; }
    const shown = saved || {market: draftM, prototype: {}};
    const res = F.gameV2(shown);
    const srcLabel = sv => sv === 'auto' ? 'Tự động' : sv === 'override' ? 'Ghi đè gợi ý' : sv === 'manual' ? 'Chấm tay' : '—';
    const rowM = ([k, t, w]) => { const cur = shown.market?.[k], sug = mechChanged ? null : ctx?.suggest?.[k]; const manual = V2_MANUAL.includes(k); return `<tr><td>${esc(t)}<div class="mut">${manual ? 'chấm tay — chưa có dữ liệu tự động' : 'trọng số ' + w + '%'}</div></td><td class="numeric">${w}%</td><td class="numeric">${cur ? num(cur.score, 1) : '—'}</td><td>${cur ? esc(srcLabel(cur.source)) : (sug ? 'gợi ý ' + num(sug.score, 1) + ' (chưa lưu)' : '—')}</td><td class="mk-raw">${esc(cur ? fmtRaw(cur.rawInputs) : sug ? fmtRaw(sug.rawInputs) : '—')}</td>${role === 'mkt' ? `<td><input name="v2m_${esc(k)}" type="number" min="1" max="5" step="0.5" value="${cur?.score ?? (mechChanged ? '' : sug?.score) ?? ''}" aria-label="Điểm v2 ${esc(t)}"></td>` : ''}</tr>`; };
    const rowP = ([k, t, w]) => { const cur = shown.prototype?.[k]; return `<tr><td>${esc(t)}<div class="mut">chấm tay + ghi chú evidence ở bộ tiêu chí bên dưới</div></td><td class="numeric">${w}%</td><td class="numeric">${cur ? num(cur.score, 1) : '—'}</td><td>${cur ? 'Chấm tay' : '—'}</td><td class="mk-raw">—</td>${role === 'mkt' ? `<td><input name="v2p_${esc(k)}" type="number" min="1" max="5" step="0.5" value="${cur?.score ?? ''}" aria-label="Điểm Prototype v2 ${esc(t)}"></td>` : ''}</tr>`; };
    const compBar = (t, c) => `<div class="mk-scorebar"><span>${esc(t)}</span><span class="mk-scorebar-track"><span class="mk-scorebar-fill" style="width:${Math.round((c || 0) * 100)}%"></span></span><b>${pct(c)}</b></div>`;
    // S11: completeness < 80% -> hiển thị "— (chưa đủ dữ liệu · X%)" thay cho con số.
    const pctTxt = c => Math.round((c || 0) * 100) + '%';
    const marketDisp = res.market.completeness < 0.8 ? `— (chưa đủ dữ liệu · ${pctTxt(res.market.completeness)})` : (res.market.score === null ? '—' : num(res.market.score, 1));
    const protoDisp = res.prototype.completeness < 0.8 ? `— (chưa đủ dữ liệu · ${pctTxt(res.prototype.completeness)})` : (res.prototype.score === null ? '—' : num(res.prototype.score, 1));
    // Final bị chặn vì completeness: X = completeness THẤP HƠN trong hai khối (cổ chai quyết định).
    const finalBlockedByCompleteness = res.final !== null && res.decision === null && /completeness/i.test(res.decisionBlockedReason || '');
    const finalDisp = finalBlockedByCompleteness ? `— (chưa đủ dữ liệu · ${pctTxt(Math.min(res.market.completeness, res.prototype.completeness))})` : (res.final === null ? '—' : num(res.final, 1));
    // M5: phân biệt mốc dữ liệu đã lưu vs gợi ý live.
    const stampNote = saved ? `Điểm đã lưu · ${esc(stamp(a.at) || 'không rõ thời gian')}` : 'Gợi ý live theo dữ liệu thị trường hiện tại — chưa lưu';
    const mechWarn = mechChanged ? `<p class="mk-alert" role="alert">Mechanic đã đổi từ ${esc(mechName(savedMech))} sang ${esc(mechName(curMech))} — điểm Market v2 đã lưu thuộc mechanic cũ, cần chấm lại. Bảng dưới chỉ hiển thị điểm đã lưu (không trộn gợi ý của mechanic mới); khi MKT lưu phiên mới, rawInputs cũ sẽ bị loại và tính lại theo mechanic hiện tại.</p>` : '';
    return `<section class="section mk-v2"><h3>Market Score v2 · quartile (market-v2) — khung quyết định chính thức</h3><p class="mut">${ctx ? `Gợi ý tự động theo quartile trong nhóm ${esc(ctx.rec.category)} của mechanic ${esc(ctx.rec.name)}; người chấm ghi đè được mọi gợi ý. Production Economics / SAVA Right-to-Win / Gamefeel Whitespace chấm tay — chưa có dữ liệu tự động.` : 'Chưa khớp mechanic — không có gợi ý tự động; vẫn chấm tay được cả 8 tiêu chí.'} ${esc(stampNote)}.</p>${mechWarn}<div class="summary-result"><div><small>Market /100 (chuẩn hoá)</small><strong>${marketDisp}</strong></div><div><small>Prototype /100 (chuẩn hoá)</small><strong>${protoDisp}</strong></div><div><small>Final /100</small><strong>${finalDisp}</strong></div></div>${compBar('Completeness Market', res.market.completeness)}${compBar('Completeness Prototype', res.prototype.completeness)}<p class="mut">${res.marketInsufficient ? 'Market: Chưa đủ dữ liệu để kết luận (completeness &lt; 80%) — điểm chỉ là tạm tính. ' : ''}${res.final === null ? 'Final: chưa tính được Final (thiếu Market hoặc Prototype).' : res.decision ? `Quyết định v2: <b>${esc(res.decision)}</b> (Final ≥80 Greenlight · 65–79.9 Test thêm · &lt;65 Chưa đạt).` : esc(res.decisionBlockedReason || '')}</p><div class="table-scroll"><table class="mk-v2-table"><thead><tr><th>Tiêu chí Market</th><th class="numeric">Trọng số</th><th class="numeric">Điểm</th><th>Nguồn</th><th>Số gốc (rawInputs)</th>${role === 'mkt' ? '<th>Chấm / ghi đè</th>' : ''}</tr></thead><tbody>${F.market.map(rowM).join('')}</tbody></table></div><div class="table-scroll"><table class="mk-v2-table"><thead><tr><th>Tiêu chí Prototype</th><th class="numeric">Trọng số</th><th class="numeric">Điểm</th><th>Nguồn</th><th>Số gốc</th>${role === 'mkt' ? '<th>Chấm tay</th>' : ''}</tr></thead><tbody>${F.prototype.map(rowP).join('')}</tbody></table></div><p class="mut">Khung cũ (bên dưới) vẫn giữ nguyên để tương thích phiên bản đã lưu; điểm v2 lưu riêng trong scoresV2 của mỗi phiên bản, không ghi đè khung cũ. Quyết định chốt theo Market Score v2 này; điểm marketAuto 4 cấu phần chỉ còn ở tab Thị trường dưới dạng tham khảo.</p></section>`;
  }

  /* ---- Giao diện thị trường trực quan (việc E) ---- */
  const heatClass = v => v===null||v===undefined?'mk-h0':v>=80?'mk-h4':v>=65?'mk-h3':v>=50?'mk-h2':'mk-h1';
  function marketVisualsHTML(filteredRows) {
    if (!F.marketAuto) return '';
    const all=observations(), scored=all.map(r=>({r,a:F.marketAuto(all,r)}));
    const withTotal=scored.filter(x=>x.a.total!==null);
    const kpis=`<div class="mk-kpis"><div class="mk-kpi"><small>Mechanic có điểm tự động</small><strong>${withTotal.length}</strong></div><div class="mk-kpi"><small>Total ≥ 75</small><strong>${withTotal.filter(x=>x.a.total>=75).length}</strong></div><div class="mk-kpi"><small>Monetization ≥ 75</small><strong>${scored.filter(x=>x.a.monetization!==null&&x.a.monetization>=75).length}</strong></div><div class="mk-kpi"><small>UA ≥ 60</small><strong>${scored.filter(x=>x.a.ua!==null&&x.a.ua>=60).length}</strong></div></div>`;
    const top=[...withTotal].sort((x,y)=>y.a.total-x.a.total).slice(0,8);
    const topHTML=top.length?`<div class="mk-bars">${top.map(x=>`<button type="button" class="mk-bar-row" data-market="${esc(x.r.id)}"><span class="mk-bar-name">${esc(x.r.name)}</span><span class="mk-bar-track"><span class="mk-bar-fill" style="width:${Math.max(0,Math.min(100,x.a.total))}%"></span></span><b>${num(x.a.total,1)}</b></button>`).join('')}</div>`:'<p class="mut">Chưa có mechanic nào đủ dữ liệu để xếp hạng.</p>';
    // Scatter Growth (X) x Monetization (Y), bubble size theo Scale.
    const pts=scored.filter(x=>x.a.growth!==null&&x.a.monetization!==null).sort((x,y)=>(y.a.total??-1)-(x.a.total??-1)).slice(0,18);
    const W=640,H=300,L=46,Rm=16,T=18,B=36,PW=W-L-Rm,PH=H-T-B;
    const grid=[0,25,50,75,100].map(g=>`<line x1="${L+g/100*PW}" y1="${T}" x2="${L+g/100*PW}" y2="${T+PH}" class="mk-grid"/><line x1="${L}" y1="${T+(1-g/100)*PH}" x2="${L+PW}" y2="${T+(1-g/100)*PH}" class="mk-grid"/><text x="${L+g/100*PW}" y="${H-14}" class="mk-axis" text-anchor="middle">${g}</text><text x="${L-8}" y="${T+(1-g/100)*PH+3}" class="mk-axis" text-anchor="end">${g}</text>`).join('');
    const mid=`<line x1="${L+PW/2}" y1="${T}" x2="${L+PW/2}" y2="${T+PH}" class="mk-mid"/><line x1="${L}" y1="${T+PH/2}" x2="${L+PW}" y2="${T+PH/2}" class="mk-mid"/>`;
    const quads=`<text x="${L+PW-6}" y="${T+12}" class="mk-quad" text-anchor="end">Tăng nhanh + kiếm tiền tốt</text><text x="${L+6}" y="${T+12}" class="mk-quad">Kiếm tiền tốt · tăng chậm</text><text x="${L+PW-6}" y="${T+PH-6}" class="mk-quad" text-anchor="end">Tăng nhanh · kiếm tiền yếu</text><text x="${L+6}" y="${T+PH-6}" class="mk-quad">Ưu tiên thấp</text>`;
    const dots=pts.map((x,i)=>{ const cx=L+x.a.growth/100*PW, cy=T+(1-x.a.monetization/100)*PH, rad=5+((x.a.scale??0)/100)*7, nm=x.r.name.length>20?x.r.name.slice(0,19)+'…':x.r.name; const label=i<9?`<text x="${Math.min(cx+rad+4,L+PW-70)}" y="${cy+3}" class="mk-scatter-label">${esc(nm)}</text>`:''; return `<g data-market="${esc(x.r.id)}" class="mk-point" role="button" aria-label="${esc(x.r.name)}"><title>${esc(x.r.name)} · Growth ${num(x.a.growth,1)} · Monetization ${num(x.a.monetization,1)} · Total ${num(x.a.total,1)}</title><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(1)}"></circle>${label}</g>`; }).join('');
    const scatter=pts.length?`<div class="mk-scatter-wrap"><svg viewBox="0 0 ${W} ${H}" class="mk-scatter" role="img" aria-label="Scatter Growth theo Monetization">${grid}${mid}${quads}${dots}<text x="${L+PW/2}" y="${H-0}" class="mk-axis" text-anchor="middle">Growth /100 →</text></svg></div><p class="mut">Trục X: Growth · Trục Y: Monetization · Bán kính bong bóng theo Scale. Bấm vào điểm để xem chi tiết mechanic.</p>`:'<p class="mut">Chưa có mechanic nào có đồng thời Growth và Monetization.</p>';
    const matrixRows=filteredRows.map(r=>{ const a=F.marketAuto(all,r); const cell=v=>`<td class="numeric ${heatClass(v)}">${v===null?'—':num(v,1)}</td>`; return `<tr><td><button class="link-button" data-market="${esc(r.id)}">${esc(r.name)}</button><div class="mut">${esc(r.category)}</div></td>${cell(a.scale)}${cell(a.growth)}${cell(a.monetization)}${cell(a.ua)}${cell(a.total)}</tr>`; }).join('');
    const matrix=`<div class="table-scroll"><table class="mk-matrix"><thead><tr><th>Mechanic</th><th class="numeric">Scale</th><th class="numeric">Growth</th><th class="numeric">Monetization</th><th class="numeric">UA</th><th class="numeric">Total</th></tr></thead><tbody>${matrixRows||'<tr><td colspan="6">Không có mechanic khớp bộ lọc.</td></tr>'}</tbody></table></div>`;
    const grows=all.filter(r=>typeof r.history?.revGrowth3==='number').map(r=>({r,v:r.history.revGrowth3,dl:r.history?.dlGrowth3})).sort((a,b)=>b.v-a.v);
    const maxAbs=Math.max(...grows.map(g=>Math.abs(g.v)),0.0001);
    const growthHTML=grows.length?`<div class="mk-grows">${grows.map(g=>`<div class="mk-grow-row" title="DL growth 3M: ${pct(g.dl)}"><span class="mk-grow-name">${esc(g.r.name)}</span><span class="mk-grow-track"><span class="mk-grow-fill ${g.v>=0?'pos':'neg'}" style="width:${(Math.abs(g.v)/maxAbs*100).toFixed(1)}%"></span></span><b>${g.v>=0?'+':''}${pct(g.v)}</b><span class="mk-grow-sub">DL 3M ${pct(g.dl)}</span></div>`).join('')}</div>`:'<p class="mut">Chưa có dữ liệu Rev growth 3M.</p>';
    return `<section class="panel mk-panel"><h3>Thị trường trực quan · điểm tự động</h3><p class="mut mk-legacy-note">Điểm tham khảo theo phương pháp cũ (4 cấu phần) — không dùng để chốt quyết định; quyết định theo Market Score v2 trong hồ sơ đánh giá.</p>${kpis}<h3 class="mk-subhead">Top sức hấp dẫn thị trường</h3>${topHTML}</section><section class="panel mk-panel"><h3>Bản đồ Growth × Monetization</h3>${scatter}</section><section class="panel mk-panel"><h3>Matrix nhiệt điểm thị trường</h3>${matrix}</section><section class="panel mk-panel"><h3>Tăng trưởng doanh thu 3M</h3>${growthHTML}</section>`;
  }
  function showDialog(html) {
    focusBefore=document.activeElement;
    const d=$('#editor'); d.innerHTML=html;
    if (!d.open) d.showModal();
    document.body.style.overflow='hidden';
    const close=d.querySelector('[data-close]'); if(close) close.focus();
  }
  function closeDialog() { $('#editor').close(); }
  $('#editor').addEventListener('close',()=>{ if($('#editor').open)return; document.body.style.overflow=''; active=null; if(focusBefore?.isConnected) focusBefore.focus(); });
  $('#editor').addEventListener('click',e=>{if(e.target === $('#editor')){const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)closeDialog();}});
  const head = title => `<div class="dialog-head"><h2 id="editorTitle">${esc(title)}</h2><button class="close" data-close aria-label="Đóng">×</button></div>`;
  function render() {
    $('#roleTitle').textContent=role==='mkt'?'Không gian Marketing':'Không gian BD';
    $('#roleNav').innerHTML=role==='bd'?'<a href="index.html">Về CRM BD</a><a href="mkt.html">Marketing →</a><span class="avatar">BD</span>':'<a href="publishing.html">Thị trường · BD →</a><span class="avatar">MKT</span>';
    document.querySelectorAll('[data-tab]').forEach(b=>{b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');if(b.dataset.tab==='reviews')b.textContent=role==='mkt'?'Hàng chờ đánh giá':'Theo dõi đánh giá';});
    const titles={market:['Phân tích thị trường','Cùng dữ liệu để BD chọn hướng hợp tác và MKT đánh giá sản phẩm.'],reviews:[role==='mkt'?'Đánh giá company & game':'Theo dõi đánh giá','Tách năng lực sản xuất của studio, chất lượng từng game và điều kiện thương mại.'],framework:['Khung quyết định','Trọng số, bằng chứng và điều kiện ra quyết định từ hai workbook.']};
    $('#pageHead').innerHTML=`<p class="eyebrow">SAVA META / GAME & PUBLISHING</p><h2>${titles[tab][0]}</h2><p class="sub">${titles[tab][1]}</p>`;
    if(tab==='market') renderMarket(); else if(tab==='reviews') renderReviews(); else renderFramework();
  }
  function observations() {
    const list=DATA.records.map(r=>({...r,original:true}));
    read().marketUpdates.forEach(u=>{const i=list.findIndex(x=>x.id===u.id);if(i>=0)list[i]={...list[i],...u,original:false};else list.push({...u,original:false});});
    return list;
  }
  function renderMarket() {
    const rows=observations().filter(r=>(category==='all'||r.category===category)&&(!query||(r.name+' '+r.category).toLowerCase().includes(query)));
    const visuals=marketVisualsHTML(rows);
    $('#screen').innerHTML=`<div class="row"><div class="chips"><span class="badge">Snapshot Puzzle · 15/08/2026</span><span class="badge">Snapshot Simulation · 25/08/2026</span><span class="badge">US · Google Play + iOS</span></div><button class="btn primary" data-action="market-new">+ Thêm quan sát thị trường</button></div>
    <div class="metrics"><div class="metric"><small>Mechanic / nhóm đang xem</small><strong>${rows.length}</strong><span>${category==='all'?'Hai snapshot khác phạm vi':esc(category)}</span></div><div class="metric"><small>Nhóm có benchmark CPI</small><strong>${rows.filter(r=>r.cpi?.median!=null).length}</strong><span>Android · paid installs · May–Jul 2026</span></div><div class="metric"><small>Quyền cập nhật nghiệp vụ</small><strong>BD + MKT</strong><span>Cùng thêm và bổ sung dữ liệu nguồn</span></div></div>
    ${visuals}<section class="panel"><div class="row"><h3>Quy mô, cạnh tranh & tín hiệu tăng trưởng</h3><span class="mut">Chọn mechanic để xem nguồn và benchmark</span></div><div class="tools"><input id="marketSearch" type="search" aria-label="Tìm mechanic" placeholder="Tìm mechanic…" value="${esc(query)}"><select id="category" aria-label="Nhóm thị trường">${options([['Puzzle','Puzzle'],['Simulation','Simulation'],['all','Tất cả nhóm']],category)}</select></div>
    <div class="table-scroll"><table><thead><tr><th>Mechanic / nhóm</th><th>Ngày / phạm vi</th><th class="numeric">DL / ngày</th><th class="numeric">Revenue / ngày</th><th class="numeric">Top 3 rev.</th><th class="numeric">Rev. growth 3M</th><th class="numeric">CPI median</th></tr></thead><tbody>${rows.map(r=>`<tr><td><button class="link-button" data-market="${esc(r.id)}">${esc(r.name)}</button><div class="mut">${esc(r.category)}</div></td><td>${esc(r.date)}<div class="mut">${esc(r.geo)}</div></td><td class="numeric">${num(r.downloads)}</td><td class="numeric">${usd(r.revenue)}</td><td class="numeric">${pct(r.top3)}</td><td class="numeric">${pct(r.history?.revGrowth3)}</td><td class="numeric">${usd(r.cpi?.median)}</td></tr>`).join('')||'<tr><td colspan="7">Không có mechanic khớp bộ lọc.</td></tr>'}</tbody></table></div>
    <p class="source-text">Nguồn: ${esc(DATA.source)} · 4 sheet thị trường được chọn. Puzzle: Top100 snapshot; lịch sử chỉ cohort có dữ liệu. Simulation: nhóm tag còn cần gameplay QA. Growth 3M = May–Jul so với Feb–Apr 2026, không phải biến động của daily snapshot. Dấu “—” là thiếu dữ liệu, không phải 0. Không tính LTV từ revenue/download.</p></section>`;
  }
  function marketDetail(id) {
    const r=observations().find(x=>x.id===id);if(!r)return;
    const original=DATA.records.find(x=>x.id===id);
    const h=r.history||{},c=r.cpi||{};
    showDialog(head(r.name)+`<div class="dialog-body"><div class="chips">${badge(r.category)}<span class="badge">${esc(r.date)} · ${esc(r.geo)}</span></div><p class="sub">${esc(r.platform)}</p><div class="summary-result"><div><small>Downloads / ngày</small><strong>${num(r.downloads)}</strong></div><div><small>Revenue / ngày</small><strong>${usd(r.revenue)}</strong></div><div><small>Top 3 revenue concentration</small><strong>${pct(r.top3)}</strong></div></div><section class="section"><h3>Benchmark UA</h3><p class="mut">${esc(r.cpiScope||'Chưa có CPI cùng phạm vi trong file.')}</p><div class="chips"><span class="badge">P25 ${usd(c.p25)}</span><span class="badge">Median ${usd(c.median)}</span><span class="badge">P75 ${usd(c.p75)}</span><span class="badge">Valid titles ${num(c.valid)} / ${num(c.eligible)}</span></div><p class="mut">CPI title = paid spend / paid installs. Median/P25/P75 giữa các title, không tính bằng total downloads.</p></section><section class="section"><h3>Lịch sử cohort quan sát</h3><p class="mut">${esc(r.historyPeriod||'Chưa nhập lịch sử cùng cohort.')}</p><div class="table-scroll"><table><thead><tr><th>Chỉ số</th><th>30D</th><th>90D</th><th>12M theo nguồn</th></tr></thead><tbody><tr><td>Downloads</td><td>${num(h.dl30)}</td><td>${num(h.dl90)}</td><td>${num(h.dl12)}</td></tr><tr><td>Revenue USD</td><td>${usd(h.rev30)}</td><td>${usd(h.rev90)}</td><td>${usd(h.rev12)}</td></tr></tbody></table></div><p class="mut">DL growth 3M: ${pct(h.dlGrowth3)} · Rev growth 3M: ${pct(h.revGrowth3)} · Rev growth 6M: ${pct(h.revGrowth6)}</p><p class="mut">RPD cùng cohort: ${usd(h.rpd)} · Không phải LTV.</p>${r.historyNote?`<details><summary class="mut">Ghi chú cohort / giới hạn nguồn</summary><p class="source-text">${esc(r.historyNote)}</p></details>`:''}</section>${detailExtrasHTML(r)}<section class="section"><h3>Chất lượng và nguồn</h3><p class="text-break">${esc(r.note)}</p><p class="mut">Evidence: ${esc(r.evidenceType)} · Confidence: ${num(r.confidence)}/5</p><p class="source-text">${esc(DATA.source)} · ${(r.provenance||[]).map(esc).join(' · ')}</p>${safeLink(r.url)}${original&&!r.original?`<details><summary>Bản gốc ${esc(original.date)}</summary><p>DL/ngày ${num(original.downloads)} · Revenue/ngày ${usd(original.revenue)}</p></details>`:''}${r.audit?.length?`<details><summary>Lịch sử cập nhật (${r.audit.length})</summary>${r.audit.map(a=>`<p class="source-text">${esc(stamp(a.at))} · ${esc(displayName(a.by))} · ${esc(a.date)} · ${esc(a.note)} · DL/ngày ${num(a.downloads)} · Rev/ngày ${usd(a.revenue)} · ${esc(a.url)}</p>`).join('')}</details>`:''}</section></div><div class="dialog-foot">${r.original?'':`<button class="btn danger" data-delete-market="${esc(id)}">${DATA.records.some(x=>x.id===id)?'Gỡ dữ liệu bổ sung (về bản gốc)':'Xóa quan sát'}</button>`}<button class="btn primary" data-market-edit="${esc(id)}">Bổ sung dữ liệu mới</button></div>`);
  }
  function safeLink(url) {try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))return '';return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">Mở nguồn ↗</a>`;}catch{return '';}}
  function marketForm(id) {
    const old=id?observations().find(r=>r.id===id):null;
    active={kind:'market',id,baseline:JSON.stringify(read().marketUpdates.find(x=>x.id===id)||null)};
    showDialog(head(old?'Bổ sung quan sát · '+old.name:'Thêm quan sát thị trường')+`<form id="marketForm"><div class="dialog-body"><p class="mut">Thêm bản quan sát có ngày và nguồn. Snapshot gốc luôn giữ lại. Dữ liệu mới không tự kế thừa concentration, growth hoặc CPI của ngày cũ.</p><div class="fields">${field('name','Mechanic / nhóm',old?.name||'','text','required maxlength="150"')}${select('category','Nhóm',['Puzzle','Simulation'],old?.category||category)}${field('date','Ngày snapshot','','date','required')}${field('geo','Thị trường',old?.geo||'','text','required')}${field('platform','Nền tảng',old?.platform||'','text','required')}${field('downloads','Downloads / ngày','','number','min="0" step="any"')}${field('revenue','Revenue USD / ngày','','number','min="0" step="any"')}${field('url','Source URL','','url','required')}${memberField('by','Người cập nhật',null,'',{required:true})}${field('confidence','Confidence 1–5','','number','min="1" max="5" step="1" required')}${select('evidenceType','Loại bằng chứng',['Export','Verified source','Partner cung cấp','Proxy'],'Export')}${area('note','Phạm vi / phương pháp / ghi chú')}</div><div id="formError" class="error" role="alert"></div></div><div class="dialog-foot"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary">Lưu quan sát</button></div></form>`);
  }
  function submitMarket(e) {
    e.preventDefault();const form=e.target,d=new FormData(form),s=read();
    if(JSON.stringify(s.marketUpdates.find(x=>x.id===active.id)||null)!==active.baseline)throw Error('Quan sát đã được cập nhật ở tab khác. Đóng và mở lại trước khi lưu.');
    const val=k=>String(d.get(k)||'').trim();const optional=k=>val(k)===''?null:Number(val(k));
    if(!val('note'))throw Error('Ghi rõ phạm vi và phương pháp cho quan sát này.');
    const url=new URL(val('url'));if(!['https:','http:'].includes(url.protocol))throw Error('Nguồn cần URL http hoặc https.');
    const downloads=optional('downloads'),revenue=optional('revenue');
    if(downloads===null&&revenue===null)throw Error('Nhập ít nhất downloads hoặc revenue; phần chưa có giữ trống.');
    const prev=active.id?observations().find(x=>x.id===active.id):null;
    const next={id:active.id||'OBS-'+uuid(),name:val('name'),category:val('category'),date:val('date'),geo:val('geo'),platform:val('platform'),downloads,revenue,url:url.href,by:val('by'),confidence:Number(val('confidence')),evidenceType:val('evidenceType'),note:val('note'),history:{},cpi:{},top1:null,top3:null,top5:null,newcomer:null,historyNote:'',historyPeriod:'',cpiScope:'',provenance:['Quan sát do '+displayName(val('by'))+' cập nhật'],at:new Date().toISOString(),audit:[...(prev?.audit||[]),...(prev?[{date:prev.date,downloads:prev.downloads,revenue:prev.revenue,url:prev.url,note:prev.note,by:prev.by||'Workbook',at:prev.at||null}]:[])]};
    const i=s.marketUpdates.findIndex(x=>x.id===next.id);if(i<0)s.marketUpdates.push(next);else s.marketUpdates[i]=next;
    write(s);closeDialog();render();notify('Đã lưu quan sát thị trường.');
  }
  function renderReviews() {
    const data=read(),s=crm();
    const rows=data.requests.filter(r=>reviewFilter==='all'||r.status===reviewFilter).filter(r=>!query||(label(entity(s,r.kind,r.entityId))+' '+r.kind).toLowerCase().includes(query));
    $('#screen').innerHTML=`<div class="row"><div class="chips"><span class="badge">Company ≠ Game</span><span class="badge">MKT: chuyên môn · BD: thương mại</span></div>${role==='bd'?'<button class="btn primary" data-action="request">+ Gửi yêu cầu đánh giá</button>':''}</div><div class="metrics"><div class="metric"><small>Chờ / đang đánh giá</small><strong>${data.requests.filter(r=>['Chờ đánh giá','Đang đánh giá'].includes(r.status)).length}</strong><span>Company và game riêng biệt</span></div><div class="metric"><small>Chờ bổ sung</small><strong>${data.requests.filter(r=>r.status==='Chờ bổ sung').length}</strong><span>Yêu cầu có bằng chứng còn thiếu</span></div><div class="metric"><small>Hoàn tất chuyên môn</small><strong>${data.requests.filter(r=>r.status==='Hoàn tất').length}</strong><span>Không đồng nghĩa đã duyệt deal</span></div></div><div class="tools"><input type="search" id="reviewSearch" aria-label="Tìm hồ sơ đánh giá" placeholder="Tìm company hoặc game…" value="${esc(query)}"><select id="reviewFilter" aria-label="Lọc tiến độ">${options([['all','Tất cả tiến độ'],'Chờ đánh giá','Đang đánh giá','Chờ bổ sung','Hoàn tất'],reviewFilter)}</select></div><div class="card-grid">${rows.map(r=>{
      const en=entity(s,r.kind,r.entityId),v=r.current||{},res=r.kind==='company'?F.company(v):F.game(v);
      const value=r.kind==='company'?res.total:res.final;
      return `<article class="panel review-card"><div class="row"><span class="eyebrow">${r.kind==='company'?'STUDIO / NĂNG LỰC SẢN XUẤT':'GAME / SẢN PHẨM'}</span>${badge(r.status)}</div><h3>${esc(label(en))}</h3><p class="mut">${r.kind==='game'?esc(label(s.companies.find(c=>c.id===en?.company))):'Bộ tiêu chí studio/indie; không áp cho publisher'}</p><p class="text-break sub">${esc(r.requestNote||'')}</p><div class="row">${badge(res.recommendation)}<span><b>${num(value,1)}</b> /100</span></div><p class="source-text">${r.revisions.length} phiên bản · ${r.current?.at?esc(stamp(r.current.at)):'Chưa chấm'}${en?.name?.includes('(mẫu)')||s.companies.find(c=>c.id===en?.company)?.name?.includes('(mẫu)')?' · Hồ sơ CRM mẫu':''}</p><div class="row"><button class="btn ${role==='mkt'?'primary':''}" data-review="${esc(r.id)}">${role==='mkt'?'Mở đánh giá':'Xem kết quả / bổ sung'}</button><button class="btn danger" data-delete-request="${esc(r.id)}">Xóa yêu cầu</button></div></article>`;
    }).join('')||`<div class="panel empty full"><h3>${data.requests.length?'Không có hồ sơ khớp bộ lọc':'Chưa có yêu cầu đánh giá'}</h3><p class="mut">${role==='bd'?'Chọn company hoặc game đã có trong CRM để giao MKT đánh giá.':'BD gửi yêu cầu company hoặc game từ CRM; hàng chờ sẽ xuất hiện tại đây.'}</p></div>`}</div>`;
  }
  function requestForm(kind='company',id='') {
    const s=crm();const companies=s.companies.filter(isStudio),games=eligibleGames(s);
    showDialog(head('Gửi yêu cầu đánh giá')+`<form id="requestForm"><div class="dialog-body"><p class="mut">Chỉ lấy hồ sơ đang có trong CRM. Không nhập company, game hay deal mẫu từ workbook. Bộ company hiện dành cho studio/indie developer.</p><div class="fields">${select('kind','Loại đánh giá',[['company','Năng lực sản xuất company'],['game','Đánh giá từng game']],kind)}<label>Hồ sơ<select name="entityId" required><option value="">Chọn hồ sơ CRM</option>${(kind==='company'?companies:games).map(x=>`<option value="${esc(x.id)}" ${x.id===id?'selected':''}>${esc(label(x))}${kind==='game'&&x.own==='ours'?' · Sava':''}</option>`).join('')}</select></label>${memberField('requestedBy','BD phụ trách','BD','',{required:true})}${memberField('assignee','MKT được giao (nếu có)','MKT','')}${field('due','Hạn đánh giá','','date')}${field('build','Build / phiên bản hiện tại','','text')}${field('source','Link build / thư mục bằng chứng','','url')}${area('requestNote','Thông tin đầu vào / yêu cầu BD')}</div><div id="intakeBox">${intakeFieldsHTML(kind,{})}</div><div id="formError" class="error" role="alert"></div></div><div class="dialog-foot"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary">Gửi MKT</button></div></form>`);
  }
  function submitRequest(e) {
    e.preventDefault();if(role!=='bd')throw Error('Yêu cầu mới do BD gửi.');
    const d=new FormData(e.target),s=read(),c=crm(),kind=d.get('kind'),entityId=d.get('entityId');
    if(!['company','game'].includes(kind)||!entity(c,kind,entityId))throw Error('Chọn hồ sơ có trong CRM.');
    if(kind==='company'&&!isStudio(entity(c,kind,entityId)))throw Error('Khung này chỉ áp dụng studio/indie.');
    const exists=s.requests.find(r=>r.kind===kind&&r.entityId===entityId);
    if(exists){closeDialog();openReview(exists.id);notify('Đã mở hồ sơ đánh giá hiện có; build mới lưu bằng phiên bản tiếp theo.');return;}
    s.requests.push({id:'REV-'+uuid(),kind,entityId,requestedBy:d.get('requestedBy'),assignee:d.get('assignee'),due:d.get('due'),requestNote:d.get('requestNote'),source:d.get('source'),build:d.get('build'),intake:readIntake(d,kind,{}),status:'Chờ đánh giá',requestedAt:new Date().toISOString(),current:null,revisions:[],revision:0});
    write(s);closeDialog();tab='reviews';render();notify('Đã gửi yêu cầu vào hàng chờ MKT.');
  }
  const evidenceLabels={...Object.fromEntries([...F.market,...F.prototype,...F.partner,...F.production]),deal:'Deal Fit · chỉ BD',history:'Publisher History',legalEvidence:'Legal / IP Evidence'};
  const criterionHints={track:'Title đã ship, commercial result và bằng chứng có thể kiểm tra.',team:'Headcount, vai trò cốt lõi, phụ thuộc nhân sự chủ chốt.',capacity:'Capacity thực tế và số luồng production chạy song song.',cadence:'Tần suất build, thời gian phản hồi → build.',milestone:'Lịch sử giao 3–5 milestone gần nhất.',liveops:'Content/event song song với roadmap sản phẩm.',data:'Analytics, attribution, A/B test và độ tin cậy dữ liệu.',collaboration:'Minh bạch, phản hồi, ownership trong quá trình làm việc.',strategy:'SAVA tạo giá trị gì cho quan hệ hợp tác này?',pipeline:'Pipeline 6–12 tháng, khả năng hợp tác nhiều title.',deal:'Điều kiện trả partner, UA spend, recoup, quyền và downside. Không cộng vào Partner Fit.',size:'Quy mô cùng geo/platform/window; không coi cohort là toàn thị trường.',growth:'So cùng cohort giữa hai cửa sổ có mẫu số hợp lệ.',entry:'Concentration, incumbency và khả năng entry; không suy success rate từ gainers.',monetization:'Revenue/download cùng cohort chỉ là RPD, không phải LTV.',ua:'CPI paid installs, creative hook và độ phủ benchmark.',economics:'Man-days, content cost, QA/art và thời gian ra thị trường.',rtw:'Capability, resource và bằng chứng test của SAVA.',whitespace:'Khoảng trống gamefeel so với benchmark có bằng chứng.',uaTest:'Build × geo × platform, spend/paid installs, mẫu test.',retention:'D1/D3/D7/D30 theo cohort và cỡ mẫu.',engagement:'Session, playtime, level reach và churn cliff.',monetizationTest:'ROAS, ARPDAU, LTV/CPI từ test đúng window.',gamefeel:'User test: responsiveness, flow, agency, replay desire.',tech:'Stability, performance, cadence và chi phí hoàn thiện.'};
  function criterion(k,title,weight,e={},editable=true) {
    const sv=F.score(e);
    return `<details class="criterion"><summary><span>${esc(title)} ${weight?`<small>· ${num(weight,2)}%</small>`:''}</span><b>${sv===null?'NE':num(sv,1)+'/5'}</b></summary><p class="mut">${esc(criterionHints[k]||'Ghi bằng chứng và trạng thái xác minh.')}</p>${editable?`<div class="fields">${field('s_'+k,'Điểm 1–5',e.score??'','number','min="1" max="5" step="0.1"')}${select('t_'+k,'Trạng thái bằng chứng',F.statuses,e.status||'Thiếu')}<label class="source">Nguồn / ngày cập nhật<input name="u_${esc(k)}" value="${esc(e.source||'')}" placeholder="URL hoặc tài liệu, ngày review"></label><label class="note">Bằng chứng / lý do chấm<textarea name="n_${esc(k)}">${esc(e.note||'')}</textarea></label></div>`:`<p class="text-break">${esc(e.note||'Chưa có bằng chứng.')}</p><p class="source-text">${esc(e.status||'Thiếu')} · ${esc(e.source||'')}</p>`}</details>`;
  }
  function openReview(id) {
    const r=read().requests.find(r=>r.id===id);if(!r)return;const s=crm(),en=entity(s,r.kind,r.entityId),a=r.current||{},e=a.entries||{};
    active={kind:'review',id,revision:r.revision};
    const isCompany=r.kind==='company',result=isCompany?F.company(a):F.game(a);
    const professionalKeys=isCompany?[['track','Track Record',10/90*100],['team','Năng lực Team',15/90*100],...F.production.map(v=>[...v,0]),['data','Data & Tech',10/90*100],['collaboration','Hợp tác',15/90*100],['strategy','Strategic Fit',15/90*100],['pipeline','Tiềm năng Long-term',10/90*100]]:[...F.market,...F.prototype];
    const resultHTML=isCompany?`<div class="summary-result"><div><small>Partner Fit /100</small><strong>${num(result.total,1)}</strong></div><div><small>Production Composite /5</small><strong>${num(result.composite,1)}</strong></div><div><small>Evidence coverage</small><strong>${pct(result.coverage)}</strong></div></div><p class="mut">Hard Gate: ${esc(result.hardGate)} · Minimum Evidence: ${result.minimum?'ĐẠT':'THIẾU'} · Confidence: ${esc(result.confidence)}</p>`:`<div class="summary-result"><div><small>Market /100</small><strong>${num(result.market,1)}</strong></div><div><small>Prototype /100</small><strong>${num(result.prototype,1)}</strong></div><div><small>Final /100</small><strong>${num(result.final,1)}</strong></div></div><p class="mut">Data completeness: ${pct(result.completeness)} · Hard Gate: ${esc(result.gate)} · Final = 40% Market + 60% Prototype</p>`;
    showDialog(head(label(en))+`<form id="reviewForm"><div class="dialog-body"><div class="chips">${badge(isCompany?'Company · năng lực sản xuất':'Game · sản phẩm')}${badge(r.status)}${badge(result.recommendation)}</div><p class="mut">BD: ${esc(displayName(r.requestedBy))} · MKT: ${esc(r.assignee?displayName(r.assignee):'Chưa giao')} · Hạn: ${esc(r.due||'Chưa đặt')}</p><p class="text-break">${esc(r.requestNote)}</p><p class="source-text">Build ${esc(r.build||'Chưa nhận')} · ${esc(r.source||'')}</p>${intakeDisplayHTML(r)}${v2PanelHTML(r,a)}${resultHTML}<p class="source-text">Kết quả trên là bản đã lưu. Lưu phiên bản để tính lại; ô chưa có căn cứ giữ NE.${!isCompany&&!a.scoresV2&&r.revisions.length?' Phiên bản hiện tại là đánh giá cũ (legacy) — chưa có Market Score v2.':''}</p><div class="fields">${memberField('reviewer','Người cập nhật',null,'',{required:true})}${role==='mkt'?select('status','Tiến độ xử lý',['Chờ đánh giá','Đang đánh giá','Chờ bổ sung','Hoàn tất'],r.status):''}${role==='mkt'?field('build','Build / phiên bản chấm',a.build||r.build||''):''}${area('comment',role==='mkt'?'Nhận xét MKT / bằng chứng cần bổ sung':'BD bổ sung thông tin',role==='mkt'?a.comment||'':a.bdComment||'')}</div>
      <section class="section"><h3>${isCompany?'Năng lực sản xuất & Partner Fit':'Market Score · 8 tiêu chí'}</h3><p class="mut">${isCompany?'7 pillar chuẩn hóa tổng trọng số 90 → 100. Production = trung bình 4 nhóm; thiếu 1 nhóm → NE. Deal Fit tách riêng.':'Điểm 1–5 theo bộ candidate so sánh: 1 rất bất lợi, 3 trung tính, 5 rất thuận lợi. Trọng số Market và Prototype tính riêng.'}</p>${professionalKeys.map(([k,t,w],i)=>`${!isCompany&&i===F.market.length?'<h3 class="section">Prototype Score · 6 tiêu chí</h3>':''}${criterion(k,t,w,e[k],role==='mkt')}`).join('')}</section>
      ${isCompany?`<section class="section"><h3>Evidence hỗ trợ</h3>${criterion('history','Publisher History',0,e.history,role==='mkt')}${criterion('legalEvidence','Legal / IP',0,e.legalEvidence,role==='bd')}</section><section class="section"><h3>Deal Fit · phần BD</h3><p class="mut">Không cộng vào Partner Fit. Deal evidence vẫn là điều kiện của Minimum Evidence Gate trong playbook.</p>${criterion('deal','Mức độ phù hợp Deal',0,e.deal,role==='bd')}</section>`:role==='mkt'?`<section class="section"><div class="fields">${field('quality','Evidence Quality 1–5',a.quality??'','number','min="1" max="5" step="1"')}</div></section>`:`<p class="mut">Evidence Quality: ${num(a.quality)}/5</p>`}
      <section class="section"><h3>${isCompany?'6 Hard Gate · xác minh BD':'Hard Gate · xác minh BD'}</h3><p class="mut">Gate độc lập điểm số. PASS phải có căn cứ; chưa xác minh giữ Pending.</p>${isCompany?F.gates.map(([k,t])=>{const g=a.gates?.[k]||{};return role==='bd'?`<details class="criterion"><summary><span>${esc(t)}</span><b>${esc(g.value||'PENDING')}</b></summary><div class="fields">${select('g_'+k,'Trạng thái',[['PENDING','Chờ xác minh'],['PASS','Đạt'],['FAIL','Không đạt']],g.value||'PENDING')}${field('gu_'+k,'Nguồn / ngày',g.source||'')}${area('gn_'+k,'Bằng chứng xác minh',g.note||'')}</div></details>`:`<div class="weight-row"><span>${esc(t)}</span><b>${esc(g.value||'PENDING')}</b></div>`;}).join(''):role==='bd'?`<div class="fields">${select('gate','Hard Gate',[['PENDING','Chờ xác minh'],['PASS','PASS'],['FAIL','FAIL']],a.gate||'PENDING')}${field('gateSource','Nguồn / ngày xác minh',a.gateSource||'')}${area('gateNote','Bằng chứng / blocker / điều kiện PASS',a.gateNote||'')}</div>`:`<p class="mut">${esc(a.gate||'PENDING')} · ${esc(a.gateNote||'Chờ BD xác minh.')}</p>`}</section>
      <section class="section"><h3>Điều kiện và bước tiếp theo</h3>${role==='mkt'?`<div class="fields">${area('strengths','Điểm mạnh có bằng chứng',a.strengths||'')}${area('risks','Rủi ro chuyên môn',a.risks||'')}${area('conditions','Điều kiện / bằng chứng cần bổ sung',a.conditions||'')}${area('next','Hành động kế tiếp',a.next||'')}</div>`:`<p class="text-break">${esc(a.strengths||'')}</p><p class="text-break">${esc(a.risks||'')}</p><p class="text-break">${esc(a.conditions||'')}</p><p class="text-break">${esc(a.next||'')}</p><div class="fields">${field('build','Build BD bổ sung',r.build||'')}${field('source','Link BD bổ sung',r.source||'','url')}${memberField('assignee','MKT phụ trách','MKT',r.assignee||'')}${field('due','Hạn đánh giá',r.due||'','date')}</div>${intakeFieldsHTML(r.kind,r.intake||{})}`}</section>
      <section class="section"><h3>Lịch sử đánh giá · ${r.revisions.length} phiên bản</h3>${r.revisions.slice().reverse().map((h,i)=>{const res=isCompany?F.company(h):F.game(h);return `<details class="history-entry"><summary>v${r.revisions.length-i} · ${esc(stamp(h.at))} · ${esc(displayName(h.reviewer))} (${esc(h.role.toUpperCase())}) · ${esc(h.status)}</summary><p>${esc(res.recommendation)} · ${num(isCompany?res.total:res.final,1)}/100 · build ${esc(h.build||'')}${!isCompany&&!h.scoresV2?' · đánh giá cũ (legacy)':''}</p>${!isCompany&&h.scoresV2?(()=>{const v=F.gameV2(h.scoresV2);return `<p class="source-text">Market v2: ${num(v.market.score,1)}/100 · Prototype v2: ${num(v.prototype.score,1)}/100 · Final v2: ${num(v.final,1)}/100${v.decision?' · '+esc(v.decision):''}</p>`;})():''}<p class="text-break">${esc(h.comment||h.bdComment||'')}</p><p class="text-break">${esc(h.conditions||'')}</p>${Object.entries(h.entries||{}).map(([k,v])=>`<p class="source-text"><b>${esc(evidenceLabels[k]||k)}</b> ${num(F.score(v),1)}/5 · ${esc(v.status)} · ${esc(v.note)} · ${esc(v.source)}</p>`).join('')}<p class="source-text">Gate: ${esc(isCompany?JSON.stringify(h.gates||{}):(h.gate||'PENDING')+' · '+(h.gateNote||'')+' · '+(h.gateSource||''))}</p></details>`;}).join('')||'<p class="mut">Chưa có phiên bản đánh giá.</p>'}</section><div id="formError" class="error" role="alert"></div></div><div class="dialog-foot"><span class="mut">Lưu thêm phiên bản · giữ lịch sử cũ</span><button type="button" class="btn danger" data-delete-request="${esc(r.id)}">Xóa yêu cầu</button>${role==='bd'?'<button type="button" class="btn" data-action="requeue">Gửi MKT đánh giá lại</button>':''}<button class="btn primary">${role==='mkt'?'Lưu đánh giá cho BD':'Lưu bổ sung BD'}</button></div></form>`);
  }
  function entryFrom(d,k) {
    const raw=String(d.get('s_'+k)??'').trim(),status=String(d.get('t_'+k)||'Thiếu'),note=String(d.get('n_'+k)||'').trim(),source=String(d.get('u_'+k)||'').trim();
    const score=raw===''?null:Number(raw);
    if(score!==null&&!F.valid(score))throw Error('Điểm '+evidenceLabels[k]+' phải trong khoảng 1–5.');
    const e={score,status,note,source};
    if(score!==null&&!F.evidence(e))throw Error(evidenceLabels[k]+': cần trạng thái, bằng chứng và nguồn trước khi chấm điểm.');
    return e;
  }
  function submitReview(e,requeue=false) {
    e?.preventDefault();const form=$('#reviewForm');if(!form.reportValidity())return;
    const d=new FormData(form),s=read(),r=s.requests.find(x=>x.id===active.id);
    if(!r||r.revision!==active.revision)throw Error('Hồ sơ đã được cập nhật ở tab khác. Đóng và mở lại trước khi lưu.');
    const a=structuredClone(r.current||{entries:{}});a.entries ||= {};const val=k=>String(d.get(k)||'').trim();
    if(role==='mkt') {
      const keys=r.kind==='company'?['track','team',...F.production.map(([k])=>k),'data','collaboration','strategy','pipeline','history']:[...F.market,...F.prototype].map(([k])=>k);
      keys.forEach(k=>a.entries[k]=entryFrom(d,k));
      if(r.kind==='game'&&d.get('v2m_size')!==null) {
        const ctx=v2Context(r), savedV2=(r.current||{}).scoresV2||{};
        const curMech=r.intake?.mechanicId||null, savedMech=savedV2.fromMechanicId??savedV2.mechanicId??null;
        const mechChanged=!!(savedMech&&curMech&&savedMech!==curMech);
        const v2={version:'market-v2',fromMechanicId:curMech,market:{},prototype:{}};
        for(const [k] of F.market) {
          const raw=String(d.get('v2m_'+k)??'').trim(); if(raw==='') continue;
          const score=Number(raw); if(!F.validV2(score)) throw Error('Điểm v2 '+k+' phải từ 1–5, bước 0.5.');
          const sug=ctx?.suggest?.[k], prev=savedV2.market?.[k];
          // S6: mechanic đã đổi -> KHÔNG mang rawInputs/source của mechanic cũ sang phiên mới;
          // rawInputs chỉ lấy từ gợi ý của mechanic hiện tại (hoặc null nếu không có gợi ý).
          const keepPrev=!mechChanged&&prev&&prev.score===score;
          const source=keepPrev?prev.source:sug?(score===sug.score?'auto':'override'):'manual';
          v2.market[k]={score,source,rawInputs:keepPrev?(prev.rawInputs??null):(sug?sug.rawInputs:null)};
        }
        for(const [k] of F.prototype) {
          const raw=String(d.get('v2p_'+k)??'').trim(); if(raw==='') continue;
          const score=Number(raw); if(!F.validV2(score)) throw Error('Điểm Prototype v2 '+k+' phải từ 1–5, bước 0.5.');
          v2.prototype[k]={score,source:'manual',rawInputs:null};
        }
        a.scoresV2=v2; delete a.legacy;
      }
      a.status=val('status');a.build=val('build');a.comment=val('comment');
      for(const k of ['strengths','risks','conditions','next'])a[k]=val(k);
      if(r.kind==='game')a.quality=val('quality')===''?null:Number(val('quality'));
      if(a.status==='Chờ bổ sung'&&!a.conditions&&!a.comment)throw Error('Ghi rõ bằng chứng đang cần bổ sung.');
      if(a.status==='Hoàn tất') {
        if(!a.comment)throw Error('Ghi nhận xét chuyên môn trước khi hoàn tất.');
        if(r.kind==='company'&&F.company(a).total===null)throw Error('Chưa đủ điểm Partner Fit (cần đủ 7 pillar theo khung Partner hợp nhất) để Hoàn tất; giữ Đang đánh giá hoặc Chờ bổ sung.');
        if(r.kind==='game') {
          const hasV2=a.scoresV2!==null&&a.scoresV2!==undefined;
          if(hasV2) {
            // v2 là khung quyết định CHÍNH THỨC: chỉ Hoàn tất khi gameV2 đã ra nhãn quyết định.
            if(!F.gameV2||F.gameV2(a.scoresV2).decision===null)throw Error('Market Score v2 chưa ra được quyết định (cần có Final và completeness Market + Prototype đều ≥ 80%); chưa thể Hoàn tất — giữ Đang đánh giá hoặc Chờ bổ sung.');
          } else {
            // Legacy thuần (revision sẽ lưu hoàn toàn không có scoresV2): giữ điều kiện cũ, gắn nhãn legacy.
            if(F.game(a).completeness<.8||F.game(a).final===null)throw Error('Cần tối thiểu 80% dữ liệu và đủ hai nhóm điểm trước khi hoàn tất.');
            a.legacy=true;
          }
        }
      }
    } else {
      a.bdComment=val('comment');r.build=val('build');r.source=val('source');r.assignee=val('assignee');r.due=val('due');
      const newIntake=readIntake(d,r.kind,undefined); if(newIntake!==undefined) r.intake=newIntake;
      if(r.kind==='company') {
        a.entries.deal=entryFrom(d,'deal');a.entries.legalEvidence=entryFrom(d,'legalEvidence');a.gates ||= {};
        F.gates.forEach(([k,t])=>{const g={value:val('g_'+k),note:val('gn_'+k),source:val('gu_'+k)};if(g.value==='PASS'&&(!g.note||!g.source))throw Error(t+': Đạt cần bằng chứng và nguồn xác minh.');a.gates[k]=g;});
      } else {
        a.gate=val('gate');a.gateNote=val('gateNote');a.gateSource=val('gateSource');
        if(a.gate==='PASS'&&(!a.gateNote||!a.gateSource))throw Error('Hard Gate PASS cần bằng chứng và nguồn xác minh.');
      }
      a.status=requeue?'Chờ đánh giá':r.status;
      // A new build starts a new evaluation, never inherits a prior greenlight.
      // Immutable revisions retain the previous build's complete score/evidence.
      if(requeue&&r.kind==='game'&&r.build!==(a.build||'')) {
        a.entries={};a.scoresV2=null;a.quality=null;a.gate='PENDING';a.gateNote='';a.gateSource='';
        a.build=r.build;a.comment='';a.strengths='';a.risks='';a.conditions='';a.next='';
      }
    }
    a.reviewer=val('reviewer');a.role=role;a.at=new Date().toISOString();a.frameworkVersion=F.version;
    r.current=a;r.revisions.push(structuredClone(a));r.revision++;r.status=a.status;
    write(s);const id=r.id;closeDialog();render();openReview(id);notify(requeue?'Đã đưa lại vào hàng chờ MKT.':'Đã lưu phiên bản đánh giá; BD và MKT thấy cùng kết quả.');
  }
  function renderFramework() {
    const weights = rows => rows.map(([k,t,w])=>`<div class="weight-row"><span>${esc(t)}</span><b>${w}%</b></div>`).join('');
    $('#screen').innerHTML=`<div class="rule-grid"><section class="panel"><p class="eyebrow">GAME · 10_SCORECARD</p><h3>Market Score · 40% Final</h3>${weights(F.market)}<div class="formula">Market = Σ(điểm 1–5 × trọng số) / 5</div><h3 class="section">Prototype Score · 60% Final</h3>${weights(F.prototype)}<div class="formula">Final = Market × 0.4 + Prototype × 0.6</div><p class="mut">Data completeness = số input hợp lệ / 15 (8 Market + 6 Prototype + Evidence Quality). Ngưỡng 80%. Thiếu điểm giữ trống, không tự điền 3.</p><div class="chips">${badge('≥80 GREENLIGHT')}${badge('65–<80 TEST MORE')}${badge('<65 NO-GO')}</div><p class="mut">Hard Gate FAIL → NO-GO; Pending → HOLD; thiếu dữ liệu → HOLD. Điểm từng tiêu chí do MKT nhập theo bằng chứng; tổng điểm tự tính, không suy điểm từ doanh thu đơn lẻ.</p></section><section class="panel"><p class="eyebrow">COMPANY · 04_SCORECARD</p><h3>Partner Fit · không gồm Deal Fit</h3>${weights(F.partner)}<div class="formula">Partner Fit = ROUND((Track×10 + Team×15 + Production×15 + Data×10 + Hợp tác×15 + Strategic×15 + Long-term×10) / 5 / 90 × 100, 1)</div><p class="mut">Tổng trọng số nguồn là 90 sau khi bỏ Deal Fit. Điểm pillar lấy từ entries đã lưu; điểm Production = trung bình 4 ô con Capacity/Cadence/Milestone/LiveOps (đủ 4 mới tính, không làm tròn trung gian); thiếu một ô con → Production = NE. Chỉ tính Partner Fit khi đủ 7 pillar, làm tròn 1 chữ số ở bước cuối.</p><div class="chips">${badge('≥85 Ưu tiên')}${badge('75–<85 Đạt')}${badge('65–<75 Có điều kiện')}${badge('<65 Cần xem xét')}</div><h3 class="section">Hard Gate và Minimum Evidence</h3>${F.gates.map(([,t])=>`<div class="weight-row">${esc(t)}</div>`).join('')}<p class="mut">Hard Gate 6 cổng: có 1 cổng “Không đạt” → KHÔNG ĐẠT; đủ 6 cổng “Đạt” → ĐẠT; còn lại → CHỜ XÁC MINH. Kết luận: KHÔNG ĐẠT → Bị chặn; CHỜ XÁC MINH → Chờ xác minh; Minimum Evidence Gate chưa ĐẠT → Thiếu Evidence; còn lại lấy theo phân loại Partner Fit.</p><p class="mut">Evidence coverage tính trên 11 mục (7 pillar + 4 ô con Production: Capacity/Cadence/Milestone/LiveOps), chỉ mục “Đã xác minh” mới tính. Confidence: coverage ≥90% Cao, 60–89% Trung bình, &lt;60% Thấp. Minimum Evidence Gate = ĐẠT khi coverage ≥80% (quy tắc CRM áp theo ngưỡng 80% của khung game; file 2 không cho số cụ thể). Deal Fit chấm riêng 1–5, không cộng vào Partner Fit. Module Publishing và giao diện BD dùng chung một implementation PartnerEval (shared.js), không còn hai bộ quy tắc.</p></section></div><section class="panel"><h3>Nguồn và cách xử lý khác biệt trong file</h3><p class="sub">SAVA_Mobile_Game_Decision.xlsx: 10_SCORECARD!B4:B11, E4:E9, I4:I8 và các sheet thị trường. Publishing_Partner_Selection_Playbook.xlsx: 02_Hard_Gate, 03_Evidence, 04_Scorecard!D7:K7, L9:N9.</p><p class="sub">Sheet 05_Decision còn mô tả cũ gồm Deal 10%; bản này dùng công thức Partner Fit mới tại 04_Scorecard, loại Deal Fit và chuẩn hóa 90 → 100. Workbook game cho phép công thức tạm khi thiếu input; hệ thống giữ HOLD khi thiếu một nhóm điểm. Các kiểm tra bắt buộc ghi nguồn/bằng chứng là điều kiện bổ sung khi nhập liệu, không thay trọng số.</p><p class="sub">Khung Partner Fit này dành cho studio/indie. Publisher không dùng bộ năng lực sản xuất này. Không nhập Partner Master, deal, decision hay điểm đánh giá mẫu của các file. Đánh giá cũ /10 trong CRM giữ làm lịch sử; không tự quy đổi sang thang /5.</p></section>`;
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');
    if(!b){ const pt=e.target.closest?.('[data-market]'); if(pt){ try{ marketDetail(pt.dataset.market); }catch(err){ notify(err.message); } } return; }
    try {
      if(b.hasAttribute('data-close')){closeDialog();return;}
      if(b.dataset.tab){tab=b.dataset.tab;query='';const url=new URL(location.href);url.searchParams.set('tab',tab);url.searchParams.delete('kind');url.searchParams.delete('id');history.replaceState(null,'',url);render();return;}
      if(b.dataset.market){marketDetail(b.dataset.market);return;}
      if(b.dataset.deleteRequest){deleteRequest(b.dataset.deleteRequest);return;}
      if(b.dataset.deleteMarket){deleteMarketObs(b.dataset.deleteMarket);return;}
      if(b.dataset.marketEdit){const id=b.dataset.marketEdit;closeDialog();marketForm(id);return;}
      if(b.dataset.review){openReview(b.dataset.review);return;}
      if(b.dataset.action==='market-new')marketForm();
      if(b.dataset.action==='request')requestForm();
      if(b.dataset.action==='requeue')submitReview(null,true);
    }catch(err){const el=$('#formError');if(el)el.textContent=err.message;else notify(err.message);}
  });
  document.addEventListener('submit',e=>{
    try{if(e.target.id==='marketForm')submitMarket(e);if(e.target.id==='requestForm')submitRequest(e);if(e.target.id==='reviewForm')submitReview(e);}catch(err){e.preventDefault();$('#formError').textContent=err.message;$('#formError').scrollIntoView({block:'nearest'});}
  });
  document.addEventListener('input',e=>{
    if(e.target.id==='marketSearch'||e.target.id==='reviewSearch') {
      const id=e.target.id,start=e.target.selectionStart;query=e.target.value.toLowerCase();tab==='market'?renderMarket():renderReviews();const next=$('#'+id);next.focus();next.setSelectionRange(start,start);
    }
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='category'){category=e.target.value;renderMarket();}
    if(e.target.id==='reviewFilter'){reviewFilter=e.target.value;renderReviews();}
    if(e.target.name==='kind'&&e.target.form?.id==='requestForm') {
      const select=e.target.form.elements.entityId,s=crm(),records=e.target.value==='company'?s.companies.filter(isStudio):eligibleGames(s);
      select.innerHTML='<option value="">Chọn hồ sơ CRM</option>'+records.map(x=>`<option value="${esc(x.id)}">${esc(label(x))}</option>`).join('');
      const box=e.target.form.querySelector('#intakeBox'); if(box) box.innerHTML=intakeFieldsHTML(e.target.value,{});
    }
    if(e.target.closest('.criterion')){
      const box=e.target.closest('.criterion'),scoreEl=box.querySelector('input[name^="s_"]'),statusEl=box.querySelector('select[name^="t_"]');
      if(scoreEl&&statusEl){const v=scoreEl.value===''?null:Number(scoreEl.value);box.querySelector('summary b').textContent=F.valid(v)&&F.statuses.slice(1,4).includes(statusEl.value)?num(v,1)+'/5':'NE';}
    }
  });
  addEventListener('storage',e=>{if([KEY,STORE_KEY].includes(e.key)&&!$('#editor').open)render();});
  try {
    render();
    const kind=params.get('kind'),id=params.get('id'),existing=read().requests.find(r=>r.kind===kind&&r.entityId===id);
    if(kind&&id){tab='reviews';render();if(existing)openReview(existing.id);else if(role==='bd'&&entity(crm(),kind,id))requestForm(kind,id);}
  }catch(e){$('#screen').innerHTML=`<section class="panel"><p class="error">${esc(e.message)}</p></section>`;}
})();
