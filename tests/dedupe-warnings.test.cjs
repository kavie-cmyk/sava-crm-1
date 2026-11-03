/* Cảnh báo trùng công ty — Phần 2 (form công ty + xem trước Import):
   - Nối API THẬT SavaDedupe (Phần 1, dedupe.js ở root repo — branch
     feat/dedupe-core, gộp vào khi tích hợp): matchCompanies với reasons
     [{kind:'website'|'linkedin'|'nameKey'|'nameSimilarity', value}] và
     percent đã làm tròn ở similar. Khi dedupe.js CHƯA có trong cây làm
     việc (chạy branch Phần 2 độc lập trước khi gộp), các test phụ thuộc
     API thật được skip (đúng tiền lệ skip SheetJS của import-xlsx) —
     KHÔNG dùng stub SavaDedupe nào cả.
   - Form (index.html): editCompany/saveCompany (scope "form", ô e_cname +
     e_cp_website/e_cp_linkedinUrl — website/linkedinUrl là 2 key trong
     COMPANY_PROFILE_FIELDS, lưu phẳng trên object công ty) và khối hồ sơ
     drawer persistCompanyProfile (scope "profile", ô cp_*).
     EXACT -> cảnh báo "Đã có công ty này" + [Xem công ty đó]; bấm Lưu hỏi
     confirm thêm một lần, từ chối = không lưu. SIMILAR -> "Có công ty
     tương tự" + % + lý do + [Xem công ty tương tự] / [Tiếp tục nhập công
     ty mới]; không chặn lưu. Sửa: excludeId chính nó + chỉ cảnh báo khi
     giá trị đã đổi so với lúc mở form.
   - Import (shared.js SavaImport.planImport + impPreviewHTML): thứ tự
     khớp (1) website chuẩn hoá, (2) nameKey, (3) tên giống >70% (chỉ
     cảnh báo, vẫn tạo mới); ứng viên khớp/giống được nêu trong xem trước. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const HAS_DEDUPE = fs.existsSync(path.join(__dirname, '..', 'dedupe.js'));
const SKIP_NO_DEDUPE = !HAS_DEDUPE && 'chưa có dedupe.js (Phần 1) trong cây làm việc — chạy lại sau khi gộp feat/dedupe-core';

/* ---------- Tĩnh ---------- */
test('tĩnh: index.html nạp dedupe.js NGAY SAU shared.js; form có vùng cảnh báo + hook debounce; CSS có 2 tông cảnh báo', () => {
  const iShared = html.indexOf('<script src="shared.js"></script>');
  const iDedupe = html.indexOf('<script src="dedupe.js"></script>');
  assert.ok(iShared >= 0 && iDedupe > iShared, 'dedupe.js phải được nạp sau shared.js');
  assert.ok(iDedupe < html.indexOf('<script src="audit.js">'), 'dedupe.js phải nạp trước các script dùng nó');
  assert.ok(html.includes('id="e_company_dedupe_warn"'), 'form công ty thiếu vùng cảnh báo trùng');
  assert.ok(html.includes('id="cp_dedupe_warn"'), 'khối hồ sơ drawer thiếu vùng cảnh báo trùng');
  assert.ok(html.includes(`oninput="scheduleCompanyDedupeCheck('form')"`), 'ô tên công ty thiếu hook kiểm tra khi gõ');
  assert.ok(html.includes('scheduleCompanyDedupeCheck('), 'thiếu hàm lên lịch kiểm tra debounce');
  const css = read('workspace-design.css');
  assert.ok(css.includes('.dedupe-alert-exact') && css.includes('.dedupe-alert-similar'), 'CSS thiếu tông cảnh báo exact/similar');
});

test('tĩnh: saveCompany không còn chặn cứng trùng tên kiểu cũ, thay bằng chốt confirm của Phần 2', () => {
  const saveCo = html.slice(html.indexOf('function saveCompany'), html.indexOf('function deleteCompany'));
  assert.ok(saveCo.includes('companyDedupeConfirmOnSave("form")'), 'saveCompany phải chốt kiểm tra trùng khi bấm Lưu');
  assert.ok(!saveCo.includes('Tên công ty đã tồn tại'), 'không còn toast chặn cứng trùng tên');
  const persist = html.slice(html.indexOf('function persistCompanyProfile'), html.indexOf('function openCompany'));
  assert.ok(persist.includes('companyDedupeConfirmOnSave("profile")'), 'lưu hồ sơ từ drawer phải chốt kiểm tra trùng');
});

