/* Đợt HOẠT ĐỘNG GẮN TRỰC TIẾP LEAD + GAME (3/11/2026) — kiểm bằng chứng:
   1) UI (harness index.html như activity-add-blocks.test.cjs): lead/game
      CHƯA có deal vẫn dựng được form thêm và thêm/sửa/xoá hoạt động gắn
      trực tiếp; lead/game CÓ deal giữ nguyên đường Việc 7 (mặc định theo
      deal) + có ô chọn đích trực tiếp; form sửa đổi chủ qua lại deal <->
      lead <-> game luôn giữ ĐÚNG 1 chủ; chủ rỗng bị chặn trước khi mutate;
      xoá lead/game xoá theo hoạt động gắn trực tiếp (khớp FK CASCADE);
      drawer Member hiện nhãn chủ Lead/Game.
   2) Adapter: activity gắn lead/game -> row lead_id/game_id (2 cột còn
      lại null) và ngược lại; 0 chủ / 2 chủ / chủ mồ côi KHÔNG thành row
      (giữ ở local); activity gắn deal cũ giữ nguyên hành vi.
   3) Mock sync áp FK THẬT + CHECK exactly-one-owner (chuẩn Việc 1):
      lead/game MỚI + activity gắn trực tiếp sinh CÙNG một lần lưu ->
      cha trước con, 0 lỗi FK; cha bị xoá trên server -> tự upsert lại
      cha (lead) trước activity con.
   Migration DB thật (supabase/activity-lead-game.sql) đã áp + verify
   riêng qua Management API — xem ghi chú trong file migration. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const adapter = require(path.join(ROOT, "supabase-adapter.js"));

const VK = ["companies", "leads", "deals", "games", "tasks", "members", "activities", "events"];

/* ================= 1) UI — harness index.html ================= */
function makeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _map: m };
}
function El(id) {
  const e = { id, children: [], style: {}, dataset: {}, value: "", textContent: "", _innerHTML: "", _listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, appendChild(c) { e.children.push(c); return c; },
    removeChild() {}, insertBefore() {}, querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    addEventListener(ev, fn) { (e._listeners[ev] = e._listeners[ev] || []).push(fn); }, removeEventListener() {},
    focus() {}, blur() {}, click() {}, scrollIntoView() {} };
  Object.defineProperty(e, "innerHTML", { get: () => e._innerHTML, set: v => { e._innerHTML = String(v); e.children = []; } });
  return e;
}
function makeDoc(seedHTML) {
  const els = new Map();
  const get = id => { if (!els.has(id)) els.set(id, El(id)); return els.get(id); };
  const body = El("body"); body.innerHTML = seedHTML || "";
  return { getElementById: get, createElement: t => El(t), querySelector: () => null, querySelectorAll: () => [], body, addEventListener() {}, _els: els };
}
const SEED = `<div class="top-actions"><button class="icon-btn">x</button></div><div class="tabs"></div><main id="view"></main><aside id="drawer"></aside><div id="scrim"></div><div id="modalWrap"></div><div id="toast"></div>`;

/* Dấu hệ thống CŨ của mọi bản ghi chủ trong fixture — mốc để nhóm test
   LG-STAMP-* chứng minh thao tác hoạt động ÉP chủ đổi dấu sang hiện tại. */
const OLD_CREATED = "2020-01-01T00:00:00.000Z", OLD_UPDATED = "2020-01-02T00:00:00.000Z", OLD_BY = "qaOld";
const OLD_STAMP = { createdAt: OLD_CREATED, updatedAt: OLD_UPDATED, updatedBy: OLD_BY };

function fixture() {
  return {
    companies: [{ id: "c1", name: "Studio Alpha", type: "Game studio", roles: { publishing: "Game studio" }, last: "" }],
    leads: [
      { id: "l1", name: "Anh Lead Có Deal", company: "c1", line: "publishing", status: "qualified", ownerId: "zac", source: "", when: "2026-11-02", ...OLD_STAMP },
      { id: "lSolo", name: "Chị Lead Chưa Deal", company: "c1", line: "publishing", status: "new", ownerId: "zac", source: "", when: "2026-11-02", ...OLD_STAMP },
    ],
    deals: [{ id: "d1", line: "publishing", title: "Deal Một", company: "c1", leads: ["l1"], game: "g1", stage: "contact", owner: "zac", due: "", idle: 0, term: {}, contract: {}, custom: {}, ...OLD_STAMP }],
    games: [
      { id: "g1", title: "Game Có Deal", own: "partner", company: "c1", genre: "", platform: "", stage: "", emoji: "", desc: "", ...OLD_STAMP },
      { id: "gSolo", title: "Game Chưa Deal", own: "ours", company: "", genre: "", platform: "", stage: "", emoji: "", desc: "", ...OLD_STAMP },
    ],
    tasks: [], requests: [],
    members: [{ id: "zac", name: "Zac", role: "Admin", active: true }, { id: "hoang", name: "Hoàng", role: "BD", active: true }],
    activities: [
      { id: "aDeal", deal: "d1", type: "Call", who: "zac", when: "2026-11-02", text: "Hoạt động qua deal cũ", url: "" },
      { id: "aLead", lead: "lSolo", type: "Zalo", who: "zac", when: "2026-11-02", text: "Nhắn Zalo lead chưa deal", url: "" },
      { id: "aGame", game: "gSolo", type: "Note", who: "zac", when: "2026-11-02", text: "Ghi chú game chưa deal", url: "" },
    ],
    events: [],
  };
}

