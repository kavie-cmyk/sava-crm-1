/* Module TÀI LIỆU BÁN HÀNG (sales_materials) — Zac chốt 10/11/2026:
   - shared.js: emptyState có `salesMaterials: []` (sau events, trước
     verticals), CRM_ENTITY_TYPES có cặp ["salesMaterials","sales_material"],
     FIELD_LABELS sales_material + TYPE_BADGE_META sales_material;
     migrateState chuẩn hoá S.salesMaterials cho cache cũ.
   - supabase-adapter.js: salesMaterial <-> rows của sales_materials.
     title/kind/url/description/line đi cột; createdBy -> cột created_by
     (chỉ ghi nhận người tạo; KHÔNG dùng phân quyền/hiển thị từ quyết
     định Zac 10/11/2026 17:00); createdAt/updatedAt/updatedBy qua
     legacy_extra (SALES_KNOWN cố ý không chứa chúng). kind lạ -> 'other',
     line lạ -> 'chung' ở cả hai chiều.
   - supabase/sales-materials.sql (tĩnh): bảng + trigger + index, RLS
     (SELECT xem chung admin/bd/mkt; INSERT admin+bd; UPDATE/DELETE
     admin+bd mọi tài liệu — nới quyền theo Zac 10/11/2026 17:00, áp
     lên server qua supabase/sales-materials-shared-edit.sql), grant
     tường minh + revoke anon, CHECK audit_log thêm 'sales_material'
     giữ nguyên tập cũ.
   - supabase-data.js (tĩnh): CRM_COLLECTIONS có 'salesMaterials';
     loadAll fetch sales_materials qua qSafe; syncCrm có
     ['sales_materials','id'] trong order + 'sales_materials' trong
     CONFLICT_TABLES.
   - index.html (tĩnh): nav desktop + mobile có mục "Tài liệu bán hàng"
     (data-view="sales"), render() đăng ký view sales -> vSalesMaterials,
     hàm CRUD + gate Sửa/Xoá theo VAI qua canEditSalesMaterial (admin/bd
     nào cũng sửa/xoá được, không gate theo người tạo); thẻ chỉ hiện
     ngày thêm, KHÔNG render tên người tạo; mkt.html KHÔNG có mục này
     (Zac chốt không làm UI phía MKT). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const A = require('../supabase-adapter.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ---------- shared.js qua vm ---------- */
function loadShared() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const ctx = vm.createContext({ console, localStorage: ls, setTimeout, clearTimeout, structuredClone });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}

test('shared: emptyState có salesMaterials đúng vị trí; CRM_ENTITY_TYPES/FIELD_LABELS/TYPE_BADGE_META có sales_material', () => {
  const ctx = loadShared();
  assert.deepEqual(Object.keys(ctx.emptyState()),
    ['members', 'companies', 'games', 'deals', 'leads', 'tasks', 'activities', 'events', 'salesMaterials', 'verticals']);
  assert.deepEqual([...ctx.emptyState().salesMaterials], []);
  const pairs = ctx.window.SavaSys.CRM_ENTITY_TYPES.map(p => [...p]);
  assert.ok(pairs.some(p => p[0] === 'salesMaterials' && p[1] === 'sales_material'), 'CRM_ENTITY_TYPES thiếu cặp ["salesMaterials","sales_material"]: ' + JSON.stringify(pairs));
  assert.deepEqual({ ...ctx.window.SavaSys.FIELD_LABELS.sales_material }, {
    title: 'Tiêu đề', kind: 'Loại tài liệu', url: 'Link tài liệu', description: 'Mô tả', line: 'Mảng', createdBy: 'Người thêm', imageUrl: 'Link ảnh đại diện',
  });
  assert.ok(ctx.typeBadgeHTML('sales_material').includes('Tài liệu bán hàng'));
});

test('shared: migrateState bổ sung salesMaterials cho cache cũ + lọc phần tử hỏng + ép id số về chuỗi', () => {
  const ctx = loadShared();
  const s = ctx.migrateState({ members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], events: [], verticals: [] });
  assert.deepEqual([...s.salesMaterials], [], 'cache cũ thiếu salesMaterials -> migrateState phải bổ sung []');
  const s2 = ctx.migrateState({
    members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], events: [], verticals: [],
    salesMaterials: [null, 'rác', { id: 42, title: 'Deck số' }],
  });
  assert.equal(s2.salesMaterials.length, 1, 'phần tử salesMaterials không phải object phải bị loại như mọi entity khác');
  assert.equal(s2.salesMaterials[0].id, '42', 'id số -> ép chuỗi như mọi entity');
});

