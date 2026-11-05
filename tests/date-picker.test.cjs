/* Lịch nhỏ chọn ngày DÙNG CHUNG (Zac yêu cầu 5/11/2026):
   - Một cơ chế SavaDatePicker ở shared.js (nạp ở cả 3 trang), nhận diện
     ô ngày theo ĐÚNG quy ước placeholder "dd-mm-yyyy" của cơ chế blur
     chuẩn hoá dùng chung — gắn bằng delegation ở initDateInputs
     (index) + block đăng ký blur của publishing.js, KHÔNG gắn tay từng ô.
   - Lưới tháng THUẦN: tuần bắt đầu Thứ 2, tiêu đề tiếng Việt, hôm nay /
     ngày đang chọn được đánh dấu.
   - Chọn ngày: điền dd-mm-yyyy + phát input/change (bubbles) để ngữ
     cảnh áp dụng bằng ĐÚNG đường sẵn có (onchange của ô Từ/Đến kỳ Tuỳ
     chỉnh; ô form thì chỉ điền, chờ Lưu). Gõ tay không đổi. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadShared(extra) {
  const ctx = vm.createContext(Object.assign({ console, structuredClone, setTimeout, clearTimeout, Event }, extra || {}));
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}

test('lưới tháng: tuần bắt đầu Thứ 2, 6x7, tiêu đề tiếng Việt, ngày kề mờ', () => {
  const S = loadShared().window.SavaSys;
  const g = S.dpMonthGrid(2026, 10, { today: '2026-11-05', selected: '2026-11-20' });
  assert.equal(g.title, 'Tháng 11 năm 2026');
  assert.deepEqual([...g.weekdays], ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']);
  assert.equal(g.weeks.length, 6);
  assert.ok(g.weeks.every(w => w.length === 7));
  /* 01-11-2026 là Chủ nhật -> lưới bắt đầu Thứ 2 26-10-2026 (tháng kề, mờ) */
  assert.equal(g.weeks[0][0].iso, '2026-10-26');
  assert.equal(g.weeks[0][0].inMonth, false);
  assert.equal(g.weeks[0][6].iso, '2026-11-01');
  assert.equal(g.weeks[0][6].inMonth, true);
  assert.equal(g.weeks[1][0].iso, '2026-11-02', 'Thứ 2 luôn ở cột 0');
  /* Tháng bắt đầu đúng Thứ 2 (06-2026: 01-06 là Thứ 2) -> ô đầu là ngày 1 */
  const g6 = S.dpMonthGrid(2026, 5, { today: '2026-11-05' });
  assert.equal(g6.weeks[0][0].iso, '2026-06-01');
  assert.equal(g6.weeks[0][0].inMonth, true);
  /* Tháng 2 năm không nhuận: có 28, không có 29 */
  const all2 = S.dpMonthGrid(2026, 1, { today: '2026-11-05' }).weeks.flat().filter(c => c.inMonth);
  assert.equal(all2.length, 28);
  assert.equal(all2[all2.length - 1].iso, '2026-02-28');
  /* Tràn tháng/năm được chuẩn hoá: month=12 -> Tháng 1 năm sau */
  assert.equal(S.dpMonthGrid(2026, 12, { today: '2026-11-05' }).title, 'Tháng 1 năm 2027');
});

test('lưới tháng: hôm nay + ngày đang chọn được đánh dấu đúng 1 ô mỗi loại', () => {
  const S = loadShared().window.SavaSys;
  const g = S.dpMonthGrid(2026, 10, { today: '2026-11-05', selected: '2026-11-20' });
  const flat = g.weeks.flat();
  assert.deepEqual([...flat.filter(c => c.isToday).map(c => c.iso)], ['2026-11-05']);
  assert.deepEqual([...flat.filter(c => c.isSelected).map(c => c.iso)], ['2026-11-20']);
  const g2 = S.dpMonthGrid(2026, 10, { today: '2026-11-05' });
  assert.equal(g2.weeks.flat().filter(c => c.isSelected).length, 0, 'không có ngày chọn -> không ô nào selected');
});

test('nhận diện ô ngày: đúng quy ước placeholder dd-mm-yyyy dùng chung', () => {
  const S = loadShared().window.SavaSys;
  assert.equal(S.savaIsDateInputEl({ tagName: 'INPUT', placeholder: 'dd-mm-yyyy' }), true);
  assert.equal(S.savaIsDateInputEl({ tagName: 'INPUT', placeholder: 'VD: 15-11-2026 (dd-mm-yyyy)' }), true, 'placeholder sự kiện chứa dd-mm-yyyy vẫn là ô ngày');
  assert.equal(S.savaIsDateInputEl({ tagName: 'INPUT', placeholder: 'Để trống = cùng ngày bắt đầu (dd-mm-yyyy)' }), true);
  assert.equal(S.savaIsDateInputEl({ tagName: 'INPUT', placeholder: 'Gõ tên để tìm…' }), false);
  assert.equal(S.savaIsDateInputEl({ tagName: 'TEXTAREA', placeholder: 'dd-mm-yyyy' }), false);
  assert.equal(S.savaIsDateInputEl(null), false);
  assert.equal(S.savaIsDateInputEl({ tagName: 'INPUT' }), false);
});