/* Nạp index.html: cắt khối <script> nội tuyến cuối (chứa toàn bộ app). */
function loadApp() {
  const storage = makeStorage(); const doc = makeDoc(SEED);
  const sb = { console, localStorage: storage, document: doc, location: { reload() {}, href: "http://x/", search: "" }, history: { replaceState() {} },
    navigator: {}, alert() {}, confirm: () => true, prompt: () => "", setTimeout, clearTimeout, URL, Blob: class {}, FileReader: class {},
    MutationObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: fn => setTimeout(fn, 0),
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), getComputedStyle: () => ({}) };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  const run = (code, name) => vm.runInContext(code, sb, { filename: name });
  for (const f of ["apple-ui.js", "shared.js", "audit.js", "publishing-score.js", "publishing-bridge.js"]) run(read(f), f);
  run("window.SavaUI={icon:()=>'',esc:s=>String(s==null?'':s)};", "stubs");
  const html = read("index.html");
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1]).filter(s => s.trim());
  assert.ok(blocks.length, "phải trích được script app từ index.html");
  blocks.forEach((code, i) => run(code, "index-inline-" + i + ".js"));
  sb.SavaAuth = { currentUser: () => ({ id: "zac", memberId: "zac", name: "Zac", role: "Admin" }), isAdmin: () => true };
  /* Bắt mọi mục audit save() sinh ra (đường SavaAudit.recordBatch thật). */
  const captured = [];
  sb.SavaAudit = { recordBatch: entries => { captured.push(...entries); }, listFor: async () => [] };
  /* S là biến `let` trong ngữ cảnh vm — gán qua runInContext mới thay được
     binding thật (gán sb.S từ ngoài chỉ tạo property, app không thấy). */
  run("S = " + JSON.stringify(fixture()), "fixture.js");
  run("crmPrevSnap = crmSnapshotOf(S); render = () => {};", "fixture2.js");
  const main = El("main"); main.id = "view"; doc._els.set("view", main);
  ["drawer", "modalWrap", "toast"].forEach(id => doc._els.set(id, El(id)));
  const drawerHTML = () => doc._els.get("drawer").innerHTML;
  const state = () => run("S", "getS.js");
  const setField = (id, val) => { const e = El(id); e.value = val; doc._els.set(id, e); };
  return { sb, doc, drawerHTML, setField, state, captured };
}

test("LG-UI-1: lead CHƯA có deal — drawer vẫn dựng form gắn trực tiếp (hidden lead:<id>) + hiện hoạt động gắn trực tiếp + hint link", () => {
  const { sb, drawerHTML, state } = loadApp();
  sb.openLead("lSolo");
  const h = drawerHTML();
  assert.ok(h.includes("Nhắn Zalo lead chưa deal"), "hoạt động gắn trực tiếp phải hiện trong drawer lead");
  assert.ok(h.includes('id="na_lead_deal" value="lead:lSolo"'), "0 deal -> hidden mang đích trực tiếp lead:lSolo");
  assert.ok(h.includes("❓ Cách lấy link cuộc hội thoại / tài liệu"), "hint link giữ nguyên như Việc 7");
  assert.ok(!h.includes("chưa có deal nào liên kết"), "không còn hướng dẫn chặn khi lead chưa có deal");
});

test("LG-UI-2: lead CHƯA có deal — thêm hoạt động qua khối lead -> activity mang đúng khoá lead, vào state + hiện lại trong drawer", () => {
  const { sb, doc, drawerHTML, setField, state } = loadApp();
  sb.openLead("lSolo");
  ["na_lead_type", "na_lead_who", "na_lead_text", "na_lead_url"].forEach(id => doc._els.set(id, El(id)));
  setField("na_lead_deal", "lead:lSolo"); /* hidden đích trực tiếp mà drawer đã dựng (harness không parse HTML nên mô phỏng đúng giá trị đó) */
  setField("na_lead_type", "Call"); setField("na_lead_who", "zac");
  setField("na_lead_text", "Gọi xác nhận nhu cầu"); setField("na_lead_url", "");
  const before = state().activities.length;
  sb.addActivityScoped("lead");
  assert.equal(state().activities.length, before + 1);
  const a = state().activities.find(x => x.text === "Gọi xác nhận nhu cầu");
  assert.ok(a, "activity mới phải có trong state");
  assert.equal(a.lead, "lSolo");
  assert.equal(a.deal, undefined, "không được mang khoá deal");
  assert.equal(a.game, undefined, "không được mang khoá game");
  assert.ok(a.createdAt && a.updatedAt && a.updatedBy === "zac", "save() đóng dấu Việc 4 cho activity mới: " + JSON.stringify(a));
  assert.ok(drawerHTML().includes("Gọi xác nhận nhu cầu"), "drawer lead dựng lại hiện hoạt động mới");
});

test("LG-UI-3: game CHƯA có deal — thêm hoạt động gắn trực tiếp vào game hoạt động như lead", () => {
  const { sb, doc, drawerHTML, setField, state } = loadApp();
  sb.openGame("gSolo");
  const h = drawerHTML();
  assert.ok(h.includes("Ghi chú game chưa deal"), "hoạt động gắn trực tiếp phải hiện trong drawer game");
  assert.ok(h.includes('id="na_game_deal" value="game:gSolo"'), "0 deal -> hidden mang đích trực tiếp game:gSolo");
  ["na_game_type", "na_game_who", "na_game_text", "na_game_url"].forEach(id => doc._els.set(id, El(id)));
  setField("na_game_deal", "game:gSolo"); /* hidden đích trực tiếp mà drawer đã dựng */
  setField("na_game_type", "Demo"); setField("na_game_who", "zac");
  setField("na_game_text", "Chơi thử bản build mới"); setField("na_game_url", "");
  sb.addActivityScoped("game");
  const a = state().activities.find(x => x.text === "Chơi thử bản build mới");
  assert.ok(a && a.game === "gSolo" && a.deal === undefined && a.lead === undefined, "activity mang đúng 1 khoá game");
  assert.ok(drawerHTML().includes("Chơi thử bản build mới"));
});

test("LG-UI-4: lead CÓ deal — mặc định vẫn theo deal (Việc 7), chọn đích trực tiếp thì gắn vào lead", () => {
  const { sb, doc, drawerHTML, setField, state } = loadApp();
  sb.openLead("l1");
  const h = drawerHTML();
  assert.ok(h.includes('id="na_lead_deal" value="d1"'), "1 deal -> hidden deal như Việc 7");
  assert.ok(h.includes('id="na_lead_target"'), "có ô chọn đích trực tiếp");
  assert.ok(h.includes('value="lead:l1"'), "ô đích có lựa chọn gắn trực tiếp vào lead này");
  ["na_lead_type", "na_lead_who", "na_lead_text", "na_lead_url", "na_lead_target"].forEach(id => doc._els.set(id, El(id)));
  setField("na_lead_deal", "d1"); setField("na_lead_target", "");
  setField("na_lead_type", "Note"); setField("na_lead_who", "zac"); setField("na_lead_text", "Theo deal như cũ"); setField("na_lead_url", "");
  sb.addActivityScoped("lead");
  const a1 = state().activities.find(x => x.text === "Theo deal như cũ");
  assert.ok(a1 && a1.deal === "d1" && a1.lead === undefined, "đích trống -> theo deal như Việc 7");
  setField("na_lead_target", "lead:l1"); setField("na_lead_text", "Gắn thẳng vào lead");
  sb.addActivityScoped("lead");
  const a2 = state().activities.find(x => x.text === "Gắn thẳng vào lead");
  assert.ok(a2 && a2.lead === "l1" && a2.deal === undefined, "chọn đích trực tiếp -> gắn lead, không qua deal");
});

