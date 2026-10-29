/* Đợt sửa theo phản hồi trực tiếp của user:
   (1) Lead hiện TÊN LEAD (người đầu mối) làm tiêu đề chính — cả view lẫn dữ liệu:
       migration trong migrateState đổi tên 5 lead mẫu l1–l5 từ tên công ty cũ
       sang tên người, chỉ khi khớp CHÍNH XÁC tên cũ; công ty trùng tên giữ nguyên.
   (2) Term + Hợp đồng trong drawer deal: mặc định dạng XEM, bấm Sửa mới hiện
       ô nhập; Lưu thành công -> về xem ngay; validate chặn -> Ở LẠI chế độ sửa;
       Hủy -> về xem không lưu. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

/* ---------- (1b) Migration đổi tên lead: nạp shared.js thật ---------- */
const sharedCtx = vm.createContext({ console });
sharedCtx.window = sharedCtx;
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared.js'), 'utf8'), sharedCtx, { filename: 'shared.js' });
assert.equal(typeof sharedCtx.migrateState, 'function', 'shared.js phải có migrateState');

function oldSavedState() {
  return {
    members: [],
    companies: [
      { id: 'c10', name: 'Studio Mooncat (mẫu)', type: 'Game studio', roles: { publishing: 'Game studio' } },
      { id: 'c11', name: 'Publisher SG (mẫu)', type: 'Publisher', roles: { game_studio: 'Publisher' } },
      { id: 'c12', name: 'Logistics Pro (mẫu)', type: 'Doanh nghiệp', roles: { ai: 'Khách hàng' } },
      { id: 'c13', name: 'Resort biển (mẫu)', type: 'Doanh nghiệp', roles: { metaverse: 'Khách hàng' } },
      { id: 'c14', name: 'Dev indie: Cá (mẫu)', type: 'Indie dev', roles: { publishing: 'Indie dev' } },
    ],
    games: [], deals: [], tasks: [], activities: [],
    leads: [
      { id: 'l1', name: 'Studio Mooncat (mẫu)', company: 'c10', person: 'Anh Minh — Founder', line: 'publishing' },
      { id: 'l2', name: 'Publisher SG (mẫu)', company: 'c11', person: 'Ms. Tan — BD Manager', line: 'game_studio' },
      { id: 'l3', name: 'Logistics Pro (mẫu)', company: 'c12', person: 'Anh Hùng — Giám đốc vận hành', line: 'ai' },
      { id: 'l4', name: 'Resort biển (mẫu)', company: 'c13', person: 'Chị Lan — Giám đốc kinh doanh', line: 'metaverse' },
      { id: 'l5', name: 'Dev indie: Cá (mẫu)', company: 'c14', person: 'Cá — Solo dev', line: 'publishing' },
      /* Lead user đã tự sửa tên (không khớp chính xác tên mẫu cũ) — không được đụng. */
      { id: 'l3x', name: 'Logistics Pro (mẫu) — bản của user', company: 'c12', person: 'X', line: 'ai' },
      /* Tên khớp tên cũ nhưng id KHÔNG thuộc l1–l5 — không được đụng. */
      { id: 'l99', name: 'Studio Mooncat (mẫu)', company: 'c10', person: 'Y', line: 'publishing' },
    ],
  };
}

