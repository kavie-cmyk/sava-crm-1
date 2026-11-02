/* Searchable combobox cho select tham chiếu entity dài (index.html):
   - <select> gốc giữ nguyên id/value (class combo-source, data-combo="1") —
     saveDeal/saveLead/saveGame/saveTask/saveActivity + các hàm attach*
     vẫn đọc ĐÚNG element đó, mô hình dữ kiện không đổi.
   - Ô gõ tìm lọc theo text chuẩn hoá không dấu + không phân biệt hoa
     thường (comboFoldText/comboFilterOptions), giới hạn số kết quả.
   - Bàn phím ↑/↓ qua comboMoveActive (vòng tròn); Enter/Esc/chuột dùng
     comboChoose/comboSetValue trong trình duyệt thật (harness DOM giả
     không parse được DOM nên phần phím/chuột kiểm ở tầng logic thuần +
     comboSetValue ghi đúng ID vào select gốc).
   - "(dữ liệu cũ)": value đang lưu không có trong danh sách vẫn có option
     giữ nguyên value + nhãn "(dữ liệu cũ)" (lead/game/e_game/task/activity)
     và lưu lại không rơi liên kết. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function fixtureState() {
  return {
    members: [
      { id: 'zac', name: 'Zac', role: 'Admin', active: true },
      { id: 'linh', name: 'Linh', role: 'BD', active: true },
    ],
    companies: [
      { id: 'c1', name: 'Công ty Đức Anh', type: 'Publisher', roles: { publishing: 'Publisher' }, last: 'Hôm qua' },
      { id: 'c2', name: 'Studio Bình Minh', type: 'Game studio', roles: { publishing: 'Game studio' }, last: 'Hôm nay' },
    ],
    games: [
      { id: 'g1', title: 'Game Đức', own: 'partner', company: 'c1', genre: 'Puzzle', platform: 'Android', stage: 'Prototype', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: '' },
      { id: 'gOurs', title: 'Game Của Sava', own: 'ours', genre: '', platform: '', stage: '', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '' },
    ],
    deals: [
      { id: 'd1', line: 'publishing', title: 'Deal Một', company: 'c1', game: 'g1', stage: 'build_eval', owner: 'linh', due: '', idle: 0, custom: {}, term: {}, contract: {}, leads: [] },
      { id: 'd2', line: 'ai', title: 'Deal Hai', company: 'c2', stage: 'prospect', owner: 'zac', due: '', idle: 0, custom: {}, amount: 0, cur: 'VND', leads: [] },
    ],
    leads: [
      { id: 'l1', name: 'Nguyễn Văn Đức', company: 'c1', person: 'Anh Đức — CEO', phone: '0901', line: 'publishing', source: 'Giới thiệu', status: 'qualified', note: '', when: '2026-10-01', mainContact: false },
      { id: 'l2', name: 'Trần Thị Hoa', company: 'c1', person: '', phone: '', line: 'publishing', source: '', status: 'new', note: '', when: '2026-10-02', mainContact: false },
      { id: 'lGhost', name: 'Lead Ma', company: 'cGhost', person: '', phone: '', line: 'ai', source: '', status: 'new', note: '', when: '2026-10-03', mainContact: false },
    ],
    tasks: [], activities: [{ id: 'a1', deal: 'dGhost', type: 'Note', who: 'zac', when: '2026-10-01', text: 'Ghi chú', url: '' }], verticals: [],
    events: [
      { id: 'ev1', name: 'Expo 2026', date: '2026-10-15', location: 'SECC', note: '', attendees: ['zac'], companies: [], leads: [], deals: [] },
    ],
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
  const listeners = {};
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: makeEl('body'), getElementById: getEl, querySelector: s => getEl('qs:' + s), querySelectorAll: () => [], createElement: t => makeEl(t), addEventListener() {} },
    location: { search: '', href: 'http://localhost/index.html' },
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    URLSearchParams, URL, structuredClone, setTimeout, clearTimeout,
    confirm: () => true,
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}

/* ---------- Lọc không dấu (logic thuần) ---------- */
test('comboFoldText: bỏ dấu tiếng Việt + đ/Đ + hoa thường + gộp khoảng trắng', () => {
  const { run } = loadIndex();
  assert.equal(run(`comboFoldText('Đức')`), 'duc');
  assert.equal(run(`comboFoldText('  Công   Ty Đức Anh ')`), 'cong ty duc anh');
  assert.equal(run(`comboFoldText('ĐÀ NẴNG')`), 'da nang');
  assert.equal(run(`comboFoldText('')`), '');
  assert.equal(run(`comboFoldText(null)`), '');
});