test("LG-UI-5: sửa hoạt động — đổi chủ deal -> lead -> game luôn đúng 1 chủ; bỏ trống chủ bị chặn, dữ liệu không đổi", () => {
  const { sb, doc, setField, state } = loadApp();
  sb.editActivity("aDeal");
  const mw = doc._els.get("editBox").innerHTML;
  assert.ok(mw.includes('id="ea_deal"'), "form sửa giữ ô chọn chủ ea_deal");
  assert.ok(mw.includes('value="lead:lSolo"') && mw.includes('value="game:gSolo"'), "ô chọn chủ có cả lead + game");
  ["ea_type", "ea_who", "ea_when", "ea_text", "ea_url", "ea_deal"].forEach(id => doc._els.set(id, El(id)));
  const fill = ref => { setField("ea_type", "Call"); setField("ea_who", "zac"); setField("ea_when", "03-11-2026"); setField("ea_text", "Đã sửa chủ"); setField("ea_url", ""); setField("ea_deal", ref); };
  fill("lead:l1"); sb.saveActivity("aDeal");
  let a = state().activities.find(x => x.id === "aDeal");
  assert.ok(a.lead === "l1" && a.deal === undefined && a.game === undefined, "đổi sang lead: đúng 1 chủ lead");
  fill("game:g1"); sb.saveActivity("aDeal");
  a = state().activities.find(x => x.id === "aDeal");
  assert.ok(a.game === "g1" && a.deal === undefined && a.lead === undefined, "đổi sang game: đúng 1 chủ game");
  fill("d1"); sb.saveActivity("aDeal");
  a = state().activities.find(x => x.id === "aDeal");
  assert.ok(a.deal === "d1" && a.lead === undefined && a.game === undefined, "đổi về deal: đúng 1 chủ deal (hành vi cũ)");
  fill(""); sb.saveActivity("aDeal");
  a = state().activities.find(x => x.id === "aDeal");
  assert.ok(a.deal === "d1" && a.text === "Đã sửa chủ", "chủ rỗng bị chặn TRƯỚC mutate — text/chủ giữ nguyên");
  fill("lead:lDaXoa"); sb.saveActivity("aDeal");
  a = state().activities.find(x => x.id === "aDeal");
  assert.ok(a.deal === "d1", "chủ mồ côi bị chặn, giữ chủ cũ");
});

test("LG-UI-6: xoá hoạt động gắn lead/game ngay trong drawer của chủ; xoá lead/game xoá theo hoạt động trực tiếp, giữ hoạt động qua deal", () => {
  const { sb, drawerHTML, state } = loadApp();
  sb.openGame("gSolo");
  sb.deleteActivity("aGame");
  assert.ok(!state().activities.some(x => x.id === "aGame"), "xoá activity gắn game khỏi state");
  assert.ok(drawerHTML().includes("Game Chưa Deal"), "drawer game vẫn mở sau khi xoá");
  sb.deleteLead("lSolo");
  assert.ok(!state().activities.some(x => x.id === "aLead"), "xoá lead -> hoạt động gắn trực tiếp bị xoá theo (CASCADE)");
  assert.ok(state().activities.some(x => x.id === "aDeal"), "hoạt động qua deal của lead khác còn nguyên");
  sb.deleteGame("gSolo");
  assert.ok(state().activities.some(x => x.id === "aDeal"), "xoá game không đụng hoạt động qua deal");
});

test("LG-UI-7: drawer Member + drawer Công ty hiện hoạt động gắn lead kèm nhãn chủ Lead", () => {
  const { sb, drawerHTML, state } = loadApp();
  sb.openMember("zac");
  const hm = drawerHTML();
  assert.ok(hm.includes("Nhắn Zalo lead chưa deal"), "member thấy hoạt động gắn lead do mình thực hiện");
  assert.ok(hm.includes("📥 Lead:"), "nhãn chủ Lead hiện ở khối tổng hợp member");
  sb.openCompany("c1");
  const hc = drawerHTML();
  assert.ok(hc.includes("Nhắn Zalo lead chưa deal"), "công ty tổng hợp thêm hoạt động gắn trực tiếp vào lead thuộc công ty");
  assert.ok(hc.includes("Hoạt động qua deal cũ"), "tổng hợp qua deal cũ giữ nguyên");
});

test("LG-UI-8: createActivity validate — 0 chủ / 2 chủ (ref lạ) / chủ mồ côi đều bị chặn, không sinh bản ghi", () => {
  const { sb, state } = loadApp();
  const n = state().activities.length;
  assert.equal(sb.createActivity("", { text: "x" }), null);
  assert.equal(sb.createActivity("lead:lKhongCo", { text: "x" }), null);
  assert.equal(sb.createActivity("game:gKhongCo", { text: "x" }), null);
  assert.equal(sb.createActivity("dKhongCo", { text: "x" }), null);
  assert.equal(sb.createActivity("lead:l1", { text: "  " }), null, "nội dung rỗng bị chặn");
  assert.equal(state().activities.length, n, "không sinh bản ghi nào khi bị chặn");
  const ok = sb.createActivityFor("lead", "l1", { text: "Đường tường minh" });
  assert.ok(ok && ok.lead === "l1" && !("deal" in ok) && !("game" in ok), "createActivityFor(lead) sinh đúng 1 khoá");
});

