/* Gộp audit cho thao tác hàng loạt (Import + Gỡ lô trong app) — 05/11/2026:
   - TRƯỚC đợt này: import 1 lô N công ty + M lead sinh N+M mục audit lẻ;
     gỡ lô cũng vậy (đo đối chứng bằng chính harness này trên code cũ:
     lô 5+5 -> 10 mục import + 10 mục gỡ).
   - SAU: mỗi lô sinh ĐÚNG 1 mục TỔNG cho mỗi (entity_type, action):
     entityId = mã lô (importBatch), changes[0] mang batch:true + marker
     + count + ids; riêng gỡ lô còn mang records = toàn bộ object gốc
     của mọi bản ghi đã xoá (khôi phục lại được y hệt từng field).
   - Thao tác đơn lẻ giữ nguyên mục lẻ (kể cả xoá lẻ 1 bản ghi VỐN thuộc
     lô import — context lô chỉ do impApply/impRemoveBatch đặt quanh
     đúng lần save() của chúng, không rò sang save() khác).
   - Render: entryHTML (audit.js) + auditHistRowHTML (Lịch sử tổng)
     hiện số lượng + marker của lô.
   - Phần 2 (index thời gian): file supabase/audit-log-at-index.sql
     idempotent, chỉ thêm index, không policy/schema. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadIndex(state) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(state));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {}, querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null });
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout, confirm: () => true,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'audit.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  const captured = [];
  ctx.SavaAuth = { currentUser: () => ({ memberId: 'zac', role: 'admin' }) };
  ctx.SavaAudit = { recordBatch: entries => { captured.push(...entries); } };
  return { ctx, captured, getEl, run: code => vm.runInContext(code, ctx) };
}
const baseState = () => ({ members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], events: [], verticals: [] });

async function importFive(h) {
  const rows = [['Company Name', 'PIC', 'Email', 'Status']];
  for (let i = 1; i <= 5; i++) rows.push(['Comp ' + i, 'PIC ' + i, 'p' + i + '@x.vn', 'Sent connect']);
  h.run(`impData = { fileName: 'm.xlsx', sheetNames: ['S1'], sheetName: 'S1', wb: null, aoa: ${JSON.stringify(rows)}, links: {}, headerIdx: 0, headers: ['Company Name','PIC','Email','Status'], mapping: ['companyName','picName','email','status'] };`);
  h.getEl('imp_owner').value = 'zac'; h.getEl('imp_line').value = 'metaverse'; h.getEl('imp_vertical').value = ''; h.getEl('imp_batch').value = 'fixture-batch';
  h.run(`impRunPreview()`);
  assert.equal(h.run(`impPlan.stats.newCompanies`), 5);
  assert.equal(h.run(`impPlan.stats.newLeads`), 5);
  h.captured.length = 0;
  await h.run(`impApply()`);
}

test('batch import: lô 5 công ty + 5 lead -> ĐÚNG 2 mục tổng (company/create + lead/create), entityId = mã lô, changes đủ count/marker/ids', async () => {
  const h = loadIndex(baseState());
  await importFive(h);
  assert.equal(h.captured.length, 2, 'phải gộp còn đúng 2 mục: ' + JSON.stringify(h.captured.map(e => e.entityType + '/' + e.action)));
  const compIds = h.run(`S.companies.map(c => String(c.id))`), leadIds = h.run(`S.leads.map(l => String(l.id))`);
  for (const [type, ids] of [['company', compIds], ['lead', leadIds]]) {
    const e = h.captured.find(x => x.entityType === type);
    assert.ok(e, 'thiếu mục tổng ' + type);
    assert.equal(e.action, 'create');
    assert.equal(e.entityId, 'fixture-batch', 'entityId của mục tổng = mã lô');
    assert.equal(e.byMemberId, 'zac');
    assert.equal(e.changes.length, 1);
    const b = e.changes[0];
    assert.equal(b.batch, true, 'changes phải mang cờ batch:true');
    assert.equal(b.importBatch, 'fixture-batch');
    assert.equal(b.count, 5);
    assert.deepEqual([...b.ids].sort(), [...ids].sort(), 'ids phải khớp đúng các bản ghi vừa tạo');
    assert.ok(!Array.isArray(b.records) || !b.records.length, 'lô tạo không cần records (bản ghi còn trong bảng)');
  }
  /* Bản ghi tạo ra nguyên vẹn */
  assert.equal(h.run(`S.companies.length`), 5); assert.equal(h.run(`S.leads.length`), 5);
  assert.ok(h.run(`S.leads.every(l => l.importBatch === 'fixture-batch' && !!l.createdAt)`));
});

