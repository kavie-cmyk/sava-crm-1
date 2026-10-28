/* Read Publishing evaluations inside existing CRM dossiers without changing CRM records.
   Kho canonical cho đánh giá:
   - Game: request kind=game trong store 'sava_publishing_v1', điểm chính thức là
     scoresV2 (Market Score v2); khung workbook cũ chỉ còn là legacy/xem lịch sử.
   - Partner: request kind=company trong cùng store; thuật toán DUY NHẤT là
     PartnerEval.compute() qua adapter PublishingScore.company(). Mọi bề mặt BD
     (drawer công ty, badge, one-pager, dòng studio trong drawer game) đều đọc
     qua partnerSummary() ở đây — một nguồn số duy nhất.
   c.partnerEval (trên hồ sơ công ty CRM) là LEGACY: migration ở cuối file này
   chuyển nó sang canonical một lần (idempotent) rồi không UI nào đọc/ghi nữa. */
(function () {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STORE_KEY_PUB = 'sava_publishing_v1';
  function readStore() {
    try { const raw = localStorage.getItem(STORE_KEY_PUB); if (!raw) return null; const d = JSON.parse(raw); return d && typeof d === 'object' ? d : null; }
    catch { return null; }
  }
  function allRequests() {
    const d = readStore();
    return d && Array.isArray(d.requests) ? d.requests.filter(r => r && typeof r === 'object') : [];
  }
  /* QUY TẮC CHỌN REQUEST DUY NHẤT (A5): khi có nhiều request cùng kind+entityId,
     request canonical là request khớp CUỐI CÙNG trong mảng requests.
     Mọi bề mặt — partnerSummary/gameSummary (qua find), migration Partner
     (migratePartnerLegacy) — đều chọn đúng request này, không bề mặt nào
     chọn "request đầu tiên có revisions" như bản cũ nữa. */
  function selectRequest(list, kind, id) {
    const matches = (Array.isArray(list) ? list : []).filter(r => r && typeof r === 'object' && r.kind === kind && r.entityId === id);
    return matches.length ? matches[matches.length - 1] : undefined;
  }
  function find(kind, id) {
    return selectRequest(allRequests(), kind, id);
  }
  /* S3 guard: nếu state CRM (window.S hoặc biến toàn cục S của index.html) tồn
     tại, entity phải còn trong S.games / S.companies; đã bị xoá -> coi như
     chưa có record, không hiện badge/summary ma. Không có state CRM (trang
     khác) thì giữ hành vi cũ (không chặn). */
  function crmState() {
    try { if (typeof window !== "undefined" && window.S) return window.S; } catch {}
    try { if (typeof globalThis !== "undefined" && globalThis.S) return globalThis.S; } catch {}
    try { if (typeof S !== "undefined" && S) return S; } catch {}
    return null;
  }
  function entityExists(kind, id) {
    const st = crmState();
    if (!st) return true;
    const list = kind === 'game' ? st.games : kind === 'company' ? st.companies : null;
    if (!Array.isArray(list)) return true;
    return list.some(x => x && x.id === id);
  }
  function findLive(kind, id) {
    const record = find(kind, id);
    if (!record) return undefined;
    if (!entityExists(kind, id)) return undefined;
    return record;
  }
  function isStudio(c) {
    if (typeof window !== "undefined" && typeof window.isStudioCompany === "function") return window.isStudioCompany(c);
    return !!(c && c.roles && c.roles.publishing) && !/publisher/i.test(c.type || '');
  }
  function crmCompany(id) {
    const st = crmState();
    if (!st || !Array.isArray(st.companies)) return null;
    return st.companies.find(c => c && c.id === id) || null;
  }
  const fmt1 = n => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '—' : Number(n).toLocaleString('en-US', {maximumFractionDigits: 1});
  /* ===== B4: hiển thị điểm legacy (khung workbook cũ) — bản sao cục bộ của
     fmtLegacyFinal/legacyThresholdNote trong index.html (bridge không import
     được helper từ index.html nên chép đúng logic + câu chữ ở đây): luôn
     hiện ĐÚNG 1 chữ số thập phân (65.0 / 80.0) và khi số đã làm tròn chạm
     ngưỡng 65/80 nhưng điểm thô CHƯA qua ngưỡng thì kèm ghi chú rõ điểm
     thô, để không ai hiểu nhầm là đã đạt ngưỡng. Chỉ là quy tắc HIỂN THỊ:
     final thô lấy nguyên từ PublishingScore.game(), không làm tròn trung
     gian, không đổi phép tính legacy / recommendation. ===== */
  function fmtLegacyFinal(v) {
    const n = Number(v);
    if (v === null || v === undefined || !Number.isFinite(n)) return '—';
    return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  function legacyThresholdNote(v) {
    const n = Number(v);
    if (v === null || v === undefined || !Number.isFinite(n)) return '';
    const disp = Math.round(n * 10) / 10;
    for (const th of [65, 80]) { if (n < th && disp >= th) return ` (điểm thô ${String(n)} — chưa qua ngưỡng ${th}, kết luận tính theo điểm thô)`; }
    return '';
  }

  /* ===== Partner: tóm tắt canonical (một nguồn số duy nhất cho mọi bề mặt BD) =====
     Trả về:
       { exists, requestId, status, versions, computed, dealFit, pillars,
         strongest, weakest, strengths, risks, weak, next, reviewer, date, current }
     - computed = PublishingScore.company(current) (adapter của PartnerEval):
       { partnerFit/total, classification, conclusion, hardGate, coverage (0..1),
         coveragePct, confidence, minimum, evidenceGate, dealFit, values }.
     - pillars: điểm từng pillar đọc từ current.entries theo ĐÚNG quy tắc adapter:
       điểm trực tiếp 1–5; production = TB 4 ô con (đủ cả 4 mới có). */
  const PARTNER_PILLAR_KEYS = ['track', 'team', 'production', 'data', 'collaboration', 'strategy', 'pipeline'];
  const PROD_SUB_KEYS = ['capacity', 'cadence', 'milestone', 'liveops'];
  function directEntryScore(e) {
    /* B5: dùng scoreOrNull của bridge (ép chuỗi số an toàn như PartnerEval). */
    return scoreOrNull(e && e.score);
  }
  function partnerSummary(companyId) {
    const empty = { exists: false, requestId: null, status: null, versions: 0, computed: null, dealFit: null, pillars: {}, strongest: null, weakest: null, strengths: '', risks: '', weak: '', next: '', reviewer: '', date: '', current: null };
    const record = findLive('company', companyId);
    if (!record) return empty;
    const versions = Array.isArray(record.revisions) ? record.revisions.length : 0;
    const cur = record.current && typeof record.current === 'object' ? record.current : null;
    let computed = null;
    if (cur && typeof window !== 'undefined' && window.PublishingScore && typeof window.PublishingScore.company === 'function') {
      try { computed = window.PublishingScore.company(cur); } catch { computed = null; }
    }
    const pillars = {};
    if (cur && cur.entries && typeof cur.entries === 'object') {
      PARTNER_PILLAR_KEYS.forEach(k => { if (k !== 'production') pillars[k] = directEntryScore(cur.entries[k]); });
      const subs = PROD_SUB_KEYS.map(k => directEntryScore(cur.entries[k]));
      pillars.production = subs.every(v => v !== null) ? subs.reduce((a, b) => a + b, 0) / 4 : null;
      pillars.productionSubs = Object.fromEntries(PROD_SUB_KEYS.map((k, i) => [k, subs[i]]));
    }
    /* Điểm mạnh/yếu suy từ pillars (adapter PublishingScore.company không trả 2 field này). */
    const labels = (typeof window !== 'undefined' && window.PublishingScore && Array.isArray(window.PublishingScore.partner))
      ? Object.fromEntries(window.PublishingScore.partner.map(([k, label]) => [k, label])) : {};
    let strongest = null, weakest = null;
    PARTNER_PILLAR_KEYS.forEach(k => {
      const s = pillars[k];
      if (s === null || s === undefined) return;
      const item = { key: k, label: labels[k] || k, score: s };
      if (!strongest || s > strongest.score) strongest = item;
      if (!weakest || s < weakest.score) weakest = item;
    });
    return {
      exists: true, requestId: record.id || null, status: record.status || null, versions,
      computed, dealFit: computed ? computed.dealFit : null, pillars, strongest, weakest,
      strengths: cur ? String(cur.strengths || '') : '',
      risks: cur ? String(cur.risks || '') : '',
      weak: cur ? String(cur.risks || '') : '',
      next: cur ? String(cur.next || '') : '',
      reviewer: cur ? String(cur.reviewer || '') : (record.assignee || ''),
      date: cur ? String(cur.at || '') : '',
      current: cur,
    };
  }

  /* ===== Game: tóm tắt canonical (v2 chính thức; legacy chỉ khi không có v2 thật) =====
     "Có v2" theo ĐỊNH NGHĨA DUY NHẤT ở PublishingScore.hasValidV2 /
     v2Candidate (publishing-score.js — xem comment B3/B6 ở đó): ứng viên là
     scoresV2 (object thuần) hoặc chính current khi mang block market/
     prototype; cần ≥1 điểm validV2 (1–5, bước 0.5). Hai hàm local dưới đây
     chỉ là bản sao fallback khi PublishingScore chưa nạp và phải cho cùng
     kết quả; đường chính luôn ưu tiên PublishingScore. */
  const isPlainObjB = v => !!v && typeof v === 'object' && !Array.isArray(v);
  function v2CandidateOf(cur) {
    const PS = (typeof window !== 'undefined' && window.PublishingScore) || null;
    if (PS && typeof PS.v2Candidate === 'function') { try { return PS.v2Candidate(cur); } catch {} }
    if (!isPlainObjB(cur)) return null;
    if (isPlainObjB(cur.scoresV2)) return cur.scoresV2;
    if (isPlainObjB(cur.market) || isPlainObjB(cur.prototype)) return cur;
    return null;
  }
  function v2HasValidScore(cur) {
    const PS = (typeof window !== 'undefined' && window.PublishingScore) || null;
    if (PS && typeof PS.hasValidV2 === 'function') { try { return PS.hasValidV2(cur); } catch {} }
    const c = v2CandidateOf(cur);
    if (!c) return false;
    const validB = n => typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 5 && Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;
    const flat = isPlainObjB(c.entries) ? c.entries : {};
    const blockHas = (b, keys) => {
      const src = isPlainObjB(b) && Object.keys(b).length ? b : Object.fromEntries(keys.map(k => [k, flat[k]]));
      return Object.values(src).some(e => isPlainObjB(e) && validB(e.score));
    };
    return blockHas(c.market, ['size','growth','entry','monetization','ua','economics','rtw','whitespace'])
        || blockHas(c.prototype, ['uaTest','retention','engagement','monetizationTest','gamefeel','tech']);
  }
  function gameSummary(id) {
    const empty = { exists: false, requestId: null, status: null, versions: 0, v2: null, legacy: null, mechanicMismatch: false, current: null, request: null };
    const record = findLive('game', id);
    if (!record) return empty;
    const versions = Array.isArray(record.revisions) ? record.revisions.length : 0;
    const cur = record.current && typeof record.current === 'object' ? record.current : null;
    let v2 = null, legacy = null, mechanicMismatch = false;
    const PS = (typeof window !== 'undefined' && window.PublishingScore) || null;
    if (cur && PS) {
      const v2In = v2CandidateOf(cur);
      /* N14 + B3/B6: scoresV2 rỗng-không-entries, hoặc chỉ chứa điểm KHÔNG
         hợp lệ (ngoài 1–5 / sai bước 0.5 / NaN) -> coi như KHÔNG có v2,
         rơi về legacy có nhãn. */
      if (v2In && v2HasValidScore(cur) && typeof PS.gameV2 === 'function') {
        try { v2 = PS.gameV2(v2In); } catch { v2 = null; }
        if (v2) {
          /* N13: điểm v2 thuộc mechanic khác mechanic hiện tại của intake ->
             không dùng quyết định của nó nữa. */
          const savedMech = v2In.fromMechanicId ?? v2In.mechanicId ?? null;
          const curMech = record.intake && typeof record.intake === 'object' ? (record.intake.mechanicId || null) : null;
          if (savedMech && curMech && savedMech !== curMech) mechanicMismatch = true;
        }
      }
      if (!v2 && typeof PS.game === 'function') {
        try { legacy = PS.game(cur); } catch { legacy = null; }
      }
    }
    return { exists: true, requestId: record.id || null, status: record.status || null, versions, v2, legacy, mechanicMismatch, current: cur, request: record };
  }

  function gameBadge(id) {
    const r = findLive('game', id);
    return `<span class="pill gray">${esc(r ? 'MKT: ' + r.status : 'Chưa gửi yêu cầu đánh giá')}</span>`;
  }
  function summary(kind, id) {
    if (kind === 'company') {
      /* Chỉ hiển thị khi công ty đủ điều kiện studio (N11); không đủ điều kiện -> rỗng. */
      const c = crmCompany(id);
      if (c && !isStudio(c)) return '';
      const ps = partnerSummary(id);
      let result = '';
      if (!ps.exists) {
        result = `<p style="margin:7px 0">Chưa đánh giá Partner</p>`;
      } else if (!ps.computed || ps.versions === 0) {
        result = `<p style="font-size:13px;margin:0">${esc(ps.status || '')}</p><p style="margin:7px 0">Chưa đánh giá Partner</p>`;
      } else {
        const cp = ps.computed;
        result = `<p style="font-size:13px;margin:0">${esc(ps.status || '')}</p>` +
          `<p style="margin:7px 0">Partner Fit: <b>${cp.partnerFit == null ? '—' : fmt1(cp.partnerFit)}/100</b> · ${esc(cp.classification || '—')} · Kết luận: <b>${esc(cp.conclusion || '—')}</b></p>` +
          `<p style="margin:7px 0" class="mut">Hard Gate: ${esc(cp.hardGate || '—')} · Evidence: ${cp.coveragePct == null ? '—' : fmt1(cp.coveragePct)}% · ${ps.versions} phiên bản</p>`;
      }
      return `<section style="background:#f0f7f8;border:1px solid #d7e6ea;border-radius:12px;padding:15px;margin:16px 0"><h3 style="margin:0 0 7px">Đánh giá Partner</h3>${result}<a class="btn" style="text-decoration:none;margin-top:9px" href="publishing.html?tab=reviews&amp;kind=company&amp;id=${encodeURIComponent(id)}">Mở đánh giá Partner →</a></section>`;
    }
    const gs = gameSummary(id);
    let status = 'Chưa gửi yêu cầu đánh giá', result = '';
    if (gs.exists) {
      status = gs.status || status;
      const revCount = gs.versions;
      if (gs.mechanicMismatch) {
        result = `<p style="margin:7px 0">Điểm v2 thuộc mechanic cũ — chờ chấm lại · ${revCount} phiên bản</p>`;
      } else if (gs.v2) {
        const v2 = gs.v2;
        /* N12: % completeness hiển thị là khối THẤP HƠN (min Market/Prototype) kèm tên khối. */
        const compM = v2.market ? v2.market.completeness : 1, compP = v2.prototype ? v2.prototype.completeness : 1;
        const lowName = compM <= compP ? 'Market' : 'Prototype';
        const lowPct = Math.round(Math.min(compM, compP) * 100);
        const lowCompleteness = compM < 0.8 || compP < 0.8;
        if (v2.decision == null || lowCompleteness) {
          result = `<p style="margin:7px 0">Chưa đủ dữ liệu để kết luận · <b>— (chưa đủ dữ liệu · ${esc(lowName)} ${lowPct}%)</b> · ${revCount} phiên bản</p>`;
        } else {
          result = `<p style="margin:7px 0">${esc(v2.decision)} (Market Score v2) · Final v2 <b>${v2.final == null ? '—' : fmt1(v2.final)}/100</b> · ${revCount} phiên bản</p>`;
        }
      } else if (gs.legacy) {
        const res = gs.legacy;
        result = `<p style="margin:7px 0">${esc(res.recommendation)} · <b>${res.final == null ? 'NE' : fmtLegacyFinal(res.final)}/100</b>${legacyThresholdNote(res.final)} · Khung workbook (cũ) · ${revCount} phiên bản</p>`;
      }
    }
    return `<section style="background:#f0f7f8;border:1px solid #d7e6ea;border-radius:12px;padding:15px;margin:16px 0"><h3 style="margin:0 0 7px">Đánh giá game · Market Score v2</h3><p style="font-size:13px;margin:0">${esc(status)}</p>${result}<a class="btn" style="text-decoration:none;margin-top:9px" href="publishing.html?tab=reviews&amp;kind=game&amp;id=${encodeURIComponent(id)}">${gs.exists ? 'Xem kết quả / bổ sung BD' : 'Gửi MKT đánh giá'} →</a></section>`;
  }

  /* ===== Migration Partner legacy (c.partnerEval) -> canonical (request kind=company) =====
     Chạy khi nạp ở index.html (DOMContentLoaded — lúc đó state CRM S đã có).
     Idempotent: công ty đã đặt partnerEvalMigrated thì bỏ qua, trừ khi request
     canonical đã bị xoá (cờ tự hồi, A5); canonical (request cuối mảng) đã có
     revision HOẶC current có dữ liệu chấm thật thì canonical thắng, chỉ đặt
     cờ (A3). KHÔNG xoá c.partnerEval. */
  const GATE_KEYS = ['legal', 'ip', 'conflict', 'transparency', 'continuity', 'integrity'];
  function scoreOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
  }
  /* A3: request canonical "đã có dữ liệu chấm thật" — xét CURRENT nữa, không
     chỉ revisions.length: current.entries / current.scores có điểm hợp lệ
     hoặc ghi chú/nguồn, current.gates (hoặc hardGate) có cổng đã xử lý.
     Entry chỉ có trạng thái mặc định ("Thiếu"/"Chưa rõ") và không điểm/ghi
     chú thì chưa tính là dữ liệu thật. */
  function requestCurrentHasData(cur) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return false;
    const entries = cur.entries && typeof cur.entries === 'object' ? cur.entries : {};
    for (const e of Object.values(entries)) {
      if (!e || typeof e !== 'object') continue;
      if (scoreOrNull(e.score) !== null) return true;
      if (String(e.note || '').trim() || String(e.source || '').trim()) return true;
      const st = String(e.status || '').trim();
      if (st && st !== 'Thiếu' && st !== 'Chưa rõ') return true;
    }
    const scores = cur.scores && typeof cur.scores === 'object' ? cur.scores : {};
    for (const v of Object.values(scores)) {
      if (scoreOrNull(v) !== null) return true;
      if (v && typeof v === 'object' && scoreOrNull(v.score) !== null) return true;
    }
    const gates = (cur.gates && typeof cur.gates === 'object') ? cur.gates : (cur.hardGate && typeof cur.hardGate === 'object' ? cur.hardGate : {});
    for (const g of Object.values(gates)) {
      if (!g || typeof g !== 'object') continue;
      const v = g.value !== undefined ? g.value : g.status;
      if (v && v !== 'PENDING' && v !== 'Chưa xác minh') return true;
      if (String(g.note || '').trim() || String(g.source || '').trim()) return true;
    }
    return false;
  }
  function requestHasCanonicalData(r) {
    if (!r || typeof r !== 'object') return false;
    if (Array.isArray(r.revisions) && r.revisions.length > 0) return true;
    return requestCurrentHasData(r.current);
  }
  function partnerEvalHasData(ev) {
    if (!ev || typeof ev !== 'object') return false;
    const hg = ev.hardGate && typeof ev.hardGate === 'object' ? ev.hardGate : {};
    if (Object.values(hg).some(g => g && typeof g === 'object' && ((g.status && g.status !== 'Chưa xác minh') || String(g.note || '').trim()))) return true;
    const sc = ev.scores && typeof ev.scores === 'object' ? ev.scores : {};
    if (Object.values(sc).some(v => scoreOrNull(v) !== null)) return true;
    if (scoreOrNull(ev.dealFit) !== null) return true;
    const chkEv = o => !!o && typeof o === 'object' && Object.values(o).some(e => e && typeof e === 'object' && ((e.status && e.status !== 'Chưa rõ') || String(e.note || '').trim()));
    const evd = ev.evidence && typeof ev.evidence === 'object' ? ev.evidence : {};
    if (chkEv(evd) || chkEv(evd.productionSubs)) return true;
    if (String(ev.notesWeak || '').trim() || String(ev.nextAction || '').trim()) return true;
    return false;
  }
  function legacyToRevision(ev) {
    const gateMap = { 'Đạt': 'PASS', 'Không đạt': 'FAIL', 'Chưa xác minh': 'PENDING' };
    const gates = {};
    GATE_KEYS.forEach(k => {
      let g = ev.hardGate && ev.hardGate[k];
      if ((!g || typeof g !== 'object') && k === 'continuity' && ev.hardGate) g = ev.hardGate.control;
      gates[k] = { value: gateMap[g && g.status] || 'PENDING', note: String((g && g.note) || ''), source: '' };
    });
    /* Hợp nhất taxonomy + A6/M1: hai phía dùng CHUNG thang trạng thái xác
       minh (shared.js EVIDENCE_STATUSES) nên migration đi qua NGUYÊN VẸN mọi
       nấc của thang; nhãn cũ 'Partner cung cấp' đổi thành 'Đối tác đã gửi'.
       Giá trị lạ / thiếu -> fallback DUY NHẤT "Chưa rõ" qua
       normalizeStatusStrict dùng chung — bridge TUYỆT ĐỐI không tự nâng
       thành "Đã trao đổi" như fallback cũ nữa. */
    const strictStatus = v => {
      if (typeof window !== 'undefined' && window.PartnerEval && typeof window.PartnerEval.normalizeStatusStrict === 'function') return window.PartnerEval.normalizeStatusStrict(v);
      if (typeof window !== 'undefined' && typeof window.normalizeEvidenceStatusStrict === 'function') return window.normalizeEvidenceStatusStrict(v);
      const st = v === 'Partner cung cấp' ? 'Đối tác đã gửi' : v;
      const list = ['Thiếu', 'Chưa rõ', 'Đã trao đổi', 'Đối tác đã gửi', 'Đã xác minh', 'N/A'];
      return list.includes(st) ? st : 'Chưa rõ';
    };
    const mapEv = e => ({ status: strictStatus(e && e.status), note: String((e && e.note) || ''), source: '' });
    const entries = {};
    PARTNER_PILLAR_KEYS.forEach(k => {
      if (k === 'production') return;
      const m = mapEv((ev.evidence || {})[k]);
      entries[k] = { score: scoreOrNull((ev.scores || {})[k]), status: m.status, note: m.note, source: '' };
    });
    /* 4 ô con production: điểm từ partnerEval.prodSubs nếu có; thiếu điểm từng ô
       thì dùng điểm production trực tiếp (scores.production) cho cả 4 ô để TB 4 ô
       của adapter == điểm production legacy (giữ nguyên Partner Fit). */
    const prodScore = scoreOrNull((ev.scores || {}).production);
    PROD_SUB_KEYS.forEach(k => {
      const sub = (ev.prodSubs && ev.prodSubs[k]) || (((ev.evidence || {}).productionSubs || {})[k]) || {};
      const m = mapEv(sub);
      const s = scoreOrNull(sub.score);
      entries[k] = { score: s !== null ? s : prodScore, status: m.status, note: m.note, source: '' };
    });
    /* A6: entry deal không có trạng thái evidence legacy để mang theo — để
       "Chưa rõ", không tự gán "Đã trao đổi" như bản cũ. */
    entries.deal = { score: scoreOrNull(ev.dealFit), status: 'Chưa rõ', note: '', source: '' };
    /* A7: evidence CẤP PILLAR Production (status/note của chính pillar, tách
       khỏi 4 ô con) mang theo ở field riêng productionPillarEvidence của
       revision, và reviewDate mang theo ở field reviewDate. Hai field này
       KHÔNG tham gia tính coverage/Fit của adapter (adapter suy evidence
       pillar Production từ 4 ô con như trước) nên số canonical không đổi;
       đợt 2 hiển thị/đọc hai field này từ revision. */
    const productionPillarEvidence = mapEv((ev.evidence || {}).production);
    /* Kết luận có hay chưa quyết định status request: đủ Partner Fit + Hard Gate
       ĐẠT + Evidence Gate ĐẠT thì kết luận là phân loại thật -> "Hoàn tất". */
    let hasConclusion = false;
    try {
      if (typeof window !== 'undefined' && window.PartnerEval && typeof window.PartnerEval.compute === 'function') {
        const c = window.PartnerEval.compute(ev);
        hasConclusion = c.partnerFit !== null && c.hardGate === 'ĐẠT' && c.evidenceGate === 'ĐẠT';
      }
    } catch {}
    const status = hasConclusion ? 'Hoàn tất' : 'Đang đánh giá';
    return {
      entries, gates, productionPillarEvidence,
      reviewDate: String(ev.reviewDate || ''),
      strengths: '', risks: String(ev.notesWeak || ''), conditions: '', next: String(ev.nextAction || ''),
      comment: '', bdComment: '',
      reviewer: String(ev.reviewer || ''), role: 'bd', status,
      at: String(ev.updatedAt || '') || new Date().toISOString(),
      migratedFrom: 'bd-partnerEval',
    };
  }
  function migratePartnerLegacy() {
    const st = crmState();
    if (!st || !Array.isArray(st.companies)) return { migrated: 0, flagged: 0, skipped: 0 };
    let store = null, hadRaw = false;
    try {
      const raw = localStorage.getItem(STORE_KEY_PUB);
      if (raw) { hadRaw = true; store = JSON.parse(raw); }
    } catch { return { migrated: 0, flagged: 0, skipped: 0, error: 'parse' }; } /* lỗi parse -> bỏ qua migration, không chặn trang */
    if (!hadRaw) store = { version: 1, requests: [], marketUpdates: [] };
    /* A4: kho lạ — kho là MẢNG/scalar, version !== 1 (chỉ version 1 của
       publishing.js hợp lệ), hoặc requests/marketUpdates có mặt mà không
       phải mảng — thì migration HỦY không thành công giả: không ghi kho,
       không đặt cờ partnerEvalMigrated, và lần mở sau thử lại được. */
    if (!store || typeof store !== 'object' || Array.isArray(store)) return { migrated: 0, flagged: 0, skipped: 0, error: 'store-shape' };
    if (store.version !== 1) return { migrated: 0, flagged: 0, skipped: 0, error: 'store-version' };
    if (store.requests !== undefined && !Array.isArray(store.requests)) return { migrated: 0, flagged: 0, skipped: 0, error: 'store-shape' };
    if (store.marketUpdates !== undefined && !Array.isArray(store.marketUpdates)) return { migrated: 0, flagged: 0, skipped: 0, error: 'store-shape' };
    if (!Array.isArray(store.requests)) store.requests = [];
    if (!Array.isArray(store.marketUpdates)) store.marketUpdates = [];
    /* Lập KẾ HOẠCH trước, chỉ áp thay đổi CRM sau khi kho Publishing đã ghi
       thành công (A4: ghi không được -> không cờ nào bị đặt, thử lại sau). */
    let migrated = 0, flagged = 0, storeChanged = false;
    const crmActions = []; /* {company, value:true} đặt cờ | {company, value:false} hồi cờ */
    st.companies.forEach(c => {
      if (!c || typeof c !== 'object') return;
      /* A5: canonical đã bị XÓA (không còn request company nào cho công ty
         này) mà cờ vẫn đặt -> cờ tự hồi trong kế hoạch; nếu c.partnerEval
         còn dữ liệu, migration chạy lại ngay lần này từ bản legacy đó. */
      const canonical = selectRequest(store.requests, 'company', c.id);
      let isMigrated = !!c.partnerEvalMigrated;
      if (isMigrated && !canonical) { crmActions.push({ company: c, value: false }); isMigrated = false; }
      if (isMigrated) return;
      if (!isStudio(c)) return;
      if (!partnerEvalHasData(c.partnerEval)) return;
      const ev = c.partnerEval;
      /* A3 + A5: "canonical thắng" xét TRÊN ĐÚNG request canonical (cuối
         mảng, cùng quy tắc partnerSummary) và gồm cả current có dữ liệu
         chấm thật (revisions=[] vẫn thắng) — không ghi đè bằng legacy. */
      if (canonical && requestHasCanonicalData(canonical)) { crmActions.push({ company: c, value: true }); flagged++; return; }
      const rev = legacyToRevision(ev);
      if (canonical) {
        canonical.current = rev;
        canonical.revisions = [rev];
        canonical.revision = 1;
        canonical.status = rev.status;
        if (!canonical.requestedBy) canonical.requestedBy = String(ev.reviewer || '');
        if (!canonical.assignee) canonical.assignee = '';
        if (!canonical.intake || typeof canonical.intake !== 'object') canonical.intake = {};
        canonical.migratedFrom = 'bd-partnerEval';
      } else {
        const rid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? 'REV-' + crypto.randomUUID() : 'REV-mig-' + Date.now() + '-' + String(c.id);
        store.requests.push({
          id: rid, kind: 'company', entityId: c.id,
          requestedBy: String(ev.reviewer || ''), assignee: '',
          due: '', requestNote: '', source: '', build: '', intake: {},
          status: rev.status, requestedAt: new Date().toISOString(),
          current: rev, revisions: [rev], revision: 1, migratedFrom: 'bd-partnerEval',
        });
      }
      storeChanged = true; migrated++;
      crmActions.push({ company: c, value: true });
    });
    if (storeChanged) {
      try { localStorage.setItem(STORE_KEY_PUB, JSON.stringify(store)); }
      catch { return { migrated: 0, flagged: 0, skipped: 0, error: 'write-failed' }; } /* A4: không ghi được -> không đặt cờ nào */
    }
    if (crmActions.length) {
      crmActions.forEach(a => { if (a.value) a.company.partnerEvalMigrated = true; else delete a.company.partnerEvalMigrated; });
      try { if (typeof storeState === 'function' && typeof S !== 'undefined') storeState(S); } catch {}
      try { if (typeof render === 'function') render(); } catch {}
    }
    return { migrated, flagged, skipped: 0 };
  }

  /* A13: API bridge phơi cho các trang Publishing (đợt 2 nạp publishing-bridge.js
     rồi gọi qua window.PublishingBridge):
       summary(kind,id), gameBadge(id), partnerSummary(companyId),
       gameSummary(gameId), migratePartnerLegacy(),
       selectRequest(list,kind,id) — quy tắc chọn canonical (A5),
       requestCurrentHasData(current), requestHasCanonicalData(request) — A3,
       hasValidGameV2(current) — định nghĩa "có v2" duy nhất (B3, delegating
       PublishingScore.hasValidV2). */
  function hasValidGameV2(cur) { return v2HasValidScore(cur); }
  window.PublishingBridge = { summary, gameBadge, partnerSummary, gameSummary, migratePartnerLegacy, selectRequest, requestCurrentHasData, requestHasCanonicalData, hasValidGameV2 };
  addEventListener('storage', e => { if (e.key === 'sava_publishing_v1') { if (typeof render === 'function') render(); if (typeof refreshDrawer === 'function') refreshDrawer(); } });
  /* Migration chạy khi trang CRM (index.html) đã nạp xong state S. */
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { try { migratePartnerLegacy(); } catch {} });
    else { try { migratePartnerLegacy(); } catch {} }
  }
})();