test('SavaDedupe (Phần 1): đủ API hợp đồng + ngưỡng 0.70', { skip: SKIP_NO_DEDUPE }, () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  vm.runInContext(read('dedupe.js'), ctx, { filename: 'dedupe.js' });
  const D = ctx.window.SavaDedupe;
  assert.ok(D, 'dedupe.js phải phơi window.SavaDedupe');
  for (const fn of ['normalizeWebsite', 'normalizeLinkedIn', 'normalizeName', 'nameKey', 'nameSimilarity', 'matchCompanies']) {
    assert.equal(typeof D[fn], 'function', 'thiếu API ' + fn);
  }
  assert.equal(D.SIMILARITY_THRESHOLD, 0.70);
  assert.equal(D.normalizeWebsite('https://www.alpha.vn/about'), 'alpha.vn');
});

/* ---------- Harness index.html (DOM giả, confirm điều khiển được) ---------- */
function fixtureState() {
  return {
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [
      { id: 'c1', name: 'Alpha Games', type: 'Doanh nghiệp', roles: {}, last: 'Hôm nay', website: 'https://www.alpha.vn/about', linkedinUrl: 'https://www.linkedin.com/company/alpha-games/' },
      { id: 'c2', name: 'Beta Studio', type: 'Doanh nghiệp', roles: {}, last: 'Hôm qua', website: 'beta.vn' },
    ],
    games: [], deals: [], leads: [], tasks: [], activities: [], events: [], verticals: [],
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
    crypto: require('node:crypto').webcrypto });
  ctx.window = ctx;
  ctx.__confirmResult = true;
  ctx.__confirmCalls = [];
  ctx.confirm = msg => { ctx.__confirmCalls.push(String(msg)); return ctx.__confirmResult; };
  const files = ['apple-ui.js', 'shared.js'];
  if (HAS_DEDUPE) files.push('dedupe.js');
  files.push('publishing-score.js', 'publishing-bridge.js');
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx),
    setConfirm: v => { ctx.__confirmResult = v; }, confirmCalls: () => ctx.__confirmCalls.slice() };
}
/* Điền bộ ô hồ sơ của form công ty như người dùng gõ (harness không tự
   điền value từ HTML). */
function setFormProfile(getEl, values) {
  const KEYS = ['location', 'establishedYear', 'size', 'employees', 'industry', 'website', 'linkedinUrl', 'parentCompany', 'parentWebsite', 'suborgCount', 'suborgDomains', 'suborgNames', 'buyingSignals', 'vertical', 'savaOffering', 'bizModel', 'priority'];
  for (const k of KEYS) getEl('e_cp_' + k).value = values[k] !== undefined ? values[k] : '';
}

/* ---------- (a) Form tạo mới ---------- */
test('form tạo mới: website biến thể (https + path, bản đã lưu có www) -> cảnh báo EXACT đủ tên + lý do + nút Xem', { skip: SKIP_NO_DEDUPE }, () => {
  const h = loadIndex();
  h.run('editCompany(null)');
  h.getEl('e_cname').value = 'Cong Ty Khac Han';
  setFormProfile(h.getEl, { website: 'https://alpha.vn/lien-he' });
  h.run(`refreshCompanyDedupeWarning('form')`);
  const box = h.getEl('e_company_dedupe_warn').innerHTML;
  assert.ok(box.includes('Đã có công ty này'), 'phải hiện cảnh báo mạnh exact');
  assert.ok(box.includes('Alpha Games'), 'phải nêu tên công ty trùng');
  assert.ok(box.includes('trùng website'), 'phải nêu lý do trùng website');
  assert.ok(box.includes('Xem công ty đó'), 'phải có nút Xem công ty đó');
  assert.ok(box.includes(`dedupeViewCompany('c1')`), 'nút Xem phải trỏ đúng công ty trùng c1');
});