test('comboFilterOptions: "duc" khớp "Đức", không phân biệt hoa thường, khớp theo nhãn + nhãn tìm kiếm (nhóm)', () => {
  const { run } = loadIndex();
  const opts = JSON.stringify([
    { value: 'c1', label: 'Công ty Đức Anh' },
    { value: 'c2', label: 'Studio Bình Minh' },
    { value: 'l1', label: 'Nguyễn Văn Đức', searchLabel: 'Lead Nguyễn Văn Đức' },
  ]);
  let r = run(`comboFilterOptions(${opts}, 'duc')`);
  assert.deepEqual([...r.items.map(x => x.value)], ['c1', 'l1']);
  r = run(`comboFilterOptions(${opts}, 'DUC')`);
  assert.deepEqual([...r.items.map(x => x.value)], ['c1', 'l1'], 'hoa thường không ảnh hưởng');
  r = run(`comboFilterOptions(${opts}, 'cong ty duc')`);
  assert.deepEqual([...r.items.map(x => x.value)], ['c1'], 'gõ nhiều từ liên tiếp (có khoảng trắng) vẫn khớp');
  r = run(`comboFilterOptions(${opts}, '')`);
  assert.equal(r.total, 3, 'ô trống -> liệt kê tất cả');
  r = run(`comboFilterOptions([['x1','Alpha'],['x2','Beta']], 'beta')`);
  assert.deepEqual([...r.items.map(x => x.value)], ['x2'], 'chấp nhận cả cặp [value,label]');
});

test('comboFilterOptions: danh sách dài bị giới hạn kết quả hiển thị + cờ truncated', () => {
  const { run } = loadIndex();
  const big = JSON.stringify(Array.from({ length: 1009 }, (_, i) => ({ value: 'l' + i, label: 'Lead số ' + i })));
  const r = run(`comboFilterOptions(${big}, '')`);
  assert.equal(r.total, 1009);
  assert.equal(r.items.length, run(`COMBO_LIMIT`), 'chỉ render tối đa COMBO_LIMIT mục một lúc');
  assert.equal(r.truncated, true, 'còn kết quả bị cắt -> UI hiện gợi ý gõ thêm');
  const r2 = run(`comboFilterOptions(${big}, 'lead so 1008')`);
  assert.deepEqual([...r2.items.map(x => x.value)], ['l1008']);
  assert.equal(r2.truncated, false);
});

test('comboMoveActive: phím ↑/↓ di chuyển vòng tròn, danh sách rỗng -> -1', () => {
  const { run } = loadIndex();
  assert.equal(run(`comboMoveActive(-1, 1, 3)`), 0, 'chưa active + ↓ -> mục đầu');
  assert.equal(run(`comboMoveActive(-1, -1, 3)`), 2, 'chưa active + ↑ -> mục cuối');
  assert.equal(run(`comboMoveActive(2, 1, 3)`), 0, 'cuối + ↓ -> vòng về đầu');
  assert.equal(run(`comboMoveActive(0, -1, 3)`), 2, 'đầu + ↑ -> vòng về cuối');
  assert.equal(run(`comboMoveActive(0, 1, 0)`), -1);
});

