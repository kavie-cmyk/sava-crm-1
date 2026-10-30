/* Sửa lỗi mất dữ liệu khi ĐỔI MẢNG deal trong form sửa (sau commit e0f98fb
   cho vertical): mẫu `same ? <đã lưu> : ""` trong fillDealLineFields từng
   áp cho amount / cur / game / custom fields — mở form sửa, đổi mảng rồi
   lưu mà không nhập lại là các trường đó bị ghi rỗng/0/reset, và
   saveEditDeal còn delete hẳn amount/cur/game + thay trắng d.custom ở
   mảng đích. Nguyên tắc sửa (theo tiền lệ vertical):
   - fillDealLineFields luôn khôi phục giá trị ĐÃ LƯU của deal cho
     amount/cur/custom bất kể mảng gốc; game chỉ chọn sẵn khi thuộc pool
     của mảng đích (ours cho Game Studio, partner + đúng công ty cho
     Publishing) dựa trên dealDraftGame khởi tạo từ d.game.
   - saveEditDeal GỘP custom vào custom cũ (field của mảng khác giữ ẩn),
     KHÔNG delete amount/cur khi sang mảng game, KHÔNG delete game khi
     sang mảng phi-game hoặc khi đổi mảng game->game mà chưa chọn game
     mới; chỉ delete game khi mảng KHÔNG đổi và người dùng tự chọn
     "— Không gắn game —" (gỡ liên kết có chủ đích).
   - Stage là NGOẠI LỆ THIẾT KẾ: bộ stage là từ vựng riêng từng mảng,
     đổi mảng = về stage đầu của pipeline đích (test khoá cả hành vi này).
   - dealVisibleGame: liên kết game giữ ẩn KHÔNG hiển thị ở mảng không
     khớp pool (thẻ board, drawer, danh sách deal của game). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const readF = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = readF('index.html');

function section(src, startNeedle, endNeedle) {
  const a = src.indexOf(startNeedle);
  assert.ok(a >= 0, 'thiếu điểm bắt đầu: ' + startNeedle);
  const b = src.indexOf(endNeedle, a + startNeedle.length);
  assert.ok(b > a, 'thiếu điểm kết thúc: ' + endNeedle);
  return src.slice(a, b);
}

test('cú pháp: mọi script inline của index.html đều parse được', () => {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
  blocks.forEach((code, i) => {
    const bf = path.join(os.tmpdir(), `sava-lineswitch-${process.pid}-${i}.js`);
    fs.writeFileSync(bf, code);
    try { execFileSync(process.execPath, ['--check', bf], { stdio: 'pipe' }); } finally { fs.unlinkSync(bf); }
  });
});

test('tĩnh: fill/save không còn mẫu same ? "" cho amount/cur/custom và không còn delete vô điều kiện', () => {
  const fill = section(html, 'function fillDealLineFields', 'function saveEditDeal');
  assert.ok(!fill.includes('same ? (d.amount'), 'fill amount không được ép rỗng theo line gốc');
  assert.ok(!fill.includes('same ? d.cur'), 'fill cur không được reset theo line gốc');
  assert.ok(!fill.includes('same ? (d.custom'), 'fill custom không được dựng từ {} theo line gốc');
  assert.ok(fill.includes('d ? (d.amount ?? "") : ""'), 'fill amount phải khôi phục từ deal đã lưu');
  assert.ok(fill.includes('d ? (d.cur || "VND") : "VND"'), 'fill cur phải khôi phục từ deal đã lưu');
  assert.ok(fill.includes('cfFieldHTML(line, k, lb, d ? (d.custom || {}) : {})'), 'fill custom phải dựng từ d.custom đã lưu');
  const save = section(html, 'function saveEditDeal', 'function performDeleteDeal');
  assert.ok(!save.includes('delete d.amount'), 'save không được delete amount khi sang mảng game');
  assert.ok(!save.includes('delete d.cur;'), 'save không được delete cur khi sang mảng game');
  assert.ok(save.includes('const newCustom = { ...oldCustom };'), 'save custom phải gộp vào custom cũ, không thay trắng');
  assert.ok(save.includes('else if (line === origLine) delete d.game;'), 'chỉ delete game khi mảng không đổi (gỡ liên kết có chủ đích)');
  assert.ok(html.includes('function dealVisibleGame'), 'phải có helper ẩn hiển thị game giữ trong dữ liệu');
  const board = section(html, 'function vBoard()', 'let dragId');
  assert.ok(board.includes('dealVisibleGame(d)'), 'thẻ board phải dùng dealVisibleGame');
  const drawer = section(html, 'function openDeal', 'function moveStage');
  assert.ok(drawer.includes('dealVisibleGame(d)'), 'drawer deal phải dùng dealVisibleGame');
});

/* ---------- Harness vm: nạp index.html THẬT (như metaverse-vertical) ---------- */
function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'linh', name: 'Linh', role: 'BD', active: true }],
    companies: [
      { id: 'cm1', name: 'Client Corp', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng', metaverse: 'Khách hàng', publishing: 'Game studio' }, contact: 'An', phone: '', last: 'Hôm nay' },
      { id: 'cp1', name: 'Publisher Co', type: 'Publisher', roles: { game_studio: 'Publisher' }, contact: 'Bình', phone: '', last: 'Hôm nay' },
    ],
    games: [
      { id: 'gour1', title: 'Sava Game One', own: 'ours', genre: '', platform: '', stage: '', emoji: '🎮', desc: '' },
      { id: 'gpar1', title: 'Partner Game One', own: 'partner', company: 'cm1', genre: '', platform: '', stage: '', emoji: '🎮', desc: '', scores: null, verdict: 'Đang chấm' },
    ],
    deals: [
      { id: 'da1', line: 'ai', title: 'AI Deal', company: 'cm1', stage: 'poc', owner: 'zac', due: '', idle: 0, amount: 500, cur: 'USD',
        custom: { use_case: 'Chatbot/GenAI', data_readiness: 'Sẵn sàng', current_systems: 'CRM nội bộ, Website', poc_scope: 'POC cho 2 chi nhánh', poc_result: 'Đạt' } },
      { id: 'dm1', line: 'metaverse', title: 'Meta Deal', company: 'cm1', stage: 'concept', owner: 'zac', due: '', idle: 0, amount: 700, cur: 'USD', vertical: 'Giáo dục',
        custom: { use_case: 'Tour 360', platform_target: 'Web, VR headset', expected_users: '50', hardware_needed: 'Kính VR', concept_url: 'https://example.com/concept' } },
      { id: 'dgs1', line: 'game_studio', title: 'GS Deal', company: 'cp1', stage: 'pitched', owner: 'zac', due: '', idle: 0, game: 'gour1',
        custom: { publisher_regions: 'NA (Bắc Mỹ), EU', build_version_sent: 'Build v1.2' },
        term: { rev_share: 'Sava 30% / Partner 70%', advance: '—', territories: '', duration: '', exclusivity: '', marketing: '', payment: '' },
        contract: { status: 'Chưa có HĐ', no: '', signed: '', url: '' } },
      { id: 'dp1', line: 'publishing', title: 'Pub Deal', company: 'cm1', stage: 'screening', owner: 'zac', due: '', idle: 0, game: 'gpar1',
        custom: { support_needed: 'Marketing/UA, QA', planned_investment: '1000', planned_investment_cur: 'USD' } },
      { id: 'dp2', line: 'publishing', title: 'Pub Deal Text', company: 'cm1', stage: 'screening', owner: 'zac', due: '', idle: 0, game: 'gpar1',
        custom: { support_needed: '', planned_investment: '', planned_investment_text: 'Khoảng 2 tỷ (thoả thuận miệng)' } },
    ],
    leads: [], tasks: [], activities: [], verticals: [],
  }));
  const makeEl = id => ({ id: id || '', innerHTML: '', textContent: '', value: '', checked: false, style: {}, dataset: {}, children: [], options: [], _checkedItems: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, click() {},
    querySelector: () => makeEl(), querySelectorAll() { return this._checkedItems; }, closest: () => null });
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

