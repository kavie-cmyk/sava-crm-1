/* Vòng QA độc lập toàn app — khoá các fix:
   F1 saveLead phải áp bất biến status lead theo deal qua helper trung tâm
      syncLeadDealStatus (chiều lên), NHƯNG giữ đường khôi phục tay
      "converted" cho lead không có deal; audit của lần lưu phản ánh status
      cuối, không sinh mục mâu thuẫn.
   F2 deep-link ?open= bổ sung deal (drawer) + task/activity (form sửa sẵn có).
   F3 completeness % dùng helper 1 thập phân sẵn có ở 4 chỗ (tĩnh).
   F4 vCompanies phân biệt trống thật vs đang lọc không khớp.
   F5 drop() kéo-thả pipeline qua cùng confirm đổi stage của drawer.
   Nhiễu audit: mục create không còn change field "id".
   Harness vm theo mẫu fix-c1-index / lead-main-contact: nạp script inline
   THẬT của index.html với fixture riêng + confirm điều khiển được. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');

function fixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }],
    companies: [
      { id: 'c1', name: 'Công ty Một', type: 'Game studio', roles: { publishing: 'Game studio' }, last: 'Hôm qua' },
      { id: 'c2', name: 'Công ty Hai', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' }, last: 'Hôm nay' },
    ],
    games: [{ id: 'g1', title: 'Game Một', own: 'partner', company: 'c1', genre: 'Puzzle', platform: 'Android', stage: 'Beta', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: '', mktEval: null }],
    deals: [
      { id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', game: 'g1', stage: 'sourcing', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: ['lLinked'] },
      { id: 'd2', line: 'publishing', title: 'Deal Hai', company: 'c1', game: 'g1', stage: 'screening', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: ['lLinked'] },
    ],
    leads: [
      { id: 'lLinked', name: 'Người Gắn Deal', company: 'c1', person: 'Anh Gắn', phone: '0901', line: 'publishing', source: 'Giới thiệu', status: 'converted', note: 'ghi chú gốc', when: '2026-10-01', mainContact: false },
      { id: 'lFree', name: 'Người Tự Do', company: 'c1', person: '', phone: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-10-02', mainContact: false },
    ],
    tasks: [{ id: 't1', title: 'Việc Một', assignee: 'linh', due: '', dueDate: '', done: false }],
    activities: [{ id: 'a1', deal: 'd1', who: 'linh', type: 'Note', text: 'Hoạt động một', when: '2026-10-01', url: '' }],
    verticals: [],
  };
}
function loadIndex(search) {
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
    location: { search: search || '', href: 'http://localhost/index.html' },
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
function fillLeadForm(getEl, over) {
  const vals = Object.assign({ e_lname: 'Người Gắn Deal', e_lcompany: 'c1', e_lperson: 'Anh Gắn', e_lphone: '0901', e_lline: 'publishing', e_lsource: 'Giới thiệu', e_lstatus: 'new', e_lwhen: '', e_lnote: 'ghi chú gốc' }, over || {});
  for (const [k, v] of Object.entries(vals)) getEl(k).value = v;
  getEl('e_lmain').checked = false;
}

/* ---------- F1 ---------- */
test('F1: lead gắn 2 deal — sửa form đặt status "new" rồi lưu -> status thực tế vẫn "converted" (cả state lẫn bản đã lưu)', () => {
  const { run, getEl, ls } = loadIndex();
  assert.equal(run("dealsForLead('lLinked').length"), 2, 'fixture: lead phải gắn đúng 2 deal');
  run("editLead('lLinked')");
  fillLeadForm(getEl, { e_lstatus: 'new' });
  run("saveLead('lLinked')");
  assert.equal(run("S.leads.find(l=>l.id==='lLinked').status"), 'converted', 'lead còn gắn deal thì form không được kéo status về new');
  const saved = JSON.parse(ls.getItem('sava_crm_shared_v1'));
  assert.equal(saved.leads.find(l => l.id === 'lLinked').status, 'converted', 'bản ghi xuống kho cũng phải là converted');
});