test('shared: auditValue resolve nhãn kind/line/createdBy của sales_material', () => {
  const ctx = loadShared();
  const S = { members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }] };
  const sys = ctx.window.SavaSys;
  assert.equal(sys.auditValue(S, 'sales_material', {}, 'kind', 'deck'), 'Deck');
  assert.equal(sys.auditValue(S, 'sales_material', {}, 'kind', 'demo'), 'Demo');
  assert.equal(sys.auditValue(S, 'sales_material', {}, 'kind', 'other'), 'Tài liệu khác');
  assert.equal(sys.auditValue(S, 'sales_material', {}, 'line', 'chung'), 'Dùng chung');
  assert.equal(sys.auditValue(S, 'sales_material', {}, 'line', 'publishing'), 'Publishing');
  assert.ok(sys.auditValue(S, 'sales_material', {}, 'createdBy', 'zac').includes('Zac'));
});

/* ---------- adapter: round-trip ---------- */
const NOW = '2026-11-10T03:00:00.000Z', NOW2 = '2026-11-10T04:00:00.000Z';
const matFixture = {
  id: 'sm1', title: 'Deck giới thiệu Sava', kind: 'deck', url: 'https://drive.google.com/deck',
  description: 'Deck dùng khi pitch lần đầu', line: 'publishing', createdBy: 'zac',
  createdAt: NOW, updatedAt: NOW2, updatedBy: 'hoangdaden',
};
function stateWith(salesMaterials) {
  return { members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], events: [], salesMaterials, verticals: [] };
}

test('adapter: salesMaterial -> rows — cột riêng + created_by; sys qua legacy_extra; kind/line lạ chuẩn hoá', () => {
  const rows = A.crmStateToRows(stateWith([matFixture, { id: 'sm2', title: 'Demo lạ', kind: 'video', url: 'https://x', line: 'khac' }]));
  assert.equal(rows.sales_materials.length, 2);
  const r = rows.sales_materials[0];
  assert.equal(r.title, 'Deck giới thiệu Sava');
  assert.equal(r.kind, 'deck');
  assert.equal(r.url, 'https://drive.google.com/deck');
  assert.equal(r.description, 'Deck dùng khi pitch lần đầu');
  assert.equal(r.line, 'publishing');
  assert.equal(r.created_by, 'zac');
  assert.deepEqual(r.legacy_extra, { createdAt: NOW, updatedAt: NOW2, updatedBy: 'hoangdaden' },
    'legacy_extra chỉ chứa 3 trường hệ thống (+ khoá lạ nếu có)');
  assert.equal(rows.sales_materials[1].kind, 'other', 'kind lạ -> other (khớp CHECK của bảng)');
  assert.equal(rows.sales_materials[1].line, 'chung', 'line lạ -> chung (khớp CHECK của bảng)');
  assert.equal(rows.sales_materials[1].created_by, null, 'createdBy rỗng -> NULL');
});

test('adapter: round-trip state -> rows -> state giữ nguyên salesMaterial', () => {
  const src = stateWith([matFixture, { id: 'sm3', title: 'Tài liệu chung', kind: 'other', url: 'https://x', description: '', line: 'chung', createdBy: '' }]);
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(A.crmStateToRows(src))));
  assert.deepEqual(Object.keys(back),
    ['members', 'companies', 'games', 'deals', 'leads', 'tasks', 'activities', 'events', 'salesMaterials', 'verticals']);
  const m = back.salesMaterials[0];
  assert.equal(m.title, matFixture.title); assert.equal(m.kind, 'deck');
  assert.equal(m.url, matFixture.url); assert.equal(m.description, matFixture.description);
  assert.equal(m.line, 'publishing'); assert.equal(m.createdBy, 'zac');
  assert.equal(m.createdAt, NOW); assert.equal(m.updatedAt, NOW2); assert.equal(m.updatedBy, 'hoangdaden');
  assert.equal(back.salesMaterials[1].createdBy, '', 'created_by NULL -> createdBy rỗng khi đọc lại');
});

