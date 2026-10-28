/* QA vòng 3 — đợt 3 (phía BD, index.html; C7/D7 chạm hẹp publishing.js).
   Kiểm chứng tĩnh + hàm thuần trích xuất cho các mục A10, B4, C1–C10, C14,
   C16, C17, D3, D6, D7 (B1 kiểm ở partner-eval.test.cjs). Các bất biến
   đợt 1–2 (fixture điểm chuẩn, hasValidV2, selectRequest, taxonomy
   evidence) do 4 file test gốc kiểm riêng. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pub = fs.readFileSync(path.join(__dirname, '..', 'publishing.js'), 'utf8');

function section(src, startNeedle, endNeedle) {
  const a = src.indexOf(startNeedle);
  assert.ok(a >= 0, 'thiếu điểm bắt đầu: ' + startNeedle);
  const b = src.indexOf(endNeedle, a + startNeedle.length);
  assert.ok(b > a, 'thiếu điểm kết thúc: ' + endNeedle);
  return src.slice(a, b);
}

test('cú pháp: publishing.js + mọi script inline của index.html đều parse được', () => {
  const f = path.join(os.tmpdir(), `sava-publishing-${process.pid}.js`);
  fs.writeFileSync(f, pub);
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } finally { fs.unlinkSync(f); }
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
  assert.ok(blocks.length >= 2);
  blocks.forEach((code, i) => {
    const bf = path.join(os.tmpdir(), `sava-index3-${process.pid}-${i}.js`);
    fs.writeFileSync(bf, code);
    try { execFileSync(process.execPath, ['--check', bf], { stdio: 'pipe' }); } finally { fs.unlinkSync(bf); }
  });
});

test('A10: save() có revision guard — đọc rev đã lưu trước khi ghi, chặn khi tab khác mới hơn', () => {
  const saveFn = section(html, 'function save() {', 'function resetDemo()');
  assert.ok(saveFn.includes('crmStale'), 'save() phải kiểm crmStale');
  assert.ok(saveFn.indexOf('crmRawRev') > -1 && saveFn.indexOf('crmRawRev') < saveFn.indexOf('storeState(S)'), 'phải đọc rev TRƯỚC khi storeState');
  assert.ok(saveFn.includes('info.rev > crmRev') && saveFn.includes('CRM_TAB_ID'), 'guard phải so rev + tab id');
  assert.ok(html.includes('window.addEventListener("storage"') && html.includes('e.key !== STORE_KEY'), 'thiếu storage listener lọc đúng STORE_KEY');
  assert.ok(html.includes('function crmReloadLatest') && html.includes('crmStaleBanner'), 'thiếu banner + đường tải lại dữ liệu mới nhất');
});

test('B4: fmtLegacyFinal luôn 1 chữ số thập phân + ghi chú khi làm tròn chạm ngưỡng mà điểm thô chưa qua', () => {
  const code = section(html, 'function fmtLegacyFinal', '/* ===== C2');
  const api = new Function(code + '\n;return {fmtLegacyFinal, legacyThresholdNote};')();
  assert.equal(api.fmtLegacyFinal(64.96), '65.0');
  assert.equal(api.fmtLegacyFinal(79.975), '80.0');
  assert.equal(api.fmtLegacyFinal(70), '70.0');
  assert.equal(api.fmtLegacyFinal(null), '—');
  assert.equal(api.fmtLegacyFinal(NaN), '—');
  assert.match(api.legacyThresholdNote(64.96), /chưa qua ngưỡng 65/);
  assert.match(api.legacyThresholdNote(64.96), /64\.96/);
  assert.match(api.legacyThresholdNote(79.975), /chưa qua ngưỡng 80/);
  assert.equal(api.legacyThresholdNote(65), '');
  assert.equal(api.legacyThresholdNote(70.2), '');
  const summary = section(html, 'function gameEvalSummaryText', 'function gameV2ChipText');
  assert.ok(summary.includes('fmtLegacyFinal(gs.legacy.final)') && summary.includes('legacyThresholdNote(gs.legacy.final)'), 'gameEvalSummaryText phải dùng helper B4 cho nhánh legacy');
});

test('C1: sửa deal với công ty không còn hợp lệ — option rỗng được chọn, chặn lưu, không fallback về công ty cũ', () => {
  const opts = section(html, 'function companyOptionsHTML', 'function onEditCompanyChange');
  assert.ok(opts.includes('— Chọn công ty —') && opts.includes('<option value="" selected>'), 'thiếu option rỗng được chọn khi công ty không hợp lệ');
  assert.ok(opts.includes('S.companies.some(c => c.id === curId)'), 'phải kiểm tính hợp lệ của curId bằng dữ liệu');
  const save = section(html, 'function saveEditDeal', 'function performDeleteDeal');
  assert.ok(save.includes('if (compVal === "")'), 'saveEditDeal phải chặn lưu khi chưa chọn công ty');
  const eff = section(html, 'function editDealCompanyId', 'function editGameOptionsHTML');
  assert.ok(eff.includes('return sel.value || "";'), 'editDealCompanyId phải tin value của select (rỗng = chưa chọn)');
  assert.ok(!eff.includes('if (val) return val;'), 'không còn fallback về d.company khi select rỗng');
});

test('C2: lead converted mồ côi tự hồi "qualified" ở cả 2 đường mất liên kết + form sửa lead có select status đầy đủ', () => {
  const helper = section(html, 'function revertLeadIfOrphaned', '/* =====');
  assert.ok(helper.includes('l.status = "qualified"') && helper.includes('dealsForLead(l.id).length === 0'));
  const detach = section(html, 'function detachLeadFromDeal', 'function attachLeadFromLeadDrawer');
  assert.ok(detach.includes('revertLeadIfOrphaned(leadId)'), 'gỡ lead khỏi deal phải hồi trạng thái');
  const del = section(html, 'function performDeleteDeal', 'function deleteDeal');
  assert.ok(del.includes('linkedLeadIds.forEach(revertLeadIfOrphaned)'), 'xóa deal phải hồi trạng thái các lead liên kết');
  const form = section(html, 'function editLead', 'function saveLead');
  assert.ok(form.includes('["converted", "Đã chuyển đổi"]'), 'form sửa lead phải có option Đã chuyển đổi trong select status');
  assert.ok(!form.includes('không sửa tay'), 'không còn khối khóa cứng trạng thái converted');
});

test('C3: rev share mới nhập phải tổng = 100 mới cho lưu; cặp cũ nguyên trạng được giữ theo tiền lệ', () => {
  const save = section(html, 'function saveTermContract', 'function closeDrawer()');
  assert.ok(save.includes('Tổng rev share phải bằng 100%'), 'thiếu thông báo chặn tổng rev share');
  assert.ok(save.includes('Math.abs(sum - 100) > 1e-9'), 'phải so tổng với 100');
  assert.ok(save.includes('sameAsOld'), 'phải có nhánh giữ nguyên cặp % cũ (dữ liệu cũ không bị chặn)');
});

test('C4 + C14: chặn custom field tiền/số âm (báo rõ field) ở form sửa deal; đường tạo validate game↔company bằng dữ liệu', () => {
  const saveEdit = section(html, 'function saveEditDeal', 'function performDeleteDeal');
  assert.ok(saveEdit.includes('def.type === "money" || def.type === "number"') || saveEdit.includes('(def.type === "money" || def.type === "number")'), 'saveEditDeal phải kiểm custom field tiền/số');
  assert.ok(saveEdit.includes('không được là số âm'), 'phải báo lỗi số âm cho custom field');
  const saveCreate = section(html, 'function saveDeal()', '/* ===== CRUD');
  assert.ok(saveCreate.includes('Game đã chọn không thuộc công ty đã chọn'), 'saveDeal phải validate game thuộc đúng company bằng dữ liệu');
  assert.ok(saveCreate.includes('gg.company !== c.id'), 'validate phải so game.company với company đã resolve');
});

test('C5 + C6: sửa game đổi company/own — chặn khi có deal Publishing, cảnh báo+xác nhận khi có deal khác; guard trùng tạo game/lead', () => {
  const saveGame = section(html, 'function saveGame', 'function deleteGame');
  assert.ok(saveGame.includes('Không đổi được studio/chủ sở hữu') && saveGame.includes('d.line === "publishing"'), 'thiếu chặn đổi khi có deal Publishing');
  assert.ok(saveGame.includes('confirm('), 'thiếu cảnh báo xác nhận khi có deal khác trỏ vào');
  assert.ok(saveGame.includes('cùng studio sở hữu'), 'thiếu guard trùng tạo game (tên + studio)');
  const saveLead = section(html, 'function saveLead', 'function deleteLead');
  assert.ok(saveLead.includes('cùng công ty và người đầu mối'), 'thiếu guard trùng tạo lead (tên + công ty + người đầu mối)');
});

test('C7: drawer game BD hiện bdNote + link build/trailer an toàn; review Publishing hiện ghi chú BD cho MKT', () => {
  const drawer = section(html, 'function openGame', 'function openLead');
  assert.ok(drawer.includes('Ghi chú BD') && drawer.includes('esc(g.bdNote)'), 'drawer game BD thiếu bdNote');
  assert.ok(drawer.includes('extLinkHTML(g.buildUrl)') && drawer.includes('extLinkHTML(g.trailerUrl)'), 'drawer game BD thiếu link build/trailer');
  const helper = section(html, 'function safeHttpUrl', 'function openGame');
  assert.ok(helper.includes('/^https?:\\/\\//i'), 'link chỉ được thành <a> khi là http/https');
  assert.ok(pub.includes('Ghi chú BD (từ hồ sơ game trong CRM)') && pub.includes('bdNoteHTML'), 'publishing.js review game phải hiển thị bdNote');
  assert.ok(pub.includes('${bdNoteHTML}'), 'bdNoteHTML phải được chèn vào dialog review');
});

test('C8 + C9 + C10: cảnh báo mất tư cách studio trước khi lưu công ty; saveActivity chặn nội dung rỗng; sửa deal xóa được ngày chốt', () => {
  const saveCo = section(html, 'function saveCompany', 'function deleteCompany');
  assert.ok(saveCo.includes('MẤT tư cách studio Publishing') && saveCo.includes('GIỮ NGUYÊN'), 'thiếu cảnh báo C8 (ẩn ở BD, giữ nguyên canonical)');
  assert.ok(saveCo.includes('confirm('), 'C8 phải yêu cầu xác nhận mới lưu');
  const saveAct = section(html, 'function saveActivity', 'function deleteActivity');
  assert.ok(saveAct.includes('Nội dung hoạt động không được để trống'), 'saveActivity phải chặn nội dung rỗng như addActivity');
  assert.ok(saveAct.indexOf('Nội dung hoạt động không được để trống') < saveAct.indexOf('a.type ='), 'phải kiểm nội dung TRƯỚC khi mutate activity');
  const saveEdit = section(html, 'function saveEditDeal', 'function performDeleteDeal');
  assert.ok(saveEdit.includes('d.due = dueVal;'), 'để trống ngày phải xóa ngày chốt');
  assert.ok(!saveEdit.includes('d.due = dueVal || d.due'), 'không còn giữ ngày cũ khi để trống');
  assert.ok(html.includes('Để trống khi lưu = xóa ngày chốt'), 'form sửa deal phải có ghi chú để trống = xóa ngày');
});

test('C16 + C17: drawer game hiện mechanic Publishing chỉ đọc có ghi nguồn; hàng member bấm mở được chi tiết', () => {
  const drawer = section(html, 'function openGame', 'function openLead');
  assert.ok(drawer.includes('mechanic theo yêu cầu đánh giá Publishing'), 'thiếu dòng mechanic Publishing kèm nguồn');
  assert.ok(drawer.includes('gs.request.intake'), 'mechanic phải đọc từ intake của request qua bridge');
  const members = section(html, 'function vMembers', 'function openMember');
  assert.ok(members.includes('onclick="openMember('), 'hàng member phải bấm được để mở chi tiết');
  const detail = section(html, 'function openMember', 'function editMember');
  assert.ok(detail.includes('Việc được giao') && detail.includes('Deal phụ trách'), 'chi tiết member phải có tóm tắt việc + deal');
  assert.ok(detail.includes('dealMini') && detail.includes('taskRow'), 'chi tiết member phải liệt kê việc/deal bấm qua được');
  assert.ok(html.includes('else if (type === "member") openMember(id);'), 'refreshDrawer phải hỗ trợ drawer member');
});

test('D3: helper guard enum lạ/thiếu không throw và hiện nhãn dự phòng', () => {
  const code = section(html, 'function lineDef(', '/* ===== B4');
  const LINES = { ai: { name: 'AI', color: '#8b5cf6', desc: 'd', target: 't', stages: [['prospect', 'Tiếp cận', 5]], fields: [] } };
  const api = new Function('LINES', code + '\n;return {lineDef, lineName, lineColor, lineDefOrFallback, stagePairSafe};')(LINES);
  assert.equal(api.lineName('ai'), 'AI');
  assert.equal(api.lineName('line_la'), 'line_la');
  assert.equal(api.lineName(''), '—');
  assert.equal(api.lineColor('line_la'), '#64748b');
  assert.deepEqual([...api.stagePairSafe('ai', 'prospect')], ['prospect', 'Tiếp cận', 5]);
  assert.deepEqual([...api.stagePairSafe('ai', 'stage_la')], ['stage_la', 'stage_la', 0]);
  assert.deepEqual([...api.stagePairSafe('line_la', 'x')], ['x', 'x', 0]);
  assert.deepEqual([...api.stagePairSafe('ai', '')], ['', '—', 0]);
  const fb = api.lineDefOrFallback('line_la', 'st1');
  assert.equal(fb.name, 'line_la'); assert.deepEqual(fb.fields, []);
  /* Các bề mặt render chính phải đi qua guard */
  for (const needle of ['lineColor(k)', 'lineName(k)']) assert.ok(html.includes(needle), 'thiếu guard ' + needle);
  assert.ok(!section(html, 'function vLeads', 'function convertLead').includes('LINES[l.line].color'), 'vLeads còn truy cập LINES trực tiếp');
  assert.ok(!section(html, 'function dealMini', '/* === PARTNER EVAL LOGIC').includes('LINES[d.line]'), 'dealMini còn truy cập LINES trực tiếp');
});

