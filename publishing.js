(function () {
  'use strict';
  const F = window.PublishingScore, DATA = window.PublishingData, KEY = 'sava_publishing_v1';
  const role = document.body.dataset.role === 'mkt' ? 'mkt' : 'bd';
  const params = new URLSearchParams(location.search);
  let tab = ['market','reviews','framework'].includes(params.get('tab')) ? params.get('tab') : 'market';
  let query = '', category = 'Puzzle', reviewFilter = 'all', reviewKindFilter = 'all', active = null, focusBefore = null;
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (v,d=0) => typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US',{maximumFractionDigits:d}) : '—';
  /* D7 (đợt 3): NaN / thiếu dữ liệu -> "—" nhất quán; bản cũ để lọt "—%"
     và "$—" vì NaN vẫn là typeof 'number' rồi num() trả "—" sau khi đã
     cộng thêm ký hiệu % / $. */
  const pct = v => typeof v === 'number' && Number.isFinite(v) ? num(v*100,1)+'%' : '—';
  const usd = v => typeof v === 'number' && Number.isFinite(v) ? '$'+num(v,2) : '—';
  const stamp = v => v ? new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}) : '';
  const uuid = () => crypto.randomUUID();
  const REVIEW_STATUSES = ['Chờ đánh giá','Đang đánh giá','Chờ bổ sung','Hoàn tất'];
  /* === Loại bằng chứng dữ liệu thị trường HỢP NHẤT (đợt hợp nhất taxonomy) ===
     HẰNG DUY NHẤT cho "Loại bằng chứng" của quan sát thị trường (marketUpdates
     trong kho sava_publishing_v1): đúng bộ file gốc 99_LISTS. Mọi select/hiển
     thị loại bằng chứng trong module này lấy từ đây. (Chuỗi provenance tĩnh
     trong publishing-data.js — vd "CURRENT TOP100 TITLE-LEVEL CLASSIFICATION"
     ở entry/uaBenchmark của record workbook — là text nguồn gốc, KHÔNG thuộc
     vốn từ này và không bị map.)
     Mapping dữ liệu đã lưu khi đọc (read()): 'Export' -> 'Fact',
     'Verified source' -> 'Fact', 'Proxy' -> 'Proxy' (giữ nguyên). Riêng
     'Partner cung cấp' (chiều LOẠI bằng chứng) KHÔNG map: giữ nguyên giá trị
     đã lưu và hiển thị qua cơ chế "(dữ liệu cũ)" của selectLegacy — không âm
     thầm gắn nhãn lại. (Khác chiều TRẠNG THÁI xác minh: ở đó "Partner cung
     cấp" đã đổi tên thành "Đối tác đã gửi" — xem shared.js/publishing-score.js.) */
  const EVIDENCE_TYPES = ['Fact','Proxy','Hypothesis','Internal actual'];
  const MARKET_EVIDENCE_TYPE_MAP = { 'Export': 'Fact', 'Verified source': 'Fact', 'Proxy': 'Proxy' };
  const normalizeMarketEvidenceType = v => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(MARKET_EVIDENCE_TYPE_MAP, v)) ? MARKET_EVIDENCE_TYPE_MAP[v] : v;
  /* N7: chuẩn hoá 1 revision — role luôn là chuỗi (mặc định ''), entries luôn là
     object và từng entry là object (entry hỏng thì bỏ), scoresV2 chỉ giữ khi là object. */
  /* A6 (phần còn lại): chuẩn hoá trạng thái xác minh bằng normalizeStatusStrict
     DÙNG CHUNG (PublishingScore.normalizeStatusStrict — cùng định nghĩa với
     shared.js/bridge): nhãn cũ "Partner cung cấp" -> "Đối tác đã gửi", trạng
     thái NGOÀI thang EVIDENCE_STATUSES -> "Chưa rõ" (không chỉ đổi nhãn như
     normalizeStatus trước đây). */
  const strictStatus = v => {
    if (F && typeof F.normalizeStatusStrict === 'function') return F.normalizeStatusStrict(v);
    if (typeof window !== 'undefined' && typeof window.normalizeEvidenceStatusStrict === 'function') return window.normalizeEvidenceStatusStrict(v);
    return v;
  };
  function normalizeRevision(h) {
    if (!h || typeof h !== 'object' || Array.isArray(h)) return h;
    if (typeof h.role !== 'string') h.role = '';
    if (!h.entries || typeof h.entries !== 'object' || Array.isArray(h.entries)) h.entries = {};
    else {
      const clean = {};
      for (const [k, v] of Object.entries(h.entries)) if (v && typeof v === 'object' && !Array.isArray(v)) clean[k] = v;
      h.entries = clean;
      /* Hợp nhất taxonomy + A6: chuẩn hoá trạng thái xác minh trên mọi entry
         khi nạp kho Publishing (cả current lẫn revisions, qua sanitizeRequest)
         bằng normalizeStatusStrict dùng chung. */
      for (const v of Object.values(h.entries)) if (typeof v.status === 'string') v.status = strictStatus(v.status);
    }
    if (h.scoresV2 !== undefined && h.scoresV2 !== null && (typeof h.scoresV2 !== 'object' || Array.isArray(h.scoresV2))) delete h.scoresV2;
    /* Di sản đợt 1: revision canonical do migration Partner tạo mang thêm
       productionPillarEvidence {status, note, source} và reviewDate — GIỮ
       NGUYÊN hai field khi đọc/ghi; chỉ chuẩn hoá status của
       productionPillarEvidence theo thang strict như mọi trạng thái khác. */
    if (h.productionPillarEvidence && typeof h.productionPillarEvidence === 'object' && !Array.isArray(h.productionPillarEvidence) && typeof h.productionPillarEvidence.status === 'string') {
      h.productionPillarEvidence.status = strictStatus(h.productionPillarEvidence.status);
    }
    return h;
  }
  function sanitizeRequest(r, i) {
    if (!r || typeof r !== 'object') return null;
    // Thiếu kind/entityId -> không xác định được hồ sơ: LOẠI khỏi danh sách (lựa chọn có chủ đích,
    // request như vậy không mở/chấm được và từng làm sập render khi truy cập sâu).
    if (!['company','game'].includes(r.kind) || !r.entityId) return null;
    if (!r.id) r.id = 'REV-restored-' + i;
    r.revisions = (Array.isArray(r.revisions) ? r.revisions : []).filter(h => h && typeof h === 'object' && !Array.isArray(h)).map(normalizeRevision);
    r.current = r.current && typeof r.current === 'object' && !Array.isArray(r.current) ? normalizeRevision(r.current) : (r.revisions[r.revisions.length - 1] || {});
    if (!REVIEW_STATUSES.includes(r.status)) {
      const fromRev = [...r.revisions].reverse().map(h => h.status).find(st => REVIEW_STATUSES.includes(st));
      r.status = fromRev || (REVIEW_STATUSES.includes(r.current?.status) ? r.current.status : 'Chờ đánh giá');
    }
    r.intake = r.intake && typeof r.intake === 'object' ? r.intake : {};
    if (typeof r.revision !== 'number' || !Number.isFinite(r.revision)) r.revision = r.revisions.length;
    return r;
  }
  /* === A8: phục hồi dữ liệu Publishing lỗi (nhất quán cơ chế CRM S1/A1/A2) ===
     JSON hỏng, giá trị không phải object thuần (null/mảng/scalar), version !== 1
     hoặc requests/marketUpdates không phải mảng -> KHÔNG chết trang và KHÔNG
     ném lỗi nữa: (1) sao lưu raw nguyên văn vào key
     'sava_publishing_v1__corrupt_backup' (mẫu backup của shared.js, ghi dạng
     {at, raw}, chỉ ghi lại khi raw thay đổi); (2) đặt cờ
     window.PUB_LOAD_ISSUE + biến module pubLoadIssue để render() hiện banner
     cảnh báo; (3) trả kho trống/mặc định để trang vẫn render. KHÔNG ghi đè
     key chính ở đây: raw lỗi giữ nguyên cho tới lần write() hợp lệ đầu tiên.
     Đây cũng là nơi xử lý kho version lạ mà bridge (A4 đợt 1) từ chối ghi vào. */
  const PUB_BACKUP_KEY = KEY + '__corrupt_backup';
  let pubLoadIssue = null, lastCorruptRaw = null;
  function corruptPubFallback(raw, reason) {
    if (raw !== lastCorruptRaw) {
      lastCorruptRaw = raw;
      const at = new Date().toISOString();
      try { localStorage.setItem(PUB_BACKUP_KEY, JSON.stringify({ at, raw })); } catch {}
      pubLoadIssue = { type: 'corrupt', reason, backupKey: PUB_BACKUP_KEY, at };
      try { window.PUB_LOAD_ISSUE = pubLoadIssue; } catch {}
    }
    return { version: 1, requests: [], marketUpdates: [] };
  }
  /* === A9: sanitize PHẢI đếm được — read() ghi lại số mục bị loại + lý do
     tóm tắt vào lastSanitizeReport; render() hiện cảnh báo, không mất im lặng.
     Request thiếu id vẫn được gán id phục hồi trong sanitizeRequest (giữ
     nguyên hành vi cũ, không tính là bị loại); marketUpdates thiếu id bị loại
     và nằm trong số đếm này. === */
  let lastSanitizeReport = null;
  function read() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch { raw = null; }
    if (!raw) { lastSanitizeReport = null; return {version:1,requests:[],marketUpdates:[]}; }
    let x;
    try { x = JSON.parse(raw); } catch { return corruptPubFallback(raw, 'JSON hỏng, không đọc được'); }
    if (!x || typeof x !== 'object' || Array.isArray(x)) return corruptPubFallback(raw, 'dữ liệu không phải kho hợp lệ (null/mảng/giá trị vô hướng)');
    if (x.version !== 1) return corruptPubFallback(raw, 'version kho lạ (' + String(x.version) + '), không đúng định dạng version 1');
    if (x.requests !== undefined && !Array.isArray(x.requests)) return corruptPubFallback(raw, 'trường requests không phải mảng');
    if (x.marketUpdates !== undefined && !Array.isArray(x.marketUpdates)) return corruptPubFallback(raw, 'trường marketUpdates không phải mảng');
    pubLoadIssue = null;
    try { window.PUB_LOAD_ISSUE = null; } catch {}
    const dropReasons = {};
    const bump = k => { dropReasons[k] = (dropReasons[k] || 0) + 1; };
    const rawRequests = Array.isArray(x.requests) ? x.requests : [];
    const requests = rawRequests.map((r, i) => {
      const out = sanitizeRequest(r, i);
      if (!out) {
        if (!r || typeof r !== 'object' || Array.isArray(r)) bump('yêu cầu đánh giá không phải hồ sơ hợp lệ');
        else bump('yêu cầu đánh giá thiếu loại hồ sơ (company/game) hoặc thiếu entityId');
      }
      return out;
    }).filter(Boolean);
    const rawMarket = Array.isArray(x.marketUpdates) ? x.marketUpdates : [];
    const keptMarket = rawMarket.filter(u => u && typeof u === 'object' && !Array.isArray(u) && u.id);
    const droppedMarket = rawMarket.length - keptMarket.length;
    if (droppedMarket > 0) bump('quan sát thị trường thiếu id');
    const marketUpdates = keptMarket
      /* Hợp nhất taxonomy: map loại bằng chứng đã lưu về bộ 99_LISTS khi đọc
         ('Export'/'Verified source' -> 'Fact', 'Proxy' giữ nguyên; giá trị
         khác — gồm 'Partner cung cấp' chiều loại bằng chứng — giữ nguyên). */
      .map(u => ({...u, evidenceType: normalizeMarketEvidenceType(u.evidenceType), audit: Array.isArray(u.audit) ? u.audit : []}));
    const droppedTotal = (rawRequests.length - requests.length) + droppedMarket;
    lastSanitizeReport = droppedTotal > 0 ? { total: droppedTotal, reasons: dropReasons, at: new Date().toISOString() } : null;
    return {...x, requests, marketUpdates};
  }
  /* Banner cảnh báo dữ liệu (A8 + A9) — render() chèn lên đầu #screen. */
  function dataNoticeHTML() {
    let html = '';
    if (pubLoadIssue) {
      html += `<section class="panel mk-alert" role="alert"><h3>Dữ liệu Publishing trong trình duyệt bị lỗi — đã phục hồi an toàn</h3><p>Bản đã lưu không dùng được (${esc(pubLoadIssue.reason)}). Hệ thống đã sao lưu nguyên văn bản đó vào khóa <b>${esc(pubLoadIssue.backupKey)}</b> và đang hiển thị kho trống/mặc định để trang vẫn hoạt động. Bản gốc CHƯA bị ghi đè — nó chỉ được thay khi bạn lưu một thay đổi mới.</p></section>`;
    }
    if (lastSanitizeReport) {
      const reasons = Object.entries(lastSanitizeReport.reasons).map(([k, n]) => `${esc(k)}: ${n}`).join(' · ');
      html += `<section class="panel mk-alert" role="alert"><h3>Đã loại ${lastSanitizeReport.total} mục dữ liệu không hợp lệ khi nạp kho Publishing</h3><p>${reasons}. Các mục này không hiển thị được (không đủ thông tin để mở/chấm) nên đã bị loại khỏi danh sách đang xem; dữ liệu đã lưu chỉ thay đổi khi bạn lưu thao tác mới.</p></section>`;
    }
    return html;
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
  /* ---- A: kết quả hiệu lực thống nhất cho game + nhãn gate company (B4) ---- */
  const GATE_LABELS = {PASS:'Đạt',FAIL:'Không đạt',PENDING:'Chưa xác minh'};
  const gateLabel = v => GATE_LABELS[String(v ?? 'PENDING').toUpperCase()] || 'Chưa xác minh';
  /* B2/D2 (QA vòng 3): kết quả v2 hiệu lực DUY NHẤT cho mọi bề mặt trong
     publishing.js. "Có v2" lấy đúng định nghĩa của đợt 1 —
     PublishingScore.hasValidV2 / v2Candidate (điểm hữu hạn 1–5 bước 0.5;
     current{market,prototype} không kèm scoresV2 vẫn là v2; entries khung cũ
     KHÔNG phải v2) — hàm này KHÔNG tự đếm điểm lại. Quy tắc hiển thị chung:
     completeness (khối thấp hơn trong Market/Prototype) < 80% HOẶC điểm thuộc
     mechanic cũ (stale) -> final = null và nhãn "chưa đủ dữ liệu"/"chờ chấm
     lại", mọi bề mặt in "—" thay cho số Final/Market/Prototype. */
  function effectiveGameResult(r) {
    const a = (r && r.current && typeof r.current === 'object' && !Array.isArray(r.current)) ? r.current : {};
    let legacyRes;
    try { legacyRes = F.game(a); } catch { legacyRes = {market:null,prototype:null,final:null,completeness:0,gate:'PENDING',recommendation:'HOLD — Missing data'}; }
    const cand = (typeof F.v2Candidate === 'function') ? F.v2Candidate(a) : null;
    const hasV2 = !!(cand && typeof F.hasValidV2 === 'function' && F.hasValidV2(a));
    let v2Res = null;
    if (hasV2 && typeof F.gameV2 === 'function') { try { v2Res = F.gameV2(cand); } catch { v2Res = null; } }
    if (hasV2 && v2Res) {
      const curMech = r?.intake?.mechanicId || null;
      const savedMech = cand.fromMechanicId ?? cand.mechanicId ?? null;
      const minComp = Math.min(v2Res.market?.completeness ?? 0, v2Res.prototype?.completeness ?? 0);
      let mechanicDiverged = false;
      if (savedMech && curMech && savedMech !== curMech) {
        /* Đồng bộ mechanic (chốt bổ sung): request ĐÃ HOÀN THÀNH là lịch sử
           đã nộp — GIỮ NGUYÊN quyết định theo mechanic đã chấm, chỉ ghi nhận
           mechanicDiverged để hiển thị ghi chú khác biệt, KHÔNG rơi về stale
           và KHÔNG tính lại. Request còn mở giữ hành vi stale cũ (N13). */
        const completedReq = r?.status === 'Hoàn tất' || a.status === 'Hoàn tất';
        if (!completedReq) {
          return {type:'stale', stale:true, legacy:false, v2:v2Res, legacyResult:legacyRes, final:null, decision:null, recommendation:'Điểm v2 thuộc mechanic cũ — chờ chấm lại', completeness:minComp, minCompleteness:minComp, label:'Final v2 (game)'};
        }
        mechanicDiverged = true;
      }
      if (minComp < 0.8 || v2Res.decision === null) {
        return {type:'v2-insufficient', stale:false, legacy:false, v2:v2Res, legacyResult:legacyRes, final:null, decision:null, recommendation:`Chưa đủ dữ liệu · ${Math.round(minComp * 100)}%`, completeness:minComp, minCompleteness:minComp, label:'Final v2 (game)', mechanicDiverged};
      }
      return {type:'v2', stale:false, legacy:false, v2:v2Res, legacyResult:legacyRes, final:v2Res.final, decision:v2Res.decision, recommendation:v2Res.decision, completeness:minComp, minCompleteness:minComp, label:'Final v2 (game)', mechanicDiverged};
    }
    return {type:'legacy', stale:false, legacy:true, v2:null, legacyResult:legacyRes, final:legacyRes.final, decision:null, recommendation:legacyRes.recommendation, completeness:legacyRes.completeness, minCompleteness:legacyRes.completeness, label:'Final · Khung workbook (cũ)'};
  }
  if (typeof window !== 'undefined') window.PublishingEffective = {effectiveGameResult, gateLabel};
  /* ---- E: dropdown hoá — helper select có (dữ liệu cũ) + checkbox-group ---- */
  const GENRE_LIST = ['Puzzle','Simulation','Merge','Idle','Roguelike','Racing','Word','Casual','Strategy','Khác'];
  const GAMEFEEL_LIST = ['Snappy / Crisp','Juicy / Explosive','Tactile / Physics-heavy','Calm / ASMR','Cozy / Zen','Fast / Arcade','Strategic / Deliberate','Satisfying / Cleanup-Order'];
  const PLATFORM_LIST = ['Android','iOS','PC','Web'];
  const GEO_LIST = ['US','Global','Vietnam','Japan','Korea','SEA','Other'];
  const COUNTRY_LIST = ['Việt Nam','Hàn Quốc','Singapore','Nhật Bản','Mỹ','Trung Quốc','Khác'];
  const SIM_SUBGENRES = ['Animal Simulator','Breeding','Citybuilder','Dating Sim','Farming','Fashion & Dress Up','Fishing Simulator','Home Design','Idol Training','Job Simulator','Life Sim','Sandbox','Satisfaction','Simulation: Other','Time Management','Tycoon/Management','Vehicle Simulator','Virtual Pet'];
  const CONFIDENCE_LIST = ['1','2','3','4','5'];
  function parseMulti(v) {
    if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
    if (v === null || v === undefined) return [];
    return String(v).split(/[,;+]/).map(s => s.trim()).filter(Boolean);
  }
  /* Select: giá trị đã lưu ngoài danh sách -> thêm option "(dữ liệu cũ) <giá trị>" đang chọn. */
  const selectLegacy = (name,text,vals,current,extra='') => {
    const cur = String(current ?? '');
    const plain = vals.map(v => Array.isArray(v) ? v[0] : v);
    const legacyOpt = cur && !plain.some(v => String(v) === cur) ? `<option value="${esc(cur)}" selected>(dữ liệu cũ) ${esc(cur)}</option>` : '';
    return `<label>${esc(text)}<select name="${esc(name)}" ${extra}><option value="" ${cur === '' ? 'selected' : ''}>— Chưa chọn —</option>${options(vals,cur)}${legacyOpt}</select></label>`;
  };
  /* Checkbox-group: lưu join ", "; token lạ vẫn hiện dạng checkbox đã tick nhãn gốc + (dữ liệu cũ).
     Hidden __has_<name> báo form có field này ngay cả khi không tick ô nào. */
  function checkboxGroup(name,text,vals,current) {
    const tokens = parseMulti(current);
    const known = new Set(vals.map(String));
    const extras = tokens.filter(t => !known.has(t));
    const boxes = [...vals, ...extras].map(v => {
      const isExtra = !known.has(String(v));
      return `<label class="mk-check"><input type="checkbox" name="${esc(name)}" value="${esc(v)}" ${tokens.includes(String(v)) ? 'checked' : ''}> ${esc(v)}${isExtra ? ' (dữ liệu cũ)' : ''}</label>`;
    }).join('');
    return `<fieldset class="mk-check-group"><legend>${esc(text)}</legend><input type="hidden" name="__has_${esc(name)}" value="1"><div class="mk-checks">${boxes}</div></fieldset>`;
  }
  const isNumericText = v => { const s = String(v ?? '').trim(); return s !== '' && /^-?\d+(\.\d+)?$/.test(s); };
  function numericLegacyField(name,text,value,extra='') {
    const cur = String(value ?? '').trim();
    if (cur === '' || isNumericText(cur)) return field(name,text,cur,'number',extra);
    return `<label>${esc(text)}<input name="${esc(name)}" type="number" value="" ${extra} placeholder="Nhập số để thay"><input type="hidden" name="${esc(name)}Legacy" value="${esc(cur)}"><small class="mut">(dữ liệu cũ) ${esc(cur)} — giữ nguyên nếu để trống</small></label>`;
  }
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
  /* C16 (phía Publishing): suy mechanicId từ game.genre của CRM khi TẠO
     request đánh giá game — CHỈ prefill lúc tạo/chọn game, người dùng sửa
     được trước khi lưu; không tạo đồng bộ hai chiều âm thầm (đổi genre ở CRM
     sau này không tự sửa intake đã lưu). Cách suy (bảo thủ, xác định):
     genre CRM dạng "Puzzle / Match-3" — tách token theo '/':
       (1) khớp CHÍNH XÁC (không phân biệt hoa/thường) cả chuỗi genre hoặc
           một token với TÊN record (vd "Match-3" -> MECH-008, "Merge" ->
           MECH-004);
       (2) token dài >= 3 ký tự là chuỗi con của ĐÚNG MỘT tên record
           (vd "Farm" -> "Farming / Production Management" SIM-7);
     không suy ra được duy nhất -> không prefill. */
  function mechanicIdForGame(game) {
    const genre = String(game?.genre || '').trim();
    if (!genre) return '';
    const norm = s => String(s || '').trim().toLowerCase();
    const tokens = genre.split('/').map(norm).filter(Boolean);
    for (const c of [norm(genre), ...tokens]) {
      const hit = DATA.records.find(r => norm(r.name) === c);
      if (hit) return hit.id;
    }
    for (const t of [...tokens].sort((x, y) => y.length - x.length)) {
      if (t.length < 3) continue;
      const hits = DATA.records.filter(r => norm(r.name).includes(t));
      if (hits.length === 1) return hits[0].id;
    }
    return '';
  }
  if (typeof window !== 'undefined') window.PublishingEffective = {...(window.PublishingEffective || {}), mechanicIdForGame, isCompletedRequest, effectiveIntake, effectiveMechanicId, crmMechanicId, savedMechanicId, entitySnapshotFor, currentRequesterId, splitCrmGenre};
  /* ===== ĐỒNG BỘ THÔNG TIN LIÊN QUAN CRM <-> ĐÁNH GIÁ (chốt bổ sung) =====
     Khảo sát mô hình thật (trước khi sửa):
     - LIVE theo id (đã đúng sẵn): tên game/company ở thẻ review
       (renderReviews), tiêu đề dialog (openReview), tên studio của game,
       bdNote của game, danh sách game của studio (companyNavHTML) — tất cả
       resolve qua entity(crm(), kind, entityId) / label() MỖI LẦN RENDER,
       không có bản sao tên trong request.
     - SNAPSHOT (đóng băng lúc tạo/lưu): request.intake.* (mechanicId,
       genre, subGenre, artStyle, coreLoop, metrics, storeUrl, videoUrl,
       expectations; phía company: teamSize, country, mainGenres...),
       request.requestNote/source/build/due/requestedBy/assignee, và toàn bộ
       revision (điểm, kết luận, entries, gates, scoresV2.fromMechanicId).
     Nguyên tắc áp dụng từ đợt này:
     - Thông tin ĐỊNH DANH/MÔ TẢ có đối tác ở CRM (tên, genre/sub-genre =
       mechanic, platform, trailer, mô tả, tên/loại hình/đầu mối company)
       là LIVE: hiển thị resolve theo id về CRM hiện tại (liveInfoHTML +
       effectiveIntake). Field intake KHÔNG có đối tác ở CRM (artStyle,
       coreLoop, metrics studio báo, teamSize, country...) giữ nguyên là
       dữ kiện BD thu thập trong intake — không có nguồn CRM nào để đồng bộ.
     - Revision đã nộp = lịch sử: KHÔNG bao giờ viết lại điểm/kết luận.
     - Mechanic (khoá chấm): request ĐANG MỞ -> mechanic hiệu lực suy từ
       CRM hiện tại (mechanicIdForGame trên genre hiện tại của game);
       suy không ra mới fallback intake đã lưu. Request ĐÃ HOÀN THÀNH ->
       mechanic hiệu lực là mechanic ĐÃ CHẤM (scoresV2.fromMechanicId,
       fallback intake), và nếu mechanic CRM nay khác thì chỉ HIỂN THỊ ghi
       chú khác biệt (liveInfoHTML / v2PanelHTML), không tính lại điểm.
     - Snapshot fallback: submitRequest nay chụp entitySnapshot (định danh/
       mô tả) vào request lúc tạo; request MỒ CÔI (entity đã bị xoá) hiển
       thị bằng snapshot đó (request cũ chưa có snapshot thì fallback về
       intake + nhãn "Hồ sơ đã được gỡ" như hành vi C15 sẵn có).
     - Khi MKT/BD LƯU revision cho request đang mở, intake.mechanicId được
       ghi lại bằng mechanic hiệu lực theo CRM (submitReview) để dữ kiện
       đã lưu và dữ kiện hiển thị không lệch nhau sau lần lưu đó. */
  function isCompletedRequest(r) {
    if (!r || typeof r !== 'object') return false;
    if (r.status === 'Hoàn tất') return true;
    const cands = [];
    if (r.current && typeof r.current === 'object') cands.push(r.current);
    if (Array.isArray(r.revisions)) r.revisions.forEach(h => { if (h && typeof h === 'object') cands.push(h); });
    return cands.some(h => h.status === 'Hoàn tất');
  }
  function splitCrmGenre(genre) {
    const s = String(genre || '');
    const i = s.indexOf(' / ');
    if (i >= 0) return { main: s.slice(0, i).trim(), sub: s.slice(i + 3).trim() };
    return { main: s.trim(), sub: '' };
  }
  function crmMechanicId(r, s) {
    if (!r || r.kind !== 'game') return '';
    try { const g = entity(s || crm(), 'game', r.entityId); return g ? mechanicIdForGame(g) : ''; } catch { return ''; }
  }
  function savedMechanicId(r) {
    if (!r || typeof r !== 'object') return '';
    const cur = r.current && typeof r.current === 'object' ? r.current : null;
    const cand = cur && typeof F.v2Candidate === 'function' ? F.v2Candidate(cur) : null;
    return String((cand && (cand.fromMechanicId ?? cand.mechanicId)) || (r.intake && r.intake.mechanicId) || '');
  }
  function effectiveMechanicId(r, s) {
    if (!r || r.kind !== 'game') return '';
    if (isCompletedRequest(r)) return savedMechanicId(r);
    return crmMechanicId(r, s) || String((r.intake && r.intake.mechanicId) || '');
  }
  function effectiveIntake(r, s) {
    const base = { ...((r && r.intake) || {}) };
    if (!r || r.kind !== 'game') return base;
    if (isCompletedRequest(r)) { const sm = savedMechanicId(r); if (sm) base.mechanicId = sm; return base; }
    try {
      const g = entity(s || crm(), 'game', r.entityId);
      if (!g) return base;
      const derived = mechanicIdForGame(g);
      if (derived) base.mechanicId = derived;
      const parts = splitCrmGenre(g.genre);
      if (parts.main) base.genre = parts.main;
      if (parts.sub) base.subGenre = parts.sub;
      if (g.platform) base.platforms = String(g.platform);
      if (g.trailerUrl && /^https?:\/\//i.test(String(g.trailerUrl))) base.videoUrl = String(g.trailerUrl);
    } catch {}
    return base;
  }
  function entitySnapshotFor(kind, en) {
    if (!en || typeof en !== 'object') return null;
    if (kind === 'game') return { name: String(en.title || en.name || ''), genre: String(en.genre || ''), platform: String(en.platform || ''), stage: String(en.stage || ''), desc: String(en.desc || ''), buildUrl: String(en.buildUrl || ''), trailerUrl: String(en.trailerUrl || '') };
    return { name: String(en.name || ''), type: String(en.type || ''), contact: String(en.contact || ''), phone: String(en.phone || '') };
  }
  function currentRequesterId() {
    try { const u = (typeof window !== 'undefined' && window.SavaAuth && typeof window.SavaAuth.currentUser === 'function') ? window.SavaAuth.currentUser() : null; return u && u.memberId ? String(u.memberId) : ''; } catch { return ''; }
  }
  /* Khối "thông tin hồ sơ" trong dialog review: LIVE theo CRM khi entity
     còn; snapshot khi mồ côi; kèm ghi chú mechanic theo quy tắc ở trên. */
  function liveInfoHTML(r, s, en) {
    const snap = r.entitySnapshot && typeof r.entitySnapshot === 'object' && !Array.isArray(r.entitySnapshot) ? r.entitySnapshot : null;
    const row = (k, v) => `<div class="mk-dl-row"><dt>${esc(k)}</dt><dd>${esc(v === undefined || v === null || String(v).trim() === '' ? '—' : String(v))}</dd></div>`;
    let rows = '', note = '';
    if (r.kind === 'game') {
      if (en) {
        rows = row('Tên game (CRM hiện tại)', label(en)) + row('Mô tả', en.desc || '') + row('Genre / Sub-genre', en.genre || '') + row('Nền tảng', en.platform || '') + row('Giai đoạn', en.stage || '') + row('Link build', en.buildUrl || '') + row('Link trailer', en.trailerUrl || '');
      } else if (snap) {
        note = `<p class="mut">Hồ sơ game gốc đã được gỡ khỏi CRM — thông tin dưới đây là dữ liệu chụp trong yêu cầu lúc tạo (snapshot), điểm/kết luận đã lưu vẫn giữ nguyên.</p>`;
        rows = row('Tên game (snapshot)', snap.name || '') + row('Mô tả (snapshot)', snap.desc || '') + row('Genre / Sub-genre (snapshot)', snap.genre || '') + row('Nền tảng (snapshot)', snap.platform || '') + row('Link build (snapshot)', snap.buildUrl || '') + row('Link trailer (snapshot)', snap.trailerUrl || '');
      } else {
        note = `<p class="mut">Hồ sơ game gốc đã được gỡ khỏi CRM và yêu cầu này không có dữ liệu chụp (tạo trước đợt đồng bộ) — hiển thị theo hồ sơ đầu vào đã lưu trong yêu cầu.</p>`;
        const it = r.intake || {};
        rows = row('Genre (hồ sơ đầu vào)', it.genre || '') + row('Sub-genre (hồ sơ đầu vào)', it.subGenre || '') + row('Link video / trailer (hồ sơ đầu vào)', it.videoUrl || '');
      }
      const crmMech = crmMechanicId(r, s), savedMech = savedMechanicId(r), effMech = effectiveMechanicId(r, s);
      const mechName = id => { const rec = DATA.records.find(x => x.id === id); return rec ? `${rec.name} (${rec.id})` : String(id || '—'); };
      rows += row('Mechanic hiệu lực', effMech ? mechName(effMech) : '');
      if (isCompletedRequest(r) && crmMech && savedMech && crmMech !== savedMech) {
        note += `<p class="mk-alert" role="alert">Mechanic trên CRM hiện tại là ${esc(mechName(crmMech))}, KHÁC mechanic đã chấm ${esc(mechName(savedMech))}. Bản đánh giá này đã hoàn thành: điểm và kết luận giữ nguyên theo mechanic đã chấm, không tự tính lại. Muốn chấm theo mechanic mới, dùng “Gửi MKT đánh giá lại”.</p>`;
      } else if (!isCompletedRequest(r) && crmMech && r.intake && r.intake.mechanicId && crmMech !== r.intake.mechanicId) {
        note += `<p class="mut">Mechanic đang hiển thị/dùng cho chấm theo CRM hiện tại (${esc(mechName(crmMech))}), đã cập nhật so với mechanic trong hồ sơ đầu vào lúc tạo yêu cầu (${esc(mechName(r.intake.mechanicId))}).</p>`;
      }
    } else {
      if (en) {
        rows = row('Tên công ty (CRM hiện tại)', label(en)) + row('Loại hình', en.type || '') + row('Đầu mối chính', en.contact || '') + row('Điện thoại', en.phone || '');
      } else if (snap) {
        note = `<p class="mut">Hồ sơ công ty gốc đã được gỡ khỏi CRM — thông tin dưới đây là dữ liệu chụp trong yêu cầu lúc tạo (snapshot), điểm/kết luận đã lưu vẫn giữ nguyên.</p>`;
        rows = row('Tên công ty (snapshot)', snap.name || '') + row('Loại hình (snapshot)', snap.type || '') + row('Đầu mối chính (snapshot)', snap.contact || '') + row('Điện thoại (snapshot)', snap.phone || '');
      } else {
        note = `<p class="mut">Hồ sơ công ty gốc đã được gỡ khỏi CRM và yêu cầu này không có dữ liệu chụp (tạo trước đợt đồng bộ) — hiển thị theo hồ sơ đầu vào đã lưu trong yêu cầu.</p>`;
        const it = r.intake || {};
        rows = row('Quốc gia (hồ sơ đầu vào)', it.country || '') + row('Website (hồ sơ đầu vào)', it.website || '');
      }
    }
    return `<section class="section"><h3>Thông tin hồ sơ — ${en ? 'theo CRM hiện tại' : 'dữ liệu chụp trong yêu cầu'}</h3>${note}<dl class="mk-dl">${rows}</dl></section>`;
  }
  function mechanicField(current='') {
    const cats=[...new Set(DATA.records.map(r=>r.category))];
    const groups=cats.map(cat=>`<optgroup label="${esc(cat)}">${DATA.records.filter(r=>r.category===cat).map(r=>`<option value="${esc(r.id)}" ${String(current??'')===r.id?'selected':''}>${esc(r.name)} — ${esc(r.category)}</option>`).join('')}</optgroup>`).join('');
    const extra=current && !DATA.records.some(r=>r.id===current) ? `<option value="${esc(current)}" selected>${esc(current)} (dữ liệu cũ)</option>` : '';
    return `<label>Mechanic khớp dữ liệu thị trường<select name="mechanicId"><option value="">— Chưa khớp mechanic trong dữ liệu —</option>${groups}${extra}</select></label>`;
  }
  function subGenreOptionsFor(genre) {
    if (genre === 'Puzzle') return [...new Set(DATA.records.filter(r => r.category === 'Puzzle').map(r => r.name))];
    if (genre === 'Simulation') return SIM_SUBGENRES.slice();
    return null;
  }
  function subGenreFieldHTML(genre,current='') {
    const list = subGenreOptionsFor(genre);
    if (!list) return field('subGenre','Sub-genre',current || '');
    return selectLegacy('subGenre','Sub-genre',list,current || '');
  }
  function metricRevenueFieldHTML(v) {
    const cur = String(v.metricRevenue ?? '').trim();
    const curSel = v.metricRevenueCur || 'USD';
    const rev = (cur === '' || isNumericText(cur))
      ? field('metricRevenue','Revenue đã có (studio báo)',cur,'number','step="any" min="0"')
      : `<label>Revenue đã có (studio báo)<input name="metricRevenue" type="number" step="any" min="0" value="" placeholder="Nhập số để thay"><input type="hidden" name="metricRevenueLegacy" value="${esc(cur)}"><small class="mut">(dữ liệu cũ) ${esc(cur)} — giữ nguyên nếu để trống, chỉ thay khi nhập số</small></label>`;
    return rev + selectLegacy('metricRevenueCur','Tiền tệ Revenue',['USD','VND'],curSel);
  }
  function intakeFieldsHTML(kind,intake={}) {
    const v=intake||{};
    if (kind==='game') return `<div class="mk-intake-edit"><h3>Hồ sơ đầu vào — thông tin game &amp; studio</h3><p class="mut">BD thu thập từ studio; mọi trường đều không bắt buộc, nhưng mechanic khớp dữ liệu là khóa để tính điểm thị trường tự động.</p><div class="fields">${mechanicField(v.mechanicId||'')}${selectLegacy('genre','Genre',GENRE_LIST,v.genre||'')}<span data-subgenre-wrap style="display:contents">${subGenreFieldHTML(v.genre||'',v.subGenre||'')}</span>${selectLegacy('artStyle','Art style',['2D','3D','Pixel','Anime','Hand-drawn','Low-poly','Realistic','Khác'],v.artStyle||'')}${area('coreLoop','Core loop',v.coreLoop||'')}${selectLegacy('gameFeel','Game feel / archetype',GAMEFEEL_LIST,v.gameFeel||'')}${checkboxGroup('platforms','Nền tảng',PLATFORM_LIST,v.platforms||'')}${selectLegacy('devStage','Giai đoạn phát triển',['Concept','Prototype','Alpha','Beta','Soft launch','Live'],v.devStage||'')}${selectLegacy('monetizationModel','Mô hình monetization',['Hybrid IAP','Hybrid IAA','IAP thuần','IAA thuần','Premium','Chưa rõ'],v.monetizationModel||'')}${checkboxGroup('targetGeo','Thị trường mục tiêu',GEO_LIST,v.targetGeo||'')}${numericLegacyField('metricDownloads','Downloads đã có (studio báo)',v.metricDownloads||'','step="any" min="0"')}${field('metricRetention','Retention (studio báo)',v.metricRetention||'','text','placeholder="VD: D1 40% · D7 18%"')}${field('metricCpi','CPI test thực tế (USD)',v.metricCpi??'','number','step="0.01" min="0"')}${metricRevenueFieldHTML(v)}${field('storeUrl','Link store',v.storeUrl||'','url')}${field('videoUrl','Link video / trailer',v.videoUrl||'','url')}${area('expectations','Kỳ vọng publishing (rev share mong muốn, thị trường muốn đánh, hỗ trợ cần từ SAVA…)',v.expectations||'')}</div></div>`;
    return `<div class="mk-intake-edit"><h3>Hồ sơ đầu vào — thông tin studio</h3><div class="fields">${numericLegacyField('teamSize','Quy mô team',v.teamSize||'','step="1" min="0"')}${selectLegacy('country','Quốc gia',COUNTRY_LIST,v.country||'')}${checkboxGroup('mainGenres','Genre chính',GENRE_LIST,v.mainGenres||'')}${checkboxGroup('mainPlatforms','Nền tảng chính',PLATFORM_LIST,v.mainPlatforms||'')}${area('trackRecord','Track record — game đã phát hành / kết quả',v.trackRecord||'')}${field('website','Website studio',v.website||'','url')}</div></div>`;
  }
  function readIntake(d,kind,fallback) {
    const labels=kind==='game'?GAME_INTAKE_LABELS:COMPANY_INTAKE_LABELS, keys=labels.map(([k])=>k);
    const multiKeys = kind==='game' ? ['platforms','targetGeo'] : ['mainGenres','mainPlatforms'];
    const extraKeys = kind==='game' ? ['metricRevenueCur'] : [];
    const present = [...keys, ...extraKeys].some(k => d.get(k) !== null || d.get('__has_' + k) !== null);
    if (!present) return fallback;
    const out={};
    for (const k of keys) {
      if (multiKeys.includes(k)) {
        if (d.get('__has_' + k) !== null) { out[k] = (typeof d.getAll === 'function' ? d.getAll(k) : [d.get(k)]).filter(x => x !== null && x !== undefined).map(x => String(x)).join(', '); }
        else { const raw=d.get(k); out[k]=raw===null?'':String(raw).trim(); }
        continue;
      }
      if (k === 'metricRevenue' || k === 'metricDownloads') {
        const raw=d.get(k), val=raw===null?'':String(raw).trim();
        const legacy = d.get(k + 'Legacy');
        out[k] = (val === '' && legacy) ? String(legacy) : val;
        continue;
      }
      if (k === 'teamSize') {
        const raw=d.get(k), val=raw===null?'':String(raw).trim();
        const legacy = d.get('teamSizeLegacy');
        out[k] = (val === '' && legacy) ? String(legacy) : val;
        continue;
      }
      const raw=d.get(k), val=raw===null?'':String(raw).trim();
      out[k]=k==='metricCpi'?(val===''? '' : Number(val)):val;
    }
    if (kind==='game') {
      const cur=d.get('metricRevenueCur');
      if (cur !== null) out.metricRevenueCur = String(cur).trim();
      else if (fallback && typeof fallback === 'object' && fallback.metricRevenueCur) out.metricRevenueCur = fallback.metricRevenueCur;
    }
    return out;
  }
  function intakeDisplayHTML(r) {
    /* D4 (đã chốt áp dụng): MKT KHÔNG thấy field intake `expectations` (kỳ
       vọng publishing — nội dung thương mại: rev share mong muốn...) ở mọi bề
       mặt hiển thị intake cho MKT. Đây là mặc định theo quy tắc "MKT không
       thấy nội dung thương mại của BD"; đảo ngược bằng cách bỏ bộ lọc này.
       BD không dùng hàm hiển thị này cho phần sửa (dùng intakeFieldsHTML —
       giữ nguyên toàn bộ field). Các field intake còn lại MKT vẫn xem. */
    const intake=effectiveIntake(r), labels=(r.kind==='game'?GAME_INTAKE_LABELS:COMPANY_INTAKE_LABELS).filter(([k]) => !(role === 'mkt' && k === 'expectations'));
    const fmt=(k,v)=>{
      if (v===undefined||v===null||String(v).trim()==='') return '—';
      if (k==='mechanicId') { const rec=DATA.records.find(x=>x.id===v); return rec?`${rec.name} — ${rec.category} (${rec.id})`:String(v); }
      if (k==='metricCpi') { const n=typeof v==='number'?v:Number(v); return Number.isFinite(n)?usd(n):String(v); }
      if (k==='metricRevenue' && intake.metricRevenueCur) return `${String(v)} ${String(intake.metricRevenueCur)}`;
      return String(v);
    };
    const extra = r.kind==='game' && intake.metricRevenueCur ? `<div class="mk-dl-row"><dt>Tiền tệ Revenue</dt><dd>${esc(intake.metricRevenueCur)}</dd></div>` : '';
    return `<section class="section"><h3>Hồ sơ đầu vào (BD thu thập từ studio)</h3><dl class="mk-dl">${labels.map(([k,t])=>`<div class="mk-dl-row"><dt>${esc(t)}</dt><dd>${esc(fmt(k,intake[k]))}</dd></div>`).join('')}${extra}</dl></section>`;
  }
  /* D: tóm tắt intake 1 dòng cho BD trong dialog review (bản đầy đủ chỉ dùng cho MKT). */
  function intakeSummaryHTML(r) {
    const intake=effectiveIntake(r);
    let parts=[];
    if (r.kind==='game') {
      const rec=DATA.records.find(x=>x.id===intake.mechanicId);
      parts=[rec?`${rec.name}`:(intake.mechanicId||''), intake.genre||'', intake.devStage||''].filter(Boolean);
    } else {
      parts=[intake.country||'', intake.mainGenres||'', intake.teamSize?`Team ${intake.teamSize}`:''].filter(Boolean);
    }
    return `<section class="section mk-intake-summary"><h3>Hồ sơ đầu vào (BD thu thập từ studio)</h3><p class="mut">${esc(parts.length?parts.join(' · '):'Chưa có thông tin đầu vào')}</p><p><a href="#bd-intake">Xem / sửa hồ sơ đầu vào ở phần BD bên dưới ↓</a></p></section>`;
  }
  /* B2: khối điều hướng company — link CRM + game của studio kèm kết quả hiệu lực. */
  function companyNavHTML(r,s,allRequests) {
    const games=(s.games||[]).filter(g=>g && g.company===r.entityId);
    const rowsHtml=games.length?games.map(g=>{
      const greq=(allRequests||[]).find(x=>x.kind==='game'&&x.entityId===g.id);
      if (!greq) return `<div class="mk-nav-row"><span>${esc(label(g))}</span><a href="index.html?open=game&amp;id=${encodeURIComponent(g.id)}">Chưa gửi yêu cầu đánh giá — mở game trong CRM</a></div>`;
      const eff=effectiveGameResult(greq);
      const txt=eff.type==='stale'?eff.recommendation:`${eff.label}: ${eff.final===null||eff.final===undefined?'—':num(eff.final,1)}/100 · ${eff.recommendation}`;
      return `<div class="mk-nav-row"><span>${esc(label(g))}</span><span class="mut">${esc(txt)}</span><button type="button" class="btn" data-review="${esc(greq.id)}">Mở đánh giá game</button></div>`;
    }).join(''):'<p class="mut">Studio chưa có game nào trong CRM.</p>';
    return `<section class="section mk-company-nav"><p><a href="index.html?open=company&amp;id=${encodeURIComponent(r.entityId)}">← Hồ sơ công ty trong CRM</a></p><h3>Game của studio</h3>${rowsHtml}</section>`;
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
    /* Mechanic hiệu lực: request mở -> theo CRM hiện tại; đã xong -> mechanic đã chấm. */
    const mid = effectiveMechanicId(r); if (!mid) return null;
    const all = observations(), rec = all.find(x => x.id === mid); if (!rec) return null;
    return {rec, suggest: F.marketSuggest(all, rec)};
  }
  function v2PanelHTML(r, a) {
    if (r.kind !== 'game' || !F.gameV2) return '';
    const ctx = v2Context(r);
    /* B2/D2: "điểm v2 đã lưu" chỉ tính khi HỢP LỆ theo định nghĩa duy nhất
       PublishingScore.hasValidV2/v2Candidate (đợt 1) — scoresV2 rỗng/chỉ chứa
       điểm ngoài thang 1–5 bước 0.5 coi như chưa có v2, panel rơi về gợi ý
       live như chưa lưu. Mọi số hiển thị theo cùng quy tắc của
       effectiveGameResult: stale (mechanic đã đổi) hoặc completeness <80%
       -> "—", không in số cạnh nhãn mâu thuẫn. */
    const cand = typeof F.v2Candidate === 'function' ? F.v2Candidate(a) : (a.scoresV2 || null);
    const saved = (cand && typeof F.hasValidV2 === 'function' && F.hasValidV2(a)) ? cand : null;
    // S6: mechanic đã dùng cho điểm v2 đã lưu (fromMechanicId ghi khi lưu) vs mechanic hiệu lực.
    // Đồng bộ: curMech = effectiveMechanicId (mở -> CRM hiện tại; xong -> chính mechanic đã chấm
    // nên mechChanged tự tắt và điểm lịch sử được giữ nguyên, khác biệt CRM chỉ ghi chú ở liveInfoHTML).
    const curMech = effectiveMechanicId(r) || null;
    const savedMech = saved ? (saved.fromMechanicId ?? saved.mechanicId ?? null) : null;
    const mechChanged = !!(saved && savedMech && curMech && savedMech !== curMech);
    const crmMechV2 = crmMechanicId(r);
    const mechDivergedDone = !!(saved && isCompletedRequest(r) && crmMechV2 && savedMech && crmMechV2 !== savedMech);
    const mechName = id => { const rec = DATA.records.find(x => x.id === id); return rec ? `${rec.name} (${rec.id})` : String(id || '—'); };
    const draftM = {}; if (ctx && !mechChanged) for (const [k] of F.market) { const sg = ctx.suggest[k]; if (sg) draftM[k] = {score: sg.score, source: 'auto', rawInputs: sg.rawInputs}; }
    const shown = saved || {market: draftM, prototype: {}};
    const res = F.gameV2(shown);
    const srcLabel = sv => sv === 'auto' ? 'Tự động' : sv === 'override' ? 'Ghi đè gợi ý' : sv === 'manual' ? 'Chấm tay' : '—';
    const rowM = ([k, t, w]) => { const cur = shown.market?.[k], sug = mechChanged ? null : ctx?.suggest?.[k]; const manual = V2_MANUAL.includes(k); return `<tr><td>${esc(t)}<div class="mut">${manual ? 'chấm tay — chưa có dữ liệu tự động' : 'trọng số ' + w + '%'}</div></td><td class="numeric">${w}%</td><td class="numeric">${mechChanged ? '—' : cur ? num(cur.score, 1) : '—'}</td><td>${mechChanged ? 'điểm mechanic cũ — chờ chấm lại' : cur ? esc(srcLabel(cur.source)) : (sug ? 'gợi ý ' + num(sug.score, 1) + ' (chưa lưu)' : '—')}</td><td class="mk-raw">${esc(mechChanged ? '—' : cur ? fmtRaw(cur.rawInputs) : sug ? fmtRaw(sug.rawInputs) : '—')}</td>${role === 'mkt' ? `<td><input name="v2m_${esc(k)}" type="number" min="1" max="5" step="0.5" value="${mechChanged ? '' : cur?.score ?? sug?.score ?? ''}" aria-label="Điểm v2 ${esc(t)}"></td>` : ''}</tr>`; };
    const rowP = ([k, t, w]) => { const cur = shown.prototype?.[k]; return `<tr><td>${esc(t)}<div class="mut">chấm tay + ghi chú evidence ở bộ tiêu chí bên dưới</div></td><td class="numeric">${w}%</td><td class="numeric">${mechChanged ? '—' : cur ? num(cur.score, 1) : '—'}</td><td>${mechChanged ? 'điểm mechanic cũ — chờ chấm lại' : cur ? 'Chấm tay' : '—'}</td><td class="mk-raw">—</td>${role === 'mkt' ? `<td><input name="v2p_${esc(k)}" type="number" min="1" max="5" step="0.5" value="${mechChanged ? '' : cur?.score ?? ''}" aria-label="Điểm Prototype v2 ${esc(t)}"></td>` : ''}</tr>`; };
    const compBar = (t, c) => `<div class="mk-scorebar"><span>${esc(t)}</span><span class="mk-scorebar-track"><span class="mk-scorebar-fill" style="width:${Math.round((c || 0) * 100)}%"></span></span><b>${pct(c)}</b></div>`;
    // S11 + B2/D2: completeness < 80% -> hiển thị "— (chưa đủ dữ liệu · X%)" thay cho con số;
    // stale (mechanic đã đổi) -> cả ba ô đều "—", không in số của mechanic cũ.
    const pctTxt = c => Math.round((c || 0) * 100) + '%';
    const staleDisp = '— (điểm thuộc mechanic cũ — chờ chấm lại)';
    const marketDisp = mechChanged ? staleDisp : res.market.completeness < 0.8 ? `— (chưa đủ dữ liệu · ${pctTxt(res.market.completeness)})` : (res.market.score === null ? '—' : num(res.market.score, 1));
    const protoDisp = mechChanged ? staleDisp : res.prototype.completeness < 0.8 ? `— (chưa đủ dữ liệu · ${pctTxt(res.prototype.completeness)})` : (res.prototype.score === null ? '—' : num(res.prototype.score, 1));
    // Final bị chặn vì completeness: X = completeness THẤP HƠN trong hai khối (cổ chai quyết định).
    const finalBlockedByCompleteness = res.final !== null && res.decision === null && /completeness/i.test(res.decisionBlockedReason || '');
    const finalDisp = mechChanged ? staleDisp : finalBlockedByCompleteness ? `— (chưa đủ dữ liệu · ${pctTxt(Math.min(res.market.completeness, res.prototype.completeness))})` : (res.final === null ? '—' : num(res.final, 1));
    // M5: phân biệt mốc dữ liệu đã lưu vs gợi ý live.
    const stampNote = saved ? `Điểm đã lưu · ${esc(stamp(a.at) || 'không rõ thời gian')}` : 'Gợi ý live theo dữ liệu thị trường hiện tại — chưa lưu';
    const mechWarn = mechChanged ? `<p class="mk-alert" role="alert">Mechanic đã đổi từ ${esc(mechName(savedMech))} sang ${esc(mechName(curMech))} — điểm Market v2 đã lưu thuộc mechanic cũ, cần chấm lại. Bảng dưới chỉ hiển thị điểm đã lưu (không trộn gợi ý của mechanic mới); khi MKT lưu phiên mới, rawInputs cũ sẽ bị loại và tính lại theo mechanic hiện tại.</p>` : (mechDivergedDone ? `<p class="mk-alert" role="alert">Mechanic trên CRM hiện tại (${esc(mechName(crmMechV2))}) khác mechanic đã chấm (${esc(mechName(savedMech))}) — bản đánh giá đã hoàn thành nên điểm/kết luận dưới đây giữ nguyên theo mechanic đã chấm, không tính lại.</p>` : '');
    return `<section class="section mk-v2"><h3>Market Score v2 · quartile (market-v2) — khung quyết định chính thức</h3><p class="mut">${ctx ? `Gợi ý tự động theo quartile trong nhóm ${esc(ctx.rec.category)} của mechanic ${esc(ctx.rec.name)}; người chấm ghi đè được mọi gợi ý. Production Economics / SAVA Right-to-Win / Gamefeel Whitespace chấm tay — chưa có dữ liệu tự động.` : 'Chưa khớp mechanic — không có gợi ý tự động; vẫn chấm tay được cả 8 tiêu chí.'} ${esc(stampNote)}.</p>${mechWarn}<div class="summary-result"><div><small>Market /100 (chuẩn hoá)</small><strong>${marketDisp}</strong></div><div><small>Prototype /100 (chuẩn hoá)</small><strong>${protoDisp}</strong></div><div><small>Final /100</small><strong>${finalDisp}</strong></div></div>${compBar('Completeness Market', res.market.completeness)}${compBar('Completeness Prototype', res.prototype.completeness)}<p class="mut">${mechChanged ? 'Điểm v2 đã lưu thuộc mechanic cũ — chưa áp quyết định; chờ MKT chấm lại theo mechanic hiện tại.' : res.marketInsufficient ? 'Market: Chưa đủ dữ liệu để kết luận (completeness &lt; 80%) — điểm chỉ là tạm tính. ' : ''}${mechChanged ? '' : res.final === null ? 'Final: chưa tính được Final (thiếu Market hoặc Prototype).' : res.decision ? `Quyết định v2: <b>${esc(res.decision)}</b> (Final ≥80 Greenlight · 65–79.9 Test thêm · &lt;65 Chưa đạt).` : esc(res.decisionBlockedReason || '')}</p><div class="table-scroll"><table class="mk-v2-table"><thead><tr><th>Tiêu chí Market</th><th class="numeric">Trọng số</th><th class="numeric">Điểm</th><th>Nguồn</th><th>Số gốc (rawInputs)</th>${role === 'mkt' ? '<th>Chấm / ghi đè</th>' : ''}</tr></thead><tbody>${F.market.map(rowM).join('')}</tbody></table></div><div class="table-scroll"><table class="mk-v2-table"><thead><tr><th>Tiêu chí Prototype</th><th class="numeric">Trọng số</th><th class="numeric">Điểm</th><th>Nguồn</th><th>Số gốc</th>${role === 'mkt' ? '<th>Chấm tay</th>' : ''}</tr></thead><tbody>${F.prototype.map(rowP).join('')}</tbody></table></div><p class="mut">Khung workbook (cũ) (bên dưới) vẫn giữ nguyên để tương thích phiên bản đã lưu; điểm v2 lưu riêng trong scoresV2 của mỗi phiên bản, không ghi đè Khung workbook (cũ). Quyết định chốt theo Market Score v2 này; điểm marketAuto 4 cấu phần chỉ còn ở tab Thị trường dưới dạng tham khảo.</p></section>`;
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
    $('#roleNav').innerHTML=role==='bd'?'<a href="index.html">Về CRM BD</a><a href="mkt.html">Trang của Marketing →</a><span class="avatar">BD</span>':'<a href="publishing.html">Thị trường &amp; Đánh giá game →</a><span class="avatar">MKT</span>';
    document.querySelectorAll('[data-tab]').forEach(b=>{b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');if(b.dataset.tab==='reviews')b.textContent=role==='mkt'?'Hàng chờ đánh giá':'Theo dõi đánh giá';});
    const titles={market:['Phân tích thị trường','Cùng dữ liệu để BD chọn hướng hợp tác và MKT đánh giá sản phẩm.'],reviews:[role==='mkt'?'Đánh giá company & game':'Theo dõi đánh giá','Tách năng lực sản xuất của studio, chất lượng từng game và điều kiện thương mại.'],framework:['Khung quyết định','Trọng số, bằng chứng và điều kiện ra quyết định từ hai workbook.']};
    $('#pageHead').innerHTML=`<p class="eyebrow">SAVA META / GAME & PUBLISHING</p><h2>${titles[tab][0]}</h2><p class="sub">${titles[tab][1]}</p>`;
    if(tab==='market') renderMarket(); else if(tab==='reviews') renderReviews(); else renderFramework();
    /* A8/A9: banner phục hồi dữ liệu lỗi + cảnh báo mục bị loại khi sanitize. */
    const notice = dataNoticeHTML();
    if (notice) $('#screen').insertAdjacentHTML('afterbegin', notice);
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
    showDialog(head(r.name)+`<div class="dialog-body"><div class="chips">${badge(r.category)}<span class="badge">${esc(r.date)} · ${esc(r.geo)}</span></div><p class="sub">${esc(r.platform)}</p><div class="summary-result"><div><small>Downloads / ngày</small><strong>${num(r.downloads)}</strong></div><div><small>Revenue / ngày</small><strong>${usd(r.revenue)}</strong></div><div><small>Top 3 revenue concentration</small><strong>${pct(r.top3)}</strong></div></div><section class="section"><h3>Benchmark UA</h3><p class="mut">${esc(r.cpiScope||'Chưa có CPI cùng phạm vi trong file.')}</p><div class="chips"><span class="badge">P25 ${usd(c.p25)}</span><span class="badge">Median ${usd(c.median)}</span><span class="badge">P75 ${usd(c.p75)}</span><span class="badge">Valid titles ${num(c.valid)} / ${num(c.eligible)}</span></div><p class="mut">CPI title = paid spend / paid installs. Median/P25/P75 giữa các title, không tính bằng total downloads.</p></section><section class="section"><h3>Lịch sử cohort quan sát</h3><p class="mut">${esc(r.historyPeriod||'Chưa nhập lịch sử cùng cohort.')}</p><div class="table-scroll"><table><thead><tr><th>Chỉ số</th><th>30D</th><th>90D</th><th>12M theo nguồn</th></tr></thead><tbody><tr><td>Downloads</td><td>${num(h.dl30)}</td><td>${num(h.dl90)}</td><td>${num(h.dl12)}</td></tr><tr><td>Revenue USD</td><td>${usd(h.rev30)}</td><td>${usd(h.rev90)}</td><td>${usd(h.rev12)}</td></tr></tbody></table></div><p class="mut">DL growth 3M: ${pct(h.dlGrowth3)} · Rev growth 3M: ${pct(h.revGrowth3)} · Rev growth 6M: ${pct(h.revGrowth6)}</p><p class="mut">RPD cùng cohort: ${usd(h.rpd)} · Không phải LTV.</p>${r.historyNote?`<details><summary class="mut">Ghi chú cohort / giới hạn nguồn</summary><p class="source-text">${esc(r.historyNote)}</p></details>`:''}</section>${detailExtrasHTML(r)}<section class="section"><h3>Chất lượng và nguồn</h3><p class="text-break">${esc(r.note)}</p><p class="mut">Evidence: ${esc(r.evidenceType)} · Confidence: ${num(r.confidence)}/5</p><p class="source-text">${esc(DATA.source)} · ${(r.provenance||[]).map(esc).join(' · ')}</p>${safeLink(r.url)}${original&&!r.original?`<details><summary>Bản gốc ${esc(original.date)}</summary><p>DL/ngày ${num(original.downloads)} · Revenue/ngày ${usd(original.revenue)}</p></details>`:''}${r.audit?.length?`<details><summary>Lịch sử cập nhật (${r.audit.length})</summary>${r.audit.map(a=>`<p class="source-text">${esc(stamp(a.at))} · ${esc(displayName(a.by))} · ${esc(a.date)} · ${esc(a.note)} · DL/ngày ${num(a.downloads)} · Rev/ngày ${usd(a.revenue)} · ${esc(a.url)}${a.evidenceType?` · Evidence: ${esc(a.evidenceType)}`:''}${a.confidence!=null?` · Confidence: ${num(a.confidence)}/5`:''}${Array.isArray(a.provenance)&&a.provenance.length?` · Nguồn gốc: ${a.provenance.map(esc).join(' · ')}`:''}</p>`).join('')}</details>`:''}</section></div><div class="dialog-foot">${r.original?'':`<button class="btn danger" data-delete-market="${esc(id)}">${DATA.records.some(x=>x.id===id)?'Gỡ dữ liệu bổ sung (về bản gốc)':'Xóa quan sát'}</button>`}<button class="btn primary" data-market-edit="${esc(id)}">Bổ sung dữ liệu mới</button></div>`);
  }
  function safeLink(url) {try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))return '';return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">Mở nguồn ↗</a>`;}catch{return '';}}
  function marketForm(id) {
    const old=id?observations().find(r=>r.id===id):null;
    active={kind:'market',id,baseline:JSON.stringify(read().marketUpdates.find(x=>x.id===id)||null)};
    /* E3: name là select từ records; name khớp record -> category tự điền + khoá (hidden mirror để FormData vẫn có giá trị). */
    const nameRec=old?DATA.records.find(r=>r.name===old.name):null;
    const nameNames=[...new Set(DATA.records.map(r=>r.name))];
    const nameField=`<label>Mechanic / nhóm<select name="name" required><option value="">— Chọn mechanic —</option>${nameNames.map(n=>`<option value="${esc(n)}" ${old?.name===n?'selected':''}>${esc(n)}</option>`).join('')}${old?.name&&!nameNames.includes(old.name)?`<option value="${esc(old.name)}" selected>(dữ liệu cũ) ${esc(old.name)}</option>`:''}</select></label>`;
    const catVal=nameRec?nameRec.category:(old?.category||category);
    const catField=nameRec
      ? `<input type="hidden" name="category" value="${esc(catVal)}"><label>Nhóm (tự động theo mechanic)<select name="categoryLocked" disabled>${options(['Puzzle','Simulation'],catVal)}</select></label>`
      : `<label>Nhóm<select name="category">${options(['Puzzle','Simulation'],catVal)}</select></label><span data-category-lock hidden></span>`;
    showDialog(head(old?'Bổ sung quan sát · '+old.name:'Thêm quan sát thị trường')+`<form id="marketForm"><div class="dialog-body"><p class="mut">Thêm bản quan sát có ngày và nguồn. Snapshot gốc luôn giữ lại. Dữ liệu mới không tự kế thừa concentration, growth hoặc CPI của ngày cũ.</p><div class="fields">${nameField}${catField}${field('date','Ngày snapshot','','date','required')}${selectLegacy('geo','Thị trường',GEO_LIST,old?.geo||'US')}${selectLegacy('platform','Nền tảng',['Android','iOS','Android + iOS'],old?.platform||'')}${field('downloads','Downloads / ngày','','number','min="0" step="any"')}${field('revenue','Revenue USD / ngày','','number','min="0" step="any"')}${field('url','Source URL','','url','required')}${memberField('by','Người cập nhật',null,'',{required:true})}${selectLegacy('confidence','Confidence',[['1','1'],['2','2'],['3','3'],['4','4'],['5','5']],old?.confidence!=null?String(old.confidence):'','required')}${selectLegacy('evidenceType','Loại bằng chứng',EVIDENCE_TYPES,old?.evidenceType||'Fact')}${area('note','Phạm vi / phương pháp / ghi chú')}</div><div id="formError" class="error" role="alert"></div></div><div class="dialog-foot"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary">Lưu quan sát</button></div></form>`);
  }
  function submitMarket(e) {
    e.preventDefault();const form=e.target,d=new FormData(form),s=read();
    if(JSON.stringify(s.marketUpdates.find(x=>x.id===active.id)||null)!==active.baseline)throw Error('Quan sát đã được cập nhật ở tab khác. Đóng và mở lại trước khi lưu.');
    const val=k=>String(d.get(k)||'').trim();const optional=k=>val(k)===''?null:Number(val(k));
    if(!val('note'))throw Error('Ghi rõ phạm vi và phương pháp cho quan sát này.');
    const url=new URL(val('url'));if(!['https:','http:'].includes(url.protocol))throw Error('Nguồn cần URL http hoặc https.');
    const downloads=optional('downloads'),revenue=optional('revenue');
    if(downloads===null&&revenue===null)throw Error('Nhập ít nhất downloads hoặc revenue; phần chưa có giữ trống.');
    let prev=active.id?observations().find(x=>x.id===active.id):null;
    /* C13: "+ Thêm quan sát" với tên TRÙNG mechanic/record đã có (khớp tên
       chính xác sau trim, không phân biệt hoa/thường, trên danh sách quan sát
       đã gộp workbook + bổ sung) -> CHUYỂN sang đường bổ sung dữ liệu vào
       record gốc (đúng luồng "Bổ sung dữ liệu mới": cùng id, audit nối tiếp)
       thay vì tạo dòng OBS- trùng tên. Không trùng -> tạo mới như cũ. */
    let targetId=active.id||null, routedDuplicate=false;
    if(!targetId){
      const dup=observations().find(x=>String(x.name||'').trim().toLowerCase()===val('name').toLowerCase());
      if(dup){targetId=dup.id;prev=dup;routedDuplicate=true;}
    }
    /* A11/M2: provenance GỐC của record (mảng tham chiếu sheet workbook) được
       GIỮ NGUYÊN khi merge/bổ sung — không thay bằng ["Quan sát do ... cập
       nhật"] nữa; nhãn đó chỉ dùng cho quan sát hoàn toàn mới, chưa có
       provenance nào. evidenceType ngoài taxonomy vẫn giữ qua cơ chế
       "(dữ liệu cũ)" của form như hiện tại. Audit entry của quan sát trước
       lưu thêm evidenceType/provenance/confidence (trước chỉ có
       date/downloads/revenue/url/note/by/at). */
    const next={id:targetId||'OBS-'+uuid(),name:val('name'),category:val('category'),date:val('date'),geo:val('geo'),platform:val('platform'),downloads,revenue,url:url.href,by:val('by'),confidence:Number(val('confidence')),evidenceType:val('evidenceType'),note:val('note'),history:{},cpi:{},top1:null,top3:null,top5:null,newcomer:null,historyNote:'',historyPeriod:'',cpiScope:'',provenance:(prev&&Array.isArray(prev.provenance)&&prev.provenance.length)?[...prev.provenance]:['Quan sát do '+displayName(val('by'))+' cập nhật'],at:new Date().toISOString(),audit:[...(prev?.audit||[]),...(prev?[{date:prev.date,downloads:prev.downloads,revenue:prev.revenue,url:prev.url,note:prev.note,by:prev.by||'Workbook',at:prev.at||null,evidenceType:prev.evidenceType??null,provenance:Array.isArray(prev.provenance)?[...prev.provenance]:[],confidence:prev.confidence??null}]:[])]};
    const i=s.marketUpdates.findIndex(x=>x.id===next.id);if(i<0)s.marketUpdates.push(next);else s.marketUpdates[i]=next;
    write(s);closeDialog();render();notify(routedDuplicate?'Tên trùng quan sát đã có — đã bổ sung dữ liệu vào bản gốc thay vì tạo dòng trùng.':'Đã lưu quan sát thị trường.');
  }
  function renderReviews() {
    const data=read(),s=crm();
    const rows=data.requests.filter(r=>reviewFilter==='all'||r.status===reviewFilter).filter(r=>reviewKindFilter==='all'||r.kind===reviewKindFilter).filter(r=>!query||(label(entity(s,r.kind,r.entityId))+' '+r.kind).toLowerCase().includes(query));
    $('#screen').innerHTML=`<div class="row"><div class="chips"><span class="badge">Company ≠ Game</span><span class="badge">MKT: chuyên môn · BD: thương mại</span></div>${role==='bd'?'<button class="btn primary" data-action="request">+ Gửi yêu cầu đánh giá</button>':''}</div><div class="metrics"><div class="metric"><small>Chờ / đang đánh giá</small><strong>${data.requests.filter(r=>['Chờ đánh giá','Đang đánh giá'].includes(r.status)).length}</strong><span>Company và game riêng biệt</span></div><div class="metric"><small>Chờ bổ sung</small><strong>${data.requests.filter(r=>r.status==='Chờ bổ sung').length}</strong><span>Yêu cầu có bằng chứng còn thiếu</span></div><div class="metric"><small>Hoàn tất chuyên môn</small><strong>${data.requests.filter(r=>r.status==='Hoàn tất').length}</strong><span>Không đồng nghĩa đã duyệt deal</span></div></div><div class="tools"><input type="search" id="reviewSearch" aria-label="Tìm hồ sơ đánh giá" placeholder="Tìm company hoặc game…" value="${esc(query)}"><select id="reviewFilter" aria-label="Lọc tiến độ">${options([['all','Tất cả tiến độ'],'Chờ đánh giá','Đang đánh giá','Chờ bổ sung','Hoàn tất'],reviewFilter)}</select><select id="reviewKindFilter" aria-label="Lọc loại hồ sơ">${options([['all','Tất cả loại'],['company','Company'],['game','Game']],reviewKindFilter)}</select></div><div class="card-grid">${rows.map(r=>{
      const en=entity(s,r.kind,r.entityId),v=r.current||{};
      const isCo=r.kind==='company';
      const eff=isCo?null:effectiveGameResult(r);
      const res=isCo?F.company(v):eff.legacyResult;
      const rec=isCo?res.recommendation:eff.recommendation;
      const value=isCo?res.total:eff.final;
      const valueLabel=isCo?'Partner Fit (company)':eff.label;
      return `<article class="panel review-card"><div class="row"><span class="eyebrow">${r.kind==='company'?'STUDIO / NĂNG LỰC SẢN XUẤT':'GAME / SẢN PHẨM'}</span>${badge(r.status)}</div><h3>${esc(label(en))}</h3><p class="mut">${r.kind==='game'?esc(label(s.companies.find(c=>c.id===en?.company))):'Bộ tiêu chí studio/indie; không áp cho publisher'}</p><p class="text-break sub">${esc(r.requestNote||'')}</p><div class="row">${badge(rec)}<span>${esc(valueLabel)} <b>${num(value,1)}</b> /100</span></div><p class="source-text">${r.revisions.length} phiên bản · ${r.current?.at?esc(stamp(r.current.at)):'Chưa chấm'}${en?.name?.includes('(mẫu)')||s.companies.find(c=>c.id===en?.company)?.name?.includes('(mẫu)')?' · Hồ sơ CRM mẫu':''}</p><div class="row"><button class="btn ${role==='mkt'?'primary':''}" data-review="${esc(r.id)}">${role==='mkt'?'Mở đánh giá':'Xem kết quả / bổ sung'}</button><button class="btn danger" data-delete-request="${esc(r.id)}">Xóa yêu cầu</button></div></article>`;
    }).join('')||`<div class="panel empty full"><h3>${data.requests.length?'Không có hồ sơ khớp bộ lọc':'Chưa có yêu cầu đánh giá'}</h3><p class="mut">${role==='bd'?'Chọn company hoặc game đã có trong CRM để giao MKT đánh giá.':'BD gửi yêu cầu company hoặc game từ CRM; hàng chờ sẽ xuất hiện tại đây.'}</p></div>`}</div>`;
  }
  function requestForm(kind='company',id='') {
    const s=crm();const companies=s.companies.filter(isStudio),games=eligibleGames(s);
    /* C16: tạo request cho game đã chọn -> prefill mechanicId suy từ
       game.genre (mechanicIdForGame); chỉ là giá trị khởi tạo trong form,
       BD sửa được trước khi gửi. */
    const prefillIntake = (kind==='game' && id) ? (() => { const mid = mechanicIdForGame(games.find(x => x.id === id)); return mid ? {mechanicId: mid} : {}; })() : {};
    /* requestedBy mặc định = member đang đăng nhập (SavaAuth.currentUser);
       người dùng vẫn đổi được trong form trước khi gửi. Member không thuộc
       vai BD (vd Admin) thì bỏ lọc vai để id của họ hiện đúng trong select
       thay vì bị gắn nhãn "(dữ liệu cũ)". */
    const meReqId = currentRequesterId();
    const meMember = meReqId ? memberList().find(m => m.id === meReqId) : null;
    const reqRoleFilter = meMember && meMember.role && meMember.role !== 'BD' ? null : 'BD';
    showDialog(head('Gửi yêu cầu đánh giá')+`<form id="requestForm"><div class="dialog-body"><p class="mut">Chỉ lấy hồ sơ đang có trong CRM. Không nhập company, game hay deal mẫu từ workbook. Bộ company hiện dành cho studio/indie developer.</p><div class="fields">${select('kind','Loại đánh giá',[['company','Năng lực sản xuất company'],['game','Đánh giá từng game']],kind)}<label>Hồ sơ<select name="entityId" required><option value="">Chọn hồ sơ CRM</option>${(kind==='company'?companies:games).map(x=>`<option value="${esc(x.id)}" ${x.id===id?'selected':''}>${esc(label(x))}${kind==='game'&&x.own==='ours'?' · Sava':''}</option>`).join('')}</select></label>${memberField('requestedBy','BD phụ trách',reqRoleFilter,meReqId,{required:true})}${memberField('assignee','MKT được giao (nếu có)','MKT','')}${field('due','Hạn đánh giá','','date')}${field('build','Build / phiên bản hiện tại','','text')}${field('source','Link build / thư mục bằng chứng','','url')}${area('requestNote','Thông tin đầu vào / yêu cầu BD')}</div><div id="intakeBox">${intakeFieldsHTML(kind,prefillIntake)}</div><div id="formError" class="error" role="alert"></div></div><div class="dialog-foot"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary">Gửi MKT</button></div></form>`);
  }
  function submitRequest(e) {
    e.preventDefault();if(role!=='bd')throw Error('Yêu cầu mới do BD gửi.');
    const d=new FormData(e.target),s=read(),c=crm(),kind=d.get('kind'),entityId=d.get('entityId');
    if(!['company','game'].includes(kind)||!entity(c,kind,entityId))throw Error('Chọn hồ sơ có trong CRM.');
    if(kind==='company'&&!isStudio(entity(c,kind,entityId)))throw Error('Khung này chỉ áp dụng studio/indie.');
    const exists=s.requests.find(r=>r.kind===kind&&r.entityId===entityId);
    if(exists){closeDialog();openReview(exists.id);notify('Đã mở hồ sơ đánh giá hiện có; build mới lưu bằng phiên bản tiếp theo.');return;}
    s.requests.push({id:'REV-'+uuid(),kind,entityId,requestedBy:d.get('requestedBy'),assignee:d.get('assignee'),due:d.get('due'),requestNote:d.get('requestNote'),source:d.get('source'),build:d.get('build'),intake:readIntake(d,kind,{}),status:'Chờ đánh giá',requestedAt:new Date().toISOString(),current:null,revisions:[],revision:0,entitySnapshot:entitySnapshotFor(kind,entity(c,kind,entityId))});
    write(s);closeDialog();tab='reviews';render();notify('Đã gửi yêu cầu vào hàng chờ MKT.');
  }
  const evidenceLabels={...Object.fromEntries([...F.market,...F.prototype,...F.partner,...F.production]),deal:'Deal Fit · chỉ BD',history:'Publisher History',legalEvidence:'Legal / IP Evidence'};
  const criterionHints={track:'Title đã ship, commercial result và bằng chứng có thể kiểm tra.',team:'Headcount, vai trò cốt lõi, phụ thuộc nhân sự chủ chốt.',capacity:'Capacity thực tế và số luồng production chạy song song.',cadence:'Tần suất build, thời gian phản hồi → build.',milestone:'Lịch sử giao 3–5 milestone gần nhất.',liveops:'Content/event song song với roadmap sản phẩm.',data:'Analytics, attribution, A/B test và độ tin cậy dữ liệu.',collaboration:'Minh bạch, phản hồi, ownership trong quá trình làm việc.',strategy:'SAVA tạo giá trị gì cho quan hệ hợp tác này?',pipeline:'Pipeline 6–12 tháng, khả năng hợp tác nhiều title.',deal:'Điều kiện trả partner, UA spend, recoup, quyền và downside. Không cộng vào Partner Fit.',size:'Quy mô cùng geo/platform/window; không coi cohort là toàn thị trường.',growth:'So cùng cohort giữa hai cửa sổ có mẫu số hợp lệ.',entry:'Concentration, incumbency và khả năng entry; không suy success rate từ gainers.',monetization:'Revenue/download cùng cohort chỉ là RPD, không phải LTV.',ua:'CPI paid installs, creative hook và độ phủ benchmark.',economics:'Man-days, content cost, QA/art và thời gian ra thị trường.',rtw:'Capability, resource và bằng chứng test của SAVA.',whitespace:'Khoảng trống gamefeel so với benchmark có bằng chứng.',uaTest:'Build × geo × platform, spend/paid installs, mẫu test.',retention:'D1/D3/D7/D30 theo cohort và cỡ mẫu.',engagement:'Session, playtime, level reach và churn cliff.',monetizationTest:'ROAS, ARPDAU, LTV/CPI từ test đúng window.',gamefeel:'User test: responsiveness, flow, agency, replay desire.',tech:'Stability, performance, cadence và chi phí hoàn thiện.'};
  function criterion(k,title,weight,e={},editable=true) {
    const entry = e && typeof e === 'object' && !Array.isArray(e) ? e : {};
    const sv=F.score(entry);
    /* N9: điểm 1–5 đã nhập nhưng F.score null (thiếu note/nguồn/trạng thái) -> nói rõ chưa đủ căn cứ ở bản chỉ-đọc. */
    const insufficient = !editable && F.valid(entry.score) && sv===null;
    const insuffSummary = insufficient ? ' <small class="mk-insufficient">điểm chưa đủ căn cứ (thiếu note/nguồn)</small>' : '';
    return `<details class="criterion"><summary><span>${esc(title)} ${weight?`<small>· ${num(weight,2)}%</small>`:''}</span><b>${sv===null?'NE':num(sv,1)+'/5'}</b>${insuffSummary}</summary><p class="mut">${esc(criterionHints[k]||'Ghi bằng chứng và trạng thái xác minh.')}</p>${editable?`<div class="fields">${field('s_'+k,'Điểm 1–5',entry.score??'','number','min="1" max="5" step="0.1"')}${select('t_'+k,'Trạng thái bằng chứng',F.statuses,entry.status||'Thiếu')}<label class="source">Nguồn / ngày cập nhật<input name="u_${esc(k)}" value="${esc(entry.source||'')}" placeholder="URL hoặc tài liệu, ngày review"></label><label class="note">Bằng chứng / lý do chấm<textarea name="n_${esc(k)}">${esc(entry.note||'')}</textarea></label></div>`:`<p class="text-break">${esc(entry.note||'Chưa có bằng chứng.')}</p><p class="source-text">${esc(entry.status||'Thiếu')} · ${esc(entry.source||'')}</p>${insufficient?'<p class="source-text mk-insufficient">điểm chưa đủ căn cứ (thiếu note/nguồn)</p>':''}`}</details>`;
  }
  function openReview(id) {
    const store=read(); const r=store.requests.find(r=>r.id===id);if(!r)return;const s=crm(),en=entity(s,r.kind,r.entityId),a=r.current||{},e=(a.entries&&typeof a.entries==='object'&&!Array.isArray(a.entries))?a.entries:{};
    active={kind:'review',id,revision:r.revision};
    const isCompany=r.kind==='company';
    const eff=isCompany?null:effectiveGameResult(r);
    const result=isCompany?F.company(a):eff.legacyResult;
    const headlineRec=isCompany?result.recommendation:eff.recommendation;
    const professionalKeys=isCompany?[['track','Track Record',10/90*100],['team','Năng lực Team',15/90*100],...F.production.map(v=>[...v,0]),['data','Data & Tech',10/90*100],['collaboration','Hợp tác',15/90*100],['strategy','Strategic Fit',15/90*100],['pipeline','Tiềm năng Long-term',10/90*100]]:[...F.market,...F.prototype];
    /* A3: hiệu lực v2 -> ẨN tổng kết legacy (panel v2 đã có tổng kết); chưa có v2 hiệu lực -> giữ legacy. */
    const resultHTML=isCompany?`<div class="summary-result"><div><small>Partner Fit (company) /100</small><strong>${num(result.total,1)}</strong></div><div><small>Production Composite /5</small><strong>${num(result.composite,1)}</strong></div><div><small>Evidence coverage</small><strong>${pct(result.coverage)}</strong></div></div><p class="mut">Hard Gate: ${esc(result.hardGate)} · Minimum Evidence: ${result.minimum?'ĐẠT':'THIẾU'} · Confidence: ${esc(result.confidence)}</p>`:eff.type!=='legacy'?'':`<p class="mut">Tổng kết · Khung workbook (cũ)</p><div class="summary-result"><div><small>Market /100</small><strong>${num(result.market,1)}</strong></div><div><small>Prototype /100</small><strong>${num(result.prototype,1)}</strong></div><div><small>Final /100</small><strong>${num(result.final,1)}</strong></div></div><p class="mut">Data completeness: ${pct(result.completeness)} · Hard Gate: ${esc(result.gate)} · Final = 40% Market + 60% Prototype</p>`;
    const dialogTitle=isCompany?`Đánh giá Partner — ${label(en)}`:label(en);
    const companySub=isCompany?`<p class="sub">Khung Partner chính thức · dữ liệu dùng chung với CRM</p>`:'';
    /* C12: review game cũng có liên kết ngược về CRM (?open=game&id=...) như
       review company đã có (?open=company ở companyNavHTML). */
    /* C15: request MỒ CÔI — entity đã bị xóa khỏi CRM: vẫn mở xem được nhưng
       KHÓA lưu revision mới (nút lưu/requeue disabled + notice + guard trong
       submitReview), áp cho cả BD và MKT. Xóa yêu cầu vẫn được phép. */
    const orphan = !en;
    const orphanHTML = orphan ? `<p class="mk-alert" role="alert">Hồ sơ này đã được gỡ khỏi CRM — chế độ chỉ xem. Không lưu thêm phiên bản đánh giá được; bạn vẫn có thể xóa yêu cầu này.</p>` : '';
    const navHTML=isCompany?companyNavHTML(r,s,store.requests):(en?`<section class="section"><p><a href="index.html?open=game&amp;id=${encodeURIComponent(r.entityId)}">← Hồ sơ game trong CRM</a></p></section>`:'');
    const intakeHTML=role==='mkt'?intakeDisplayHTML(r):intakeSummaryHTML(r);
    /* C7 (đợt 3, sửa hẹp đúng chỗ này): ghi chú BD của game (g.bdNote trong
       CRM) hiển thị trong review game để MKT đọc được khi đánh giá — nhãn rõ
       "Ghi chú BD", đặt ngay dưới khu vực thông tin game/intake. Đây là
       bdNote của HỒ SƠ GAME, khác bdComment của từng revision (D5 vẫn ẩn
       bdComment khỏi MKT như cũ). */
    const bdNoteHTML = (r.kind === 'game' && en && String(en.bdNote || '').trim())
      ? `<section class="section"><h3>Ghi chú BD (từ hồ sơ game trong CRM)</h3><p class="text-break">${esc(en.bdNote)}</p></section>` : '';
    const criteriaItems=professionalKeys.map(([k,t,w],i)=>`${!isCompany&&i===F.market.length?'<h3 class="section">Prototype Score · 6 tiêu chí</h3>':''}${criterion(k,t,w,e[k],role==='mkt')}`).join('');
    const qualityBlock=isCompany?'':role==='mkt'?`<section class="section"><div class="fields">${field('quality','Evidence Quality 1–5',a.quality??'','number','min="1" max="5" step="1"')}</div></section>`:`<p class="mut">Evidence Quality: ${num(a.quality)}/5</p>`;
    let professionalSection;
    if (isCompany) {
      professionalSection=`<section class="section"><h3>Năng lực sản xuất &amp; Partner Fit</h3><p class="mut">7 pillar chuẩn hóa tổng trọng số 90 → 100. Production = trung bình 4 nhóm; thiếu 1 nhóm → NE. Deal Fit tách riêng.</p>${criteriaItems}</section>`;
    } else if (eff.type!=='legacy') {
      professionalSection=`<details class="mk-legacy-fold"><summary>Khung workbook (cũ) — chỉ xem lịch sử, không cần chấm khi đã có điểm v2</summary><section class="section"><h3>Market Score · 8 tiêu chí</h3><p class="mut">Điểm 1–5 theo bộ candidate so sánh: 1 rất bất lợi, 3 trung tính, 5 rất thuận lợi. Trọng số Market và Prototype tính riêng.</p>${criteriaItems}</section>${qualityBlock}</details>`;
    } else {
      professionalSection=`<section class="section"><h3>Market Score · 8 tiêu chí</h3><p class="mut">Điểm 1–5 theo bộ candidate so sánh: 1 rất bất lợi, 3 trung tính, 5 rất thuận lợi. Trọng số Market và Prototype tính riêng.</p>${criteriaItems}</section>${qualityBlock}`;
    }
    /* B3 (N3): role=mkt KHÔNG render Deal Fit, legalEvidence, và note/source của Hard Gate company. */
    const evidenceSection=isCompany?`<section class="section"><h3>Evidence hỗ trợ</h3>${criterion('history','Publisher History',0,e.history,role==='mkt')}${role==='mkt'?'':criterion('legalEvidence','Legal / IP',0,e.legalEvidence,role==='bd')}</section>`:'';
    const dealSection=(isCompany&&role!=='mkt')?`<section class="section"><h3>Deal Fit · phần BD</h3><p class="mut">Không cộng vào Partner Fit. Deal evidence vẫn là điều kiện của Minimum Evidence Gate trong playbook.</p>${criterion('deal','Mức độ phù hợp Deal',0,e.deal,role==='bd')}</section>`:'';
    const historyHTML=r.revisions.slice().reverse().map((h,i)=>{
      const hh=(h&&typeof h==='object'&&!Array.isArray(h))?h:{};
      const hEntries=(hh.entries&&typeof hh.entries==='object'&&!Array.isArray(hh.entries))?hh.entries:{};
      let resH, histRec, histVal, effH = null;
      if (isCompany) { try{resH=F.company(hh);}catch{resH={recommendation:'—',total:null};} histRec=resH.recommendation; histVal=resH.total; }
      else { effH=effectiveGameResult({kind:'game',entityId:r.entityId,intake:r.intake,current:hh}); histRec=effH.recommendation; histVal=effH.final; resH=effH.legacyResult; }
      /* D1: role MKT KHÔNG thấy gateNote/gateSource của GAME — kể cả trong
         lịch sử revision, MKT chỉ thấy nhãn gate (như phía company). BD thấy đủ. */
      const gateLine=isCompany
        ? (role==='mkt' ? F.gates.map(([gk,gt])=>`${gt}: ${gateLabel(hh.gates?.[gk]?.value||'PENDING')}`).join(' · ') : JSON.stringify(hh.gates||{}))
        : (role==='mkt' ? gateLabel(hh.gate||'PENDING') : (hh.gate||'PENDING')+' · '+(hh.gateNote||'')+' · '+(hh.gateSource||''));
      const entriesHTML=Object.entries(hEntries).filter(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)).filter(([k])=>!(isCompany&&role==='mkt'&&(k==='deal'||k==='legalEvidence'))).map(([k,v])=>{const sv=F.score(v);const insuff=F.valid(v.score)&&sv===null?' · điểm chưa đủ căn cứ (thiếu note/nguồn)':'';return `<p class="source-text"><b>${esc(evidenceLabels[k]||k)}</b> ${num(sv,1)}/5 · ${esc(v.status||'')} · ${esc(v.note||'')} · ${esc(v.source||'')}${esc(insuff)}</p>`;}).join('');
      /* B2/D2: dòng chi tiết v2 trong lịch sử đi qua effectiveGameResult
         (effH) như mọi bề mặt: stale hoặc completeness <80% -> "—", không in
         số; chỉ revision v2 hiệu lực + đủ dữ liệu mới in số thật. */
      const v2HistLine = isCompany || !effH || effH.type === 'legacy' ? ''
        : effH.type === 'stale' ? `<p class="source-text">Market v2: — · Prototype v2: — · Final v2: — (điểm thuộc mechanic cũ — chờ chấm lại)</p>`
        : effH.type === 'v2-insufficient' ? `<p class="source-text">Market v2: — · Prototype v2: — · Final v2: — (chưa đủ dữ liệu · ${Math.round((effH.minCompleteness || 0) * 100)}%)</p>`
        : `<p class="source-text">Market v2: ${num(effH.v2.market.score,1)}/100 · Prototype v2: ${num(effH.v2.prototype.score,1)}/100 · Final v2: ${num(effH.v2.final,1)}/100${effH.v2.decision?' · '+esc(effH.v2.decision):''}</p>`;
      /* D5: MKT không thấy bdComment trong lịch sử — chỉ thấy comment chung
         (nếu có); BD thấy cả hai như hiện tại (comment ưu tiên, fallback bdComment). */
      const histComment = role === 'mkt' ? (hh.comment || '') : (hh.comment || hh.bdComment || '');
      return `<details class="history-entry"><summary>v${r.revisions.length-i} · ${esc(stamp(hh.at))} · ${esc(displayName(hh.reviewer))} (${esc((hh.role||'').toUpperCase())}) · ${esc(hh.status||'')}</summary><p>${esc(histRec)} · ${num(histVal,1)}/100 · build ${esc(hh.build||'')}${!isCompany&&effH&&effH.type==='legacy'?' · Khung workbook (cũ)':''}</p>${v2HistLine}<p class="text-break">${esc(histComment)}</p><p class="text-break">${esc(hh.conditions||'')}</p>${entriesHTML}<p class="source-text">Gate: ${esc(gateLine)}</p></details>`;
    }).join('');
    showDialog(head(dialogTitle)+`<form id="reviewForm"><div class="dialog-body">${companySub}${orphanHTML}<div class="chips">${badge(isCompany?'Company · năng lực sản xuất':'Game · sản phẩm')}${badge(r.status)}${badge(headlineRec)}</div><p class="mut">BD: ${esc(displayName(r.requestedBy))} · MKT: ${esc(r.assignee?displayName(r.assignee):'Chưa giao')} · Hạn: ${esc(r.due||'Chưa đặt')}</p><p class="text-break">${esc(r.requestNote)}</p><p class="source-text">Build ${esc(r.build||'Chưa nhận')} · ${esc(r.source||'')}</p>${navHTML}${liveInfoHTML(r,s,en)}${intakeHTML}${bdNoteHTML}${v2PanelHTML(r,a)}${resultHTML}<p class="source-text">Kết quả trên là bản đã lưu. Lưu phiên bản để tính lại; ô chưa có căn cứ giữ NE.${!isCompany&&eff.type==='legacy'&&r.revisions.length?' Phiên bản hiện tại là Khung workbook (cũ) — chưa có Market Score v2.':''}${!isCompany&&eff.type==='stale'?' Điểm v2 thuộc mechanic cũ — chờ chấm lại.':''}${!isCompany&&eff.type==='v2-insufficient'?' Điểm v2 chưa đủ dữ liệu (completeness &lt; 80%) — Final hiển thị "—" cho tới khi đủ dữ liệu.':''}</p><div class="fields">${memberField('reviewer','Người cập nhật',null,'',{required:true})}${role==='mkt'?select('status','Tiến độ xử lý',['Chờ đánh giá','Đang đánh giá','Chờ bổ sung','Hoàn tất'],r.status):''}${role==='mkt'?field('build','Build / phiên bản chấm',a.build||r.build||''):''}${area('comment',role==='mkt'?'Nhận xét của MKT':'Ghi chú bổ sung của BD',role==='mkt'?a.comment||'':a.bdComment||'')}</div>
      ${professionalSection}
      ${evidenceSection}${dealSection}
      <section class="section"><h3>${isCompany?'6 Hard Gate · xác minh BD':'Hard Gate · xác minh BD'}</h3><p class="mut">Gate độc lập điểm số. Đạt phải có căn cứ; chưa xác minh giữ Chưa xác minh.</p>${isCompany?F.gates.map(([k,t])=>{const g=a.gates?.[k]||{};return role==='bd'?`<details class="criterion"><summary><span>${esc(t)}</span><b>${esc(gateLabel(g.value||'PENDING'))}</b></summary><div class="fields">${select('g_'+k,'Trạng thái',[['PENDING','Chưa xác minh'],['PASS','Đạt'],['FAIL','Không đạt']],g.value||'PENDING')}${field('gu_'+k,'Nguồn / ngày',g.source||'')}${area('gn_'+k,'Bằng chứng xác minh',g.note||'')}</div></details>`:`<div class="weight-row"><span>${esc(t)}</span><b>${esc(gateLabel(g.value||'PENDING'))}</b></div>`;}).join(''):role==='bd'?`<div class="fields">${select('gate','Hard Gate',[['PENDING','Chưa xác minh'],['PASS','Đạt'],['FAIL','Không đạt']],a.gate||'PENDING')}${field('gateSource','Nguồn / ngày xác minh',a.gateSource||'')}${area('gateNote','Bằng chứng / blocker / điều kiện Đạt',a.gateNote||'')}</div>`:`<p class="mut">${esc(gateLabel(a.gate||'PENDING'))}</p>`}</section>
      <section class="section"><h3>Điều kiện và bước tiếp theo</h3>${role==='mkt'?`<div class="fields">${area('strengths','Điểm mạnh có bằng chứng',a.strengths||'')}${area('risks','Rủi ro chuyên môn',a.risks||'')}${area('conditions','Điều kiện / bằng chứng cần bổ sung',a.conditions||'')}${area('next','Hành động kế tiếp',a.next||'')}</div>`:`<p class="text-break">${esc(a.strengths||'')}</p><p class="text-break">${esc(a.risks||'')}</p><p class="text-break">${esc(a.conditions||'')}</p><p class="text-break">${esc(a.next||'')}</p><div class="fields">${field('build','Build BD bổ sung',r.build||'')}${field('source','Link BD bổ sung',r.source||'','url')}${memberField('assignee','MKT phụ trách','MKT',r.assignee||'')}${field('due','Hạn đánh giá',r.due||'','date')}</div><div id="bd-intake">${intakeFieldsHTML(r.kind,effectiveIntake(r))}</div>`}</section>
      <section class="section"><h3>Lịch sử đánh giá · ${r.revisions.length} phiên bản</h3>${historyHTML||'<p class="mut">Chưa có phiên bản đánh giá.</p>'}</section><div id="formError" class="error" role="alert"></div></div><div class="dialog-foot"><span class="mut">${orphan?'Hồ sơ đã gỡ khỏi CRM — chỉ xem, không lưu phiên bản mới':'Lưu thêm phiên bản · giữ lịch sử cũ'}</span><button type="button" class="btn danger" data-delete-request="${esc(r.id)}">Xóa yêu cầu</button>${role==='bd'?`<button type="button" class="btn" data-action="requeue" ${orphan?'disabled':''}>Gửi MKT đánh giá lại</button>`:''}<button class="btn primary" ${orphan?'disabled':''}>${role==='mkt'?'Lưu đánh giá cho BD':'Lưu bổ sung BD'}</button></div></form>`);
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
    /* C15: request mồ côi (entity đã xóa khỏi CRM) — khóa lưu revision mới kể cả khi nút bị bật lại bằng tay. */
    if(!entity(crm(),r.kind,r.entityId))throw Error('Hồ sơ đã được gỡ khỏi CRM — chỉ xem, không lưu được phiên bản đánh giá mới.');
    const a=structuredClone(r.current||{entries:{}});a.entries ||= {};const val=k=>String(d.get(k)||'').trim();
    /* Đồng bộ mechanic khi lưu (request đang mở): mechanic hiệu lực theo CRM
       hiện tại tại thời điểm lưu; tính TRƯỚC khi save này đổi status. */
    const effMechBeforeSave = r.kind==='game' && !isCompletedRequest(r) ? effectiveMechanicId(r) : '';
    if(role==='mkt') {
      const keys=r.kind==='company'?['track','team',...F.production.map(([k])=>k),'data','collaboration','strategy','pipeline','history']:[...F.market,...F.prototype].map(([k])=>k);
      /* A4 + N14: đếm điểm v2 được nhập TRƯỚC. Có >=1 điểm v2 -> KHÔNG đọc lại ô legacy
         s_<k>/quality (entries + quality mang nguyên từ current revision sang) và chỉ
         khi đó mới gán a.scoresV2; không có điểm v2 nào -> không gán scoresV2 (a là bản
         clone của current nên scoresV2 cũ — nếu có — giữ nguyên, không tạo object rỗng). */
      let v2Built=null, v2Count=0;
      if(r.kind==='game'&&d.get('v2m_size')!==null) {
        const ctx=v2Context(r), savedV2=(r.current||{}).scoresV2||{};
        const curMech=effectiveMechanicId(r)||null, savedMech=savedV2.fromMechanicId??savedV2.mechanicId??null;
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
          v2.market[k]={score,source,rawInputs:keepPrev?(prev.rawInputs??null):(sug?sug.rawInputs:null)}; v2Count++;
        }
        for(const [k] of F.prototype) {
          const raw=String(d.get('v2p_'+k)??'').trim(); if(raw==='') continue;
          const score=Number(raw); if(!F.validV2(score)) throw Error('Điểm Prototype v2 '+k+' phải từ 1–5, bước 0.5.');
          v2.prototype[k]={score,source:'manual',rawInputs:null}; v2Count++;
        }
        if(v2Count>0) v2Built=v2;
      }
      const hasV2Input=v2Count>0;
      if(!hasV2Input) keys.forEach(k=>a.entries[k]=entryFrom(d,k));
      if(v2Built) { a.scoresV2=v2Built; delete a.legacy; }
      a.status=val('status');a.build=val('build');a.comment=val('comment');
      for(const k of ['strengths','risks','conditions','next'])a[k]=val(k);
      if(r.kind==='game'&&!hasV2Input)a.quality=val('quality')===''?null:Number(val('quality'));
      if(a.status==='Chờ bổ sung'&&!a.conditions&&!a.comment)throw Error('Ghi rõ bằng chứng đang cần bổ sung.');
      if(a.status==='Hoàn tất') {
        if(!a.comment)throw Error('Ghi nhận xét chuyên môn trước khi hoàn tất.');
        if(r.kind==='company'&&F.company(a).total===null)throw Error('Chưa đủ điểm Partner Fit (cần đủ 7 pillar theo khung Partner hợp nhất) để Hoàn tất; giữ Đang đánh giá hoặc Chờ bổ sung.');
        if(r.kind==='game') {
          /* B2: "có v2" theo định nghĩa duy nhất hasValidV2 (scoresV2 rỗng/
             điểm không hợp lệ -> không tính là v2, đi đường legacy). */
          const hasV2=typeof F.hasValidV2==='function'?F.hasValidV2(a):(a.scoresV2!==null&&a.scoresV2!==undefined);
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
    if (effMechBeforeSave) r.intake = { ...((r.intake && typeof r.intake === 'object') ? r.intake : {}), mechanicId: effMechBeforeSave };
    r.current=a;r.revisions.push(structuredClone(a));r.revision++;r.status=a.status;
    write(s);const id=r.id;closeDialog();render();openReview(id);notify(requeue?'Đã đưa lại vào hàng chờ MKT.':'Đã lưu phiên bản đánh giá; BD và MKT thấy cùng kết quả.');
  }
  function renderFramework() {
    const weights = rows => rows.map(([k,t,w])=>`<div class="weight-row"><span>${esc(t)}</span><b>${w}%</b></div>`).join('');
    $('#screen').innerHTML=`<div class="rule-grid"><section class="panel"><p class="eyebrow">GAME · 10_SCORECARD</p><h3>Market Score · 40% Final</h3>${weights(F.market)}<div class="formula">Market = Σ(điểm 1–5 × trọng số) / 5</div><h3 class="section">Prototype Score · 60% Final</h3>${weights(F.prototype)}<div class="formula">Final = Market × 0.4 + Prototype × 0.6</div><p class="mut">Data completeness = số input hợp lệ / 15 (8 Market + 6 Prototype + Evidence Quality). Ngưỡng 80%. Thiếu điểm giữ trống, không tự điền 3.</p><div class="chips">${badge('≥80 GREENLIGHT')}${badge('65–<80 TEST MORE')}${badge('<65 NO-GO')}</div><p class="mut">Hard Gate FAIL → NO-GO; Pending → HOLD; thiếu dữ liệu → HOLD. Điểm từng tiêu chí do MKT nhập theo bằng chứng; tổng điểm tự tính, không suy điểm từ doanh thu đơn lẻ.</p></section><section class="panel"><p class="eyebrow">COMPANY · 04_SCORECARD</p><h3>Partner Fit · không gồm Deal Fit</h3>${weights(F.partner)}<div class="formula">Partner Fit = ROUND((Track×10 + Team×15 + Production×15 + Data×10 + Hợp tác×15 + Strategic×15 + Long-term×10) / 5 / 90 × 100, 1)</div><p class="mut">Tổng trọng số nguồn là 90 sau khi bỏ Deal Fit. Điểm pillar lấy từ entries đã lưu; điểm Production = trung bình 4 ô con Capacity/Cadence/Milestone/LiveOps (đủ 4 mới tính, không làm tròn trung gian); thiếu một ô con → Production = NE. Chỉ tính Partner Fit khi đủ 7 pillar, làm tròn 1 chữ số ở bước cuối.</p><div class="chips">${badge('≥85 Ưu tiên')}${badge('75–<85 Đạt')}${badge('65–<75 Có điều kiện')}${badge('<65 Cần xem xét')}</div><h3 class="section">Hard Gate và Minimum Evidence</h3>${F.gates.map(([,t])=>`<div class="weight-row">${esc(t)}</div>`).join('')}<p class="mut">Hard Gate 6 cổng: có 1 cổng “Không đạt” → KHÔNG ĐẠT; đủ 6 cổng “Đạt” → ĐẠT; còn lại → CHỜ XÁC MINH. Kết luận: KHÔNG ĐẠT → Bị chặn; CHỜ XÁC MINH → Chờ xác minh; Minimum Evidence Gate chưa ĐẠT → Thiếu Evidence; còn lại lấy theo phân loại Partner Fit.</p><p class="mut">Evidence coverage tính trên 11 mục (7 pillar + 4 ô con Production: Capacity/Cadence/Milestone/LiveOps), chỉ mục “Đã xác minh” mới tính; mục “N/A” (không áp dụng) bị loại khỏi mẫu số. Trạng thái xác minh dùng thang hợp nhất: Thiếu → Chưa rõ → Đã trao đổi → Đối tác đã gửi → Đã xác minh, cộng “N/A”. Confidence: coverage ≥90% Cao, 60–89% Trung bình, &lt;60% Thấp. Minimum Evidence Gate = ĐẠT khi coverage ≥80% (quy tắc CRM áp theo ngưỡng 80% của khung game; file 2 không cho số cụ thể). Deal Fit chấm riêng 1–5, không cộng vào Partner Fit. Module Publishing và giao diện BD dùng chung một implementation PartnerEval (shared.js), không còn hai bộ quy tắc.</p></section></div><section class="panel"><h3>Nguồn và cách xử lý khác biệt trong file</h3><p class="sub">SAVA_Mobile_Game_Decision.xlsx: 10_SCORECARD!B4:B11, E4:E9, I4:I8 và các sheet thị trường. Publishing_Partner_Selection_Playbook.xlsx: 02_Hard_Gate, 03_Evidence, 04_Scorecard!D7:K7, L9:N9.</p><p class="sub">Sheet 05_Decision còn mô tả cũ gồm Deal 10%; bản này dùng công thức Partner Fit mới tại 04_Scorecard, loại Deal Fit và chuẩn hóa 90 → 100. Workbook game cho phép công thức tạm khi thiếu input; hệ thống giữ HOLD khi thiếu một nhóm điểm. Các kiểm tra bắt buộc ghi nguồn/bằng chứng là điều kiện bổ sung khi nhập liệu, không thay trọng số.</p><p class="sub">Khung Partner Fit này dành cho studio/indie. Publisher không dùng bộ năng lực sản xuất này. Không nhập Partner Master, deal, decision hay điểm đánh giá mẫu của các file. Đánh giá cũ /10 trong CRM giữ làm lịch sử; không tự quy đổi sang thang /5.</p></section>`;
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
    if(e.target.id==='reviewKindFilter'){reviewKindFilter=e.target.value;renderReviews();}
    if(e.target.name==='genre') {
      const form=e.target.form||e.target.closest('form');
      const wrap=form?.querySelector('[data-subgenre-wrap]');
      if(wrap){ const cur=form.querySelector('[name="subGenre"]')?.value||''; wrap.innerHTML=subGenreFieldHTML(e.target.value,cur); }
    }
    if(e.target.name==='name'&&e.target.form?.id==='marketForm') {
      const form=e.target.form, rec=DATA.records.find(r=>r.name===e.target.value);
      let hidden=form.querySelector('input[type="hidden"][name="category"]');
      let sel=form.querySelector('select[name="category"]')||form.querySelector('select[name="categoryLocked"]');
      if(rec) {
        if(sel){ sel.value=rec.category; sel.disabled=true; sel.name='categoryLocked'; }
        if(!hidden){ hidden=document.createElement('input'); hidden.type='hidden'; hidden.name='category'; form.querySelector('.fields')?.prepend(hidden); }
        hidden.value=rec.category;
      } else {
        if(hidden) hidden.remove();
        if(sel){ sel.disabled=false; sel.name='category'; }
      }
    }
    if(e.target.name==='entityId'&&e.target.form?.id==='requestForm'&&e.target.form.elements.kind?.value==='game') {
      /* C16: đổi game trong form tạo request -> prefill lại mechanic theo genre của game mới chọn (vẫn sửa tay được). */
      const g=eligibleGames(crm()).find(x=>x.id===e.target.value);
      const mid=g?mechanicIdForGame(g):'';
      const sel=e.target.form.querySelector('select[name="mechanicId"]');
      if(sel&&mid) sel.value=mid;
    }
    if(e.target.name==='kind'&&e.target.form?.id==='requestForm') {
      const select=e.target.form.elements.entityId,s=crm(),records=e.target.value==='company'?s.companies.filter(isStudio):eligibleGames(s);
      select.innerHTML='<option value="">Chọn hồ sơ CRM</option>'+records.map(x=>`<option value="${esc(x.id)}">${esc(label(x))}</option>`).join('');
      const box=e.target.form.querySelector('#intakeBox'); if(box) box.innerHTML=intakeFieldsHTML(e.target.value,{});
    }
    if(e.target.closest('.criterion')){
      const box=e.target.closest('.criterion'),scoreEl=box.querySelector('input[name^="s_"]'),statusEl=box.querySelector('select[name^="t_"]');
      if(scoreEl&&statusEl){const v=scoreEl.value===''?null:Number(scoreEl.value);box.querySelector('summary b').textContent=F.valid(v)&&F.scorableStatuses.includes(statusEl.value)?num(v,1)+'/5':'NE';}
    }
  });
  addEventListener('storage',e=>{if([KEY,STORE_KEY].includes(e.key)&&!$('#editor').open)render();});
  /* Boot mở-nhanh (supabase-auth.js): dữ liệu MỚI từ Supabase đã về cache
     trong lúc trang hiện bằng cache cũ -> render lại TẠI CHỖ, không
     reload. read()/crm() đọc tươi từ localStorage mỗi lần render nên
     chỉ cần render lại + làm mới window.S cho bridge. Dialog đang mở
     thì bỏ qua (giống listener 'storage' ở trên) để không nuốt bản sửa
     người dùng đang gõ. */
  try { window.__savaOnDataRefreshed = () => { if ($('#editor').open) return; try { window.S = crm(); } catch {} render(); }; } catch {}
  try {
    /* A13: Partner canonical migrate được cả khi chỉ mở Publishing/MKT
       trước CRM: publishing.html/mkt.html nạp publishing-bridge.js, trang
       gán window.S = state CRM hiện tại (bridge tìm state CRM qua window.S)
       rồi gọi PublishingBridge.migratePartnerLegacy() ngay khi khởi tạo.
       Khối E4 cũ (tìm global tự do không tồn tại) đã gỡ hẳn. */
    try { window.S = crm(); } catch {}
    try { if (typeof window !== 'undefined' && window.PublishingBridge && typeof window.PublishingBridge.migratePartnerLegacy === 'function') window.PublishingBridge.migratePartnerLegacy(); } catch {}
    render();
    const kind=params.get('kind'),id=params.get('id');
    /* C11: deep-link publishing.html?kind=<lạ> -> KHÔNG mở form sai loại:
       giữ danh sách mặc định và hiện thông báo lỗi rõ ràng. kind hợp lệ
       (game/company) giữ nguyên hành vi cũ. */
    if (kind && !['game','company'].includes(kind)) {
      $('#screen').insertAdjacentHTML('afterbegin', `<section class="panel mk-alert" role="alert"><h3>Liên kết không hợp lệ</h3><p>Loại hồ sơ “${esc(kind)}” trong liên kết không tồn tại (chỉ có game và company). Đã hiển thị danh sách mặc định, không mở form nào.</p></section>`);
      notify('Loại hồ sơ trong liên kết không hợp lệ — đã về danh sách mặc định.');
    } else if (kind && id) {
      const existing=read().requests.find(r=>r.kind===kind&&r.entityId===id);
      tab='reviews';render();if(existing)openReview(existing.id);else if(role==='bd'&&entity(crm(),kind,id))requestForm(kind,id);
    }
  }catch(e){$('#screen').innerHTML=`<section class="panel"><p class="error">${esc(e.message)}</p></section>`;}
})();