test('batch gỡ lô: ĐÚNG 2 mục tổng delete + records khôi phục lại được y hệt từng bản ghi gốc', async () => {
  const h = loadIndex(baseState());
  await importFive(h);
  const beforeCompanies = JSON.parse(h.run(`JSON.stringify(S.companies)`));
  const beforeLeads = JSON.parse(h.run(`JSON.stringify(S.leads)`));
  h.run(`curView = 'import'; render();`);
  assert.equal(h.run(`impBatchList.length`), 1);
  h.captured.length = 0;
  h.run(`impRemoveBatch(0)`);
  assert.equal(h.run(`S.companies.length`), 0); assert.equal(h.run(`S.leads.length`), 0);
  assert.equal(h.captured.length, 2, 'gỡ lô phải gộp còn đúng 2 mục: ' + JSON.stringify(h.captured.map(e => e.entityType + '/' + e.action)));
  for (const [type, before] of [['company', beforeCompanies], ['lead', beforeLeads]]) {
    const e = h.captured.find(x => x.entityType === type);
    assert.ok(e); assert.equal(e.action, 'delete'); assert.equal(e.entityId, 'fixture-batch');
    const b = e.changes[0];
    assert.equal(b.batch, true); assert.equal(b.count, 5);
    assert.deepEqual([...b.ids].sort(), before.map(x => String(x.id)).sort());
    assert.equal(b.records.length, 5, 'gỡ lô BẮT BUỘC lưu đủ records của mọi bản ghi đã xoá');
    const byId = new Map(b.records.map(r => [String(r.id), r]));
    /* Chuẩn hoá qua JSON: records sống ở realm vm, before ở realm test —
       so sánh từng field trên bản thuần JSON của cả hai phía. */
    for (const orig of before) assert.deepEqual(JSON.parse(JSON.stringify(byId.get(String(orig.id)))), orig, 'record khôi phục phải y hệt bản gốc từng field: ' + orig.id);
  }
});

test('thao tác thường KHÔNG đổi: tạo lẻ / sửa lẻ / xoá lẻ vẫn là mục lẻ; xoá lẻ 1 lead thuộc lô cũng là mục lẻ (context không rò)', async () => {
  const h = loadIndex(baseState());
  await importFive(h);
  /* Xoá lẻ 1 lead của lô bằng save() thường -> mục delete LẺ theo id lead */
  const victim = h.run(`S.leads[0].id`);
  h.captured.length = 0;
  h.run(`S.leads = S.leads.filter(l => l.id !== ${JSON.stringify(victim)}); save();`);
  assert.equal(h.captured.length, 1);
  assert.equal(h.captured[0].entityType, 'lead'); assert.equal(h.captured[0].action, 'delete');
  assert.equal(h.captured[0].entityId, String(victim), 'xoá lẻ phải ghi theo id bản ghi, không gộp lô');
  assert.ok(!h.captured[0].changes.some(c => c && c.batch), 'mục lẻ không được mang cờ batch');
  /* Tạo lẻ 1 lead -> 1 mục create lẻ */
  h.captured.length = 0;
  h.run(`S.leads.push({ id: 'l-solo', name: 'Lead Lẻ', company: '', person: '', phone: '', email: '', linkedinUrl: '', ownerId: 'zac', line: 'metaverse', source: '', status: 'new', note: '', when: '2026-11-05', mainContact: false }); save();`);
  assert.equal(h.captured.length, 1);
  assert.equal(h.captured[0].action, 'create'); assert.equal(h.captured[0].entityId, 'l-solo');
  assert.ok(!h.captured[0].changes.some(c => c && c.batch));
  /* Sửa lẻ 1 field -> 1 mục update với diff như cũ */
  h.captured.length = 0;
  h.run(`S.leads.find(l => l.id === 'l-solo').note = 'ghi chú mới'; save();`);
  assert.equal(h.captured.length, 1);
  assert.equal(h.captured[0].action, 'update');
  assert.deepEqual([...h.captured[0].changes.map(c => c.field)], ['note']);
  /* Xoá lẻ 1 công ty (tạo tay, không marker) -> 1 mục delete lẻ kèm diff đầy đủ như cũ */
  h.run(`S.companies.push({ id: 'c-solo', name: 'Công ty Lẻ', type: 'Doanh nghiệp', roles: {}, last: '' }); save();`);
  h.captured.length = 0;
  h.run(`S.companies = S.companies.filter(c => c.id !== 'c-solo'); save();`);
  assert.equal(h.captured.length, 1);
  assert.equal(h.captured[0].entityType, 'company'); assert.equal(h.captured[0].action, 'delete'); assert.equal(h.captured[0].entityId, 'c-solo');
  const nameCh = h.captured[0].changes.find(c => c.field === 'name');
  assert.ok(nameCh && nameCh.from === 'Công ty Lẻ', 'delete lẻ giữ diff payload dạng cũ (tên ở from)');
});