/* ================= 1b) Ép đóng dấu BẢN GHI CHỦ khi hoạt động thay đổi =================
   QA độc lập phán KHÔNG ĐẠT mục 4/7 của đợt gốc: thêm activity vào
   Lead/Game solo -> updatedAt/updatedBy của chủ KHÔNG đổi, audit chỉ có
   mục của chính activity. Cơ chế sửa: stampCrmAndAudit tiền-tính tác
   động lên chủ từ diff activities rồi truyền forcedChanges vào
   SavaSys.stampCollection của chủ (deal/lead/game nhất quán). Fixture:
   mọi chủ mang dấu cũ 2020-01-02 / qaOld (OLD_STAMP ở trên). */
const ownerEntriesOf = (captured, type, id) => captured.filter(e => e.entityType === type && e.entityId === id);
function assertFreshStamp(ent, what) {
  assert.ok(ent, what + " phải tồn tại");
  assert.notEqual(ent.updatedAt, OLD_UPDATED, what + ": updatedAt phải rời mốc cũ 2020");
  assert.ok(new Date(ent.updatedAt).getTime() > new Date(OLD_UPDATED).getTime(), what + ": updatedAt phải là thời điểm thao tác");
  assert.equal(ent.updatedBy, "zac", what + ": updatedBy phải là member đang đăng nhập (zac)");
  assert.equal(ent.createdAt, OLD_CREATED, what + ": createdAt bất biến");
}
function assertOldStamp(ent, what) {
  assert.equal(ent.updatedAt, OLD_UPDATED, what + ": thao tác bị chặn -> updatedAt giữ nguyên mốc cũ");
  assert.equal(ent.updatedBy, OLD_BY, what + ": thao tác bị chặn -> updatedBy giữ nguyên qaOld");
}

test("LG-STAMP-1: THÊM activity vào lead solo -> lead đổi dấu + ĐÚNG 1 audit chủ (field activity, nhãn thêm) + audit của activity giữ nguyên + row sync mang dấu mới + lưu lại không đóng dấu lại", () => {
  const { sb, doc, setField, state, captured } = loadApp();
  sb.openLead("lSolo");
  ["na_lead_type", "na_lead_who", "na_lead_text", "na_lead_url"].forEach(id => doc._els.set(id, El(id)));
  setField("na_lead_deal", "lead:lSolo");
  setField("na_lead_type", "Call"); setField("na_lead_who", "zac");
  setField("na_lead_text", "Gọi xác nhận nhu cầu"); setField("na_lead_url", "");
  sb.addActivityScoped("lead");
  const lead = state().leads.find(x => x.id === "lSolo");
  assertFreshStamp(lead, "lead chủ");
  const oe = ownerEntriesOf(captured, "lead", "lSolo");
  assert.equal(oe.length, 1, "đúng 1 mục audit cho lead chủ: " + JSON.stringify(captured));
  assert.equal(oe[0].action, "update");
  assert.equal(oe[0].byMemberId, "zac");
  assert.equal(oe[0].changes.length, 1, "mục chủ chỉ chứa đúng change hoạt động");
  assert.equal(oe[0].changes[0].field, "activity");
  assert.ok(oe[0].changes[0].label.includes("thêm"), "nhãn phải đọc hiểu là thêm hoạt động: " + oe[0].changes[0].label);
  assert.ok(oe[0].changes[0].to.includes("Call") && oe[0].changes[0].to.includes("Gọi xác nhận nhu cầu"), "change phải kèm loại + tóm tắt activity: " + oe[0].changes[0].to);
  const ae = captured.filter(e => e.entityType === "activity" && e.action === "create");
  assert.equal(ae.length, 1, "mục audit create của chính activity giữ nguyên, đúng 1");
  assert.equal(captured.length, 2, "toàn lần lưu chỉ 2 mục: activity create + lead update (không trùng, không lan sang chủ khác)");
  /* Dấu đi qua adapter -> row của chủ thay đổi ở legacy_extra (điều kiện
     để diff-sync upsert hàng chủ lên server). */
  const rows = adapter.crmStateToRows(state());
  const rowLead = rows.leads.find(r => r.id === "lSolo");
  assert.equal(rowLead.legacy_extra.updatedAt, lead.updatedAt, "row leads mang updatedAt mới trong legacy_extra");
  assert.equal(rowLead.legacy_extra.updatedBy, "zac", "row leads mang updatedBy mới trong legacy_extra");
  const oldRowLead = adapter.crmStateToRows(fixture()).leads.find(r => r.id === "lSolo");
  assert.notDeepEqual(rowLead, oldRowLead, "row chủ sau thao tác phải KHÁC row cũ (diff-sync mới upsert)");
  /* Lưu lại không đổi gì thêm: snapshot đã tiến -> không đóng dấu lại,
     không sinh audit mới (máy khác nhận về cũng vậy). */
  const stamp1 = lead.updatedAt, nCap = captured.length;
  sb.save();
  assert.equal(state().leads.find(x => x.id === "lSolo").updatedAt, stamp1, "save() không đổi không được đóng dấu lại");
  assert.equal(captured.length, nCap, "save() không đổi không sinh thêm audit");
});

test("LG-STAMP-2: THÊM activity vào game solo -> game đổi dấu + ĐÚNG 1 audit chủ", () => {
  const { sb, doc, setField, state, captured } = loadApp();
  sb.openGame("gSolo");
  ["na_game_type", "na_game_who", "na_game_text", "na_game_url"].forEach(id => doc._els.set(id, El(id)));
  setField("na_game_deal", "game:gSolo");
  setField("na_game_type", "Demo"); setField("na_game_who", "zac");
  setField("na_game_text", "Chơi thử bản build mới"); setField("na_game_url", "");
  sb.addActivityScoped("game");
  assertFreshStamp(state().games.find(x => x.id === "gSolo"), "game chủ");
  const oe = ownerEntriesOf(captured, "game", "gSolo");
  assert.equal(oe.length, 1, "đúng 1 mục audit cho game chủ");
  assert.equal(oe[0].changes.length, 1);
  assert.equal(oe[0].changes[0].field, "activity");
  assert.ok(oe[0].changes[0].label.includes("thêm") && oe[0].changes[0].to.includes("Chơi thử bản build mới"));
  assert.equal(captured.filter(e => e.entityType === "activity" && e.action === "create").length, 1);
  assertOldStamp(state().leads.find(x => x.id === "lSolo"), "lead không liên quan");
});

