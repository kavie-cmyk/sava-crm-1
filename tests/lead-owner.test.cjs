/* Người phụ trách của Lead (lead.ownerId — member-linked):
   - ownerId là key phụ qua leads.legacy_extra ĐÚNG mẫu phone/mainContact/
     email/linkedinUrl: CỐ Ý không nằm trong LEAD_KNOWN, không cột/SQL mới.
     outreachOwner (text, từ lô nạp Metaverse) chỉ còn là dấu vết nguồn,
     KHÔNG phải nguồn sự thật phụ trách.
   - Form tạo/sửa lead: select ownerSel("e_lowner") chỉ member ACTIVE;
     tạo mới mặc định = member đang đăng nhập (defaultOwnerId — tiền lệ P3),
     chưa resolve được thì placeholder "— Chọn người phụ trách —".
   - Drawer lead: dòng "Người phụ trách" — có gán thì tên member bấm mở
     drawer member; chưa gán thì hiện rõ "Chưa gán người phụ trách".
   - Chip phụ trách gọn (leadOwnerChipHTML) trên thẻ lead ở view Block
     (leadRowHTML) + board Pipeline (leadCardHTML); chưa gán -> không chip.
   - View Lead lọc theo phụ trách qua filteredLeads (MỘT nguồn lọc duy
     nhất): leadOwnerFilter "" = tất cả, "__none__" = chưa gán, member id
     = đúng người đó; kết hợp AND với tab mảng + tìm kiếm.
   - FIELD_LABELS.lead.ownerId = "Người phụ trách" + REF_FIELDS.lead.
     ownerId = member (lịch sử chỉnh sửa resolve tên member).
   - Drawer member có khối "Lead phụ trách" (đếm + danh sách bấm mở lead,
     >20 thì nút xem tất cả ở view Lead đã lọc sẵn).
   - Xoá member: memberReferences (client) đếm thêm lead theo ownerId;
     Edge Function invite-member (countMemberReferences) quét thêm
     leads.legacy_extra.ownerId -> counts.leads_owner (chỉ chuẩn bị file,
     deploy do parent thực hiện). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const A = require('../supabase-adapter.js');

function loadShared() {
  const ctx = vm.createContext({ console, structuredClone, setTimeout, clearTimeout });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}

/* ---------- 1) FIELD_LABELS + REF_FIELDS + diff ---------- */

test('shared: FIELD_LABELS.lead.ownerId = "Người phụ trách"; diffEntity sinh change đúng nhãn + resolve tên member', () => {
  const ctx = loadShared(), S = ctx.window.SavaSys;
  assert.equal(S.FIELD_LABELS.lead.ownerId, 'Người phụ trách');
  const st = { members: [{ id: 'yen', name: 'Yến', role: 'BD', active: true }, { id: 'hoangdaden', name: 'Hoàng Daden', role: 'BD', active: true }], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [] };
  const before = { id: 'l1', name: 'Tran Van X', company: '', line: 'metaverse', ownerId: '' };
  const after = Object.assign({}, before, { ownerId: 'yen' });
  const changes = S.diffEntity(st, 'lead', before, after);
  const ch = changes.find(c => c.field === 'ownerId');
  assert.ok(ch, 'phải có change cho ownerId');
  assert.equal(ch.label, 'Người phụ trách');
  assert.equal(ch.to, 'Yến (yen)', 'REF_FIELDS.lead.ownerId=member phải resolve id -> "Tên (id)" như deal.owner');
});

/* ---------- 2) Adapter round-trip ---------- */

test('adapter: lead.ownerId đi qua legacy_extra của leads và quay lại nguyên vẹn; LEAD_KNOWN không chứa ownerId', () => {
  const s = { members: [], companies: [], games: [], deals: [], tasks: [], activities: [],
    leads: [{ id: 'l1', name: 'Người A', company: '', person: '', line: 'metaverse', source: '', status: 'new', note: '', when: '2026-11-02', ownerId: 'hoangdaden', outreachOwner: 'Hoàng' }] };
  const rows = A.crmStateToRows(s);
  assert.equal(rows.leads[0].legacy_extra.ownerId, 'hoangdaden');
  assert.equal(rows.leads[0].legacy_extra.outreachOwner, 'Hoàng', 'outreachOwner giữ nguyên làm dấu vết nguồn');
  assert.ok(!('ownerId' in rows.leads[0]), 'không sinh cột ownerId riêng');
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  assert.equal(back.leads[0].ownerId, 'hoangdaden');
  const src = read('supabase-adapter.js');
  const m = src.match(/const LEAD_KNOWN = \[([^\]]*)\]/);
  assert.ok(m && !m[1].includes("'ownerId'"), 'ownerId không được vào LEAD_KNOWN khi chưa có cột thật');
});

