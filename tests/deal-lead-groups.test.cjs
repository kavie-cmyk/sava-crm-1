/* Khối "Đầu mối phía đối tác" trong DRAWER DEAL + ô chọn lead ở form TẠO deal:
   - deal.leads là nguồn sự thật DUY NHẤT cho đầu mối làm việc của deal.
     Dòng kv cũ của drawer từng render companyLeadsHTML(c.id) — TOÀN BỘ lead
     của công ty — khiến lead của công ty bị hiểu nhầm là đầu mối của deal
     (deal trống vẫn hiện lead), và person gần trùng tên bị lặp 2 lần
     ("Mr. B ★ Đầu mối chính · Mr.B" vì check person !== name là so sánh
     tuyệt đối, "Mr. B" khác "Mr.B" đúng 1 khoảng trắng).
   - Nay drawer deal tách 2 nhóm: "Đã gắn vào deal này" (deal.leads, có nút
     gỡ tại drawer) và "Lead của công ty (chưa gắn — tham chiếu)" (lead của
     công ty ngoài deal.leads, KHÔNG lặp lead đã gắn, mỗi lead có nút
     "＋ Gắn vào deal" đi qua attachLeadToDeal -> save()).
   - Render trong khối deal dùng dealLeadMiniHTML / dealLeadContactLineHTML:
     đúng mẫu leadMini (tên người là chính) + leadPersonShown — person
     trùng/gần trùng tên (khác khoảng trắng/dấu) thì chỉ hiện MỘT tên.
     companyLeadsHTML / leadMini ở các bề mặt khác KHÔNG đổi.
   - Form tạo deal có ô chọn lead theo công ty: điền sẵn ★ Đầu mối chính
     của công ty (nếu có) qua dealFormLeadSelByCompany; lựa chọn tay của
     từng công ty được giữ khi đổi công ty qua lại; convertLead prefill
     seed vào cùng map và chỉ "converted" khi user còn giữ lead trong form.
   Fixture nằm trong file test này — seed production vẫn là emptyState. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const LABEL = '★ Đầu mối chính';

/* ---------- Harness index.html THẬT (cùng mẫu lead-main-contact) ---------- */
function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }],
    companies: [
      { id: 'c1', name: 'Studio B', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hôm qua' },
      { id: 'c2', name: 'Công ty Hai', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, last: 'Hôm nay' },
      { id: 'c3', name: 'Công ty Ba', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, last: 'Hôm nay' },
    ],
    games: [],
    deals: [
      { id: 'dEmpty', line: 'publishing', title: 'ABC', company: 'c1', game: '', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] },
      { id: 'dAttached', line: 'publishing', title: 'Deal Đã Gắn', company: 'c1', game: '', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: ['lSub'] },
    ],
    leads: [
      { id: 'lMain', name: 'Mr. B', company: 'c1', person: 'Mr.B', phone: '0901', line: 'publishing', source: 'Giới thiệu', status: 'new', note: '', when: '2026-10-01', mainContact: true },
      { id: 'lSub', name: 'Người B', company: 'c1', person: 'Anh B — CEO', phone: '', line: 'publishing', source: 'Giới thiệu', status: 'new', note: '', when: '2026-10-02', mainContact: false },
      { id: 'lOther', name: 'Người C', company: 'c2', person: '', phone: '', line: 'ai', source: '', status: 'new', note: '', when: '2026-10-03', mainContact: true },
      { id: 'lNoMain', name: 'Người D', company: 'c3', person: 'Chị D', phone: '', line: 'ai', source: '', status: 'new', note: '', when: '2026-10-04', mainContact: false },
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
/* Tách đoạn HTML của 1 nhóm trong khối đầu mối drawer deal. */
function groupSlice(drawer, from, to) {
  const a = drawer.indexOf(from); assert.ok(a >= 0, 'thiếu mốc nhóm: ' + from);
  const b = to ? drawer.indexOf(to, a) : drawer.length;
  return drawer.slice(a, b === -1 ? drawer.length : b);
}
const ATTACHED_HEAD = 'Đã gắn vào deal này';
const COMPANY_HEAD = 'Lead của công ty (chưa gắn vào deal này';

/* ---------- Dedupe name ≈ person ---------- */
test('dedupe: leadPersonShown ẩn person trùng/gần trùng tên (khoảng trắng, dấu câu, dấu tiếng Việt), giữ person khác hẳn', () => {
  const { run } = loadIndex();
  assert.equal(run("leadPersonShown({name:'Mr. B', person:'Mr.B'})"), '', '"Mr.B" chỉ khác "Mr. B" 1 khoảng trắng -> không hiện riêng');
  assert.equal(run("leadPersonShown({name:'Mr. B', person:'Mr B'})"), '');
  assert.equal(run("leadPersonShown({name:'Nguyễn Văn A', person:'Nguyen Van A'})"), '', 'chỉ khác dấu tiếng Việt -> không hiện riêng');
  assert.equal(run("leadPersonShown({name:'Người B', person:'Anh B — CEO'})"), 'Anh B — CEO', 'person khác hẳn tên -> hiện như mẫu leadMini');
  assert.equal(run("leadPersonShown({name:'Người C', person:''})"), '');
  assert.equal(run("leadPersonShown({name:'', person:'Ai Đó'})"), 'Ai Đó', 'lead chưa có tên -> person vẫn hiện');
});

test('dedupe: dealLeadContactLineHTML của lead "Mr. B"/"Mr.B" chỉ hiện MỘT tên + thẻ main + SĐT, không có "· Mr.B"', () => {
  const { run } = loadIndex();
  const html = run("dealLeadContactLineHTML(S.leads.find(l=>l.id==='lMain'))");
  assert.equal(html.split('Mr. B').length - 1, 1, 'tên chỉ xuất hiện đúng 1 lần');
  assert.ok(!html.includes('Mr.B'), 'không còn person lặp "Mr.B"');
  assert.ok(html.includes(LABEL), 'vẫn có thẻ ★ Đầu mối chính');
  assert.ok(html.includes('📞 0901'), 'SĐT vẫn hiện');
  const html2 = run("dealLeadContactLineHTML(S.leads.find(l=>l.id==='lSub'))");
  assert.ok(html2.includes('Người B') && html2.includes('Anh B — CEO'), 'person khác hẳn tên vẫn hiện sau tên như companyLeadsHTML');
  const mini = run("dealLeadMiniHTML(S.leads.find(l=>l.id==='lMain'))");
  assert.ok(!mini.includes('👤'), 'thẻ lead trong drawer deal cũng không lặp person gần trùng tên');
  assert.ok(mini.includes(LABEL) && mini.includes('Studio B'), 'thẻ vẫn đúng mẫu leadMini: tên + thẻ main + công ty');
});

/* ---------- Hai nhóm trong drawer deal ---------- */
test('drawer deal TRỐNG lead: nhóm đã gắn báo rõ trạng thái trống, lead công ty nằm ở nhóm tham chiếu kèm nút gắn', () => {
  const { run, getEl } = loadIndex();
  run("openDeal('dEmpty')");
  const drawer = getEl('drawer').innerHTML;
  assert.ok(drawer.includes('Đầu mối phía đối tác (đã gắn vào deal)'), 'nhãn kv phải nói rõ là lead ĐÃ GẮN vào deal');
  const gA = groupSlice(drawer, ATTACHED_HEAD, COMPANY_HEAD);
  assert.ok(gA.includes('Chưa gắn lead nào vào deal này.'), 'deal.leads trống -> nhóm đã gắn hiện rõ trạng thái trống');
  assert.ok(!gA.includes("openLead('lMain')"), 'nhóm đã gắn không được chứa lead chưa gắn');
  const gB = groupSlice(drawer, COMPANY_HEAD, 'deal_attach_lead');
  assert.ok(gB.includes("openLead('lMain')") && gB.includes("openLead('lSub')"), 'cả 2 lead của công ty đều ở nhóm tham chiếu');
  assert.ok(gB.includes("attachLeadFromDealBlock('lMain','dEmpty')"), 'lead main có nút ＋ Gắn vào deal ngay tại khối');
  assert.ok(gB.includes("attachLeadFromDealBlock('lSub','dEmpty')"), 'lead thường cũng có nút ＋ Gắn vào deal');
  assert.ok(gB.includes(LABEL), 'thẻ ★ Đầu mối chính hiện trên lead main ở nhóm tham chiếu');
});

test('drawer deal ĐÃ gắn lSub: lSub chỉ ở nhóm đã gắn (kèm nút gỡ), KHÔNG lặp ở nhóm công ty; kv chỉ hiện lead đã gắn', () => {
  const { run, getEl } = loadIndex();
  run("openDeal('dAttached')");
  const drawer = getEl('drawer').innerHTML;
  const gA = groupSlice(drawer, ATTACHED_HEAD, COMPANY_HEAD);
  assert.ok(gA.includes("openLead('lSub')"), 'lead đã gắn nằm ở nhóm đã gắn');
  assert.ok(gA.includes("detachLeadFromDeal('lSub','dAttached')"), 'lead đã gắn có nút gỡ ngay tại drawer');
  const gB = groupSlice(drawer, COMPANY_HEAD, 'deal_attach_lead');
  assert.ok(!gB.includes("openLead('lSub')"), 'lead đã gắn KHÔNG lặp lại ở nhóm tham chiếu');
  assert.ok(gB.includes("openLead('lMain')"), 'lead chưa gắn của công ty vẫn ở nhóm tham chiếu');
  const kvStart = drawer.indexOf('Đầu mối phía đối tác (đã gắn vào deal)');
  assert.ok(kvStart >= 0, 'thiếu dòng kv đầu mối đã gắn');
  const kv = drawer.slice(kvStart, drawer.indexOf('<div class="k">', kvStart + 10));
  assert.ok(kv.includes('Người B') && kv.includes('Anh B — CEO'), 'kv hiện lead đã gắn + person khác hẳn');
  assert.ok(!kv.includes('Mr. B'), 'kv KHÔNG còn hiện lead của công ty chưa gắn như đầu mối của deal');
});

test('gắn/gỡ ngay tại drawer: attachLeadFromDealBlock + detachLeadFromDeal đi qua save(), drawer dựng lại đúng nhóm', () => {
  const { run, getEl, ls } = loadIndex();
  run("attachLeadFromDealBlock('lMain','dEmpty')");
  assert.deepEqual([...run("S.deals.find(d=>d.id==='dEmpty').leads")], ['lMain'], 'gắn = thêm id vào deal.leads');
  const saved = JSON.parse(ls.getItem('sava_crm_shared_v1'));
  assert.deepEqual(saved.deals.find(d => d.id === 'dEmpty').leads, ['lMain'], 'gắn phải ghi xuống kho qua save()');
  let drawer = getEl('drawer').innerHTML;
  let gA = groupSlice(drawer, ATTACHED_HEAD, COMPANY_HEAD);
  assert.ok(gA.includes("openLead('lMain')") && gA.includes("detachLeadFromDeal('lMain','dEmpty')"), 'sau gắn: lead lên nhóm đã gắn + có nút gỡ');
  let gB = groupSlice(drawer, COMPANY_HEAD, 'deal_attach_lead');
  assert.ok(!gB.includes("openLead('lMain')"), 'sau gắn: lead rời nhóm tham chiếu');
  assert.ok(gB.includes("openLead('lSub')"), 'lead chưa gắn còn lại vẫn ở nhóm tham chiếu');
  run("detachLeadFromDeal('lMain','dEmpty')");
  assert.deepEqual([...run("S.deals.find(d=>d.id==='dEmpty').leads")], [], 'gỡ = bỏ id khỏi deal.leads');
  drawer = getEl('drawer').innerHTML;
  assert.ok(groupSlice(drawer, ATTACHED_HEAD, COMPANY_HEAD).includes('Chưa gắn lead nào vào deal này.'), 'sau gỡ: nhóm đã gắn về trạng thái trống');
});

/* ---------- Form tạo deal: prefill main + lựa chọn tay ---------- */
function fillCreateForm(getEl, over) {
  const vals = Object.assign({ f_title: 'Deal Mới', f_line: 'ai', f_company: 'c1', f_amount: '', f_cur: 'VND', f_stage: '', f_owner: 'zac' }, over || {});
  for (const [k, v] of Object.entries(vals)) getEl(k).value = v;
}

test('tạo deal: công ty có ★ Đầu mối chính -> điền sẵn lead main vào ô chọn + deal mới mang đúng lead đó', () => {
  const { run, getEl } = loadIndex();
  getEl('f_line').value = 'ai';
  run('openAdd()');
  getEl('f_company').value = 'c1';
  run('onDealCompanyChange()');
  const box = getEl('f_leadsBox').innerHTML;
  assert.ok(/toggleDealFormLead\('lMain', this\.checked\)" checked/.test(box), 'checkbox của lead main phải được tick sẵn');
  assert.ok(!/toggleDealFormLead\('lSub', this\.checked\)" checked/.test(box), 'lead thường không được tick sẵn');
  assert.deepEqual([...run("dealFormLeadSelection('c1')")], ['lMain']);
  fillCreateForm(getEl, { f_company: 'c1' });
  run('saveDeal()');
  const nd = run("S.deals.find(d=>d.title==='Deal Mới')");
  assert.ok(nd, 'deal mới phải được tạo');
  assert.deepEqual([...nd.leads], ['lMain'], 'deal mới gắn sẵn lead ★ Đầu mối chính của công ty');
});

test('tạo deal: công ty KHÔNG có main -> không điền sẵn, deal mới không gắn lead nào', () => {
  const { run, getEl } = loadIndex();
  getEl('f_line').value = 'ai';
  run('openAdd()');
  getEl('f_company').value = 'c3';
  run('onDealCompanyChange()');
  assert.deepEqual([...run("dealFormLeadSelection('c3')")], [], 'không có main -> lựa chọn rỗng như hành vi cũ');
  assert.ok(!/" checked/.test(getEl('f_leadsBox').innerHTML), 'không checkbox nào được tick');
  fillCreateForm(getEl, { f_company: 'c3' });
  run('saveDeal()');
  assert.deepEqual([...run("S.deals.find(d=>d.title==='Deal Mới').leads")], []);
});

test('tạo deal: lựa chọn TAY của từng công ty được giữ khi đổi công ty qua lại (prefill không ghi đè)', () => {
  const { run, getEl } = loadIndex();
  getEl('f_line').value = 'ai';
  run('openAdd()');
  getEl('f_company').value = 'c1';
  run('onDealCompanyChange()');
  run("toggleDealFormLead('lMain', false); toggleDealFormLead('lSub', true);");
  assert.deepEqual([...run("dealFormLeadSelection('c1')")], ['lSub'], 'user bỏ main, chọn lSub');
  getEl('f_company').value = 'c2';
  run('onDealCompanyChange()');
  assert.deepEqual([...run("dealFormLeadSelection('c2')")], ['lOther'], 'sang công ty mới: prefill main của công ty đó');
  getEl('f_company').value = 'c1';
  run('onDealCompanyChange()');
  assert.deepEqual([...run("dealFormLeadSelection('c1')")], ['lSub'], 'quay lại c1: lựa chọn tay còn nguyên, không bị prefill main ghi đè');
  const box = getEl('f_leadsBox').innerHTML;
  assert.ok(/toggleDealFormLead\('lSub', this\.checked\)" checked/.test(box), 'checkbox lSub vẫn tick khi quay lại');
  assert.ok(!/toggleDealFormLead\('lMain', this\.checked\)" checked/.test(box), 'checkbox lMain vẫn bỏ tick khi quay lại');
  fillCreateForm(getEl, { f_company: 'c1' });
  run('saveDeal()');
  assert.deepEqual([...run("S.deals.find(d=>d.title==='Deal Mới').leads")], ['lSub'], 'deal lưu theo lựa chọn tay, không theo prefill');
});

test('tạo deal từ convertLead (prefill): lead prefill hiện tick trong form; giữ tick -> gắn + converted; bỏ tick -> không gắn, không converted', () => {
  const { run, getEl } = loadIndex();
  getEl('f_line').value = 'ai';
  run("openAdd({ line: 'ai', companyId: 'c2', title: 'Deal Convert', leads: ['lOther'] })");
  assert.deepEqual([...run("dealFormLeadSelection('c2')")], ['lOther'], 'prefill seed vào ô chọn lead');
  fillCreateForm(getEl, { f_title: 'Deal Convert', f_line: 'ai', f_company: 'c2' });
  run('saveDeal()');
  const nd = run("S.deals.find(d=>d.title==='Deal Convert')");
  assert.deepEqual([...nd.leads], ['lOther'], 'giữ tick -> lead prefill được gắn');
  assert.equal(run("S.leads.find(l=>l.id==='lOther').status"), 'converted', 'giữ tick + khớp line/company -> converted như cơ chế cũ');
  /* Vòng 2: user bỏ tick lead prefill trước khi lưu */
  run("S.leads.find(l=>l.id==='lOther').status = 'new'");
  getEl('f_line').value = 'ai';
  run("openAdd({ line: 'ai', companyId: 'c2', title: 'Deal Convert 2', leads: ['lOther'] })");
  run("toggleDealFormLead('lOther', false)");
  fillCreateForm(getEl, { f_title: 'Deal Convert 2', f_line: 'ai', f_company: 'c2' });
  run('saveDeal()');
  const nd2 = run("S.deals.find(d=>d.title==='Deal Convert 2')");
  assert.deepEqual([...nd2.leads], [], 'bỏ tick -> lead prefill không bị gắn ép');
  assert.equal(run("S.leads.find(l=>l.id==='lOther').status"), 'new', 'bỏ tick -> lead không bị đánh dấu converted');
});

/* ---------- Tĩnh: phạm vi thay đổi ---------- */
test('tĩnh: drawer deal không còn render companyLeadsHTML cho deal; bề mặt khác giữ nguyên helper cũ', () => {
  const html = read('index.html');
  const openDeal = html.slice(html.indexOf('function openDeal'), html.indexOf('function moveStage'));
  assert.ok(!openDeal.includes('companyLeadsHTML('), 'openDeal không được lấy lead công ty làm đầu mối của deal nữa');
  assert.ok(openDeal.includes('dealLeadContactLineHTML') && openDeal.includes('attachLeadFromDealBlock'), 'openDeal phải dùng renderer + nút gắn của khối deal');
  assert.ok(html.includes('${companyLeadsHTML(c.id)}'), 'danh sách công ty vẫn dùng companyLeadsHTML như cũ (ngoài phạm vi)');
  assert.ok(html.includes('function companyLeadsHTML(companyId)'), 'companyLeadsHTML giữ nguyên cho các bề mặt khác');
  const modal = html.slice(html.indexOf('<div class="modal" id="modal">'), html.indexOf('<div class="modal" id="editModal">'));
  assert.ok(modal.includes('id="f_leadsBox"'), 'form tạo deal phải có khối ô chọn lead');
  const saveDeal = html.slice(html.indexOf('function saveDeal()'), html.indexOf('/* ===== CRUD'));
  assert.ok(saveDeal.includes('dealFormLeadSelection(c.id)'), 'saveDeal phải lấy lead từ ô chọn của form');
});