test('D6: index có wrap cho .dcard .a và div mô tả game (.gdesc)', () => {
  assert.ok(/\.dcard \.a\s*\{[^}]*overflow-wrap:\s*anywhere/.test(html), 'thiếu overflow-wrap cho .dcard .a');
  assert.ok(/\.gdesc\s*\{[^}]*overflow-wrap:\s*anywhere/.test(html), 'thiếu overflow-wrap cho .gdesc');
  assert.ok((html.match(/class="gdesc"/g) || []).length >= 2, 'div mô tả game ở vGames + openGame phải mang class gdesc');
});

test('D7: pct/usd của publishing.js trả "—" cho NaN/thiếu; deal thiếu amount không còn giá trị có trọng số $0 giả', () => {
  const numLine = pub.match(/const num = .*$/m)[0];
  const pctLine = pub.match(/const pct = .*$/m)[0];
  const usdLine = pub.match(/const usd = .*$/m)[0];
  assert.ok(pctLine.includes('Number.isFinite') && usdLine.includes('Number.isFinite'), 'pct/usd phải kiểm Number.isFinite');
  const api = new Function(numLine + '\n' + pctLine + '\n' + usdLine + '\n;return {pct, usd};')();
  assert.equal(api.pct(NaN), '—');
  assert.equal(api.pct(undefined), '—');
  assert.equal(api.pct(0.5), '50%');
  assert.equal(api.usd(NaN), '—');
  assert.equal(api.usd(undefined), '—');
  assert.equal(api.usd(12.5), '$12.5');
  assert.ok(!html.includes('(d.amount||0)*st[2]'), 'openDeal không còn tính giá trị có trọng số từ amount||0');
  const deal = section(html, 'function openDeal', 'function moveStage');
  assert.ok(deal.includes('hasAmt ? money(Math.round(d.amount*st[2]/100), d.cur) : "—"'), 'giá trị có trọng số phải hiện "—" khi thiếu amount');
});