/* ---------- 3) Tĩnh: các bề mặt trong index.html ---------- */

test('tĩnh index: form lead dùng ownerSel e_lowner (mặc định defaultOwnerId + placeholder P3); saveLead lưu ownerId qua data chuẩn', () => {
  const html = read('index.html');
  assert.ok(html.includes('field("Người phụ trách", ownerSel("e_lowner", id ? (l.ownerId || "") : defaultOwnerId(), id ? undefined : { placeholder: "— Chọn người phụ trách —" }))'), 'form phải có field Người phụ trách qua ownerSel với mặc định P3 khi tạo mới');
  assert.ok(html.includes('ownerId: ownerEl ? ownerEl.value : (existing ? (existing.ownerId || "") : "")'), 'saveLead phải lưu ownerId từ e_lowner qua data chuẩn');
  assert.ok(html.includes('ownerId: "", mainContact: false'), 'lead mới mặc định ownerId rỗng trong editLead');
});

test('tĩnh index: drawer lead có dòng Người phụ trách (link openMember / trạng thái chưa gán rõ ràng); chip + lọc + drawer member + quét xoá member', () => {
  const html = read('index.html');
  assert.ok(html.includes('<div class="k">Người phụ trách</div>') && html.includes("openMember('${l.ownerId}')"), 'drawer lead phải hiện Người phụ trách bấm mở drawer member');
  assert.ok(html.includes('Chưa gán người phụ trách'), 'lead chưa gán phải hiện trạng thái rõ ràng');
  assert.ok(html.includes('function leadOwnerChipHTML(l)') && html.includes('leadOwnerChipHTML(l)'), 'phải có chip phụ trách gọn dùng ở thẻ lead');
  assert.ok(html.includes('id="leadOwnerFilterSel"') && html.includes('setLeadOwnerFilter(this.value)'), 'view Lead phải có select lọc theo người phụ trách');
  assert.ok(html.includes('leadOwnerFilter === "__none__" ? !l.ownerId : l.ownerId === leadOwnerFilter'), 'filteredLeads phải lọc theo ownerId gồm nhánh Chưa gán');
  assert.ok(html.includes('Lead phụ trách (${memberLeads.length})') && html.includes('viewLeadsOfMember'), 'drawer member phải có khối Lead phụ trách + đường xem tất cả');
  assert.ok(html.includes('l.ownerId === id') && html.includes('" lead đang phụ trách"'), 'memberReferences phải đếm lead theo ownerId trong thông báo chặn xoá');
});

test('tĩnh Edge Function: countMemberReferences quét thêm leads.legacy_extra.ownerId (counts.leads_owner) — file chuẩn bị, chưa deploy', () => {
  const ts = read('supabase/functions/invite-member/index.ts');
  assert.ok(ts.includes('leads_owner: number'), 'RefCounts phải có leads_owner');
  assert.ok(ts.includes('fetchAllRows(admin, "leads", "id,legacy_extra")') && ts.includes('jsonFieldIs(row, "legacy_extra", "ownerId", memberId)'), 'phải đếm lead qua legacy_extra.ownerId');
  assert.ok(ts.includes('counts.deals + counts.leads_owner'), 'total phải cộng leads_owner');
  assert.ok(ts.includes('c.leads_owner + " lead đang phụ trách"'), 'thông điệp 409 phải kể lead đang phụ trách');
});

/* ---------- 4) Hành vi qua harness index.html ---------- */