test("LG-STAMP-3: SỬA activity (giữ nguyên chủ lead) -> lead đổi dấu + ĐÚNG 1 audit chủ nhãn sửa, from/to là tóm tắt cũ/mới", () => {
  const { sb, doc, setField, state, captured } = loadApp();
  sb.editActivity("aLead");
  ["ea_type", "ea_who", "ea_when", "ea_text", "ea_url", "ea_deal"].forEach(id => doc._els.set(id, El(id)));
  setField("ea_type", "Zalo"); setField("ea_who", "zac"); setField("ea_when", "03-11-2026");
  setField("ea_text", "Đã nhắn lại, chờ phản hồi"); setField("ea_url", ""); setField("ea_deal", "lead:lSolo");
  sb.saveActivity("aLead");
  assertFreshStamp(state().leads.find(x => x.id === "lSolo"), "lead chủ");
  const oe = ownerEntriesOf(captured, "lead", "lSolo");
  assert.equal(oe.length, 1, "đúng 1 mục audit cho lead chủ khi sửa activity");
  assert.equal(oe[0].changes.length, 1);
  assert.equal(oe[0].changes[0].field, "activity");
  assert.ok(oe[0].changes[0].label.includes("sửa"), "nhãn sửa: " + oe[0].changes[0].label);
  assert.ok(oe[0].changes[0].from.includes("Nhắn Zalo lead chưa deal"), "from = tóm tắt activity cũ");
  assert.ok(oe[0].changes[0].to.includes("Đã nhắn lại, chờ phản hồi"), "to = tóm tắt activity mới");
  assert.equal(captured.filter(e => e.entityType === "activity" && e.entityId === "aLead" && e.action === "update").length, 1, "audit update của chính activity giữ nguyên, đúng 1");
});

test("LG-STAMP-4: XOÁ activity gắn game -> game đổi dấu + ĐÚNG 1 audit chủ nhãn xoá", () => {
  const { sb, state, captured } = loadApp();
  sb.openGame("gSolo");
  sb.deleteActivity("aGame");
  assert.ok(!state().activities.some(x => x.id === "aGame"));
  assertFreshStamp(state().games.find(x => x.id === "gSolo"), "game chủ");
  const oe = ownerEntriesOf(captured, "game", "gSolo");
  assert.equal(oe.length, 1, "đúng 1 mục audit cho game chủ khi xoá activity");
  assert.equal(oe[0].changes.length, 1);
  assert.equal(oe[0].changes[0].field, "activity");
  assert.ok(oe[0].changes[0].label.includes("xoá"), "nhãn xoá: " + oe[0].changes[0].label);
  assert.ok(oe[0].changes[0].from.includes("Ghi chú game chưa deal"), "from = tóm tắt activity đã xoá");
  assert.equal(captured.filter(e => e.entityType === "activity" && e.entityId === "aGame" && e.action === "delete").length, 1, "audit delete của chính activity giữ nguyên, đúng 1");
});

test("LG-STAMP-5: SỬA activity ĐỔI CHỦ deal -> lead -> CẢ chủ cũ lẫn chủ mới đổi dấu + mỗi chủ đúng 1 audit (chuyển đi / chuyển đến)", () => {
  const { sb, doc, setField, state, captured } = loadApp();
  sb.editActivity("aDeal");
  ["ea_type", "ea_who", "ea_when", "ea_text", "ea_url", "ea_deal"].forEach(id => doc._els.set(id, El(id)));
  setField("ea_type", "Call"); setField("ea_who", "zac"); setField("ea_when", "03-11-2026");
  setField("ea_text", "Hoạt động qua deal cũ"); setField("ea_url", ""); setField("ea_deal", "lead:lSolo");
  sb.saveActivity("aDeal");
  const a = state().activities.find(x => x.id === "aDeal");
  assert.ok(a.lead === "lSolo" && a.deal === undefined, "activity đã đổi chủ sang lead");
  assertFreshStamp(state().deals.find(x => x.id === "d1"), "deal chủ cũ");
  assertFreshStamp(state().leads.find(x => x.id === "lSolo"), "lead chủ mới");
  const oeDeal = ownerEntriesOf(captured, "deal", "d1");
  assert.equal(oeDeal.length, 1, "chủ cũ đúng 1 mục audit");
  assert.equal(oeDeal[0].changes.length, 1);
  assert.equal(oeDeal[0].changes[0].field, "activity");
  assert.ok(oeDeal[0].changes[0].label.includes("chuyển đi"), "nhãn chủ cũ: " + oeDeal[0].changes[0].label);
  const oeLead = ownerEntriesOf(captured, "lead", "lSolo");
  assert.equal(oeLead.length, 1, "chủ mới đúng 1 mục audit");
  assert.equal(oeLead[0].changes.length, 1);
  assert.equal(oeLead[0].changes[0].field, "activity");
  assert.ok(oeLead[0].changes[0].label.includes("chuyển đến"), "nhãn chủ mới: " + oeLead[0].changes[0].label);
  assertOldStamp(state().games.find(x => x.id === "gSolo"), "game không liên quan");
  assert.equal(captured.filter(e => e.entityType === "activity" && e.entityId === "aDeal" && e.action === "update").length, 1);
});

test("LG-STAMP-6: thao tác BỊ CHẶN (chủ rỗng / chủ mồ côi / nội dung rỗng / lưu sửa với chủ rỗng) -> chủ giữ nguyên dấu, 0 audit chủ, 0 audit nào khác", () => {
  const { sb, doc, setField, state, captured } = loadApp();
  assert.equal(sb.createActivity("", { text: "x" }), null);
  assert.equal(sb.createActivity("lead:lKhongCo", { text: "x" }), null);
  assert.equal(sb.createActivity("lead:lSolo", { text: "   " }), null);
  sb.save();
  assert.equal(captured.length, 0, "không sinh bất kỳ mục audit nào khi mọi thao tác đều bị chặn");
  assertOldStamp(state().leads.find(x => x.id === "lSolo"), "lead sau create bị chặn + save()");
  sb.editActivity("aLead");
  ["ea_type", "ea_who", "ea_when", "ea_text", "ea_url", "ea_deal"].forEach(id => doc._els.set(id, El(id)));
  setField("ea_type", "Zalo"); setField("ea_who", "zac"); setField("ea_when", "03-11-2026");
  setField("ea_text", "Không được ghi vì chủ rỗng"); setField("ea_url", ""); setField("ea_deal", "");
  sb.saveActivity("aLead");
  setField("ea_deal", "lead:lDaXoa");
  sb.saveActivity("aLead");
  assert.equal(captured.length, 0, "saveActivity bị chặn không sinh audit");
  assertOldStamp(state().leads.find(x => x.id === "lSolo"), "lead sau saveActivity bị chặn");
  const a = state().activities.find(x => x.id === "aLead");
  assert.ok(a.lead === "lSolo" && a.text === "Nhắn Zalo lead chưa deal", "activity giữ nguyên khi lưu bị chặn");
});