/* ---------- Harness vm: nạp index.html THẬT (apple-ui + shared + score +
   bridge + 2 script inline) với DOM/localStorage stub tối thiểu ---------- */
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

test('A10 chức năng: 1 tab lưu bình thường; tab khác ghi rev cao hơn -> tab cũ bị chặn lưu (không ghi đè), tải lại thì lưu tiếp được', () => {
  const { run, ls, listeners } = loadIndex();
  run('S.companies[0].last = "tab-nay-ghi"; save();');
  assert.equal(JSON.parse(ls.getItem('sava_crm_shared_v1')).companies[0].last, 'tab-nay-ghi');
  const rev1 = run('crmRev');
  assert.ok(rev1 >= 1);
  /* Tab khác ghi bản mới hơn (rev cao hơn, tab id khác) */
  const stored = JSON.parse(ls.getItem('sava_crm_shared_v1'));
  stored._crmRev = rev1 + 50; stored._crmTab = 'tab-khac'; stored.companies[0].last = 'tab-khac-ghi';
  ls.setItem('sava_crm_shared_v1', JSON.stringify(stored));
  (listeners.storage || []).forEach(fn => fn({ key: 'sava_crm_shared_v1', newValue: ls.getItem('sava_crm_shared_v1') }));
  assert.equal(run('crmStale'), true, 'storage event phải đánh dấu tab cũ là stale');
  run('S.companies[0].last = "khong-duoc-ghi-de"; save();');
  const after = JSON.parse(ls.getItem('sava_crm_shared_v1'));
  assert.equal(after.companies[0].last, 'tab-khac-ghi', 'save của tab cũ KHÔNG được ghi đè bản mới hơn');
  assert.equal(after._crmRev, rev1 + 50);
  /* Tải lại dữ liệu mới nhất -> hết chặn, thấy dữ liệu tab khác, lưu tiếp được */
  run('crmReloadLatest();');
  assert.equal(run('crmStale'), false);
  assert.equal(run('S.companies[0].last'), 'tab-khac-ghi');
  run('S.companies[0].last = "sau-tai-lai"; save();');
  assert.equal(JSON.parse(ls.getItem('sava_crm_shared_v1')).companies[0].last, 'sau-tai-lai');
});

