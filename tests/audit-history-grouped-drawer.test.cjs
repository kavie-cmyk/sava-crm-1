/* Gom nhóm lịch sử theo HÀNH ĐỘNG trong DRAWER từng đối tượng:
   - Chuẩn trình bày lấy ĐÚNG từ Lịch sử tổng (index.html): block theo
     `action`, thứ tự vòng đời Tạo mới -> Chỉnh sửa -> Xoá, nhãn + màu
     pill create "Tạo mới" #22c55e / update "Chỉnh sửa" #2563eb /
     delete "Xoá" #dc2626, header có "<n> mục"; action lạ -> block
     "Khác" ở cuối, chỉ hiện khi có mục lạ.
   - Helper DÙNG CHUNG duy nhất ở audit.js (SavaAuditUI.groupAuditRows /
     groupedHistoryHTML / toggleGroup / newestAuditGroupKey): drawer
     (mọi bề mặt qua SavaAuditUI.loadInto: company/lead/deal/game/task/
     event/member/activity ở index.html + request ở publishing.js) và
     Lịch sử tổng (auditGroupedRows ở index.html uỷ quyền cho helper)
     dùng cùng một phép gom — không hai bản cài đặt lệch nhau.
   - Mặc định drawer: nhóm chứa mục MỚI NHẤT mở sẵn, các nhóm còn lại
     thu gọn; nhóm 0 mục ẩn hẳn. Bấm header (toggleGroup) thu/mở được
     từng nhóm (accordion), trạng thái là UI-state trong phiên.
   - Trong nhóm: giữ nguyên entryHTML hiện tại (diff trường, nhãn đã
     resolve, thời gian dd-mm-yyyy hh:mm; mục tổng theo lô nằm trong
     nhóm hành động tương ứng) + thứ tự mới nhất trước như đã nạp.
   - Ranh giới: CHỈ trình bày — listFor vẫn limit 100/đối tượng,
     listRecent vẫn limit 200, không đổi quyền/dữ liệu audit.
   Fixture nằm trong file test này. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tick = () => new Promise(r => setTimeout(r, 0));

function loadAuditUI() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('audit.js'), ctx, { filename: 'audit.js' });
  return ctx.window.SavaAuditUI;
}
const STATE = { members: [{ id: 'zac', name: 'Zac' }, { id: 'linh', name: 'Linh' }] };
/* Đã xếp mới nhất -> cũ nhất như listFor trả về (order at desc, limit 100) */
const ROWS = [
  { entityType: 'deal', entityId: 'd1', action: 'update', at: '2026-11-01T10:00:00.000Z', byMemberId: 'linh', changes: [{ field: 'title', label: 'TOK-U-NEW', from: 'A', to: 'B' }] },
  { entityType: 'deal', entityId: 'd1', action: 'create', at: '2026-11-01T09:00:00.000Z', byMemberId: 'zac', changes: [{ field: 'title', label: 'TOK-CREATE', from: '', to: 'A' }] },
  { entityType: 'deal', entityId: 'd1', action: 'update', at: '2026-11-01T08:00:00.000Z', byMemberId: 'zac', changes: [{ field: 'stage', label: 'TOK-U-OLD', from: 'x', to: 'y' }] },
  { entityType: 'deal', entityId: 'd1', action: 'delete', at: '2026-11-01T07:00:00.000Z', byMemberId: 'zac', changes: [{ field: 'title', label: 'TOK-DELETE', from: 'A', to: '' }] },
];
const J = v => JSON.parse(JSON.stringify(v)); /* chuẩn hoá object từ realm vm về realm test cho deepEqual */
function groupsOf(html) {
  const parts = html.split(/(?=data-audit-action=")/).slice(1);
  return parts.map(p => ({ key: p.slice('data-audit-action="'.length, p.indexOf('"', 'data-audit-action="'.length)), html: p }));
}
/* Thẻ <section ...> mở nhóm (class nằm TRƯỚC data-audit-action nên
   groupsOf không thấy — kiểm riêng như test audit-history-action-blocks) */
function sectionTag(html, key) {
  const m = html.match(new RegExp('<section[^>]*data-audit-action="' + key + '"[^>]*>'));
  return m ? m[0] : '';
}

/* ---------- 1) Phép gom thuần ---------- */

test('groupAuditRows: phân nhóm theo action, đếm đúng, thứ tự vòng đời + trong nhóm mới nhất trước', () => {
  const UI = loadAuditUI();
  const groups = UI.groupAuditRows(ROWS);
  assert.deepEqual(J(groups.map(g => g.key)), ['create', 'update', 'delete'], 'thứ tự nhóm: create -> update -> delete');
  assert.deepEqual(J(groups.map(g => g.count)), [1, 2, 1], 'count phải khớp số mục từng action');
  assert.deepEqual(J(groups.map(g => g.label)), ['Tạo mới', 'Chỉnh sửa', 'Xoá'], 'nhãn ĐÚNG bộ nhãn của Lịch sử tổng');
  const upd = groups.find(g => g.key === 'update');
  assert.deepEqual(J(upd.rows.map(r => r.changes[0].label)), ['TOK-U-NEW', 'TOK-U-OLD'], 'trong nhóm giữ nguyên thứ tự đã nạp (mới nhất trước), không sắp xếp lại');
  assert.equal(UI.newestAuditGroupKey(ROWS), 'update', 'nhóm mới nhất = nhóm của mục đầu tiên đã nạp');
  assert.equal(UI.newestAuditGroupKey([]), null);
});

test('groupAuditRows: nhóm rỗng vẫn có mặt với count 0 (bề mặt tự quyết ẩn/hiện); action lạ -> Khác ở cuối chỉ khi có mục lạ; input hỏng -> 3 nhóm rỗng', () => {
  const UI = loadAuditUI();
  const onlyCreate = UI.groupAuditRows(ROWS.filter(r => r.action === 'create'));
  assert.deepEqual(J(onlyCreate.map(g => [g.key, g.count])), [['create', 1], ['update', 0], ['delete', 0]], 'không có mục lạ -> không có nhóm Khác');
  const weird = UI.groupAuditRows([...ROWS, { entityType: 'deal', entityId: 'd1', action: 'legacy_weird', at: '2026-11-01T06:00:00.000Z', byMemberId: 'zac', changes: [] }]);
  assert.deepEqual(J(weird.map(g => g.key)), ['create', 'update', 'delete', '__unknown__'], 'nhóm Khác ở cuối');
  assert.equal(weird[3].label, 'Khác'); assert.equal(weird[3].count, 1);
  assert.equal(UI.newestAuditGroupKey([{ action: 'legacy_weird' }]), '__unknown__');
  assert.deepEqual(J(UI.groupAuditRows(null).map(g => g.count)), [0, 0, 0], 'rows không phải mảng -> 3 nhóm rỗng, không lỗi');
  assert.deepEqual(J(UI.groupAuditRows(undefined).map(g => g.count)), [0, 0, 0]);
});

test('tĩnh: định nghĩa nhóm ở audit.js KHỚP HỆT AUDIT_ACTIONS của Lịch sử tổng (nhãn + màu + thứ tự) — một chuẩn duy nhất', () => {
  const UI = loadAuditUI();
  const html = read('index.html');
  const seg = html.slice(html.indexOf('const AUDIT_ACTIONS'), html.indexOf('const AUDIT_ACTION_UNKNOWN'));
  const idxDefs = [...seg.matchAll(/key:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*color:\s*"([^"]+)"/g)].map(m => ({ key: m[1], label: m[2], color: m[3] }));
  assert.deepEqual(J(UI.AUDIT_GROUP_DEFS), idxDefs, 'AUDIT_GROUP_DEFS (audit.js) phải khớp AUDIT_ACTIONS (index.html)');
  const unk = html.slice(html.indexOf('const AUDIT_ACTION_UNKNOWN'), html.indexOf('function auditActionDef'));
  assert.ok(unk.includes('label: "Khác"') && UI.AUDIT_GROUP_UNKNOWN.label === 'Khác' && UI.AUDIT_GROUP_UNKNOWN.color === '#64748b');
});

/* ---------- 2) Render drawer đã gom nhóm ---------- */

test('groupedHistoryHTML: ẩn nhóm rỗng, header pill + số lượng, mặc định chỉ nhóm mới nhất mở, mục nằm đúng nhóm', () => {
  const UI = loadAuditUI();
  const html = UI.groupedHistoryHTML(STATE, ROWS.filter(r => r.action !== 'delete'), 'deal', 'd1');
  const gs = groupsOf(html);
  assert.deepEqual(gs.map(g => g.key), ['create', 'update'], 'nhóm Xoá 0 mục phải ẩn hẳn khỏi drawer');
  const byKey = Object.fromEntries(gs.map(g => [g.key, g.html]));
  assert.ok(byKey.create.includes('>Tạo mới</span>') && byKey.create.includes('1 mục'), 'header nhóm Tạo mới: pill nhãn + số lượng như Lịch sử tổng');
  assert.ok(byKey.update.includes('>Chỉnh sửa</span>') && byKey.update.includes('2 mục'));
  /* Mặc định: update chứa mục mới nhất (rows[0]) -> mở; create -> thu gọn (chỉ header, không có mục) */
  assert.ok(byKey.update.includes('TOK-U-NEW') && byKey.update.includes('TOK-U-OLD'), 'nhóm mới nhất mở sẵn, hiện đủ mục theo thứ tự mới nhất trước');
  assert.ok(!byKey.create.includes('TOK-CREATE'), 'nhóm còn lại thu gọn mặc định: không render mục');
  assert.ok(sectionTag(html, 'create').includes('audit-group--collapsed') && byKey.create.includes('aria-expanded="false"'), 'nhóm thu gọn mang class + aria-expanded=false');
  assert.ok(byKey.update.includes('aria-expanded="true"'));
  assert.ok(byKey.create.includes('toggleGroup'), 'header có nút bấm thu/mở (accordion)');
});

test('groupedHistoryHTML: nhóm Xoá nổi bật danger; mục tổng theo lô nằm trong nhóm hành động tương ứng; render mục giữ nguyên entryHTML', () => {
  const UI = loadAuditUI();
  const batchRow = { entityType: 'company', entityId: 'lo-import-1', action: 'create', at: '2026-11-02T10:00:00.000Z', byMemberId: 'zac', changes: [{ batch: true, importBatch: 'lo-import-1', count: 30, ids: [] }] };
  const html = UI.groupedHistoryHTML(STATE, [batchRow, ...ROWS], 'company', 'lo-import-1');
  const gs = groupsOf(html);
  const byKey = Object.fromEntries(gs.map(g => [g.key, g.html]));
  assert.ok(byKey.create.includes('30 Công ty'), 'mục tổng theo lô (batch) phải nằm trong nhóm Tạo mới — nhóm hành động của nó');
  assert.ok(sectionTag(html, 'delete').includes('audit-action-block--delete'), 'nhóm Xoá mang class nổi bật như block Xoá của Lịch sử tổng');
  /* Ở fixture này mục mới nhất thuộc nhóm create (lô) nên update thu gọn:
     header vẫn đếm đủ 2 mục nhưng không render mục — đúng mặc định drawer. */
  assert.ok(byKey.update.includes('2 mục') && !byKey.update.includes('TOK-U-NEW'), 'nhóm không chứa mục mới nhất thì thu gọn, header vẫn đếm đủ');
  /* Render riêng (đối tượng khác, update là nhóm mới nhất -> mở): nội
     dung mục vẫn là entryHTML hiện tại (diff + thời gian dd-mm-yyyy). */
  const html2 = UI.groupedHistoryHTML(STATE, ROWS, 'deal', 'd1');
  const upd2 = Object.fromEntries(groupsOf(html2).map(g => [g.key, g.html])).update;
  assert.ok(upd2.includes('TOK-U-NEW: A → B'), 'nội dung mục vẫn là entryHTML hiện tại (diff "nhãn: cũ → mới")');
  assert.ok(upd2.includes('01-11-2026 17:00'), 'thời gian mục giữ định dạng dd-mm-yyyy hh:mm');
});

/* ---------- 3) loadInto + accordion qua toggleGroup ---------- */

test('loadInto: nạp qua listFor rồi render ĐÃ GOM NHÓM; toggleGroup thu/mở từng nhóm mà không đổi dữ liệu', async () => {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('audit.js'), ctx, { filename: 'audit.js' });
  const UI = ctx.window.SavaAuditUI;
  let listForCalls = 0;
  ctx.window.SavaAudit = { listFor: async () => { listForCalls++; return ROWS.slice(); } };
  const box = { innerHTML: '' };
  const root = { querySelector: () => box };
  await UI.loadInto(root, STATE, 'deal', 'd1');
  let gs = groupsOf(box.innerHTML);
  assert.deepEqual(gs.map(g => g.key), ['create', 'update', 'delete'], 'drawer hiện đủ 3 nhóm có mục');
  assert.ok(!Object.fromEntries(gs.map(g => [g.key, g.html])).create.includes('TOK-CREATE'), 'mặc định nhóm Tạo mới thu gọn');
  /* Mở nhóm Tạo mới -> mục hiện; nhóm Chỉnh sửa (đang mở) vẫn nguyên */
  UI.toggleGroup('deal', 'd1', 'create'); await tick(); await tick();
  gs = groupsOf(box.innerHTML);
  const byKey = Object.fromEntries(gs.map(g => [g.key, g.html]));
  assert.ok(byKey.create.includes('TOK-CREATE'), 'sau toggle, nhóm Tạo mới mở và hiện mục');
  assert.ok(byKey.update.includes('TOK-U-NEW'), 'mở nhóm khác không thu nhóm đang mở (accordion độc lập từng nhóm như Lịch sử tổng)');
  /* Bấm lại -> thu gọn lại */
  UI.toggleGroup('deal', 'd1', 'create'); await tick(); await tick();
  assert.ok(!groupsOf(box.innerHTML).find(g => g.key === 'create').html.includes('TOK-CREATE'), 'toggle lần nữa thu gọn lại');
  assert.ok(listForCalls >= 3, 'toggle chỉ ĐỌC LẠI qua listFor, không có đường ghi nào');
});

/* ---------- 4) Bề mặt + ranh giới cứng (tĩnh) ---------- */

test('tĩnh: mọi bề mặt drawer dùng chung SavaAuditUI (loadInto/groupedHistoryHTML); Lịch sử tổng uỷ quyền phép gom cho helper; giới hạn 100/200 giữ nguyên', () => {
  const idx = read('index.html'), pub = read('publishing.js'), auditJs = read('audit.js'), data = read('supabase-data.js');
  /* Bề mặt drawer ở app BD: 8 loại đối tượng qua auditSectionHTML + loadDrawerAudit */
  for (const t of ['event', 'member', 'deal', 'company', 'game', 'lead', 'task', 'activity'])
    assert.ok(idx.includes(`auditSectionHTML("${t}"`), 'index.html thiếu bề mặt lịch sử drawer cho ' + t);
  assert.ok(idx.includes('SavaAuditUI.loadInto'), 'drawer BD phải nạp qua SavaAuditUI.loadInto');
  /* Bề mặt Publishing/MKT: request qua sectionHTML('request') + loadInto trên #editor */
  assert.ok(pub.includes("sectionHTML('request'"), 'publishing.js thiếu bề mặt lịch sử request');
  assert.ok(pub.includes('SavaAuditUI') && pub.includes('loadInto'), 'publishing.js phải nạp lịch sử qua SavaAuditUI.loadInto');
  /* loadInto render bằng groupedHistoryHTML — mọi bề mặt trên tự động được gom nhóm */
  assert.ok(auditJs.includes('box.innerHTML = groupedHistoryHTML(state, rows, entityType, entityId);'), 'loadInto phải render bằng groupedHistoryHTML');
  /* Lịch sử tổng: uỷ quyền gom cho helper chung + giữ accordion sẵn có */
  assert.ok(idx.includes('SavaAuditUI.groupAuditRows'), 'index.html phải uỷ quyền phép gom cho SavaAuditUI.groupAuditRows');
  assert.ok(idx.includes('const groups = auditGroupedRows(rows);'), 'auditHistGroupsHTML phải dùng auditGroupedRows');
  assert.ok(idx.includes('function toggleAuditHistBlock'), 'Lịch sử tổng giữ nguyên accordion sẵn có');
  /* Ranh giới cứng: trần nạp không đổi */
  const forSeg = data.slice(data.indexOf('async function auditListFor'), data.indexOf('async function auditListRecent'));
  assert.ok(forSeg.includes('.limit(100)'), 'listFor giữ trần 100 mục/đối tượng');
  const recentSeg = data.slice(data.indexOf('async function auditListRecent'));
  assert.ok(recentSeg.includes('.limit(200)'), 'listRecent giữ trần 200 mục');
});