/* Mô phỏng trình duyệt thật: mở form sửa, gán e_company theo deal (select
   dựng sẵn giá trị đó ở trình duyệt; stub DOM không tự suy value). */
function openEdit(h, id) {
  h.run(`editDeal('${id}')`);
  const d = h.run(`S.deals.find(d=>d.id==='${id}')`);
  h.getEl('e_line').value = d.line || '';
  h.getEl('e_company').value = d.company || '';
  h.getEl('e_title').value = d.title;
  h.getEl('e_owner').value = d.owner || 'zac';
  h.getEl('e_due').value = d.due || '';
  return d;
}
/* Đổi mảng ĐÚNG đường sự kiện change của form (dealDraftLine + fill). */
function switchLine(h, id, line) {
  h.run(`dealDraftLine = "${line}"; fillDealLineFields(S.deals.find(d => d.id === "${id}"));`);
  h.getEl('e_line').value = line;
}
function deal(h, id) { return h.run(`S.deals.find(d=>d.id==='${id}')`); }

test('AI -> Metaverse, lưu không đụng trường nào: amount 500 + cur USD còn nguyên, custom AI giữ ẩn, use_case chung hiện (dữ liệu cũ) và sống sót; stage reset theo thiết kế', () => {
  const h = loadIndex();
  openEdit(h, 'da1');
  switchLine(h, 'da1', 'metaverse');
  const fieldsHtml = h.getEl('e_lineFields').innerHTML;
  assert.ok(fieldsHtml.includes('value="500"'), 'fill Metaverse phải khôi phục amount đã lưu của deal AI');
  assert.ok(fieldsHtml.includes('value="USD" selected'), 'fill Metaverse phải chọn sẵn cur USD đã lưu');
  assert.ok(fieldsHtml.includes('(dữ liệu cũ) Chatbot/GenAI'), 'use_case AI phải hiện (dữ liệu cũ) trong form Metaverse');
  /* Giá trị trình duyệt sẽ gửi khi người dùng KHÔNG đụng trường nào: */
  h.getEl('e_stage').value = 'prospect'; /* stage reset về đầu pipeline đích (thiết kế) */
  h.getEl('e_amount').value = '500'; h.getEl('e_cur').value = 'USD';
  h.getEl('e_vertical').value = '';
  h.getEl('e_cf_use_case').value = 'Chatbot/GenAI';
  h.getEl('e_cf_expected_users').value = ''; h.getEl('e_cf_concept_url').value = '';
  h.run("saveEditDeal('da1')");
  const d = deal(h, 'da1');
  assert.equal(d.line, 'metaverse');
  assert.equal(d.amount, 500, 'amount KHÔNG được bị ghi về 0');
  assert.equal(d.cur, 'USD', 'cur KHÔNG được reset về VND');
  assert.equal(d.stage, 'prospect', 'stage reset về stage đầu của mảng đích là THIẾT KẾ (từ vựng stage riêng từng mảng)');
  assert.equal(d.custom.use_case, 'Chatbot/GenAI');
  assert.equal(d.custom.data_readiness, 'Sẵn sàng', 'custom chỉ thuộc AI phải giữ ẩn trong dữ liệu');
  assert.equal(d.custom.poc_scope, 'POC cho 2 chi nhánh');
  assert.equal(d.custom.poc_result, 'Đạt');
  assert.equal(d.custom.current_systems, 'CRM nội bộ, Website');
  /* Đổi ngược về AI trong một lần sửa mới: mọi custom AI hiện lại đúng. */
  openEdit(h, 'da1');
  switchLine(h, 'da1', 'ai');
  const back = h.getEl('e_lineFields').innerHTML;
  assert.ok(back.includes('value="500"') && back.includes('value="USD" selected'), 'quay về AI phải thấy lại amount/cur');
  assert.ok(back.includes('value="Sẵn sàng" selected'), 'quay về AI phải chọn sẵn data_readiness đã lưu');
  assert.ok(back.includes('value="Đạt" selected'), 'quay về AI phải chọn sẵn poc_result đã lưu');
  h.getEl('e_stage').value = 'prospect'; h.getEl('e_amount').value = '500'; h.getEl('e_cur').value = 'USD';
  h.getEl('e_cf_use_case').value = 'Chatbot/GenAI'; h.getEl('e_cf_data_readiness').value = 'Sẵn sàng';
  h.getEl('e_cf_current_systems')._checkedItems = [{ value: 'CRM nội bộ' }, { value: 'Website' }];
  h.getEl('e_cf_poc_scope').value = 'POC cho 2 chi nhánh'; h.getEl('e_cf_poc_result').value = 'Đạt';
  h.run("saveEditDeal('da1')");
  const d2 = deal(h, 'da1');
  assert.equal(d2.line, 'ai'); assert.equal(d2.amount, 500); assert.equal(d2.cur, 'USD');
  assert.equal(d2.custom.current_systems, 'CRM nội bộ, Website');
  assert.equal(d2.custom.platform_target, '', 'field thuộc mảng đích (Metaverse) hiện trống trong form thì lưu trống là đúng — nó thuộc mảng đích, không phải dữ liệu ẩn của mảng khác');
});