test('migration: lead mẫu l1–l5 đổi sang tên người; công ty trùng tên GIỮ NGUYÊN; idempotent', () => {
  const s = sharedCtx.migrateState(oldSavedState());
  const byId = id => s.leads.find(l => l.id === id);
  assert.equal(byId('l1').name, 'Nguyễn Tuấn Minh (mẫu)');
  assert.equal(byId('l2').name, 'Rachel Tan (mẫu)');
  assert.equal(byId('l3').name, 'Trần Văn Hùng (mẫu)');
  assert.equal(byId('l4').name, 'Phạm Ngọc Lan (mẫu)');
  assert.equal(byId('l5').name, 'Đỗ Hải Nam (Cá) (mẫu)');
  /* Công ty c10–c14 giữ nguyên tên cũ */
  const cById = id => s.companies.find(c => c.id === id);
  assert.equal(cById('c10').name, 'Studio Mooncat (mẫu)');
  assert.equal(cById('c11').name, 'Publisher SG (mẫu)');
  assert.equal(cById('c12').name, 'Logistics Pro (mẫu)');
  assert.equal(cById('c13').name, 'Resort biển (mẫu)');
  assert.equal(cById('c14').name, 'Dev indie: Cá (mẫu)');
  /* Lead đã sửa tên tay + lead ngoài l1–l5 không bị đụng */
  assert.equal(byId('l3x').name, 'Logistics Pro (mẫu) — bản của user');
  assert.equal(byId('l99').name, 'Studio Mooncat (mẫu)');
  /* Idempotent: migrate lần 2 không đổi gì thêm */
  const snapshot = JSON.stringify(s.leads.map(l => [l.id, l.name]));
  sharedCtx.migrateState(s);
  assert.equal(JSON.stringify(s.leads.map(l => [l.id, l.name])), snapshot, 'chạy migrate 2 lần phải cho cùng kết quả');
});

/* ---------- Harness vm: nạp index.html thật (mẫu loadIndex của bd-batch3) ---------- */
function loadIndex() {
  const readF = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
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
  return { ctx, ls, getEl, listeners, run: code => vm.runInContext(code, ctx) };
}

/* ---------- (1a) Hiển thị lead: tiêu đề chính = tên lead ---------- */
test('vLeads + openLead + leadMini/leadLabel: tên lead là chính, công ty là thông tin phụ', () => {
  const { run, getEl } = loadIndex();
  run('curView = "leads"; curLine = "all"; render();');
  const view = getEl('view').innerHTML;
  assert.ok(view.includes('Lead (người đầu mối + công ty)'), 'header cột lead phải khớp thứ tự tên lead trước');
  assert.ok(view.includes('<b>Nguyễn Tuấn Minh (mẫu)</b>'), 'tiêu đề chính của hàng lead l1 phải là tên lead');
  assert.ok(view.includes('Studio Mooncat (mẫu) →'), 'tên công ty vẫn hiện ở dòng phụ, bấm mở công ty được');
  run("openLead('l1')");
  const drawer = getEl('drawer').innerHTML;
  assert.ok(drawer.includes('<h2>📥 Nguyễn Tuấn Minh (mẫu)</h2>'), 'drawer lead phải lấy tên lead làm tiêu đề');
  const label = run("leadLabel(S.leads.find(l=>l.id==='l1'))");
  assert.ok(label.startsWith('Nguyễn Tuấn Minh (mẫu)'), 'leadLabel (ô chọn gắn lead) phải bắt đầu bằng tên lead, không phải tên công ty');
  assert.ok(label.includes('Studio Mooncat (mẫu)'), 'leadLabel vẫn kèm tên công ty ở phần phụ');
  const mini = run("leadMini(S.leads.find(l=>l.id==='l1'))");
  assert.ok(mini.includes('📥 Nguyễn Tuấn Minh (mẫu)'), 'leadMini phải lấy tên lead làm tiêu đề thẻ');
  assert.ok(mini.includes('🏢 Studio Mooncat (mẫu)'), 'leadMini phải hiện công ty ở dòng phụ');
});

