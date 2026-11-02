/* Field liên lạc cá nhân của Lead: email + LinkedIn cá nhân (lead.linkedinUrl).
   - Cả hai key đi qua leads.legacy_extra phía adapter ĐÚNG mẫu lead.phone /
     lead.mainContact: CỐ Ý không nằm trong LEAD_KNOWN, không cột/SQL mới.
     email nạp sẵn trong legacy_extra của lead lô Metaverse (vd 348 lead có
     legacy_extra.email) phải tự hiện ở drawer mà không cần migration nào.
   - linkedinUrl ở LEAD là LinkedIn CÁ NHÂN (cột PIC của file raw) — khác
     linkedinUrl ở COMPANY (LinkedIn công ty, nhãn FIELD_LABELS khác nhau).
   - Form tạo/sửa lead (editLead/saveLead): ô Email (type=email, id e_lemail)
     + ô LinkedIn cá nhân (type=url, id e_llinkedin, placeholder
     linkedin.com/in/...), giá trị lấy từ lead và lưu qua đường save chuẩn
     (data của saveLead) như phone.
   - Drawer lead (openLead): dòng Email + dòng LinkedIn CHỈ hiện khi lead có
     dữ kiện (không hiện dòng rỗng); LinkedIn render qua extLinkHTML (link
     bấm mở được, target=_blank rel=noopener, qua safeHttpUrl).
   - FIELD_LABELS.lead (shared.js): email -> "Email", linkedinUrl ->
     "LinkedIn cá nhân" để lịch sử chỉnh sửa (diffEntity/audit) đọc được. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const A = require('../supabase-adapter.js');

function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}

/* ---------- 1) FIELD_LABELS + audit diff ---------- */

test('shared: FIELD_LABELS.lead có email="Email" + linkedinUrl="LinkedIn cá nhân" (company giữ "LinkedIn công ty")', () => {
  const S = loadShared().window.SavaSys;
  assert.equal(S.FIELD_LABELS.lead.email, 'Email');
  assert.equal(S.FIELD_LABELS.lead.linkedinUrl, 'LinkedIn cá nhân');
  assert.equal(S.FIELD_LABELS.company.linkedinUrl, 'LinkedIn công ty', 'nhãn linkedinUrl của company không được đổi');
  assert.equal(S.FIELD_LABELS.lead.phone, 'Điện thoại', 'nhãn phone giữ nguyên');
});

test('shared: diffEntity cho thay đổi email/linkedinUrl sinh change đúng nhãn', () => {
  const ctx = loadShared(), S = ctx.window.SavaSys;
  const st = { members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [] };
  const before = { id: 'l1', name: 'Tran Van X', company: '', person: '', line: 'metaverse', email: '', linkedinUrl: '' };
  const after = Object.assign({}, before, { email: 'x@congty.vn', linkedinUrl: 'https://www.linkedin.com/in/tran-van-x/' });
  const changes = S.diffEntity(st, 'lead', before, after);
  const byField = Object.fromEntries(changes.map(c => [c.field, c]));
  assert.equal(byField.email.label, 'Email'); assert.equal(byField.email.to, 'x@congty.vn');
  assert.equal(byField.linkedinUrl.label, 'LinkedIn cá nhân'); assert.equal(byField.linkedinUrl.to, 'https://www.linkedin.com/in/tran-van-x/');
});

/* ---------- 2) Adapter: round-trip qua legacy_extra như phone ---------- */

test('adapter: lead.email + lead.linkedinUrl đi qua legacy_extra của leads và quay lại nguyên vẹn (không cột riêng)', () => {
  const s = { members: [], companies: [], games: [], deals: [], tasks: [], activities: [],
    leads: [{ id: 'l1', name: 'Người A', company: '', person: 'CEO', line: 'metaverse', source: '', status: 'new', note: '', when: '2026-11-02',
              phone: '0901', email: 'a@congty.vn', linkedinUrl: 'https://www.linkedin.com/in/nguoi-a/' }] };
  const rows = A.crmStateToRows(s);
  assert.equal(rows.leads.length, 1);
  assert.equal(rows.leads[0].legacy_extra.email, 'a@congty.vn', 'email phải nằm trong legacy_extra khi ghi');
  assert.equal(rows.leads[0].legacy_extra.linkedinUrl, 'https://www.linkedin.com/in/nguoi-a/', 'linkedinUrl phải nằm trong legacy_extra khi ghi');
  assert.equal(rows.leads[0].legacy_extra.phone, '0901', 'phone vẫn qua legacy_extra như cũ');
  assert.ok(!('email' in rows.leads[0]) && !('linkedinUrl' in rows.leads[0]), 'không được sinh cột email/linkedinUrl riêng trên row leads');
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  assert.equal(back.leads[0].email, 'a@congty.vn', 'đọc lại phải khôi phục lead.email từ legacy_extra');
  assert.equal(back.leads[0].linkedinUrl, 'https://www.linkedin.com/in/nguoi-a/', 'đọc lại phải khôi phục lead.linkedinUrl từ legacy_extra');
});

