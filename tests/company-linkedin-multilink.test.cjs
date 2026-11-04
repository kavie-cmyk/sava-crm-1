/* Đa-link LinkedIn công ty (đợt 2026-11-04, Zac chốt "giữ đủ link"):
   - Dữ kiện: key phụ linkedinUrls (mảng MỌI URL) trên object công ty, đi
     qua legacy_extra của adapter như các key hồ sơ; linkedinUrl luôn là
     phần tử đầu để các bề mặt đọc 1 link (dedupe/typeahead) không đổi.
   - Drawer công ty, chế độ XEM: mảng >1 -> dòng "LinkedIn công ty" liệt
     kê TỪNG link dạng bấm được; đúng 1 link / không có mảng -> hiển thị
     chữ như cũ (không đổi hành vi của các công ty 1 link).
   - Chế độ SỬA: ô LinkedIn chỉ mang link chính + ghi chú các link còn
     lại được giữ nguyên; Lưu qua applyCompanyProfile đồng bộ phần tử đầu
     của mảng theo link chính, không làm mất link phụ. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const A = require('../supabase-adapter.js');

const KEYS = ['location', 'establishedYear', 'size', 'employees', 'industry', 'website',
  'linkedinUrl', 'parentCompany', 'parentWebsite', 'suborgCount', 'suborgDomains',
  'suborgNames', 'buyingSignals', 'vertical', 'savaOffering', 'bizModel', 'priority'];
const LA = 'https://www.linkedin.com/company/multi-a';
const LB = 'https://www.linkedin.com/company/multi-b';
const LC = 'https://sg.linkedin.com/company/multi-c';
const LS = 'https://www.linkedin.com/company/single-a';

test('adapter: linkedinUrls (mảng) round-trip nguyên vẹn qua legacy_extra, không thành cột row', () => {
  const comp = { id: 'c1', name: 'Multi Co', type: 'Doanh nghiệp', roles: {}, last: '', linkedinUrl: LA, linkedinUrls: [LA, LB, LC] };
  const state = { members: [], companies: [comp], games: [], deals: [], leads: [], tasks: [], activities: [], events: [] };
  const rows = A.crmStateToRows(state);
  const row = rows.companies.find(r => r.id === 'c1');
  assert.equal('linkedinUrls' in row, false, 'row companies không được mang cột linkedinUrls');
  assert.deepEqual(row.legacy_extra.linkedinUrls, [LA, LB, LC]);
  assert.equal(row.legacy_extra.linkedinUrl, LA);
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  const cBack = back.companies.find(c => c.id === 'c1');
  assert.deepEqual(cBack.linkedinUrls, [LA, LB, LC]);
  assert.equal(cBack.linkedinUrl, LA);
});

function loadIndex() {
  const readF = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [
      { id: 'c1', name: 'Multi Link Co', type: 'Doanh nghiệp', roles: {}, last: 'Hôm nay',
        location: 'TP. Hồ Chí Minh', linkedinUrl: LA, linkedinUrls: [LA, LB, LC] },
      { id: 'c2', name: 'Single Link Co', type: 'Doanh nghiệp', roles: {}, last: 'Hôm qua', linkedinUrl: LS },
    ],
    games: [], deals: [], leads: [], tasks: [], activities: [], verticals: [],
  }));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {}, querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null });
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  const listeners = {};
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout, confirm: () => true,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(readF(f), ctx, { filename: f });
  [...readF('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}
function setProfile(getEl, prefix, values) {
  for (const k of KEYS) getEl(prefix + k).value = values[k] !== undefined ? values[k] : '';
}

test('drawer XEM: công ty đa-link liệt kê TỪNG link bấm được; công ty 1 link hiển thị chữ như cũ', () => {
  const { run, getEl } = loadIndex();
  run("openCompany('c1')");
  const multi = getEl('drawer').innerHTML;
  assert.ok(multi.includes('LinkedIn công ty'), 'phải có dòng LinkedIn công ty');
  for (const u of [LA, LB, LC]) assert.ok(multi.includes(`<a href="${u}"`), 'link phải bấm được: ' + u);
  run("openCompany('c2')");
  const single = getEl('drawer').innerHTML;
  assert.ok(single.includes(LS), 'công ty 1 link vẫn hiện URL');
  assert.ok(!single.includes(`<a href="${LS}"`), 'công ty 1 link KHÔNG đổi hành vi: hiện chữ, không thành thẻ a');
});

test('drawer SỬA + Lưu: ghi chú link phụ được giữ; đổi link chính chỉ thay phần tử đầu, không mất link phụ; xoá trắng link chính xoá cả mảng', () => {
  const { run, getEl } = loadIndex();
  run("openCompany('c1'); startCompanyProfileEdit('c1');");
  const edit = getEl('drawer').innerHTML;
  assert.ok(edit.includes('id="cp_linkedinUrl"'), 'chế độ sửa vẫn có ô link chính');
  assert.ok(edit.includes('Công ty có 3 link LinkedIn'), 'chế độ sửa phải ghi chú số link');
  assert.ok(edit.includes(LB) && edit.includes(LC), 'ghi chú phải liệt kê các link còn lại');
  /* Lưu không đụng link chính -> mảng nguyên vẹn */
  setProfile(getEl, 'cp_', { location: 'Hà Nội', linkedinUrl: LA });
  run("persistCompanyProfile('c1')");
  let c = run("S.companies.find(c=>c.id==='c1')");
  assert.equal(c.linkedinUrl, LA);
  assert.deepEqual([...c.linkedinUrls], [LA, LB, LC], 'lưu hồ sơ không được làm mất link phụ');
  /* Đổi link chính -> phần tử đầu thay, link phụ giữ */
  run("startCompanyProfileEdit('c1');");
  setProfile(getEl, 'cp_', { location: 'Hà Nội', linkedinUrl: 'https://www.linkedin.com/company/multi-moi' });
  run("persistCompanyProfile('c1')");
  c = run("S.companies.find(c=>c.id==='c1')");
  assert.deepEqual([...c.linkedinUrls], ['https://www.linkedin.com/company/multi-moi', LB, LC]);
  /* Xoá trắng link chính -> xoá cả mảng */
  run("startCompanyProfileEdit('c1');");
  setProfile(getEl, 'cp_', { location: 'Hà Nội', linkedinUrl: '' });
  run("persistCompanyProfile('c1')");
  c = run("S.companies.find(c=>c.id==='c1')");
  assert.equal('linkedinUrl' in c, false);
  assert.equal('linkedinUrls' in c, false, 'xoá link chính phải xoá cả mảng đa-link');
});
