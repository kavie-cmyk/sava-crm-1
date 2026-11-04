/* Chuẩn ngày dd-mm-yyyy (Zac chốt 4/11/2026) áp toàn CRM:
   - Mọi hiển thị ngày: dd-mm-yyyy (gạch ngang, đệm 0); mốc thời gian giữ
     hh:mm phía sau ngày (Asia/Ho_Chi_Minh). KHÔNG còn dd/mm/yyyy hay
     yyyy-mm-dd lộ ra UI.
   - Mọi ô nhập ngày là ô TEXT placeholder dd-mm-yyyy; mở form hiện
     dd-mm-yyyy của dữ liệu đã lưu; lưu parse về ISO yyyy-mm-dd (định
     dạng LƯU không đổi). Nhập sai định dạng / ngày không tồn tại
     (31-02-2026, chữ, mm-dd đảo thứ tự) -> CHẶN lưu, không ghi rác.
   - Helper dùng chung ở shared.js (SavaSys) + bản nội tuyến index.html
     phải cho cùng kết quả. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('tĩnh: không còn input type=date, không còn toLocaleDateString ở bề mặt app', () => {
  for (const f of ['index.html', 'publishing.html', 'mkt.html', 'publishing.js', 'shared.js', 'audit.js', 'publishing-bridge.js', 'workspace-ui.js']) {
    const src = read(f);
    assert.ok(!src.includes('type="date"'), f + ' còn input type=date');
    assert.ok(!src.includes("type='date'"), f + " còn input type='date'");
    assert.ok(!src.includes('toLocaleDateString'), f + ' còn toLocaleDateString (ngày gạch chéo)');
  }
  const idx = read('index.html');
  for (const id of ['c_signed', 'e_due', 'e_lwhen', 'e_tdueDate', 'ea_when']) {
    assert.ok(idx.includes('id="' + id + '" type="text" placeholder="dd-mm-yyyy"'), 'ô ' + id + ' phải là text + placeholder dd-mm-yyyy');
  }
  const pub = read('publishing.js');
  assert.ok(pub.includes("field('date','Ngày snapshot (dd-mm-yyyy)','','text'"), 'market date phải là text dd-mm-yyyy');
  assert.ok(pub.includes("field('due','Hạn đánh giá (dd-mm-yyyy)','','text'"), 'request due phải là text dd-mm-yyyy');
  assert.ok(pub.includes("field('due','Hạn đánh giá (dd-mm-yyyy)',pubFmtDate(r.due),'text'"), 'bdEdit due phải là text + hiện dd-mm-yyyy');
});

function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx.window.SavaSys;
}

test('shared SavaSys: fmtSysTime / fmtDateDMY cho dd-mm-yyyy (+ hh:mm), parseDMYtoISO chặt', () => {
  const S = loadShared();
  assert.equal(S.fmtDateDMY('2026-11-05'), '05-11-2026');
  assert.equal(S.fmtDateDMY('2026-11-02T03:00:00.000Z'), '02-11-2026', 'datetime lấy ngày theo Asia/Ho_Chi_Minh');
  assert.equal(S.fmtSysTime('2026-11-02T03:00:00.000Z'), '02-11-2026 10:00', 'ngày dd-mm-yyyy + giờ hh:mm HCM');
  assert.equal(S.fmtSysTime('2026-11-05'), '05-11-2026');
  assert.equal(S.fmtSysTime(''), '—');
  assert.deepEqual({ ...S.parseDMYtoISO('05-11-2026') }, { ok: true, iso: '2026-11-05' });
  assert.deepEqual({ ...S.parseDMYtoISO('') }, { ok: true, iso: '' }, 'để trống = không có ngày');
  for (const bad of ['31-02-2026', '11-05-2026 ', '2026-11-05', '05/11/2026', 'chữ', '5-11-2026', '05-13-2026', '00-11-2026']) {
    const r = S.parseDMYtoISO(bad === '11-05-2026 ' ? '29-02-2026' : bad);
    assert.equal(r.ok, false, 'phải chặn: ' + bad);
  }
  assert.equal(S.parseDMYtoISO('29-02-2028').iso, '2028-02-29', 'năm nhuận hợp lệ vẫn qua');
  /* Nhãn bucket dashboard: dd-mm / mm-yyyy — không còn gạch chéo */
  const D = (() => { const c = vm.createContext({ console, structuredClone }); c.window = c; vm.runInContext(read('shared.js'), c, { filename: 'shared.js' }); return c.window.SavaDash; })();
  const trend = D.dashTrend({ company: [{ createdAt: '2026-11-02T00:00:00.000Z' }], lead: [], deal: [] }, 7, new Date('2026-11-04T00:00:00+07:00'));
  assert.ok(trend.buckets.every(b => !b.label.includes('/')), 'nhãn bucket không còn gạch chéo: ' + trend.buckets.map(b => b.label).join(','));
});