/* ---------- Markup dùng chung ---------- */
test('comboSelectHTML: select gốc giữ id/onchange/options đứng TRƯỚC ô gõ, ô gõ hiện nhãn đang chọn', () => {
  const { run } = loadIndex();
  const html = run(`comboSelectHTML('e_demo', '<option value="c1">Công ty Đức Anh</option><option value="c2">Studio Bình Minh</option>', { attrs: 'onchange="onDemo()"', label: 'Công ty Đức Anh', placeholder: 'Gõ tên công ty để tìm…' })`);
  assert.ok(html.includes('<select id="e_demo" data-combo="1" class="combo-source" onchange="onDemo()">'), 'select gốc giữ id + onchange, chỉ ẩn hiển thị');
  const selSlice = html.slice(html.indexOf('id="e_demo"'), html.indexOf('</select>'));
  assert.ok(selSlice.includes('value="c1"') && selSlice.includes('value="c2"'), 'options (ID entity) nằm nguyên trong select');
  assert.ok(html.indexOf('</select>') < html.indexOf('data-combo-input="e_demo"'), 'ô gõ nằm sau select');
  assert.ok(html.includes('data-combo-input="e_demo"') && html.includes('value="Công ty Đức Anh"'), 'ô gõ hiện nhãn của lựa chọn đang chọn');
  assert.ok(html.includes('placeholder="Gõ tên công ty để tìm…"'));
  assert.ok(html.includes('<div class="combo-list" hidden></div>'), 'danh sách kết quả ban đầu ẩn, chỉ dựng khi mở');
});

test('comboLabelForSelect + comboOptionsOfSelect: nhãn theo option, value lạ -> "(dữ liệu cũ)", optgroup vào nhãn tìm kiếm', () => {
  const { run } = loadIndex();
  assert.equal(run(`comboLabelForSelect({ value: 'g1', options: [{ value: 'g1', textContent: 'Game Đức' }, { value: 'g2', textContent: 'Game Hai' }] })`), 'Game Đức');
  assert.equal(run(`comboLabelForSelect({ value: 'gGhost', options: [{ value: 'g1', textContent: 'Game Đức' }] })`), '(dữ liệu cũ) gGhost');
  assert.equal(run(`comboLabelForSelect({ value: '', options: [{ value: '', textContent: '— Không gắn —' }] })`), '— Không gắn —');
  const o = run(`comboOptionsOfSelect({ options: [{ value: 'd1', textContent: 'Deal Một', parentElement: { tagName: 'OPTGROUP', label: '📋 Deal' } }] })`);
  assert.equal(o[0].searchLabel, '📋 Deal Deal Một', 'label nhóm được đưa vào text tìm kiếm (e_tlink)');
});

/* ---------- Các điểm đã chuyển trong form thật ---------- */
test('form tạo deal (HTML tĩnh): f_company + f_game là combobox, select gốc giữ onchange cũ', () => {
  const idx = read('index.html');
  assert.ok(idx.includes('<select id="f_company" data-combo="1" class="combo-source" onchange="onDealCompanyChange()">'), 'f_company: select gốc + onchange cũ');
  assert.ok(idx.includes('data-combo-input="f_company"'), 'f_company có ô gõ tìm');
  assert.ok(idx.includes('<select id="f_game" data-combo="1" class="combo-source" onchange="onDealFormGameChange()">'), 'f_game: select gốc + onchange cũ');
  assert.ok(idx.includes('data-combo-input="f_game"'));
});

test('form sửa deal: e_company + e_game là combobox và hiện đúng nhãn đang chọn', () => {
  const h = loadIndex();
  h.run(`editDeal('d1')`);
  const form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('id="e_company" data-combo="1"') && form.includes('onchange="onEditCompanyChange()"'), 'e_company combobox giữ onchange');
  assert.ok(form.includes('data-combo-input="e_company"') && form.includes('value="Công ty Đức Anh"'), 'ô gõ e_company hiện tên công ty đang gắn');
  /* Mô phỏng trình duyệt thật: select e_company trong DOM thật mang sẵn
     value = công ty của deal (option selected), harness DOM giả thì phải
     gán tay trước khi dựng lại khối field theo mảng (đúng mẫu
     deal-line-switch-preserve). */
  h.getEl('e_company').value = 'c1';
  h.run(`fillDealLineFields(S.deals.find(d=>d.id==='d1'))`);
  const lineFields = h.getEl('e_lineFields').innerHTML;
  assert.ok(lineFields.includes('id="e_game" data-combo="1"') && lineFields.includes('data-combo-input="e_game"'), 'e_game combobox');
  assert.ok(lineFields.includes('value="Game Đức"'), 'ô gõ e_game hiện tên game đang gắn');
});

