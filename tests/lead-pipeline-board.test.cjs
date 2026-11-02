/* Lead PIPELINE (kanban) — cách trình bày THỨ HAI của view Lead:
   - Toggle Block ⇄ Pipeline (leadViewMode) là state hiển thị thuần tuý,
     view Block giữ nguyên; board dùng CÙNG dữ kiện lead.status — cột =
     LEAD_STATUSES đúng thứ tự, KHÔNG field/stage/trạng thái mới.
   - Thẻ lead: tên (mở drawer lead), công ty (mở drawer công ty),
     Position (field person), chip ★ Đầu mối chính, chip mảng.
   - Kéo-thả đổi trạng thái đi qua helper confirm DÙNG CHUNG
     confirmStageChange + đường lưu save() chuẩn; thả về đúng cột cũ =
     không hỏi/không ghi; huỷ = không mutate/không save; lead đang gắn
     deal giữ bất biến "converted" như form sửa lead (F1/P2).
   - Lead trạng thái lạ KHÔNG có cột trên board: không hiện + ghi chú số
     lượng bị ẩn + nút quay về view Block.
   - Đếm đầu cột = số SAU lọc (tìm kiếm + tab mảng áp y hệt view Block);
     khác tổng toàn bộ thì dòng tổng kèm "trên tổng N lead".
   - Hiệu năng: mỗi cột chỉ dựng tối đa LEAD_BOARD_PAGE_SIZE (50) thẻ +
     "Hiển thị thêm" tăng dần — fixture có 60 lead Sent connect.
   Harness vm theo mẫu qa-round-fixes / lead-status-blocks: nạp script
   inline THẬT của index.html, confirm điều khiển được. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const ALL_KEYS = ['new', 'sent_connect', 'first_message', 'first_email', 'first_fu', 'in_response', 'in_reply', 'discovery_meeting', 'contacted', 'qualified', 'converted', 'not_yet_have_demand'];

function fixtureState() {
  const sent = Array.from({ length: 60 }, (_, i) => ({
    id: 'ls' + String(i).padStart(2, '0'), name: 'Sent Lead ' + String(i).padStart(2, '0'),
    company: 'c1', person: '', phone: '', line: 'metaverse', source: 'Khac',
    status: 'sent_connect', note: 'tok-sent', when: '2026-10-10', mainContact: false,
  }));
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [
      { id: 'c1', name: 'Cong Ty Mot Fixture', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hom qua' },
      { id: 'c2', name: 'Cong Ty Hai Fixture', type: 'Doanh nghiep', roles: { ai: 'Khach hang' }, last: 'Hom nay' },
    ],
    games: [],
    deals: [
      { id: 'drel', line: 'publishing', title: 'Deal Lien Quan Fixture', company: 'c1', stage: 'build_eval', owner: 'zac', due: '', idle: 0, custom: {}, leads: ['lconv'] },
    ],
    leads: [
      { id: 'lnew', name: 'Lead New One', company: 'c1', person: 'Anh Minh', phone: '0901', line: 'publishing', source: 'Form savameta.com', status: 'new', note: 'tok-new', when: '2026-10-01', mainContact: true },
      { id: 'lcontacted', name: 'Lead Contacted One', company: 'c1', person: 'Chi Hai', line: 'publishing', source: 'Gioi thieu', status: 'contacted', note: 'tok-contacted', when: '2026-10-02' },
      { id: 'lconv', name: 'Lead Converted One', company: 'c1', person: 'Chi Tu', line: 'publishing', source: 'Facebook', status: 'converted', note: 'tok-converted', when: '2026-10-04' },
      { id: 'lclosed', name: 'Lead Closed One', company: 'c1', person: 'Anh Dong', line: 'metaverse', source: 'Khac', status: 'not_yet_have_demand', note: 'tok-closed', when: '2026-10-05' },
      { id: 'lweird', name: 'Lead Weird One', company: 'c1', person: 'Anh Nam', line: 'publishing', source: 'Khac', status: 'legacy_weird', note: 'tok-weird', when: '2026-10-06' },
      { id: 'lai', name: 'Lead Ai One', company: 'c2', person: 'Anh Bay', line: 'ai', source: 'Khac', status: 'qualified', note: 'tok-ai', when: '2026-10-07' },
      ...sent,
    ],
    tasks: [], activities: [], verticals: [],
  };
}
function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(fixtureState()));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {}, querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null });
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  let confirmAnswer = true; const confirmMsgs = [];
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout,
    confirm: msg => { confirmMsgs.push(String(msg)); return confirmAnswer; },
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx), confirmMsgs, setConfirm: v => { confirmAnswer = v; } };
}
/* Cắt board/block thành các đoạn theo data-lead-status, giữ thứ tự */
function cols(view) {
  const parts = view.split(/(?=data-lead-status=")/).slice(1);
  return parts.map(p => ({ key: p.slice('data-lead-status="'.length, p.indexOf('"', 'data-lead-status="'.length)), html: p }));
}
const cardsIn = seg => (seg.match(/ondragstart="dragLead\(/g) || []).length;
const openBoard = h => { h.run('curView = "leads"; curLine = "all"; query = ""; setLeadViewMode("pipeline");'); return h.getEl('view').innerHTML; };

/* ---------- Tĩnh ---------- */
test('tĩnh: toggle Block ⇄ Pipeline + vLeads rẽ nhánh sang vLeadsPipeline, view Block giữ nguyên làm mặc định', () => {
  assert.ok(html.includes('let leadViewMode = "block";'), 'mặc định phải là block (view cũ giữ nguyên vẹn)');
  assert.ok(html.includes('function setLeadViewMode('), 'thiếu hàm chuyển chế độ xem');
  assert.ok(html.includes('if (leadViewMode === "pipeline") { vLeadsPipeline(); return; }'), 'vLeads phải rẽ nhánh sang board khi ở chế độ pipeline');
  assert.ok(html.includes("setLeadViewMode('block')") && html.includes("setLeadViewMode('pipeline')"), 'toggle phải có đủ 2 nút Block/Pipeline');
  assert.ok(html.includes('function filteredLeads('), 'bộ lọc lead phải là MỘT nguồn dùng chung cho cả 2 chế độ');
});

test('tĩnh: không tạo trạng thái/field mới — LEAD_STATUSES vẫn đúng 12 key, cap dựng thẻ = 50', () => {
  const seg = html.slice(html.indexOf('const LEAD_STATUSES'), html.indexOf('const LEAD_STATUS_UNKNOWN'));
  const keys = [...seg.matchAll(/key:\s*"([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(keys, ALL_KEYS, 'LEAD_STATUSES phải giữ nguyên 12 key — board chỉ là cách trình bày thứ hai');
  assert.ok(html.includes('const LEAD_BOARD_PAGE_SIZE = 50;'), 'cap dựng thẻ mỗi cột phải là 50');
});

test('tĩnh: dropLead đi qua confirmStageChange DÙNG CHUNG + syncLeadDealStatus + save(); confirmStageChange xử cả deal lẫn lead', () => {
  const drop = html.slice(html.indexOf('function dropLead('), html.indexOf('function leadCardHTML('));
  assert.ok(drop.includes('confirmStageChange(l,'), 'dropLead phải hỏi qua helper confirm dùng chung như drop() của deal');
  assert.ok(drop.includes('syncLeadDealStatus(l.id, { preserveManualConverted: true })'), 'đổi trạng thái ở board phải giữ bất biến converted như saveLead');
  assert.ok(drop.includes('save();'), 'đổi trạng thái ở board phải qua đường lưu save() chuẩn');
  const csc = html.slice(html.indexOf('function confirmStageChange('), html.indexOf('function confirmMoveStage'));
  assert.ok(csc.includes('ent.title') && csc.includes('Chuyển stage của deal'), 'nhánh deal của helper phải giữ nguyên câu chữ cũ');
  assert.ok(csc.includes('Chuyển trạng thái của lead'), 'nhánh lead của helper phải có câu chữ cho lead');
  const card = html.slice(html.indexOf('function leadCardHTML('), html.indexOf('function vLeadsPipeline('));
  assert.ok(card.includes("openLead('") || card.includes('openLead('), 'thẻ phải bấm mở drawer lead');
  assert.ok(card.includes('openCompany('), 'tên công ty trên thẻ phải bấm mở drawer công ty');
  assert.ok(card.includes('mainContactBadgeHTML(l)'), 'thẻ phải có chip ★ Đầu mối chính qua helper dùng chung');
  assert.ok(card.includes('lineColor(l.line)') && card.includes('lineName(l.line)'), 'chip mảng trên thẻ phải qua helper lineColor/lineName như leadRowHTML');
});

/* ---------- Render board ---------- */
test('board: cột đúng thứ tự LEAD_STATUSES, thẻ đủ tên/công ty/Position/chip ★/chip mảng, cột đóng Not yet have demand', () => {
  const h = loadIndex();
  const view = openBoard(h);
  const cs = cols(view);
  assert.deepEqual(cs.map(c => c.key), ALL_KEYS, 'board phải có đúng 12 cột theo thứ tự LEAD_STATUSES');
  const byKey = Object.fromEntries(cs.map(c => [c.key, c.html]));
  assert.ok(byKey.new.includes('Lead New One') && byKey.new.includes('★ Đầu mối chính'), 'thẻ lead main phải có chip ★ Đầu mối chính');
  assert.ok(byKey.new.includes('Anh Minh'), 'thẻ phải hiện Position (field person)');
  assert.ok(byKey.new.includes("openCompany('c1')") && byKey.new.includes('Cong Ty Mot Fixture'), 'thẻ phải có tên công ty bấm mở drawer công ty');
  assert.ok(byKey.new.includes('>Publishing</span>'), 'thẻ phải có chip mảng');
  assert.ok(view.includes('lead-col-closed" data-lead-status="not_yet_have_demand"'), 'cột Not yet have demand phải mang class cột đóng (lead-col-closed) trên chính cột của nó');
  assert.ok(byKey.not_yet_have_demand.includes('Lead Closed One'));
  assert.ok(byKey.converted.includes('Lead Converted One'));
  /* Bấm thẻ mở drawer lead; lead converted vẫn xem được deal của nó trong drawer */
  h.run("openLead('lconv')");
  const drawer = h.getEl('drawer').innerHTML;
  assert.ok(drawer.includes('Lead Converted One') && drawer.includes('Deal Lien Quan Fixture'), 'drawer của lead ở cột Đã chuyển đổi phải hiện deal liên quan như thường');
});

test('board: lead trạng thái lạ KHÔNG hiện trên board, có ghi chú số lượng bị ẩn + nút về Block; ở Block thì vẫn thấy', () => {
  const h = loadIndex();
  const view = openBoard(h);
  assert.ok(!view.includes('Lead Weird One'), 'lead trạng thái lạ không được hiện ở bất kỳ cột nào của board');
  assert.ok(view.includes('1 lead') && view.includes('trạng thái lạ'), 'phải có ghi chú ghi rõ số lead bị ẩn vì trạng thái lạ');
  assert.ok(view.includes("setLeadViewMode('block')"), 'ghi chú phải có đường quay về view Block');
  h.run('setLeadViewMode("block");');
  const blockView = h.getEl('view').innerHTML;
  assert.ok(blockView.includes('Lead Weird One'), 'về Block: lead lạ phải hiện ở block Khác như cũ');
  const bKeys = cols(blockView).map(c => c.key);
  assert.equal(bKeys[bKeys.length - 1], '__unknown__', 'block Khác vẫn ở cuối trong view Block');
});

test('board: cột đông chỉ dựng 50 thẻ đầu + nút Hiển thị thêm tăng dần; số đếm vẫn là toàn tập đã lọc', () => {
  const h = loadIndex();
  let view = openBoard(h);
  let byKey = Object.fromEntries(cols(view).map(c => [c.key, c.html]));
  assert.equal(cardsIn(byKey.sent_connect), 50, 'cột Sent connect (60 lead) chỉ được dựng 50 thẻ đầu');
  assert.ok(byKey.sent_connect.includes('>60</span>'), 'số đếm đầu cột vẫn phải là 60 (toàn tập đã lọc)');
  assert.ok(byKey.sent_connect.includes("showMoreLeadBoard('sent_connect')") && byKey.sent_connect.includes('Hiển thị thêm (10 lead nữa)'), 'phải có nút Hiển thị thêm kèm số còn lại');
  assert.ok(byKey.sent_connect.includes('Đang hiện 50 / 60 lead của cột'));
  assert.equal((view.match(/ondragstart="dragLead\(/g) || []).length, 55, 'toàn board: 50 (sent) + new/contacted/converted/closed/qualified mỗi cột 1');
  h.run("showMoreLeadBoard('sent_connect');");
  view = h.getEl('view').innerHTML;
  byKey = Object.fromEntries(cols(view).map(c => [c.key, c.html]));
  assert.equal(cardsIn(byKey.sent_connect), 60, 'sau Hiển thị thêm: dựng đủ 60 thẻ');
  assert.ok(!byKey.sent_connect.includes('Hiển thị thêm'), 'hết lead thì nút Hiển thị thêm biến mất');
});

/* ---------- Kéo-thả ---------- */
test('dropLead: đồng ý confirm -> trạng thái đổi đúng + lưu xuống kho + confirm nêu nhãn cũ → mới', () => {
  const h = loadIndex();
  openBoard(h);
  h.setConfirm(true);
  h.run("dragLead(null, 'lnew')");
  h.run("dropLead({ preventDefault() {} }, 'contacted')");
  assert.equal(h.run("S.leads.find(l=>l.id==='lnew').status"), 'contacted', 'trạng thái trong state phải đổi');
  const saved = JSON.parse(h.ls.getItem('sava_crm_shared_v1'));
  assert.equal(saved.leads.find(l => l.id === 'lnew').status, 'contacted', 'trạng thái mới phải được lưu qua save()');
  assert.ok(h.confirmMsgs.some(m => m.includes('Lead New One') && m.includes('Mới') && m.includes('Đã liên hệ')), 'confirm phải nêu lead + trạng thái cũ → mới: ' + h.confirmMsgs.join(' | '));
  const byKey = Object.fromEntries(cols(h.getEl('view').innerHTML).map(c => [c.key, c.html]));
  assert.ok(byKey.contacted.includes('Lead New One') && !byKey.new.includes('Lead New One'), 'board dựng lại: thẻ phải nhảy sang cột mới');
});

test('dropLead: huỷ confirm -> trạng thái KHÔNG đổi + KHÔNG lưu; thả về đúng cột cũ -> không hỏi, không ghi', () => {
  const h = loadIndex();
  openBoard(h);
  const before = h.ls.getItem('sava_crm_shared_v1');
  h.setConfirm(false);
  h.run("dragLead(null, 'lcontacted')");
  h.run("dropLead({ preventDefault() {} }, 'qualified')");
  assert.equal(h.run("S.leads.find(l=>l.id==='lcontacted').status"), 'contacted', 'huỷ confirm -> trạng thái giữ nguyên');
  assert.equal(h.ls.getItem('sava_crm_shared_v1'), before, 'huỷ confirm -> không được ghi xuống kho (không save)');
  const msgsBefore = h.confirmMsgs.length;
  h.setConfirm(true);
  h.run("dragLead(null, 'lcontacted')");
  h.run("dropLead({ preventDefault() {} }, 'contacted')");
  assert.equal(h.confirmMsgs.length, msgsBefore, 'thả về đúng cột cũ -> không được hỏi confirm');
  assert.equal(h.ls.getItem('sava_crm_shared_v1'), before, 'thả về đúng cột cũ -> không được ghi');
});

test('dropLead: lead đang gắn deal kéo sang cột khác -> bất biến P2 giữ status "converted" như form sửa lead', () => {
  const h = loadIndex();
  openBoard(h);
  h.setConfirm(true);
  h.run("dragLead(null, 'lconv')");
  h.run("dropLead({ preventDefault() {} }, 'contacted')");
  assert.equal(h.run("S.leads.find(l=>l.id==='lconv').status"), 'converted', 'lead còn gắn deal thì status cuối vẫn là converted (syncLeadDealStatus)');
  const saved = JSON.parse(h.ls.getItem('sava_crm_shared_v1'));
  assert.equal(saved.leads.find(l => l.id === 'lconv').status, 'converted', 'bản đã lưu cũng phải là converted');
});

/* ---------- Lọc / nhất quán ---------- */
test('board: tìm kiếm + lọc mảng áp y hệt view Block; số đầu cột là số sau lọc, khác tổng thì kèm "trên tổng"', () => {
  const h = loadIndex();
  h.run('curView = "leads"; setLeadViewMode("pipeline"); curLine = "all"; query = "tok-sent"; render();');
  let byKey = Object.fromEntries(cols(h.getEl('view').innerHTML).map(c => [c.key, c.html]));
  assert.equal(cardsIn(byKey.sent_connect), 50, 'tìm tok-sent: cột Sent connect vẫn cap 50/60 thẻ');
  assert.ok(byKey.sent_connect.includes('>60</span>'), 'đầu cột Sent connect = 60 sau lọc');
  assert.equal(cardsIn(byKey.new), 0, 'cột Mới không còn lead khớp');
  assert.ok(byKey.new.includes('0 sau lọc · trên tổng 1 lead'), 'số sau lọc khác tổng -> phải kèm tổng toàn bộ của trạng thái');
  h.run('query = ""; curLine = "ai"; render();');
  const view = h.getEl('view').innerHTML;
  byKey = Object.fromEntries(cols(view).map(c => [c.key, c.html]));
  assert.deepEqual(cols(view).map(c => c.key), ALL_KEYS, 'đang lọc mảng vẫn giữ đủ 12 cột làm đích kéo-thả');
  assert.equal((view.match(/ondragstart="dragLead\(/g) || []).length, 1, 'lọc mảng ai: chỉ 1 thẻ (lead ai) hiện trên toàn board');
  assert.ok(byKey.qualified.includes('Lead Ai One'));
});

test('nhất quán: đổi trạng thái ở board phản ánh ngay ở view Block; chế độ xem là state hiển thị thuần tuý (không lọt vào dữ liệu lưu)', () => {
  const h = loadIndex();
  openBoard(h);
  h.setConfirm(true);
  h.run("dragLead(null, 'lnew')");
  h.run("dropLead({ preventDefault() {} }, 'qualified')");
  h.run('setLeadViewMode("block");');
  const byKey = Object.fromEntries(cols(h.getEl('view').innerHTML).map(c => [c.key, c.html]));
  assert.ok(byKey.qualified.includes('Lead New One') && !byKey.new.includes('Lead New One'), 'về Block: lead phải nằm ở block Đạt chuẩn');
  h.run("openLead('lnew')");
  assert.ok(h.getEl('drawer').innerHTML.includes('Đạt chuẩn'), 'drawer lead phải hiện trạng thái mới ngay');
  assert.equal(h.run("Object.prototype.hasOwnProperty.call(S, 'leadViewMode')"), false, 'leadViewMode không được nằm trong state dữ liệu S');
  assert.ok(!h.ls.getItem('sava_crm_shared_v1').includes('leadViewMode'), 'bản ghi xuống kho không được chứa state hiển thị');
});