test('Metaverse -> AI, lưu không đụng: amount/cur giữ nguyên, vertical + custom Metaverse giữ ẩn', () => {
  const h = loadIndex();
  openEdit(h, 'dm1');
  switchLine(h, 'dm1', 'ai');
  const fieldsHtml = h.getEl('e_lineFields').innerHTML;
  assert.ok(fieldsHtml.includes('value="700"'), 'fill AI phải khôi phục amount của deal Metaverse');
  assert.ok(fieldsHtml.includes('value="USD" selected'));
  assert.ok(fieldsHtml.includes('(dữ liệu cũ) Tour 360'), 'use_case Metaverse phải hiện (dữ liệu cũ) trong form AI');
  h.getEl('e_stage').value = 'prospect'; h.getEl('e_amount').value = '700'; h.getEl('e_cur').value = 'USD';
  h.getEl('e_cf_use_case').value = 'Tour 360'; h.getEl('e_cf_data_readiness').value = '';
  h.getEl('e_cf_poc_scope').value = ''; h.getEl('e_cf_poc_result').value = '';
  h.run("saveEditDeal('dm1')");
  const d = deal(h, 'dm1');
  assert.equal(d.line, 'ai'); assert.equal(d.amount, 700); assert.equal(d.cur, 'USD');
  assert.equal(d.vertical, 'Giáo dục', 'vertical vẫn giữ ẩn khi rời Metaverse (tiền lệ cũ)');
  assert.equal(d.custom.platform_target, 'Web, VR headset', 'custom Metaverse phải giữ ẩn');
  assert.equal(d.custom.expected_users, '50');
  assert.equal(d.custom.hardware_needed, 'Kính VR');
  assert.equal(d.custom.concept_url, 'https://example.com/concept');
  assert.equal(d.custom.use_case, 'Tour 360');
});