test('D3+D7 chức năng: line/stage lạ hoặc thiếu không làm crash view/drawer; deal thiếu amount hiện "—" cho giá trị có trọng số', () => {
  const { run, getEl } = loadIndex();
  run(`S.companies.push({id:'cbad', name:'Bad Co', type:'Khác', roles:{line_la:'Vai trò lạ', ai:'Khách hàng'}, contact:'X', phone:'', last:'—'});
       S.leads.push({id:'lbad', name:'Bad Lead', company:'cbad', person:'P', line:'line_la', source:'Khác', status:'new', note:'n', when:'Hôm nay'});
       S.deals.push({id:'dbad', line:'line_la', title:'Bad Deal', company:'cbad', stage:'stage_la', owner:'zac', due:'', idle:0, custom:{}});
       S.deals.push({id:'dbad2', line:'ai', title:'AI NoStage', company:'cbad', stage:'', owner:'zac', due:'', idle:0, custom:{}, cur:'VND'});`);
  for (const v of ['companies', 'leads', 'games', 'members', 'dash', 'board']) {
    assert.doesNotThrow(() => run(`curView="${v}"; render();`), 'view ' + v + ' throw với enum lạ');
  }
  assert.doesNotThrow(() => run("openLead('lbad')"));
  assert.doesNotThrow(() => run("openDeal('dbad')"));
  assert.doesNotThrow(() => run("openCompany('cbad')"));
  assert.doesNotThrow(() => run("openDeal('dbad2')"));
  assert.ok(getEl('drawer').innerHTML.includes('giá trị có trọng số: <b>—</b>'), 'deal thiếu amount + stage thiếu phải hiện "—" cho giá trị có trọng số');
  const mini = run("dealMini(S.deals.find(d=>d.id==='dbad'))");
  assert.ok(mini.includes('line_la') && mini.includes('stage_la'), 'dealMini phải hiện nhãn thô cho line/stage lạ');
});

