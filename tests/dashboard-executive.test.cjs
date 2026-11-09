const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const now = new Date(2026, 10, 9, 12);
const day = (offset, hour = 12) => new Date(2026, 10, 9 + offset, hour).toISOString();
function harness() {
  const S = {
    members: [{ id: 'one', name: 'One', active: true }, { id: 'two', name: 'Two', active: true }],
    companies: [], tasks: [], events: [], games: [],
    leads: [{ id: 'l1', line: 'ai', ownerId: 'two' }],
    deals: [{ id: 'd1', line: 'ai', owner: 'two' }, { id: 'd2', line: 'metaverse', owner: 'one' }],
    activities: [
      { id: 'a1', type: 'Email', who: 'one', lead: 'l1', when: day(-1) },
      { id: 'a2', type: 'Zalo', who: 'two', deal: 'd1', when: day(-6) },
      { id: 'a3', type: 'Messenger', who: 'one', deal: 'd2', when: day(-8) },
      { id: 'a4', type: 'Demo', who: 'one', deal: 'd1', when: day(0, 23) },
      { id: 'a5', type: 'Call', who: 'two', deal: 'd1', when: day(1) },
      { id: 'a6', type: 'Note', who: '', deal: 'd1', when: 'Không rõ ngày' },
    ],
  };
  const ctx = vm.createContext({ console, S, Date, Map, Set, structuredClone, setTimeout, clearTimeout,
    dashPeriodDays: 7, dashScope: '', dashLine: '', dashCustomActive: false,
    dashCustomFrom: '', dashCustomTo: '', query: '', appliedRange: null, renders: 0,
    render() { ctx.renders++; },
  });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx);
  vm.runInContext('function dashActiveRange() { return appliedRange; }', ctx);
  const source = read('index.html');
  const start = source.indexOf('/* Read-only dashboard presentation.');
  const end = source.indexOf('/* Quá hạn tính ĐỘNG:', start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(source.slice(start, end), ctx);
  return { ctx, S, run: code => vm.runInContext(code, ctx), model: () => ctx.dashboardActivityModel(now) };
}
const ids = model => Array.from(model.records, r => r.activity.id);

test('activity period uses occurrence date, includes both boundaries, and excludes future or undated rows', () => {
  const h = harness(), before = JSON.stringify(h.S);
  assert.deepEqual(ids(h.model()), ['a1', 'a2', 'a4']);
  assert.equal(h.model().buckets.length, 7);
  assert.equal(h.model().counts.email, 1);
  assert.equal(h.model().counts.message, 1);
  assert.equal(h.model().counts.meeting, 1);
  assert.equal(h.model().missingDates, 1);
  assert.equal(JSON.stringify(h.S), before, 'reports never mutate CRM records');
});

test('activity actor filter uses who rather than the owner of the linked lead/deal; line filter uses linked records', () => {
  const h = harness();
  h.run("dashScope = 'one'; dashLine = 'ai'");
  assert.deepEqual(ids(h.model()), ['a1', 'a4']);
  h.run("dashScope = 'two'");
  assert.deepEqual(ids(h.model()), ['a2']);
  h.run("dashScope = '__none__'; dashPeriodDays = null");
  assert.deepEqual(ids(h.model()), ['a6']);
  h.run("dashScope = ''; dashLine = 'metaverse'");
  assert.deepEqual(ids(h.model()), ['a3']);
});

test('all-time includes undated totals but chart buckets only contain dated activity; category totals reconcile', () => {
  const h = harness(); h.run('dashPeriodDays = null');
  const model = h.model();
  assert.deepEqual(ids(model), ['a1', 'a2', 'a3', 'a4', 'a6']);
  assert.equal(Object.values(model.counts).reduce((a, n) => a + n, 0), model.records.length);
  const plotted = model.buckets.reduce((a, b) => a + Object.values(b.counts).reduce((c, n) => c + n, 0), 0);
  assert.equal(plotted, 4);
  assert.equal(model.counts.message, 2);
  assert.equal(model.counts.other, 1);
});

test('custom 31-day range stays daily, 32 days groups weekly, and valid local DMY dates parse exactly', () => {
  const h = harness();
  h.run("appliedRange = { from: '2026-10-10', to: '2026-11-09' }");
  assert.equal(h.model().granularity, 'day');
  assert.equal(h.model().buckets.length, 31);
  h.run("appliedRange = { from: '2026-10-09', to: '2026-11-09' }");
  assert.equal(h.model().granularity, 'week');
  assert.equal(h.ctx.dashboardActivityDate({ when: '09-11-2026' }).getDate(), 9);
  assert.equal(h.ctx.dashboardActivityDate({ when: '31-02-2026' }), null);
});

test('empty report and reset remain read-only and restore all dashboard filter axes', () => {
  const h = harness(), before = JSON.stringify(h.S);
  h.run("dashScope = 'unknown'");
  const model = h.model();
  assert.equal(model.records.length, 0);
  assert.equal(model.buckets.length, 7);
  h.run("dashboardMode = 'activity'; dashboardPipeline = 'ai'; dashLine = 'ai'; dashCustomActive = true; dashCustomFrom = '2026-11-01'; dashCustomTo = '2026-11-09'; resetDashboardFilters()");
  assert.equal(h.ctx.dashScope, '');
  assert.equal(h.ctx.dashLine, '');
  assert.equal(h.ctx.dashPeriodDays, 30);
  assert.equal(h.ctx.dashCustomActive, false);
  assert.equal(h.ctx.renders, 1);
  assert.equal(JSON.stringify(h.S), before);
});