test('adapter: rows/state thiếu sales (DB chưa chạy SQL / cache cũ) -> vẫn hợp lệ với salesMaterials []', () => {
  const back = A.crmRowsToState({ members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], events: [] });
  assert.deepEqual(back.salesMaterials, []);
  const rows = A.crmStateToRows({ members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], events: [] });
  assert.deepEqual(rows.sales_materials, []);
});

/* ---------- SQL tĩnh ---------- */
test('SQL: sales-materials.sql có bảng + cột + CHECK + trigger theo hợp đồng', () => {
  const sql = read('supabase/sales-materials.sql');
  assert.ok(/create table if not exists public\.sales_materials \(/.test(sql), 'thiếu create table sales_materials (if not exists)');
  for (const frag of ['id           text primary key', 'title        text not null',
    "check (kind in ('deck', 'demo', 'other'))",
    "check (line in ('chung', 'game_studio', 'publishing', 'ai', 'metaverse'))",
    'created_by   text', "legacy_extra jsonb not null default '{}'::jsonb"]) {
    assert.ok(sql.includes(frag), 'bảng sales_materials thiếu theo hợp đồng: ' + frag.trim());
  }
  assert.ok(/drop trigger if exists sales_materials_set_updated_at on public\.sales_materials/.test(sql), 'trigger phải drop-if-exists');
  assert.ok(/create trigger sales_materials_set_updated_at[\s\S]*?execute function public\.set_updated_at\(\)/.test(sql),
    'trigger sales_materials_set_updated_at phải dùng lại public.set_updated_at()');
});

test('SQL: RLS sales_materials — SELECT xem chung admin/bd/mkt; INSERT/UPDATE/DELETE admin+bd (UPDATE/DELETE bỏ gate người tạo — Zac 10/11/2026 17:00); anon không policy', () => {
  const sql = read('supabase/sales-materials.sql');
  assert.ok(sql.includes('alter table public.sales_materials enable row level security;'), 'chưa bật RLS');
  const segOf = name => { const s = sql.slice(sql.indexOf('create policy ' + name)); return s.slice(0, s.indexOf(';')); };
  const sel = segOf('sales_materials_select_shared');
  assert.ok(sel.includes('for select to authenticated'), 'select_shared phải for select');
  assert.ok(sel.includes("has_crm_role(array['admin', 'bd', 'mkt'])"), 'SELECT phải xem chung admin/bd/mkt');
  const ins = segOf('sales_materials_insert_bd');
  assert.ok(ins.includes('for insert to authenticated'), 'insert_bd phải for insert');
  assert.ok(ins.includes("has_crm_role(array['admin', 'bd'])"), 'INSERT chỉ admin+bd');
  assert.ok(!ins.includes("'mkt'"), 'INSERT không được cấp cho mkt');
  assert.ok(!ins.includes('created_by'), 'INSERT KHÔNG được siết thêm điều kiện created_by (đề xuất cũ đã bị Zac thay thế 10/11/2026)');
  for (const [name, cmd] of [['sales_materials_update_bd', 'update'], ['sales_materials_delete_bd', 'delete']]) {
    const seg = segOf(name);
    assert.ok(seg.includes('for ' + cmd + ' to authenticated'), name + ' phải for ' + cmd);
    assert.ok(seg.includes("has_crm_role(array['admin', 'bd'])"), name + ' phải mở cho admin+bd (mọi tài liệu)');
    assert.ok(!seg.includes('created_by'), name + ' KHÔNG được còn điều kiện người tạo created_by');
    assert.ok(!seg.includes('current_member_id'), name + ' KHÔNG được còn đối chiếu current_member_id()');
    assert.ok(!seg.includes("'mkt'"), name + ' không được cấp cho mkt');
  }
  assert.ok(!sql.includes('create policy sales_materials_update_own'), 'policy update_own (gate người tạo) phải đã bị bỏ');
  assert.ok(!sql.includes('create policy sales_materials_delete_own'), 'policy delete_own (gate người tạo) phải đã bị bỏ');
  assert.ok(sql.includes('revoke all on public.sales_materials from anon;'), 'thiếu revoke tường minh khỏi anon');
  assert.ok(sql.includes('grant select, insert, update, delete on public.sales_materials to authenticated;'), 'thiếu grant tường minh cho authenticated');
  assert.ok(!/to anon/.test(sql.replace('revoke all on public.sales_materials from anon;', '')), 'không được có policy/grant nào cho anon');
});

test('SQL: migration sales-materials-shared-edit.sql gỡ *_own, tạo *_bd admin/bd cho UPDATE/DELETE, không đụng SELECT/INSERT', () => {
  const mig = read('supabase/sales-materials-shared-edit.sql');
  assert.ok(mig.includes('drop policy if exists sales_materials_update_own on public.sales_materials;'), 'migration phải gỡ policy update_own cũ');
  assert.ok(mig.includes('drop policy if exists sales_materials_delete_own on public.sales_materials;'), 'migration phải gỡ policy delete_own cũ');
  const segOf = name => { const s = mig.slice(mig.indexOf('create policy ' + name)); return s.slice(0, s.indexOf(';')); };
  const upd = segOf('sales_materials_update_bd');
  assert.ok(upd.includes('for update to authenticated'), 'update_bd phải for update');
  assert.ok(upd.includes("using (public.has_crm_role(array['admin', 'bd']))"), 'update_bd USING phải là admin/bd');
  assert.ok(upd.includes("with check (public.has_crm_role(array['admin', 'bd']))"), 'update_bd WITH CHECK phải là admin/bd');
  const del = segOf('sales_materials_delete_bd');
  assert.ok(del.includes('for delete to authenticated'), 'delete_bd phải for delete');
  assert.ok(del.includes("using (public.has_crm_role(array['admin', 'bd']))"), 'delete_bd USING phải là admin/bd');
  for (const seg of [upd, del]) {
    assert.ok(!seg.includes('created_by'), 'policy mới không được chứa điều kiện created_by');
    assert.ok(!seg.includes("'mkt'"), 'policy ghi không được cấp cho mkt');
  }
  assert.ok(!mig.includes('create policy sales_materials_select_shared'), 'migration KHÔNG đụng policy SELECT');
  assert.ok(!mig.includes('create policy sales_materials_insert_bd'), 'migration KHÔNG đụng policy INSERT');
});

test('SQL: mở rộng CHECK audit_log thêm sales_material, giữ nguyên tập cũ + event', () => {
  const sql = read('supabase/sales-materials.sql');
  assert.ok(/alter table public\.audit_log\s+drop constraint if exists audit_log_entity_type_known_check/.test(sql),
    'CHECK audit phải drop-if-exists trước khi add lại');
  assert.ok(sql.includes("check (entity_type in ('deal', 'company', 'lead', 'game', 'task', 'member', 'activity', 'request', 'event', 'sales_material'))"),
    'CHECK audit_log phải là tập cũ + event + sales_material, đúng thứ tự/ký tự hợp đồng');
});

/* ---------- supabase-data.js tĩnh ---------- */
test('data tĩnh: loadAll fetch sales_materials qua qSafe; CRM_COLLECTIONS + syncCrm wiring', () => {
  const src = read('supabase-data.js');
  assert.ok(src.includes("qSafe('sales_materials', byCreated)"), 'loadAll phải fetch sales_materials qua qSafe');
  assert.ok(src.includes('sales_materials: salesMaterials'), 'loadAll phải truyền sales_materials vào crmRowsToState');
  assert.ok(src.includes("['sales_materials', salesMaterials]"), 'loadAll phải noteUpdated cho sales_materials');
  assert.ok(src.includes("'salesMaterials'"), 'CRM_COLLECTIONS/journal phải gồm salesMaterials');
  assert.ok(src.includes("['sales_materials', 'id']"), "order của syncCrm thiếu ['sales_materials','id']");
  const conflictSeg = src.slice(src.indexOf('const CONFLICT_TABLES'), src.indexOf(';', src.indexOf('const CONFLICT_TABLES')));
  assert.ok(conflictSeg.includes("'sales_materials'"), "CONFLICT_TABLES thiếu 'sales_materials'");
});

/* ---------- index.html tĩnh (chỉ app BD) ---------- */
test('UI tĩnh: nav có mục Tài liệu bán hàng ở cả desktop + mobile; render đăng ký view sales; mkt.html không có', () => {
  const html = read('index.html');
  const navCount = (html.match(/data-view="sales"/g) || []).length;
  assert.equal(navCount, 2, 'phải có đúng 2 nút nav data-view="sales" (desktop + mobile), thấy: ' + navCount);
  assert.ok(html.includes('sales:vSalesMaterials'), 'render() phải đăng ký view sales -> vSalesMaterials');
  assert.ok(html.includes('sales:"Tài liệu bán hàng"'), 'render() phải có tiêu đề view sales');
  const mkt = read('mkt.html');
  assert.ok(!mkt.includes('data-view="sales"'), 'mkt.html KHÔNG được có mục Tài liệu bán hàng (Zac chốt không làm UI phía MKT)');
  assert.ok(!mkt.includes('vSalesMaterials'), 'mkt.html KHÔNG được có view tài liệu bán hàng');
});

/* ---------- Ảnh đại diện (imageUrl -> cột image_url) — đợt nạp demo 10/11/2026 ---------- */
test('adapter: imageUrl đi cột image_url (không vào legacy_extra) + round-trip giữ nguyên; thiếu -> chuỗi rỗng', () => {
  const rows = A.crmStateToRows(stateWith([{ ...matFixture, imageUrl: 'assets/materials/tour360.jpg' }]));
  const r = rows.sales_materials[0];
  assert.equal(r.image_url, 'assets/materials/tour360.jpg', 'imageUrl phải ghi vào cột image_url');
  assert.ok(!('imageUrl' in r.legacy_extra), 'imageUrl đã có cột thật, không được lọt vào legacy_extra');
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  assert.equal(back.salesMaterials[0].imageUrl, 'assets/materials/tour360.jpg', 'đọc lại phải khôi phục imageUrl từ image_url');
  const rows2 = A.crmStateToRows(stateWith([matFixture]));
  assert.equal(rows2.sales_materials[0].image_url, '', 'tài liệu không có ảnh -> image_url rỗng (tuỳ chọn, không bắt buộc)');
  const back2 = A.crmRowsToState({ sales_materials: [{ id: 'smx', title: 'X', kind: 'demo', url: 'https://x', description: '', line: 'ai', created_by: 'zac', legacy_extra: {} }] });
  assert.equal(back2.salesMaterials[0].imageUrl, '', 'row thiếu image_url (DB cũ) -> imageUrl rỗng');
});

test('SQL: sales-materials-image.sql thêm cột image_url an toàn chạy lại; sales-materials.sql cũng khai cột cho cài mới', () => {
  const mig = read('supabase/sales-materials-image.sql');
  assert.ok(/alter table public\.sales_materials\s+add column if not exists image_url text not null default ''/.test(mig),
    'migration phải add column if not exists image_url text not null default \'\'');
  const base = read('supabase/sales-materials.sql');
  assert.ok(base.includes('image_url'), 'sales-materials.sql (cài mới) phải khai cột image_url');
});

test('UI tĩnh: ảnh đại diện — form có ô Link ảnh đại diện (tuỳ chọn), thẻ có khung .sm-thumb + onerror gỡ ảnh lỗi, salesImageSrc chặn scheme lạ', () => {
  const html = read('index.html');
  assert.ok(html.includes('function salesImageSrc('), 'thiếu helper salesImageSrc');
  assert.ok(html.includes('function salesThumbHTML('), 'thiếu helper salesThumbHTML');
  assert.ok(html.includes('.sm-thumb {'), 'thiếu CSS khung ảnh .sm-thumb');
  assert.ok(html.includes('aspect-ratio:16/9'), 'khung ảnh phải tỉ lệ cố định 16/9');
  assert.ok(html.includes('object-fit:cover'), 'ảnh trong khung phải cover');
  assert.ok(html.includes('onerror="this.remove()"'), 'ảnh lỗi tải phải tự gỡ (hiện nền/huy hiệu dự phòng, không icon gãy)');
  const viewSeg = html.slice(html.indexOf('function vSalesMaterials()'), html.indexOf('function openSalesMaterialForm('));
  assert.ok(viewSeg.includes('salesThumbHTML(m)'), 'thẻ tài liệu phải render khung ảnh qua salesThumbHTML');
  const formSeg = html.slice(html.indexOf('function openSalesMaterialForm('), html.indexOf('function saveSalesMaterial('));
  assert.ok(formSeg.includes('e_sm_image'), 'form thêm/sửa phải có ô nhập ảnh e_sm_image');
  assert.ok(formSeg.includes('Link ảnh đại diện (tuỳ chọn)'), 'ô ảnh phải ghi rõ tuỳ chọn');
  const saveSeg = html.slice(html.indexOf('function saveSalesMaterial('), html.indexOf('function deleteSalesMaterial('));
  assert.ok(saveSeg.includes('imageUrl'), 'saveSalesMaterial phải lưu imageUrl');
  const srcSeg = html.slice(html.indexOf('function salesImageSrc('), html.indexOf('function salesThumbHTML('));
  assert.ok(srcSeg.includes('safeHttpUrl'), 'link ảnh http/https phải qua safeHttpUrl');
  assert.ok(srcSeg.includes('assets'), 'đường dẫn ảnh tương đối trong app (assets/...) phải được chấp nhận');
});

test('UI tĩnh: CRUD tài liệu bán hàng — gate theo VAI admin/bd (không theo người tạo), thẻ không render tên người tạo, validate http/https, lưu qua save() chuẩn', () => {
  const html = read('index.html');
  for (const fn of ['function vSalesMaterials()', 'function openSalesMaterialForm(', 'function saveSalesMaterial(', 'function deleteSalesMaterial(', 'function canEditSalesMaterial(']) {
    assert.ok(html.includes(fn), 'index.html thiếu ' + fn);
  }
  const gate = html.slice(html.indexOf('function canEditSalesMaterial('), html.indexOf('let salesTypeFilter'));
  assert.ok(gate.includes('u.role === "admin"') && gate.includes('u.role === "bd"'), 'canEditSalesMaterial phải mở cho vai admin VÀ bd (mọi tài liệu)');
  assert.ok(!gate.includes('createdBy'), 'canEditSalesMaterial KHÔNG được đối chiếu người tạo (createdBy) nữa — Zac chốt 10/11/2026 17:00');
  assert.ok(!gate.includes('memberId'), 'canEditSalesMaterial KHÔNG được so memberId với người tạo nữa');
  const saveSeg = html.slice(html.indexOf('function saveSalesMaterial('), html.indexOf('function deleteSalesMaterial('));
  assert.ok(saveSeg.includes('/^https?:\\/\\//i'), 'saveSalesMaterial phải validate link http/https');
  assert.ok(saveSeg.includes('save(); closeEdit(); render();'), 'lưu xong phải qua save() chuẩn + đóng form về chế độ xem (view-first)');
  assert.ok(saveSeg.includes('createdBy: defaultOwnerId()'), 'tạo mới VẪN ghi createdBy = member đang đăng nhập (cột ghi nhận giữ nguyên, chỉ không phân quyền/hiển thị)');
  const viewSeg = html.slice(html.indexOf('function vSalesMaterials()'), html.indexOf('function openSalesMaterialForm('));
  assert.ok(viewSeg.includes('salesTypeFilter') && viewSeg.includes('salesLineFilter'), 'view phải lọc theo Loại + Mảng');
  assert.ok(viewSeg.includes('salesFold'), 'view phải tìm theo tiêu đề không dấu (salesFold)');
  assert.ok(viewSeg.includes('Mở tài liệu'), 'thẻ tài liệu phải có nút Mở tài liệu');
  assert.ok(!viewSeg.includes('Thêm bởi'), 'thẻ tài liệu KHÔNG được render dòng "Thêm bởi <tên>" nữa — Zac chốt bỏ tên người tạo');
  assert.ok(!viewSeg.includes('memberName(S, m.createdBy)'), 'thẻ tài liệu KHÔNG được resolve tên người tạo từ createdBy');
  assert.ok(viewSeg.includes('Thêm ngày'), 'thẻ tài liệu chỉ giữ ngày thêm (dòng "Thêm ngày <dd-mm-yyyy>")');
  assert.ok(viewSeg.includes('canEditSalesMaterial(m)'), 'nút Sửa/Xoá trên thẻ phải gate theo canEditSalesMaterial');
  assert.ok(viewSeg.includes('Admin và BD nào cũng sửa/xoá được'), 'ghi chú cuối view phải nói rõ Admin/BD nào cũng sửa/xoá được');
});