test('chọn ngày: điền dd-mm-yyyy + phát input/change; ngày không có thật bị chặn', () => {
  const S = loadShared().window.SavaSys;
  const seen = [];
  const el = { tagName: 'INPUT', placeholder: 'dd-mm-yyyy', value: '', dispatchEvent(ev) { seen.push(ev.type); return true; } };
  assert.equal(S.dpApplyPickedDate(el, '2026-11-05'), true);
  assert.equal(el.value, '05-11-2026', 'ô nhận dd-mm-yyyy (lưu trữ ISO vẫn do đường lưu sẵn có quyết định)');
  assert.deepEqual(seen, ['input', 'change'], 'phát đúng sự kiện như gõ xong rời ô để onchange của ngữ cảnh (vd setDashCustomRange) chạy');
  const el2 = { tagName: 'INPUT', placeholder: 'dd-mm-yyyy', value: 'giá trị cũ', dispatchEvent() { return true; } };
  assert.equal(S.dpApplyPickedDate(el2, '2026-02-31'), false, 'ngày không tồn tại không được điền');
  assert.equal(el2.value, 'giá trị cũ', 'ô giữ nguyên khi ngày chọn không hợp lệ');
  assert.equal(S.dpApplyPickedDate(el2, ''), false);
  assert.equal(S.dpApplyPickedDate(null, '2026-11-05'), false);
});

/* ---------- DOM giả: delegation mở/đóng/chọn của SavaDatePicker ---------- */
function fakeEl(tag) {
  return { tagName: tag || 'DIV', style: {}, children: [], __ls: {},
    setAttribute() {}, getAttribute() { return null; },
    addEventListener(t, f) { this.__ls[t] = f; },
    appendChild(c) { this.children.push(c); return c; },
    contains() { return false; } };
}
function loadPickerDOM() {
  const docListeners = {};
  const doc = { __ls: docListeners, body: null,
    addEventListener(t, f) { (docListeners[t] = docListeners[t] || []).push(f); },
    createElement(t) { return fakeEl(t.toUpperCase()); } };
  doc.body = fakeEl('BODY');
  const ctx = loadShared({ document: doc, addEventListener() {}, innerWidth: 390, innerHeight: 700 });
  const fire = (type, ev) => (docListeners[type] || []).forEach(f => f(ev));
  const makeInput = value => {
    const el = fakeEl('INPUT');
    el.placeholder = 'dd-mm-yyyy'; el.value = value; el.ownerDocument = doc;
    el.events = [];
    el.getBoundingClientRect = () => ({ left: 300, right: 390, top: 600, bottom: 628, width: 90, height: 28 });
    el.dispatchEvent = ev => { el.events.push(ev.type); if (ev.type === 'change' && el.__onchange) el.__onchange(); return true; };
    return el;
  };
  return { ctx, doc, fire, makeInput, pop: () => doc.body.children[0] };
}