test('C2+C7+C17 chức năng: gỡ lead/xóa deal hồi "qualified"; drawer game có bdNote + link; drawer member mở được', () => {
  const { run, getEl } = loadIndex();
  run(`S.leads.push({id:'lc2', name:'Conv Co', company:'c3', person:'P2', line:'ai', source:'', status:'converted', note:'', when:''});
       S.deals.push({id:'dc2', line:'ai', title:'Conv Deal', company:'c3', stage:'prospect', owner:'zac', due:'', idle:0, custom:{}, leads:['lc2'], amount:100, cur:'VND'});`);
  run("detachLeadFromDeal('lc2','dc2')");
  assert.equal(run("S.leads.find(l=>l.id==='lc2').status"), 'qualified', 'gỡ lead khỏi deal cuối cùng phải hồi qualified');
  run("S.leads.find(l=>l.id==='lc2').status='converted'; S.deals.find(d=>d.id==='dc2').leads=['lc2']; performDeleteDeal('dc2');");
  assert.equal(run("S.leads.find(l=>l.id==='lc2').status"), 'qualified', 'xóa deal phải hồi qualified cho lead mồ côi');
  run("openGame('g3')");
  const drawer = getEl('drawer').innerHTML;
  assert.ok(drawer.includes('studio 6 người ở Đà Nẵng'), 'drawer game phải hiện bdNote');
  assert.ok(drawer.includes('Link build') && drawer.includes('Link trailer'), 'drawer game phải hiện link build/trailer');
  run("openMember('zac')");
  assert.ok(getEl('drawer').innerHTML.includes('Việc được giao') && getEl('drawer').innerHTML.includes('Deal phụ trách'), 'drawer member phải có tóm tắt việc + deal');
});