/* ---------- (2) Term + Hợp đồng: xem mặc định / sửa / lưu / hủy / validate ---------- */
test('Term: mặc định dạng XEM (không có ô nhập), Sửa mới hiện form giữ nguyên các id t_*/c_*', () => {
  const { run, getEl } = loadIndex();
  run("openDeal('d1')");
  const view = getEl('drawer').innerHTML;
  assert.ok(view.includes('✏️ Sửa term + hợp đồng'), 'dạng xem phải có nút Sửa term + hợp đồng');
  assert.ok(view.includes('Sava 70% / Publisher 30%'), 'dạng xem phải hiện rev share dạng text');
  assert.ok(view.includes('<div class="k">Số HĐ</div>'), 'dạng xem phải có dòng Số HĐ trong khối Hợp đồng');
  assert.ok(!view.includes('id="t_rev_sava"'), 'dạng xem KHÔNG được có ô nhập rev share');
  assert.ok(!view.includes('id="c_url"'), 'dạng xem KHÔNG được có ô nhập link HĐ');
  run("startTermEdit('d1')");
  const edit = getEl('drawer').innerHTML;
  assert.equal(run('termEditDealId'), 'd1');
  assert.ok(edit.includes('id="t_rev_sava"') && edit.includes('id="t_rev_partner"') && edit.includes('id="c_no"') && edit.includes('id="c_url"'), 'dạng sửa phải dùng đúng các id input cũ t_*/c_*');
  assert.ok(edit.includes("cancelTermEdit('d1')"), 'dạng sửa phải có nút Hủy về xem');
  /* Render lại cùng deal (vd chuyển stage/gắn lead) phải GIỮ chế độ sửa */
  run("openDeal('d1')");
  assert.ok(getEl('drawer').innerHTML.includes('id="t_rev_sava"'), 'render lại cùng deal không được tự thoát chế độ sửa');
  /* Mở deal khác -> reset về xem */
  run("openDeal('d4')");
  assert.equal(run('termEditDealId'), null, 'mở deal khác phải reset chế độ sửa');
  assert.ok(!getEl('drawer').innerHTML.includes('id="t_rev_sava"'), 'deal khác phải ở dạng xem');
});

test('Term: validate chặn (tổng rev share ≠ 100) -> Ở LẠI chế độ sửa, dữ liệu không đổi; lưu đúng -> về xem ngay; Hủy -> về xem không lưu', () => {
  const { run, getEl } = loadIndex();
  run("openDeal('d1'); startTermEdit('d1');");
  const set = (id, v) => { getEl(id).value = v; };
  set('t_rev_sava', '60'); set('t_rev_partner', '30'); /* tổng 90 -> bị chặn */
  run("saveTermContract('d1')");
  assert.equal(run("S.deals.find(d=>d.id==='d1').term.rev_share"), 'Sava 70% / Publisher 30%', 'validate chặn thì term không được thay đổi');
  assert.equal(run('termEditDealId'), 'd1', 'validate chặn thì PHẢI ở lại chế độ sửa');
  /* Sửa đúng tổng 100 -> lưu thành công -> quay về dạng xem ngay */
  set('t_rev_partner', '40');
  run("saveTermContract('d1')");
  assert.equal(run("S.deals.find(d=>d.id==='d1').term.rev_share"), 'Sava 60% / Partner 40%');
  assert.equal(run('termEditDealId'), null, 'lưu thành công phải thoát chế độ sửa');
  const after = getEl('drawer').innerHTML;
  assert.ok(!after.includes('id="t_rev_sava"') && after.includes('✏️ Sửa term + hợp đồng'), 'sau khi lưu, drawer phải về dạng xem');
  assert.ok(after.includes('Sava 60% / Partner 40%'), 'dạng xem phải hiện giá trị vừa lưu');
  /* Hủy: vào sửa, đổi giá trị trong ô, bấm Hủy -> về xem, dữ liệu giữ nguyên */
  run("startTermEdit('d1')");
  set('t_rev_sava', '10'); set('t_rev_partner', '90');
  run("cancelTermEdit('d1')");
  assert.equal(run('termEditDealId'), null);
  assert.equal(run("S.deals.find(d=>d.id==='d1').term.rev_share"), 'Sava 60% / Partner 40%', 'Hủy không được lưu giá trị trong ô');
  assert.ok(!getEl('drawer').innerHTML.includes('id="t_rev_sava"'), 'sau Hủy drawer phải về dạng xem');
});
