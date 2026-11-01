/* Lịch sử tổng (Admin) — CHIA BLOCK THEO LOẠI HÀNH ĐỘNG:
   - Trường phân loại THẬT của mục audit là `action` (KHÔNG phải kind):
     audit_log.action có CHECK ('create','update','delete') ở
     supabase/audit-log.sql; SavaSys.stampCollection (shared.js) chỉ sinh
     3 giá trị đó; audit.js ACTION_LABELS key theo chúng. Block dùng đúng
     các giá trị này, nhãn block: create -> "Tạo mới", update -> "Chỉnh sửa",
     delete -> "Xoá"; thứ tự block theo vòng đời Tạo mới -> Chỉnh sửa -> Xoá.
   - Mẫu block theo vLeads (index.html): section.panel + pill nhãn +
     count-badge "<n> mục" + data-audit-action=<key>; trong block giữ
     nguyên thứ tự mới nhất -> cũ nhất của dữ liệu đã nạp (200 mục gần
     nhất qua SavaAudit.listRecent — tầng nạp KHÔNG đổi, lọc entity_type/
     by_member_id vẫn ở tầng query, gom block chạy SAU khi lọc).
   - Action lạ -> block "Khác" (__unknown__) ở cuối, chỉ hiện khi có mục lạ.
   - Block rỗng: KHÔNG đang lọc -> hiện kèm "Chưa có mục lịch sử nào ở
     loại này."; ĐANG lọc (auditHistTypeFilter/auditHistMemberFilter khác
     rỗng) -> block không có mục khớp bị ẩn; lọc mà không còn mục nào ->
     câu sẵn có "Chưa có lịch sử chỉnh sửa nào khớp bộ lọc.".
   - Block "Xoá" nổi bật vừa phải bằng class audit-action-block--delete
     dùng đúng cặp màu danger sẵn có của app (apple-design.css .btn.danger:
     nền #fff0f0 + viền #f1d5d7), pill đỏ #dc2626 như mọi pill danger/Admin.
   - Định dạng từng mục KHÔNG đổi: auditHistRowHTML bọc SavaAuditUI.entryHTML
     dùng chung với drawer (nhãn trong mục vẫn "Đã tạo mới/Đã cập nhật/Đã xoá").
   Fixture nằm trong file test này — seed production vẫn là emptyState. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const tick = () => new Promise(r => setTimeout(r, 0));

/* ---------- Tĩnh: trường + tập giá trị thật ---------- */
test('tĩnh: trường phân loại là action với đúng 3 giá trị create/update/delete ở cả SQL, shared.js và audit.js', () => {
  const sql = read('supabase/audit-log.sql');
  assert.ok(sql.includes("check (action in ('create', 'update', 'delete'))"), 'audit-log.sql phải CHECK action in (create, update, delete)');
  const shared = read('shared.js');
  for (const v of ['action: "create"', 'action: "update"', 'action: "delete"']) assert.ok(shared.includes(v), 'stampCollection phải sinh ' + v);
  const auditJs = read('audit.js');
  assert.ok(auditJs.includes("ACTION_LABELS = { create: 'Đã tạo mới', update: 'Đã cập nhật', delete: 'Đã xoá' }"), 'audit.js ACTION_LABELS phải key theo create/update/delete');
  const data = read('supabase-data.js');
  assert.ok(data.includes('action: r.action'), 'supabase-data phải ánh xạ cột action -> row.action');
});