test('DOM: focus vào ô ngày mở lịch đúng tháng của ô; chọn ngày áp qua change; Esc/bấm ngoài đóng; tối đa 1 lịch', () => {
  const h = loadPickerDOM();
  const DP = h.ctx.window.SavaDatePicker;
  assert.ok(DP, 'shared.js phải phơi SavaDatePicker');
  assert.equal(DP.init(h.doc), false, 'init lần 2 trên cùng document bị guard chặn (đăng ký 1 lần)');
  const el = h.makeInput('20-11-2026');
  let applied = 0;
  el.__onchange = () => { applied++; };
  h.fire('focusin', { target: el });
  assert.equal(DP.isOpen(), true, 'focus vào ô ngày -> lịch mở');
  const pop = h.pop();
  assert.ok(pop && pop.className === 'sava-dp', 'popup lịch được tạo 1 lần duy nhất trên body');
  assert.ok(pop.innerHTML.includes('Tháng 11 năm 2026'), 'lịch mở đúng tháng của ngày đang có trong ô');
  assert.ok(pop.innerHTML.includes('data-dp-day="2026-11-20"'), 'có ô ngày 20-11');
  assert.ok(/sava-dp-sel[^"]*" data-dp-day="2026-11-20"|data-dp-day="2026-11-20"[^>]*sava-dp-sel/.test(pop.innerHTML) || pop.innerHTML.includes('sava-dp-sel'), 'ngày đang có trong ô được đánh dấu selected');
  assert.ok(pop.style.left.endsWith('px') && parseFloat(pop.style.left) + 252 <= 390 + 1, 'màn 390px: lịch không tràn ngang (left=' + pop.style.left + ')');
  assert.ok(parseFloat(pop.style.top) < 600, 'ô sát đáy viewport -> lịch lật lên trên ô');
  /* Chọn ngày 15-11 qua click trên popup */
  pop.__ls.click({ target: { closest: sel => sel === '[data-dp-day]' ? { getAttribute: () => '2026-11-15' } : null } });
  assert.equal(el.value, '15-11-2026', 'chọn ngày -> ô điền dd-mm-yyyy');
  assert.deepEqual(el.events, ['input', 'change'], 'chọn ngày phát input+change như đường gõ tay');
  assert.equal(applied, 1, 'onchange của ngữ cảnh (vd setDashCustomRange) chạy đúng 1 lần');
  assert.equal(DP.isOpen(), false, 'chọn xong -> lịch đóng');
  /* Mở lại rồi Esc đóng */
  h.fire('focusin', { target: el });
  assert.equal(DP.isOpen(), true);
  h.fire('keydown', { key: 'Escape' });
  assert.equal(DP.isOpen(), false, 'Esc đóng lịch');
  /* Mở lại rồi bấm ra ngoài (mousedown phần tử khác) đóng */
  h.fire('focusin', { target: el });
  assert.equal(DP.isOpen(), true);
  h.fire('mousedown', { target: fakeEl('BUTTON') });
  assert.equal(DP.isOpen(), false, 'bấm ra ngoài đóng lịch');
  /* Chuyển sang ô ngày khác: vẫn chỉ 1 popup, mở cho ô mới */
  const el2 = h.makeInput('03-01-2027');
  h.fire('focusin', { target: el });
  h.fire('focusin', { target: el2 });
  assert.equal(DP.isOpen(), true);
  assert.equal(h.doc.body.children.length, 1, 'vẫn đúng 1 popup lịch trong body');
  assert.ok(h.pop().innerHTML.includes('Tháng 1 năm 2027'), 'lịch chuyển sang tháng của ô mới');
});

test('tĩnh: gắn tại điểm đăng ký dùng chung + CSS + mọi ô ngày hiện hữu đều khớp quy ước nhận diện', () => {
  const shared = read('shared.js');
  assert.ok(shared.includes('window.SavaDatePicker'), 'shared.js phơi SavaDatePicker');
  assert.ok(shared.includes('__savaDatePickerReady'), 'guard đăng ký 1 lần / document');
  const idx = read('index.html');
  const initBlock = idx.slice(idx.indexOf('function initDateInputs()'), idx.indexOf('function initDateInputs()') + 900);
  assert.ok(initBlock.includes('SavaDatePicker.init(document)'), 'index: lịch gắn ngay trong initDateInputs (điểm đăng ký blur dùng chung)');
  const pub = read('publishing.js');
  const pubBlock = pub.slice(pub.indexOf('pubNormalizeDateInputEl(e.target)'), pub.indexOf('pubNormalizeDateInputEl(e.target)') + 700);
  assert.ok(pubBlock.includes('SavaDatePicker.init(document)'), 'publishing: lịch gắn ngay tại block đăng ký blur dùng chung');
  /* Mọi ô ngày hiện hữu của index đều có placeholder chứa dd-mm-yyyy */
  for (const id of ['dashCustomFrom', 'dashCustomTo', 'c_signed', 'e_due', 'e_lwhen', 'e_tstartDate', 'e_tdueDate', 'ea_when']) {
    const re = new RegExp('id="' + id + '"[^>]*placeholder="[^"]*dd-mm-yyyy');
    assert.ok(re.test(idx), 'ô ' + id + ' (index) phải khớp quy ước placeholder dd-mm-yyyy');
  }
  assert.ok(idx.includes('txt("e_evdate"') && idx.includes('(dd-mm-yyyy)")'), 'ô e_evdate (sự kiện) có placeholder chứa dd-mm-yyyy');
  assert.ok(idx.includes('txt("e_evenddate"') && idx.includes('cùng ngày bắt đầu (dd-mm-yyyy)'), 'ô e_evenddate (sự kiện) có placeholder chứa dd-mm-yyyy');
  /* 3 ô ngày của publishing.js */
  assert.ok(pub.includes('placeholder="dd-mm-yyyy"'), 'publishing: các ô due có placeholder dd-mm-yyyy');
  assert.ok(pub.includes("field('date','Ngày snapshot (dd-mm-yyyy)','','text','required placeholder=\"dd-mm-yyyy\"')"), 'publishing: ô ngày snapshot có placeholder dd-mm-yyyy');
  /* CSS lịch + bump bản CSS ở cả 3 trang */
  const css = read('workspace-design.css');
  assert.ok(css.includes('.sava-dp {') && css.includes('.sava-dp-today') && css.includes('#dbeafe') && css.includes('.sava-dp-sel'), 'workspace-design.css có style lịch + nổi bật hôm nay theo quy ước app');
  for (const f of ['index.html', 'mkt.html', 'publishing.html']) {
    assert.ok(read(f).includes('workspace-design.css?v=20261105.1'), f + ' phải nạp bản CSS mới chứa style lịch');
    assert.ok(read(f).includes('shared.js'), f + ' phải nạp shared.js (nơi chứa SavaDatePicker)');
  }
});
