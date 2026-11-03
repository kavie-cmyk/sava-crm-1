/* Đợt 2026-11-03 — Việc 2 + Việc 3 (kịch bản video BD Yến: 2 deal
   TRÙNG TÊN "Karofi Global — cơ hội mới" cùng công ty ở Pipeline
   Metaverse, lead Daniel gắn 1 trong 2 deal) + FLOW CHỐT CUỐI của Zac
   cho kéo-thả vào cột converted (thay cơ chế CHẶN của bản aea39e4):
   - Board Lead + nút "Chuyển thành deal" dùng CHUNG entry
     openDealFormForLead (SPEC CUỐI v3): kéo lead CHƯA có deal vào cột
     converted / bấm nút -> MỞ FORM tạo deal prefill (công ty + mảng
     của lead, tiêu đề gợi ý, lead tick sẵn, pendingDealLeads) — không
     tự tạo deal, không confirm, không đổi status; đóng form không lưu
     -> 0 deal mới + storage không đổi; Lưu form (saveDeal) -> đúng 1
     deal theo thông tin đã nhập, lead thành converted, 2 trigger cho
     kết quả GIỐNG HỆT nhau (parity). Lead CHƯA có công ty: cả 2
     trigger đều VẪN mở form (không prefill công ty), không tự tạo
     công ty, huỷ -> không thay đổi gì.
   - Board Lead: lead ĐÃ có deal, status khác converted, kéo vào lại
     converted -> KHÔNG mở form/không deal mới, chỉ set converted qua
     confirm thường. Kéo NGƯỢC converted (còn deal) ra stage trước ->
     ĐƯỢC kéo, status đích lưu thật (không snap-back), deal + liên kết
     giữ nguyên; converted MỒ CÔI (0 deal) kéo ra cũng khớp cột đích.
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

/* ---------- Flow chốt cuối: kéo vào/ra cột converted ---------- */
test('(a) board: kéo lead CHƯA có deal (có công ty) vào converted -> form tạo deal MỞ prefill đúng (công ty + mảng + tiêu đề gợi ý + lead tick sẵn + pendingDealLeads); đóng form không lưu -> 0 deal mới, status nguyên, storage không đổi byte', () => {
  const h = loadIndex(); openLeadBoard(h);
  const before = h.ls.getItem('sava_crm_shared_v1');
  const dealsBefore = h.run("S.deals.length");
  h.setConfirm(true);
  h.run("dragLead(null, 'lFree')");
  h.run("dropLead({ preventDefault() {} }, 'converted')");
  assert.equal(h.confirmMsgs.length, 0, 'ca mở form KHÔNG hỏi confirmStageChange');
  assert.equal(h.run("S.leads.find(l=>l.id==='lFree').status"), 'in_response', 'status KHÔNG đổi trong lúc form mở');
  assert.equal(h.run("S.deals.length"), dealsBefore, 'chưa lưu form -> chưa có deal mới');
  /* Trạng thái form/prefill: đúng luồng openAdd của nút Chuyển thành deal */
  assert.equal(h.getEl('f_company').value, 'cK', 'form điền sẵn công ty của lead');
  assert.equal(h.getEl('f_line').value, 'metaverse', 'form điền sẵn mảng của lead');
  assert.equal(h.getEl('f_title').value, 'Karofi Global — cơ hội mới', 'form điền sẵn tiêu đề gợi ý "<Tên công ty> — cơ hội mới"');
  assert.deepEqual([...h.run("pendingDealLeads")], ['lFree'], 'pendingDealLeads phải chứa đúng lead bị kéo');
  assert.deepEqual([...h.run("dealFormLeadSelection('cK')")], ['lFree'], 'lead bị kéo được tick gắn sẵn trong ô chọn lead của form');
  assert.ok(/toggleDealFormLead\('lFree', this\.checked\)" checked/.test(h.getEl('f_leadsBox').innerHTML), 'checkbox của lead bị kéo hiện tick trong form');
  /* Board phía sau form: thẻ vẫn ở cột cũ */
  const byKey = cols(h.getEl('view').innerHTML);
  assert.ok(byKey.in_response.includes('Free Lead') && !byKey.converted.includes('Free Lead'), 'thẻ đứng ở cột cũ khi form đang mở');
  /* Đóng form không lưu (= closeAdd như nút đóng/Huỷ) */
  h.run("closeAdd()");
  assert.equal(h.run("pendingDealLeads"), null, 'đóng form -> pendingDealLeads được dọn');
  assert.equal(h.run("S.deals.length"), dealsBefore, 'đóng form không lưu -> 0 deal mới');
  assert.equal(h.run("S.leads.find(l=>l.id==='lFree').status"), 'in_response', 'đóng form không lưu -> status lead nguyên vẹn');
  assert.equal(h.ls.getItem('sava_crm_shared_v1'), before, 'toàn bộ ca kéo + đóng form KHÔNG ghi byte nào xuống kho');
});

test('(b) board: từ form mở do kéo vào converted, Lưu với thông tin nhập tay -> đúng 1 deal mới theo thông tin đã nhập, gắn đúng lead, lead = converted, deal hiện ở board Pipeline Deal ở stage đầu của mảng đã nhập', () => {
  const h = loadIndex(); openLeadBoard(h);
  const dealsBefore = h.run("S.deals.length");
  h.run("dragLead(null, 'lFree')");
  h.run("dropLead({ preventDefault() {} }, 'converted')");
  /* Người dùng nhập tay: đổi tên deal (giữ mảng metaverse của lead để
     lead khớp mảng/công ty như cơ chế pendingDealLeads), stage đầu của
     mảng do fillStages chọn sẵn trong trình duyệt thật — harness mô
     phỏng bằng cách đặt f_stage = stage đầu. */
  h.getEl('f_title').value = 'Deal Nhap Tay Tu Keo Tha';
  h.getEl('f_stage').value = h.run("LINES.metaverse.stages[0][0]");
  h.getEl('f_cur').value = 'VND';
  h.getEl('f_amount').value = '';
  h.run("saveDeal()");
  assert.equal(h.run("S.deals.length"), dealsBefore + 1, 'lưu form -> đúng 1 deal mới');
  const nd = h.run("S.deals.find(d=>d.title==='Deal Nhap Tay Tu Keo Tha')");
  assert.ok(nd, 'deal mới phải mang tên do người dùng nhập');
  assert.equal(nd.line, 'metaverse', 'deal theo mảng đã nhập/để nguyên trong form');
  assert.equal(nd.company, 'cK', 'deal thuộc đúng công ty của lead');
  assert.equal(nd.stage, h.run("LINES.metaverse.stages[0][0]"), 'deal ở stage đầu của mảng đã nhập');
  assert.deepEqual([...nd.leads], ['lFree'], 'deal gắn đúng lead bị kéo');
  assert.equal(h.run("S.leads.find(l=>l.id==='lFree').status"), 'converted', 'lưu form -> lead tự thành converted qua cơ chế sẵn có');
  const saved = JSON.parse(h.ls.getItem('sava_crm_shared_v1'));
  assert.equal(saved.leads.find(l => l.id === 'lFree').status, 'converted', 'bản đã lưu: lead converted');
  assert.ok(saved.deals.some(d => d.title === 'Deal Nhap Tay Tu Keo Tha'), 'bản đã lưu có deal mới');
  /* saveDeal chuyển sang board Pipeline Deal: deal mới hiện ở đó */
  assert.equal(h.run("curView"), 'board', 'sau lưu, app ở board Pipeline Deal như luồng nút');
  assert.ok(h.getEl('view').innerHTML.includes('Deal Nhap Tay Tu Keo Tha'), 'deal mới xuất hiện ở board Pipeline Deal');
});

test('(c) board: lead ĐÃ có deal, status khác converted, kéo vào lại converted -> KHÔNG mở form, không deal mới, status = converted sau confirm thường', () => {
  const h = loadIndex(); openLeadBoard(h);
  h.run("S.leads.find(l=>l.id==='lDaniel').status = 'contacted'"); /* có deal d1 nhưng status đang khác converted */
  const dealsBefore = h.run("S.deals.length");
  h.getEl('f_title').value = 'FORM_MARKER';
  h.setConfirm(true);
  h.run("dragLead(null, 'lDaniel')");
  h.run("dropLead({ preventDefault() {} }, 'converted')");
  assert.equal(h.getEl('f_title').value, 'FORM_MARKER', 'form tạo deal KHÔNG được mở (f_title giữ marker)');
  assert.equal(h.run("pendingDealLeads"), null, 'không có prefill nào được đặt');
  assert.equal(h.run("S.deals.length"), dealsBefore, 'không tạo deal mới');
  assert.ok(h.confirmMsgs.some(m => m.includes('Đã chuyển đổi')), 'phải hỏi qua confirmStageChange thường: ' + h.confirmMsgs.join(' | '));
  assert.equal(h.run("S.leads.find(l=>l.id==='lDaniel').status"), 'converted', 'status về converted sau confirm');
  const saved = JSON.parse(h.ls.getItem('sava_crm_shared_v1'));
  assert.equal(saved.leads.find(l => l.id === 'lDaniel').status, 'converted', 'status converted được lưu thật');
});

test('(d) board: kéo NGƯỢC lead converted CÒN deal về stage trước -> status đích lưu thật (không snap-back), deal + liên kết còn nguyên', () => {
  const h = loadIndex(); openLeadBoard(h);
  h.setConfirm(true);
  h.run("dragLead(null, 'lDaniel')");
  h.run("dropLead({ preventDefault() {} }, 'contacted')");
  assert.equal(h.run("S.leads.find(l=>l.id==='lDaniel').status"), 'contacted', 'kéo ngược: status = stage đích, không bị kéo về converted');
  const saved = JSON.parse(h.ls.getItem('sava_crm_shared_v1'));
  assert.equal(saved.leads.find(l => l.id === 'lDaniel').status, 'contacted', 'bản đã lưu cũng là stage đích');
  assert.deepEqual([...h.run("S.deals.find(d=>d.id==='d1').leads")], ['lDaniel'], 'liên kết lead↔deal giữ nguyên khi kéo ngược');
  assert.equal(h.run("S.deals.length"), 2, 'không deal nào bị xoá/thêm');
  const byKey = cols(h.getEl('view').innerHTML);
  assert.ok(byKey.contacted.includes('Daniel Tien-Duc NGUYEN') && !byKey.converted.includes('Daniel Tien-Duc NGUYEN'), 'board hiện thẻ ở cột đích ngay');
});

test('(e) PARITY nút bấm ↔ kéo thả: 2 lead tương đương cho prefill + kết quả lưu GIỐNG HỆT nhau; huỷ từ form mở bằng NÚT BẤM -> lead không đổi, 0 deal mới (ngang ca huỷ đường kéo ở (a))', () => {
  const snapshotForm = h => ({ company: h.getEl('f_company').value, line: h.getEl('f_line').value, title: h.getEl('f_title').value, pending: [...h.run("pendingDealLeads")], selection: [...h.run("dealFormLeadSelection('cK')")] });
  const saveFromForm = h => {
    h.getEl('f_title').value = 'Deal Parity Chung';
    h.getEl('f_stage').value = h.run("LINES.metaverse.stages[0][0]");
    h.getEl('f_cur').value = 'VND'; h.getEl('f_amount').value = '';
    h.run("saveDeal()");
    const nd = h.run("S.deals.find(d=>d.title==='Deal Parity Chung')");
    return { line: nd.line, company: nd.company, stage: nd.stage, leads: [...nd.leads], leadStatus: h.run("S.leads.find(l=>l.id==='lFree').status") };
  };
  /* Đường KÉO THẢ */
  const hDrag = loadIndex(); openLeadBoard(hDrag);
  hDrag.run("dragLead(null, 'lFree')");
  hDrag.run("dropLead({ preventDefault() {} }, 'converted')");
  const formDrag = snapshotForm(hDrag);
  const resDrag = saveFromForm(hDrag);
  /* Đường NÚT BẤM */
  const hBtn = loadIndex();
  hBtn.run("convertLead('lFree')");
  const formBtn = snapshotForm(hBtn);
  const resBtn = saveFromForm(hBtn);
  assert.deepEqual(formBtn, formDrag, 'prefill form từ nút bấm phải giống hệt từ kéo thả: ' + JSON.stringify(formBtn) + ' vs ' + JSON.stringify(formDrag));
  assert.deepEqual(resBtn, resDrag, 'kết quả lưu từ nút bấm phải giống hệt từ kéo thả');
  assert.deepEqual(resDrag, { line: 'metaverse', company: 'cK', stage: 'prospect', leads: ['lFree'], leadStatus: 'converted' }, 'kết quả chung: deal đúng mảng/công ty/stage đầu, gắn đúng lead, lead converted');
  /* Huỷ từ form mở bằng NÚT BẤM */
  const hCancel = loadIndex();
  const beforeCancel = hCancel.ls.getItem('sava_crm_shared_v1');
  const dealsBeforeCancel = hCancel.run("S.deals.length");
  hCancel.run("convertLead('lFree')");
  assert.deepEqual([...hCancel.run("pendingDealLeads")], ['lFree'], 'nút bấm cũng đặt prefill qua entry chung');
  hCancel.run("closeAdd()");
  assert.equal(hCancel.run("S.deals.length"), dealsBeforeCancel, 'huỷ form từ nút bấm -> 0 deal mới');
  assert.equal(hCancel.run("S.leads.find(l=>l.id==='lFree').status"), 'in_response', 'huỷ form từ nút bấm -> lead không đổi');
  assert.equal(hCancel.ls.getItem('sava_crm_shared_v1'), beforeCancel, 'huỷ form từ nút bấm -> storage không đổi byte');
});

test('(f) lead CHƯA có công ty: CẢ kéo thả VÀ nút bấm đều mở form (không prefill công ty), không tự tạo công ty; huỷ -> không thay đổi gì', () => {
  const pushNoComp = h => h.run("S.leads.push({ id:'lNoComp', name:'No Company Lead', company:'', person:'', line:'metaverse', source:'', status:'new', note:'', when:'2026-10-20' })");
  for (const trigger of ['drag', 'button']) {
    const h = loadIndex(); if (trigger === 'drag') openLeadBoard(h);
    pushNoComp(h);
    const before = h.ls.getItem('sava_crm_shared_v1');
    const companiesBefore = h.run("S.companies.length");
    const dealsBefore = h.run("S.deals.length");
    h.getEl('f_company').value = ''; /* mặc định của ô chọn công ty khi form chưa mở */
    if (trigger === 'drag') { h.run("dragLead(null, 'lNoComp')"); h.run("dropLead({ preventDefault() {} }, 'converted')"); }
    else h.run("convertLead('lNoComp')");
    assert.equal(h.getEl('f_company').value, '', trigger + ': form mở với công ty KHÔNG điền sẵn (entry không gán công ty nào — user tự chọn/tạo trong form; trình duyệt thật cũng về option placeholder khi openAdd dựng lại ô chọn mà prefill không có companyId)');
    assert.equal(h.getEl('f_line').value, 'metaverse', trigger + ': form vẫn điền sẵn mảng của lead');
    assert.deepEqual([...h.run("pendingDealLeads")], ['lNoComp'], trigger + ': lead vẫn được tick gắn sẵn qua pendingDealLeads');
    assert.equal(h.run("S.companies.length"), companiesBefore, trigger + ': KHÔNG tự tạo công ty từ tên lead');
    assert.equal(h.run("S.leads.find(l=>l.id==='lNoComp').company"), '', trigger + ': lead không bị tự gắn công ty');
    assert.equal(h.run("S.leads.find(l=>l.id==='lNoComp').status"), 'new', trigger + ': status không đổi khi form mở');
    h.run("closeAdd()");
    assert.equal(h.run("S.deals.length"), dealsBefore, trigger + ': huỷ -> 0 deal mới');
    assert.equal(h.run("S.companies.length"), companiesBefore, trigger + ': huỷ -> không thêm công ty');
    assert.equal(h.run("S.leads.find(l=>l.id==='lNoComp').status"), 'new', trigger + ': huỷ -> status nguyên vẹn');
    assert.equal(h.ls.getItem('sava_crm_shared_v1'), before, trigger + ': huỷ -> storage không đổi byte');
  }
});

test('board: lead converted MỒ CÔI (0 deal) kéo ra cột khác -> ĐƯỢC kéo, trạng thái khớp cột đích ngay', () => {
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
