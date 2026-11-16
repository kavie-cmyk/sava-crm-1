/* Vá ca biên (16/11/2026) — PARITY kiểm ngày giữa hai hàm quá hạn:
   - Bệnh cũ: dashIsOverdueFallback (shared.js) chỉ kiểm dueDate bằng regex
     YYYY-MM-DD, KHÔNG kiểm ngày lịch có thật, nên dueDate '2020-02-30'
     (ngày không tồn tại) cho kết quả LỆCH với isOverdue (index.html) —
     hàm chính dùng isValidDateStr kiểm ngày thật.
   - Cách vá: shared.js chép đúng logic isValidDateStr thành
     dashIsValidDateStr (helper gốc nằm ở index.html, shared.js không truy
     cập được) và dashIsOverdueFallback dùng helper đó. Các ngữ nghĩa còn
     lại của từng hàm giữ nguyên.
   - Luật D2 đã chốt: không có dueDate hợp lệ -> KHÔNG quá hạn; cờ lưu sẵn
     t.overdue không phải căn cứ; đã xong -> không quá hạn.
   Test này nạp THÂN HÀM THẬT: isOverdue/isValidDateStr/todayStr cắt từ
   index.html, dashIsOverdueFallback từ shared.js nạp nguyên file. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const shared = read('shared.js');

/* Ngày ISO (giờ local, cùng định dạng todayStr của app) lệch n ngày so với
   hôm nay thật — cả hai hàm đều tính theo "hôm nay" thật nên fixture neo
   vào hôm nay thật, không ghim ngày cứng. */
function isoOffset(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
/* "now" cho bản fallback: trưa hôm nay thật (giờ local) để chuỗi hôm nay
   mà fallback tự dựng khớp todayStr() của app trong cùng ngày lịch. */
function nowNoon() { const n = new Date(); n.setHours(12, 0, 0, 0); return n; }

function loadMain() {
  const start = html.indexOf('function todayStr()');
  const end = html.indexOf('/* ===== Số ngày deal chưa cập nhật', start);
  assert.ok(start !== -1 && end !== -1 && end > start, 'phải cắt được khối todayStr/isValidDateStr/isOverdue từ index.html');
  const ctx = vm.createContext({ console });
  vm.runInContext(html.slice(start, end), ctx, { filename: 'index-overdue-extract.js' });
  assert.equal(typeof ctx.isOverdue, 'function', 'index.html phải còn isOverdue');
  assert.equal(typeof ctx.isValidDateStr, 'function', 'index.html phải còn isValidDateStr');
  return ctx;
}
function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(shared, ctx, { filename: 'shared.js' });
  return ctx.window.SavaDash;
}

/* Ma trận đầu vào ngày: [dueDate, kỳ vọng khi chưa xong (bất kể cờ)].
   Kỳ vọng suy từ isValidDateStr + so với hôm nay thật. */
function dateCases() {
  return [
    [isoOffset(-2), true, 'ngày hợp lệ, quá khứ'],
    [isoOffset(-1), true, 'ngày hợp lệ, hôm qua'],
    [isoOffset(0), false, 'ngày hợp lệ, hôm nay'],
    [isoOffset(3), false, 'ngày hợp lệ, tương lai'],
    ['2020-02-29', true, 'ngày hợp lệ, năm nhuận 29/02 (quá khứ)'],
    ['2020-02-30', false, 'ngày KHÔNG tồn tại: 30/02'],
    ['2021-02-29', false, 'ngày KHÔNG tồn tại: 29/02 năm không nhuận'],
    ['2020-04-31', false, 'ngày KHÔNG tồn tại: 31/04'],
    ['2020-13-01', false, 'tháng 13 không tồn tại'],
    ['2020-00-10', false, 'tháng 00 không tồn tại'],
    ['2020-01-00', false, 'ngày 00 không tồn tại'],
    ['', false, 'rỗng'],
    [undefined, false, 'vắng dueDate'],
    [null, false, 'dueDate null'],
    ['tuần sau', false, 'chữ tự do'],
    ['30-10-2026', false, 'sai định dạng dd-mm-yyyy'],
    ['2020/02/28', false, 'sai định dạng (gạch chéo)'],
    [' 2020-01-01 ', false, 'dư khoảng trắng hai đầu'],
    [20200101, false, 'dueDate dạng số, không phải chuỗi'],
  ];
}