test('form tạo mới: LinkedIn biến thể (slug khác hoa/thường + đuôi /) -> EXACT theo LinkedIn', { skip: SKIP_NO_DEDUPE }, () => {
  const h = loadIndex();
  h.run('editCompany(null)');
  h.getEl('e_cname').value = 'Cong Ty Khac Han';
  setFormProfile(h.getEl, { linkedinUrl: 'linkedin.com/company/Alpha-Games' });
  const res = h.run(`refreshCompanyDedupeWarning('form')`);
  assert.equal([...res.exact].length, 1);
  assert.equal(res.exact[0].company.id, 'c1');
  assert.ok(h.getEl('e_company_dedupe_warn').innerHTML.includes('trùng LinkedIn'));
});

test('form tạo mới: tên giống >70% -> cảnh báo SIMILAR đủ %, lý do và cả 2 lựa chọn; chọn Tiếp tục -> lưu thành công, không confirm', { skip: SKIP_NO_DEDUPE }, () => {
  const h = loadIndex();
  h.run('editCompany(null)');
  h.getEl('e_cname').value = 'Alpha Game';
  setFormProfile(h.getEl, {});
  h.run(`refreshCompanyDedupeWarning('form')`);
  const box = h.getEl('e_company_dedupe_warn').innerHTML;
  assert.ok(box.includes('Có công ty tương tự'), 'phải hiện cảnh báo similar');
  assert.ok(box.includes('Alpha Games') && /giống \d+%/.test(box), 'phải nêu ứng viên + % giống');
  assert.ok(box.includes('Xem công ty tương tự'), 'thiếu lựa chọn Xem công ty tương tự');
  assert.ok(box.includes('Tiếp tục nhập công ty mới'), 'thiếu lựa chọn Tiếp tục nhập công ty mới');
  h.run(`dedupeContinueNewCompany('form')`);
  assert.ok(!h.getEl('e_company_dedupe_warn').innerHTML.includes('Có công ty tương tự'), 'bấm Tiếp tục phải đóng cảnh báo similar');
  const before = h.run('S.companies.length');
  h.run('saveCompany(null)');
  assert.equal(h.run('S.companies.length'), before + 1, 'lưu sau khi chọn Tiếp tục phải thành công');
  assert.ok(h.run(`S.companies.some(c => c.name === 'Alpha Game')`));
  assert.equal(h.confirmCalls().length, 0, 'similar không được hỏi confirm khi lưu');
});

test('form: chọn Xem công ty đó -> mở đúng drawer của công ty trùng', { skip: SKIP_NO_DEDUPE }, () => {
  const h = loadIndex();
  h.run('editCompany(null)');
  h.getEl('e_cname').value = 'Cong Ty Khac Han';
  setFormProfile(h.getEl, { website: 'www.alpha.vn' });
  h.run(`refreshCompanyDedupeWarning('form')`);
  h.run(`dedupeViewCompany('c1')`);
  assert.equal(h.run('drawerCtx.id'), 'c1');
  assert.ok(h.getEl('drawer').innerHTML.includes('Alpha Games'), 'drawer mở phải là công ty trùng');
});

test('form tạo mới: bấm Lưu khi có EXACT -> confirm từ chối thì KHÔNG lưu, đồng ý thì lưu', { skip: SKIP_NO_DEDUPE }, () => {
  const h = loadIndex();
  h.run('editCompany(null)');
  h.getEl('e_cname').value = 'Cong Ty Khac Han';
  setFormProfile(h.getEl, { website: 'https://www.alpha.vn/about-us' });
  const before = h.run('S.companies.length');
  h.setConfirm(false);
  h.run('saveCompany(null)');
  assert.equal(h.run('S.companies.length'), before, 'từ chối confirm thì không được lưu');
  assert.ok(h.confirmCalls().some(m => m.includes('Đã có công ty này')), 'phải hỏi confirm nêu rõ trùng');
  h.setConfirm(true);
  h.run('saveCompany(null)');
  assert.equal(h.run('S.companies.length'), before + 1, 'đồng ý confirm thì lưu như công ty riêng');
});