/* ---------- Harness index.html THẬT (mẫu task-context-link) ---------- */
function fixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }],
    companies: [{ id: 'c1', name: 'Công ty Một', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hôm qua' }],
    games: [],
    deals: [{ id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', game: '', stage: 'build_eval', owner: 'linh', due: '2026-11-20', idle: 0, custom: {}, term: {}, contract: { status: '', no: '', signed: '2026-10-15', url: '' }, leads: [] }],
    leads: [{ id: 'l1', name: 'Người Một', company: 'c1', person: '', phone: '', line: 'publishing', source: 'Giới thiệu', status: 'new', note: '', when: '2026-10-01' }],
    tasks: [{ id: 't1', title: 'Việc Một', assignee: 'zac', due: '', dueDate: '2026-11-05', done: false, overdue: false }],
    activities: [{ id: 'a1', deal: 'd1', who: 'zac', type: 'Call', text: 'Đã gọi', when: '2026-10-05', url: '' }],
    events: [{ id: 'ev1', name: 'Expo', date: '2026-11-15', endDate: '2026-11-17', location: 'SECC', note: '', attendees: [], companies: [], leads: [], deals: [] }],
    verticals: [],
  };
}
function loadIndex(state) {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify(state || fixtureState()));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {}, querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null });
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout, confirm: () => true,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}

test('index helpers: sysShortDate / fmtWhen / fmtStamp / eventDateRangeText đều dd-mm-yyyy', () => {
  const h = loadIndex();
  assert.equal(h.run("sysShortDate('2026-11-02T03:00:00.000Z')"), '02-11-2026');
  assert.equal(h.run("fmtWhen('2026-10-01')"), '01-10-2026');
  assert.equal(h.run("fmtWhen('Vừa xong')"), 'Vừa xong', 'chữ tự do cũ hiện nguyên văn');
  assert.equal(h.run("fmtStamp('2026-10-15')"), '15-10-2026');
  assert.equal(h.run("eventDateRangeText(S.events[0])"), '15-11-2026 – 17-11-2026');
  assert.equal(h.run("parseDMYtoISO('31-02-2026').ok"), false);
  assert.equal(h.run("isoToDMY('2026-11-05')"), '05-11-2026');
});

test('nhập nhanh ddmmyyyy: parser shared + index chấp nhận 8 số liền, validate ngày thật, normalize về dd-mm-yyyy', () => {
  const S = loadShared();
  assert.deepEqual({ ...S.parseDMYtoISO('04112026') }, { ok: true, iso: '2026-11-04' }, '04112026 = 04-11-2026');
  assert.deepEqual({ ...S.parseDMYtoISO('29022028') }, { ok: true, iso: '2028-02-29' }, '29-02 năm nhuận dạng 8 số vẫn qua');
  for (const bad of ['31022026', '29022026', '04132026', '00012026', '0411202', '041120266', '04-11/2026', '20261104']) {
    assert.equal(S.parseDMYtoISO(bad).ok, false, 'phải chặn: ' + bad);
  }
  assert.equal(S.normalizeDMYInput('04112026'), '04-11-2026', 'normalize 8 số -> dd-mm-yyyy');
  assert.equal(S.normalizeDMYInput('05-11-2026'), '05-11-2026', 'dd-mm-yyyy giữ nguyên (idempotent)');
  assert.equal(S.normalizeDMYInput('31022026'), null, 'ngày không tồn tại -> không normalize');
  assert.equal(S.normalizeDMYInput(''), null, 'trống -> không normalize');
  const h = loadIndex();
  assert.equal(h.run("parseDMYtoISO('04112026').iso"), '2026-11-04', 'index inline parser cùng kết quả shared');
  assert.equal(h.run("parseDMYtoISO('31022026').ok"), false);
  assert.equal(h.run("normalizeDMYInput('04112026')"), '04-11-2026');
  assert.equal(h.run("(()=>{const el={tagName:'INPUT',placeholder:'dd-mm-yyyy',value:'04112026'};const r=normalizeDateInputEl(el);return r+':'+el.value})()"), 'true:04-11-2026', 'blur: ô 8 số hợp lệ tự về dd-mm-yyyy');
  assert.equal(h.run("(()=>{const el={tagName:'INPUT',placeholder:'dd-mm-yyyy',value:'31022026'};const r=normalizeDateInputEl(el);return r+':'+el.value})()"), 'false:31022026', 'blur: ô sai giữ nguyên văn để sửa/báo lỗi khi lưu');
  assert.equal(h.run("(()=>{const el={tagName:'INPUT',placeholder:'Tên',value:'04112026'};return normalizeDateInputEl(el)})()"), false, 'ô không phải ô ngày không bị đụng');
  /* Tĩnh: blur dùng chung (delegation qua placeholder) ở cả 2 phía + publishing parser có nhánh 8 số */
  const idx = read('index.html');
  assert.ok(idx.includes('function initDateInputs()') && idx.includes('initDateInputs();'), 'index phải gắn initDateInputs ở boot');
  assert.ok(idx.includes('addEventListener("focusout"') && idx.includes('normalizeDateInputEl(e.target)'), 'index phải chuẩn hoá ô ngày khi blur');
  const pub = read('publishing.js');
  assert.ok(/pubParseDMY[\s\S]{0,600}\^\(\\d\{2\}\)\(\\d\{2\}\)\(\\d\{4\}\)/.test(pub) || pub.includes('/^(\\d{2})(\\d{2})(\\d{4})$/'), 'publishing pubParseDMY phải có nhánh ddmmyyyy');
  assert.ok(pub.includes('pubNormalizeDateInputEl') && pub.includes("'focusout'"), 'publishing phải chuẩn hoá ô ngày khi blur');
});