/* ---------- C7 chức năng (phía Publishing): MKT mở review game thấy bdNote ---------- */
test('C7 chức năng: dialog review game (role MKT) hiển thị ghi chú BD từ hồ sơ game CRM', () => {
  const readF = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const store = new Map();
  const ls = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  ls.setItem('sava_publishing_v1', JSON.stringify({ version: 1, marketUpdates: [], requests: [
    { id: 'REV-G3', kind: 'game', entityId: 'g3', requestedBy: 'tuan', assignee: 'mai', due: '', requestNote: 'Đánh giá Tiny Farm', source: '', build: 'beta', intake: { mechanicId: 'SIM-7', genre: 'Simulation' }, status: 'Đang đánh giá', requestedAt: new Date().toISOString(), current: null, revisions: [], revision: 0 },
  ] }));
  const makeEl = () => ({ innerHTML: '', textContent: '', value: '', open: false, dataset: {}, style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {},
    insertAdjacentHTML() {}, querySelector: () => null, querySelectorAll: () => [],
    focus() {}, close() {}, showModal() {}, scrollIntoView() {}, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) });
  const elements = new Map();
  const docListeners = {};
  const ctx = vm.createContext({ console, localStorage: ls,
    document: { readyState: 'complete', body: Object.assign(makeEl(), { dataset: { role: 'mkt' } }), activeElement: null,
      querySelector: s => { if (!elements.has(s)) elements.set(s, makeEl()); return elements.get(s); },
      querySelectorAll: () => [], addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); } },
    location: { search: '?tab=reviews', href: 'http://localhost/mkt.html' }, history: { replaceState() {} },
    addEventListener() {}, URLSearchParams, URL, structuredClone,
    crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout });
  ctx.window = ctx;
  for (const f of ['shared.js', 'publishing-score.js', 'publishing-bridge.js', 'publishing-data.js', 'publishing.js']) vm.runInContext(readF(f), ctx, { filename: f });
  const btn = { dataset: { review: 'REV-G3' }, hasAttribute: () => false };
  (docListeners.click || []).forEach(fn => fn({ target: { closest: sel => (sel === 'button' ? btn : null) } }));
  const dlg = elements.get('#editor').innerHTML;
  assert.ok(dlg.includes('Ghi chú BD (từ hồ sơ game trong CRM)'), 'dialog review phải có khu vực ghi chú BD có nhãn rõ');
  assert.ok(dlg.includes('studio 6 người ở Đà Nẵng'), 'MKT phải đọc được nội dung bdNote của game g3 từ CRM');
});
