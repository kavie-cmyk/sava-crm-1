/* Trạng thái tiếp cận của Lead — đợt bổ sung B:
   - 8 trạng thái mới hạng nhất (key + nhãn nguyên văn): sent_connect
     "Sent connect", first_message "1st message", first_email
     "1st email", first_fu "1st FU", in_response "In-response",
     in_reply "In reply", discovery_meeting "Discovery meeting",
     not_yet_have_demand "Not yet have demand" — cùng 4 trạng thái cũ
     thành 12 key trong LEAD_STATUSES (nguồn sự thật duy nhất cho block
     view / form select / chip mọi bề mặt).
   - Thứ tự block: new -> 8 trạng thái tiếp cận chèn giữa -> contacted
     -> qualified -> converted -> not_yet_have_demand -> "Khác" (chỉ
     giá trị lạ thật sự ngoài 12 key).
   - Bất biến P2/F1 giữ nguyên: lead KHÔNG deal giữ nguyên trạng thái
     form chọn (gồm cả trạng thái tiếp cận); lead CÓ deal -> converted.
   - migrateState + adapter round-trip giữ nguyên status mới (không ép
     về 'new'); phía máy chủ nới CHECK bằng lead-status-expand.sql. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('index.html');
const A = require('../supabase-adapter.js');

const NEW_STATUSES = [
  ['sent_connect', 'Sent connect'], ['first_message', '1st message'], ['first_email', '1st email'],
  ['first_fu', '1st FU'], ['in_response', 'In-response'], ['in_reply', 'In reply'],
  ['discovery_meeting', 'Discovery meeting'], ['not_yet_have_demand', 'Not yet have demand'],
];
const ALL_KEYS = ['new', 'sent_connect', 'first_message', 'first_email', 'first_fu', 'in_response', 'in_reply', 'discovery_meeting', 'contacted', 'qualified', 'converted', 'not_yet_have_demand'];

/* ---------- Tĩnh: SQL nới CHECK ---------- */
test('tĩnh: supabase/lead-status-expand.sql nới CHECK leads đủ 12 key, chạy-lại-an-toàn, có tiền điều kiện + SELECT tra tên constraint', () => {
  const sql = read('supabase/lead-status-expand.sql');
  assert.ok(/drop constraint if exists leads_status_check/.test(sql), 'phải drop constraint if exists leads_status_check');
  assert.ok(sql.includes("check (status in ('new','contacted','qualified','converted','sent_connect','first_message','first_email','first_fu','in_response','in_reply','discovery_meeting','not_yet_have_demand'))"), 'CHECK phải đủ đúng 12 key theo hợp đồng');
  assert.ok(sql.includes('Metaverse v2'), 'header phải ghi điều kiện tiên quyết trước payload nạp Metaverse v2');
  assert.ok(sql.includes('pg_constraint'), 'phải có SELECT tra tên constraint thật từ pg_constraint');
  assert.ok(sql.includes("conrelid = 'public.leads'::regclass"), 'SELECT kiểm chứng phải tra trên bảng leads');
});

test('tĩnh: không còn danh sách trạng thái cứng 4-key riêng ở leadMini/drawer/form (mọi nơi tra LEAD_STATUSES)', () => {
  assert.ok(!html.includes('const stMap = {new:"Mới"'), 'leadMini/dealLeadMini không còn stMap cứng');
  assert.ok(!html.includes('[["new", "Mới"], ["contacted", "Đã liên hệ"]'), 'form lead không còn mảng trạng thái cứng riêng');
  assert.ok(html.includes('leadStatusText(l.status)'), 'thẻ lead phải lấy nhãn qua helper tra LEAD_STATUSES');
});

/* ---------- shared: audit label + migrateState giữ status mới ---------- */
function loadShared() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  vm.runInContext(read('shared.js'), ctx, { filename: 'shared.js' });
  return ctx;
}

test('shared: nhãn audit của 8 status mới khớp nguyên văn; migrateState KHÔNG ép status mới về new', () => {
  const ctx = loadShared();
  for (const [k, label] of NEW_STATUSES) {
    assert.equal(ctx.window.SavaSys.auditValue({}, 'lead', {}, 'status', k), label, 'auditValue lead.status thiếu nhãn ' + k);
  }
  const s = ctx.migrateState({
    members: [], companies: [{ id: 'c1', name: 'Co', type: 'Doanh nghiệp', roles: {} }], games: [], deals: [], tasks: [], activities: [],
    leads: NEW_STATUSES.map(([k], i) => ({ id: 'lm' + i, name: 'Lead ' + k, company: 'c1', person: '', line: 'ai', source: '', status: k, note: '', when: '2026-10-01' })),
  });
  assert.deepEqual(s.leads.map(l => l.status), NEW_STATUSES.map(([k]) => k), 'migrateState phải giữ nguyên cả 8 status mới');
});

