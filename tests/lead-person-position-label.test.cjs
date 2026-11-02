/* Nhãn hiển thị của field lead.person = "Position" (chốt nghiệp vụ sau đợt
   nạp Metaverse: person chứa CHỨC VỤ của lead — cột Title trong file raw,
   vd "Chief Executive Officer", "General Manager - ITM" — nhãn cũ
   "Người đầu mối" sai nghĩa dữ kiện).
   - Đổi THUẦN nhãn user-facing ở 3 bề mặt: FIELD_LABELS.lead.person
     (shared.js — nhãn lịch sử chỉnh sửa cho mục ghi TỪ NAY), dòng kv trong
     drawer lead (index.html openLead), field trong form tạo/sửa lead
     (index.html editLead, kèm placeholder ví dụ thuần chức vụ).
   - Key nội bộ `person` GIỮ NGUYÊN (adapter/schema/dữ kiện không đụng).
   - Khái niệm "Đầu mối chính" (lead.mainContact, MAIN_CONTACT_LABEL
     "★ Đầu mối chính", checkbox trong form lead) KHÔNG liên quan và
     KHÔNG đổi một chữ — các test dưới khoá cứng bất biến đó.
   - Bề mặt hiện person KHÔNG kèm nhãn (leadMini, companyLeadsHTML,
     dealLeadMiniHTML qua leadPersonShown, leadLabel, hàng bảng lead,
     khối lead phía publishing.js) giữ nguyên cách hiện; dedupe
     name≈person (leadPersonShown) vẫn chạy như cũ. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}

/* ---------- 1) FIELD_LABELS + audit diff (mục lịch sử TỪ NAY) ---------- */

test('shared: FIELD_LABELS.lead.person = "Position"; mainContact vẫn "Đầu mối chính"', () => {
  const S = loadShared().window.SavaSys;
  assert.equal(S.FIELD_LABELS.lead.person, 'Position');
  assert.equal(S.FIELD_LABELS.lead.mainContact, 'Đầu mối chính', 'nhãn mainContact trong FIELD_LABELS không được đổi');
});

test('shared: diffEntity cho thay đổi person sinh change với nhãn "Position" (key vẫn là person)', () => {
  const ctx = loadShared(), S = ctx.window.SavaSys;
  const st = { members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [] };
  const before = { id: 'l1', name: 'Tran Van X', company: '', person: 'Manager', line: 'metaverse' };
  const after = Object.assign({}, before, { person: 'Chief Executive Officer' });
  const changes = S.diffEntity(st, 'lead', before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].field, 'person', 'key nội bộ giữ nguyên');
  assert.equal(changes[0].label, 'Position', 'nhãn lịch sử cho mục ghi từ nay phải là Position');
  assert.equal(changes[0].from, 'Manager'); assert.equal(changes[0].to, 'Chief Executive Officer');
});

/* ---------- 2) Tĩnh: 2 bề mặt nhãn trong index.html + bất biến mainContact ---------- */

test('tĩnh index: drawer + form lead dùng nhãn "Position" cho person; hết nhãn cũ gắn với person', () => {
  const html = read('index.html');
  assert.ok(html.includes('<div class="k">Position</div><div>${esc(l.person || "—")}</div>'), 'drawer lead phải hiện "Position: <giá trị person>"');
  assert.ok(html.includes('${field("Position", txt("e_lperson"'), 'form lead phải dùng field("Position", txt("e_lperson"...))');
  assert.ok(html.includes('placeholder="VD: Chief Executive Officer"') || html.includes('"VD: Chief Executive Officer"'), 'placeholder của e_lperson phải là ví dụ thuần chức vụ');
  assert.ok(!html.includes('<div class="k">Người đầu mối</div>'), 'drawer không còn nhãn cũ cho person');
  assert.ok(!html.includes('field("Người đầu mối", txt("e_lperson"'), 'form không còn nhãn cũ cho person');
  /* Bất biến mainContact: checkbox + badge giữ nguyên từng chữ */
  assert.ok(html.includes('Đầu mối chính của công ty (mỗi công ty chỉ có một'), 'checkbox Đầu mối chính trong form lead giữ nguyên');
});