/* ---------- (b) Form sửa công ty ---------- */
test('form sửa: mở ra không đổi gì -> không tự cảnh báo chính mình, lưu không hỏi confirm', { skip: SKIP_NO_DEDUPE }, () => {
  const h = loadIndex();
  h.run(`editCompany('c2')`);
  h.getEl('e_cname').value = 'Beta Studio';
  h.getEl('e_ctype').value = 'Doanh nghiệp';
  setFormProfile(h.getEl, { website: 'beta.vn' });
  h.run(`refreshCompanyDedupeWarning('form')`);
  assert.equal(h.getEl('e_company_dedupe_warn').innerHTML, '', 'không đổi giá trị thì không cảnh báo');
  h.run(`saveCompany('c2')`);
  assert.equal(h.confirmCalls().length, 0, 'lưu không đổi trùng thì không hỏi confirm');
  assert.equal(h.run(`S.companies.find(c=>c.id==='c2').website`), 'beta.vn');
});

test('form sửa: đổi website sang trùng công ty KHÁC -> cảnh báo EXACT; confirm từ chối giữ nguyên, đồng ý mới ghi', { skip: SKIP_NO_DEDUPE }, () => {
  const h = loadIndex();
  h.run(`editCompany('c2')`);
  h.getEl('e_cname').value = 'Beta Studio';
  h.getEl('e_ctype').value = 'Doanh nghiệp';
  setFormProfile(h.getEl, { website: 'https://alpha.vn/beta' });
  h.run(`refreshCompanyDedupeWarning('form')`);
  const box = h.getEl('e_company_dedupe_warn').innerHTML;
  assert.ok(box.includes('Đã có công ty này') && box.includes('Alpha Games'), 'đổi sang trùng công ty khác phải cảnh báo exact');
  h.setConfirm(false);
  h.run(`saveCompany('c2')`);
  assert.equal(h.run(`S.companies.find(c=>c.id==='c2').website`), 'beta.vn', 'từ chối confirm thì giữ website cũ');
  h.setConfirm(true);
  h.run(`saveCompany('c2')`);
  assert.equal(h.run(`S.companies.find(c=>c.id==='c2').website`), 'https://alpha.vn/beta', 'đồng ý confirm thì ghi website mới');
});

test('drawer hồ sơ: sửa website sang trùng công ty khác -> cảnh báo trong khối; Lưu hồ sơ qua confirm mới ghi', { skip: SKIP_NO_DEDUPE }, () => {
  const h = loadIndex();
  h.run(`openCompany('c2'); startCompanyProfileEdit('c2');`);
  h.getEl('cp_website').value = 'www.alpha.vn';
  h.run(`refreshCompanyDedupeWarning('profile')`);
  assert.ok(h.getEl('cp_dedupe_warn').innerHTML.includes('Đã có công ty này'), 'khối hồ sơ phải hiện cảnh báo exact');
  h.setConfirm(false);
  h.run(`persistCompanyProfile('c2')`);
  assert.equal(h.run(`S.companies.find(c=>c.id==='c2').website`), 'beta.vn', 'từ chối confirm thì không ghi');
  assert.equal(h.run('companyProfileEditId'), 'c2', 'từ chối thì vẫn ở chế độ sửa');
  h.setConfirm(true);
  h.run(`persistCompanyProfile('c2')`);
  assert.equal(h.run(`S.companies.find(c=>c.id==='c2').website`), 'www.alpha.vn');
  assert.equal(h.run('companyProfileEditId'), null, 'lưu xong về chế độ xem');
});

