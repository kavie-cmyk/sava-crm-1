/* FIX-2 (cụm C2 — shared.js + audit.js):
   1) C3+B2: auditValue/diffEntity — chặn rò rỉ intake.expectations khỏi
      audit_log (kể cả create/delete), nhãn enum thay mã thô, tiền qua
      money(), object không dump JSON thô.
   2) B6: money() — VND < 1tr hiện nguyên số, >= 1tr "Xtr ₫" tối đa 2 số
      thập phân; USD tối đa 2 số thập phân.
   3) C7: Lead do migrateState tạo từ contact cũ mang createdAt/updatedAt/
      updatedBy ngay tại thời điểm tạo.
   4) C9: updatedByLabel không fallback bảng USERS legacy cho member đã
      vắng mặt — trả "thành viên đã xoá (…)" đúng format audit.js. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadShared(extra) {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  if (extra) Object.assign(ctx, extra);
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}
const NOW = '2026-10-31T10:00:00.000Z';
const baseState = over => Object.assign({
  members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }],
  companies: [{ id: 'c1', name: 'Công ty Một' }], games: [{ id: 'g1', title: 'Game Một' }],
  deals: [], leads: [], tasks: [], activities: [],
}, over || {});

/* ---------- 1a) C3: expectations không lọt vào audit bằng bất kỳ đường nào ---------- */

test('C3 create: request có intake.expectations -> toàn bộ changes không chứa giá trị lẫn tên expectations', () => {
  const ctx = loadShared(), S = ctx.window.SavaSys;
  const st = baseState();
  const req = { id: 'R1', kind: 'game', entityId: 'g1', status: 'Chờ đánh giá', intake: { genre: 'Puzzle', platforms: ['Android', 'iOS'], expectations: 'SECRET-EXPECT-XYZ' } };
  const entries = S.stampCollection(st, [req], new Map(), 'request', 'zac', NOW);
  assert.equal(entries.length, 1); assert.equal(entries[0].action, 'create');
  const blob = JSON.stringify(entries);
  assert.ok(!blob.includes('SECRET-EXPECT-XYZ'), 'giá trị expectations TUYỆT ĐỐI không được xuất hiện trong audit');
  assert.ok(!blob.includes('expectations'), 'tên sub-key expectations cũng không được ghi vào audit');
  const genre = entries[0].changes.find(c => c.field === 'intake.genre');
  assert.ok(genre, 'sub-key intake còn lại phải thành mục riêng');
  assert.equal(genre.to, 'Puzzle');
  assert.ok(genre.label.includes('Genre'), 'nhãn sub-key phải dễ đọc: ' + genre.label);
  const plats = entries[0].changes.find(c => c.field === 'intake.platforms');
  assert.equal(plats.to, 'Android, iOS', 'mảng nguyên thuỷ nối ", " thay vì JSON');
});

test('C3 update: chỉ expectations đổi -> không sinh thay đổi nào; đổi kèm sub-key khác -> chỉ ghi sub-key đó', () => {
  const ctx = loadShared(), S = ctx.window.SavaSys;
  const st = baseState();
  const before = { id: 'R1', kind: 'game', status: 'Chờ đánh giá', intake: { genre: 'Puzzle', expectations: 'OLD-SECRET' } };
  const onlyExp = { id: 'R1', kind: 'game', status: 'Chờ đánh giá', intake: { genre: 'Puzzle', expectations: 'NEW-SECRET' } };
  assert.equal(S.diffEntity(st, 'request', before, onlyExp).length, 0, 'chỉ expectations đổi thì diff phải rỗng');
  const mixed = { id: 'R1', kind: 'game', status: 'Chờ đánh giá', intake: { genre: 'RPG', expectations: 'NEW-SECRET' } };
  const changes = S.diffEntity(st, 'request', before, mixed);
  assert.deepEqual([...changes.map(c => c.field)], ['intake.genre']);
  const blob = JSON.stringify(changes);
  assert.ok(!blob.includes('NEW-SECRET') && !blob.includes('OLD-SECRET') && !blob.includes('expectations'));
});

test('C3 delete + auditValue trực tiếp: đường xoá và gọi thẳng auditValue(intake) cũng không rò expectations', () => {
  const ctx = loadShared(), S = ctx.window.SavaSys;
  const st = baseState();
  const before = { id: 'R1', kind: 'game', intake: { genre: 'Puzzle', expectations: 'DEL-SECRET' } };
  const del = S.diffEntity(st, 'request', before, {});
  assert.ok(!JSON.stringify(del).includes('DEL-SECRET') && !JSON.stringify(del).includes('expectations'));
  const direct = S.auditValue(st, 'request', before, 'intake', { genre: 'Puzzle', expectations: 'DIRECT-SECRET' });
  assert.ok(direct.includes('Puzzle') && !direct.includes('DIRECT-SECRET') && !direct.includes('expectations'), 'auditValue(intake) = ' + direct);
  assert.equal(S.auditValue(st, 'request', before, 'expectations', 'TOP-SECRET'), '');
});