test('tĩnh adapter: LEAD_KNOWN không chứa email/linkedinUrl (cố ý, như phone/mainContact)', () => {
  const src = read('supabase-adapter.js');
  const m = src.match(/const LEAD_KNOWN = \[([^\]]*)\]/);
  assert.ok(m, 'phải tìm thấy LEAD_KNOWN');
  assert.ok(!m[1].includes("'email'") && !m[1].includes("'linkedinUrl'"), 'email/linkedinUrl không được vào LEAD_KNOWN khi chưa có cột thật');
  assert.ok(!m[1].includes("'phone'") && !m[1].includes("'mainContact'"), 'bất biến cũ: phone/mainContact cũng ngoài LEAD_KNOWN');
});

/* ---------- 3) Tĩnh: form + saveLead + drawer trong index.html ---------- */

test('tĩnh index: form lead có ô Email (type=email) + LinkedIn cá nhân (type=url, placeholder linkedin.com/in/...); saveLead lưu 2 key qua data chuẩn', () => {
  const html = read('index.html');
  assert.ok(html.includes('field("Email", `<input id="e_lemail" type="email" value="${esc(l.email || "")}"'), 'form phải có field Email type=email lấy giá trị l.email');
  assert.ok(html.includes('field("LinkedIn cá nhân", `<input id="e_llinkedin" type="url" value="${esc(l.linkedinUrl || "")}" placeholder="https://www.linkedin.com/in/...">`)'), 'form phải có field LinkedIn cá nhân type=url + placeholder linkedin.com/in/...');
  assert.ok(html.includes('email: v("e_lemail"), linkedinUrl: v("e_llinkedin")'), 'saveLead phải đưa email + linkedinUrl vào data như phone');
  assert.ok(html.includes('email: "", linkedinUrl: ""'), 'lead mới mặc định email/linkedinUrl rỗng');
});

test('tĩnh index: drawer lead hiện Email + LinkedIn có điều kiện (không dòng rỗng), LinkedIn qua extLinkHTML', () => {
  const html = read('index.html');
  assert.ok(html.includes('${l.email ? `<div class="k">Email</div><div>${esc(l.email)}</div>` : ""}'), 'dòng Email chỉ hiện khi có email');
  assert.ok(html.includes('${l.linkedinUrl ? `<div class="k">LinkedIn</div><div>${extLinkHTML(l.linkedinUrl)}</div>` : ""}'), 'dòng LinkedIn chỉ hiện khi có linkedinUrl, render bằng extLinkHTML (target _blank + rel an toàn)');
});

/* ---------- 4) Hành vi thật qua harness index.html ---------- */

function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [{ id: 'c1', name: 'Cong Ty Mot', type: 'Doanh nghiệp', roles: { metaverse: 'Khách hàng' }, last: 'Hôm nay' }],
    games: [], deals: [],
    leads: [
      /* Mẫu kiểu lead lô Metaverse sau adapter: email/linkedinUrl là field
         phẳng trên object lead (mergeExtras khôi phục từ legacy_extra). */
      { id: 'lFull', name: 'Tran Van X', company: 'c1', person: 'Chief Executive Officer', phone: '0901', email: 'x@congty.vn', linkedinUrl: 'https://www.linkedin.com/in/tran-van-x/', line: 'metaverse', source: 'Sự kiện', status: 'new', note: '', when: '2026-11-02', mainContact: false },
      { id: 'lBare', name: 'Ba Re', company: 'c1', person: '', phone: '', line: 'metaverse', source: '', status: 'new', note: '', when: '2026-11-02', mainContact: false },
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

test('drawer lead: lead có email + linkedinUrl (kiểu lô Metaverse) hiện đủ 2 dòng, LinkedIn là link mở tab mới; lead không có thì không hiện dòng rỗng', () => {
  const { run, getEl } = loadIndex();
  run("openLead('lFull')");
  const d = getEl('drawer').innerHTML;
  assert.ok(d.includes('<div class="k">Email</div><div>x@congty.vn</div>'), 'drawer phải hiện Email từ dữ kiện có sẵn của lead');
  assert.ok(d.includes('<div class="k">LinkedIn</div><div><a href="https://www.linkedin.com/in/tran-van-x/" target="_blank" rel="noopener">'), 'LinkedIn phải là link bấm mở được (target _blank, rel noopener)');
  run("openLead('lBare')");
  const d2 = getEl('drawer').innerHTML;
  assert.ok(!d2.includes('<div class="k">Email</div>'), 'lead không email -> không hiện dòng Email');
  assert.ok(!d2.includes('<div class="k">LinkedIn</div>'), 'lead không linkedinUrl -> không hiện dòng LinkedIn');
});

test('form sửa lead: ô Email + LinkedIn cá nhân được điền sẵn giá trị hiện có của lead', () => {
  const { run, getEl } = loadIndex();
  run("editLead('lFull')");
  const box = getEl('editBox').innerHTML;
  assert.ok(box.includes('<label>Email</label><input id="e_lemail" type="email" value="x@congty.vn"'), 'form phải điền sẵn email hiện có');
  assert.ok(box.includes('<label>LinkedIn cá nhân</label><input id="e_llinkedin" type="url" value="https://www.linkedin.com/in/tran-van-x/" placeholder="https://www.linkedin.com/in/..."'), 'form phải điền sẵn linkedinUrl hiện có + placeholder đúng mẫu');
});