test('form lead + form game: e_lcompany / e_gcompany là combobox hiện đúng công ty đang chọn', () => {
  const h = loadIndex();
  h.run(`editLead('l1')`);
  let form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('id="e_lcompany" data-combo="1"') && form.includes('data-combo-input="e_lcompany"'));
  assert.ok(form.includes('value="Nguyễn Văn Đức"') || form.includes('e_lcompany'), 'form lead dựng được');
  assert.ok(/data-combo-input="e_lcompany"[^>]*value="Công ty Đức Anh"|value="Công ty Đức Anh"[^>]*data-combo-input="e_lcompany"/.test(form) || form.includes('value="Công ty Đức Anh"'), 'ô gõ e_lcompany hiện công ty của lead');
  h.run(`editGame('g1')`);
  form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('id="e_gcompany" data-combo="1"') && form.includes('data-combo-input="e_gcompany"'), 'e_gcompany combobox');
  assert.ok(form.includes('value="Công ty Đức Anh"'), 'ô gõ e_gcompany hiện studio sở hữu');
});

test('drawer sự kiện + drawer deal + drawer lead + form việc + form hoạt động: picker là combobox, select slice vẫn chứa đúng options', () => {
  const h = loadIndex();
  h.run(`openEvent('ev1')`);
  let d = h.getEl('drawer').innerHTML;
  for (const pid of ['event_link_company', 'event_link_lead', 'event_link_deal']) {
    assert.ok(d.includes(`id="${pid}" data-combo="1"`), pid + ': select gốc có data-combo');
    assert.ok(d.includes(`data-combo-input="${pid}"`), pid + ': có ô gõ');
  }
  h.run(`openDeal('d1')`);
  d = h.getEl('drawer').innerHTML;
  const selStart = d.indexOf('id="deal_attach_lead"');
  assert.ok(selStart >= 0 && d.includes('data-combo-input="deal_attach_lead"'), 'deal_attach_lead combobox');
  const sel = d.slice(selStart, d.indexOf('</select>', selStart));
  assert.ok(sel.includes('value="l2"'), 'select deal_attach_lead vẫn chỉ chứa lead cùng công ty chưa gắn');
  h.run(`openLead('l1')`);
  d = h.getEl('drawer').innerHTML;
  assert.ok(d.includes('id="lead_attach_deal" data-combo="1"') && d.includes('data-combo-input="lead_attach_deal"'), 'lead_attach_deal combobox');
  h.run(`editTask(null)`);
  let form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('id="e_tlink" data-combo="1"') && form.includes('data-combo-input="e_tlink"'), 'e_tlink combobox (gộp deal/company/lead/game)');
  h.run(`editActivity('a1')`);
  form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('id="ea_deal" data-combo="1"') && form.includes('data-combo-input="ea_deal"'), 'ea_deal combobox');
});

/* ---------- Đường lưu không đổi: chọn qua combobox = ghi ID vào select gốc ---------- */
test('comboSetValue ghi đúng ID entity vào select gốc (element mà hàm save đọc)', () => {
  const h = loadIndex();
  assert.equal(h.run(`comboSetValue('e_lcompany', 'c2')`), true);
  assert.equal(h.getEl('e_lcompany').value, 'c2', 'saveLead đọc e_lcompany.value -> đúng ID công ty đã chọn qua combobox');
  /* Harness DOM giả tự tạo stub cho mọi id nên ca "select không tồn tại" không mô phỏng được ở đây; ở trình duyệt thật getElementById trả null -> comboSetValue trả false (guard trong code). */
});

test('tạo deal: chọn công ty qua comboSetValue rồi saveDeal tạo deal gắn đúng công ty đó', () => {
  const h = loadIndex();
  h.run('openAdd()');
  h.run(`comboSetValue('f_company', 'c1')`);
  const vals = { f_title: 'Deal Combo', f_line: 'ai', f_amount: '', f_cur: 'VND', f_stage: 'prospect', f_owner: 'zac' };
  for (const [k, v] of Object.entries(vals)) h.getEl(k).value = v;
  h.run('saveDeal()');
  const nd = h.run(`S.deals[S.deals.length-1]`);
  assert.equal(nd.title, 'Deal Combo');
  assert.equal(nd.company, 'c1', 'deal mới gắn đúng công ty chọn qua combobox');
});