test('tĩnh shared: MAIN_CONTACT_LABEL vẫn là "★ Đầu mối chính"', () => {
  assert.ok(read('shared.js').includes('const MAIN_CONTACT_LABEL = "★ Đầu mối chính";'));
});

/* ---------- 3) Hành vi thật qua harness index.html ---------- */

function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [{ id: 'c1', name: 'Cong Ty Mot', type: 'Doanh nghiệp', roles: { metaverse: 'Khách hàng' }, last: 'Hôm nay' }],
    games: [], deals: [],
    leads: [
      { id: 'lMeta', name: 'Tran Van X', company: 'c1', person: 'Chief Executive Officer', phone: '', line: 'metaverse', source: 'Sự kiện', status: 'new', note: '', when: '2026-11-02', mainContact: false },
      { id: 'lMrB', name: 'Mr. B', company: 'c1', person: 'Mr.B', phone: '0901', line: 'metaverse', source: '', status: 'new', note: '', when: '2026-11-02', mainContact: true },
    ],
    tasks: [], activities: [],
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
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}

test('drawer lead (lô Metaverse): hiện "Position: Chief Executive Officer" đúng nghĩa; badge main giữ nguyên', () => {
  const { run, getEl } = loadIndex();
  run("openLead('lMeta')");
  const d = getEl('drawer').innerHTML;
  assert.ok(d.includes('<div class="k">Position</div><div>Chief Executive Officer</div>'), 'drawer phải hiện Position + chức vụ thật');
  assert.ok(!d.includes('Người đầu mối'), 'drawer không còn nhãn cũ');
  assert.ok(!d.includes('★ Đầu mối chính'), 'lead không main -> không badge');
  run("openLead('lMrB')");
  const d2 = getEl('drawer').innerHTML;
  assert.ok(d2.includes('★ Đầu mối chính'), 'lead main vẫn có badge ★ Đầu mối chính nguyên vẹn');
  assert.ok(d2.includes('<div class="k">Position</div><div>Mr.B</div>'), 'lead cũ person≈tên vẫn hiện nguyên giá trị ở dòng kv Position (kv không dedupe như cũ)');
});

test('form sửa lead: nhãn field person là "Position", checkbox Đầu mối chính nguyên vẹn', () => {
  const { run, getEl } = loadIndex();
  run("editLead('lMeta')");
  const box = getEl('editBox').innerHTML;
  assert.ok(box.includes('<label>Position</label><input id="e_lperson" value="Chief Executive Officer"'), 'form phải hiện <label>Position</label> + input e_lperson giữ giá trị chức vụ');
  assert.ok(!box.includes('<label>Người đầu mối</label>'), 'form không còn nhãn cũ');
  assert.ok(box.includes('Đầu mối chính của công ty'), 'checkbox mainContact giữ nguyên nhãn');
});

test('dedupe name≈person vẫn chạy sau đổi nhãn (leadPersonShown + dealLeadMiniHTML + leadMini)', () => {
  const { run } = loadIndex();
  assert.equal(run("leadPersonShown({name:'Mr. B', person:'Mr.B'})"), '', 'person gần trùng tên -> ẩn như cũ');
  assert.equal(run("leadPersonShown({name:'Tran Van X', person:'Chief Executive Officer'})"), 'Chief Executive Officer', 'chức vụ khác hẳn tên -> hiện như cũ');
  const mini = run("dealLeadMiniHTML(S.leads.find(l=>l.id==='lMrB'), 'c1')");
  assert.ok(!mini.includes('👤'), 'thẻ deal của Mr. B không lặp person gần trùng tên');
  const meta = run("leadMini(S.leads.find(l=>l.id==='lMeta'))");
  assert.ok(meta.includes('👤 Chief Executive Officer'), 'leadMini (không nhãn) vẫn hiện chức vụ sau tên như cũ');
});