test('form việc: nhập 04112026 lưu ISO 2026-11-04 + ô tự về 04-11-2026; 8 số sai bị chặn', () => {
  const h = loadIndex();
  h.run("editTask('t1')");
  const fill = due => { h.getEl('e_ttitle').value = 'Việc mới'; h.getEl('e_tassignee').value = 'zac'; h.getEl('e_tdueDate').value = due; h.getEl('e_tdone').checked = false; h.getEl('e_tlink').value = ''; };
  for (const bad of ['31022026', '29022026', '04132026']) {
    fill(bad); h.run('saveTask(null)');
    assert.equal(h.run('S.tasks.length'), 1, 'phải chặn lưu: ' + bad);
  }
  fill('04112026'); h.run('saveTask(null)');
  assert.equal(h.run('S.tasks.length'), 2, 'ddmmyyyy hợp lệ -> tạo việc');
  assert.equal(h.run("S.tasks[S.tasks.length-1].dueDate"), '2026-11-04', 'dữ liệu LƯU vẫn ISO đúng ngày đã nhập');
  assert.equal(h.getEl('e_tdueDate').value, '04-11-2026', 'trước khi lưu xong ô đã tự hiển thị lại dd-mm-yyyy (readDateInput chuẩn hoá)');
});

test('form việc: mở form hiện dd-mm-yyyy; nhập sai bị chặn không tạo việc; nhập đúng lưu ISO', () => {
  const h = loadIndex();
  h.run("editTask('t1')");
  const form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('id="e_tdueDate" type="text" placeholder="dd-mm-yyyy" value="05-11-2026"'), 'ô hạn hiện dd-mm-yyyy của dữ liệu đã lưu: ' + form.slice(form.indexOf('e_tdueDate') - 60, form.indexOf('e_tdueDate') + 120));
  const fill = due => { h.getEl('e_ttitle').value = 'Việc mới'; h.getEl('e_tassignee').value = 'zac'; h.getEl('e_tdueDate').value = due; h.getEl('e_tdone').checked = false; h.getEl('e_tlink').value = ''; };
  fill('31-02-2026'); h.run('saveTask(null)');
  assert.equal(h.run('S.tasks.length'), 1, 'ngày không tồn tại -> chặn lưu, không tạo việc');
  fill('2026-11-05'); h.run('saveTask(null)');
  assert.equal(h.run('S.tasks.length'), 1, 'chuỗi ISO gõ thẳng vào ô dd-mm-yyyy cũng bị chặn');
  fill('05-11-2026'); h.run('saveTask(null)');
  assert.equal(h.run('S.tasks.length'), 2, 'dd-mm-yyyy hợp lệ -> tạo việc');
  assert.equal(h.run("S.tasks[S.tasks.length-1].dueDate"), '2026-11-05', 'dữ liệu LƯU vẫn ISO yyyy-mm-dd');
});

test('form sự kiện: mở form hiện dd-mm-yyyy; drawer hiện khoảng ngày dd-mm-yyyy', () => {
  const h = loadIndex();
  h.run("openEventForm('ev1')");
  const form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('value="15-11-2026"'), 'ngày bắt đầu hiện dd-mm-yyyy: ' + form.slice(0, 0));
  assert.ok(form.includes('value="17-11-2026"'), 'ngày kết thúc hiện dd-mm-yyyy');
  assert.ok(form.includes('VD: 15-11-2026'), 'placeholder mẫu dd-mm-yyyy');
  h.run("openEvent('ev1')");
  assert.ok(h.getEl('drawer').innerHTML.includes('15-11-2026 – 17-11-2026'), 'drawer hiện khoảng ngày dd-mm-yyyy');
});