test('AI -> Game Studio (lưu) -> AI (lưu): amount/cur giữ ẩn ở mảng game, quay lại khôi phục; pipelineValue không tính amount ẩn của deal game', () => {
  const h = loadIndex();
  openEdit(h, 'da1');
  switchLine(h, 'da1', 'game_studio');
  h.getEl('e_stage').value = 'target'; h.getEl('e_game').value = ''; /* trình duyệt: "— Không gắn game —" */
  h.getEl('e_cf_build_version_sent').value = '';
  h.run("saveEditDeal('da1')");
  let d = deal(h, 'da1');
  assert.equal(d.line, 'game_studio');
  assert.equal(d.amount, 500, 'amount phải GIỮ ẨN trong dữ liệu khi deal sang mảng game (không delete)');
  assert.equal(d.cur, 'USD', 'cur phải GIỮ ẨN trong dữ liệu khi deal sang mảng game');
  assert.equal(d.term && d.term.rev_share, 'Chưa đề xuất', 'deal game vẫn được khởi tạo term như cũ');
  assert.equal(h.run("pipelineValue(S.deals.filter(x=>x.id==='da1'))"), '0', 'amount ẩn của deal game không được tính vào giá trị pipeline');
  openEdit(h, 'da1');
  switchLine(h, 'da1', 'ai');
  const back = h.getEl('e_lineFields').innerHTML;
  assert.ok(back.includes('value="500"') && back.includes('value="USD" selected'), 'quay về AI phải khôi phục amount/cur đã giữ ẩn');
  h.getEl('e_stage').value = 'prospect'; h.getEl('e_amount').value = '500'; h.getEl('e_cur').value = 'USD';
  h.getEl('e_cf_use_case').value = 'Chatbot/GenAI'; h.getEl('e_cf_data_readiness').value = 'Sẵn sàng';
  h.getEl('e_cf_current_systems')._checkedItems = [{ value: 'CRM nội bộ' }, { value: 'Website' }];
  h.getEl('e_cf_poc_scope').value = 'POC cho 2 chi nhánh'; h.getEl('e_cf_poc_result').value = 'Đạt';
  h.run("saveEditDeal('da1')");
  d = deal(h, 'da1');
  assert.equal(d.line, 'ai'); assert.equal(d.amount, 500); assert.equal(d.cur, 'USD');
});

