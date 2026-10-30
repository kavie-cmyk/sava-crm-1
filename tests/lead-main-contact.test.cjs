/* Tick "Đầu mối chính" cho Lead (lead.mainContact):
   - Field boolean trên lead, đi qua leads.legacy_extra phía adapter như
     lead.phone (không cột/SQL mới).
   - Quy tắc radio MỘT công ty — MỘT main, thực thi ở tầng dữ liệu bằng
     enforceLeadMainContact (shared.js), được saveLead (index.html) gọi
     trên đúng đường lưu lead hiện có: tick B -> A (cùng công ty) tự bỏ
     tick; bỏ tick -> công ty không có main (hợp lệ); công ty khác không
     bị ảnh hưởng.
   - Hiển thị MỘT kiểu duy nhất "★ Đầu mối chính" (MAIN_CONTACT_LABEL /
     mainContactBadgeHTML trong shared.js): danh sách Lead, leadMini
     (khối lead trong drawer công ty + drawer deal), drawer lead,
     one-pager Partner, dòng đầu mối công ty (companyLeadsHTML), ô chọn
     lead gắn vào deal, và khối lead phía đánh giá trong publishing.js
     (dạng text qua hằng MAIN_CONTACT_LABEL — publishing.js KHÔNG chứa
     chuỗi literal "Đầu mối chính", giữ bất biến tĩnh của đợt bỏ field
     đầu mối cấp công ty).
   - Liên kết migration phần 1: lead do migration đầu-mối-cũ tạo ra có
     mainContact = true, TRỪ KHI công ty đã có main khác (không giành);
     công ty có sẵn lead không qua migration -> không tự đoán main.
   Fixture nằm trong file test này — seed production vẫn là emptyState. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const LABEL = '★ Đầu mối chính';

/* ---------- Harness shared.js THẬT (vm + localStorage stub) ---------- */
function loadShared() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const ctx = vm.createContext({ console, localStorage: ls, addEventListener: () => {} });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return { ctx, ls, store };
}
const base = over => Object.assign({ members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], verticals: [] }, over || {});
const lead = over => Object.assign({ id: 'lx', name: 'Lead X', company: 'c1', person: '', phone: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-10-01' }, over || {});

/* ---------- Hằng + helper ở shared.js ---------- */
test('shared: MAIN_CONTACT_LABEL đúng chuỗi "★ Đầu mối chính"; badge HTML chỉ hiện khi mainContact', () => {
  const { ctx } = loadShared();
  assert.equal(vm.runInContext('MAIN_CONTACT_LABEL', ctx), LABEL, 'const ở shared.js đọc qua lexical scope của context');
  assert.equal(ctx.mainContactBadgeHTML({ mainContact: true }), ` <span class="chip" style="background:#d97706">${LABEL}</span>`);
  assert.equal(ctx.mainContactBadgeHTML({ mainContact: false }), '');
  assert.equal(ctx.mainContactBadgeHTML({}), '');
  assert.equal(ctx.mainContactBadgeHTML(null), '');
});

/* ---------- Radio ở tầng dữ liệu: enforceLeadMainContact ---------- */
test('radio: tick B làm main -> A (cùng công ty) tự bỏ tick; C (công ty khác) giữ nguyên main', () => {
  const { ctx } = loadShared();
  const leads = [
    lead({ id: 'lA', company: 'c1', mainContact: true }),
    lead({ id: 'lB', company: 'c1', mainContact: false }),
    lead({ id: 'lC', company: 'c2', mainContact: true }),
  ];
  leads[1].mainContact = true; /* hành động tick ở form */
  ctx.enforceLeadMainContact(leads, leads[1]);
  assert.equal(leads[0].mainContact, false, 'A cùng công ty phải tự bỏ tick');
  assert.equal(leads[1].mainContact, true, 'B là main mới');
  assert.equal(leads[2].mainContact, true, 'C ở công ty khác tuyệt đối không bị ảnh hưởng');
  assert.equal(leads.filter(l => l.company === 'c1' && l.mainContact).length, 1, 'công ty c1 còn đúng 1 main');
});

test('radio: bỏ tick main -> công ty không còn main, không lỗi, không ai bị đụng', () => {
  const { ctx } = loadShared();
  const leads = [
    lead({ id: 'lA', company: 'c1', mainContact: false }), /* vừa bỏ tick */
    lead({ id: 'lB', company: 'c1', mainContact: false }),
    lead({ id: 'lC', company: 'c2', mainContact: true }),
  ];
  ctx.enforceLeadMainContact(leads, leads[0]); /* mainContact=false -> no-op */
  assert.equal(leads.filter(l => l.company === 'c1' && l.mainContact).length, 0, 'công ty tạm không có main là hợp lệ');
  assert.equal(leads[2].mainContact, true);
});

test('radio: lead chưa gắn công ty (company rỗng) tick main không radio với ai', () => {
  const { ctx } = loadShared();
  const leads = [
    lead({ id: 'lA', company: '', mainContact: true }),
    lead({ id: 'lB', company: '', mainContact: false }),
  ];
  leads[1].mainContact = true;
  ctx.enforceLeadMainContact(leads, leads[1]);
  assert.equal(leads[0].mainContact, true, 'không cùng công ty nào -> không bỏ tick lẫn nhau');
  ctx.enforceLeadMainContact(null, leads[0]); /* guard kiểu lạ không ném lỗi */
  ctx.enforceLeadMainContact(leads, null);
});

/* ---------- Lưu / tải lại giữ đúng mainContact ---------- */
test('lưu/tải lại: state có mainContact sống qua loadState (localStorage) nguyên vẹn', () => {
  const { ctx, ls } = loadShared();
  const s = base({ leads: [lead({ id: 'lA', mainContact: true }), lead({ id: 'lB', mainContact: false })] });
  ls.setItem('sava_crm_shared_v1', JSON.stringify(s));
  const back = ctx.loadState();
  assert.equal(back.leads.find(l => l.id === 'lA').mainContact, true);
  assert.equal(back.leads.find(l => l.id === 'lB').mainContact, false);
});

/* ---------- Adapter round-trip qua legacy_extra ---------- */
test('adapter: mainContact round-trip qua leads.legacy_extra (true + false), không cần cột/SQL', () => {
  const A = require('../supabase-adapter.js');
  const s = base({
    companies: [{ id: 'c1', name: 'Acme', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, last: '' }],
    leads: [lead({ id: 'lA', mainContact: true }), lead({ id: 'lB', mainContact: false }), lead({ id: 'lC' })],
  });
  const rows = A.crmStateToRows(s);
  assert.equal(rows.leads[0].legacy_extra.mainContact, true, 'mainContact=true phải đi qua legacy_extra');
  assert.equal(rows.leads[1].legacy_extra.mainContact, false, 'mainContact=false cũng phải giữ qua legacy_extra (không bị rơi)');
  assert.ok(!('mainContact' in rows.leads[2].legacy_extra), 'lead không có field thì không sinh khóa thừa');
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  assert.equal(back.leads.find(l => l.id === 'lA').mainContact, true);
  assert.equal(back.leads.find(l => l.id === 'lB').mainContact, false);
  assert.equal(back.leads.find(l => l.id === 'lC').mainContact, undefined);
});

/* ---------- Migration phần 1 + mainContact ---------- */
test('migration: lead tạo từ đầu mối cũ tự có mainContact = true', () => {
  const { ctx } = loadShared();
  const s = base({ companies: [{ id: 'c1', name: 'Acme', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, contact: 'Nguyễn Văn A — CEO', phone: '0901', last: '' }] });
  const out = ctx.migrateState(s);
  assert.equal(out.leads.length, 1);
  assert.equal(out.leads[0].mainContact, true, 'lead sinh ra từ đầu mối cũ vốn là đầu mối chính');
});

test('migration: công ty đã có main khác -> lead migrate KHÔNG giành main', () => {
  const { ctx } = loadShared();
  const s = base({
    companies: [{ id: 'c1', name: 'Acme', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, contact: 'Đầu Mối Cũ', phone: '', last: '' }],
    leads: [lead({ id: 'lMain', name: 'Main Hiện Hữu', company: 'c1', mainContact: true })],
  });
  const out = ctx.migrateState(s);
  const created = out.leads.find(l => l.name === 'Đầu Mối Cũ');
  assert.ok(created, 'đầu mối cũ chưa có lead tương ứng vẫn được tạo lead');
  assert.equal(created.mainContact, false, 'đã có main rồi -> lead migrate không được giành');
  assert.equal(out.leads.find(l => l.id === 'lMain').mainContact, true, 'main hiện hữu giữ nguyên');
  assert.equal(out.leads.filter(l => l.company === 'c1' && l.mainContact).length, 1);
});

test('migration: công ty có sẵn lead (không main) + đầu mối cũ -> lead migrate là main, lead cũ không bị đoán main', () => {
  const { ctx } = loadShared();
  const s = base({
    companies: [{ id: 'c1', name: 'Acme', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, contact: 'Đầu Mối Cũ', phone: '', last: '' }],
    leads: [lead({ id: 'lOld', name: 'Lead Có Sẵn', company: 'c1' })],
  });
  const out = ctx.migrateState(s);
  assert.equal(out.leads.find(l => l.name === 'Đầu Mối Cũ').mainContact, true);
  assert.equal(out.leads.find(l => l.id === 'lOld').mainContact, undefined, 'lead có sẵn không qua migration -> không tự gắn main');
});

test('migration: công ty KHÔNG có đầu mối cũ -> không tạo lead, không đoán main cho lead có sẵn; idempotent giữ 1 main', () => {
  const { ctx } = loadShared();
  let s = base({
    companies: [
      { id: 'c1', name: 'Không field cũ', type: 'Đối tác', roles: {}, last: '' },
      { id: 'c2', name: 'Có đầu mối', type: 'Đối tác', roles: { publishing: 'Game studio' }, contact: 'Chị B', phone: '', last: '' },
    ],
    leads: [lead({ id: 'lOld', name: 'Lead Có Sẵn', company: 'c1' }), lead({ id: 'lOld2', name: 'Lead Khác', company: 'c1' })],
  });
  s = ctx.migrateState(s);
  assert.equal(s.leads.filter(l => l.company === 'c1').length, 2, 'không tạo lead khi không có đầu mối cũ');
  assert.ok(s.leads.filter(l => l.company === 'c1').every(l => !l.mainContact), 'nhiều lead có sẵn -> để trống cho user tick, không đoán');
  assert.equal(s.leads.find(l => l.company === 'c2').mainContact, true);
  s = ctx.migrateState(JSON.parse(JSON.stringify(s)));
  s = ctx.migrateState(JSON.parse(JSON.stringify(s)));
  assert.equal(s.leads.filter(l => l.company === 'c2' && l.mainContact).length, 1, 'chạy lại migration không nhân bản/không đổi main');
  assert.equal(s.leads.length, 3);
});

/* ---------- Harness index.html THẬT ---------- */
function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }],
    companies: [
      { id: 'c1', name: 'Công ty Một', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hôm qua' },
      { id: 'c2', name: 'Công ty Hai', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, last: 'Hôm nay' },
    ],
    games: [],
    deals: [{ id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', game: '', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] }],
    leads: [
      { id: 'lA', name: 'Người A', company: 'c1', person: 'Anh A — CEO', phone: '0901', line: 'publishing', source: 'Giới thiệu', status: 'new', note: '', when: '2026-10-01', mainContact: true },
      { id: 'lB', name: 'Người B', company: 'c1', person: 'Chị B — CTO', phone: '0902', line: 'publishing', source: 'Giới thiệu', status: 'new', note: '', when: '2026-10-02', mainContact: false },
      { id: 'lC', name: 'Người C', company: 'c2', person: '', phone: '', line: 'ai', source: '', status: 'new', note: '', when: '2026-10-03', mainContact: true },
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
/* Điền form lead như user gõ: editLead chỉ dựng HTML, harness không parse
   HTML thành element nên set value/checked trực tiếp lên stub. */
function fillLeadForm(getEl, over) {
  const vals = Object.assign({ e_lname: 'Người B', e_lcompany: 'c1', e_lperson: 'Chị B — CTO', e_lphone: '0902', e_lline: 'publishing', e_lsource: 'Giới thiệu', e_lstatus: 'new', e_lwhen: '', e_lnote: '' }, over || {});
  for (const [k, v] of Object.entries(vals)) getEl(k).value = v;
}

test('index: danh sách Lead + leadMini + drawer công ty hiện thẻ ★ Đầu mối chính đúng lead main', () => {
  const { run, getEl } = loadIndex();
  run('curView = "leads"; curLine = "all"; render();');
  const view = getEl('view').innerHTML;
  assert.equal(view.split(LABEL).length - 1, 2, 'danh sách Lead: đúng 2 lead main (lA + lC) có thẻ');
  assert.ok(run("leadMini(S.leads.find(l=>l.id==='lA'))").includes(LABEL), 'leadMini của main phải có thẻ');
  assert.ok(!run("leadMini(S.leads.find(l=>l.id==='lB'))").includes(LABEL), 'leadMini của lead thường không có thẻ');
  run("openCompany('c1')");
  const drawer = getEl('drawer').innerHTML;
  assert.equal(drawer.split(LABEL).length - 1, 1, 'khối lead trong drawer công ty c1: chỉ lA có thẻ');
  run("openLead('lA')");
  assert.ok(getEl('drawer').innerHTML.includes(LABEL), 'drawer lead main có thẻ cạnh tên');
  run("openLead('lB')");
  assert.ok(!getEl('drawer').innerHTML.includes(LABEL), 'drawer lead thường không có thẻ');
});

test('index: ô chọn lead gắn vào deal (deal_attach_lead) ghi ★ Đầu mối chính cho lead main', () => {
  const { run, getEl } = loadIndex();
  run("openDeal('d1')");
  const drawer = getEl('drawer').innerHTML;
  const opts = {};
  for (const m of drawer.matchAll(/<option value="(l\w+)">([^<]*)<\/option>/g)) opts[m[1]] = m[2];
  assert.ok(opts.lA && opts.lA.includes(LABEL), 'option của lead main phải có nhãn');
  assert.ok(opts.lC && opts.lC.includes(LABEL), 'option của lead main công ty khác cũng có nhãn');
  assert.ok(opts.lB && !opts.lB.includes(LABEL), 'option của lead thường không có nhãn');
});

test('index: form sửa lead có checkbox Đầu mối chính, checked đúng theo dữ liệu', () => {
  const { run, getEl } = loadIndex();
  run("editLead('lA')");
  let box = getEl('editBox').innerHTML;
  assert.ok(/<input type="checkbox" id="e_lmain"[^>]*checked>/.test(box), 'lead đang là main -> checkbox phải checked khi mở form');
  run("editLead('lB')");
  box = getEl('editBox').innerHTML;
  assert.ok(box.includes('id="e_lmain"'), 'form phải có checkbox e_lmain');
  assert.ok(!/<input type="checkbox" id="e_lmain"[^>]*checked>/.test(box), 'lead thường -> checkbox không checked');
  assert.ok(box.includes('Đầu mối chính của công ty'), 'nhãn checkbox tiếng Việt nhất quán');
});

test('index: saveLead tick B -> radio qua đường lưu thật (A bỏ tick, C giữ), ghi xuống localStorage', () => {
  const { run, getEl, ls } = loadIndex();
  run("editLead('lB')");
  fillLeadForm(getEl);
  getEl('e_lmain').checked = true;
  run("saveLead('lB')");
  const get = id => run(`S.leads.find(l=>l.id==='${id}').mainContact`);
  assert.equal(get('lB'), true, 'B thành main');
  assert.equal(get('lA'), false, 'A cùng công ty tự bỏ tick qua saveLead');
  assert.equal(get('lC'), true, 'C công ty khác không bị ảnh hưởng');
  const saved = JSON.parse(ls.getItem('sava_crm_shared_v1'));
  const sGet = id => saved.leads.find(l => l.id === id).mainContact;
  assert.equal(sGet('lB'), true, 'trạng thái main sau lưu phải ghi xuống kho');
  assert.equal(sGet('lA'), false);
  assert.equal(sGet('lC'), true);
});

test('index: saveLead bỏ tick -> công ty không còn main, không lỗi; tạo lead mới có tick -> thành main duy nhất của công ty đó', () => {
  const { run, getEl } = loadIndex();
  run("editLead('lB')");
  fillLeadForm(getEl);
  getEl('e_lmain').checked = true;
  run("saveLead('lB')");
  run("editLead('lB')");
  fillLeadForm(getEl);
  getEl('e_lmain').checked = false; /* bỏ tick */
  run("saveLead('lB')");
  assert.equal(run("S.leads.filter(l=>l.company==='c1' && l.mainContact).length"), 0, 'bỏ tick -> c1 tạm không có main, hợp lệ');
  assert.equal(run("S.leads.find(l=>l.id==='lC').mainContact"), true, 'c2 vẫn giữ main của mình');
  /* Tạo lead mới cho c1 có tick main */
  run('editLead(null)');
  fillLeadForm(getEl, { e_lname: 'Người D', e_lperson: 'Anh D', e_lphone: '' });
  getEl('e_lmain').checked = true;
  run('saveLead(null)');
  const mains = run("S.leads.filter(l=>l.company==='c1' && l.mainContact).map(l=>l.name)");
  assert.deepEqual([...mains], ['Người D'], 'lead mới tick main là main duy nhất của c1');
});

/* ---------- Tĩnh: wiring ở index.html / publishing.js ---------- */
test('tĩnh: saveLead đọc e_lmain + gọi enforceLeadMainContact; các bề mặt dùng helper duy nhất', () => {
  const html = read('index.html');
  const saveLead = html.slice(html.indexOf('function saveLead'), html.indexOf('function deleteLead'));
  assert.ok(saveLead.includes('e_lmain'), 'saveLead phải đọc checkbox e_lmain');
  assert.ok(saveLead.includes('enforceLeadMainContact(S.leads, l)'), 'saveLead phải thực thi radio ở tầng dữ liệu trước save()');
  const editLead = html.slice(html.indexOf('function editLead'), html.indexOf('function saveLead'));
  assert.ok(editLead.includes('id="e_lmain"'), 'editLead phải có checkbox Đầu mối chính');
  assert.ok(html.split('mainContactBadgeHTML(l)').length - 1 >= 5, 'thẻ phải đi qua helper mainContactBadgeHTML ở các bề mặt HTML chính');
  const pub = read('publishing.js');
  assert.ok(pub.includes('l.mainContact') && pub.includes('MAIN_CONTACT_LABEL'), 'publishing.js phải gắn nhãn cho lead main qua hằng chung');
  assert.ok(!pub.includes('Đầu mối chính'), 'publishing.js không chứa literal nhãn cũ (bất biến phần 1)');
  assert.ok(read('shared.js').includes('const MAIN_CONTACT_LABEL = "★ Đầu mối chính"'), 'chuỗi hiển thị duy nhất khai báo ở shared.js');
});

/* ---------- Publishing THẬT: dialog hiện nhãn cho lead main ---------- */
function makePubElement() {
  return { innerHTML: '', textContent: '', value: '', open: false, dataset: {}, style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {},
    insertAdjacentHTML() {}, querySelector: () => null, querySelectorAll: () => [],
    focus() {}, close() {}, showModal() {}, scrollIntoView() {}, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) };
}
function loadPub({ crmState, requests = [], role = 'bd' } = {}) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(crmState));
  ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, marketUpdates: [], requests }));
  const elements = new Map();
  const docListeners = {};
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: Object.assign(makePubElement(), { dataset: { role } }), activeElement: null,
      querySelector: s => { if (!elements.has(s)) elements.set(s, makePubElement()); return elements.get(s); },
      querySelectorAll: () => [], addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); } },
    location: { search: '', href: 'http://localhost/publishing.html' }, history: { replaceState() {} },
    addEventListener() {}, URLSearchParams, URL, structuredClone,
    crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout });
  ctx.window = ctx;
  for (const f of ['shared.js', 'publishing-score.js', 'publishing-bridge.js', 'publishing-data.js', 'publishing.js']) vm.runInContext(read(f), ctx, { filename: f });
  const openReview = id => {
    const btn = { dataset: { review: id }, hasAttribute: () => false };
    (docListeners.click || []).forEach(fn => fn({ target: { closest: sel => (sel === 'button' ? btn : null) } }));
    return elements.get('#editor').innerHTML;
  };
  return { ctx, ls, elements, openReview };
}
const MEMBERS = [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }, { id: 'mai', name: 'Mai', role: 'MKT', active: true }];
const reqCo = (entityId, extra = {}) => ({ id: 'R-' + entityId, kind: 'company', entityId, requestedBy: 'linh', assignee: 'mai', due: '', requestNote: '', source: '', build: '', intake: {}, status: 'Chờ đánh giá', requestedAt: '2026-10-30T00:00:00.000Z', current: null, revisions: [], revision: 0, ...extra });