test('F1: audit của lần lưu form lead gắn deal KHÔNG sinh mục status mâu thuẫn (không có change status -> "Mới")', () => {
  const { run, getEl } = loadIndex();
  run("window.__auditEntries = []; window.SavaAudit = { recordBatch(es) { window.__auditEntries.push(...es); } };");
  run("editLead('lLinked')");
  /* Đổi thêm ghi chú để lần lưu chắc chắn sinh mục audit update cho lead. */
  fillLeadForm(getEl, { e_lstatus: 'new', e_lnote: 'ghi chú mới' });
  run("saveLead('lLinked')");
  const entries = JSON.parse(JSON.stringify(run('window.__auditEntries')));
  const leadEntries = entries.filter(e => e.entityType === 'lead' && e.entityId === 'lLinked');
  assert.ok(leadEntries.length >= 1, 'lần lưu có đổi ghi chú phải sinh mục audit cho lead');
  const statusChanges = leadEntries.flatMap(e => (e.changes || []).filter(c => c.field === 'status'));
  assert.ok(!statusChanges.some(c => c.to === 'Mới'), 'audit không được ghi status đích là "Mới": ' + JSON.stringify(statusChanges));
  assert.ok(statusChanges.every(c => c.to === 'Đã chuyển đổi' || c.to === ''), 'change status (nếu có) phải phản ánh status cuối converted');
});

test('F1: lead KHÔNG có deal — đặt tay "converted" ở form là đường khôi phục hợp lệ, helper KHÔNG tự hồi', () => {
  const { run, getEl } = loadIndex();
  assert.equal(run("dealsForLead('lFree').length"), 0, 'fixture: lFree không gắn deal nào');
  run("editLead('lFree')");
  fillLeadForm(getEl, { e_lname: 'Người Tự Do', e_lperson: '', e_lphone: '', e_lstatus: 'converted', e_lnote: '' });
  run("saveLead('lFree')");
  assert.equal(run("S.leads.find(l=>l.id==='lFree').status"), 'converted', 'converted đặt tay cho lead không deal phải được giữ nguyên');
});

test('F1 tĩnh: saveLead gọi helper trung tâm với preserveManualConverted; helper giữ nguyên chiều hồi qualified cho các đường khác', () => {
  const saveLead = html.slice(html.indexOf('function saveLead'), html.indexOf('function deleteLead'));
  assert.ok(saveLead.includes("syncLeadDealStatus(l.id, { preserveManualConverted: true })"), 'saveLead phải áp bất biến qua syncLeadDealStatus (không viết logic trạng thái thứ hai)');
  assert.ok(saveLead.indexOf('syncLeadDealStatus(l.id') < saveLead.indexOf('save();'), 'helper phải chạy TRƯỚC save() của lần lưu form');
  const sync = html.slice(html.indexOf('function syncLeadDealStatus'), html.indexOf('function syncLeadDealStatuses'));
  assert.ok(sync.includes('preserveManualConverted') && sync.includes('l.status = "qualified"'), 'helper vẫn giữ chiều hồi qualified khi không có opts preserve');
});

/* ---------- F2 ---------- */
test('F2: deep-link ?open=deal&id= mở drawer deal đúng deal', () => {
  const { getEl } = loadIndex('?open=deal&id=d1');
  const drawer = getEl('drawer').innerHTML;
  assert.ok(drawer.includes('Deal Một'), 'drawer phải hiện đúng deal được trỏ tới: ' + drawer.slice(0, 200));
});

test('F2: deep-link ?open=task / ?open=activity mở đúng form sửa sẵn có', () => {
  const t = loadIndex('?open=task&id=t1');
  assert.ok(t.getEl('editBox').innerHTML.includes('Việc Một'), '?open=task phải mở form sửa việc (editTask) của đúng việc');
  const a = loadIndex('?open=activity&id=a1');
  assert.ok(a.getEl('editBox').innerHTML.includes('Hoạt động một'), '?open=activity phải mở form sửa hoạt động (editActivity) của đúng hoạt động');
});