test("LG-STAMP-7: THÊM activity vào DEAL (chủ thứ ba) cũng đổi dấu + ĐÚNG 1 audit chủ — 3 loại chủ nhất quán", () => {
  const { sb, state, captured } = loadApp();
  const a = sb.createActivity("d1", { type: "Call", who: "zac", text: "Gọi chốt deal một", url: "" });
  assert.ok(a && a.deal === "d1");
  sb.save();
  assertFreshStamp(state().deals.find(x => x.id === "d1"), "deal chủ");
  const oe = ownerEntriesOf(captured, "deal", "d1");
  assert.equal(oe.length, 1, "đúng 1 mục audit cho deal chủ");
  assert.equal(oe[0].changes.length, 1);
  assert.equal(oe[0].changes[0].field, "activity");
  assert.ok(oe[0].changes[0].label.includes("thêm") && oe[0].changes[0].to.includes("Gọi chốt deal một"));
  assertOldStamp(state().leads.find(x => x.id === "l1"), "lead gắn deal nhưng không phải chủ trực tiếp của activity");
});

/* ================= 2) Adapter ================= */
function crmStateBase() {
  return {
    members: [{ id: "zac", name: "Zac", role: "Admin", active: true }],
    companies: [{ id: "c1", name: "Studio Alpha", type: "Game studio", roles: {}, last: "" }],
    games: [{ id: "g1", title: "Game Một", own: "partner", company: "c1" }],
    leads: [{ id: "l1", name: "Lead Một", company: "c1", line: "publishing", status: "new" }],
    deals: [{ id: "d1", line: "publishing", title: "Deal Một", company: "c1", leads: ["l1"], game: "g1", stage: "contact", owner: "zac" }],
    tasks: [], activities: [], events: [],
  };
}

test("LG-AD-1: adapter — activity gắn lead/game ra row đúng cột, round-trip về đúng khoá; activity gắn deal không đổi", () => {
  const s = crmStateBase();
  s.activities = [
    { id: "aL", lead: "l1", type: "Call", who: "zac", when: "2026-11-03", text: "Gắn lead", url: "" },
    { id: "aG", game: "g1", type: "Note", who: "zac", when: "2026-11-03", text: "Gắn game", url: "" },
    { id: "aD", deal: "d1", type: "Note", who: "zac", when: "2026-11-03", text: "Gắn deal cũ", url: "" },
  ];
  const rows = adapter.crmStateToRows(s);
  const byId = Object.fromEntries(rows.activities.map(r => [r.id, r]));
  assert.deepEqual([byId.aL.deal_id, byId.aL.lead_id, byId.aL.game_id], [null, "l1", null]);
  assert.deepEqual([byId.aG.deal_id, byId.aG.lead_id, byId.aG.game_id], [null, null, "g1"]);
  assert.deepEqual([byId.aD.deal_id, byId.aD.lead_id, byId.aD.game_id], ["d1", null, null], "activity cũ: deal_id nguyên vẹn, 2 cột mới null");
  const back = adapter.crmRowsToState(rows, null);
  const bL = back.activities.find(a => a.id === "aL"), bG = back.activities.find(a => a.id === "aG"), bD = back.activities.find(a => a.id === "aD");
  assert.ok(bL.lead === "l1" && !("deal" in bL) && !("game" in bL), "round-trip lead: đúng 1 khoá");
  assert.ok(bG.game === "g1" && !("deal" in bG) && !("lead" in bG), "round-trip game: đúng 1 khoá");
  assert.ok(bD.deal === "d1" && !("lead" in bD) && !("game" in bD), "round-trip deal: như cũ");
});

test("LG-AD-2: adapter chặn 0 chủ / 2 chủ / chủ mồ côi — không thành row, không mất activity hợp lệ khác", () => {
  const s = crmStateBase();
  s.activities = [
    { id: "aNone", type: "Note", who: "zac", when: "2026-11-03", text: "Không chủ", url: "" },
    { id: "aTwo", deal: "d1", lead: "l1", type: "Note", who: "zac", when: "2026-11-03", text: "Hai chủ", url: "" },
    { id: "aOrphanLead", lead: "lX", type: "Note", who: "zac", when: "2026-11-03", text: "Lead mồ côi", url: "" },
    { id: "aOrphanGame", game: "gX", type: "Note", who: "zac", when: "2026-11-03", text: "Game mồ côi", url: "" },
    { id: "aOrphanDeal", deal: "dX", type: "Note", who: "zac", when: "2026-11-03", text: "Deal mồ côi", url: "" },
    { id: "aOk", lead: "l1", type: "Note", who: "zac", when: "2026-11-03", text: "Hợp lệ", url: "" },
  ];
  const rows = adapter.crmStateToRows(s);
  assert.deepEqual(rows.activities.map(r => r.id), ["aOk"], "chỉ activity đúng-1-chủ-tồn-tại thành row");
});