test('publishing: khối lead của công ty gắn ★ Đầu mối chính cho đúng lead main', () => {
  const co = { id: 'c1', name: 'Studio Một', type: 'Game studio', roles: { publishing: 'Game studio' }, last: '', contactLeadMigrated: true };
  const leads = [
    { id: 'l1', name: 'Lead Chính', company: 'c1', person: 'Chị Chính — Founder', phone: '0911', line: 'publishing', source: '', status: 'new', note: '', when: '2026-10-30', mainContact: true },
    { id: 'l2', name: 'Lead Phụ', company: 'c1', person: 'Anh Phụ', phone: '0922', line: 'publishing', source: '', status: 'new', note: '', when: '2026-10-30', mainContact: false },
  ];
  const crmState = { members: MEMBERS, companies: [co], games: [], deals: [], leads, tasks: [], activities: [] };
  const env = loadPub({ crmState, requests: [reqCo('c1')], role: 'bd' });
  const dlg = env.openReview('R-c1');
  assert.ok(dlg.includes('Lead Chính'), 'dialog phải hiện lead main');
  assert.ok(dlg.includes('Lead Phụ'), 'dialog vẫn hiện lead thường');
  assert.equal(dlg.split(LABEL).length - 1, 1, 'nhãn ★ Đầu mối chính chỉ xuất hiện 1 lần — cho lead main');
  const mainSeg = dlg.slice(dlg.indexOf('Lead Chính'), dlg.indexOf('Lead Phụ'));
  assert.ok(mainSeg.includes(LABEL), 'nhãn phải nằm trong đoạn của lead main, không phải lead phụ');
});