/* ---------- 1b) B2: nhãn enum thay mã thô ---------- */

test('B2: stage deal qua nhãn theo mảng, lead status/game own/request status/boolean qua nhãn app', () => {
  const ctx = loadShared(), S = ctx.window.SavaSys;
  const st = baseState();
  const dCh = S.diffEntity(st, 'deal', { id: 'd1', line: 'publishing', stage: 'sourcing' }, { id: 'd1', line: 'publishing', stage: 'term' });
  assert.equal(dCh.length, 1);
  assert.equal(dCh[0].from, 'Tìm kiếm / Tiếp nhận');
  assert.equal(dCh[0].to, 'Term sheet / Đàm phán');
  const lCh = S.diffEntity(st, 'lead', { id: 'l1', status: 'new' }, { id: 'l1', status: 'qualified' });
  assert.equal(lCh[0].from, 'Mới'); assert.equal(lCh[0].to, 'Đạt chuẩn');
  const lOdd = S.diffEntity(st, 'lead', { id: 'l1', status: 'new' }, { id: 'l1', status: 'trang-thai-la' });
  assert.equal(lOdd[0].to, 'trang-thai-la', 'status lạ giữ nguyên giá trị');
  const gCh = S.diffEntity(st, 'game', { id: 'g1', own: 'partner' }, { id: 'g1', own: 'ours' });
  assert.equal(gCh[0].from, 'Game đối tác'); assert.equal(gCh[0].to, 'Game của Sava');
  const rCh = S.diffEntity(st, 'request', { id: 'R1', status: 'Chờ đánh giá' }, { id: 'R1', status: 'Hoàn tất' });
  assert.equal(rCh[0].from, 'Chờ đánh giá'); assert.equal(rCh[0].to, 'Hoàn tất');
  const tCh = S.diffEntity(st, 'task', { id: 't1', done: false }, { id: 't1', done: true });
  assert.equal(tCh[0].from, 'Không'); assert.equal(tCh[0].to, 'Có');
  /* trường tham chiếu giữ cơ chế resolve tên sẵn có */
  const oCh = S.diffEntity(st, 'deal', { id: 'd1', owner: 'linh' }, { id: 'd1', owner: 'zac' });
  assert.ok(oCh[0].to.includes('Zac'), 'owner vẫn resolve tên member: ' + oCh[0].to);
});

/* ---------- 1c) tiền trong audit qua money() ---------- */

test('B2 tiền: amount trong audit hiển thị qua money() theo cur của deal', () => {
  const ctx = loadShared(), S = ctx.window.SavaSys;
  const st = baseState();
  const ch = S.diffEntity(st, 'deal', { id: 'd1', line: 'ai', amount: 400000, cur: 'VND' }, { id: 'd1', line: 'ai', amount: 1400000, cur: 'VND' });
  assert.equal(ch.length, 1);
  assert.equal(ch[0].from, '400.000 ₫');
  assert.equal(ch[0].to, '1,4tr ₫');
  const usd = S.diffEntity(st, 'deal', { id: 'd1', line: 'ai', amount: 100, cur: 'USD' }, { id: 'd1', line: 'ai', amount: 1234.567, cur: 'USD' });
  assert.equal(usd[0].to, '$1,234.57');
});

/* ---------- 1d) object không dump JSON ---------- */