test('tĩnh: AUDIT_ACTIONS đúng thứ tự vòng đời + đúng nhãn block + block Khác ở cuối; gom theo r.action; tầng nạp giữ limit 200', () => {
  const seg = html.slice(html.indexOf('const AUDIT_ACTIONS'), html.indexOf('const AUDIT_ACTION_UNKNOWN'));
  const keys = [...seg.matchAll(/key:\s*"([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(keys, ['create', 'update', 'delete'], 'thứ tự block phải là create -> update -> delete');
  for (const label of ['label: "Tạo mới"', 'label: "Chỉnh sửa"', 'label: "Xoá"']) assert.ok(seg.includes(label), 'thiếu nhãn block ' + label);
  assert.ok(html.includes('const AUDIT_ACTION_UNKNOWN = { key: "__unknown__", label: "Khác"'), 'thiếu block Khác cho action lạ');
  assert.ok(html.includes('rows.filter(r => r.action === def.key)'), 'gom block phải lọc theo r.action');
  assert.ok(html.includes('rows.filter(r => !auditActionDef(r.action))'), 'action lạ phải được gom riêng vào Khác');
  assert.ok(html.includes('data-audit-action='), 'block phải mang data-audit-action để nhận diện theo loại');
  const dataSeg = read('supabase-data.js').slice(read('supabase-data.js').indexOf('async function auditListRecent'));
  assert.ok(dataSeg.includes('.limit(200)'), 'listRecent phải giữ nguyên trần 200 mục (gom block chỉ chạy trong cửa sổ đã nạp)');
  assert.ok(html.includes('listRecent({ entityType: auditHistTypeFilter'), 'bộ lọc vẫn đi qua listRecent ở tầng query như cũ');
});

test('tĩnh: block Xoá nổi bật bằng class riêng dùng đúng cặp màu danger sẵn có của app', () => {
  assert.ok(html.includes('.audit-action-block--delete { background:#fff0f0; border-color:#f1d5d7; }'), 'CSS block Xoá phải dùng nền #fff0f0 + viền #f1d5d7');
  const appleCss = read('apple-design.css');
  assert.ok(appleCss.includes('.btn.danger { background: #fff0f0; color: #be414b; border-color: #f1d5d7;'), 'cặp màu đó phải là màu danger SẴN CÓ của app (.btn.danger), không tự chế hệ màu mới');
  const seg = html.slice(html.indexOf('const AUDIT_ACTIONS'), html.indexOf('function auditActionDef'));
  assert.ok(seg.includes('{ key: "delete", label: "Xoá", color: "#dc2626" }'), 'pill Xoá dùng đỏ #dc2626 sẵn có (danger/Admin/overdue)');
  assert.ok(html.includes('g.key === "delete" ? " audit-action-block--delete" : ""'), 'chỉ block delete mới mang class nổi bật');
});

/* ---------- Harness vm: nạp index.html thật ---------- */
function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [
      { id: 'zac', name: 'Zac', role: 'Admin', active: true },
      { id: 'linh', name: 'Linh', role: 'BD', active: true },
    ],
    companies: [{ id: 'c1', name: 'Công ty Một', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hôm qua' }],
    games: [{ id: 'g1', title: 'Game Một', own: 'partner', company: 'c1', genre: 'Puzzle', platform: 'Android', stage: 'Prototype', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '' }],
    deals: [{ id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', game: 'g1', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] }],
    leads: [], tasks: [], activities: [],
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
/* Fixture: đã sắp mới nhất -> cũ nhất như listRecent trả về; nhãn changes
   TOK-* là dấu nhận diện duy nhất để khẳng định mục nằm đúng block. */
const FIXTURE_ROWS = [
  { entityType: 'deal', entityId: 'd1', at: '2026-10-31T12:00:00.000Z', byMemberId: 'linh', action: 'update', changes: [{ field: 'title', label: 'TOK-UPDATE-NEW', from: 'Deal Một', to: 'Deal Một Mới' }] },
  { entityType: 'company', entityId: 'c1', at: '2026-10-31T11:00:00.000Z', byMemberId: 'zac', action: 'create', changes: [{ field: 'name', label: 'TOK-CREATE', from: '', to: 'Công ty Một' }] },
  { entityType: 'deal', entityId: 'dGone', at: '2026-10-31T10:00:00.000Z', byMemberId: 'linh', action: 'delete', changes: [{ field: 'title', label: 'TOK-DELETE', from: 'Deal Đã Xoá Hẳn', to: '' }] },
  { entityType: 'game', entityId: 'g1', at: '2026-10-31T09:00:00.000Z', byMemberId: 'zac', action: 'update', changes: [{ field: 'title', label: 'TOK-UPDATE-OLD', from: 'Game Cũ', to: 'Game Một' }] },
  { entityType: 'game', entityId: 'g1', at: '2026-10-31T08:00:00.000Z', byMemberId: 'zac', action: 'legacy_weird', changes: [{ field: 'title', label: 'TOK-UNKNOWN', from: '', to: 'x' }] },
];
function setupAdmin(h, rowsOrFn) {
  h.ctx.SavaAuth = { currentUser: () => ({ memberId: 'zac', role: 'admin' }) };
  /* Stub listRecent mô phỏng ĐÚNG tầng query thật: lọc entity_type /
     by_member_id bằng opts trước khi trả về (gom block chạy sau đó). */
  h.ctx.SavaAudit = { listRecent: async opts => {
    let rows = typeof rowsOrFn === 'function' ? rowsOrFn(opts) : rowsOrFn;
    rows = rows.slice();
    if (opts && opts.entityType) rows = rows.filter(r => r.entityType === opts.entityType);
    if (opts && opts.byMemberId) rows = rows.filter(r => r.byMemberId === opts.byMemberId);
    return rows;
  }, recordBatch() {}, listFor: async () => [] };
}
async function renderHistory(h) {
  h.run('curView = "auditHistory"; render();');
  await tick(); await tick(); await tick();
  return h.getEl('auditHistoryList').innerHTML;
}
/* Cắt danh sách thành các block theo data-audit-action, giữ thứ tự xuất hiện (mẫu lead-status-blocks) */
function blocks(view) {
  const parts = view.split(/(?=data-audit-action=")/).slice(1);
  return parts.map(p => ({ key: p.slice('data-audit-action="'.length, p.indexOf('"', 'data-audit-action="'.length)), html: p }));
}

test('view: gom block đúng thứ tự vòng đời + Khác cuối, đúng nhãn + số lượng, mục nằm đúng block, trong block mới nhất trước', async () => {
  const h = loadIndex(); setupAdmin(h, FIXTURE_ROWS);
  const view = await renderHistory(h);
  const bs = blocks(view);
  assert.deepEqual(bs.map(b => b.key), ['create', 'update', 'delete', '__unknown__'], 'thứ tự block: Tạo mới -> Chỉnh sửa -> Xoá -> Khác');
  const byKey = Object.fromEntries(bs.map(b => [b.key, b.html]));
  assert.ok(byKey.create.includes('>Tạo mới</span>') && byKey.create.includes('1 mục'), 'đầu block Tạo mới: nhãn + số lượng');
  assert.ok(byKey.update.includes('>Chỉnh sửa</span>') && byKey.update.includes('2 mục'));
  assert.ok(byKey.delete.includes('>Xoá</span>') && byKey.delete.includes('1 mục'));
  assert.ok(byKey.__unknown__.includes('>Khác</span>') && byKey.__unknown__.includes('1 mục'), 'action lạ gom vào block Khác ở cuối');
  assert.ok(byKey.create.includes('TOK-CREATE') && !byKey.update.includes('TOK-CREATE'));
  assert.ok(byKey.delete.includes('TOK-DELETE') && byKey.delete.includes('Deal Đã Xoá Hẳn (đã xoá)'), 'mục delete vẫn hiện tên khôi phục + (đã xoá) trong block Xoá');
  assert.ok(byKey.__unknown__.includes('TOK-UNKNOWN') && byKey.__unknown__.includes('legacy_weird'), 'mục lạ hiện nguyên action đã lưu như entryHTML vốn có');
  assert.ok(byKey.update.indexOf('TOK-UPDATE-NEW') < byKey.update.indexOf('TOK-UPDATE-OLD'), 'trong block giữ thứ tự mới nhất -> cũ nhất của dữ liệu đã nạp');
  /* Định dạng từng mục không đổi: nhãn hành động trong mục vẫn của entryHTML dùng chung */
  assert.ok(byKey.create.includes('Đã tạo mới') && byKey.update.includes('Đã cập nhật') && byKey.delete.includes('Đã xoá'), 'entryHTML chung với drawer phải còn nguyên trong các block');
});

/* Thẻ <section ...> mở block của một action (class nằm TRƯỚC data-audit-action
   trong thẻ nên parser blocks() theo data-audit-action không thấy — kiểm riêng) */
function sectionTag(view, key) {
  const m = view.match(new RegExp('<section[^>]*data-audit-action="' + key + '"[^>]*>'));
  return m ? m[0] : '';
}
test('view: chỉ block Xoá mang class nổi bật audit-action-block--delete', async () => {
  const h = loadIndex(); setupAdmin(h, FIXTURE_ROWS);
  const view = await renderHistory(h);
  assert.ok(sectionTag(view, 'delete').includes('audit-action-block--delete'), 'block Xoá phải nổi bật: ' + sectionTag(view, 'delete'));
  for (const k of ['create', 'update', '__unknown__']) assert.ok(!sectionTag(view, k).includes('audit-action-block--delete'), 'block ' + k + ' không mang class nổi bật của Xoá');
});

test('view: block rỗng hiện kèm ghi chú khi KHÔNG lọc; không có mục lạ thì không có block Khác', async () => {
  const h = loadIndex();
  setupAdmin(h, FIXTURE_ROWS.filter(r => r.action === 'create' || r.action === 'delete'));
  const view = await renderHistory(h);
  const bs = blocks(view);
  assert.deepEqual(bs.map(b => b.key), ['create', 'update', 'delete'], 'không lọc: đủ 3 block vòng đời, Khác chỉ hiện khi có mục lạ');
  const upd = bs.find(b => b.key === 'update');
  assert.ok(upd.html.includes('0 mục') && upd.html.includes('Chưa có mục lịch sử nào ở loại này.'), 'block Chỉnh sửa rỗng vẫn hiện kèm ghi chú trống');
});

test('view: lọc (người sửa) chạy TRƯỚC gom block — block hết mục khớp thì ẩn, block còn mục vẫn đúng loại', async () => {
  const h = loadIndex(); setupAdmin(h, FIXTURE_ROWS);
  await renderHistory(h);
  h.run("setAuditHistFilter('member', 'linh')");
  await tick(); await tick(); await tick();
  const view = h.getEl('auditHistoryList').innerHTML;
  const bs = blocks(view);
  assert.deepEqual(bs.map(b => b.key), ['update', 'delete'], 'lọc theo linh (chỉ còn update + delete): block Tạo mới và Khác phải ẩn');
  const byKey = Object.fromEntries(bs.map(b => [b.key, b.html]));
  assert.ok(byKey.update.includes('TOK-UPDATE-NEW') && byKey.update.includes('1 mục'), 'sau lọc, block Chỉnh sửa chỉ còn mục của linh');
  assert.ok(byKey.delete.includes('TOK-DELETE'));
  assert.ok(!view.includes('TOK-CREATE') && !view.includes('TOK-UNKNOWN'), 'mục không khớp bộ lọc không được lọt vào block nào');
});

test('view: đang lọc mà không còn mục nào khớp -> không block nào, báo rõ bằng câu sẵn có', async () => {
  const h = loadIndex(); setupAdmin(h, FIXTURE_ROWS);
  await renderHistory(h);
  h.run("setAuditHistFilter('member', 'member-khong-co-muc-nao')");
  await tick(); await tick(); await tick();
  const view = h.getEl('auditHistoryList').innerHTML;
  assert.equal(blocks(view).length, 0, 'đang lọc + 0 mục khớp: ẩn hết block');
  assert.ok(view.includes('Chưa có lịch sử chỉnh sửa nào khớp bộ lọc.'));
});

test('view: tổng rỗng khi KHÔNG lọc -> hiện đủ 3 block rỗng kèm ghi chú, không có block Khác', async () => {
  const h = loadIndex(); setupAdmin(h, []);
  const view = await renderHistory(h);
  const bs = blocks(view);
  assert.deepEqual(bs.map(b => b.key), ['create', 'update', 'delete']);
  for (const b of bs) assert.ok(b.html.includes('0 mục') && b.html.includes('Chưa có mục lịch sử nào ở loại này.'), 'block ' + b.key + ' rỗng phải có ghi chú trống');
});