test('F2 tĩnh: khối deep-link có đủ deal/task/activity cạnh 4 loại cũ', () => {
  const seg = html.slice(html.indexOf('Deep-link vào CRM'));
  for (const frag of ['__open === "deal"', '__open === "task"', '__open === "activity"', '__open === "company"', '__open === "game"', '__open === "lead"', '__open === "member"']) {
    assert.ok(seg.includes(frag), 'deep-link thiếu nhánh ' + frag);
  }
  assert.ok(seg.includes('openDeal(__oid)') && seg.includes('editTask(__oid)') && seg.includes('editActivity(__oid)'), 'deal/task/activity phải mở qua hàm mở sẵn có');
});

/* ---------- F3 (tĩnh) ---------- */
test('F3 tĩnh: 4 chỗ completeness % dùng helper 1 thập phân sẵn có, không còn Math.round nguyên %', () => {
  const pub = read('publishing.js');
  assert.ok(!pub.includes('Math.round(minComp * 100)'), 'nhãn v2-insufficient còn Math.round');
  assert.ok(pub.includes('`Chưa đủ dữ liệu · ${pct(minComp)}`'), 'nhãn v2-insufficient phải qua pct() của publishing.js');
  assert.ok(pub.includes('const pctTxt = c => pct(c || 0);'), 'pctTxt phải uỷ quyền pct() sẵn có');
  assert.ok(!pub.includes('Math.round((effH.minCompleteness'), 'dòng lịch sử v2-insufficient còn Math.round');
  assert.ok(pub.includes('${pct(effH.minCompleteness || 0)}'), 'dòng lịch sử phải qua pct()');
  const bridge = read('publishing-bridge.js');
  assert.ok(!bridge.includes('Math.round(Math.min(compM, compP) * 100)'), 'bridge lowPct còn Math.round');
  assert.ok(bridge.includes('const lowPct = fmt1(Math.min(compM, compP) * 100);'), 'bridge lowPct phải qua fmt1() sẵn có của bridge');
});

/* ---------- F4 ---------- */
test('F4: vCompanies — đang tìm kiếm/lọc không khớp vs trống thật cho 2 câu khác nhau', () => {
  const a = loadIndex();
  a.run("curView='companies'; curLine='all'; query='zzz-khong-khop'; render()");
  assert.ok(a.getEl('view').innerHTML.includes('Không có công ty nào khớp tìm kiếm hiện tại.'), 'có từ khóa không khớp -> câu khớp tìm kiếm');
  const b = loadIndex();
  b.run("curView='companies'; curLine='ai'; query=''; render()");
  const lineFiltered = b.getEl('view').innerHTML;
  /* c1/c2: c2 có roles.ai nên vẫn có 1 công ty ở mảng ai — dùng mảng publishing ngược lại: cả hai công ty đều có? c1 publishing + c2 không -> vẫn còn c1.
     Chọn curLine='metaverse' (không công ty nào có roles.metaverse) để lọc rỗng thật. */
  b.run("curLine='metaverse'; render()");
  assert.ok(b.getEl('view').innerHTML.includes('Không có công ty nào khớp tìm kiếm hiện tại.'), 'đang lọc theo mảng mà rỗng -> câu khớp tìm kiếm/lọc, không phải câu trống thật');
  assert.ok(lineFiltered.includes('Công ty Hai'), 'sanity: mảng ai vẫn hiện công ty có roles.ai');
  const c = loadIndex();
  c.run("S.companies=[]; curView='companies'; curLine='all'; query=''; render()");
  const emptyHtml = c.getEl('view').innerHTML;
  assert.ok(emptyHtml.includes('Chưa có công ty nào.'), 'trống thật (không lọc, không công ty nào) -> câu riêng');
  assert.ok(!emptyHtml.includes('khớp tìm kiếm'), 'trống thật không dùng câu khớp tìm kiếm');
});