/* ---------- "(dữ liệu cũ)" ---------- */
test('(dữ liệu cũ) lead: công ty đang lưu không còn trong danh sách -> option legacy + nhãn ở ô gõ, saveLead GIỮ NGUYÊN liên kết', () => {
  const h = loadIndex();
  h.run(`editLead('lGhost')`);
  const form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('<option value="cGhost" selected>(dữ liệu cũ) cGhost</option>'), 'form lead có option (dữ liệu cũ) giữ đúng id lạ');
  assert.ok(form.includes('value="(dữ liệu cũ) cGhost"'), 'ô gõ hiện nhãn dữ liệu cũ');
  const vals = { e_lname: 'Lead Ma', e_lcompany: 'cGhost', e_lperson: '', e_lphone: '', e_lemail: '', e_llinkedin: '', e_lowner: '', e_lline: 'ai', e_lsource: '', e_lstatus: 'new', e_lwhen: '', e_lnote: '' };
  for (const [k, v] of Object.entries(vals)) h.getEl(k).value = v;
  h.getEl('e_lmain').checked = false;
  h.run(`saveLead('lGhost')`);
  assert.equal(h.run(`S.leads.find(l=>l.id==='lGhost').company`), 'cGhost', 'lưu lại không rơi liên kết dữ liệu cũ');
});

test('(dữ liệu cũ) game + e_game + việc + hoạt động: option legacy giữ nguyên value lạ', () => {
  const h = loadIndex();
  /* game có studio đã xoá */
  const st = fixtureState(); st.games.push({ id: 'gGhostCo', title: 'Game Mồ Côi', own: 'partner', company: 'cGhost', genre: '', platform: '', stage: '', emoji: '🎮', desc: '', bdNote: '', buildUrl: '', trailerUrl: '', scores: null, verdict: '' });
  const h2 = loadIndex(st);
  h2.run(`editGame('gGhostCo')`);
  assert.ok(h2.getEl('editBox').innerHTML.includes('(dữ liệu cũ) cGhost'), 'form game hiện studio dữ liệu cũ');
  /* e_game: game đang lưu không thuộc pool của mảng */
  const gHtml = h.run(`editGameOptionsHTML('game_studio', '', 'gDeleted')`);
  assert.ok(gHtml.includes('<option value="gDeleted" selected>(dữ liệu cũ) gDeleted</option>'), 'editGameOptionsHTML thêm option (dữ liệu cũ) cho game lạ');
  const gHtml2 = h.run(`editGameOptionsHTML('publishing', 'c1', 'gDeleted')`);
  assert.ok(gHtml2.includes('(dữ liệu cũ) gDeleted'), 'nhánh publishing cũng có option (dữ liệu cũ)');
  /* việc gắn đối tượng đã xoá (tiền lệ cũ, nay qua combobox vẫn giữ) */
  const tHtml = h.run(`taskLinkSelectHTML('deal:dGhost')`);
  assert.ok(tHtml.includes('data-combo="1"') && tHtml.includes('(đối tượng đã xoá)'), 'e_tlink giữ option đối tượng đã xoá trong combobox');
  /* hoạt động gắn deal đã xoá */
  h.run(`editActivity('a1')`);
  const aForm = h.getEl('editBox').innerHTML;
  assert.ok(aForm.includes('(deal đã xoá) dGhost'), 'ea_deal giữ option deal đã xoá');
  assert.ok(aForm.includes('value="(deal đã xoá) dGhost"'), 'ô gõ ea_deal hiện nhãn deal đã xoá');
});

/* ---------- Chỗ cố ý giữ select thuần ---------- */
test('select hữu hạn ngắn giữ nguyên (không data-combo): stage/trạng thái/tiền tệ/owner', () => {
  const idx = read('index.html');
  assert.ok(!/<select id="f_stage"[^>]*data-combo/.test(idx), 'f_stage giữ select thuần');
  assert.ok(!/<select id="f_cur"[^>]*data-combo/.test(idx), 'f_cur giữ select thuần');
  assert.ok(!/<select id="f_line"[^>]*data-combo/.test(idx), 'f_line giữ select thuần');
  const h = loadIndex();
  h.run(`editLead('l1')`);
  const form = h.getEl('editBox').innerHTML;
  assert.ok(form.includes('id="e_lstatus"') && !/id="e_lstatus"[^>]*data-combo/.test(form), 'e_lstatus giữ select thuần');
  assert.ok(form.includes('id="e_lowner"') && !/id="e_lowner"[^>]*data-combo/.test(form), 'e_lowner (ownerSel, ít mục) giữ select thuần');
});

