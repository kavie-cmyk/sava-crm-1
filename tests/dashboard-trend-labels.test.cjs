/* Nhãn trục ngang biểu đồ "Xu hướng thêm mới" (Tổng quan) — sửa chồng
   chữ 05/11/2026 (Zac báo kỳ 90 ngày: nhãn tuần "dd-mm–dd-mm" khít
   nhau thành một vệt không đọc được):
   - Helper thuần SavaDash.dashTrendLabelIndices (shared.js): chọn
     bucket hiện nhãn theo mật độ — khe tối thiểu 42 đơn vị viewBox
     cho nhãn ngày/tuần rút gọn "dd-mm", 54 cho tháng "mm-yyyy"
     (viewBox 760); bucket cuối LUÔN có nhãn; dãy chỉ số tăng dần,
     không trùng.
   - Render dashTrendChartHTML (index.html): nhãn tuần rút gọn còn
     ngày bắt đầu bucket "dd-mm" (tooltip cột giữ nhãn khoảng đầy
     đủ), chỉ nhãn được chọn mới vẽ; bất biến KHÔNG CHỒNG: khoảng
     cách giữa 2 nhãn kề nhau > bề rộng ước lượng của nhãn (số ký tự
     × 6) ở mọi kỳ 7/30/90/Tất cả, kể cả khi dữ kiện dồn hết vào
     bucket cuối (nhiều bucket rỗng). Vì SVG co giãn đồng tỉ lệ theo
     viewBox, bất biến trong viewBox => không chồng ở mọi bề rộng
     hiển thị thật (gồm ~390px). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}
const NOW = new Date('2026-11-02T12:00:00+07:00');
const isoDaysAgo = n => { const d = new Date(NOW); d.setDate(d.getDate() - n); return d.toISOString(); };

/* ---------- 1) Helper chọn nhãn ---------- */

const plain = a => JSON.parse(JSON.stringify(a)); /* mảng từ vm context khác realm -> chuẩn hoá trước deepEqual */

test('dashTrendLabelIndices: ít bucket -> hiện mọi bucket; 0 bucket -> []', () => {
  const D = loadShared().window.SavaDash;
  assert.equal(typeof D.dashTrendLabelIndices, 'function', 'helper phải được export qua SavaDash');
  assert.deepEqual(plain(D.dashTrendLabelIndices(0, 'day', 760)), []);
  assert.deepEqual(plain(D.dashTrendLabelIndices(7, 'day', 760)), [0, 1, 2, 3, 4, 5, 6], 'kỳ 7 ngày: đủ khe -> hiện hết');
  const w90 = plain(D.dashTrendLabelIndices(14, 'week', 760));
  assert.equal(w90.length, 14, 'kỳ 90 ngày ~13-14 bucket tuần: nhãn đã rút gọn dd-mm vừa khe 54 -> hiện hết');
  assert.equal(w90[w90.length - 1], 13);
});

test('dashTrendLabelIndices: nhiều bucket -> thưa đều, không vượt trần nhãn, bucket cuối luôn có nhãn, khoảng cách đạt khe tối thiểu', () => {
  const D = loadShared().window.SavaDash;
  const cases = [
    // [count, granularity, trần số nhãn = floor(760 / khe tối thiểu), khe tối thiểu]
    [30, 'day', 18, 42],
    [104, 'week', 18, 42],
    [37, 'month', 14, 54],
    [120, 'month', 14, 54],
  ];
  for (const [n, gran, maxLabels, minSlot] of cases) {
    const idx = plain(D.dashTrendLabelIndices(n, gran, 760));
    assert.ok(idx.length <= maxLabels, `${gran} n=${n}: ${idx.length} nhãn <= trần ${maxLabels}`);
    assert.equal(idx[0], 0, 'bucket đầu có nhãn');
    assert.equal(idx[idx.length - 1], n - 1, `${gran} n=${n}: bucket cuối luôn có nhãn`);
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b), 'chỉ số tăng dần');
    assert.equal(new Set(idx).size, idx.length, 'không trùng chỉ số');
    const gw = 760 / n;
    for (let j = 1; j < idx.length; j++) {
      const dist = (idx[j] - idx[j - 1]) * gw;
      assert.ok(dist >= minSlot - 1e-9, `${gran} n=${n}: khoảng cách nhãn ${j - 1}->${j} = ${dist.toFixed(1)} >= khe tối thiểu ${minSlot}`);
    }
  }
  /* Trường hợp biên: n vừa nhỉnh hơn trần (19 ngày) — bucket cuối thay
     nhãn thưa gần nhất chứ không chen thêm 1 nhãn sát cạnh. */
  const idx19 = plain(D.dashTrendLabelIndices(19, 'day', 760));
  assert.equal(idx19[idx19.length - 1], 18);
  assert.ok(!idx19.includes(17) || idx19[idx19.length - 2] < 17, 'không có cặp nhãn kề sát nhau ở cuối dãy');
});

/* ---------- 2) Render qua dashTrendChartHTML thật ---------- */

function loadChart() {
  const ctx = loadShared();
  const html = read('index.html');
  const start = html.indexOf('function dashTrendChartHTML');
  const end = html.indexOf('\nfunction dashAnalyticsHTML', start);
  assert.ok(start >= 0 && end > start, 'phải trích được dashTrendChartHTML từ index.html');
  vm.runInContext("esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');", ctx);
  vm.runInContext(html.slice(start, end), ctx, { filename: 'dashTrendChartHTML.js' });
  return ctx;
}
/* Nhãn trục = <text> màu #64748b (số trên đầu cột dùng #475569). */
function axisLabels(svgHtml) {
  return [...svgHtml.matchAll(/<text x="([\d.]+)" y="[\d.]+" text-anchor="middle" font-size="9" fill="#64748b">([^<]*)<\/text>/g)]
    .map(m => ({ x: Number(m[1]), label: m[2] }));
}
function assertNoOverlap(labels, ctxMsg) {
  for (let j = 1; j < labels.length; j++) {
    const prev = labels[j - 1], cur = labels[j];
    const estWidth = Math.max(prev.label.length, cur.label.length) * 6; /* ước lượng an toàn như helper */
    assert.ok(cur.x - prev.x > estWidth, `${ctxMsg}: nhãn "${prev.label}" @${prev.x} và "${cur.label}" @${cur.x} chồng nhau (khoảng ${cur.x - prev.x} <= bề rộng ước lượng ${estWidth})`);
  }
}

