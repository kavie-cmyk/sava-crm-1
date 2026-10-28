/* Pure scoring rules from the two supplied workbooks. No partner/deal records. */
(function (root) {
  'use strict';
  const market = [['size','Market Size',12],['growth','Growth / Momentum',12],['entry','Entry Accessibility',18],['monetization','Monetization Quality',15],['ua','UA / Creative Scalability',14],['economics','Production Economics',10],['rtw','SAVA Right-to-Win',10],['whitespace','Gamefeel Whitespace',9]];
  const prototype = [['uaTest','UA Test',20],['retention','Retention',22],['engagement','Engagement',12],['monetizationTest','Monetization Test',15],['gamefeel','Gamefeel Test',20],['tech','Tech / Production',11]];
  const partner = [['track','Track Record',10],['team','Năng lực Team',15],['production','Production & Execution',15],['data','Data & Tech',10],['collaboration','Hợp tác',15],['strategy','Strategic Fit',15],['pipeline','Tiềm năng Long-term',10]];
  const production = [['capacity','Production Capacity'],['cadence','Development Cadence'],['milestone','Milestone Reliability'],['liveops','LiveOps Scalability']];
  const gates = [['legal','Pháp lý / Hợp đồng'],['ip','Quyền sở hữu IP / source code'],['conflict','Xung đột Publisher'],['transparency','Minh bạch Data'],['continuity','Tính liên tục của team'],['integrity','Uy tín / Compliance']];
  const statuses = ['Thiếu','Đã trao đổi','Partner cung cấp','Đã xác minh','N/A'];
  const valid = n => typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 5;
  const round = n => Math.round((n + Number.EPSILON) * 10) / 10;
  const evidence = e => !!e && statuses.slice(1,4).includes(e.status) && !!String(e.note || '').trim() && !!String(e.source || '').trim();
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
  function company(a) {
    const e = a.entries || {};
    const prod = production.map(([k]) => score(e[k]));
    const composite = prod.every(n => n !== null) ? round(prod.reduce((s,n) => s+n,0)/4) : null;
    const values = Object.fromEntries(partner.map(([k]) => [k,k === 'production' ? composite : score(e[k])]));
    const total = Object.values(values).every(n => n !== null) ? round(partner.reduce((s,[k,,w]) => s + values[k]*w,0)/5/90*100) : null;
    const gateValues = gates.map(([k]) => a.gates?.[k]?.value);
    const hardGate = gateValues.includes('FAIL') ? 'KHÔNG ĐẠT' : gates.every(([k]) => a.gates?.[k]?.value === 'PASS' && String(a.gates[k].note || '').trim() && String(a.gates[k].source || '').trim()) ? 'ĐẠT' : 'CHỜ XÁC MINH';
    const covered = ['track','team','data','collaboration','deal','strategy','pipeline'].filter(k => evidence(e[k])).length + (production.filter(([k]) => evidence(e[k])).length >= 3 ? 1 : 0);
    const coverage = covered/8;
    const allEvidence = ['track','team',...production.map(([k]) => k),'data','collaboration','history','deal','legalEvidence','strategy','pipeline'].map(k=>e[k]).filter(evidence);
    const verified = allEvidence.filter(x=>x.status === 'Đã xác minh').length;
    const supplied = allEvidence.filter(x=>x.status === 'Partner cung cấp').length;
    const confidence = coverage < .5 ? 'Thấp' : coverage >= .75 && verified / Math.max(1,allEvidence.length) >= .5 ? 'Cao' : (verified + supplied)/Math.max(1,allEvidence.length) >= .5 ? 'Trung bình' : 'Thấp';
    const required = ['team',...production.map(([k])=>k),'data','collaboration','deal'];
    const missing = required.filter(k => !evidence(e[k]));
    const minimum = hardGate === 'ĐẠT' && !missing.length;
    const classification = total === null ? 'NE — Chưa đủ điểm' : total >= 85 ? 'Ưu tiên' : total >= 75 ? 'Đạt' : total >= 65 ? 'Có điều kiện' : 'Cần xem xét';
    const recommendation = hardGate === 'KHÔNG ĐẠT' ? 'Bị chặn' : hardGate !== 'ĐẠT' ? 'Chờ xác minh' : !minimum ? 'Thiếu Evidence' : classification;
    return {total,composite,values,coverage,confidence,minimum,missing,hardGate,classification,recommendation,dealFit:score(e.deal)};
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
  const api = {market,prototype,partner,production,gates,statuses,valid,evidence,score,game,company,version:'workbook-2026-10-28-v1',marketAuto,marketVersion,percentileRank,percentileToScore5,cpiBandFor,uaBandScore};
  root.PublishingScore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