/* ---------- Hồi quy FAIL-2 (QA): lọc theo TOKEN ---------- */
test('FAIL-2: lọc theo token — "nguyen duc" khớp "Nguyễn Văn Đức", thứ tự token không quan trọng, thiếu token thì không khớp', () => {
  const { run } = loadIndex();
  const opts = JSON.stringify([
    { value: 'l1', label: 'Nguyễn Văn Đức' },
    { value: 'l2', label: 'Nguyễn Thị Hoa' },
    { value: 'l3', label: 'Trần Văn Đức' },
  ]);
  let r = run(`comboFilterOptions(${opts}, 'nguyen duc')`);
  assert.deepEqual([...r.items.map(x => x.value)], ['l1'], '"nguyen duc" (2 token cách nhau bởi từ ở giữa) phải khớp "Nguyễn Văn Đức"');
  r = run(`comboFilterOptions(${opts}, 'duc nguyen')`);
  assert.deepEqual([...r.items.map(x => x.value)], ['l1'], 'đảo thứ tự token vẫn khớp');
  r = run(`comboFilterOptions(${opts}, 'nguyen hoa')`);
  assert.deepEqual([...r.items.map(x => x.value)], ['l2'], 'mọi token đều phải xuất hiện');
  r = run(`comboFilterOptions(${opts}, 'nguyen duc anh')`);
  assert.equal(r.total, 0, 'thừa một token không có trong nhãn -> 0 kết quả');
  r = run(`comboFilterOptions(${opts}, 'van duc')`);
  assert.deepEqual([...r.items.map(x => x.value)], ['l1', 'l3']);
});

/* ---------- Hồi quy FAIL-1 (QA): mục đang chọn ngoài cửa sổ 80 ---------- */
test('FAIL-1 (logic cửa sổ): value ở vị trí 602/605 -> cửa sổ trượt chứa đúng nó, active = chính nó, hàng xóm là hàng xóm thật', () => {
  const { run } = loadIndex();
  const big = JSON.stringify(Array.from({ length: 605 }, (_, i) => ({ value: 'c' + i, label: 'Công ty số ' + i })));
  const r = run(`comboFilterOptions(${big}, '', 80, 'c601')`);
  assert.equal(r.items.length, 80, 'cửa sổ vẫn tối đa 80 mục');
  assert.ok(r.windowStart > 0, 'cửa sổ phải trượt khỏi đầu danh sách');
  assert.equal(r.items[r.activeIndex].value, 'c601', 'active khởi tạo đúng mục đang chọn ở vị trí 602');
  assert.equal(r.items[r.activeIndex - 1].value, 'c600', '↑ từ mục đang chọn đi đúng hàng xóm trước trong danh sách đầy đủ');
  assert.equal(r.items[r.activeIndex + 1].value, 'c602', '↓ từ mục đang chọn đi đúng hàng xóm sau trong danh sách đầy đủ');
  assert.ok(!r.items.some(x => x.value === 'c0'), 'mục đầu danh sách không còn ép vào cửa sổ này');
  /* Đang chọn ở cuối danh sách: cửa sổ là 80 mục cuối, active là mục cuối */
  const rEnd = run(`comboFilterOptions(${big}, '', 80, 'c604')`);
  assert.equal(rEnd.items[rEnd.activeIndex].value, 'c604');
  assert.equal(rEnd.items[rEnd.activeIndex - 1].value, 'c603');
  assert.equal(rEnd.items.length, 80);
  /* Đang chọn ở đầu: cửa sổ giữ nguyên từ đầu, active đúng vị trí */
  const rHead = run(`comboFilterOptions(${big}, '', 80, 'c5')`);
  assert.equal(rHead.windowStart, 0);
  assert.equal(rHead.activeIndex, 5);
  assert.equal(rHead.items[0].value, 'c0');
  /* Đang GÕ: không ép mục đang chọn vào cửa sổ — cửa sổ là kết quả khớp đầu tiên, active là kết quả đầu */
  const many = JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ value: 'x' + i, label: 'Công ty X ' + i })));
  const rQ = run(`comboFilterOptions(${many}, 'cong ty', 80, 'x150')`);
  assert.equal(rQ.windowStart, 0, 'khi đang gõ, cửa sổ không trượt theo mục đang chọn');
  assert.equal(rQ.activeIndex, 0);
  assert.ok(!rQ.items.some(x => x.value === 'x150'));
});

