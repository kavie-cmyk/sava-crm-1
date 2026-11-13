const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

/* Hồi quy đợt sửa cột bị ngược trục đáy (09/11/2026, sau f0dd522):
   Chart A đo bằng Chromium headless với nhãn stage thật ở bề rộng panel
   thật: cột neo đúng đáy TRONG track của mình, nhưng nhãn stage cao
   25–48.56px tuỳ độ dài (min-height:25px, không cố định) đẩy đáy mỗi
   track lệch nhau tới 23.57px — các track cùng đỉnh, đáy tản mát, nên
   biểu đồ không có trục đáy chung và trông như cột treo từ miệng trên
   xuống. Sửa: cố định chiều cao nhãn (49px, ≤600px: 54px) và tăng
   .ex-stages đúng phần nhãn cao thêm để vùng vẽ không đổi. Chart B đo
   lại cùng harness: đáy plot đã trùng nhau (nhãn cố định 26px từ đợt
   trước) — không bệnh, không sửa.
   Layout thật được kiểm bằng harness Chromium headless ngoài suite
   (jsdom không có layout); các test ở đây khóa nguồn để không tái phạm. */

/* Hồi quy đợt sửa tỉ lệ cột biểu đồ pipeline Dashboard (09/11/2026):
   - Chart A (.ex-stage, "Pipeline: <mảng>"): JS vốn đã đúng công thức
     count/max-trong-chính-biểu-đồ, nhưng CSS trừ 24px HAI lần
     (padding-top:24px ở .ex-stage-track + max-height:calc(100% - 24px)
     ở cột) khiến cột max chỉ đạt ~64% khung và méo tỉ lệ giữa các cột.
   - Chart B (.dash-col, "Tiến trình Deal theo mảng"): % chiều cao từng
     tính trên toàn chiều cao cột (gồm vùng số + nhãn) và cột max bị
     flex-shrink nén -> méo tỉ lệ; đã bọc cột trong .dash-col-plot có
     padding-top chừa vùng số để % tính trên đúng vùng vẽ.
   Layout thật được kiểm bằng harness Chromium headless ngoài suite
   (jsdom không có layout); các test ở đây khóa nguồn để không tái phạm. */

test('tĩnh chart A: cột .ex-stage-track > b không còn max-height trừ 24px lần hai', () => {
  const css = read('dashboard-design.css');
  const m = css.match(/\.ex-stage-track > b \{([^}]*)\}/);
  assert.ok(m, 'phải có rule .ex-stage-track > b');
  assert.ok(!/max-height\s*:/.test(m[1]), 'không được còn max-height nào ở cột (padding-top của track đã chừa vùng số)');
  assert.ok(!css.includes('max-height: calc(100% - 24px)'), 'không còn công thức trừ 24px hai lần ở bất cứ đâu');
});

test('tĩnh chart A: công thức chiều cao = count / max trong chính biểu đồ', () => {
  const src = read('index.html');
  assert.ok(src.includes('const max = Math.max(1, ...stages.map(st => st.count));'), 'max lấy trong chính biểu đồ (mẫu tối thiểu 1 để tránh chia 0)');
  assert.ok(src.includes('height:${st.count / max * 100}%'), 'chiều cao cột = count/max*100%');
});

test('tĩnh chart A: nhãn stage xuống dòng giữa các từ, không xẻ giữa chữ', () => {
  const css = read('dashboard-design.css');
  const m = css.match(/\.ex-stage > span:last-child \{([^}]*)\}/);
  assert.ok(m, 'phải có rule nhãn .ex-stage > span:last-child');
  assert.ok(/overflow-wrap:\s*break-word/.test(m[1]), 'nhãn dùng break-word (xuống dòng giữa các từ)');
  assert.ok(!/overflow-wrap:\s*anywhere/.test(m[1]), 'không dùng anywhere (xẻ giữa chữ, vd Prototyp·e)');
});

test('tĩnh chart A: nhãn stage chiều cao CỐ ĐỊNH để mọi đáy track (và đáy cột) trùng nhau', () => {
  const css = read('dashboard-design.css');
  const m = css.match(/\.ex-stage > span:last-child \{([^}]*)\}/);
  assert.ok(m, 'phải có rule nhãn .ex-stage > span:last-child');
  assert.ok(/height:\s*65px/.test(m[1]), 'nhãn cố định 65px (4 dòng x 16.2px ở sàn chữ 12px, GĐ2 redesign 13/11/2026) — min-height làm đáy track lệch theo độ dài nhãn');
  assert.ok(!/min-height\s*:/.test(m[1]), 'không được quay lại min-height cho nhãn (đáy cột hết trục chung)');
  assert.ok(/overflow:\s*hidden/.test(m[1]), 'nhãn dài hơn 4 dòng bị cắt gọn như .dash-col-lb của chart B');
  const stages = css.match(/\.ex-stages \{([^}]*)\}/);
  assert.ok(stages && /height:\s*204px/.test(stages[1]), '.ex-stages 204px = 188 cũ + 16 bù nhãn 49->65px (sàn chữ 12px, GĐ2), vùng vẽ giữ nguyên');
  const track = css.match(/\.ex-stage-track \{([^}]*)\}/);
  assert.ok(track && /align-items:\s*end/.test(track[1]), 'cột vẫn neo đáy trong track (align-items:end)');
});

test('tĩnh chart B: cột nằm trong vùng vẽ .dash-col-plot, số tuyệt đối trong vùng chừa padding-top', () => {
  const src = read('index.html');
  assert.ok(src.includes('<div class="dash-col-plot"><div class="dash-col-num">'), 'markup dash-col bọc số + cột trong .dash-col-plot');
  const css = read('workspace-design.css');
  const plot = css.match(/\.dash-col-plot \{([^}]*)\}/);
  assert.ok(plot, 'phải có rule .dash-col-plot');
  assert.ok(/flex:\s*1 1 auto/.test(plot[1]) && /padding-top:\s*21px/.test(plot[1]), 'vùng vẽ flex:1 + padding-top chừa vùng số');
  const num = css.match(/\.dash-col-num \{([^}]*)\}/);
  assert.ok(num && /position:\s*absolute/.test(num[1]), 'số đặt tuyệt đối trong vùng chừa, không chiếm vùng vẽ');
  const lb = css.match(/\.dash-col-lb \{([^}]*)\}/);
  assert.ok(lb && /height:\s*34px/.test(lb[1]), 'nhãn cố định chiều cao để vùng vẽ mọi cột bằng nhau (34px = 2 dòng ở sàn chữ 12px, GĐ2 redesign 13/11/2026; trước 26px ở 9.5px)');
});
