/* Đợt 2026-11-03 — Việc 2 (bất biến converted ⟺ ≥1 deal) + Việc 3
   (kịch bản video BD Yến: 2 deal TRÙNG TÊN "Karofi Global — cơ hội mới"
   cùng công ty ở Pipeline Metaverse, lead Daniel gắn 1 trong 2 deal):
   - Board Lead: thả VÀO cột converted -> chặn + toast hướng dẫn nút
     "Chuyển thành deal" (không confirm, không mutate, không save).
   - Board Lead: kéo lead converted CÒN deal ra cột khác -> chặn + toast
     (phải gỡ khỏi deal trước); converted MỒ CÔI (0 deal, lệch cũ) ->
     kéo được, trạng thái sau thao tác khớp cột đích (tự chữa).
   - Form Lead: converted không chọn tay được — lead converted hiện
     nhãn cố định + chú thích "tự động theo deal"; lead chưa converted
     không có option converted (và không còn option qualified).
   - Kịch bản video: kéo deal trùng tên giữa các stage (Đồng ý + Huỷ ở
     confirmStageChange, kể cả khi board Deal đang sort theo tên) chỉ
     đụng ĐÚNG deal được kéo (ánh xạ theo id, không theo tên/thứ tự);
     gỡ lead duy nhất khỏi 1 deal -> deal kia nguyên vẹn, lead hồi
     "contacted" và hiện đúng ở Block + Board ngay sau thao tác.
   Harness vm theo mẫu lead-pipeline-board: nạp script inline thật,
   confirm/toast điều khiển + ghi lại được. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');

function fixtureState() {
  return {
    members: [{ id: 'yen', name: 'Yến', role: 'BD', active: true }],
    companies: [{ id: 'cK', name: 'Karofi Global', type: 'Doanh nghiep', roles: { metaverse: 'Khach hang' }, last: 'Hom nay' }],
    games: [],
    deals: [
      { id: 'd1', line: 'metaverse', title: 'Karofi Global — cơ hội mới', company: 'cK', stage: 'prospect', owner: 'yen', due: '', idle: 0, custom: {}, leads: ['lDaniel'], amount: 0, cur: 'VND' },
      { id: 'd2', line: 'metaverse', title: 'Karofi Global — cơ hội mới', company: 'cK', stage: 'prospect', owner: 'yen', due: '', idle: 0, custom: {}, leads: [], amount: 0, cur: 'VND' },
    ],
    leads: [
      { id: 'lDaniel', name: 'Daniel Tien-Duc NGUYEN', company: 'cK', person: 'Deputy Group CEO', line: 'metaverse', source: 'Chu dong tiep can', status: 'converted', note: '', when: '2026-10-09' },
      { id: 'lOrphan', name: 'Mai Quang Duc', company: 'cK', person: 'Sale Executive', line: 'metaverse', source: 'Su kien', status: 'converted', note: '', when: '2026-10-14' },
      { id: 'lFree', name: 'Free Lead', company: 'cK', person: '', line: 'metaverse', source: '', status: 'in_response', note: '', when: '2026-10-01' },
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
  let confirmAnswer = true; const confirmMsgs = []; const toasts = [];
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
  /* toast thật ghi vào #toast (shared.js); ghi lại qua textContent của element đó */
  const toastEl = getEl('toast');
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx), confirmMsgs, setConfirm: v => { confirmAnswer = v; },
    lastToast: () => toastEl.textContent || '' };
}
function cols(view) {
  const parts = view.split(/(?=data-lead-status=")/).slice(1);
  return Object.fromEntries(parts.map(p => [p.slice('data-lead-status="'.length, p.indexOf('"', 'data-lead-status="'.length)), p]));
}
const openLeadBoard = h => { h.run('curView = "leads"; curLine = "all"; query = ""; setLeadViewMode("pipeline");'); };

/* ---------- Việc 2: chặn kéo-thả 2 chiều ---------- */
test('board: thả lead KHÔNG deal vào cột converted -> chặn + toast hướng dẫn nút Chuyển thành deal, không confirm/mutate/save', () => {
  const h = loadIndex(); openLeadBoard(h);
  const before = h.ls.getItem('sava_crm_shared_v1');
  h.setConfirm(true);
  h.run("dragLead(null, 'lFree')");
  h.run("dropLead({ preventDefault() {} }, 'converted')");
  assert.equal(h.run("S.leads.find(l=>l.id==='lFree').status"), 'in_response', 'trạng thái không đổi khi bị chặn');
  assert.equal(h.ls.getItem('sava_crm_shared_v1'), before, 'không ghi dữ kiện khi bị chặn');
  assert.equal(h.confirmMsgs.length, 0, 'chặn trước confirm');
  assert.ok(h.lastToast().includes('Chuyển thành deal'), 'toast phải hướng dẫn dùng nút Chuyển thành deal: ' + h.lastToast());
});

test('board: kéo lead converted CÒN deal ra cột khác -> chặn + toast phải gỡ khỏi deal trước, không confirm/mutate/save', () => {
  const h = loadIndex(); openLeadBoard(h);
  const before = h.ls.getItem('sava_crm_shared_v1');
  h.setConfirm(true);
  h.run("dragLead(null, 'lDaniel')");
  h.run("dropLead({ preventDefault() {} }, 'contacted')");
  assert.equal(h.run("S.leads.find(l=>l.id==='lDaniel').status"), 'converted');
  assert.equal(h.ls.getItem('sava_crm_shared_v1'), before, 'không ghi dữ kiện khi bị chặn');
  assert.equal(h.confirmMsgs.length, 0, 'chặn trước confirm');
  assert.ok(h.lastToast().includes('gỡ lead khỏi mọi deal trước'), 'toast phải nêu phải gỡ khỏi deal trước: ' + h.lastToast());
  const byKey = cols(h.getEl('view').innerHTML);
  assert.ok(byKey.converted.includes('Daniel Tien-Duc NGUYEN'), 'thẻ về chỗ cũ ở cột converted sau khi bị chặn');
});

test('board: lead converted MỒ CÔI (0 deal) kéo ra cột khác -> ĐƯỢC kéo, trạng thái khớp cột đích ngay (tự chữa)', () => {
  const h = loadIndex(); openLeadBoard(h);
  h.setConfirm(true);
  h.run("dragLead(null, 'lOrphan')");
  h.run("dropLead({ preventDefault() {} }, 'contacted')");
  assert.equal(h.run("S.leads.find(l=>l.id==='lOrphan').status"), 'contacted', 'converted mồ côi kéo ra: trạng thái = cột đích');
  const saved = JSON.parse(h.ls.getItem('sava_crm_shared_v1'));
  assert.equal(saved.leads.find(l => l.id === 'lOrphan').status, 'contacted', 'bản đã lưu cũng khớp cột đích');
  const byKey = cols(h.getEl('view').innerHTML);
  assert.ok(byKey.contacted.includes('Mai Quang Duc') && !byKey.converted.includes('Mai Quang Duc'), 'board hiện đúng cột mới ngay');
});

/* ---------- Việc 2: form Lead ---------- */
test('form lead: lead converted hiện nhãn cố định + chú thích tự động theo deal, KHÔNG có select chọn trạng thái; lead chưa converted không có option converted/qualified', () => {
  const h = loadIndex();
  h.run("editLead('lDaniel')");
  const boxConv = h.getEl('editBox').innerHTML;
  assert.ok(boxConv.includes('Đã chuyển đổi') && boxConv.includes('tự động theo deal'), 'lead converted: nhãn cố định + chú thích tự động theo deal');
  assert.ok(!boxConv.includes('<select id="e_lstatus"'), 'lead converted: không còn select trạng thái để chọn tay');
  assert.ok(boxConv.includes('<input type="hidden" id="e_lstatus" value="converted">'), 'giá trị converted được giữ qua hidden input (saveLead đọc đúng, không rơi về rỗng)');
  h.run("editLead('lFree')");
  const boxFree = h.getEl('editBox').innerHTML;
  assert.ok(boxFree.includes('<select id="e_lstatus"'), 'lead chưa converted: vẫn có select trạng thái');
  assert.ok(!boxFree.includes('<option value="converted"'), 'không có option converted để chọn tay');
  assert.ok(!boxFree.includes('<option value="qualified"'), 'không còn option qualified (stage đã bỏ)');
  assert.ok(boxFree.includes('<option value="in_response" selected>'), 'status hiện tại vẫn được chọn sẵn');
});

test('form lead: lưu lead converted (không đụng trạng thái) -> vẫn converted vì còn deal; lưu lead không deal với status thường -> giữ nguyên', () => {
  const h = loadIndex();
  const fill = (over) => {
    const vals = Object.assign({ e_lname: 'X', e_lcompany: 'cK', e_lperson: '', e_lphone: '', e_lemail: '', e_llinkedin: '', e_lowner: '', e_lline: 'metaverse', e_lsource: '', e_lstatus: 'converted', e_lwhen: '', e_lnote: '' }, over || {});
    for (const [id, v] of Object.entries(vals)) h.getEl(id).value = v;
    h.getEl('e_lmain').checked = false;
  };
  h.run("editLead('lDaniel')"); fill({ e_lname: 'Daniel Tien-Duc NGUYEN' });
  h.run("saveLead('lDaniel')");
  assert.equal(h.run("S.leads.find(l=>l.id==='lDaniel').status"), 'converted', 'lead còn deal: form không hạ được converted');
  h.run("editLead('lFree')"); fill({ e_lname: 'Free Lead', e_lstatus: 'contacted' });
  h.run("saveLead('lFree')");
  assert.equal(h.run("S.leads.find(l=>l.id==='lFree').status"), 'contacted', 'lead không deal: status chọn ở form được giữ');
});

/* ---------- Việc 3: kịch bản video — deal trùng tên ---------- */
test('video: 2 deal trùng tên cùng công ty — kéo deal giữa các stage (Đồng ý/Huỷ, board đang sort theo tên) chỉ đụng đúng deal theo id', () => {
  const h = loadIndex();
  h.run("curLine = 'metaverse'; curView = 'board'; listSortStates = { deals: { key: 'name', dir: 'desc' } }; render();");
  const view = h.getEl('view').innerHTML;
  assert.ok((view.match(/Karofi Global — cơ hội mới/g) || []).length >= 2, 'board phải hiện cả 2 deal trùng tên');
  const stage1 = h.run("LINES.metaverse.stages[1][0]");
  /* Đồng ý: chỉ d1 chuyển stage, d2 nguyên */
  h.setConfirm(true);
  h.run("drag(null, 'd1')");
  h.run(`drop({ preventDefault() {} }, 'metaverse', '${stage1}')`);
  assert.equal(h.run("S.deals.find(d=>d.id==='d1').stage"), stage1, 'deal được kéo phải chuyển stage');
  assert.equal(h.run("S.deals.find(d=>d.id==='d2').stage"), 'prospect', 'deal trùng tên còn lại KHÔNG bị đụng');
  /* Huỷ ở confirm: d2 không đổi + không ghi */
  const before = h.ls.getItem('sava_crm_shared_v1');
  h.setConfirm(false);
  h.run("drag(null, 'd2')");
  h.run(`drop({ preventDefault() {} }, 'metaverse', '${stage1}')`);
  assert.equal(h.run("S.deals.find(d=>d.id==='d2').stage"), 'prospect', 'huỷ confirm -> stage giữ nguyên');
  assert.equal(h.ls.getItem('sava_crm_shared_v1'), before, 'huỷ confirm -> không save');
});

test('video: gỡ lead duy nhất khỏi deal #1 -> deal #2 nguyên vẹn, lead hồi contacted và Block + Board hiện đúng contacted ngay', () => {
  const h = loadIndex();
  h.setConfirm(true);
  h.run("detachLeadFromDeal('lDaniel', 'd1')");
  assert.ok(h.confirmMsgs.some(m => m.includes('hồi về "contacted" (Đã liên hệ)')), 'confirm gỡ phải nêu hồi về contacted (Đã liên hệ): ' + h.confirmMsgs.join(' | '));
  assert.equal(h.run("S.leads.find(l=>l.id==='lDaniel').status"), 'contacted', 'gỡ deal cuối -> hồi contacted');
  assert.deepEqual([...h.run("S.deals.find(d=>d.id==='d1').leads")], [], 'deal #1 hết lead');
  assert.deepEqual([...h.run("S.deals.find(d=>d.id==='d2').leads")], [], 'deal #2 vốn không có lead — giữ nguyên');
  assert.equal(h.run("S.deals.find(d=>d.id==='d2').stage"), 'prospect', 'deal #2 không bị đụng stage');
  /* Hiển thị khớp ngay: Block + Board đều đặt Daniel ở contacted */
  h.run('curView = "leads"; curLine = "all"; query = ""; setLeadViewMode("block"); render();');
  let byKey = cols(h.getEl('view').innerHTML);
  assert.ok(byKey.contacted.includes('Daniel Tien-Duc NGUYEN') && !byKey.converted.includes('Daniel Tien-Duc NGUYEN'), 'Block: Daniel ở block Đã liên hệ ngay sau gỡ');
  h.run('setLeadViewMode("pipeline");');
  byKey = cols(h.getEl('view').innerHTML);
  assert.ok(byKey.contacted.includes('Daniel Tien-Duc NGUYEN') && !byKey.converted.includes('Daniel Tien-Duc NGUYEN'), 'Board: Daniel ở cột Đã liên hệ ngay sau gỡ');
});

test('video: lead còn deal khác — gỡ khỏi 1 deal thì vẫn converted; kéo lead qua các cột thường (không deal) hoạt động bình thường', () => {
  const h = loadIndex();
  h.run("S.deals.find(d=>d.id==='d2').leads = ['lDaniel']");
  h.setConfirm(true);
  h.run("detachLeadFromDeal('lDaniel', 'd1')");
  assert.equal(h.run("S.leads.find(l=>l.id==='lDaniel').status"), 'converted', 'còn deal #2 -> vẫn converted');
  /* Kéo lead không deal qua nhiều cột */
  openLeadBoard(h);
  for (const target of ['contacted', 'first_email', 'new']) {
    h.run("dragLead(null, 'lFree')");
    h.run(`dropLead({ preventDefault() {} }, '${target}')`);
    assert.equal(h.run("S.leads.find(l=>l.id==='lFree').status"), target, 'kéo lead thường tới ' + target);
  }
});

/* ---------- Tĩnh: không còn bề mặt qualified ---------- */
test('tĩnh: LEAD_STATUSES + form + bộ lọc + phễu không còn qualified; phễu đường chính 10 trạng thái', () => {
  const seg = html.slice(html.indexOf('const LEAD_STATUSES'), html.indexOf('const LEAD_STATUS_UNKNOWN'));
  assert.ok(!seg.includes('"qualified"'), 'LEAD_STATUSES không còn qualified');
  assert.equal([...seg.matchAll(/key:\s*"([^"]+)"/g)].length, 11, 'LEAD_STATUSES còn 11 key (gồm not_yet_have_demand)');
  assert.ok(html.includes('reachedContactedPlus'), 'phễu dùng khái niệm reachedContactedPlus');
  assert.ok(html.includes('đã tới bước Đã liên hệ trở lên'), 'dòng tóm tắt phễu đổi sang Đã liên hệ trở lên');
  assert.ok(!html.includes('qualifiedPlus'), 'không còn qualifiedPlus ở index.html');
});