/* ---------- Adapter round-trip ---------- */
test('adapter: round-trip giữ nguyên từng status mới (LEAD_KNOWN đã có status — không whitelist lọc)', () => {
  const state = {
    members: [], companies: [], games: [], deals: [], tasks: [], activities: [], events: [],
    leads: ALL_KEYS.map((k, i) => ({ id: 'la' + i, name: 'Lead ' + k, company: '', person: '', line: 'ai', source: '', status: k, note: '', when: '2026-10-01' })),
  };
  const rows = A.crmStateToRows(state);
  ALL_KEYS.forEach((k, i) => assert.equal(rows.leads.find(r => r.id === 'la' + i).status, k, 'row phải giữ status ' + k));
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  assert.deepEqual(back.leads.map(l => l.status), ALL_KEYS, 'đọc lại phải nguyên vẹn cả 12 status');
});

/* ---------- Harness vm: nạp index.html thật ---------- */
function loadIndex() {
  const readF = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const leads = NEW_STATUSES.map(([k], i) => ({ id: 'lx_' + k, name: 'Lead Tok ' + k, company: 'c1', person: 'Người ' + i, line: 'publishing', source: 'Giới thiệu', status: k, note: 'tok-' + k, when: '2026-10-0' + (i + 1) }));
  leads.push({ id: 'lx_weird', name: 'Lead Tok Weird', company: 'c1', person: 'Người Lạ', line: 'publishing', source: 'Khác', status: 'legacy_weird', note: 'tok-weird', when: '2026-10-09' });
  ls.setItem('sava_crm_shared_v1', JSON.stringify({
    members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }],
    companies: [{ id: 'c1', name: 'Outreach Fixture Co', type: 'Game studio', roles: { publishing: 'Game studio' }, last: 'Hôm nay' }],
    games: [], deals: [], leads, tasks: [], activities: [],
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
function blocks(view) {
  const parts = view.split(/(?=data-lead-status=")/).slice(1);
  return parts.map(p => ({ key: p.slice('data-lead-status="'.length, p.indexOf('"', 'data-lead-status="'.length)), html: p }));
}
function fillLeadForm(getEl, over) {
  const vals = Object.assign({ e_lname: 'Lead Tok', e_lcompany: 'c1', e_lperson: '', e_lphone: '', e_lline: 'publishing', e_lsource: 'Giới thiệu', e_lstatus: 'new', e_lwhen: '', e_lnote: '' }, over || {});
  for (const [id, v] of Object.entries(vals)) getEl(id).value = v;
  getEl('e_lmain').checked = false;
}

test('vLeads: lead ở từng trạng thái mới nằm đúng block của nó (không vào Khác); block Khác chỉ còn status lạ thật', () => {
  const { run, getEl } = loadIndex();
  run('curView = "leads"; curLine = "all"; query = ""; render();');
  const bs = blocks(getEl('view').innerHTML);
  assert.deepEqual(bs.map(b => b.key), [...ALL_KEYS, '__unknown__'], 'thứ tự block phải đúng hợp đồng B + Khác cuối');
  const byKey = Object.fromEntries(bs.map(b => [b.key, b.html]));
  for (const [k, label] of NEW_STATUSES) {
    assert.ok(byKey[k], 'thiếu block ' + k);
    assert.ok(byKey[k].includes('Lead Tok ' + k), 'lead ' + k + ' phải nằm trong block của chính nó');
    assert.ok(byKey[k].includes('>' + label + '</span>'), 'đầu block/pill của ' + k + ' phải hiện nhãn "' + label + '"');
    assert.ok(!byKey.__unknown__.includes('Lead Tok ' + k), 'lead ' + k + ' KHÔNG được rơi vào block Khác');
  }
  assert.ok(byKey.__unknown__.includes('Lead Tok Weird') && byKey.__unknown__.includes('1 lead'), 'chỉ status lạ thật (legacy_weird) mới vào block Khác');
});

test('chip trạng thái: leadMini + dealLeadMiniHTML + drawer lead hiện đúng nhãn mới', () => {
  const { run, getEl } = loadIndex();
  assert.ok(run("leadMini(S.leads.find(l=>l.id==='lx_first_fu'))").includes('1st FU'), 'leadMini phải hiện nhãn 1st FU');
  assert.ok(run("dealLeadMiniHTML(S.leads.find(l=>l.id==='lx_in_reply'))").includes('In reply'), 'dealLeadMini phải hiện nhãn In reply');
  run("openLead('lx_discovery_meeting')");
  const drawer = getEl('drawer').innerHTML;
  assert.ok(drawer.includes('Discovery meeting'), 'drawer lead phải hiện pill Discovery meeting');
  run("openLead('lx_not_yet_have_demand')");
  assert.ok(getEl('drawer').innerHTML.includes('Not yet have demand'), 'drawer lead phải hiện pill Not yet have demand');
});

test('form lead: select có đủ 12 trạng thái đúng thứ tự + chọn sẵn status hiện tại; lưu qua form giữ nguyên status tiếp cận khi lead chưa có deal', () => {
  const { run, getEl } = loadIndex();
  run("editLead('lx_first_email')");
  const box = getEl('editBox').innerHTML;
  const optIdx = ALL_KEYS.map(k => box.indexOf('<option value="' + k + '"'));
  optIdx.forEach((ix, i) => assert.ok(ix >= 0, 'select thiếu option ' + ALL_KEYS[i]));
  assert.deepEqual(optIdx, [...optIdx].sort((a, b) => a - b), 'option phải theo đúng thứ tự LEAD_STATUSES');
  for (const [, label] of NEW_STATUSES) assert.ok(box.includes('>' + label + '</option>'), 'select thiếu nhãn ' + label);
  assert.ok(box.includes('<option value="first_email" selected>'), 'status hiện tại của lead phải được chọn sẵn');
  /* Lưu qua form: đổi sang in_response (vẫn chưa gắn deal) -> giữ nguyên */
  fillLeadForm(getEl, { e_lname: 'Lead Tok first_email', e_lstatus: 'in_response' });
  run("saveLead('lx_first_email')");
  assert.equal(run("S.leads.find(l=>l.id==='lx_first_email').status"), 'in_response', 'lead không deal: form chọn status tiếp cận nào thì giữ nguyên status đó');
  /* Tạo mới với status tiếp cận */
  run('editLead(null)');
  fillLeadForm(getEl, { e_lname: 'Lead Moi Tiep Can', e_lstatus: 'sent_connect' });
  run('saveLead(null)');
  const nl = run("S.leads.find(l=>l.name==='Lead Moi Tiep Can')");
  assert.ok(nl, 'lead mới phải được tạo');
  assert.equal(nl.status, 'sent_connect');
});

test('bất biến P2 với lead đang ở trạng thái tiếp cận: chưa gắn deal -> giữ nguyên; gắn deal -> converted; gỡ deal cuối -> qualified', () => {
  const { run, getEl } = loadIndex();
  /* Chưa gắn deal: sync hai chiều không đụng status tiếp cận */
  run("syncLeadDealStatus('lx_sent_connect')");
  assert.equal(run("S.leads.find(l=>l.id==='lx_sent_connect').status"), 'sent_connect');
  /* Gắn vào deal (cùng công ty) qua đường gắn thật -> converted */
  run("S.deals.push({ id: 'dOut', line: 'publishing', title: 'Deal Outreach', company: 'c1', stage: 'sourcing', owner: 'zac', due: '', idle: 0, custom: {}, leads: [] });");
  run("attachLeadToDeal('lx_sent_connect', 'dOut')");
  assert.equal(run("S.leads.find(l=>l.id==='lx_sent_connect').status"), 'converted', 'gắn deal thì lead tiếp cận phải thành converted');
  /* Sửa form lead đã có deal, form chọn first_fu -> kết quả cuối vẫn converted (F1) */
  run("editLead('lx_sent_connect')");
  fillLeadForm(getEl, { e_lname: 'Lead Tok sent_connect', e_lstatus: 'first_fu' });
  run("saveLead('lx_sent_connect')");
  assert.equal(run("S.leads.find(l=>l.id==='lx_sent_connect').status"), 'converted', 'lead CÓ deal: saveLead áp sync chỉ-chiều-lên như F1');
  /* Gỡ khỏi deal cuối -> hồi qualified */
  run("detachLeadFromDeal('lx_sent_connect', 'dOut')");
  assert.equal(run("S.leads.find(l=>l.id==='lx_sent_connect').status"), 'qualified', 'gỡ deal cuối: converted hồi về qualified như cũ');
});