test('B2 object: term/custom/roles tóm tắt dễ đọc, không còn chuỗi JSON thô trong changes', () => {
  const ctx = loadShared(), S = ctx.window.SavaSys;
  const st = baseState();
  const tCh = S.diffEntity(st, 'deal', { id: 'd1', term: { rev_share: '50/50' } }, { id: 'd1', term: { rev_share: '70/30 cho Sava' } });
  assert.equal(tCh.length, 1);
  assert.ok(tCh[0].to.includes('70/30 cho Sava'), 'term phải hiện giá trị rev_share dạng text: ' + tCh[0].to);
  assert.ok(!tCh[0].to.includes('{') && !tCh[0].from.includes('{'), 'không được còn JSON thô');
  const longCustom = {}; for (let i = 0; i < 5; i++) longCustom['k' + i] = 'gia-tri-rat-dai-'.repeat(4) + i;
  const cCh = S.diffEntity(st, 'deal', { id: 'd1', custom: {} }, { id: 'd1', custom: longCustom });
  assert.equal(cCh[0].to, 'Đã cập nhật (5 mục)');
  const rCh = S.diffEntity(st, 'company', { id: 'c1', roles: {} }, { id: 'c1', roles: { publishing: 'Publisher' } });
  assert.ok(rCh[0].to.includes('Publisher') && !rCh[0].to.includes('{'));
  /* create dump toàn bộ 1 deal có term + custom + địa chỉ lồng nhau: soát mọi from/to */
  const created = S.diffEntity(st, 'deal', {}, { id: 'd9', line: 'ai', title: 'X', term: { rev_share: '60/40' }, custom: { use_case: 'Chatbot' }, contract: { url: 'https://example.com/hd' } });
  created.forEach(c => { assert.ok(!/^\s*[[{]/.test(c.to) && !c.to.includes('{"'), 'change ' + c.field + ' còn JSON thô: ' + c.to); });
});

/* ---------- 2) B6: money() ---------- */

test('B6 money: VND < 1tr hiện nguyên số; >= 1tr dạng Xtr tối đa 2 thập phân; USD tối đa 2 thập phân', () => {
  const ctx = loadShared(), money = ctx.money;
  assert.equal(typeof money, 'function');
  assert.equal(money(400000, 'VND'), '400.000 ₫');
  assert.equal(money(0, 'VND'), '0 ₫');
  assert.equal(money(999999, 'VND'), '999.999 ₫');
  assert.equal(money(1000000, 'VND'), '1tr ₫');
  assert.equal(money(1400000, 'VND'), '1,4tr ₫');
  assert.equal(money(1250000, 'VND'), '1,25tr ₫');
  assert.equal(money(2500000), '2,5tr ₫', 'thiếu cur -> VND như trước');
  assert.equal(money(1234567, 'USD'), '$1,234,567');
  assert.equal(money(1234.567, 'USD'), '$1,234.57');
  assert.equal(money(1234.5, 'USD'), '$1,234.5');
  assert.equal(money(null, 'VND'), '—');
  assert.equal(money(NaN, 'USD'), '—');
});

/* ---------- 3) C7: migrateState đóng dấu Lead tạo từ contact cũ ---------- */

function contactState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [{ id: 'c1', name: 'Studio Một', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: 'Chị Liên Hệ', phone: '0901234567', last: '' }],
    games: [], deals: [], leads: [], tasks: [], activities: [],
  };
}

test('C7: lead migrate có createdAt/updatedAt ngay khi tạo; updatedBy rỗng khi không xác định được member', () => {
  const ctx = loadShared();
  const out = ctx.migrateState(contactState());
  assert.equal(out.leads.length, 1);
  const lead = out.leads[0];
  assert.ok(lead.createdAt && !Number.isNaN(Date.parse(lead.createdAt)), 'lead migrate phải có createdAt hợp lệ');
  assert.equal(lead.updatedAt, lead.createdAt, 'updatedAt = thời điểm migration');
  assert.ok('updatedBy' in lead && lead.updatedBy === '', 'không xác định được member -> updatedBy để trống, không bịa');
  const again = ctx.migrateState(JSON.parse(JSON.stringify(out)));
  assert.equal(again.leads.length, 1, 'chạy lại không tạo thêm lead');
  assert.equal(again.leads[0].createdAt, lead.createdAt, 'createdAt bất biến qua lần migrate sau');
});

test('C7: khi SavaAuth xác định được member đang đăng nhập thì updatedBy mang member đó', () => {
  const ctx = loadShared({ SavaAuth: { currentUser: () => ({ memberId: 'zac' }) } });
  const out = ctx.migrateState(contactState());
  assert.equal(out.leads.length, 1);
  assert.equal(out.leads[0].updatedBy, 'zac');
  assert.ok(out.leads[0].createdAt && out.leads[0].updatedAt);
});

/* ---------- 4) C9: updatedByLabel không hồi sinh member đã xoá ---------- */

test('C9: id vắng mặt trong members -> "thành viên đã xoá (…)", không dùng bảng USERS legacy; khớp audit.js', () => {
  const ctx = loadShared(), S = ctx.window.SavaSys;
  const st = { members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }] };
  assert.equal(S.updatedByLabel(st, { updatedBy: 'zac' }), 'Zac', 'member hiện tại vẫn resolve tên');
  /* 'linh' có trong USERS legacy ("Linh (BD)") nhưng KHÔNG còn trong members */
  assert.equal(S.updatedByLabel(st, { updatedBy: 'linh' }), 'thành viên đã xoá (linh)');
  assert.equal(S.updatedByLabel(st, { updatedBy: 'member-da-xoa-123' }), 'thành viên đã xoá (member-d)');
  assert.equal(S.updatedByLabel(st, {}), '—');
  assert.equal(S.updatedByLabel(st, null), '—');
  const UI = require('../audit.js');
  assert.equal(UI.byLabel(st, 'linh'), S.updatedByLabel(st, { updatedBy: 'linh' }), 'nhãn phải khớp audit.js');
});
