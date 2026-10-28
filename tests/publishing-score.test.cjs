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
