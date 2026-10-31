/* View Lead phía BD (vLeads) chia theo BLOCK TRẠNG THÁI:
   - Tập trạng thái + thứ tự vòng đời lấy nguyên từ vựng app đang có
     (field lead.status; form sửa lead e_lstatus / drawer / leadMini đều
     dùng cùng tập): new "Mới" -> contacted "Đã liên hệ" -> qualified
     "Đạt chuẩn" -> converted "Đã chuyển đổi". KHÔNG có trạng thái mới.
   - Mỗi trạng thái = 1 block ngang (section.panel.lead-status-block,
     data-lead-status=<key>) xếp dọc theo đúng thứ tự vòng đời; đầu block
     có pill tên trạng thái + count-badge "<n> lead".
   - Hàng lead giữ nguyên: bấm hàng openLead, chip ★ Đầu mối chính, link
     công ty/deal, chip mảng, nguồn, thời gian, pill trạng thái, nút
     Chuyển thành deal (hoặc "Đã vào pipeline" khi converted).
   - Block rỗng: khi KHÔNG lọc thì vẫn hiện + "Chưa có lead nào ở trạng
     thái này."; khi ĐANG lọc (query hoặc curLine != "all", cùng quy ước
     vTasksByMember) thì block không còn lead khớp bị ẩn, và nếu không
     còn lead nào khớp thì hiện "Không có lead nào khớp bộ lọc hiện tại."
   - Status lạ/thiếu (dữ liệu cũ) -> block cuối "__unknown__"
     "Khác / Chưa rõ trạng thái", không lead nào biến mất khỏi view.
   Fixture nằm trong file test này — seed production vẫn là emptyState. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');

/* ---------- Tĩnh: tập trạng thái + thứ tự ---------- */
test('tĩnh: LEAD_STATUSES đúng 4 trạng thái sẵn có, đúng thứ tự vòng đời, khớp ô chọn e_lstatus của editLead', () => {
  const seg = html.slice(html.indexOf('const LEAD_STATUSES'), html.indexOf('const LEAD_STATUS_UNKNOWN'));
  const keys = [...seg.matchAll(/key:\s*"([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(keys, ['new', 'contacted', 'qualified', 'converted']);
  for (const label of ['"Mới"', '"Đã liên hệ"', '"Đạt chuẩn"', '"Đã chuyển đổi"']) assert.ok(seg.includes('label: ' + label), 'thiếu nhãn ' + label);
  /* Form sửa lead vẫn dùng đúng cùng tập + thứ tự (không chế trạng thái mới) */
  assert.ok(html.includes('sel("e_lstatus", [["new", "Mới"], ["contacted", "Đã liên hệ"], ["qualified", "Đạt chuẩn"], ["converted", "Đã chuyển đổi"]]'), 'e_lstatus phải giữ nguyên tập trạng thái + thứ tự');
  assert.ok(html.includes('Khác / Chưa rõ trạng thái'), 'thiếu block gom trạng thái lạ');
  assert.ok(html.includes('data-lead-status='), 'block phải mang data-lead-status để nhận diện theo trạng thái');
});

/* ---------- Harness vm: nạp index.html thật ---------- */
function loadIndex() {
  const readF = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [
      { id: 'c1', name: 'Hanbit Fixture', type: 'Publisher', roles: { game_studio: 'Publisher' }, last: 'Hôm qua' },
      { id: 'c10', name: 'Studio Mooncat Fixture', type: 'Game studio', roles: { publishing: 'Game studio' }, last: 'Hôm nay' },
    ],
    games: [],
    deals: [
      { id: 'drel', line: 'publishing', title: 'Deal Lien Quan Fixture', company: 'c10', stage: 'build_eval', owner: 'zac', due: '', idle: 0, custom: {}, leads: ['lcontacted'] },
    ],
    leads: [
      { id: 'lnew', name: 'Lead New One', company: 'c10', person: 'Anh Minh', phone: '0901', line: 'publishing', source: 'Form savameta.com', status: 'new', note: 'tok-new ghi chu', when: '2026-10-01', mainContact: true },
      { id: 'lcontacted', name: 'Lead Contacted One', company: 'c10', person: 'Chi Hai', line: 'publishing', source: 'Gioi thieu', status: 'contacted', note: 'tok-contacted ghi chu', when: '2026-10-02' },
      { id: 'lqualified', name: 'Lead Qualified One', company: 'c1', person: 'Anh Ba', line: 'game_studio', source: 'Su kien', status: 'qualified', note: 'tok-qualified ghi chu', when: '2026-10-03' },
      { id: 'lconverted', name: 'Lead Converted One', company: 'c10', person: 'Chi Tu', line: 'publishing', source: 'Facebook', status: 'converted', note: 'tok-converted ghi chu', when: '2026-10-04' },
      { id: 'lunknown', name: 'Lead Unknown One', company: 'c10', person: 'Anh Nam', line: 'publishing', source: 'Khac', status: 'legacy_weird', note: 'tok-unknown ghi chu', when: '2026-10-05' },
      { id: 'lnostatus', name: 'Lead NoStatus One', company: 'c10', person: 'Chi Sau', line: 'publishing', source: 'Khac', note: 'tok-nostatus ghi chu', when: '2026-10-06' },
      { id: 'laiqualified', name: 'Lead Ai Qualified', company: 'c1', person: 'Anh Bay', line: 'ai', source: 'Khac', status: 'qualified', note: 'tok-ai ghi chu', when: '2026-10-07' },
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
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(readF(f), ctx, { filename: f });
  [...readF('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, listeners, run: code => vm.runInContext(code, ctx) };
}
/* Cắt view thành các block theo data-lead-status, giữ thứ tự xuất hiện */
function blocks(view) {
  const parts = view.split(/(?=data-lead-status=")/).slice(1);
  return parts.map(p => ({ key: p.slice('data-lead-status="'.length, p.indexOf('"', 'data-lead-status="'.length)), html: p }));
}
const renderLeads = run => { run('curView = "leads"; curLine = "all"; query = ""; render();'); };

test('vLeads: block theo đúng thứ tự vòng đời, block lạ ở cuối, số lượng đúng từng block', () => {
  const { run, getEl } = loadIndex();
  renderLeads(run);
  const view = getEl('view').innerHTML;
  const bs = blocks(view);
  assert.deepEqual(bs.map(b => b.key), ['new', 'contacted', 'qualified', 'converted', '__unknown__'], 'thứ tự block phải là vòng đời + Khác ở cuối');
  const byKey = Object.fromEntries(bs.map(b => [b.key, b.html]));
  assert.ok(byKey.new.includes('>Mới</span>') && byKey.new.includes('1 lead'), 'đầu block Mới: tên + số lượng');
  assert.ok(byKey.contacted.includes('>Đã liên hệ</span>') && byKey.contacted.includes('1 lead'));
  assert.ok(byKey.qualified.includes('>Đạt chuẩn</span>') && byKey.qualified.includes('2 lead'), 'qualified có 2 lead (publishing-fixture game_studio + ai)');
  assert.ok(byKey.converted.includes('>Đã chuyển đổi</span>') && byKey.converted.includes('1 lead'));
  assert.ok(byKey.__unknown__.includes('Khác / Chưa rõ trạng thái') && byKey.__unknown__.includes('2 lead'), '2 lead lạ/thiếu status phải gom vào block Khác');
  /* Mỗi lead nằm đúng block của trạng thái mình, không lạc sang block khác */
  assert.ok(byKey.new.includes('Lead New One') && !byKey.contacted.includes('Lead New One'));
  assert.ok(byKey.contacted.includes('Lead Contacted One'));
  assert.ok(byKey.qualified.includes('Lead Qualified One') && byKey.qualified.includes('Lead Ai Qualified'));
  assert.ok(byKey.converted.includes('Lead Converted One'));
  assert.ok(byKey.__unknown__.includes('Lead Unknown One') && byKey.__unknown__.includes('Lead NoStatus One'));
  /* Không lead nào biến mất: tổng số hàng (openLead trong <tr>) = tổng số lead */
  assert.equal((view.match(/<tr onclick="openLead\(/g) || []).length, 7);
  /* Pill của lead lạ hiện nguyên giá trị đã lưu; lead thiếu status hiện "—" */
  assert.ok(byKey.__unknown__.includes('>legacy_weird</span>'), 'pill phải hiện nguyên status lạ đã lưu');
});

test('vLeads: hàng lead giữ nguyên thông tin/thao tác — chip ★ Đầu mối chính, link công ty/deal, nút chuyển deal, bấm hàng mở drawer', () => {
  const { run, getEl } = loadIndex();
  renderLeads(run);
  const view = getEl('view').innerHTML;
  const byKey = Object.fromEntries(blocks(view).map(b => [b.key, b.html]));
  assert.ok(byKey.new.includes('★ Đầu mối chính'), 'lead mainContact phải còn chip ★ Đầu mối chính trong block Mới');
  assert.ok(byKey.new.includes("openCompany('c10')") && byKey.new.includes('Studio Mooncat Fixture →'), 'link công ty ở dòng phụ phải còn');
  assert.ok(byKey.new.includes('Lead (người đầu mối + công ty)'), 'header bảng của block phải giữ nguyên như bảng phẳng cũ');
  assert.ok(byKey.new.includes("convertLead('lnew')") && byKey.new.includes('Chuyển thành deal →'), 'nút chuyển thành deal phải còn ở lead chưa converted');
  assert.ok(byKey.contacted.includes("openDeal('drel')") && byKey.contacted.includes('Deal Lien Quan Fixture →'), 'deal liên quan phải còn, bấm mở deal được');
  assert.ok(byKey.converted.includes('Đã vào pipeline') && !byKey.converted.includes("convertLead('lconverted')"), 'lead converted hiện "Đã vào pipeline", không còn nút chuyển');
  run("openLead('lnew')");
  assert.ok(getEl('drawer').innerHTML.includes('Lead New One'), 'bấm hàng (openLead) vẫn mở drawer lead');
});

test('vLeads: block rỗng vẫn hiện khi không lọc; đổi trạng thái qua state rồi render lại thì lead nhảy đúng block', () => {
  const { run, getEl } = loadIndex();
  run('S.leads = S.leads.filter(l => l.status !== "contacted");');
  renderLeads(run);
  let byKey = Object.fromEntries(blocks(getEl('view').innerHTML).map(b => [b.key, b.html]));
  assert.ok(byKey.contacted, 'không lọc: block Đã liên hệ rỗng vẫn phải hiện');
  assert.ok(byKey.contacted.includes('0 lead') && byKey.contacted.includes('Chưa có lead nào ở trạng thái này.'));
  /* Đổi trạng thái bằng đúng đường dữ liệu form/drawer ghi (lead.status) rồi render lại */
  run('S.leads.find(l => l.id === "lnew").status = "contacted"; render();');
  byKey = Object.fromEntries(blocks(getEl('view').innerHTML).map(b => [b.key, b.html]));
  assert.ok(byKey.contacted.includes('Lead New One') && !byKey.new.includes('Lead New One'), 'lead vừa đổi trạng thái phải nhảy sang block Đã liên hệ');
  assert.ok(byKey.new.includes('0 lead') && byKey.new.includes('Chưa có lead nào ở trạng thái này.'));
});

test('vLeads: tìm kiếm/lọc mảng — block không còn lead khớp thì ẩn; không khớp gì thì báo rõ', () => {
  const { run, getEl } = loadIndex();
  run('curView = "leads"; curLine = "all"; query = "tok-contacted"; render();');
  let bs = blocks(getEl('view').innerHTML);
  assert.deepEqual(bs.map(b => b.key), ['contacted'], 'đang tìm kiếm: chỉ block còn lead khớp mới hiện');
  assert.ok(bs[0].html.includes('Lead Contacted One'));
  run('query = "tok-khong-khop-gi"; render();');
  const none = getEl('view').innerHTML;
  assert.equal(blocks(none).length, 0, 'không khớp: không còn block nào');
  assert.ok(none.includes('Không có lead nào khớp bộ lọc hiện tại.'));
  /* Lọc theo mảng (curLine): chỉ lead của mảng đó, vẫn chia block theo trạng thái */
  run('query = ""; curLine = "ai"; render();');
  bs = blocks(getEl('view').innerHTML);
  assert.deepEqual(bs.map(b => b.key), ['qualified'], 'lọc mảng ai: chỉ block Đạt chuẩn (có lead ai) hiện');
  assert.ok(bs[0].html.includes('Lead Ai Qualified') && !bs[0].html.includes('Lead Qualified One'));
});