test('parity: ma trận ngày x cờ overdue x done — isOverdue và dashIsOverdueFallback khớp nhau trên mọi ca', () => {
  const main = loadMain();
  const D = loadShared();
  const now = nowNoon();
  let cases = 0;
  for (const [dueDate, expectedOpen, label] of dateCases()) {
    for (const overdue of [true, false]) {
      for (const done of [false, true]) {
        const t = { dueDate, overdue, done };
        const expected = done ? false : expectedOpen;
        const a = main.isOverdue(t);
        const b = D.dashIsOverdueFallback(t, now);
        assert.equal(a, expected, `isOverdue sai ca ${label} (dueDate=${String(dueDate)}, overdue=${overdue}, done=${done})`);
        assert.equal(b, expected, `dashIsOverdueFallback sai ca ${label} (dueDate=${String(dueDate)}, overdue=${overdue}, done=${done})`);
        assert.equal(a, b, `hai hàm LỆCH nhau ở ca ${label} (dueDate=${String(dueDate)}, overdue=${overdue}, done=${done})`);
        cases++;
      }
    }
  }
  /* Việc null / vắng hẳn cũng phải khớp (cả hai đều false). */
  for (const t of [null, undefined, {}]) {
    assert.equal(main.isOverdue(t), false);
    assert.equal(D.dashIsOverdueFallback(t, now), false);
    cases++;
  }
  assert.equal(cases, dateCases().length * 4 + 3, 'ma trận phải chạy đủ số ca đã khai');
});

test('parity: ca đích danh 2020-02-30 -> KHÔNG quá hạn ở cả hai hàm (mọi biến thể cờ/done)', () => {
  const main = loadMain();
  const D = loadShared();
  const now = nowNoon();
  for (const overdue of [true, false]) {
    for (const done of [false, true]) {
      const t = { dueDate: '2020-02-30', overdue, done };
      assert.equal(main.isOverdue(t), false, `isOverdue('2020-02-30', overdue=${overdue}, done=${done}) phải false`);
      assert.equal(D.dashIsOverdueFallback(t, now), false, `dashIsOverdueFallback('2020-02-30', overdue=${overdue}, done=${done}) phải false`);
    }
  }
});

test('parity: ngày không tồn tại 2021-02-29 và 2020-04-31 -> KHÔNG quá hạn ở cả hai hàm', () => {
  const main = loadMain();
  const D = loadShared();
  const now = nowNoon();
  for (const dueDate of ['2021-02-29', '2020-04-31']) {
    const t = { dueDate, overdue: true, done: false };
    assert.equal(main.isValidDateStr(dueDate), false, `isValidDateStr('${dueDate}') phải false`);
    assert.equal(main.isOverdue(t), false);
    assert.equal(D.dashIsOverdueFallback(t, now), false);
  }
  /* Đối chứng: ngày nhuận có thật 2020-02-29 ở quá khứ -> quá hạn ở cả hai. */
  const leap = { dueDate: '2020-02-29', overdue: false, done: false };
  assert.equal(main.isValidDateStr('2020-02-29'), true);
  assert.equal(main.isOverdue(leap), true);
  assert.equal(D.dashIsOverdueFallback(leap, now), true);
});

test('tĩnh: dashIsOverdueFallback kiểm ngày lịch có thật (không còn regex đơn thuần)', () => {
  const fbStart = shared.indexOf('function dashIsOverdueFallback');
  assert.ok(fbStart !== -1, 'shared.js phải còn dashIsOverdueFallback');
  const fb = shared.slice(fbStart, fbStart + 400);
  assert.ok(fb.includes('dashIsValidDateStr(t.dueDate)'), 'thân fallback phải kiểm ngày qua dashIsValidDateStr, nhận được: ' + fb);
  assert.ok(!fb.includes('.overdue'), 'thân fallback không được đọc cờ lưu sẵn, nhận được: ' + fb);
  const hvStart = shared.indexOf('function dashIsValidDateStr');
  assert.ok(hvStart !== -1, 'shared.js phải có dashIsValidDateStr chép đúng logic isValidDateStr');
  const hv = shared.slice(hvStart, hvStart + 400);
  assert.ok(hv.includes('new Date(y, m - 1, d)'), 'helper phải dựng Date từ thành phần ngày như isValidDateStr');
  assert.ok(hv.includes('dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d'),
    'helper phải đối chiếu ngược thành phần ngày (bắt ngày không tồn tại) như isValidDateStr');
});

test('tĩnh: comment schema.sql khớp hành vi hiện tại và DDL cột overdue_stored giữ nguyên', () => {
  const schema = read('supabase/schema.sql');
  assert.ok(!schema.includes('còn lại mới dùng cờ'), 'comment cũ "còn lại mới dùng cờ" phải bị gỡ');
  assert.ok(schema.includes('KHÔNG còn là căn cứ'), 'comment mới phải nói overdue_stored không còn là căn cứ tính quá hạn');
  assert.ok(schema.includes('field lưu trữ/round-trip'), 'comment mới phải nói overdue_stored chỉ là field lưu trữ/round-trip');
  assert.ok(schema.includes('overdue_stored boolean not null default false'), 'DDL cột overdue_stored phải giữ nguyên');
});