/* ---------- F5 ---------- */
test('F5: drop() kéo-thả — huỷ confirm -> stage KHÔNG đổi + KHÔNG lưu; đồng ý -> đổi đúng stage + lưu', () => {
  const h = loadIndex();
  h.run("curView='board'; curLine='publishing'; render()");
  /* Huỷ */
  h.setConfirm(false);
  h.run("drag(null, 'd1')");
  h.run("drop({ preventDefault() {} }, 'publishing', 'screening')");
  assert.equal(h.run("S.deals.find(d=>d.id==='d1').stage"), 'sourcing', 'huỷ confirm -> stage giữ nguyên');
  const savedAfterCancel = JSON.parse(h.ls.getItem('sava_crm_shared_v1'));
  assert.equal(savedAfterCancel.deals.find(d => d.id === 'd1').stage, 'sourcing', 'huỷ confirm -> bản đã lưu không đổi (không save)');
  assert.ok(h.confirmMsgs.some(m => m.includes('Tìm kiếm / Tiếp nhận') && m.includes('Sơ tuyển')), 'confirm của drop phải nêu nhãn stage cũ → mới như drawer: ' + h.confirmMsgs.join(' | '));
  /* Đồng ý */
  h.setConfirm(true);
  h.run("drag(null, 'd1')");
  h.run("drop({ preventDefault() {} }, 'publishing', 'screening')");
  assert.equal(h.run("S.deals.find(d=>d.id==='d1').stage"), 'screening', 'đồng ý -> stage đổi đúng');
  const savedAfterOk = JSON.parse(h.ls.getItem('sava_crm_shared_v1'));
  assert.equal(savedAfterOk.deals.find(d => d.id === 'd1').stage, 'screening', 'đồng ý -> stage mới được lưu xuống kho');
});

test('F5 tĩnh: drop() và confirmMoveStage() dùng CHUNG helper confirmStageChange', () => {
  const drop = html.slice(html.indexOf('function drop('), html.indexOf('function vCompanies'));
  assert.ok(drop.includes('confirmStageChange('), 'drop phải hỏi qua helper confirm dùng chung');
  const cms = html.slice(html.indexOf('function confirmMoveStage'), html.indexOf('function saveTermContract'));
  assert.ok(cms.includes('confirmStageChange('), 'confirmMoveStage (drawer) phải dùng cùng helper confirmStageChange');
  assert.ok(html.includes('function confirmStageChange('), 'phải có đúng helper confirmStageChange dùng chung');
});

/* ---------- Nhiễu audit: field id ---------- */
test('audit: stampCollection tạo mới KHÔNG sinh change field "id"; các change thật vẫn còn', () => {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  const S = ctx.window.SavaSys;
  const st = { members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [] };
  const deal = { id: 'dNew', title: 'Deal Mới', line: 'ai', stage: 'prospect', owner: 'zac' };
  const entries = S.stampCollection(st, [deal], new Map(), 'deal', 'zac', '2026-11-01T00:00:00.000Z');
  assert.equal(entries.length, 1); assert.equal(entries[0].action, 'create');
  assert.ok(!entries[0].changes.some(c => c.field === 'id'), 'mục create không được kèm change field id: ' + JSON.stringify(entries[0].changes));
  assert.ok(entries[0].changes.some(c => c.field === 'title'), 'change thật (title) vẫn phải có');
  /* Đường update qua cùng diff dùng chung: đổi title không sinh id, giữ nguyên các change khác */
  const before = { id: 'dNew', title: 'Deal Mới', line: 'ai', stage: 'prospect', owner: 'zac', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', updatedBy: 'zac' };
  const after = JSON.parse(JSON.stringify(before)); after.title = 'Deal Đổi';
  const upd = S.stampCollection(st, [after], new Map([['dNew', S.cloneForDiff(before)]]), 'deal', 'zac', '2026-11-01T01:00:00.000Z');
  assert.equal(upd.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(upd[0].changes.map(c => c.field))), ['title'], 'update chỉ gồm change thật, không id');
});
