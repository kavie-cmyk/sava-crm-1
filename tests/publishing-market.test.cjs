const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const F = require('../publishing-score.js');

test('marketVersion is pubos-market-v1', () => {
  assert.equal(F.marketVersion, 'pubos-market-v1');
  assert.equal(typeof F.marketAuto, 'function');
});

test('percentile rank: N=1 -> 50, N=0 -> null, hạng đúng kể cả trùng giá trị', () => {
  assert.equal(F.percentileRank([42], 42), 50);
  assert.equal(F.percentileRank([], 42), null);
  assert.equal(F.percentileRank([10, 20, 30], 10), 0);
  assert.equal(F.percentileRank([10, 20, 30], 20), 50);
  assert.equal(F.percentileRank([10, 20, 30], 30), 100);
  // trùng: (countLess=1 + (2-1)/2) / (4-1) * 100 = 50
  assert.equal(F.percentileRank([10, 20, 20, 30], 20), 50);
  assert.equal(F.percentileRank([10, 20, 30], null), null);
});

test('growth không hợp lệ khi chỉ có phía DL -> null', () => {
  const records = [
    {id:'A', name:'Puzzle A', category:'Puzzle', downloads:100, revenue:100, history:{dlGrowth3:0.5, dlGrowth6:0.2, revGrowth3:null, revGrowth6:null, rpd:5}, cpi:{median:12}},
    {id:'B', name:'Puzzle B', category:'Puzzle', downloads:200, revenue:200, history:{dlGrowth3:0.1, dlGrowth6:0.1, revGrowth3:0.1, revGrowth6:0.1, rpd:10}, cpi:{median:12}},
    {id:'C', name:'Puzzle C', category:'Puzzle', downloads:300, revenue:300, history:{dlGrowth3:0.9, dlGrowth6:0.9, revGrowth3:0.9, revGrowth6:0.9, rpd:15}, cpi:{median:12}},
  ];
  const a = F.marketAuto(records, 'A');
  assert.equal(a.growth, null);
  assert.ok(a.missing.includes('growth'));
  // B có đủ 2 phía + >=2 tín hiệu -> growth có điểm
  assert.notEqual(F.marketAuto(records, 'B').growth, null);
});

test('UA từng đoạn cho band puzzle (low 10, high 15)', () => {
  const mk = cpi => [{id:'X', name:'Puzzle Test', category:'Puzzle', downloads:100, revenue:100, history:{}, cpi:{median:cpi}}];
  // trong band tại low -> 59.9
  assert.equal(F.marketAuto(mk(10), 'X').ua, 59.9);
  // trong band giữa: 59.9 - 19.9*(12-10)/5 = 51.94 -> 51.9
  assert.equal(F.marketAuto(mk(12), 'X').ua, 51.9);
  // dưới 0.6*low (=6) -> 100
  assert.equal(F.marketAuto(mk(5), 'X').ua, 100);
  assert.equal(F.marketAuto(mk(6), 'X').ua, 100);
  // trên 2*high (=30) -> 0
  assert.equal(F.marketAuto(mk(30), 'X').ua, 0);
  assert.equal(F.marketAuto(mk(45), 'X').ua, 0);
});

test('record dạng Simulation thiếu CPI -> ua null và total chuẩn hoá lại đúng tay tính', () => {
  const records = [
    {id:'S1', name:'Tycoon Test', category:'Simulation', downloads:100, revenue:100, history:{rpd:10}, cpi:{}},
    {id:'S2', name:'Other Sim', category:'Simulation', downloads:200, revenue:300, history:{rpd:20}, cpi:{}},
  ];
  const a = F.marketAuto(records, 'S1');
  assert.equal(a.ua, null);
  assert.equal(a.growth, null);
  // Scale: percentile DL = 0, Rev = 0 -> 0. Monetization: RPD rank 0 -> score5 1 -> 20.
  assert.equal(a.scale, 0);
  assert.equal(a.monetization, 20);
  assert.equal(a.monetizationBasis, 'RPD');
  // Total chuẩn hoá trên 2 cấu phần có dữ liệu: (25*0 + 30*20) / (25+30) = 10.909 -> 10.9
  assert.equal(a.total, 10.9);
  assert.equal(a.completeness, 0.5);
  assert.deepEqual(a.inputs.cpiBand, {key:'sim', low:4, high:6});
  assert.equal(a.inputs.cpiMedian, null);
});

test('<2 cấu phần -> total null; không tìm thấy record -> missing record', () => {
  const records = [{id:'O1', name:'Puzzle Solo', category:'Puzzle', downloads:100, revenue:100, history:{}, cpi:{}}];
  const a = F.marketAuto(records, 'O1');
  assert.equal(a.completeness, 0.25); // chỉ Scale
  assert.equal(a.total, null);
  const missing = F.marketAuto(records, 'KHONG-CO');
  assert.equal(missing.total, null);
  assert.deepEqual(missing.missing, ['record']);
});

test('DATA THẬT: MECH-001 Sort / Flow -> ua 100, total có điểm, completeness 1', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'publishing-data.js'), 'utf8');
  const sandbox = {window:{}};
  vm.runInNewContext(code, sandbox);
  const records = sandbox.window.PublishingData.records;
  assert.equal(records.length, 23);
  const rec = records.find(r => r.id === 'MECH-001');
  assert.equal(rec.name, 'Sort / Flow');
  const a = F.marketAuto(records, 'MECH-001');
  assert.equal(a.inputs.cpiMedian, rec.cpi.median);
  assert.ok(Math.abs(a.inputs.cpiMedian - 5.711875541) < 1e-9);
  assert.deepEqual(a.inputs.cpiBand, {key:'puzzle', low:10, high:15});
  assert.equal(a.ua, 100); // CPI 5.71 <= 0.6*10
  assert.notEqual(a.total, null);
  assert.equal(a.completeness, 1);
  assert.equal(a.inputs.downloads, rec.downloads);
  assert.equal(a.inputs.revenue, rec.revenue);
  assert.equal(a.inputs.rpd, rec.history.rpd);
  // target dạng record object cho cùng kết quả
  assert.deepEqual(F.marketAuto(records, rec), a);
});