test('render dòng tổng: entryHTML + auditHistRowHTML hiện số lượng + marker, đúng văn phong nhãn', async () => {
  const h = loadIndex(baseState());
  await importFive(h);
  const createRow = h.captured.find(e => e.entityType === 'company');
  const htmlEntry = h.run(`window.SavaAuditUI.entryHTML(S, ${JSON.stringify(createRow)})`);
  assert.ok(htmlEntry.includes('Đã tạo mới'), 'entryHTML giữ nhãn action hiện tại');
  assert.ok(htmlEntry.includes('fixture-batch') && htmlEntry.includes('5 Công ty'), 'entryHTML phải hiện marker + số lượng: ' + htmlEntry);
  const htmlHist = h.run(`auditHistRowHTML(${JSON.stringify(createRow)})`);
  assert.ok(htmlHist.includes('5 Công ty — lô “fixture-batch”'), 'Lịch sử tổng phải hiện dạng "5 Công ty — lô …": ' + htmlHist);
  /* Dòng tổng delete của gỡ lô */
  h.run(`curView = 'import'; render();`);
  h.captured.length = 0;
  h.run(`impRemoveBatch(0)`);
  const delRow = h.captured.find(e => e.entityType === 'lead');
  const htmlDel = h.run(`auditHistRowHTML(${JSON.stringify(delRow)})`);
  assert.ok(htmlDel.includes('5 Lead — gỡ lô “fixture-batch”'), 'dòng gỡ lô phải hiện dạng "5 Lead — gỡ lô …": ' + htmlDel);
  const htmlDelEntry = h.run(`window.SavaAuditUI.entryHTML(S, ${JSON.stringify(delRow)})`);
  assert.ok(htmlDelEntry.includes('Đã xoá') && htmlDelEntry.includes('fixture-batch'));
  /* batchInfo phơi cho bề mặt khác */
  assert.equal(h.run(`window.SavaAuditUI.batchInfo(${JSON.stringify(createRow)}).count`), 5);
  assert.equal(h.run(`window.SavaAuditUI.batchInfo({ changes: [] })`), null);
});

test('supabase-data: dòng tổng đi qua insert + đọc lại NGUYÊN VẸN (cờ batch/count/ids/records không bị tầng dữ liệu cắt)', async () => {
  /* Mock client tối thiểu theo mẫu audit-history.test.cjs; hàng đợi
     audit flush insert thuần, listFor đọc lại đúng dòng vừa insert. */
  let inserted = [];
  const client = { from(table) { return {
    insert(rows) { inserted = rows; return Promise.resolve({ data: null, error: null }); },
    select() { const chain = { eq() { return chain; }, order() { return chain; }, limit() { return Promise.resolve({ data: inserted.map(r => ({ ...r })), error: null }); } }; return chain; },
  }; } };
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const el = () => ({ style: {}, textContent: '', innerHTML: '', setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } });
  const ctx = vm.createContext({ console, localStorage: ls, setTimeout, clearTimeout, document: { getElementById: () => null, createElement: () => el(), body: el() } });
  ctx.window = ctx;
  vm.runInContext(read('supabase-adapter.js'), ctx, { filename: 'supabase-adapter.js' });
  vm.runInContext(read('supabase-data.js'), ctx, { filename: 'supabase-data.js' });
  ctx.window.SavaData.attach(client, 'bd'); ctx.window.SavaData.setEnabled(true);
  const entry = { entityType: 'lead', entityId: 'fixture-batch', at: '2026-11-05T10:00:00.000Z', byMemberId: 'zac', action: 'delete', changes: [{ field: '__batch', label: 'Gỡ lô', batch: true, mode: 'remove', importBatch: 'fixture-batch', batchMarker: 'fixture-batch', count: 2, ids: ['l1', 'l2'], records: [{ id: 'l1', name: 'A' }, { id: 'l2', name: 'B', extra: { nested: [1, 2] } }], from: '', to: 'Gỡ lô “fixture-batch” — 2 bản ghi' }] };
  ctx.window.SavaAudit.recordBatch([entry]);
  await ctx.window.SavaAudit._flush();
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].entity_type, 'lead'); assert.equal(inserted[0].entity_id, 'fixture-batch'); assert.equal(inserted[0].action, 'delete');
  assert.deepEqual(JSON.parse(JSON.stringify(inserted[0].changes)), entry.changes, 'payload insert phải nguyên vẹn từng khoá');
  const rows = await ctx.window.SavaAudit.listFor('lead', 'fixture-batch');
  assert.equal(rows.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(rows[0].changes)), entry.changes, 'đọc lại (auditRowToEntry) phải giữ nguyên changes của dòng tổng');
});

test('tĩnh: điểm gắn context chỉ ở impApply/impRemoveBatch + file SQL index idempotent không policy', () => {
  const idx = read('index.html');
  assert.ok(idx.includes('crmBatchAuditCtx = { mode: "import"'), 'impApply phải đặt context import trước save()');
  assert.ok(idx.includes('crmBatchAuditCtx = batchCtx;'), 'impRemoveBatch phải đặt context gỡ lô trước save()');
  assert.ok(idx.includes('collapseBatchAuditEntries(entries, ctx)'), 'stampCrmAndAudit phải tiêu thụ context để gộp');
  const sql = read('supabase/audit-log-at-index.sql');
  assert.ok(sql.includes('create index if not exists audit_log_at_idx'));
  assert.ok(sql.includes('on public.audit_log (at desc)'));
  assert.ok(!/create policy/i.test(sql) && !/alter table/i.test(sql), 'file index KHÔNG được đụng policy/schema');
});
