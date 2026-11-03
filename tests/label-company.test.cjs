/* Việc 5 — Đổi nhãn entity Company: "Khách hàng" -> "Công ty" trên giao diện.
   Lý do (Zac): mục đó chính là entity Company, chữ "Khách hàng" gây khó hiểu.
   Test TĨNH theo mẫu sẵn có của repo (đọc file nguồn + assert chuỗi):
   - Mục điều hướng data-view="companies" (sidebar desktop + mobile-nav) và
     tiêu đề view companies trong index.html phải là "Công ty".
   - Grep-check toàn bộ file giao diện ở thư mục gốc (html/js/css của app BD,
     MKT, Publishing nội bộ): KHÔNG còn chuỗi "khách hàng" (không phân biệt
     hoa/thường) chỉ entity Company, NGOÀI danh sách ngoại lệ dưới đây.
   NGOẠI LỆ GIỮ NGUYÊN (không phải nhãn entity, đổi là sai nghiệp vụ):
   - index.html ROLE_OPTS_BY_LINE: giá trị VAI TRÒ đã lưu trong
     company.roles theo mảng — ở mảng AI/Metaverse, công ty đóng vai
     "Khách hàng" (bên mua giải pháp của Sava), song song Publisher /
     Game studio / Indie dev ở các mảng khác. Đây là GIÁ TRỊ NGHIỆP VỤ
     đã lưu trong dữ liệu thật; đổi chuỗi sẽ mồ côi dữ liệu cũ và sai nghĩa.
   Không quét: tests/visual/*.html (bản chụp sinh tự động bằng
   tools/build-ui-preview.py — nhận nhãn mới ở lần sinh lại tiếp theo),
   fixture trong tests/*.cjs (dữ liệu vai trò mẫu, cùng lý do ngoại lệ trên),
   README/docs (không phải chuỗi giao diện). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('tĩnh: điều hướng + tiêu đề view companies trong index.html dùng nhãn "Công ty"', () => {
  const idx = read('index.html');
  assert.ok(idx.includes('<button data-view="companies" class=""><i data-icon="company"></i><span>Công ty</span></button>'),
    'sidebar desktop: nút companies phải hiện "Công ty"');
  assert.ok(idx.includes('<button data-view="companies" class="" aria-label="Công ty"><i data-icon="company"></i><span>Công ty</span></button>'),
    'mobile-nav: nút companies (aria-label + nhãn) phải là "Công ty"');
  assert.ok(idx.includes('companies:"Công ty & đối tác"'), 'tiêu đề view companies phải là "Công ty & đối tác"');
  assert.ok(!idx.includes('<span>Khách hàng</span>'), 'không còn nhãn điều hướng "Khách hàng"');
  assert.ok(!idx.includes('aria-label="Khách hàng"'), 'không còn aria-label "Khách hàng"');
  assert.ok(!idx.includes('companies:"Khách hàng'), 'tiêu đề view không còn bắt đầu bằng "Khách hàng"');
});

test('tĩnh: không còn "khách hàng" trong file giao diện ngoài ngoại lệ ROLE_OPTS_BY_LINE', () => {
  const appFiles = fs.readdirSync(ROOT).filter(f => /\.(html|js|css)$/.test(f));
  assert.ok(appFiles.length >= 15, 'phải quét được bề mặt app ở thư mục gốc, thấy ' + appFiles.length + ' file');
  const offenders = [];
  for (const f of appFiles) {
    read(f).split('\n').forEach((line, i) => {
      if (!/khách hàng/i.test(line)) return;
      if (f === 'index.html' && line.includes('ROLE_OPTS_BY_LINE')) return; /* ngoại lệ: giá trị vai trò đã lưu, xem đầu file */
      offenders.push(f + ':' + (i + 1));
    });
  }
  assert.deepEqual(offenders, [], 'còn chuỗi "khách hàng" chưa phân loại ở: ' + offenders.join(', '));
});

test('tĩnh: ngoại lệ ROLE_OPTS_BY_LINE vẫn giữ nguyên giá trị vai trò đã lưu (không đổi nghiệp vụ)', () => {
  const idx = read('index.html');
  assert.ok(idx.includes('ai: ["Khách hàng"], metaverse: ["Khách hàng"]'),
    'ROLE_OPTS_BY_LINE phải giữ giá trị vai trò "Khách hàng" cho mảng AI/Metaverse (dữ liệu đã lưu)');
});
