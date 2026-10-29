/* Pure scoring rules from the two supplied workbooks. No partner/deal records. */
(function (root) {
  'use strict';
  const market = [['size','Market Size',12],['growth','Growth / Momentum',12],['entry','Entry Accessibility',18],['monetization','Monetization Quality',15],['ua','UA / Creative Scalability',14],['economics','Production Economics',10],['rtw','SAVA Right-to-Win',10],['whitespace','Gamefeel Whitespace',9]];
  const prototype = [['uaTest','UA Test',20],['retention','Retention',22],['engagement','Engagement',12],['monetizationTest','Monetization Test',15],['gamefeel','Gamefeel Test',20],['tech','Tech / Production',11]];
  const partner = [['track','Track Record',10],['team','Năng lực Team',15],['production','Production & Execution',15],['data','Data & Tech',10],['collaboration','Hợp tác',15],['strategy','Strategic Fit',15],['pipeline','Tiềm năng Long-term',10]];
  const production = [['capacity','Production Capacity'],['cadence','Development Cadence'],['milestone','Milestone Reliability'],['liveops','LiveOps Scalability']];
  const gates = [['legal','Pháp lý / Hợp đồng'],['ip','Quyền sở hữu IP / source code'],['conflict','Xung đột Publisher'],['transparency','Minh bạch Data'],['continuity','Tính liên tục của team'],['integrity','Uy tín / Compliance']];
  /* Thang trạng thái xác minh HỢP NHẤT: hằng chuẩn nằm ở shared.js
     (EVIDENCE_STATUSES, nạp trước file này trong mọi trang). Khi chạy độc lập
     (Node test require riêng file này, không có shared.js) mới dùng danh sách
     dự phòng — PHẢI giống hệt hằng ở shared.js (test kiểm chứng khớp). */
  const statuses = (root && Array.isArray(root.EVIDENCE_STATUSES) && root.EVIDENCE_STATUSES)
    || (root && root.PartnerEval && Array.isArray(root.PartnerEval.EVIDENCE_STATUSES) && root.PartnerEval.EVIDENCE_STATUSES)
    || ['Thiếu','Chưa rõ','Đã trao đổi','Đối tác đã gửi','Đã xác minh','N/A'];
  /* Đổi nhãn trạng thái cũ: "Partner cung cấp" -> "Đối tác đã gửi". */
  const normalizeStatus = v => v === 'Partner cung cấp' ? 'Đối tác đã gửi' : v;
  /* Fallback DUY NHẤT cho trạng thái lạ (A6/M1): ngoài thang -> "Chưa rõ".
     Hằng/fallback dùng chung đặt ở shared.js (normalizeEvidenceStatusStrict);
     bản ở đây là bản sao fallback khi file này chạy độc lập (Node test) và
     PHẢI cho cùng kết quả. Đợt 2: publishing.js normalizeRevision dùng
     normalizeStatusStrict này (PublishingScore.normalizeStatusStrict). */
  const normalizeStatusStrict = v => { const st = normalizeStatus(v); return statuses.includes(st) ? st : 'Chưa rõ'; };
  /* Ép điểm dạng chuỗi AN TOÀN, thống nhất với PartnerEval.partnerScoreOrNull
     ở shared.js (B5): chuỗi số hợp lệ "4.5" -> 4.5; chuỗi không phải số /
     rỗng / ngoài 1–5 -> null (coi như không có điểm). Số chuẩn không đổi. */
  const scoreVal = v => {
    if (v === '' || v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
  };
  /* Tập trạng thái ĐỦ ĐIỀU KIỆN chấm điểm của hàm evidence() legacy.
     Trước hợp nhất, evidence() dùng statuses.slice(1,4) trên thang cũ
     ['Thiếu','Đã trao đổi','Partner cung cấp','Đã xác minh','N/A'] — tức đúng
     3 trạng thái này. Thang hợp nhất đổi thứ tự (chèn "Chưa rõ" vào giữa) nên
     slice theo vị trí sẽ SAI (mất "Đã xác minh", thừa "Chưa rõ"); vì vậy tập
     đủ điều kiện được ghi TƯỜNG MINH để GIỮ NGUYÊN hành vi tính điểm legacy:
     chỉ đổi tên "Partner cung cấp" -> "Đối tác đã gửi", normalizeStatus giúp
     bản ghi còn nhãn cũ vẫn đủ điều kiện y hệt trước. */
  const scorableStatuses = ['Đã trao đổi','Đối tác đã gửi','Đã xác minh'];
  const valid = n => typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 5;
  const round = n => Math.round((n + Number.EPSILON) * 10) / 10;
  const evidence = e => !!e && scorableStatuses.includes(normalizeStatus(e.status)) && !!String(e.note || '').trim() && !!String(e.source || '').trim();
  const score = e => evidence(e) && valid(e.score) ? e.score : null;
  function weighted(keys, entries) {
    const values = keys.map(([k]) => score(entries[k]));
    if (values.every(n => n === null)) return null;
    // Workbook SUMPRODUCT treats missing inputs as zero; never renormalize them.
    return keys.reduce((s, row, i) => s + (values[i] || 0) * row[2], 0) / 5;
  }
  function game(a) {
    const e = a.entries || {}, ms = weighted(market,e), ps = weighted(prototype,e);
    const count = [...market,...prototype].filter(([k]) => score(e[k]) !== null).length + (valid(a.quality) ? 1 : 0);
    const completeness = count / 15;
    const final = ms === null || ps === null ? null : ms * .4 + ps * .6;
    const gate = ['PASS','FAIL'].includes(a.gate) ? a.gate : 'PENDING';
    // An absent score block is not a completed zero-point evaluation.
    const recommendation = gate === 'FAIL' ? 'NO-GO' : gate !== 'PASS' ? 'HOLD — Gate pending' : completeness < .8 || final === null ? 'HOLD — Missing data' : final >= 80 ? 'GREENLIGHT' : final >= 65 ? 'TEST MORE' : 'NO-GO';
    return {market:ms,prototype:ps,final,completeness,gate,recommendation};
  }
  /* Fallback Partner compute — CHỈ dùng khi PartnerEval dùng chung (shared.js)
     chưa nạp (vd test Node require riêng file này). Trong trình duyệt shared.js
     luôn nạp trước nên đường chính là PartnerEval.compute ở dưới. Logic sao
     đúng quy tắc PartnerEval: fit làm tròn 1 thập phân ở bước cuối (EPSILON),
     production KHÔNG làm tròn trung gian. */
  function partnerComputeFallback(raw) {
    const scoresIn = (raw && raw.scores) || {};
    const vals = partner.map(([k]) => scoreVal(scoresIn[k]));
    const partnerFit = vals.some(v => v === null) ? null : round(partner.reduce((s, [, , w], i) => s + vals[i] * w, 0) / 5 / 90 * 100);
    const hs = gates.map(([k]) => (raw && raw.hardGate && raw.hardGate[k] && raw.hardGate[k].status) || 'Chưa xác minh');
    const hardGate = hs.includes('Không đạt') ? 'KHÔNG ĐẠT' : hs.every(s => s === 'Đạt') ? 'ĐẠT' : 'CHỜ XÁC MINH';
    let verified = 0, excludedNA = 0;
    partner.forEach(([k]) => { const st = raw && raw.evidence && raw.evidence[k] && normalizeStatus(raw.evidence[k].status); if (st === 'Đã xác minh') verified++; else if (st === 'N/A') excludedNA++; });
    production.forEach(([k]) => { const st = raw && raw.evidence && raw.evidence.productionSubs && raw.evidence.productionSubs[k] && normalizeStatus(raw.evidence.productionSubs[k].status); if (st === 'Đã xác minh') verified++; else if (st === 'N/A') excludedNA++; });
    /* Đồng bộ PartnerEval (shared.js): mục "N/A" loại khỏi mẫu số coverage. */
    const coverageTotal = 11 - excludedNA;
    const pct = coverageTotal > 0 ? round(verified / coverageTotal * 100) : 0;
    const coverage = { verified, total: coverageTotal, totalItems: 11, excludedNA, pct };
    const confidence = pct >= 90 ? 'Cao' : pct >= 60 ? 'Trung bình' : 'Thấp';
    const evidenceGate = pct >= 80 ? 'ĐẠT' : 'CHƯA ĐẠT';
    const classification = partnerFit === null ? null : partnerFit >= 85 ? 'Ưu tiên' : partnerFit >= 75 ? 'Đạt' : partnerFit >= 65 ? 'Có điều kiện' : 'Cần xem xét';
    let conclusion;
    if (hardGate === 'KHÔNG ĐẠT') conclusion = 'Bị chặn';
    else if (hardGate === 'CHỜ XÁC MINH') conclusion = 'Chờ xác minh';
    else if (evidenceGate !== 'ĐẠT') conclusion = 'Thiếu Evidence';
    else conclusion = classification || 'Chưa đủ điểm';
    let strongest = null, weakest = null;
    partner.forEach(([k, label]) => {
      const s = scoreVal(scoresIn[k]);
      if (s === null) return;
      if (!strongest || s > strongest.score) strongest = { key: k, label, score: s };
      if (!weakest || s < weakest.score) weakest = { key: k, label, score: s };
    });
    const scoresOut = Object.fromEntries(partner.map(([k]) => [k, scoreVal(scoresIn[k])]));
    return { hardGate, coverage, confidence, evidenceGate, partnerFit, classification, conclusion, strongest, weakest, dealFit: scoreVal(raw && raw.dealFit), scores: scoresOut, productionScore: scoresOut.production };
  }
  function partnerComputeShared(raw) {
    const PE = (root && root.PartnerEval) || (typeof PartnerEval !== 'undefined' ? PartnerEval : null);
    if (PE && typeof PE.compute === 'function') return PE.compute(raw);
    return partnerComputeFallback(raw);
  }
  /* company(a) — nay là ADAPTER của PartnerEval dùng chung (shared.js):
     map assessment của store Publishing (a.entries/a.gates) sang raw chuẩn
     Partner, gọi PartnerEval.compute, rồi trả về SHAPE CŨ mà publishing.js /
     publishing-bridge.js đang dùng (+ field mới partnerFit/evidenceGate/
     conclusion/coveragePct). Thay đổi hành vi có chủ đích so với bản cũ:
     - Score pillar chỉ cần số hợp lệ 1–5, KHÔNG còn đòi evidence note+source.
     - Production = trung bình 4 ô con (đủ cả 4), KHÔNG làm tròn trung gian —
       đây là gốc lệch 85.0 vs 85.2 của bản cũ (round composite trước khi tính fit).
     - Evidence coverage chỉ đếm status "Đã xác minh" trên 11 mục (7 pillar +
       4 ô con); entry phụ (history/deal/legalEvidence) không thuộc 11 mục.
     - Hard Gate chỉ theo value PASS/FAIL, không còn đòi note+source.
     - (Hợp nhất taxonomy) Trạng thái evidence của entry đi qua NGUYÊN VẸN
       theo thang hợp nhất (kể cả các nấc giữa "Đã trao đổi" / "Đối tác đã
       gửi" / "Chưa rõ" / "N/A") thay vì ép phẳng về "Chưa rõ" như trước;
       nhãn cũ "Partner cung cấp" được normalizeStatus đổi thành
       "Đối tác đã gửi".
     - (A7, chốt 2026-10-29) Evidence của pillar Production: nếu revision
       mang field riêng productionPillarEvidence (migration từ legacy giữ
       lại) — hoặc, dự phòng, entries.production có status — thì dùng ĐÚNG
       status đó làm evidence của pillar, y hệt PartnerEval.compute trên
       c.partnerEval: pillar được đếm 1 lần độc lập với 4 ô con (đã xác
       minh thì +1 vào tử số, "N/A" thì +1 vào số mục loại khỏi mẫu số,
       các nấc khác chỉ nằm trong mẫu số). KHÔNG cộng dồn với kết quả suy
       từ ô con nên không bao giờ đếm trùng. Chỉ khi KHÔNG có field pillar
       nào (đánh giá tạo thẳng ở Publishing, dữ liệu cũ hơn) mới suy từ
       4 ô con như trước: đủ 4 ô "Đã xác minh" -> "Đã xác minh"; đủ 4 ô
       "N/A" -> "N/A" (để mẫu số coverage trừ nhất quán với 4 ô con);
       còn lại "Chưa rõ".
     - Kết quả trả thêm coverageDetail = object coverage nguyên của
       PartnerEval ({verified,total,totalItems,excludedNA,pct}) để các bề
       mặt cần số đếm x/y (one-pager qua partnerEvidenceCounts) dùng đúng
       cùng một kết quả thay vì tự đếm lại; field coverage (0..1) giữ
       nguyên cho các nơi đang dùng. */
  function company(a) {
    const src = a && typeof a === 'object' ? a : {};
    const e = src.entries || {};
    const g = src.gates || {};
    /* B5: điểm entry dạng chuỗi số ("4.5") được ép số như PartnerEval. */
    const directScore = entry => entry ? scoreVal(entry.score) : null;
    const prodScores = production.map(([k]) => directScore(e[k]));
    const productionScore = prodScores.every(n => n !== null) ? prodScores.reduce((s, n) => s + n, 0) / 4 : null;
    const values = Object.fromEntries(partner.map(([k]) => [k, k === 'production' ? productionScore : directScore(e[k])]));
    const hardGateRaw = {};
    gates.forEach(([k]) => {
      let gv = g[k];
      if ((!gv || typeof gv !== 'object') && k === 'continuity' && g.control) gv = g.control;
      const v = gv && gv.value;
      hardGateRaw[k] = { status: v === 'PASS' ? 'Đạt' : v === 'FAIL' ? 'Không đạt' : 'Chưa xác minh', note: String((gv && gv.note) || '') };
    });
    const evStatus = entry => normalizeStatusStrict(entry && entry.status);
    /* A7: field evidence CẤP PILLAR Production, tách khỏi 4 ô con.
       Nguồn ưu tiên: src.productionPillarEvidence (field riêng của revision
       do migration legacyToRevision trong publishing-bridge.js mang theo);
       dự phòng: entries.production khi nó là entry có status. Có field thì
       trạng thái của nó là evidence của pillar — đúng ngữ nghĩa legacy,
       đếm độc lập với 4 ô con ở PartnerEval.compute / fallback. */
    const pillarRaw = (src.productionPillarEvidence && typeof src.productionPillarEvidence === 'object' && !Array.isArray(src.productionPillarEvidence))
      ? src.productionPillarEvidence
      : (e.production && typeof e.production === 'object' && !Array.isArray(e.production) && typeof e.production.status === 'string') ? e.production : null;
    const evidenceRaw = { productionSubs: {} };
    partner.forEach(([k]) => {
      if (k === 'production') {
        if (pillarRaw) {
          evidenceRaw[k] = { status: evStatus(pillarRaw), note: String(pillarRaw.note || '') };
        } else {
          const allVerified = production.every(([sk]) => e[sk] && normalizeStatus(e[sk].status) === 'Đã xác minh');
          const allNA = production.every(([sk]) => e[sk] && normalizeStatus(e[sk].status) === 'N/A');
          evidenceRaw[k] = { status: allVerified ? 'Đã xác minh' : allNA ? 'N/A' : 'Chưa rõ', note: '' };
        }
      } else {
        evidenceRaw[k] = { status: evStatus(e[k]), note: String((e[k] && e[k].note) || '') };
      }
    });
    production.forEach(([k]) => { evidenceRaw.productionSubs[k] = { status: evStatus(e[k]), note: String((e[k] && e[k].note) || '') }; });
    const raw = { hardGate: hardGateRaw, evidence: evidenceRaw, scores: values, dealFit: directScore(e.deal), notesWeak: '', nextAction: '', reviewDate: '', reviewer: '', updatedAt: '' };
    const res = partnerComputeShared(raw);
    const missingSet = new Set();
    partner.forEach(([k]) => { if (values[k] === null || evidenceRaw[k].status !== 'Đã xác minh') missingSet.add(k); });
    production.forEach(([k]) => { if (evidenceRaw.productionSubs[k].status !== 'Đã xác minh') missingSet.add(k); });
    const missing = [...missingSet];
    const partnerFit = res.partnerFit;
    return { total: partnerFit, composite: res.productionScore, values, coverage: res.coverage.pct / 100, coverageDetail: res.coverage, confidence: res.confidence, minimum: res.evidenceGate === 'ĐẠT', missing, hardGate: res.hardGate, classification: res.classification === null ? 'NE — Chưa đủ điểm' : res.classification, recommendation: res.conclusion, dealFit: res.dealFit, partnerFit, evidenceGate: res.evidenceGate, conclusion: res.conclusion, coveragePct: res.coverage.pct };
  }
  /* ---- Market Score TỰ ĐỘNG (pubos-market-v1) — thêm mới, không đổi hàm cũ ----
     Tính thuần từ records theo cấu trúc publishing-data + target (record hoặc id). */
  const marketVersion = 'pubos-market-v1';
  const isNum = n => typeof n === 'number' && Number.isFinite(n);
  function percentileRank(values, value) {
    if (!isNum(value)) return null;
    const validValues = (Array.isArray(values) ? values : []).filter(isNum);
    const N = validValues.length;
    if (N === 0) return null;
    if (N === 1) return 50;
    let countLess = 0, countEq = 0;
    for (const v of validValues) { if (v < value) countLess++; else if (v === value) countEq++; }
    const rank = (countLess + Math.max(0, countEq - 1) / 2) / (N - 1) * 100;
    return Math.min(100, Math.max(0, rank));
  }
  function percentileToScore5(p) {
    if (!isNum(p)) return null;
    return p >= 75 ? 5 : p >= 55 ? 4 : p >= 45 ? 3 : p >= 25 ? 2 : 1;
  }
  function cpiBandFor(rec) {
    const name = String(rec?.name || ''), category = String(rec?.category || '');
    if (category === 'Puzzle' || /puzzle|sort|merge|word|arrow/i.test(name)) return {key:'puzzle',low:10,high:15};
    if (category === 'Simulation' || /tycoon|simulation|strategy|time management|idle/i.test(name)) return {key:'sim',low:4,high:6};
    return null;
  }
  function uaBandScore(cpi, band) {
    if (!isNum(cpi) || !band) return null;
    const {low, high} = band;
    if (cpi >= low && cpi <= high) return 59.9 - 19.9 * (cpi - low) / (high - low);
    if (cpi < low) return cpi <= 0.6 * low ? 100 : 60 + 40 * (low - cpi) / (0.4 * low);
    return cpi >= 2 * high ? 0 : 39.9 * (1 - (cpi - high) / high);
  }
  function marketAuto(records, target) {
    const list = Array.isArray(records) ? records : [];
    const emptyInputs = {downloads:null,revenue:null,dlGrowth3:null,dlGrowth6:null,revGrowth3:null,revGrowth6:null,rpd:null,cpiMedian:null,cpiBand:null};
    const rec = typeof target === 'string' ? list.find(r => r && r.id === target) : (target && typeof target === 'object' ? target : null);
    if (!rec) return {scale:null,growth:null,monetization:null,ua:null,total:null,completeness:0,monetizationBasis:'RPD',inputs:{...emptyInputs},missing:['record']};
    const h = rec.history || {}, c = rec.cpi || {};
    const inputs = {
      downloads: isNum(rec.downloads) ? rec.downloads : null,
      revenue: isNum(rec.revenue) ? rec.revenue : null,
      dlGrowth3: isNum(h.dlGrowth3) ? h.dlGrowth3 : null,
      dlGrowth6: isNum(h.dlGrowth6) ? h.dlGrowth6 : null,
      revGrowth3: isNum(h.revGrowth3) ? h.revGrowth3 : null,
      revGrowth6: isNum(h.revGrowth6) ? h.revGrowth6 : null,
      rpd: isNum(h.rpd) ? h.rpd : null,
      cpiMedian: isNum(c.median) ? c.median : null,
      cpiBand: cpiBandFor(rec),
    };
    const col = fn => list.map(r => { try { return fn(r || {}); } catch { return null; } });
    // Scale /100: percentile có trọng số 40% DL + 60% Rev, chuẩn hoá theo phía có dữ liệu.
    let scale = null;
    {
      const parts = [];
      const pDl = percentileRank(col(r => r.downloads), inputs.downloads);
      const pRev = percentileRank(col(r => r.revenue), inputs.revenue);
      if (pDl !== null) parts.push([pDl, 40]);
      if (pRev !== null) parts.push([pRev, 60]);
      if (parts.length) scale = round(parts.reduce((s, [v, w]) => s + v * w, 0) / parts.reduce((s, [, w]) => s + w, 0));
    }
    // Growth /100: score5 (từ percentile của chính tín hiệu đó) có trọng số; cần ≥2 tín hiệu và đủ 2 phía DL+REV.
    let growth = null;
    {
      const signals = [
        {key:'dlGrowth3', value:inputs.dlGrowth3, w:25, side:'DL', values:col(r => (r.history || {}).dlGrowth3)},
        {key:'dlGrowth6', value:inputs.dlGrowth6, w:15, side:'DL', values:col(r => (r.history || {}).dlGrowth6)},
        {key:'revGrowth3', value:inputs.revGrowth3, w:25, side:'REV', values:col(r => (r.history || {}).revGrowth3)},
        {key:'revGrowth6', value:inputs.revGrowth6, w:15, side:'REV', values:col(r => (r.history || {}).revGrowth6)},
      ].filter(sg => isNum(sg.value));
      const hasDL = signals.some(sg => sg.side === 'DL'), hasREV = signals.some(sg => sg.side === 'REV');
      if (signals.length >= 2 && hasDL && hasREV) {
        const scored = signals.map(sg => ({...sg, s5:percentileToScore5(percentileRank(sg.values, sg.value))})).filter(sg => sg.s5 !== null);
        const wSum = scored.reduce((s, sg) => s + sg.w, 0);
        if (scored.length && wSum > 0) growth = round(scored.reduce((s, sg) => s + sg.s5 * sg.w, 0) / wSum * 20);
      }
    }
    // Monetization /100: CHỈ dựa trên RPD (monetizationBasis='RPD'); data CRM không có grossing share của PubOS.
    const monetization = inputs.rpd === null ? null : round(percentileToScore5(percentileRank(col(r => (r.history || {}).rpd), inputs.rpd)) * 20);
    // UA /100: chấm tuyệt đối theo band CPI (chỉ US).
    const uaRaw = uaBandScore(inputs.cpiMedian, inputs.cpiBand);
    const ua = uaRaw === null ? null : round(uaRaw);
    const components = {scale, growth, monetization, ua};
    const weights = {scale:25, growth:20, monetization:30, ua:25};
    const present = Object.keys(components).filter(k => components[k] !== null);
    const missing = Object.keys(components).filter(k => components[k] === null);
    const total = present.length >= 2 ? round(present.reduce((s, k) => s + components[k] * weights[k], 0) / present.reduce((s, k) => s + weights[k], 0)) : null;
    return {scale, growth, monetization, ua, total, completeness:present.length / 4, monetizationBasis:'RPD', inputs, missing};
  }
  /* ---- Market Score v2 (chuẩn cuối của user, 2026-10-28) ----
     KHÔNG thay đổi hàm cũ ở trên (weighted/game/company/marketAuto giữ nguyên
     hành vi + test cũ). v2 là lớp mới:
     - 8 tiêu chí Market (trọng số ở `market`: 12/12/18/15/14/10/10/9) và
       6 tiêu chí Prototype (20/22/12/15/20/11), điểm 1–5 bước 0.5.
     - Gợi ý tự động theo rubric quartile của file 1: percentile p trong tập
       tham chiếu → p>=75: 5; 60<=p<75: 4; 40<=p<60: 3; 25<=p<40: 2; p<25: 1.
     - Tập tham chiếu percentile: các mechanic CÙNG nhóm genre
       (Puzzle/Simulation) có dữ liệu cho chỉ số đó; nếu nhóm có <4 giá trị
       thì dùng toàn bộ mechanic có dữ liệu.
     - Percentile dùng mid-rank giống percentileRank ở trên (N=1 -> 50).
     - Market/Prototype /100 CHUẨN HOÁ theo trọng số đã chấm:
       score = Σ(s×w) / (5 × Σw_đã_chấm) × 100. Completeness = Σw_đã_chấm/100.
       (Khác hàm weighted() cũ — vốn theo workbook, không chuẩn hoá lại.)
     - Final = 0.4×Market + 0.6×Prototype, chỉ khi có cả hai.
       Nhãn quyết định chỉ áp khi Final có và completeness của CẢ Market lẫn
       Prototype đều >= 80%: >=80 Greenlight, 65–79.9 Test thêm, <65 Chưa đạt.
       Market completeness < 80% -> kèm nhãn "Chưa đủ dữ liệu để kết luận". */
  const marketVersion2 = 'market-v2';
  function quartileScore5(p) {
    if (!isNum(p)) return null;
    return p >= 75 ? 5 : p >= 60 ? 4 : p >= 40 ? 3 : p >= 25 ? 2 : 1;
  }
  // Tập tham chiếu: cùng genre trước; <4 giá trị -> toàn bộ.
  function refValues(records, targetRec, getter) {
    const all = [], same = [];
    for (const r of records || []) {
      let v = null;
      try { v = getter(r || {}); } catch { v = null; }
      if (!isNum(v)) continue;
      all.push(v);
      if (targetRec && r.category === targetRec.category) same.push(v);
    }
    return same.length >= 4 ? {values: same, scope: 'genre'} : {values: all, scope: 'all'};
  }
  function pctInRef(records, targetRec, getter, value, invert) {
    if (!isNum(value)) return null;
    const {values, scope} = refValues(records, targetRec, getter);
    if (!values.length) return null;
    const vs = invert ? values.map(v => -v) : values;
    const p = percentileRank(vs, invert ? -value : value);
    return p === null ? null : {percentile: p, refCount: values.length, refScope: scope};
  }
  const avg = xs => { const v = xs.filter(isNum); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  // Giá trị + cửa sổ dài nhất: ưu tiên 12m, thiếu thì 90d, rồi 30d, cuối cùng daily.
  function longestWindow(rec, kind) {
    const h = rec.history || {};
    const chain = kind === 'dl'
      ? [['dl12', h.dl12], ['dl90', h.dl90], ['dl30', h.dl30]]
      : [['rev12', h.rev12], ['rev90', h.rev90], ['rev30', h.rev30]];
    for (const [w, v] of chain) if (isNum(v)) return {value: v, window: w};
    const daily = kind === 'dl' ? rec.downloads : rec.revenue;
    return isNum(daily) ? {value: daily, window: 'day'} : {value: null, window: null};
  }
  const getDl = r => longestWindow(r, 'dl').value;
  const getRev = r => longestWindow(r, 'rev').value;
  // RPD chỉ lấy cột Revenue_per_Download_SAME_COHORT của tab 02 (history.rpd).
  // Không tự tính revenue/downloads từ snapshot ngày: khác cohort, dễ gây hiểu
  // nhầm là LTV/RPD cùng cohort (đúng giới hạn data đã ghi ở marketAuto).
  const getRpd = r => isNum((r.history || {}).rpd) ? r.history.rpd : null;
  const getConc = r => {
    const e = r.entry || {}, vd = r.verifiedDaily || {};
    if (isNum(e.top3RevConc)) return e.top3RevConc;
    if (isNum(vd.top3RevConc)) return vd.top3RevConc;
    return isNum(r.top3) ? r.top3 : null;
  };
  const getCpi = r => {
    const u = r.uaBenchmark || {}, c = r.cpi || {};
    if (isNum(u.cpiMedian)) return u.cpiMedian;
    return isNum(c.median) ? c.median : null;
  };
  /* Gợi ý điểm cho 5 tiêu chí có dữ liệu; 3 tiêu chí còn lại (economics/rtw/
     whitespace) luôn null = chấm tay. Trả về {key:{score,rawInputs}|null}. */
  function marketSuggest(records, target) {
    const list = Array.isArray(records) ? records : [];
    const rec = typeof target === 'string' ? list.find(r => r && r.id === target) : (target && typeof target === 'object' ? target : null);
    const out = {size: null, growth: null, entry: null, monetization: null, ua: null, economics: null, rtw: null, whitespace: null};
    if (!rec) return out;
    const h = rec.history || {};
    { // Market Size: TB percentile của Downloads và Revenue (cửa sổ dài nhất)
      const dl = longestWindow(rec, 'dl'), rv = longestWindow(rec, 'rev');
      const pDl = pctInRef(list, rec, getDl, dl.value, false);
      const pRv = pctInRef(list, rec, getRev, rv.value, false);
      const p = avg([pDl?.percentile, pRv?.percentile]);
      if (p !== null) out.size = {score: quartileScore5(p), rawInputs: {downloads: dl.value, downloadsWindow: dl.window, revenue: rv.value, revenueWindow: rv.window, percentileDownloads: pDl?.percentile ?? null, percentileRevenue: pRv?.percentile ?? null, percentileAvg: Math.round(p * 10) / 10, refScope: (pDl || pRv).refScope, refCount: (pDl || pRv).refCount}};
    }
    { // Growth: TB percentile các tín hiệu DL/Rev growth 3m/6m có sẵn
      const sig = [['dlGrowth3', h.dlGrowth3], ['dlGrowth6', h.dlGrowth6], ['revGrowth3', h.revGrowth3], ['revGrowth6', h.revGrowth6]]
        .filter(([, v]) => isNum(v));
      if (sig.length) {
        const parts = sig.map(([k, v]) => ({k, v, p: pctInRef(list, rec, r => (r.history || {})[k], v, false)}));
        const p = avg(parts.map(x => x.p?.percentile));
        if (p !== null) out.growth = {score: quartileScore5(p), rawInputs: Object.fromEntries(parts.flatMap(x => [[x.k, x.v], ['percentile_' + x.k, x.p?.percentile ?? null]]).concat([['percentileAvg', Math.round(p * 10) / 10], ['refScope', parts.find(x => x.p)?.p.refScope], ['refCount', parts.find(x => x.p)?.p.refCount]]))};
      }
    }
    { // Entry Accessibility: percentile NGHỊCH ĐẢO của Top3 Rev concentration
      // (concentration càng thấp -> điểm càng cao). Chỉ dùng 1 tín hiệu này.
      const conc = getConc(rec);
      const p = pctInRef(list, rec, getConc, conc, true);
      if (p) out.entry = {score: quartileScore5(p.percentile), rawInputs: {top3RevConc: conc, percentileInverted: p.percentile, refScope: p.refScope, refCount: p.refCount}};
    }
    { // Monetization: percentile của RPD
      const rpd = getRpd(rec);
      const p = pctInRef(list, rec, getRpd, rpd, false);
      if (p) out.monetization = {score: quartileScore5(p.percentile), rawInputs: {rpd, percentile: p.percentile, refScope: p.refScope, refCount: p.refCount}};
    }
    { // UA Scalability: percentile NGHỊCH ĐẢO của CPI median; không CPI -> null
      const cpi = getCpi(rec);
      const p = pctInRef(list, rec, getCpi, cpi, true);
      if (p) out.ua = {score: quartileScore5(p.percentile), rawInputs: {cpiMedian: cpi, percentileInverted: p.percentile, refScope: p.refScope, refCount: p.refCount}};
    }
    return out;
  }
  const validV2 = n => isNum(n) && n >= 1 && n <= 5 && Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;
  function blockScore(keys, entries) {
    let sw = 0, sSum = 0;
    for (const [k, , w] of keys) {
      const s = entries?.[k]?.score;
      if (validV2(s)) { sw += w; sSum += s * w; }
    }
    return {score: sw ? round(sSum / (5 * sw) * 100) : null, completeness: sw / 100, scoredWeight: sw};
  }
  /* assessment: {market:{key:{score,source,rawInputs}}, prototype:{...}}
     Cũng chấp nhận dạng phẳng {entries:{...}} của revision cũ để hiển thị. */
  function gameV2(assessment) {
    const a = assessment || {};
    const mIn = a.market || a.marketScores || {}, pIn = a.prototype || a.prototypeScores || {};
    const flat = a.entries || {};
    const pick = (src, keys) => Object.keys(src).length ? src : Object.fromEntries(keys.map(([k]) => [k, flat[k]]).filter(([, v]) => v && isNum(v.score)).map(([k, v]) => [k, {score: v.score, source: 'manual', rawInputs: null}]));
    const m = blockScore(market, pick(mIn, market));
    const pr = blockScore(prototype, pick(pIn, prototype));
    const final = m.score === null || pr.score === null ? null : round(m.score * 0.4 + pr.score * 0.6);
    const enough = m.completeness >= 0.8 && pr.completeness >= 0.8;
    const decision = final === null ? null : !enough ? null : final >= 80 ? 'Greenlight' : final >= 65 ? 'Test thêm' : 'Chưa đạt';
    return {market: m, prototype: pr, final, decision,
      marketInsufficient: m.completeness < 0.8,
      completenessTotal: (m.scoredWeight + pr.scoredWeight) / 200,
      decisionBlockedReason: final === null ? 'Thiếu Market hoặc Prototype nên chưa tính được Final' : !enough ? 'Completeness của Market/Prototype chưa đạt 80% nên chưa áp nhãn quyết định' : null};
  }
  /* === Định nghĩa DUY NHẤT "có điểm v2" (B3/B6, QA vòng 3) ===
     Áp cho gameV2 wrapper ở mọi bề mặt: publishing-bridge.gameSummary (đợt 1),
     effectiveGameResult trong publishing.js (đợt 2 PHẢI dùng đúng hàm này
     qua PublishingScore.hasValidV2 / v2Candidate, không tự đếm lại):
     - Ứng viên v2 (v2Candidate): input.scoresV2 nếu là object thuần; nếu
       không, chính input khi nó mang block market/prototype (object thuần).
       current{market,prototype} KHÔNG kèm scoresV2 cũng là ứng viên.
       current.entries (khung workbook cũ) KHÔNG phải ứng viên v2.
     - "Có v2" (hasValidV2): ứng viên tồn tại VÀ có ít nhất 1 điểm HỢP LỆ
       theo validV2 (số hữu hạn, 1–5, bước 0.5) trong block market/prototype
       hiệu lực — block rỗng thì lấy từ candidate.entries phẳng (đúng cách
       gameV2 pick). scoresV2 rỗng-không-entries = không có v2; điểm ngoài
       thang / sai bước (3.25, 0, 5.5) hay NaN = không có v2 hợp lệ -> các
       wrapper phải rơi về legacy. */
  const isPlainObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  function v2Candidate(input) {
    if (!isPlainObj(input)) return null;
    if (isPlainObj(input.scoresV2)) return input.scoresV2;
    if (isPlainObj(input.market) || isPlainObj(input.prototype)) return input;
    return null;
  }
  function v2EffectiveBlocks(candidate) {
    const flat = isPlainObj(candidate.entries) ? candidate.entries : {};
    const pick = (src, keys) => {
      if (isPlainObj(src) && Object.keys(src).length) return src;
      return Object.fromEntries(keys.map(([k]) => [k, flat[k]]).filter(([, v]) => isPlainObj(v) && isNum(v.score)));
    };
    return { market: pick(candidate.market, market), prototype: pick(candidate.prototype, prototype) };
  }
  function hasValidV2(input) {
    const c = v2Candidate(input);
    if (!c) return false;
    const b = v2EffectiveBlocks(c);
    return [...Object.values(b.market), ...Object.values(b.prototype)].some(e => isPlainObj(e) && validV2(e.score));
  }
  const api = {market,prototype,partner,production,gates,statuses,scorableStatuses,normalizeStatus,normalizeStatusStrict,valid,evidence,score,game,company,version:'workbook-2026-10-28-v1',marketAuto,marketVersion,percentileRank,percentileToScore5,cpiBandFor,uaBandScore,marketVersion2,quartileScore5,marketSuggest,gameV2,validV2,hasValidV2,v2Candidate};
  root.PublishingScore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