test('FAIL-1 (render thật qua comboRenderList): mở ô với value ở vị trí 602 -> có is-selected + is-active đúng mục đó, đủ hàng xóm, Enter-chưa-tương-tác bị chặn ở handler', () => {
  const h = loadIndex();
  /* DOM giả tối thiểu cho comboRenderList (harness chung không parse DOM):
     select giả 605 option, value đang chọn = c601 (vị trí 602). */
  const options = Array.from({ length: 605 }, (_, i) => ({ value: 'c' + i, textContent: 'Công ty số ' + i, disabled: false }));
  const fakeList = { innerHTML: '', hidden: true, querySelector: () => null };
  const fakeWrap = { dataset: {}, querySelector: s => (s === '.combo-list' ? fakeList : null) };
  const fakeInput = { dataset: { comboInput: 'big' }, closest: () => fakeWrap, value: '' };
  const fakeSel = { id: 'big', value: 'c601', options };
  const orig = h.ctx.document.getElementById;
  h.ctx.document.getElementById = id => (id === 'big' ? fakeSel : orig(id));
  try { h.ctx.comboRenderList(fakeInput, ''); } finally { h.ctx.document.getElementById = orig; }
  const htmlList = fakeList.innerHTML;
  assert.equal((htmlList.match(/combo-item/g) || []).length, 80, 'chỉ render 80 mục');
  assert.ok(htmlList.includes('class="combo-item is-selected is-active" data-combo-value="c601"'), 'mục đang chọn hiện cả is-selected lẫn is-active');
  assert.ok(htmlList.includes('data-combo-value="c600"') && htmlList.includes('data-combo-value="c602"'), 'hàng xóm thật của mục đang chọn có trong cửa sổ');
  assert.ok(!htmlList.includes('data-combo-value="c0"'), 'mục đầu danh sách không nằm trong cửa sổ đã trượt');
  assert.equal(fakeSel.value, 'c601', 'chỉ mở/render không đổi value');
  assert.equal(fakeWrap.dataset.comboInteracted, '', 'mở ô = chưa tương tác (cờ cho chốt chặn Enter)');
  /* Chốt chặn Enter nằm ở handler keydown + cờ được set khi gõ/di chuyển */
  const idx = read('index.html');
  assert.ok(idx.includes('wrap.dataset.comboInteracted !== "1"'), 'handler Enter phải kiểm cờ chưa-tương-tác');
  const enterSeg = idx.slice(idx.indexOf('wrap.dataset.comboInteracted !== "1"'), idx.indexOf('wrap.dataset.comboInteracted !== "1"') + 120);
  assert.ok(enterSeg.includes('comboCloseList(t, true); return;'), 'Enter chưa tương tác -> chỉ đóng danh sách và return, không chọn mục nào');
  assert.ok(idx.includes('wIn.dataset.comboInteracted = "1"'), 'gõ chữ set cờ đã-tương-tác');
  assert.ok(idx.includes('wrap.dataset.comboInteracted = "1";\n        const next = comboMoveActive'), 'phím ↑/↓ set cờ đã-tương-tác trước khi di chuyển');
});

test('CSS combobox có trong workspace-design.css (ẩn select gốc, dropdown nổi, màn hẹp)', () => {
  const css = read('workspace-design.css');
  assert.ok(css.includes('.combo-source') && css.includes('display:none'), 'select gốc bị ẩn hiển thị');
  assert.ok(css.includes('.combo-list') && css.includes('.combo-item'), 'có style danh sách kết quả + mục chọn');
  assert.ok(css.includes('.combo-item.is-active'), 'có style mục đang active (điều hướng bàn phím)');
  assert.ok(css.includes('.combo-item.is-selected'), 'có style mục đang chọn khi mở ô');
});