/* ================= 3) Mock sync: FK thật + CHECK đúng-1-chủ ================= */
const FKX = [
  ["companies", "members", null],
  ["games", "companies", "games_company_id_fkey"], ["games", "members", "games_owner_member_id_fkey"],
  ["leads", "companies", "leads_company_id_fkey"], ["leads", "members", "leads_owner_id_fkey"],
  ["deals", "companies", "deals_company_id_fkey"], ["deals", "games", "deals_game_id_fkey"], ["deals", "members", "deals_owner_id_fkey"],
  ["deal_leads", "deals", "deal_leads_deal_id_fkey"], ["deal_leads", "leads", "deal_leads_lead_id_fkey"],
  ["deal_terms", "deals", "deal_terms_deal_id_fkey"], ["deal_contracts", "deals", "deal_contracts_deal_id_fkey"],
  ["tasks", "members", "tasks_assignee_id_fkey"],
  ["activities", "deals", "activities_deal_id_fkey"], ["activities", "leads", "activities_lead_id_fkey"], ["activities", "games", "activities_game_id_fkey"],
  ["events", "members", null],
  ["event_links", "events", "event_links_event_id_fkey"], ["event_links", "companies", "event_links_company_id_fkey"], ["event_links", "leads", "event_links_lead_id_fkey"], ["event_links", "deals", "event_links_deal_id_fkey"],
  ["publishing_requests", "games", "publishing_requests_game_id_fkey"], ["publishing_requests", "companies", "publishing_requests_company_id_fkey"], ["publishing_requests", "members", "publishing_requests_requested_by_fkey"],
  ["publishing_revisions", "publishing_requests", "publishing_revisions_request_id_fkey"], ["publishing_revisions", "members", "publishing_revisions_reviewer_id_fkey"],
  ["publishing_revision_private", "publishing_requests", null], ["publishing_request_intake_private", "publishing_requests", null],
  ["market_observations", "members", "market_observations_created_by_fkey"],
  ["market_observation_audit", "market_observations", "market_observation_audit_observation_id_fkey"], ["market_observation_audit", "members", "market_observation_audit_actor_id_fkey"],
];
const COLX = { companies: "id", games: "company_id", leads: "company_id", deals: "company_id", deal_leads: "deal_id", deal_terms: "deal_id", deal_contracts: "deal_id", tasks: "assignee_id", activities: "deal_id", events: "id", event_links: "event_id", publishing_requests: "game_id", publishing_revisions: "request_id", publishing_revision_private: "request_id", publishing_request_intake_private: "request_id", market_observations: "id", market_observation_audit: "observation_id" };
const PARENT_COL = { deals_game_id_fkey: "game_id", deals_owner_id_fkey: "owner_id", games_owner_member_id_fkey: "owner_member_id", leads_owner_id_fkey: "owner_id", deal_leads_lead_id_fkey: "lead_id", event_links_company_id_fkey: "company_id", event_links_lead_id_fkey: "lead_id", event_links_deal_id_fkey: "deal_id", publishing_requests_company_id_fkey: "company_id", publishing_requests_requested_by_fkey: "requested_by", publishing_revisions_reviewer_id_fkey: "reviewer_id", market_observations_created_by_fkey: "created_by", market_observation_audit_actor_id_fkey: "actor_id", activities_lead_id_fkey: "lead_id", activities_game_id_fkey: "game_id" };
const PKX = { members: ["id"], companies: ["id"], company_partner_eval_archive: ["company_id"], games: ["id"], leads: ["id"], deals: ["id"], deal_terms: ["deal_id"], deal_contracts: ["deal_id"], deal_leads: ["deal_id", "lead_id"], tasks: ["id"], activities: ["id"], events: ["id"], event_links: ["event_id", "kind", "entity_id"], publishing_requests: ["id"], publishing_revisions: ["request_id", "revision_no"], publishing_revision_private: ["request_id", "revision_no"], publishing_request_intake_private: ["request_id"], market_observations: ["id"], market_observation_audit: ["observation_id", "seq"] };
const HAS_UPDATED_AT = new Set(["members", "companies", "games", "leads", "deals", "deal_terms", "deal_contracts", "tasks", "activities", "events", "publishing_requests", "publishing_request_intake_private", "publishing_revision_private", "market_observations"]);
const PARENT_TABLE_BY_KEY = {};
FKX.forEach(([t, p, fk]) => { if (fk) PARENT_TABLE_BY_KEY[fk] = p; });

function makeFkClient(seed) {
  const db = JSON.parse(JSON.stringify(seed));
  const attempts = [];
  function checkRow(t, row) {
    if (t === "activities") {
      const n = [row.deal_id, row.lead_id, row.game_id].filter(x => x !== null && x !== undefined).length;
      if (n !== 1) return { code: "23514", message: 'new row for relation "activities" violates check constraint "activities_exactly_one_owner"' };
    }
    for (const [ct, , fk] of FKX.filter(x => x[0] === t && x[2])) {
      const col = PARENT_COL[fk] || COLX[ct];
      const val = row[col];
      if (val === null || val === undefined || val === "") continue;
      const parent = PARENT_TABLE_BY_KEY[fk];
      if (!((db[parent] || []).some(r => String(r.id) === String(val)))) return { code: "23503", message: `insert or update on table "${ct}" violates foreign key constraint "${fk}"` };
    }
    return null;
  }
  function exec(b) {
    const t = b.table, rows = db[t] || (db[t] = []);
    if (b.op === "select") { let out = rows.slice(); if (b.inFilter) out = out.filter(r => b.inFilter.values.map(String).includes(String(r[b.inFilter.col]))); return { data: out.map(r => ({ ...r })), error: null }; }
    if (b.op === "upsert" || b.op === "insert") {
      for (const row of b.rows) { const err = checkRow(t, row); if (err) { attempts.push({ op: b.op, table: t, fkError: err.message }); return { data: null, error: err }; } }
      const saved = [];
      for (const row of b.rows) {
        const rec = { ...row };
        if (t === "publishing_requests") rec.entity_id = rec.game_id || rec.company_id;
        if (HAS_UPDATED_AT.has(t)) rec.updated_at = rec.updated_at || new Date().toISOString();
        const pk = PKX[t];
        const idx = rows.findIndex(r => pk.every(k => String(r[k]) === String(rec[k])));
        if (b.op === "insert" && idx >= 0) return { data: null, error: { message: "duplicate key" } };
        if (idx >= 0) { if (!(b.opts && b.opts.ignoreDuplicates)) rows[idx] = { ...rows[idx], ...rec }; saved.push(rows[idx]); }
        else { rows.push(rec); saved.push(rec); }
      }
      attempts.push({ op: b.op, table: t, rows: b.rows.map(r => r.id || r.deal_id || r.event_id || r.request_id) });
      return { data: saved, error: null };
    }
    if (b.op === "delete") { db[t] = rows.filter(r => !(b.inFilter && b.inFilter.values.map(String).includes(String(r[b.inFilter.col])))); return { data: null, error: null }; }
    if (b.op === "update") { rows.forEach(r => { if (String(r[b.eqFilter.col]) === String(b.eqFilter.val)) Object.assign(r, b.patch); }); return { data: null, error: null }; }
    return { data: [], error: null };
  }
  function builder(table) {
    const b = { table, op: "select", rows: null, opts: null, inFilter: null, eqFilter: null, patch: null };
    b.select = () => b; b.order = () => b;
    b.upsert = (rows, opts) => { b.op = "upsert"; b.rows = rows; b.opts = opts; return b; };
    b.insert = rows => { b.op = "insert"; b.rows = rows; return b; };
    b.delete = () => { b.op = "delete"; return b; };
    b.update = patch => { b.op = "update"; b.patch = patch; return b; };
    b.in = (col, values) => { b.inFilter = { col, values }; return b; };
    b.eq = (col, val) => { b.eqFilter = { col, val }; return b; };
    b.then = (res, rej) => Promise.resolve().then(() => exec(b)).then(res, rej);
    return b;
  }
  return { from: t => builder(t), _db: db, _attempts: attempts };
}
function makeLS() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _map: m }; }
function makeEl2() { return { style: {}, textContent: "", innerHTML: "", setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } }; }

