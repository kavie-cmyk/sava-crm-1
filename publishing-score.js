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
  const api = {market,prototype,partner,production,gates,statuses,valid,evidence,score,game,company,version:'workbook-2026-10-28-v1'};
  root.PublishingScore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
