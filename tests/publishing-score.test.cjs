const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../publishing-score.js');
const e=n=>({score:n,status:'Đã xác minh',note:'Synthetic verification evidence',source:'QA fixture 2026-10-28'});
const fullGame=n=>({entries:Object.fromEntries([...F.market,...F.prototype].map(([k])=>[k,e(n)])),quality:5,gate:'PASS'});
const fullCompany=n=>({entries:Object.fromEntries(['track','team',...F.production.map(([k])=>k),'data','collaboration','deal','strategy','pipeline'].map(k=>[k,e(n)])),gates:Object.fromEntries(F.gates.map(([k])=>[k,{value:'PASS',source:'QA fixture',note:'Synthetic gate verification'}]))});
test('workbook weights and game 40/60 formula',()=>{
 assert.equal(F.market.reduce((s,r)=>s+r[2],0),100);assert.equal(F.prototype.reduce((s,r)=>s+r[2],0),100);
 const a=fullGame(5);assert.equal(F.game(a).final,100);assert.equal(F.game(a).recommendation,'GREENLIGHT');
 F.market.forEach(([k])=>a.entries[k]=e(3));assert.equal(F.game(a).final,84);
});
test('source decision boundaries and gate precedence',()=>{
 const a=fullGame(4);assert.equal(F.game(a).recommendation,'GREENLIGHT');
 a.gate='FAIL';assert.equal(F.game(a).recommendation,'NO-GO');a.gate='PENDING';assert.match(F.game(a).recommendation,/Gate pending/);
 a.gate='PASS';a.entries=Object.fromEntries(F.market.map(([k])=>[k,e(5)]));assert.equal(F.game(a).final,null);assert.match(F.game(a).recommendation,/Missing data/);
 const b=fullGame(3.25);assert.equal(F.game(b).recommendation,'TEST MORE');
 const c=fullGame(3.24);assert.equal(F.game(c).recommendation,'NO-GO');
});
test('missing evidence is NE and never defaults to a neutral score',()=>{
 assert.equal(F.score({score:3,status:'Thiếu',note:'',source:''}),null);
 assert.equal(F.score({score:5,status:'Đã xác minh',note:'',source:'x'}),null);
 const a=fullGame(5);delete a.entries.size;assert.equal(F.game(a).market,88);assert.equal(F.game(a).completeness,14/15);
 assert.equal(F.company({}).total,null);assert.equal(F.company({}).recommendation,'Chờ xác minh');
});
test('partner normalizes seven pillars from weight 90 and excludes Deal Fit',()=>{
 const a=fullCompany(5);assert.equal(F.partner.reduce((s,r)=>s+r[2],0),90);assert.equal(F.company(a).total,100);
 a.entries.deal=e(1);assert.equal(F.company(a).total,100);assert.equal(F.company(a).dealFit,1);
 delete a.entries.deal;assert.equal(F.company(a).total,100);assert.equal(F.company(a).minimum,false);assert.equal(F.company(a).recommendation,'Thiếu Evidence');
});
test('production score requires four groups, coverage only requires three',()=>{
 const a=fullCompany(4);delete a.entries.liveops;const r=F.company(a);
 assert.equal(r.composite,null);assert.equal(r.total,null);assert.equal(r.coverage,1);assert.equal(r.minimum,false);
 a.entries.liveops=e(3);a.entries.capacity=e(4);a.entries.cadence=e(3);a.entries.milestone=e(3);
 assert.equal(F.company(a).composite,3.3);
});
test('six hard gates cannot be compensated by points',()=>{
 const a=fullCompany(5);a.gates.legal.value='FAIL';assert.equal(F.company(a).recommendation,'Bị chặn');
 a.gates.legal.value='PENDING';assert.equal(F.company(a).recommendation,'Chờ xác minh');
 a.gates.legal.value='PASS';a.gates.legal.source='';assert.equal(F.company(a).hardGate,'CHỜ XÁC MINH');
});
test('source Partner Fit classifications and evidence confidence',()=>{
 for(const [n,label] of [[4.25,'Ưu tiên'],[3.75,'Đạt'],[3.25,'Có điều kiện'],[3.24,'Cần xem xét']]) assert.equal(F.company(fullCompany(n)).classification,label);
 assert.equal(F.company(fullCompany(4)).confidence,'Cao');
 const a=fullCompany(4);Object.values(a.entries).forEach(x=>x.status='Đã trao đổi');assert.equal(F.company(a).confidence,'Thấp');
});

/* ---- Market Score v2 (bổ sung 2026-10-28, spec chuẩn cuối của user) ---- */
test('v2 quartile boundaries: 75/60/40/25', () => {
  assert.equal(F.quartileScore5(75), 5); assert.equal(F.quartileScore5(74.9), 4);
  assert.equal(F.quartileScore5(60), 4); assert.equal(F.quartileScore5(59.9), 3);
  assert.equal(F.quartileScore5(40), 3); assert.equal(F.quartileScore5(39.9), 2);
  assert.equal(F.quartileScore5(25), 2); assert.equal(F.quartileScore5(24.9), 1);
  assert.equal(F.quartileScore5(null), null);
  assert.equal(F.validV2(3.5), true); assert.equal(F.validV2(3.25), false); assert.equal(F.validV2(0.5), false);
});
test('v2 normalized Market/Prototype/Final hand-computed fixture', () => {
  const entry = (score, source='manual') => ({score, source, rawInputs:null});
  const a = {market:{size:entry(5),growth:entry(4),entry:entry(3),monetization:entry(5),ua:entry(2)},
             prototype:Object.fromEntries(F.prototype.map(([k])=>[k,entry(4)]))};
  const r = F.gameV2(a);
  // Market: Σsw=265, Σw=71 -> 265/(5*71)*100 = 74.6; completeness 71%
  assert.equal(r.market.score, 74.6); assert.equal(r.market.completeness, 0.71);
  assert.equal(r.marketInsufficient, true);
  assert.equal(r.prototype.score, 80); assert.equal(r.prototype.completeness, 1);
  // Final = 0.4*74.6 + 0.6*80 = 77.8, nhưng completeness Market <80% -> chưa áp nhãn
  assert.equal(r.final, 77.8); assert.equal(r.decision, null);
  assert.match(r.decisionBlockedReason, /80%/);
});
test('v2 decision labels and missing Prototype', () => {
  const entry = s => ({score:s, source:'manual', rawInputs:null});
  const full = s => Object.fromEntries(F.market.map(([k])=>[k,entry(s)]));
  const fullP = s => Object.fromEntries(F.prototype.map(([k])=>[k,entry(s)]));
  assert.equal(F.gameV2({market:full(5),prototype:fullP(5)}).decision, 'Greenlight');
  const mid = F.gameV2({market:full(4),prototype:fullP(3)}); // 80*.4+60*.6=68
  assert.equal(mid.final, 68); assert.equal(mid.decision, 'Test thêm');
  assert.equal(F.gameV2({market:full(3),prototype:fullP(3)}).decision, 'Chưa đạt');
  const noProto = F.gameV2({market:full(5),prototype:{}});
  assert.equal(noProto.final, null); assert.equal(noProto.decision, null);
  assert.match(noProto.decisionBlockedReason, /chưa tính được Final/);
});