test('Game Studio -> AI (lưu) -> Game Studio (lưu): liên kết game + custom + term giữ ẩn, quay lại khôi phục đúng game', () => {
  const h = loadIndex();
  openEdit(h, 'dgs1');
  switchLine(h, 'dgs1', 'ai');
  h.getEl('e_stage').value = 'prospect'; h.getEl('e_amount').value = ''; h.getEl('e_cur').value = 'VND';
  h.getEl('e_cf_use_case').value = ''; h.getEl('e_cf_data_readiness').value = '';
  h.getEl('e_cf_poc_scope').value = ''; h.getEl('e_cf_poc_result').value = '';
  h.run("saveEditDeal('dgs1')");
  let d = deal(h, 'dgs1');
  assert.equal(d.line, 'ai');
  assert.equal(d.game, 'gour1', 'liên kết game phải GIỮ ẨN khi deal sang mảng phi-game (không delete)');
  assert.equal(h.run("dealVisibleGame(S.deals.find(x=>x.id==='dgs1'))"), null, 'game giữ ẩn không được hiển thị ở mảng AI');
  assert.equal(d.custom.publisher_regions, 'NA (Bắc Mỹ), EU', 'custom Game Studio phải giữ ẩn');
  assert.equal(d.custom.build_version_sent, 'Build v1.2');
  assert.equal(d.term.rev_share, 'Sava 30% / Partner 70%', 'term của deal game giữ nguyên khi sang mảng khác');
  openEdit(h, 'dgs1');
  switchLine(h, 'dgs1', 'game_studio');
  const back = h.getEl('e_lineFields').innerHTML;
  assert.ok(back.includes('value="gour1" selected'), 'quay về Game Studio phải chọn sẵn lại đúng game đã giữ ẩn');
  assert.ok(back.includes('value="NA (Bắc Mỹ)" checked'), 'custom multi phải tick lại đúng giá trị đã lưu');
  h.getEl('e_stage').value = 'target'; h.getEl('e_game').value = 'gour1';
  h.getEl('e_cf_publisher_regions')._checkedItems = [{ value: 'NA (Bắc Mỹ)' }, { value: 'EU' }];
  h.getEl('e_cf_build_version_sent').value = 'Build v1.2';
  h.run("saveEditDeal('dgs1')");
  d = deal(h, 'dgs1');
  assert.equal(d.line, 'game_studio'); assert.equal(d.game, 'gour1');
  assert.equal(d.custom.publisher_regions, 'NA (Bắc Mỹ), EU');
});