test('render kỳ 90 (tuần): nhãn trục rút gọn dd-mm = ngày bắt đầu bucket, hiện hết, không chồng; tooltip cột giữ nhãn khoảng đầy đủ', () => {
  const ctx = loadChart(), D = ctx.window.SavaDash;
  const trend = D.dashTrend({ company: [{ createdAt: isoDaysAgo(0) }], lead: [], deal: [] }, 90, NOW);
  assert.equal(trend.granularity, 'week');
  const html = ctx.dashTrendChartHTML(trend);
  const labels = axisLabels(html);
  assert.equal(labels.length, trend.buckets.length, 'kỳ 90: mọi bucket tuần đều có nhãn sau khi rút gọn');
  labels.forEach((l, i) => {
    assert.match(l.label, /^\d{2}-\d{2}$/, 'nhãn tuần rút gọn đúng dạng dd-mm');
    assert.equal(l.label, trend.buckets[i].label.split('–')[0], 'nhãn = ngày bắt đầu đúng bucket ' + i);
  });
  assert.ok(!labels.some(l => l.label.includes('–')), 'nhãn trục không còn dạng khoảng dd-mm–dd-mm');
  assertNoOverlap(labels, 'kỳ 90 tuần');
  assert.ok(html.includes(trend.buckets[trend.buckets.length - 1].label + ' · Công ty mới: 1'), 'tooltip của cột bucket cuối giữ nhãn khoảng đầy đủ + số đúng');
  assert.equal((html.match(/<rect /g) || []).length, trend.buckets.length * 3, 'đủ cột cho mọi bucket (kể cả bucket rỗng)');
});

test('render kỳ 7/30 ngày + Tất cả (tuần dài/tháng): nhãn đúng bucket, bucket cuối luôn có nhãn, không chồng ở mọi kỳ', () => {
  const ctx = loadChart(), D = ctx.window.SavaDash;
  const sets = { company: [{ createdAt: isoDaysAgo(0) }], lead: [{ createdAt: isoDaysAgo(1) }], deal: [] };
  const scenarios = [
    ['kỳ 7 ngày', D.dashTrend(sets, 7, NOW)],
    ['kỳ 30 ngày', D.dashTrend(sets, 30, NOW)],
    ['Tất cả theo tuần (~100 tuần)', D.dashTrend({ company: [{ createdAt: isoDaysAgo(700) }, { createdAt: isoDaysAgo(0) }], lead: [], deal: [] }, null, NOW)],
    ['Tất cả theo tháng (3 năm)', D.dashTrend({ company: [{ createdAt: isoDaysAgo(1095) }, { createdAt: isoDaysAgo(0) }], lead: [], deal: [] }, null, NOW)],
  ];
  for (const [name, trend] of scenarios) {
    const html = ctx.dashTrendChartHTML(trend);
    const labels = axisLabels(html);
    assert.ok(labels.length >= 1, name + ': có nhãn');
    assertNoOverlap(labels, name);
    const lastBucket = trend.buckets[trend.buckets.length - 1];
    const expectLast = trend.granularity === 'week' ? lastBucket.label.split('–')[0] : lastBucket.label;
    assert.equal(labels[labels.length - 1].label, expectLast, name + ': nhãn cuối = bucket cuối (' + expectLast + ')');
    for (const l of labels) {
      const ok = trend.buckets.some(b => (trend.granularity === 'week' ? b.label.split('–')[0] : b.label) === l.label);
      assert.ok(ok, name + ': nhãn "' + l.label + '" phải là (ngày bắt đầu của) một bucket thật');
    }
    assert.equal((html.match(/<rect /g) || []).length, trend.buckets.length * 3, name + ': bucket ẩn nhãn vẫn có đủ cột');
  }
});

test('render dữ kiện thật kiểu dồn bucket cuối (hầu hết bucket rỗng): nhãn vẫn không chồng + số trên đầu cột bucket cuối còn nguyên', () => {
  const ctx = loadChart(), D = ctx.window.SavaDash;
  const trend = D.dashTrend({ company: [{ createdAt: isoDaysAgo(0) }, { createdAt: isoDaysAgo(0) }], lead: [{ createdAt: isoDaysAgo(0) }], deal: [] }, 90, NOW);
  const html = ctx.dashTrendChartHTML(trend);
  assertNoOverlap(axisLabels(html), 'kỳ 90 dữ kiện dồn cuối');
  assert.ok(html.includes('>2</text>') && html.includes('>1</text>'), 'số trên đầu cột (2 công ty / 1 lead ở bucket cuối) giữ nguyên như cũ');
  /* Tĩnh: tầng hiển thị không còn công thức thưa nhãn cũ (trần 12 nhãn
     trên nhãn khoảng 11 ký tự). */
  const src = read('index.html');
  assert.ok(!src.includes('Math.ceil(bs.length / 12)'), 'đã bỏ công thức labelEvery cũ');
  assert.ok(src.includes('dashTrendLabelIndices'), 'render dùng helper chọn nhãn theo mật độ');
});
