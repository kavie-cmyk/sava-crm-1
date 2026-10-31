/* Đợt 7 quyết định (P1–P7) — cụm BD index (index.html + supabase-data.js):
   - P1: gắn Lead↔Deal CHỈ khi lead.company === deal.company — ở mọi đường
     gắn (hàm gắn trung tâm, dropdown drawer deal, dropdown drawer lead,
     form tạo deal) VÀ chốt cuối ở đường lưu save(): liên kết chéo MỚI bị từ
     chối, liên kết chéo ĐÃ TỒN TẠI (có trong bản chụp crmPrevSnap) không bị
     bất kỳ lần lưu nào xoá, vẫn hiện ở nhóm đã gắn kèm "(khác công ty)" và
     gỡ tay được. Deal chưa có công ty -> không gắn được lead nào.
   - P2: bất biến status lead theo deal qua helper trung tâm
     syncLeadDealStatus: có ≥1 deal -> "converted"; mất deal cuối ->
     "qualified"; áp ở gắn/gỡ/xoá deal/form tạo + sửa deal/convertLead.
     Migration 1 lần (marker state.leadDealStatusMigrated) chuẩn hoá lead
     đã gắn deal mà chưa "converted"; KHÔNG hồi lead "converted" không deal.
   - P3: defaultOwnerId resolve qua window.SavaAuth.currentUser().memberId
     (đúng nguồn publishing.js currentRequesterId dùng); không resolve được
     -> "" + placeholder "— Chọn người phụ trách —", không còn fallback cứng.
   - P4: Final v2 + Final legacy + Partner Fit phía index qua
     window.fmtFinalScore / fmtFitScore; fmtNum1 giữ cho điểm thành phần.
   - P5: noun của Task là "Việc" khắp index.html — "Công việc" chỉ còn ở 2
     dòng COMMENT đã liệt kê; hết "năng lực studio".
   - P6: màn hình "Lịch sử tổng" chỉ Admin (nav gate + view chặn), đọc qua
     SavaAudit.listRecent (limit 200, lọc entity_type/by_member_id ở tầng
     query), định dạng bằng entryHTML dùng chung của audit.js, gồm mục của
     đối tượng đã xoá (tên khôi phục từ changes của mục delete).
   Fixture nằm trong file test này — seed production vẫn là emptyState. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tick = () => new Promise(r => setTimeout(r, 0));

/* ---------- Harness index.html THẬT (mẫu deal-lead-groups + audit.js) ---------- */
function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [
      { id: 'zac', name: 'Zac', role: 'Admin', active: true },
      { id: 'linh', name: 'Linh', role: 'BD', active: true },
      { id: 'mai', name: 'Mai', role: 'BD', active: true },
    ],
    companies: [
      { id: 'c1', name: 'Công ty Một', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hôm qua' },
      { id: 'c2', name: 'Công ty Hai', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, last: 'Hôm nay' },
      { id: 'c3', name: 'Công ty Ba', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, last: 'Hôm nay' },
    ],
    games: [{ id: 'g1', title: 'Game Một', own: 'partner', company: 'c1', genre: 'Puzzle', platform: 'Android', stage: 'Prototype', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '' }],
    deals: [
      { id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', game: 'g1', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] },
      { id: 'dMig', line: 'publishing', title: 'Deal Mig', company: 'c1', game: 'g1', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: ['lMig'] },
      { id: 'dCross', line: 'publishing', title: 'Deal Chéo', company: 'c1', game: 'g1', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: ['lCross'] },
      { id: 'dNoCo', line: 'ai', title: 'Deal Không Công Ty', company: '', stage: 'prospect', owner: 'linh', due: '', idle: 0, custom: {}, amount: 0, cur: 'VND', leads: [] },
      { id: 'dOther', line: 'ai', title: 'Deal Công Ty Hai', company: 'c2', stage: 'prospect', owner: 'linh', due: '', idle: 0, custom: {}, amount: 0, cur: 'VND', leads: [] },
    ],
    leads: [
      { id: 'lA', name: 'Người A', company: 'c1', person: 'Anh A — CEO', phone: '0901', line: 'publishing', source: 'Giới thiệu', status: 'new', note: '', when: '2026-10-01', mainContact: true },
      { id: 'lB', name: 'Người B', company: 'c1', person: 'Chị B — CTO', phone: '0902', line: 'publishing', source: 'Giới thiệu', status: 'qualified', note: '', when: '2026-10-02', mainContact: false },
      { id: 'lCross', name: 'Người Chéo', company: 'c2', person: '', phone: '', line: 'ai', source: '', status: 'new', note: '', when: '2026-10-03', mainContact: false },
      { id: 'lNoCo', name: 'Lead Không Công Ty', company: '', person: '', phone: '', line: 'ai', source: '', status: 'new', note: '', when: '2026-10-04', mainContact: false },
      { id: 'lMig', name: 'Người Mig', company: 'c1', person: '', phone: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-10-05', mainContact: false },
      { id: 'lConvNoDeal', name: 'Người Converted Không Deal', company: 'c1', person: '', phone: '', line: 'publishing', source: '', status: 'converted', note: '', when: '2026-10-06', mainContact: false },
      { id: 'lC3', name: 'Người C3', company: 'c3', person: '', phone: '', line: 'ai', source: '', status: 'new', note: '', when: '2026-10-07', mainContact: true },
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
  for (const f of ['apple-ui.js', 'shared.js', 'audit.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}
const leadStatus = (run, id) => run(`S.leads.find(l=>l.id==='${id}').status`);
const dealLeads = (run, id) => [...run(`S.deals.find(d=>d.id==='${id}').leads`)];

/* ================= P1 ================= */
test('P1: gắn lead CÙNG công ty qua attachLeadToDeal -> vào deal.leads + lead thành converted (P2)', () => {
  const { run } = loadIndex();
  run("attachLeadToDeal('lB','d1')");
  assert.deepEqual(dealLeads(run, 'd1'), ['lB']);
  assert.equal(leadStatus(run, 'lB'), 'converted');
});

test('P1: gắn lead KHÁC công ty qua hàm gắn -> bị chặn, deal.leads không đổi, toast nêu rõ khác công ty', () => {
  const { run, getEl } = loadIndex();
  run("attachLeadToDeal('lCross','d1')");
  assert.deepEqual(dealLeads(run, 'd1'), [], 'gắn chéo không được thêm lead vào deal');
  assert.ok(getEl('toast').textContent.includes('công ty khác'), 'toast phải nêu rõ lý do khác công ty: ' + getEl('toast').textContent);
});

test('P1: chốt ở đường LƯU — push chéo thẳng vào state rồi save() cũng bị từ chối; gắn cùng công ty giữ nguyên', () => {
  const { run, ls } = loadIndex();
  run("S.deals.find(d=>d.id==='d1').leads.push('lCross'); S.deals.find(d=>d.id==='d1').leads.push('lB'); save();");
  assert.deepEqual(dealLeads(run, 'd1'), ['lB'], 'lead chéo MỚI thêm bị gỡ ngay tại save(), lead cùng công ty giữ');
  const saved = JSON.parse(ls.getItem('sava_crm_shared_v1'));
  assert.deepEqual(saved.deals.find(d => d.id === 'd1').leads, ['lB'], 'bản ghi xuống kho cũng không chứa liên kết chéo mới');
});

test('P1: liên kết chéo ĐÃ TỒN TẠI không bị xoá bởi lần lưu không liên quan; hiện ở nhóm đã gắn kèm "(khác công ty)" và gỡ được', () => {
  const { run, getEl } = loadIndex();
  run("S.deals.find(d=>d.id==='d1').title = 'Deal Một Đổi Tên'; save();");
  assert.deepEqual(dealLeads(run, 'dCross'), ['lCross'], 'lưu sửa deal khác KHÔNG được xoá liên kết chéo sẵn có');
  run("S.companies.find(c=>c.id==='c1').last = 'Vừa sửa'; save();");
  assert.deepEqual(dealLeads(run, 'dCross'), ['lCross'], 'lưu không liên quan ở entity khác cũng không xoá liên kết chéo sẵn có');
  run("openDeal('dCross')");
  const drawer = getEl('drawer').innerHTML;
  const gA = drawer.slice(drawer.indexOf('Đã gắn vào deal này'), drawer.indexOf('Lead của công ty (chưa gắn'));
  assert.ok(gA.includes("openLead('lCross')"), 'lead chéo sẵn có vẫn hiện ở nhóm đã gắn');
  assert.ok(gA.includes('(khác công ty)'), 'phải có ghi chú nhẹ "(khác công ty)"');
  assert.ok(gA.includes("detachLeadFromDeal('lCross','dCross')"), 'vẫn gỡ tay được như thường');
  run("detachLeadFromDeal('lCross','dCross')");
  assert.deepEqual(dealLeads(run, 'dCross'), [], 'gỡ tay liên kết chéo sẵn có phải chạy');
});

test('P1: deal chưa có công ty -> không gắn được lead nào + drawer nói rõ lý do; lead chưa có công ty cũng bị chặn', () => {
  const { run, getEl } = loadIndex();
  run("attachLeadToDeal('lB','dNoCo')");
  assert.deepEqual(dealLeads(run, 'dNoCo'), []);
  assert.ok(getEl('toast').textContent.includes('chưa có công ty'));
  run("attachLeadToDeal('lNoCo','d1')");
  assert.deepEqual(dealLeads(run, 'd1'), [], 'lead chưa gắn công ty không gắn vào deal nào được');
  run("openDeal('dNoCo')");
  const drawer = getEl('drawer').innerHTML;
  assert.ok(drawer.includes('Deal chưa có công ty'), 'drawer deal phải nói rõ deal chưa có công ty');
  assert.ok(!drawer.includes('id="deal_attach_lead"'), 'deal không công ty thì không hiện dropdown gắn lead');
});

test('P1: dropdown 2 phía chỉ liệt kê cùng công ty (drawer deal + drawer lead)', () => {
  const { run, getEl } = loadIndex();
  run("openDeal('d1')");
  let drawer = getEl('drawer').innerHTML;
  const selStart = drawer.indexOf('id="deal_attach_lead"');
  assert.ok(selStart >= 0, 'drawer deal phải có dropdown gắn lead');
  const sel = drawer.slice(selStart, drawer.indexOf('</select>', selStart));
  assert.ok(sel.includes('value="lA"') && sel.includes('value="lB"'), 'dropdown deal liệt kê lead cùng công ty c1 chưa gắn');
  assert.ok(!sel.includes('value="lCross"') && !sel.includes('value="lC3"') && !sel.includes('value="lNoCo"'), 'dropdown deal KHÔNG liệt kê lead công ty khác / chưa có công ty');
  run("openLead('lB')");
  drawer = getEl('drawer').innerHTML;
  const lselStart = drawer.indexOf('id="lead_attach_deal"');
  assert.ok(lselStart >= 0, 'drawer lead phải có dropdown gắn deal');
  const lsel = drawer.slice(lselStart, drawer.indexOf('</select>', lselStart));
  assert.ok(lsel.includes('value="d1"'), 'dropdown lead liệt kê deal cùng công ty');
  assert.ok(!lsel.includes('value="dOther"') && !lsel.includes('value="dNoCo"'), 'dropdown lead KHÔNG liệt kê deal công ty khác / không công ty');
  run("openLead('lNoCo')");
  assert.ok(getEl('drawer').innerHTML.includes('Lead chưa gắn công ty'), 'lead chưa có công ty: drawer nói rõ lý do không gắn được');
});

test('P1 tĩnh: form tạo deal chỉ nhận lead thuộc công ty đã resolve (saveDeal lọc theo company) + attachLeadToDeal qua canAttachLeadToDeal', () => {
  const html = read('index.html');
  assert.ok(html.includes('l.company === c.id'), 'saveDeal phải lọc lead theo đúng công ty đã resolve');
  const attach = html.slice(html.indexOf('function attachLeadToDeal'), html.indexOf('function detachLeadFromDeal'));
  assert.ok(attach.includes('canAttachLeadToDeal(leadId, dealId)'), 'hàm gắn trung tâm phải qua chốt canAttachLeadToDeal');
  assert.ok(html.includes('function sanitizeNewCrossCompanyLeads()') && html.includes('sanitizeNewCrossCompanyLeads();'), 'save() phải gọi chốt chặn liên kết chéo mới');
});

/* ================= P2 ================= */
test('P2: gỡ khỏi deal CUỐI -> hồi qualified; gỡ khi còn deal khác -> vẫn converted', () => {
  const { run } = loadIndex();
  run("attachLeadToDeal('lB','d1'); attachLeadToDeal('lB','dMig');");
  assert.equal(leadStatus(run, 'lB'), 'converted');
  run("detachLeadFromDeal('lB','d1')");
  assert.equal(leadStatus(run, 'lB'), 'converted', 'còn dMig -> vẫn converted');
  run("detachLeadFromDeal('lB','dMig')");
  assert.equal(leadStatus(run, 'lB'), 'qualified', 'mất deal cuối -> hồi qualified');
});

test('P2: xoá deal chứa lead duy nhất -> lead hồi qualified', () => {
  const { run } = loadIndex();
  run("attachLeadToDeal('lB','d1');");
  assert.equal(leadStatus(run, 'lB'), 'converted');
  run("performDeleteDeal('d1')");
  assert.equal(leadStatus(run, 'lB'), 'qualified');
});

test('P2: form TẠO deal — lead tick trong form (không phải prefill convertLead) cũng thành converted khi lưu', () => {
  const { run, getEl } = loadIndex();
  getEl('f_line').value = 'ai';
  run('openAdd()');
  getEl('f_company').value = 'c3';
  run('onDealCompanyChange()');
  assert.deepEqual([...run("dealFormLeadSelection('c3')")], ['lC3'], 'lead main của c3 được điền sẵn');
  getEl('f_title').value = 'Deal Form P2'; getEl('f_line').value = 'ai'; getEl('f_company').value = 'c3';
  getEl('f_amount').value = ''; getEl('f_cur').value = 'VND'; getEl('f_stage').value = 'prospect'; getEl('f_owner').value = 'linh';
  run('saveDeal()');
  const nd = run("S.deals.find(d=>d.title==='Deal Form P2')");
  assert.deepEqual([...nd.leads], ['lC3']);
  assert.equal(leadStatus(run, 'lC3'), 'converted', 'lead vào deal qua form tạo -> converted trong cùng lần lưu');
});

function fillEditDealForm(getEl, over) {
  const vals = Object.assign({ e_title: 'Deal Sửa', e_company: 'c1', e_line: 'publishing', e_stage: 'build_eval', e_owner: 'linh', e_due: '', e_game: 'g1' }, over || {});
  for (const [k, v] of Object.entries(vals)) getEl(k).value = v;
}
test('P2: form SỬA deal — diff cũ/mới: lead bị bỏ ra khỏi deal trong phiên sửa -> qualified; lead thêm vào -> converted', () => {
  const a = loadIndex();
  assert.equal(leadStatus(a.run, 'lMig'), 'converted', 'lMig đã converted nhờ migration/gắn sẵn');
  a.run("editDeal('dMig')");
  a.run("S.deals.find(d=>d.id==='dMig').leads = []"); /* danh sách lead thay đổi trong phiên sửa */
  fillEditDealForm(a.getEl, { e_title: 'Deal Mig' });
  a.run("saveEditDeal('dMig')");
  assert.equal(leadStatus(a.run, 'lMig'), 'qualified', 'lead bị bỏ ra và không còn deal nào -> hồi qualified qua diff của saveEditDeal');
  const b = loadIndex();
  b.run("editDeal('d1')");
  b.run("S.deals.find(d=>d.id==='d1').leads = ['lB']");
  fillEditDealForm(b.getEl, { e_title: 'Deal Một' });
  b.run("saveEditDeal('d1')");
  assert.equal(leadStatus(b.run, 'lB'), 'converted', 'lead mới vào deal qua phiên sửa -> converted');
});

test('P2: convertLead tạo deal của chính công ty lead -> lead converted; nút "Chuyển thành deal" key theo status nên tự ẩn', () => {
  const { run, getEl } = loadIndex();
  run("convertLead('lB')");
  assert.equal(leadStatus(run, 'lB'), 'converted');
  const nd = run("S.deals.find(d=>Array.isArray(d.leads) && d.leads.includes('lB'))");
  assert.ok(nd && nd.company === 'c1', 'deal convert phải thuộc đúng công ty của lead (P1 nhất quán)');
  run('curView = "leads"; curLine = "all"; query = ""; render();');
  const view = getEl('view').innerHTML;
  assert.ok(!view.includes("convertLead('lB')"), 'lead đã converted (đã gắn deal) -> nút Chuyển thành deal ẩn');
  assert.ok(view.includes("convertLead('lA')"), 'lead chưa gắn deal nào (status new) -> nút vẫn hiện');
});

test('P2 migration: lead đã gắn deal mà chưa converted -> chuẩn hoá 1 lần nhờ marker; KHÔNG hồi lead converted-không-deal', () => {
  const { run, ls } = loadIndex();
  assert.equal(leadStatus(run, 'lMig'), 'converted', 'lMig gắn dMig với status new -> migration đưa về converted ngay khi boot');
  assert.equal(leadStatus(run, 'lConvNoDeal'), 'converted', 'lead converted KHÔNG có deal: migration tuyệt đối không hồi status');
  const saved = JSON.parse(ls.getItem('sava_crm_shared_v1'));
  assert.equal(saved.leadDealStatusMigrated, true, 'marker phải được ghi xuống kho');
  assert.equal(saved.leads.find(l => l.id === 'lMig').status, 'converted', 'trạng thái đã chuẩn hoá phải ghi xuống kho');
  /* Marker đã có: chạy lại hàm migration không đổi gì thêm (đúng 1 lần) */
  run("S.leads.find(l=>l.id==='lMig').status = 'qualified'");
  assert.equal(run('migrateLeadDealStatusesOnce(S)'), 0, 'marker còn -> migration không chạy lại');
  assert.equal(leadStatus(run, 'lMig'), 'qualified', 'sau migration, thay đổi tay không bị migration ghi đè');
});

/* ================= P3 ================= */
test('P3: defaultOwnerId = member đang đăng nhập qua SavaAuth.currentUser().memberId (2 member khác nhau -> 2 kết quả khác nhau)', () => {
  const { ctx, run } = loadIndex();
  ctx.SavaAuth = { currentUser: () => ({ memberId: 'linh', role: 'bd' }) };
  assert.equal(run('defaultOwnerId()'), 'linh');
  ctx.SavaAuth = { currentUser: () => ({ memberId: 'mai', role: 'bd' }) };
  assert.equal(run('defaultOwnerId()'), 'mai', 'đổi người đăng nhập -> mặc định đổi theo, không cứng một người');
  ctx.SavaAuth = { currentUser: () => ({ memberId: 'zac', role: 'admin' }) };
  assert.equal(run('defaultOwnerId()'), 'zac', 'zac chỉ là kết quả KHI Zac thật sự đang đăng nhập');
});

test('P3: không resolve được danh tính -> "" + placeholder "— Chọn người phụ trách —", không crash, không đoán về zac', () => {
  const { ctx, run, getEl } = loadIndex();
  ctx.SavaAuth = { currentUser: () => null };
  assert.equal(run('defaultOwnerId()'), '');
  ctx.SavaAuth = undefined;
  assert.equal(run('defaultOwnerId()'), '', 'thiếu hẳn SavaAuth cũng phải trả rỗng an toàn');
  ctx.SavaAuth = { currentUser: () => null };
  run("curLine = 'ai'; openAdd()");
  assert.ok(getEl('f_ownerWrap').innerHTML.includes('— Chọn người phụ trách —'), 'form tạo deal phải hiện placeholder chọn người phụ trách khi chưa resolve được danh tính');
});

test('P3 tĩnh: defaultOwnerId resolve qua SavaAuth.currentUser().memberId; index.html không còn mặc định người cứng', () => {
  const html = read('index.html');
  const seg = html.slice(html.indexOf('function defaultOwnerId()'), html.indexOf('function formFoot'));
  assert.ok(seg.includes('authCurrentUser()') && seg.includes('memberId'), 'defaultOwnerId phải resolve qua authCurrentUser()/SavaAuth.currentUser().memberId');
  assert.ok(!html.includes('"zac"') && !html.includes("'zac'"), 'không còn id member cứng nào trong index.html');
  assert.ok(!html.includes('member active đầu tiên') || html.includes('KHÔNG còn fallback cứng'), 'không còn cơ chế member-active-đầu-tiên (chỉ còn câu phủ định trong comment P3)');
});

/* ================= P4 ================= */
test('P4: Final v2 qua window.fmtFinalScore (65.0 cho 64.96) ở cả summary + chip; legacy qua fmtLegacyFinal delegate', () => {
  const { ctx, run } = loadIndex();
  ctx.PublishingBridge = { gameSummary: () => ({ exists: true, v2: { final: 64.96, decision: 'TEST MORE' } }) };
  assert.ok(run("gameEvalSummaryText('gx')").includes('Final 65.0/100'), 'summary Final v2 phải hiện 65.0: ' + run("gameEvalSummaryText('gx')"));
  assert.ok(run("gameV2ChipText('gx')").includes('Final v2 65.0/100'), 'chip Final v2 phải hiện 65.0');
  ctx.PublishingBridge = { gameSummary: () => ({ exists: true, legacy: { final: 64.96, recommendation: 'NO-GO' } }) };
  const legacy = run("gameEvalSummaryText('gx')");
  assert.ok(legacy.includes('65.0/100') && legacy.includes('chưa qua ngưỡng 65'), 'nhánh legacy giữ fmtLegacyFinal + legacyThresholdNote nhất quán: ' + legacy);
  assert.equal(run('fmtLegacyFinal(64.96)'), '65.0');
  assert.equal(run('fmtLegacyFinal(null)'), '—');
});

test('P4: Partner Fit qua helper chung (fmtFitScore -> window.fmtFinalScore); fmtNum1 GIỮ cho điểm thành phần', () => {
  const { run } = loadIndex();
  assert.equal(run('fmtFitScore(64.96)'), '65.0');
  assert.equal(run('fmtFitScore(80)'), '80.0');
  assert.equal(run('fmtFitScore(null)'), '—');
  const html = read('index.html');
  assert.ok(!html.includes('partnerFit.toFixed(1)'), 'không còn bề mặt Partner Fit nào in thô bằng toFixed(1)');
  assert.ok(html.includes('fmtNum1(cp.dealFit)'), 'Deal Fit là điểm thành phần /5 -> giữ fmtNum1');
  assert.ok(html.includes('fmtNum1(ps.strongest.score)') && html.includes('fmtNum1(s) + " / 5"'), 'điểm pillar /5 giữ fmtNum1');
  assert.ok(!html.includes('fmtNum1(gs.v2.final)'), 'Final v2 không còn qua fmtNum1');
});

/* ================= P5 ================= */
test('P5 tĩnh: "Công việc" chỉ còn ở đúng 2 dòng comment đã liệt kê; hết "năng lực studio"; nav/title dùng "Việc"', () => {
  const html = read('index.html');
  const lines = html.split('\n').filter(l => l.includes('Công việc'));
  assert.equal(lines.length, 2, 'chỉ được còn đúng 2 dòng chứa "Công việc" (comment): ' + JSON.stringify(lines));
  assert.ok(lines.every(l => l.includes('view Công việc')), 'cả 2 ngoại lệ đều là comment nhắc "view Công việc": ' + JSON.stringify(lines));
  assert.ok(!/công việc/.test(html), 'không còn "công việc" thường ở bất kỳ chuỗi hiển thị nào');
  assert.ok(!/năng lực studio/i.test(html), 'P5(b): hết "năng lực studio"');
  assert.ok(html.includes('<span>Việc</span>'), 'nav phải dùng nhãn "Việc" cho view tasks');
  assert.ok(html.includes('tasks:"Việc"'), 'titles.tasks phải là "Việc"');
  const flow = read('tests/publishing-flow.cjs');
  assert.ok(!flow.includes('Năng lực sản xuất · MKT') && flow.includes('Đánh giá Partner'), 'publishing-flow.cjs: assert drawer đã cập nhật sang "Đánh giá Partner"');
});

/* ================= P6 ================= */
function loadDataLayer(client) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const el = () => ({ style: {}, textContent: '', innerHTML: '', setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } });
  const ctx = vm.createContext({ console, localStorage: ls, setTimeout, clearTimeout,
    document: { getElementById: () => null, createElement: () => el(), body: el() } });
  ctx.window = ctx;
  vm.runInContext(read('supabase-adapter.js'), ctx, { filename: 'supabase-adapter.js' });
  vm.runInContext(read('supabase-data.js'), ctx, { filename: 'supabase-data.js' });
  ctx.window.SavaData.attach(client, 'bd'); ctx.window.SavaData.setEnabled(true);
  return ctx;
}
function recentMockClient(fail) {
  const calls = { eq: [], order: null, limit: null, table: null };
  return { calls, from(table) { calls.table = table; const chain = {
    select() { return chain; },
    eq(k, v) { calls.eq.push([k, v]); return chain; },
    order(col, o) { calls.order = [col, o]; return chain; },
    limit(n) { calls.limit = n; return Promise.resolve({ data: fail ? null : [{ entity_type: 'deal', entity_id: 'd1', at: '2026-10-31T10:00:00.000Z', by_member_id: 'linh', action: 'update', changes: [{ field: 'title', label: 'Tiêu đề', from: 'A', to: 'B' }] }], error: fail ? { message: 'no table' } : null }); },
  }; return chain; } };
}
test('P6 data: SavaAudit.listRecent có limit 200 + order at desc; lọc entity_type/by_member_id ở tầng query; lỗi -> null', async () => {
  const client = recentMockClient(false);
  const ctx = loadDataLayer(client);
  assert.equal(typeof ctx.window.SavaAudit.listRecent, 'function', 'auditApi phải có listRecent');
  const rows = await ctx.window.SavaAudit.listRecent();
  assert.equal(client.calls.table, 'audit_log');
  assert.equal(client.calls.limit, 200, 'listRecent phải giới hạn 200 mục');
  assert.equal(client.calls.order[0], 'at'); assert.equal(client.calls.order[1].ascending, false);
  assert.equal(client.calls.eq.length, 0, 'không lọc -> không eq nào');
  assert.equal(rows.length, 1); assert.equal(rows[0].entityType, 'deal'); assert.equal(rows[0].byMemberId, 'linh');
  const client2 = recentMockClient(false);
  const ctx2 = loadDataLayer(client2);
  await ctx2.window.SavaAudit.listRecent({ entityType: 'lead', byMemberId: 'mai' });
  assert.equal(JSON.stringify(client2.calls.eq), JSON.stringify([['entity_type', 'lead'], ['by_member_id', 'mai']]), 'lọc phải áp ở tầng query bằng eq');
  const ctx3 = loadDataLayer(recentMockClient(true));
  assert.equal(await ctx3.window.SavaAudit.listRecent(), null, 'lỗi đọc -> null như mẫu listFor');
});

test('P6 tĩnh: nav Lịch sử tổng gate Admin (class audit-admin-only + ẩn mặc định + render gate theo isAdminViewer) + view dùng entryHTML chung', () => {
  const html = read('index.html');
  assert.ok(html.includes('data-view="auditHistory"') && html.includes('audit-admin-only') && html.includes('Lịch sử tổng'), 'phải có mục nav Lịch sử tổng');
  assert.ok(html.includes('document.querySelectorAll(".audit-admin-only")') && html.includes('isAdminViewer() ? "" : "none"'), 'render() phải gate nav theo vai Admin');
  assert.ok(html.includes('auditHistory:"Lịch sử tổng"'), 'titles phải có auditHistory');
  assert.ok(html.includes('SavaAuditUI.entryHTML(S, row)'), 'dòng lịch sử tổng phải dùng entryHTML dùng chung của audit.js');
  assert.ok(html.includes('listRecent({ entityType: auditHistTypeFilter'), 'view phải đọc qua listRecent kèm bộ lọc');
});

test('P6 view: Admin thấy mục đã xoá (tên từ changes) + mục còn tồn tại bấm mở được + request nhãn tĩnh; BD bị chặn', async () => {
  const { ctx, run, getEl } = loadIndex();
  const seenOpts = [];
  ctx.SavaAuth = { currentUser: () => ({ memberId: 'zac', role: 'admin' }) };
  ctx.SavaAudit = { listRecent: async opts => { seenOpts.push(opts); return [
    { entityType: 'deal', entityId: 'd1', at: '2026-10-31T10:00:00.000Z', byMemberId: 'linh', action: 'update', changes: [{ field: 'title', label: 'Tiêu đề', from: 'Deal Một', to: 'Deal Một Mới' }] },
    { entityType: 'deal', entityId: 'dGone', at: '2026-10-31T09:00:00.000Z', byMemberId: 'linh', action: 'delete', changes: [{ field: 'title', label: 'Tiêu đề', from: 'Deal Đã Xoá Hẳn', to: '' }] },
    { entityType: 'request', entityId: 'REV-1', at: '2026-10-31T08:00:00.000Z', byMemberId: 'mai', action: 'create', changes: [] },
  ]; }, recordBatch() {}, listFor: async () => [] };
  run('curView = "auditHistory"; render();');
  await tick(); await tick();
  assert.ok(getEl('view').innerHTML.includes('Lọc lịch sử'), 'view Admin phải dựng khung + bộ lọc');
  /* Harness stub không parse innerHTML: danh sách nằm ở element auditHistoryList riêng */
  const view = getEl('auditHistoryList').innerHTML;
  assert.equal(seenOpts[0].entityType, '', 'lần tải đầu không lọc'); assert.equal(seenOpts[0].byMemberId, '');
  assert.ok(view.includes("openDeal('d1')") && view.includes('Deal Một'), 'đối tượng còn tồn tại: tên thật + bấm mở được drawer');
  assert.ok(view.includes('Đã cập nhật') && view.includes('Tiêu đề'), 'định dạng mục phải là entryHTML dùng chung (hành động + changes)');
  assert.ok(view.includes('Deal Đã Xoá Hẳn (đã xoá)'), 'đối tượng đã xoá: tên khôi phục từ changes của mục delete + hậu tố (đã xoá)');
  assert.ok(view.includes('Yêu cầu đánh giá') && view.includes('publishing.html'), 'request: nhãn tĩnh + link sang module Publishing');
  run("setAuditHistFilter('type', 'deal')");
  await tick(); await tick();
  assert.equal(seenOpts[seenOpts.length - 1].entityType, 'deal', 'đổi bộ lọc loại -> gọi lại listRecent với entityType');
  /* BD (không phải Admin) bị chặn ở view */
  const b = loadIndex();
  b.ctx.SavaAuth = { currentUser: () => ({ memberId: 'linh', role: 'bd' }) };
  b.run('curView = "auditHistory"; render();');
  assert.ok(b.getEl('view').innerHTML.includes('Chỉ Admin mới xem được Lịch sử tổng'), 'BD không được xem Lịch sử tổng');
});