test('Game Studio cùng mảng: người dùng CHỦ ĐỘNG chọn "— Không gắn game —" thì liên kết bị gỡ (phân biệt xoá có chủ đích)', () => {
  const h = loadIndex();
  openEdit(h, 'dgs1');
  h.run("onEditGameChange('')"); /* đúng thao tác chọn lại ô game trong form */
  h.getEl('e_game').value = '';
  h.getEl('e_stage').value = 'pitched';
  h.getEl('e_cf_publisher_regions')._checkedItems = [{ value: 'NA (Bắc Mỹ)' }, { value: 'EU' }];
  h.getEl('e_cf_build_version_sent').value = 'Build v1.2';
  h.run("saveEditDeal('dgs1')");
  const d = deal(h, 'dgs1');
  assert.equal(d.line, 'game_studio');
  assert.equal('game' in d, false, 'gỡ liên kết có chủ đích ở cùng mảng phải được tôn trọng');
});

test('Publishing -> Game Studio (lưu) -> Publishing (lưu): game đối tác giữ ẩn dù không thuộc pool Game Studio, quay lại khôi phục; planned_investment giữ nguyên cả tiền tệ phụ', () => {
  const h = loadIndex();
  openEdit(h, 'dp1');
  switchLine(h, 'dp1', 'game_studio');
  const gsHtml = h.getEl('e_lineFields').innerHTML;
  assert.ok(!gsHtml.includes('value="gpar1" selected'), 'game đối tác không thuộc pool Game Studio nên không chọn sẵn được');
  h.getEl('e_stage').value = 'target'; h.getEl('e_game').value = '';
  h.getEl('e_cf_build_version_sent').value = '';
  h.run("saveEditDeal('dp1')");
  let d = deal(h, 'dp1');
  assert.equal(d.line, 'game_studio');
  assert.equal(d.game, 'gpar1', 'chưa chọn game mới ở mảng đích thì liên kết cũ phải GIỮ ẨN, không mất');
  assert.equal(h.run("dealVisibleGame(S.deals.find(x=>x.id==='dp1'))"), null, 'game đối tác không hiển thị ở mảng Game Studio');
  assert.equal(d.custom.planned_investment, '1000', 'custom Publishing phải giữ ẩn');
  assert.equal(d.custom.planned_investment_cur, 'USD');
  assert.equal(d.custom.support_needed, 'Marketing/UA, QA');
  openEdit(h, 'dp1');
  switchLine(h, 'dp1', 'publishing');
  const back = h.getEl('e_lineFields').innerHTML;
  assert.ok(back.includes('value="gpar1" selected'), 'quay về Publishing (đúng công ty) phải chọn sẵn lại game đã giữ ẩn');
  assert.ok(back.includes('value="1000"'), 'planned_investment phải hiện lại số đã lưu');
  h.getEl('e_stage').value = 'sourcing'; h.getEl('e_game').value = 'gpar1';
  h.getEl('e_cf_support_needed')._checkedItems = [{ value: 'Marketing/UA' }, { value: 'QA' }];
  h.getEl('e_cf_planned_investment').value = '1000'; h.getEl('e_cf_planned_investment_cur').value = 'USD';
  h.run("saveEditDeal('dp1')");
  d = deal(h, 'dp1');
  assert.equal(d.line, 'publishing'); assert.equal(d.game, 'gpar1');
  assert.equal(d.custom.planned_investment, '1000'); assert.equal(d.custom.planned_investment_cur, 'USD');
  assert.equal(d.custom.support_needed, 'Marketing/UA, QA');
});

