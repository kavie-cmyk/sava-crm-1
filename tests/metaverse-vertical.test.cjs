/* Phân khúc ngành (vertical) cho deal Metaverse (30/10/2026):
   - shared.js: danh sách ngành mở (mặc định 4 ngành + S.verticals +
     ngành suy ra từ deal), nhãn "Chưa phân ngành", migrateState chuẩn hoá.
   - supabase-adapter.js: deal.vertical round-trip qua deals.legacy_extra
     (KHÔNG cột riêng, KHÔNG key lạ ở cấp row — PostgREST upsert sẽ lỗi nếu
     row mang cột không tồn tại), bảng deals không có CHECK legacy_extra.
   - index.html: form tạo/sửa chỉ hiện trường ngành ở Metaverse, thêm ngành
     mới ngay trong form, thẻ pipeline + dealMini + drawer hiện nhãn ngành,
     bộ lọc ngành ở pipeline Metaverse (kết hợp tìm kiếm, lọc "Chưa phân
     ngành"), giá trị lạ đã lưu hiện "(dữ liệu cũ)", đổi mảng khỏi Metaverse
     thì GIỮ vertical trong dữ liệu.
   - Sửa lỗi (QA độc lập, sau 203f9f1): (1) đổi mảng AI -> Metaverse trong
     form SỬA phải khôi phục d.vertical đã giữ trong dữ liệu (trước đây
     fillDealLineFields ép "" theo line gốc -> lưu là mất ngành); (2) nhãn
     "(dữ liệu cũ)" xét theo danh sách CHÍNH THỨC (metaverseVerticalsOfficial:
     mặc định + S.verticals), KHÔNG theo danh sách đầy đủ — giá trị chỉ tồn
     tại vì đã gán trên deal phải hiện legacy trong form, trong khi bộ lọc
     pipeline vẫn dùng danh sách đầy đủ để lọc được giá trị đó. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const A = require('../supabase-adapter.js');
const readF = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = readF('index.html');

function section(src, startNeedle, endNeedle) {
  const a = src.indexOf(startNeedle);
  assert.ok(a >= 0, 'thiếu điểm bắt đầu: ' + startNeedle);
  const b = src.indexOf(endNeedle, a + startNeedle.length);
  assert.ok(b > a, 'thiếu điểm kết thúc: ' + endNeedle);
  return src.slice(a, b);
}

test('cú pháp: mọi script inline của index.html + shared.js đều parse được', () => {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
  blocks.forEach((code, i) => {
    const bf = path.join(os.tmpdir(), `sava-vert-${process.pid}-${i}.js`);
    fs.writeFileSync(bf, code);
    try { execFileSync(process.execPath, ['--check', bf], { stdio: 'pipe' }); } finally { fs.unlinkSync(bf); }
  });
  const sf = path.join(os.tmpdir(), `sava-vert-shared-${process.pid}.js`);
  fs.writeFileSync(sf, readF('shared.js'));
  try { execFileSync(process.execPath, ['--check', sf], { stdio: 'pipe' }); } finally { fs.unlinkSync(sf); }
});

/* ---------- shared.js: hàm thuần qua vm ---------- */
function loadShared() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const ctx = vm.createContext({ console, localStorage: ls, setTimeout, clearTimeout, structuredClone });
  ctx.window = ctx;
  vm.runInContext(readF('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}

test('shared: danh sách ngành = 4 mặc định + ngành tuỳ biến + ngành suy ra từ deal Metaverse (bỏ trùng, giữ thứ tự)', () => {
  const ctx = loadShared();
  assert.deepEqual([...ctx.metaverseVerticals(null)], ['Sản xuất', 'Giáo dục', 'Y tế', 'Du lịch']);
  const s = {
    verticals: ['Bất động sản', 'Giáo dục', '  Logistics  '],
    deals: [
      { id: 'd1', line: 'metaverse', vertical: 'Nông nghiệp' },
      { id: 'd2', line: 'metaverse', vertical: 'Giáo dục' },
      { id: 'd3', line: 'ai', vertical: 'Không tính (khác mảng)' },
      { id: 'd4', line: 'metaverse' },
    ],
  };
  assert.deepEqual([...ctx.metaverseVerticals(s)],
    ['Sản xuất', 'Giáo dục', 'Y tế', 'Du lịch', 'Bất động sản', 'Logistics', 'Nông nghiệp']);
  assert.equal(ctx.dealVerticalLabel({ vertical: 'Y tế' }), 'Y tế');
  assert.equal(ctx.dealVerticalLabel({ vertical: '  ' }), 'Chưa phân ngành');
  assert.equal(ctx.dealVerticalLabel({}), 'Chưa phân ngành');
  assert.equal(ctx.dealVerticalLabel(null), 'Chưa phân ngành');
  assert.deepEqual([...ctx.emptyState().verticals], []);
});

test('shared: migrateState chuẩn hoá S.verticals (trim, bỏ trùng, bỏ phần tử không phải chuỗi; thiếu -> [])', () => {
  const ctx = loadShared();
  const s = ctx.migrateState({ members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [], verticals: [' Giáo dục ', 'Giáo dục', 7, null, 'Logistics', ''] });
  assert.deepEqual([...s.verticals], ['Giáo dục', 'Logistics']);
  const s2 = ctx.migrateState({ members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [] });
  assert.deepEqual([...s2.verticals], []);
});

/* ---------- adapter: round-trip qua legacy_extra, không DDL ---------- */
test('adapter: deal.vertical đi vào deals.legacy_extra (không thành cột row), đọc lại nguyên vẹn; deals không có CHECK legacy_extra', () => {
  const state = {
    members: [], companies: [], games: [], leads: [], tasks: [], activities: [],
    deals: [
      { id: 'dm1', line: 'metaverse', title: 'Meta Edu', company: '', stage: 'prospect', owner: 'zac', due: '', idle: 0, amount: 100, cur: 'VND', custom: {}, leads: [], vertical: 'Giáo dục' },
      { id: 'dm2', line: 'metaverse', title: 'Meta Unset', company: '', stage: 'prospect', owner: 'zac', due: '', idle: 0, amount: 50, cur: 'VND', custom: {}, leads: [] },
      { id: 'da1', line: 'ai', title: 'AI Deal', company: '', stage: 'prospect', owner: 'zac', due: '', idle: 0, amount: 10, cur: 'VND', custom: {}, leads: [], vertical: 'Giữ trong dữ liệu' },
    ],
  };
  const rows = A.crmStateToRows(state);
  const r1 = rows.deals.find(r => r.id === 'dm1');
  assert.equal('vertical' in r1, false, 'row deals KHÔNG được mang key vertical (chưa có cột — PostgREST upsert sẽ lỗi)');
  assert.equal(r1.legacy_extra.vertical, 'Giáo dục', 'vertical phải nằm trong legacy_extra');
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  assert.equal(back.deals.find(d => d.id === 'dm1').vertical, 'Giáo dục');
  assert.equal('vertical' in back.deals.find(d => d.id === 'dm2'), false, 'deal chưa phân ngành đọc lại không bịa vertical');
  assert.equal(back.deals.find(d => d.id === 'da1').vertical, 'Giữ trong dữ liệu', 'vertical của deal mảng khác (đã lưu) vẫn round-trip, chỉ không hiển thị');
  const schema = readF('supabase/schema.sql');
  assert.ok(!schema.includes('deals_legacy_extra'), 'schema không được có CHECK trên deals.legacy_extra (sẽ chặn khoá vertical)');
  assert.ok(schema.includes('legacy_extra->>\'vertical\''), 'schema phải ghi lại đường legacy_extra cho vertical + SQL tương lai');
  const adapter = readF('supabase-adapter.js');
  assert.ok(adapter.includes("không nằm trong") && adapter.includes('DEAL_KNOWN'), 'adapter phải có chú thích vì sao vertical không vào DEAL_KNOWN');
});

/* ---------- index.html: kiểm tĩnh ---------- */
test('tĩnh: form tạo/sửa + hiển thị + bộ lọc ngành wiring đúng chỗ', () => {
  assert.ok(html.includes('id="f_verticalWrap"') && html.includes('id="f_verticalBox"'), 'thiếu khối ngành ở form tạo deal');
  const fill = section(html, 'function fillStages()', 'function fillCreateCompanyOptions');
  assert.ok(fill.includes('line === "metaverse"') && fill.includes('verticalSelectHTML("f_vertical"'), 'fillStages chỉ hiện/dựng ô ngành khi Metaverse');
  const saveCreate = section(html, 'function saveDeal()', '/* ===== CRUD');
  assert.ok(saveCreate.includes('readVerticalForm("f_vertical")'), 'saveDeal phải đọc trường ngành');
  assert.ok(saveCreate.includes('nd.vertical = verticalVal; ensureVertical(verticalVal);'), 'saveDeal phải gán vertical + đăng ký ngành mới');
  assert.ok(saveCreate.indexOf('readVerticalForm("f_vertical")') < saveCreate.indexOf('S.companies.push(c)'), 'phải validate ngành TRƯỚC khi mutate (tạo công ty)');
  const fillFields = section(html, 'function fillDealLineFields', 'function saveEditDeal');
  assert.ok(fillFields.includes('if (line === "metaverse")') && fillFields.includes('verticalSelectHTML("e_vertical"'), 'form sửa chỉ thêm trường ngành cho Metaverse');
  const saveEdit = section(html, 'function saveEditDeal', 'function performDeleteDeal');
  assert.ok(saveEdit.includes('readVerticalForm("e_vertical")'), 'saveEditDeal phải đọc trường ngành');
  assert.ok(saveEdit.includes('delete d.vertical'), 'chọn Chưa phân ngành ở form sửa phải xoá vertical');
  const board = section(html, 'function vBoard()', 'let dragId');
  assert.ok(board.includes('boardVerticalFilterHTML()') && board.includes('line === "metaverse" ? boardVerticalFilterHTML()'), 'pipeline chỉ hiện bộ lọc ngành ở Metaverse');
  assert.ok(board.includes('dealMatchesVerticalFilter(d)'), 'pipeline phải lọc deal theo ngành');
  assert.ok(board.includes('dealVerticalLabel(d)'), 'thẻ pipeline phải hiện nhãn ngành');
  assert.ok(section(html, 'function dealMini', '/* === PARTNER EVAL LOGIC').includes('dealVerticalLabel(d)'), 'dealMini phải hiện nhãn ngành');
  assert.ok(section(html, 'function openDeal', 'function moveStage').includes('Phân khúc ngành'), 'drawer deal phải hiện dòng Phân khúc ngành');
});

/* ---------- Harness vm: nạp index.html THẬT (như bd-batch3) ---------- */
function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }],
    companies: [{ id: 'cm', name: 'Meta Corp', type: 'Doanh nghiệp', roles: { metaverse: 'Khách hàng', ai: 'Khách hàng' }, contact: 'An', phone: '', last: 'Hôm nay' }],
    games: [],
    deals: [
      { id: 'dm1', line: 'metaverse', title: 'Meta Edu VR', company: 'cm', stage: 'prospect', owner: 'zac', due: '', idle: 0, custom: {}, amount: 100, cur: 'VND', vertical: 'Giáo dục' },
      { id: 'dm2', line: 'metaverse', title: 'Meta Chua Phan Nganh', company: 'cm', stage: 'prospect', owner: 'zac', due: '', idle: 0, custom: {}, amount: 50, cur: 'VND' },
      { id: 'dm3', line: 'metaverse', title: 'Meta Y Te VR', company: 'cm', stage: 'discovery', owner: 'zac', due: '', idle: 0, custom: {}, amount: 70, cur: 'VND', vertical: 'Y tế' },
      { id: 'da1', line: 'ai', title: 'AI Deal Thuong', company: 'cm', stage: 'prospect', owner: 'zac', due: '', idle: 0, custom: {}, amount: 10, cur: 'VND' },
    ],
    leads: [], tasks: [], activities: [], verticals: [],
  }));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {}, querySelector: () => makeEl(), querySelectorAll: () => [], closest: () => null });
  const elements = new Map();
  const getEl = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  const listeners = {};
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout, confirm: () => true,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(readF(f), ctx, { filename: f });
  [...readF('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}

test('chức năng: pipeline Metaverse hiện bộ lọc + nhãn ngành; lọc theo ngành / chưa phân ngành / kết hợp tìm kiếm', () => {
  const { run, getEl } = loadIndex();
  run('curLine = "metaverse"; curView = "board"; boardVerticalFilter = ""; query = ""; render();');
  let view = getEl('view').innerHTML;
  assert.ok(view.includes('id="boardVerticalFilter"'), 'thiếu select lọc ngành');
  for (const o of ['Tất cả ngành', 'Sản xuất', 'Giáo dục', 'Y tế', 'Du lịch', 'Chưa phân ngành']) assert.ok(view.includes(o), 'thiếu option lọc: ' + o);
  assert.ok(view.includes('🏭 Giáo dục') && view.includes('🏭 Y tế'), 'thẻ deal phải hiện ngành đã gán');
  assert.ok(view.includes('🏭 Chưa phân ngành'), 'thẻ deal chưa gán phải hiện nhãn Chưa phân ngành');
  run('setBoardVerticalFilter("Giáo dục");');
  view = getEl('view').innerHTML;
  assert.ok(view.includes('Meta Edu VR') && !view.includes('Meta Y Te VR') && !view.includes('Meta Chua Phan Nganh'), 'lọc Giáo dục phải chỉ còn deal Giáo dục');
  run('setBoardVerticalFilter("__unset__");');
  view = getEl('view').innerHTML;
  assert.ok(view.includes('Meta Chua Phan Nganh') && !view.includes('Meta Edu VR') && !view.includes('Meta Y Te VR'), 'lọc Chưa phân ngành phải chỉ còn deal chưa gán');
  run('setBoardVerticalFilter(""); query = "y te"; render();');
  view = getEl('view').innerHTML;
  assert.ok(view.includes('Meta Y Te VR') && !view.includes('Meta Edu VR'), 'lọc ngành phải kết hợp đúng với ô tìm kiếm sẵn có');
  run('query = ""; curLine = "ai"; render();');
  view = getEl('view').innerHTML;
  assert.ok(!view.includes('id="boardVerticalFilter"'), 'pipeline mảng khác KHÔNG được hiện bộ lọc ngành');
  assert.ok(!view.includes('🏭'), 'pipeline mảng khác không hiện nhãn ngành');
});

test('chức năng: select ngành giữ giá trị lạ qua "(dữ liệu cũ)"; thêm ngành mới qua __new__ + ensureVertical', () => {
  const { run, getEl } = loadIndex();
  const selHtml = run('verticalSelectHTML("e_vertical", "Ngành lạ XYZ")');
  assert.ok(selHtml.includes('(dữ liệu cũ) Ngành lạ XYZ'), 'giá trị lạ đã lưu phải hiện option (dữ liệu cũ) được chọn');
  assert.ok(selHtml.includes('— Chưa phân ngành —') && selHtml.includes('＋ Thêm ngành mới…'), 'thiếu ô trống Chưa phân ngành / mục Thêm ngành mới');
  for (const o of ['Sản xuất', 'Giáo dục', 'Y tế', 'Du lịch']) assert.ok(selHtml.includes('>' + o + '<'), 'thiếu ngành mặc định: ' + o);
  getEl('f_vertical').value = '__new__';
  getEl('f_vertical_new').value = '  Bất động sản ';
  const vr = run('readVerticalForm("f_vertical")');
  assert.equal(vr.value, 'Bất động sản');
  getEl('f_vertical_new').value = '   ';
  assert.ok(run('readVerticalForm("f_vertical")').error, 'chọn Thêm ngành mới mà để trống tên phải báo lỗi');
  run('ensureVertical("Bất động sản"); ensureVertical("Bất động sản"); ensureVertical("Giáo dục");');
  assert.deepEqual([...run('S.verticals')], ['Bất động sản'], 'ensureVertical phải thêm 1 lần, không trùng, không thêm lại ngành đã có');
  assert.ok(run('metaverseVerticals(S)').includes('Bất động sản'));
});

test('chức năng: form sửa deal — Metaverse có trường ngành (chọn sẵn giá trị), mảng khác không có; lưu sửa gán/xoá/giữ vertical đúng', () => {
  const { run, getEl } = loadIndex();
  run("editDeal('dm1')");
  assert.ok(getEl('e_lineFields').innerHTML.includes('id="e_vertical"'), 'form sửa deal Metaverse phải có select ngành');
  assert.ok(getEl('e_lineFields').innerHTML.includes('value="Giáo dục" selected') || getEl('e_lineFields').innerHTML.includes('>Giáo dục</option>'), 'phải chọn sẵn ngành đã lưu');
  run("editDeal('da1')");
  assert.ok(!getEl('e_lineFields').innerHTML.includes('e_vertical'), 'form sửa deal mảng AI KHÔNG được có trường ngành');
  /* Lưu sửa: đổi ngành dm1 -> Du lịch */
  run("editDeal('dm1')");
  getEl('e_title').value = 'Meta Edu VR';
  getEl('e_company').value = 'cm';
  getEl('e_line').value = 'metaverse';
  getEl('e_stage').value = 'prospect';
  getEl('e_owner').value = 'zac';
  getEl('e_due').value = '';
  getEl('e_amount').value = '100';
  getEl('e_cur').value = 'VND';
  getEl('e_vertical').value = 'Du lịch';
  run("saveEditDeal('dm1')");
  assert.equal(run("S.deals.find(d=>d.id==='dm1').vertical"), 'Du lịch');
  /* Lưu sửa: chọn Chưa phân ngành -> xoá vertical */
  run("editDeal('dm1')");
  getEl('e_title').value = 'Meta Edu VR'; getEl('e_company').value = 'cm'; getEl('e_line').value = 'metaverse';
  getEl('e_stage').value = 'prospect'; getEl('e_owner').value = 'zac'; getEl('e_due').value = '';
  getEl('e_amount').value = '100'; getEl('e_cur').value = 'VND'; getEl('e_vertical').value = '';
  run("saveEditDeal('dm1')");
  assert.equal(run("'vertical' in S.deals.find(d=>d.id==='dm1')"), false, 'chọn Chưa phân ngành phải xoá field vertical');
  /* Đổi mảng Metaverse -> AI: vertical GIỮ NGUYÊN trong dữ liệu (không hiển thị ở mảng mới) */
  run("S.deals.find(d=>d.id==='dm1').vertical = 'Y tế'; editDeal('dm1')");
  getEl('e_title').value = 'Meta Edu VR'; getEl('e_company').value = 'cm'; getEl('e_line').value = 'ai';
  getEl('e_stage').value = 'prospect'; getEl('e_owner').value = 'zac'; getEl('e_due').value = '';
  getEl('e_amount').value = '100'; getEl('e_cur').value = 'VND';
  run("saveEditDeal('dm1')");
  assert.equal(run("S.deals.find(d=>d.id==='dm1').line"), 'ai');
  assert.equal(run("S.deals.find(d=>d.id==='dm1').vertical"), 'Y tế', 'đổi mảng khỏi Metaverse phải giữ vertical trong dữ liệu');
});

test('chức năng: tạo deal Metaverse với ngành mới ngay trong form -> deal mang vertical + ngành vào danh sách dùng luôn', () => {
  const { run, getEl } = loadIndex();
  /* DOM stub không tự suy value từ innerHTML như trình duyệt thật (option
     selected theo curLine) — đặt sẵn value đúng mảng sẽ mở. */
  getEl('f_line').value = 'metaverse';
  run('openAdd()');
  getEl('f_line').value = 'metaverse';
  run('fillStages()');
  assert.ok(getEl('f_verticalBox').innerHTML.includes('id="f_vertical"'), 'form tạo Metaverse phải dựng select ngành');
  assert.equal(getEl('f_verticalWrap').style.display, '', 'khối ngành phải hiện ở Metaverse');
  getEl('f_title').value = 'Meta Logistics Moi';
  getEl('f_company').value = 'cm';
  getEl('f_amount').value = '200';
  getEl('f_cur').value = 'VND';
  getEl('f_stage').value = 'prospect';
  getEl('f_owner').value = 'zac';
  getEl('f_vertical').value = '__new__';
  getEl('f_vertical_new').value = 'Logistics';
  run('saveDeal()');
  const nd = run("S.deals.find(d=>d.title==='Meta Logistics Moi')");
  assert.ok(nd, 'deal mới phải được tạo');
  assert.equal(nd.vertical, 'Logistics', 'deal mới phải mang ngành vừa thêm');
  assert.ok(run('metaverseVerticals(S)').includes('Logistics'), 'ngành mới phải vào danh sách dùng luôn');
  run('curLine = "metaverse"; curView = "board"; boardVerticalFilter = "Logistics"; query = ""; render();');
  assert.ok(getEl('view').innerHTML.includes('Meta Logistics Moi'), 'lọc theo ngành mới phải thấy deal vừa tạo');
  /* Form tạo mảng khác: khối ngành ẩn */
  getEl('f_line').value = 'ai';
  run('openAdd()');
  getEl('f_line').value = 'ai';
  run('fillStages()');
  assert.equal(getEl('f_verticalWrap').style.display, 'none', 'form tạo mảng AI phải ẩn khối ngành');
});

test('shared: danh sách CHÍNH THỨC (mặc định + S.verticals) tách khỏi danh sách ĐẦY ĐỦ (thêm ngành suy ra từ deal)', () => {
  const ctx = loadShared();
  const s = {
    verticals: ['Bất động sản'],
    deals: [
      { id: 'd1', line: 'metaverse', vertical: 'Nông nghiệp' },
      { id: 'd2', line: 'ai', vertical: 'Không tính (khác mảng)' },
    ],
  };
  assert.deepEqual([...ctx.metaverseVerticalsOfficial(s)], ['Sản xuất', 'Giáo dục', 'Y tế', 'Du lịch', 'Bất động sản'],
    'danh sách chính thức KHÔNG được chứa giá trị chỉ tồn tại vì đã gán trên deal');
  assert.deepEqual([...ctx.metaverseVerticals(s)], ['Sản xuất', 'Giáo dục', 'Y tế', 'Du lịch', 'Bất động sản', 'Nông nghiệp'],
    'danh sách đầy đủ vẫn chứa ngành suy ra từ deal Metaverse (cho bộ lọc)');
  assert.equal(ctx.MetaverseVerticals.official, ctx.metaverseVerticalsOfficial, 'phải export official qua window.MetaverseVerticals');
});

test('sửa lỗi 1: đổi mảng Metaverse -> AI -> Metaverse qua đúng đường form sửa, không đụng trường ngành -> vertical còn nguyên sau cả hai lần lưu', () => {
  const { run, getEl } = loadIndex();
  const fillCommon = line => {
    getEl('e_title').value = 'Meta Y Te VR';
    getEl('e_company').value = 'cm';
    getEl('e_line').value = line;
    getEl('e_stage').value = line === 'metaverse' ? 'discovery' : 'prospect';
    getEl('e_owner').value = 'zac';
    getEl('e_due').value = '';
    getEl('e_amount').value = '70';
    getEl('e_cur').value = 'VND';
  };
  /* dm3 đang metaverse + vertical "Y tế". Lần lưu 1: đổi mảng -> AI qua
     đúng sự kiện change của form (dealDraftLine + fillDealLineFields). */
  run("editDeal('dm3')");
  assert.ok(getEl('e_lineFields').innerHTML.includes('id="e_vertical"'), 'mở form Metaverse phải có trường ngành');
  run('dealDraftLine = "ai"; fillDealLineFields(S.deals.find(d => d.id === "dm3"));');
  assert.ok(!getEl('e_lineFields').innerHTML.includes('e_vertical'), 'đổi sang AI thì trường ngành ẩn');
  fillCommon('ai');
  run("saveEditDeal('dm3')");
  assert.equal(run("S.deals.find(d=>d.id==='dm3').line"), 'ai');
  assert.equal(run("S.deals.find(d=>d.id==='dm3').vertical"), 'Y tế', 'đổi mảng khỏi Metaverse vẫn giữ vertical trong dữ liệu');
  /* Lần lưu 2: mở lại form (deal đang AI, vertical "Y tế" ẩn trong dữ liệu),
     đổi mảng về Metaverse qua sự kiện change, KHÔNG đụng trường ngành.
     Trình duyệt thật sẽ lấy value từ option selected trong HTML vừa dựng —
     stub DOM không tự suy value nên test đọc selected từ HTML rồi gán lại
     đúng như trình duyệt. */
  run("editDeal('dm3')");
  assert.ok(!getEl('e_lineFields').innerHTML.includes('e_vertical'), 'mở form deal AI không có trường ngành');
  run('dealDraftLine = "metaverse"; fillDealLineFields(S.deals.find(d => d.id === "dm3"));');
  const fieldsHtml = getEl('e_lineFields').innerHTML;
  assert.ok(fieldsHtml.includes('id="e_vertical"'), 'đổi về Metaverse phải dựng lại trường ngành');
  assert.ok(fieldsHtml.includes('value="Y tế" selected'), 'option "Y tế" (giá trị đã giữ trong dữ liệu) phải được chọn sẵn');
  assert.ok(!fieldsHtml.includes('<option value="" selected>— Chưa phân ngành —'), 'KHÔNG được chọn sẵn "Chưa phân ngành" (đây chính là lỗi mất dữ liệu)');
  getEl('e_vertical').value = 'Y tế'; /* = value của option selected, như trình duyệt */
  fillCommon('metaverse');
  run("saveEditDeal('dm3')");
  const d3 = run("S.deals.find(d=>d.id==='dm3')");
  assert.equal(d3.line, 'metaverse');
  assert.equal('vertical' in d3, true, 'vertical KHÔNG được bị xoá sau khi đổi mảng qua lại');
  assert.equal(d3.vertical, 'Y tế', 'vertical phải còn nguyên "Y tế" sau cả hai lần lưu');
});

test('sửa lỗi 2: giá trị lạ chỉ có trên deal -> form sửa hiện "(dữ liệu cũ)" được chọn; lưu không đụng -> giữ nguyên + không hợp thức hoá; bộ lọc vẫn lọc được', () => {
  const { run, getEl } = loadIndex();
  run("S.deals.push({ id: 'dm9', line: 'metaverse', title: 'Meta Nong Nghiep', company: 'cm', stage: 'prospect', owner: 'zac', due: '', idle: 0, custom: {}, amount: 10, cur: 'VND', vertical: 'Nông nghiệp' });");
  assert.deepEqual([...run('S.verticals')], [], 'giá trị lạ chưa từng được thêm qua UI nên S.verticals trống');
  /* Dropdown thuần: giá trị lạ -> legacy; giá trị chính thức -> option thường. */
  const selHtml = run('verticalSelectHTML("e_vertical", "Nông nghiệp")');
  assert.ok(selHtml.includes('value="Nông nghiệp" selected>(dữ liệu cũ) Nông nghiệp'), 'giá trị lạ phải hiện option "(dữ liệu cũ) ..." được chọn sẵn');
  assert.ok(!selHtml.includes('>Nông nghiệp</option>'), 'giá trị lạ KHÔNG được hiện như option thường');
  const selOfficial = run('verticalSelectHTML("e_vertical", "Giáo dục")');
  assert.ok(selOfficial.includes('value="Giáo dục" selected>Giáo dục</option>') && !selOfficial.includes('(dữ liệu cũ) Giáo dục'), 'giá trị chính thức hiện option thường, không legacy');
  /* Form sửa thật: legacy hiện trong HTML; lưu không đụng -> giữ nguyên giá
     trị VÀ S.verticals vẫn trống (không âm thầm hợp thức hoá). */
  run("editDeal('dm9')");
  assert.ok(getEl('e_lineFields').innerHTML.includes('(dữ liệu cũ) Nông nghiệp'), 'form sửa phải hiện nhãn (dữ liệu cũ) cho giá trị lạ');
  getEl('e_title').value = 'Meta Nong Nghiep'; getEl('e_company').value = 'cm'; getEl('e_line').value = 'metaverse';
  getEl('e_stage').value = 'prospect'; getEl('e_owner').value = 'zac'; getEl('e_due').value = '';
  getEl('e_amount').value = '10'; getEl('e_cur').value = 'VND';
  getEl('e_vertical').value = 'Nông nghiệp'; /* option legacy đang selected -> value giữ nguyên như trình duyệt */
  run("saveEditDeal('dm9')");
  assert.equal(run("S.deals.find(d=>d.id==='dm9').vertical"), 'Nông nghiệp', 'lưu không đụng phải giữ nguyên giá trị lạ');
  assert.deepEqual([...run('S.verticals')], [], 'lưu không đụng KHÔNG được ghi giá trị lạ vào S.verticals');
  run("editDeal('dm9')");
  assert.ok(getEl('e_lineFields').innerHTML.includes('(dữ liệu cũ) Nông nghiệp'), 'mở lại form vẫn hiện (dữ liệu cũ) — chưa thành chính thức');
  /* Bộ lọc pipeline dùng danh sách ĐẦY ĐỦ: vẫn thấy + lọc được giá trị lạ. */
  run('curLine = "metaverse"; curView = "board"; boardVerticalFilter = ""; query = ""; render();');
  assert.ok(getEl('view').innerHTML.includes('>Nông nghiệp</option>'), 'bộ lọc phải liệt kê giá trị lạ (danh sách đầy đủ)');
  run('setBoardVerticalFilter("Nông nghiệp");');
  const view = getEl('view').innerHTML;
  assert.ok(view.includes('Meta Nong Nghiep') && !view.includes('Meta Edu VR'), 'lọc theo giá trị lạ chỉ còn deal mang giá trị đó');
  /* Thêm ngành qua UI -> thành chính thức, hết nhãn legacy. */
  run('ensureVertical("Nông nghiệp");');
  assert.deepEqual([...run('S.verticals')], ['Nông nghiệp']);
  assert.ok(!run('verticalSelectHTML("e_vertical", "Nông nghiệp")').includes('(dữ liệu cũ)'), 'sau khi thêm qua UI, giá trị không còn nhãn (dữ liệu cũ)');
});

test('chức năng: drawer deal + dealMini hiện Phân khúc ngành chỉ cho Metaverse', () => {
  const { run, getEl } = loadIndex();
  run("openDeal('dm3')");
  assert.ok(getEl('drawer').innerHTML.includes('Phân khúc ngành') && getEl('drawer').innerHTML.includes('Y tế'), 'drawer deal Metaverse phải hiện ngành');
  run("openDeal('dm2')");
  assert.ok(getEl('drawer').innerHTML.includes('Chưa phân ngành'), 'drawer deal chưa gán phải hiện Chưa phân ngành');
  run("openDeal('da1')");
  assert.ok(!getEl('drawer').innerHTML.includes('Phân khúc ngành'), 'drawer deal mảng khác không hiện dòng ngành');
  assert.ok(run("dealMini(S.deals.find(d=>d.id==='dm1'))").includes('🏭 Giáo dục'));
  assert.ok(!run("dealMini(S.deals.find(d=>d.id==='da1'))").includes('🏭'), 'dealMini mảng khác không hiện nhãn ngành');
});