function loadIndex() {
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [
      { id: 'zac', name: 'Bự', role: 'Admin', active: true },
      { id: 'yen', name: 'Yến', role: 'BD', active: true },
      { id: 'hoangdaden', name: 'Hoàng Daden', role: 'BD', active: true },
      { id: 'off', name: 'Đã Ngừng', role: 'BD', active: false },
    ],
    companies: [{ id: 'c1', name: 'Cong Ty Mot', type: 'Doanh nghiệp', roles: { metaverse: 'Khách hàng' }, last: 'Hôm nay' }],
    games: [], deals: [],
    leads: [
      { id: 'lYen', name: 'Lead Cua Yen', company: 'c1', person: '', phone: '', line: 'metaverse', source: '', status: 'new', note: '', when: '2026-11-02', ownerId: 'yen', outreachOwner: 'Yến' },
      { id: 'lHoang', name: 'Lead Cua Hoang', company: 'c1', person: '', phone: '', line: 'metaverse', source: '', status: 'new', note: '', when: '2026-11-02', ownerId: 'hoangdaden', outreachOwner: 'Hoàng' },
      { id: 'lNone', name: 'Lead Chua Gan', company: 'c1', person: '', phone: '', line: 'metaverse', source: 'Sự kiện', status: 'new', note: '', when: '2026-11-02' },
    ],
    tasks: [], activities: [],
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
  for (const f of ['apple-ui.js', 'shared.js', 'publishing-score.js', 'publishing-bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
  [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim())
    .forEach((code, i) => vm.runInContext(code, ctx, { filename: 'index-inline-' + i }));
  return { ctx, ls, getEl, run: code => vm.runInContext(code, ctx) };
}

test('hành vi: chip phụ trách chỉ hiện khi đã gán, mang tên member', () => {
  const { run } = loadIndex();
  const chipY = run("leadOwnerChipHTML(S.leads.find(l => l.id === 'lYen'))");
  assert.ok(chipY.includes('👤 Yến'), 'chip phải hiện tên member phụ trách');
  assert.equal(run("leadOwnerChipHTML(S.leads.find(l => l.id === 'lNone'))"), '', 'chưa gán -> không chip');
});

test('hành vi: filteredLeads lọc theo owner (tất cả / từng member / chưa gán)', () => {
  const { run } = loadIndex();
  const ids = () => run("filteredLeads().map(l => l.id).sort().join(',')");
  run("leadOwnerFilter = ''"); assert.equal(ids(), 'lHoang,lNone,lYen');
  run("leadOwnerFilter = 'yen'"); assert.equal(ids(), 'lYen');
  run("leadOwnerFilter = 'hoangdaden'"); assert.equal(ids(), 'lHoang');
  run("leadOwnerFilter = '__none__'"); assert.equal(ids(), 'lNone');
  run("leadOwnerFilter = ''");
});

test('hành vi: drawer lead hiện Người phụ trách bấm mở member; chưa gán hiện rõ trạng thái', () => {
  const { run, getEl } = loadIndex();
  run("openLead('lYen')");
  const d = getEl('drawer').innerHTML;
  assert.ok(d.includes('<div class="k">Người phụ trách</div>') && d.includes("openMember('yen')") && d.includes('Yến →'), 'phải hiện tên + link mở drawer member');
  run("openLead('lNone')");
  const d2 = getEl('drawer').innerHTML;
  assert.ok(d2.includes('Chưa gán người phụ trách'), 'chưa gán phải ghi rõ, không để trống');
});

test('hành vi: form sửa lead có select e_lowner chọn sẵn owner hiện tại, chỉ member active; tạo mới chưa resolve danh tính -> placeholder', () => {
  const { run, getEl } = loadIndex();
  run("editLead('lHoang')");
  const box = getEl('editBox').innerHTML;
  assert.ok(box.includes('<label>Người phụ trách</label>'), 'form phải có field Người phụ trách');
  assert.ok(box.includes('value="hoangdaden" selected') && box.includes('Hoàng Daden'), 'phải chọn sẵn owner hiện tại');
  assert.ok(!box.includes('value="off"'), 'member đã ngừng không hiện trong select khi không phải giá trị hiện tại');
  run("editLead(null)");
  const box2 = getEl('editBox').innerHTML;
  assert.ok(box2.includes('— Chọn người phụ trách —'), 'tạo mới chưa resolve được danh tính (harness không có SavaAuth) -> placeholder, không đoán bừa');
});

test('hành vi: drawer member có khối Lead phụ trách (đếm + lead bấm mở được); memberReferences đếm lead owner', () => {
  const { run, getEl } = loadIndex();
  run("openMember('yen')");
  const d = getEl('drawer').innerHTML;
  assert.ok(d.includes('Lead phụ trách (1)') && d.includes("openLead('lYen')"), 'drawer member phải liệt kê lead phụ trách bấm mở được');
  assert.ok(d.includes('<div class="k">Lead phụ trách</div><div><b>1</b> lead'), 'kv phải có số đếm lead phụ trách');
  const refs = run("memberReferences('hoangdaden')");
  assert.ok(refs.some(r => r.includes('1 lead đang phụ trách')), 'memberReferences phải gồm số lead phụ trách: ' + JSON.stringify(refs));
  assert.equal(run("memberReferences('zac').length"), 0, 'member không tham chiếu nào -> rỗng như cũ');
});