test('người dùng CHỦ ĐỘNG xoá/đổi ở cùng mảng được tôn trọng: xoá amount -> 0, đổi cur -> VND, xoá custom select -> rỗng, đổi amount -> giá trị mới; stage cùng mảng giữ nguyên', () => {
  const h = loadIndex();
  openEdit(h, 'da1');
  h.getEl('e_stage').value = 'poc';
  h.getEl('e_amount').value = ''; /* xoá trắng có chủ đích */
  h.getEl('e_cur').value = 'VND';
  h.getEl('e_cf_use_case').value = 'Chatbot/GenAI'; h.getEl('e_cf_data_readiness').value = ''; /* xoá có chủ đích */
  h.getEl('e_cf_current_systems')._checkedItems = [{ value: 'CRM nội bộ' }, { value: 'Website' }];
  h.getEl('e_cf_poc_scope').value = 'POC cho 2 chi nhánh'; h.getEl('e_cf_poc_result').value = 'Đạt';
  h.run("saveEditDeal('da1')");
  let d = deal(h, 'da1');
  assert.equal(d.amount, 0, 'xoá trắng amount ở form phải ra 0 như cơ chế cũ');
  assert.equal(d.cur, 'VND');
  assert.equal(d.custom.data_readiness, '', 'xoá custom ở form phải được tôn trọng');
  assert.equal(d.stage, 'poc', 'không đổi mảng thì stage giữ nguyên');
  openEdit(h, 'da1');
  h.getEl('e_stage').value = 'poc'; h.getEl('e_amount').value = '999'; h.getEl('e_cur').value = 'USD';
  h.getEl('e_cf_use_case').value = 'Chatbot/GenAI'; h.getEl('e_cf_data_readiness').value = 'Một phần';
  h.getEl('e_cf_current_systems')._checkedItems = [{ value: 'CRM nội bộ' }, { value: 'Website' }];
  h.getEl('e_cf_poc_scope').value = 'POC cho 2 chi nhánh'; h.getEl('e_cf_poc_result').value = 'Đạt';
  h.run("saveEditDeal('da1')");
  d = deal(h, 'da1');
  assert.equal(d.amount, 999, 'đổi amount có chủ đích phải lưu giá trị mới');
  assert.equal(d.custom.data_readiness, 'Một phần');
});

test('custom money: dữ liệu chữ cũ (planned_investment_text) sống sót khi lưu không đụng; nhập số mới thì text cũ bị thay hẳn, không kẹt lại', () => {
  const h = loadIndex();
  openEdit(h, 'dp2');
  const fieldsHtml = h.getEl('e_lineFields').innerHTML;
  assert.ok(fieldsHtml.includes('(dữ liệu cũ) Khoảng 2 tỷ (thoả thuận miệng)'), 'form phải hiện ghi chú dữ liệu chữ cũ của planned_investment');
  h.getEl('e_stage').value = 'screening'; h.getEl('e_game').value = 'gpar1';
  h.getEl('e_cf_planned_investment').value = ''; h.getEl('e_cf_planned_investment_cur').value = 'VND';
  h.run("saveEditDeal('dp2')");
  let d = deal(h, 'dp2');
  assert.equal(d.custom.planned_investment_text, 'Khoảng 2 tỷ (thoả thuận miệng)', 'lưu không đụng phải giữ nguyên text cũ');
  assert.equal(d.custom.planned_investment, '');
  openEdit(h, 'dp2');
  h.getEl('e_stage').value = 'screening'; h.getEl('e_game').value = 'gpar1';
  h.getEl('e_cf_planned_investment').value = '2000'; h.getEl('e_cf_planned_investment_cur').value = 'USD';
  h.run("saveEditDeal('dp2')");
  d = deal(h, 'dp2');
  assert.equal(d.custom.planned_investment, '2000');
  assert.equal(d.custom.planned_investment_cur, 'USD');
  assert.equal('planned_investment_text' in d.custom, false, 'đã nhập số mới thì text cũ phải bị thay hẳn (cfDisplay ưu tiên text)');
});
