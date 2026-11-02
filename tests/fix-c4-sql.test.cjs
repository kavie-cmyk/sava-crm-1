/* FIX-4 (cụm C4) — kiểm tĩnh 2 file SQL (nội dung thực thi của chúng;
   cả hai file ĐÃ được điều phối viên chạy lên project thật + verify ở
   đợt trước — xem header từng file):
   - C1 supabase/fix-publishing-guard-sys-stamp.sql: định nghĩa lại guard
     sao cho so legacy_extra loại trừ đúng 3 khoá sys (createdAt /
     updatedAt / updatedBy) ở cả hai phía; mọi cấm khác giữ nguyên tuyệt
     đối so với supabase/policies.sql gốc (đối chiếu bằng cách trích tập
     cột bị khoá từ cả hai file).
   - C5 supabase/audit-log-tighten.sql: (a) policy INSERT đổi sang
     has_crm_role(admin/bd/mkt) + khớp current_member_id; (b) CHECK
     entity_type đúng tập app sinh (đối chiếu shared.js CRM_ENTITY_TYPES
     + 'request' của Publishing); (c) trigger BEFORE INSERT ép at=now().
     Mọi lệnh an toàn khi chạy lại (drop-if-exists / create-or-replace). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ---------- C1 ---------- */
const SYS_KEYS = ['createdAt', 'updatedAt', 'updatedBy'];
function lockedCols(sql) {
  const out = new Set();
  for (const m of sql.matchAll(/new\.([a-z_]+) is distinct from old\.\1/g)) out.add(m[1]);
  return out;
}

test('C1: file guard mới loại trừ đúng 3 khoá sys ở CẢ hai phía old/new, không hơn không kém', () => {
  const sql = read('supabase/fix-publishing-guard-sys-stamp.sql');
  for (const side of ['new', 'old']) {
    const expr = SYS_KEYS.reduce((s, k) => s + " - '" + k + "'", side + '.legacy_extra');
    assert.ok(sql.includes('(' + expr + ')'), 'thiếu biểu thức loại trừ phía ' + side + ': ' + expr);
  }
  /* Không còn phép so legacy_extra toàn phần nào trong phần code (ngoài
     biểu thức đã loại trừ): trích các dòng có 'legacy_extra is distinct'
     thì phải không có dòng nào. */
  assert.ok(!/new\.legacy_extra is distinct from old\.legacy_extra/.test(sql), 'vẫn còn so legacy_extra toàn phần');
  assert.ok(sql.includes('create or replace function public.guard_publishing_request_update()'), 'phải CREATE OR REPLACE đúng tên hàm gốc');
  assert.ok(sql.includes('publishing_requests_guard_update'), 'phải gắn lại đúng tên trigger gốc');
  assert.ok(/drop trigger if exists publishing_requests_guard_update/.test(sql), 'trigger phải drop-if-exists để chạy lại an toàn');
});

test('C1: tập cột bị khoá với MKT của file mới = file gốc TRỪ legacy_extra (không nới lỏng cấm nào khác)', () => {
  const orig = lockedCols(read('supabase/policies.sql'));
  const fixed = lockedCols(read('supabase/fix-publishing-guard-sys-stamp.sql'));
  assert.ok(orig.has('legacy_extra'), 'file gốc phải khoá legacy_extra (tiền đề của fix)');
  const expected = new Set([...orig].filter(c => c !== 'legacy_extra'));
  assert.deepEqual([...fixed].sort(), [...expected].sort(),
    'file mới phải khoá y hệt các cột gốc (gồm id/created_at/created_by + mọi cột nghiệp vụ), chỉ bỏ phép so legacy_extra toàn phần');
  for (const col of ['kind', 'game_id', 'company_id', 'requested_by', 'requested_at', 'intake', 'build_label', 'source_url', 'assignee_id', 'due_date', 'due_raw', 'request_note', 'migrated_from']) {
    assert.ok(fixed.has(col), 'thiếu khoá cột ' + col);
  }
  const fixedSql = read('supabase/fix-publishing-guard-sys-stamp.sql');
  assert.ok(fixedSql.includes("public.current_member_role() = 'mkt'"), 'guard vẫn chỉ áp danh sách khoá cho vai mkt');
  assert.ok(fixedSql.includes('MKT không được sửa thông tin gốc'), 'giữ nguyên thông điệp raise gốc');
});

/* ---------- C5 ---------- */
test('C5(a): policy INSERT mới = has_crm_role(admin/bd/mkt) + khớp current_member_id, thay bản is_active_member cũ', () => {
  const sql = read('supabase/audit-log-tighten.sql');
  assert.ok(/drop policy if exists audit_log_insert_own on public\.audit_log/.test(sql), 'phải drop policy cũ theo kiểu if-exists');
  const seg = sql.slice(sql.indexOf('create policy audit_log_insert_own'));
  const policySeg = seg.slice(0, seg.indexOf(';'));
  assert.ok(policySeg.includes("public.has_crm_role(array['admin', 'bd', 'mkt'])"), 'INSERT phải yêu cầu has_crm_role admin/bd/mkt (loại vai other)');
  assert.ok(policySeg.includes('by_member_id = public.current_member_id()'), 'vẫn phải khớp member người gọi như cũ');
  assert.ok(!policySeg.includes('is_active_member'), 'policy mới không được quay lại is_active_member (vai other sẽ lọt)');
});