async function setupFk() {
  const seedState = {
    members: [{ id: "zac", name: "Zac", role: "Admin", active: true }],
    companies: [{ id: "c1", name: "Studio Alpha", type: "Game studio", roles: { publishing: "Game studio" }, contact: "", phone: "", last: "" }],
    games: [], leads: [], deals: [], tasks: [], activities: [], events: [],
  };
  const tables = {};
  for (const [k, v] of Object.entries(adapter.crmStateToRows(seedState))) tables[k] = v;
  tables.publishing_requests = []; tables.publishing_revisions = []; tables.publishing_revision_private = []; tables.publishing_request_intake_private = []; tables.company_partner_eval_archive = []; tables.market_observations = []; tables.market_observation_audit = [];
  const client = makeFkClient(tables);
  const localStorage = makeLS();
  const sandbox = { console, setTimeout, clearTimeout, structuredClone, localStorage,
    document: { getElementById: () => null, createElement: () => makeEl2(), body: { appendChild() {} } } };
  sandbox.window = sandbox; sandbox.window.SavaAdapter = adapter;
  sandbox.window.PublishingData = { records: [] };
  vm.createContext(sandbox);
  vm.runInContext(read("supabase-data.js"), sandbox);
  const D = sandbox.window.SavaData;
  D.attach(client, "bd"); D.installHook();
  const loaded = await D.loadAll();
  D.setEnabled(true);
  /* Chiến lược cache 5/11/2026: cache localStorage là bản NHẸ — đọc/ghi
     state qua API state đầy đủ của tầng dữ liệu (bộ nhớ phiên). */
  const getState = () => D.readFullCrmState();
  const putState = s => D.writeFullCrmState(s);
  const drain = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setTimeout(r, 900)); };
  return { client, localStorage, D, loaded, getState, putState, drain };
}

test("LG-FK-1: lead MỚI + game MỚI + activity gắn trực tiếp sinh CÙNG một lần lưu -> cha trước con, 0 lỗi FK/CHECK", async () => {
  const { client, getState, putState, drain } = await setupFk();
  const s = getState();
  s.leads.push({ id: "lNew", name: "Lead Mới", company: "c1", line: "publishing", status: "new", ownerId: "zac", source: "", when: "2026-11-03" });
  s.games.push({ id: "gNew", title: "Game Mới", own: "partner", company: "c1" });
  s.activities.push({ id: "aLNew", lead: "lNew", type: "Call", who: "zac", when: "2026-11-03", text: "Gắn lead mới", url: "" });
  s.activities.push({ id: "aGNew", game: "gNew", type: "Note", who: "zac", when: "2026-11-03", text: "Gắn game mới", url: "" });
  putState(s);
  await drain();
  const fkErrs = client._attempts.filter(a => a.fkError);
  assert.equal(fkErrs.length, 0, "không attempt nào lỗi FK/CHECK: " + JSON.stringify(fkErrs));
  const aL = (client._db.activities || []).find(r => r.id === "aLNew");
  const aG = (client._db.activities || []).find(r => r.id === "aGNew");
  assert.ok(aL && aL.lead_id === "lNew" && aL.deal_id === null && aL.game_id === null, "row activity-lead đúng trên DB");
  assert.ok(aG && aG.game_id === "gNew" && aG.deal_id === null && aG.lead_id === null, "row activity-game đúng trên DB");
  const idx = (tbl, id) => client._attempts.findIndex(a => a.table === tbl && (a.rows || []).includes(id));
  assert.ok(idx("leads", "lNew") >= 0 && idx("leads", "lNew") < idx("activities", "aLNew"), "lead cha upsert TRƯỚC activity con");
  assert.ok(idx("games", "gNew") >= 0 && idx("games", "gNew") < idx("activities", "aGNew"), "game cha upsert TRƯỚC activity con");
});

test("LG-FK-2: lead cha bị xoá trên server, local thêm activity gắn lead đó -> tự upsert lại cha trước con (ensureParentRows cho lead_id)", async () => {
  const { client, getState, putState, drain } = await setupFk();
  const s0 = getState();
  s0.leads.push({ id: "lP", name: "Lead Cha", company: "c1", line: "publishing", status: "new", ownerId: "zac", source: "", when: "2026-11-03" });
  putState(s0);
  await drain();
  assert.ok((client._db.leads || []).some(r => r.id === "lP"), "lead đã lên server ở lần lưu đầu");
  client._db.leads = client._db.leads.filter(r => r.id !== "lP"); /* phiên khác xoá cha trên server */
  client._attempts.length = 0;
  const s = getState();
  s.activities.push({ id: "aLP", lead: "lP", type: "Note", who: "zac", when: "2026-11-03", text: "Hoạt động sau khi cha bị xoá server", url: "" });
  putState(s);
  await drain();
  const fkErrs = client._attempts.filter(a => a.fkError);
  assert.equal(fkErrs.length, 0, "0 lỗi FK nhờ ensure-parent: " + JSON.stringify(fkErrs));
  assert.ok((client._db.leads || []).some(r => r.id === "lP"), "lead cha được upsert lại");
  assert.ok((client._db.activities || []).some(r => r.id === "aLP" && r.lead_id === "lP"), "activity con lên DB sau cha");
});