/* ---------- (c) Import dry-run (planner thuần) ---------- */
function loadSharedWithDedupe() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  if (HAS_DEDUPE) vm.runInContext(read('dedupe.js'), ctx, { filename: 'dedupe.js' });
  return ctx.window.SavaImport;
}
function impState() {
  return {
    companies: [{ id: 'c1', name: 'Alpha Games', type: 'Doanh nghiệp', roles: {}, last: '', website: 'https://www.alpha.vn/about', linkedinUrl: 'https://www.linkedin.com/company/alpha-games/' }],
    leads: [], deals: [],
  };
}
function impRec(row, companyName, picName, profile) {
  return { _row: row, empty: false, companyName, picName, person: '', emailCell: '', phoneCell: '', linkedinUrl: '', statusRaw: '', note: '', whenRaw: '', profile: profile || {} };
}
test('planImport: website trùng biến thể -> khớp công ty có sẵn (exact, lý do website), không tạo trùng', () => {
  const I = loadSharedWithDedupe();
  const plan = I.planImport(impState(), [impRec(2, 'Cong Ty Moi Han', 'Nguyen A', { website: 'www.alpha.vn/lien-he' })], { batch: 'b1', line: 'metaverse', ownerId: '', vertical: '' });
  assert.equal(plan.stats.newCompanies, 0);
  assert.equal(plan.stats.matchedCompanies, 1);
  assert.equal(plan.companiesMatched[0].id, 'c1');
  assert.ok(Array.from(plan.companiesMatched[0].matchReasons).includes('website'), 'lý do khớp phải là website');
  assert.equal(plan.leadsToCreate[0].companyId, 'c1', 'lead phải gắn vào công ty có sẵn');
});

test('planImport: nameKey bằng nhau (chỉ khác hậu tố pháp lý) -> khớp exact theo tên', { skip: SKIP_NO_DEDUPE }, () => {
  const I = loadSharedWithDedupe();
  const plan = I.planImport(impState(), [impRec(2, 'Alpha Games Ltd', 'Nguyen A', {})], { batch: 'b1', line: 'metaverse', ownerId: '', vertical: '' });
  assert.equal(plan.stats.newCompanies, 0);
  assert.equal(plan.companiesMatched[0].id, 'c1');
  assert.ok(Array.from(plan.companiesMatched[0].matchReasons).includes('nameKey'));
});

test('planImport: tên giống >70% -> vẫn tạo mới NHƯNG gắn cảnh báo ứng viên + % + lý do vào công ty sắp tạo', { skip: SKIP_NO_DEDUPE }, () => {
  const I = loadSharedWithDedupe();
  const plan = I.planImport(impState(), [impRec(2, 'Alpha Game', 'Nguyen A', {})], { batch: 'b1', line: 'metaverse', ownerId: '', vertical: '' });
  assert.equal(plan.stats.newCompanies, 1, 'similar không tự gộp — vẫn tạo mới');
  const warn = plan.companiesToCreate[0].dedupeWarnings;
  assert.equal(warn.length, 1);
  assert.equal(warn[0].id, 'c1');
  assert.equal(warn[0].name, 'Alpha Games');
  assert.ok(warn[0].percent > 70, 'phải kèm % giống, got ' + warn[0].percent);
  assert.ok(Array.from(warn[0].reasons).includes('nameSimilarity'));
});

test('UI Import: xem trước nêu công ty khớp (kèm lý do) và công ty sắp tạo tương tự (kèm %)', { skip: SKIP_NO_DEDUPE }, () => {
  const state = fixtureState();
  const h = loadIndex(state);
  h.run(`window.SavaAuth = { currentUser: () => ({ memberId: 'zac', role: 'admin' }) }`);
  h.run(`curView = 'import'; render();`);
  h.run(`impData = { fileName: 't.xlsx', sheetNames: ['S1'], sheetName: 'S1', wb: null,
    aoa: [['Company Name','PIC','Website'], ['Cong Ty Moi Han','Nguyen A','www.alpha.vn/lien-he'], ['Alpha Game','Tran B','']],
    links: {}, headerIdx: 0, headers: ['Company Name','PIC','Website'], mapping: ['companyName','picName','profile.website'] }; render();`);
  h.getEl('imp_owner').value = 'zac';
  h.getEl('imp_line').value = 'metaverse';
  h.getEl('imp_vertical').value = '';
  h.getEl('imp_batch').value = 'dedupe-batch';
  h.run('impRunPreview()');
  assert.equal(h.run('impPlan.stats.matchedCompanies'), 1);
  assert.equal(h.run('impPlan.stats.newCompanies'), 1);
  const view = h.getEl('view').innerHTML;
  assert.ok(view.includes('không tạo trùng') && view.includes('Alpha Games') && view.includes('trùng website'), 'xem trước phải nêu công ty khớp + lý do');
  assert.ok(view.includes('Công ty sắp tạo có công ty tương tự') && /giống \d+%/.test(view), 'xem trước phải nêu ứng viên tương tự + %');
});