test('C5(b): CHECK entity_type đúng tập app sinh — đối chiếu shared.js CRM_ENTITY_TYPES + request của Publishing', () => {
  const sql = read('supabase/audit-log-tighten.sql');
  const shared = read('shared.js');
  const m = shared.match(/CRM_ENTITY_TYPES\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(m, 'không trích được CRM_ENTITY_TYPES từ shared.js');
  const fromApp = [...m[1].matchAll(/"([a-z]+)"/g)].map(x => x[1]).filter((v, i, a) => a.indexOf(v) === i);
  /* CRM_ENTITY_TYPES là cặp [khoá state, entityType] xen kẽ — entityType
     là phần tử thứ hai của mỗi cặp; trích trực tiếp các cặp cho chắc. */
  const pairs = [...m[1].matchAll(/\[\s*"[^"]+"\s*,\s*"([a-z]+)"\s*\]/g)].map(x => x[1]);
  assert.ok(pairs.length >= 7, 'phải trích được ít nhất 7 entityType từ CRM_ENTITY_TYPES, được: ' + pairs.join(','));
  const expected = [...new Set([...pairs, 'request'])].sort();
  assert.deepEqual(expected, ['activity', 'company', 'deal', 'event', 'game', 'lead', 'member', 'request', 'task'],
    'tập entityType đối chiếu từ app phải đúng tập task mô tả (sanity cho chính test này — đã gồm event của module Sự kiện)');
  const check = sql.match(/check \(entity_type in \(([^)]+)\)\)/);
  assert.ok(check, 'thiếu CHECK entity_type trong file tighten');
  const inSql = [...check[1].matchAll(/'([a-z]+)'/g)].map(x => x[1]).sort();
  /* Nguồn CHECK NAY GỒM CẢ supabase/events-module.sql: file đó chạy SAU
     audit-log-tighten.sql và định nghĩa LẠI đúng constraint
     audit_log_entity_type_known_check với tập cũ + 'event'. Tập CHECK
     hiệu lực cuối = CHECK trong events-module.sql (và hợp của hai file
     phải đúng tập app sinh, không thừa không thiếu). */
  const evSql = read('supabase/events-module.sql');
  /* Trích đúng CHECK của audit_log (constraint audit_log_entity_type_known_check)
     — file events-module còn một CHECK entity_type khác của bảng
     event_links ('company','lead','deal') không liên quan. */
  const evCheck = evSql.match(/add constraint audit_log_entity_type_known_check\s+check \(entity_type in \(([^)]+)\)\)/);
  assert.ok(evCheck, 'thiếu CHECK entity_type của audit_log trong file events-module');
  const inEvSql = [...evCheck[1].matchAll(/'([a-z]+)'/g)].map(x => x[1]).sort();
  assert.deepEqual(inEvSql, expected, 'CHECK entity_type trong events-module.sql (định nghĩa lại cuối cùng) phải đúng tập app sinh');
  assert.deepEqual([...new Set([...inSql, ...inEvSql])].sort(), expected, 'hợp CHECK của tighten + events-module phải đúng tập app sinh, không thừa không thiếu');
  assert.ok(/drop constraint if exists audit_log_entity_type_known_check/.test(sql), 'constraint phải drop-if-exists để chạy lại an toàn');
  assert.ok(fromApp.length > 0);
});

test('C5(c): trigger BEFORE INSERT ép at = now(); file an toàn khi chạy lại + có comment hệ quả', () => {
  const sql = read('supabase/audit-log-tighten.sql');
  assert.ok(sql.includes('create or replace function public.audit_log_force_at()'), 'thiếu hàm trigger');
  assert.ok(sql.includes('new.at = now();'), 'trigger phải ép at = now() bất kể client gửi gì');
  assert.ok(/drop trigger if exists audit_log_force_at on public\.audit_log/.test(sql), 'trigger phải drop-if-exists');
  assert.ok(/create trigger audit_log_force_at\s+before insert on public\.audit_log/.test(sql), 'trigger phải là BEFORE INSERT trên audit_log');
  assert.ok(sql.includes('bị GHI ĐÈ') || sql.includes('bị ghi đè'), 'comment phải nói rõ at của client bị ghi đè');
  assert.ok(!/create policy[^;]*for (update|delete)/i.test(sql), 'file tighten không được tạo policy UPDATE/DELETE (append-only giữ nguyên)');
});

test('C1+C5 tĩnh: hai file SQL đều ghi rõ ĐÃ áp dụng lên project thật + đã verify (không còn câu chưa chạy)', () => {
  for (const f of ['supabase/fix-publishing-guard-sys-stamp.sql', 'supabase/audit-log-tighten.sql']) {
    assert.ok(read(f).includes('ĐÃ ÁP DỤNG LÊN PROJECT THẬT') && read(f).includes('ĐÃ VERIFY'), f + ' phải ghi rõ đã áp dụng + đã verify');
    assert.ok(!read(f).includes('CHƯA CHẠY LÊN PROJECT THẬT'), f + ' không còn câu chưa chạy đã lỗi thời');
  }
});
