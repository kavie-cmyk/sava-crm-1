/* Sava Meta CRM — dữ liệu + hàm dùng chung cho cả 2 giao diện (BD & MKT).
   Hai trang cùng origin nên dùng chung 1 kho localStorage:
   BD tạo game/deal -> MKT thấy game chờ đánh giá -> MKT chấm -> BD thấy kết quả.
   Kết nối Publishing OS cũ (pubos.js) đã gỡ ngày 28/10/2026 — CRM hiện độc lập trên localStorage.
   Nếu sau này nối backend, chỉ cần thay loadState/storeState bằng gọi API, cấu trúc dữ liệu giữ nguyên. */
const STORE_KEY = "sava_crm_shared_v1";
const GAME_LINES = ["game_studio", "publishing"];
function isGameDeal(d) { return GAME_LINES.includes(d.line); }
/* Điều kiện studio THỐNG NHẤT (N11): công ty có vai trò ở mảng Publishing VÀ
   loại hình không phải Publisher. Mọi bề mặt Partner (drawer công ty, badge,
   bridge company summary) đều dùng đúng hàm này.
   Ghi chú: phía publishing.js nên dùng cùng hàm này nếu nạp được shared.js
   (nó được phơi qua window.isStudioCompany ở dưới) thay cho bản sao isStudio
   riêng trong publishing.js. */
function isStudioCompany(c) { return !!(c && c.roles && c.roles.publishing) && !/publisher/i.test(c.type || ""); }
if (typeof window !== "undefined") { window.isStudioCompany = isStudioCompany; }

const LINES = {
  game_studio: { name: "Game Studio", color: "#22c55e", target: "Publisher", desc: "Tìm publisher cho game của Sava",
    stages: [["target","Danh sách mục tiêu",5],["contacted","Đã liên hệ",10],["pitched","Đã pitch",25],["evaluating","Publisher thẩm định",40],["term","Term sheet / Đàm phán",65],["won","Ký hợp đồng — Won",100],["lost","Thua — Lost",0]],
    fields: [["publisher_regions","Khu vực publisher mạnh"],["build_version_sent","Bản build đã gửi"]] },
  publishing: { name: "Publishing", color: "#0ea5e9", target: "Studio / Indie dev", desc: "Tìm game của đối tác để phát hành",
    stages: [["sourcing","Tìm kiếm / Tiếp nhận",5],["screening","Sơ tuyển",15],["build_eval","Đánh giá build",30],["biz_eval","Đánh giá thương mại",50],["term","Term sheet / Đàm phán",70],["won","Ký hợp đồng — Won",100],["lost","Từ chối — Lost",0]],
    fields: [["support_needed","Hỗ trợ dev cần từ Sava"],["planned_investment","Đầu tư dự kiến của Sava"]] },
  ai: { name: "AI", color: "#8b5cf6", target: "Doanh nghiệp", desc: "Bán giải pháp AI cho doanh nghiệp",
    stages: [["prospect","Tiếp cận",5],["discovery","Khảo sát nhu cầu",15],["usecase","Xác định bài toán",30],["demo","Demo / Đề xuất POC",45],["poc","POC / Pilot",60],["quote","Báo giá / Đàm phán",80],["won","Ký hợp đồng — Won",100],["lost","Thua — Lost",0]],
    fields: [["use_case","Use case"],["data_readiness","Tình trạng dữ liệu"],["current_systems","Hệ thống cần tích hợp"],["poc_scope","Phạm vi POC"],["poc_result","Kết quả POC"]] },
  metaverse: { name: "Metaverse", color: "#f97316", target: "Doanh nghiệp", desc: "Bán giải pháp metaverse cho doanh nghiệp",
    stages: [["prospect","Tiếp cận",5],["discovery","Khảo sát nhu cầu",15],["concept","Concept / Đề xuất ý tưởng",35],["proto","Demo / Prototype",55],["quote","Báo giá / Đàm phán",75],["won","Ký hợp đồng — Won",100],["lost","Thua — Lost",0]],
    fields: [["use_case","Loại ứng dụng"],["platform_target","Nền tảng đích"],["expected_users","Người dùng đồng thời dự kiến"],["hardware_needed","Nhu cầu phần cứng"],["concept_url","Link concept / prototype"]] },
};
/* === Phân khúc ngành (vertical) — CHỈ deal mảng Metaverse ===
   deal.vertical: tên ngành dạng chuỗi (vd "Sản xuất"); trống/thiếu = chưa
   phân ngành. Danh sách ngành là danh sách MỞ: khởi đầu 4 ngành dưới đây,
   người dùng thêm ngành mới ngay trong form deal (lưu vào S.verticals) và
   ngành đã gán trên bất kỳ deal Metaverse nào cũng tự có mặt trong danh
   sách — nhờ vậy danh sách sống sót qua đồng bộ Supabase dù S.verticals ở
   local bị nạp lại từ máy chủ (deal.vertical đi qua deals.legacy_extra,
   xem supabase-adapter.js). */
const METAVERSE_VERTICALS_DEFAULT = ["Sản xuất", "Giáo dục", "Y tế", "Du lịch"];
const METAVERSE_VERTICAL_UNSET = "Chưa phân ngành";
/* Danh sách ngành CHÍNH THỨC: 4 ngành mặc định + ngành người dùng đã chủ
   động thêm qua UI (S.verticals). KHÔNG gồm giá trị chỉ tồn tại vì đã gán
   trên deal — giá trị như vậy được coi là "dữ liệu cũ" trong form (nhãn
   "(dữ liệu cũ)" theo quy ước selLegacy) cho tới khi người dùng thêm nó
   qua UI. Dùng cho: xét nhãn legacy trong dropdown form + ensureVertical. */
function metaverseVerticalsOfficial(s) {
  const out = [];
  const push = v => { if (typeof v !== "string") return; const t = v.trim(); if (t && !out.includes(t)) out.push(t); };
  METAVERSE_VERTICALS_DEFAULT.forEach(push);
  if (s && Array.isArray(s.verticals)) s.verticals.forEach(push);
  return out;
}
/* Danh sách ngành ĐẦY ĐỦ: chính thức + mọi giá trị đã gán trên deal
   Metaverse. Dùng cho bộ lọc pipeline (deal phải lọc được theo bất kỳ
   ngành nào đang gán trên deal, kể cả ngành chưa chính thức). */
function metaverseVerticals(s) {
  const out = metaverseVerticalsOfficial(s);
  const push = v => { if (typeof v !== "string") return; const t = v.trim(); if (t && !out.includes(t)) out.push(t); };
  if (s && Array.isArray(s.deals)) s.deals.forEach(d => { if (d && typeof d === "object" && d.line === "metaverse") push(d.vertical); });
  return out;
}
function dealVerticalLabel(d) {
  return (d && typeof d.vertical === "string" && d.vertical.trim()) ? d.vertical.trim() : METAVERSE_VERTICAL_UNSET;
}
if (typeof window !== "undefined") { window.MetaverseVerticals = { DEFAULTS: METAVERSE_VERTICALS_DEFAULT, UNSET: METAVERSE_VERTICAL_UNSET, list: metaverseVerticals, official: metaverseVerticalsOfficial, label: dealVerticalLabel }; }
const USERS = { zac: "Zac", linh: "Linh (BD)", tuan: "Tuấn (BD)", mai: "Mai (MKT)" };
/* Thành viên: danh sách gán việc THẬT nằm ở S.members ({id, name, role, active}).
   USERS ở trên chỉ còn là hằng dự phòng (fallback tên cho id cũ) + nguồn khởi tạo members.
   Tên hiển thị rút gọn + vai trò mặc định khi khởi tạo từ USERS: */
const MEMBER_DEFAULTS = { zac: ["Zac", "Admin"], linh: ["Linh", "BD"], tuan: ["Tuấn", "BD"], mai: ["Mai", "MKT"] };
function defaultMembers() {
  return Object.keys(USERS).map(id => {
    const d = MEMBER_DEFAULTS[id];
    return { id, name: d ? d[0] : String(USERS[id]).split(" (")[0], role: d ? d[1] : "Khác", active: true };
  });
}
function isValidMembers(m) {
  return Array.isArray(m) && m.every(x => x && typeof x === "object" && typeof x.id === "string" && x.id !== "" && typeof x.name === "string");
}
/* Helper dùng chung (cả trang BD lẫn module Publishing đọc qua window):
   memberList(s) -> mảng members (rỗng nếu state chưa có);
   memberName(s, id) -> tên hiển thị: members trước, fallback USERS[id], rồi chính id; id rỗng -> "—". */
function memberList(s) { return (s && Array.isArray(s.members)) ? s.members : []; }
function memberName(s, id) {
  if (id === undefined || id === null || id === "") return "—";
  const m = memberList(s).find(x => x.id === id);
  if (m && m.name) return m.name;
  if (Object.prototype.hasOwnProperty.call(USERS, id)) return USERS[id];
  return String(id);
}
if (typeof window !== "undefined") { window.memberList = memberList; window.memberName = memberName; window.defaultMembers = defaultMembers; }
/* === Thời gian cập nhật cuối + lịch sử chỉnh sửa (audit) ===
   Mọi entity CRM (deals/companies/leads/games/tasks/members/activities) và
   hồ sơ Publishing (requests) mang 3 trường HỆ THỐNG: createdAt, updatedAt,
   updatedBy (member id người sửa cuối). KHÔNG form nào có ô nhập cho chúng;
   đường lưu duy nhất (save() trong index.html, write() trong publishing.js)
   tự đóng dấu qua stampAndDiff() dưới đây:
   - Chỉ đóng dấu khi entity THẬT SỰ đổi dữ kiện (so deep trước/sau, bỏ qua
     chính 3 trường hệ thống + siêu dữ liệu cục bộ _crmRev/_crmTab).
   - Tạo mới -> đặt cả 3; sửa -> chỉ updatedAt/updatedBy đổi, createdAt bất biến.
   - Đồng thời sinh diff audit [{field,label,from,to}] — trường tham chiếu
     (owner/assignee/company/game/line…) lưu kèm nhãn đã resolve tại thời
     điểm ghi để đối tượng đích bị xoá sau này vẫn đọc được.
   3 trường đi qua supabase-adapter như field thường qua legacy_extra (mẫu
   deal.vertical / lead.mainContact) — KHÔNG cần cột/SQL mới.
   Entity cũ chưa có trường -> hiển thị "—", không bịa thời gian. */
const SYS_FIELDS = ["createdAt", "updatedAt", "updatedBy"];
const CRM_ENTITY_TYPES = [["deals", "deal"], ["companies", "company"], ["leads", "lead"], ["games", "game"], ["tasks", "task"], ["members", "member"], ["activities", "activity"]];
const FIELD_LABELS = {
  deal: { title: "Tiêu đề", line: "Mảng", stage: "Giai đoạn", owner: "Người phụ trách", company: "Công ty", game: "Game", due: "Hạn chốt", amount: "Giá trị", cur: "Tiền tệ", vertical: "Phân khúc ngành", leads: "Lead gắn kèm", custom: "Thông tin riêng theo mảng", term: "Điều khoản (Term)", contract: "Hợp đồng", idle: "Số ngày chưa cập nhật" },
  company: { name: "Tên công ty", type: "Loại hình", roles: "Vai trò theo mảng", last: "Tương tác cuối", partnerEval: "Đánh giá Partner (legacy)", partnerEvalMigrated: "Cờ chuyển dữ liệu Partner" },
  lead: { name: "Tên lead", company: "Công ty", person: "Người đầu mối", phone: "Điện thoại", line: "Mảng", source: "Nguồn", status: "Trạng thái", note: "Ghi chú", when: "Thời điểm", mainContact: "Đầu mối chính" },
  game: { title: "Tên game", own: "Loại game", company: "Studio sở hữu", genre: "Genre", platform: "Nền tảng", stage: "Giai đoạn phát triển", emoji: "Emoji", desc: "Mô tả", bdNote: "Ghi chú BD", buildUrl: "Link build", trailerUrl: "Link trailer", scores: "Điểm BD /10 (lưu trữ)", verdict: "Kết luận BD (lưu trữ)", mktEval: "Đánh giá MKT /10 (lưu trữ)" },
  task: { title: "Tiêu đề việc", assignee: "Người được giao", deal: "Deal liên kết", company: "Công ty liên kết", lead: "Lead liên kết", game: "Game liên kết", due: "Hạn (nhãn)", dueDate: "Hạn", done: "Đã xong", overdue: "Quá hạn" },
  member: { name: "Tên thành viên", role: "Vai trò", active: "Đang hoạt động" },
  activity: { deal: "Deal", type: "Loại hoạt động", who: "Người thực hiện", when: "Thời gian", text: "Nội dung", url: "Link hội thoại / tài liệu" },
  request: { kind: "Loại hồ sơ", entityId: "Hồ sơ CRM", requestedBy: "BD phụ trách", assignee: "MKT được giao", due: "Hạn đánh giá", requestNote: "Thông tin đầu vào / yêu cầu BD", source: "Link build / bằng chứng", build: "Build / phiên bản", status: "Trạng thái", intake: "Hồ sơ đầu vào", entitySnapshot: "Dữ liệu chụp hồ sơ" },
};
const REF_FIELDS = {
  deal: { owner: "member", company: "company", game: "game" },
  lead: { company: "company" },
  game: { company: "company" },
  task: { assignee: "member", deal: "deal", company: "company", lead: "lead", game: "game" },
  activity: { who: "member", deal: "deal" },
  request: { requestedBy: "member", assignee: "member", entityId: "entity" },
};
function cloneForDiff(v) {
  if (v === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
}
function stripSysFields(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out = {};
  Object.keys(obj).forEach(k => { if (!SYS_FIELDS.includes(k)) out[k] = obj[k]; });
  return out;
}
function deepEqualLoose(a, b) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqualLoose(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) { if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqualLoose(a[k], b[k])) return false; }
  return true;
}
function resolveRefLabel(state, refKind, id, entityType, entity) {
  if (id === undefined || id === null || id === "") return "";
  try {
    if (refKind === "member") return memberName(state, id);
    if (refKind === "entity" && entity) {
      const coll = entity.kind === "company" ? (state && state.companies) : (state && state.games);
      const t = (Array.isArray(coll) ? coll : []).find(x => x && x.id === id);
      return t ? String(t.name || t.title || id) : String(id);
    }
    const collMap = { company: "companies", game: "games", deal: "deals", lead: "leads" };
    const coll = state && state[collMap[refKind]];
    const t = (Array.isArray(coll) ? coll : []).find(x => x && x.id === id);
    if (t) return String(t.name || t.title || id);
  } catch (e) {}
  return String(id);
}
function auditValue(state, entityType, entity, field, v) {
  if (v === undefined || v === null || v === "") return "";
  const refs = REF_FIELDS[entityType] || {};
  if (refs[field]) {
    if (Array.isArray(v)) return v.map(x => resolveRefLabel(state, refs[field], x, entityType, entity)).join(", ");
    const lbl = resolveRefLabel(state, refs[field], v, entityType, entity);
    return lbl && lbl !== String(v) ? lbl + " (" + String(v) + ")" : String(v);
  }
  if (field === "leads" && Array.isArray(v)) return v.map(x => resolveRefLabel(state, "lead", x, entityType, entity)).join(", ");
  if (field === "line" && typeof LINES !== "undefined" && LINES[v]) return LINES[v].name;
  if (typeof v === "boolean") return v ? "Có" : "Không";
  if (typeof v === "object") { try { return JSON.stringify(v); } catch (e) { return String(v); } }
  return String(v);
}
function diffEntity(state, entityType, before, after) {
  const labels = FIELD_LABELS[entityType] || {};
  const b = stripSysFields(before || {}), a = stripSysFields(after || {});
  const keys = [];
  Object.keys(b).forEach(k => { if (!keys.includes(k)) keys.push(k); });
  Object.keys(a).forEach(k => { if (!keys.includes(k)) keys.push(k); });
  const changes = [];
  keys.forEach(k => {
    if (deepEqualLoose(b[k], a[k])) return;
    changes.push({ field: k, label: labels[k] || k, from: auditValue(state, entityType, after, k, b[k]), to: auditValue(state, entityType, after, k, a[k]) });
  });
  return changes;
}
/* Đóng dấu + sinh audit cho 1 danh sách entity. beforeMap: Map id -> bản
   chụp TRƯỚC khi sửa (đã clone). Trả mảng mục audit (chưa ghi). */
function stampCollection(state, list, beforeMap, entityType, byMemberId, nowIso) {
  const entries = [];
  if (!Array.isArray(list)) return entries;
  const seen = new Set();
  list.forEach(ent => {
    if (!ent || typeof ent !== "object" || !ent.id) return;
    seen.add(String(ent.id));
    const before = beforeMap ? beforeMap.get(String(ent.id)) : undefined;
    if (!before) {
      ent.createdAt = nowIso; ent.updatedAt = nowIso; ent.updatedBy = byMemberId || "";
      entries.push({ entityType, entityId: String(ent.id), at: nowIso, byMemberId: byMemberId || "", action: "create", changes: diffEntity(state, entityType, {}, ent) });
      return;
    }
    const changes = diffEntity(state, entityType, before, ent);
    if (!changes.length) return;
    ent.updatedAt = nowIso; ent.updatedBy = byMemberId || "";
    if (!ent.createdAt) ent.createdAt = before.createdAt || nowIso;
    entries.push({ entityType, entityId: String(ent.id), at: nowIso, byMemberId: byMemberId || "", action: "update", changes });
  });
  if (beforeMap) beforeMap.forEach((before, id) => {
    if (seen.has(id)) return;
    entries.push({ entityType, entityId: id, at: nowIso, byMemberId: byMemberId || "", action: "delete", changes: diffEntity(state, entityType, before, {}) });
  });
  return entries;
}
function snapshotById(list) {
  const m = new Map();
  (Array.isArray(list) ? list : []).forEach(x => { if (x && typeof x === "object" && x.id !== undefined && x.id !== null) m.set(String(x.id), cloneForDiff(x)); });
  return m;
}
/* Người sửa cuối: tên resolve theo members; member đã xoá -> nhãn dự phòng. */
function updatedByLabel(state, ent) {
  const id = ent && ent.updatedBy;
  if (!id) return "—";
  const m = memberList(state).find(x => x.id === id);
  if (m && m.name) return m.name;
  if (Object.prototype.hasOwnProperty.call(USERS, id)) return USERS[id];
  return "thành viên đã xoá (" + String(id).slice(0, 8) + ")";
}
function fmtSysTime(v) {
  if (!v) return "—";
  const dt = new Date(v);
  return Number.isNaN(dt.getTime()) ? String(v) : dt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}
if (typeof window !== "undefined") {
  window.SavaSys = { SYS_FIELDS, CRM_ENTITY_TYPES, FIELD_LABELS, stampCollection, snapshotById, diffEntity, updatedByLabel, fmtSysTime, cloneForDiff };
}
/* === Partner Eval hợp nhất (khung file 2 — Publishing Partner Selection) ===
   Implementation Partner DUY NHẤT dùng chung cho BD (drawer công ty trong
   index.html), module Publishing (adapter trong publishing-score.js) và bridge.
   Logic sao Y HỆT peCompute cũ trong index.html; khác biệt có chủ đích:
   - Key cổng "Tính liên tục của team" chuẩn hoá là "continuity" (dữ liệu cũ
     trong index.html dùng key "control" — normalize đọc cả hai, đầu ra chỉ
     còn "continuity").
   - compute() trả thêm scores (đã normalize) + productionScore
     (= scores.production) để adapter phía Publishing dùng thống nhất. */
const PARTNER_GATES = [["legal", "Pháp lý / Hợp đồng"], ["ip", "Quyền sở hữu IP / source code"], ["conflict", "Xung đột Publisher"], ["transparency", "Minh bạch Data"], ["continuity", "Tính liên tục của team"], ["integrity", "Uy tín / Compliance"]];
const PARTNER_PILLARS = [["track", "Track Record", 10], ["team", "Năng lực Team", 15], ["production", "Production & Execution", 15], ["data", "Data & Tech", 10], ["collaboration", "Hợp tác", 15], ["strategy", "Strategic Fit", 15], ["pipeline", "Tiềm năng Long-term", 10]];
const PARTNER_PROD_SUBS = [["capacity", "Capacity"], ["cadence", "Cadence"], ["milestone", "Milestone"], ["liveops", "LiveOps"]];
const PARTNER_GATE_STATUSES = ["Đạt", "Không đạt", "Chưa xác minh"];
/* === Thang trạng thái xác minh evidence HỢP NHẤT (đợt hợp nhất taxonomy) ===
   HẰNG DUY NHẤT cho trạng thái xác minh evidence trên toàn CRM: dùng cho
   Partner (kho sava_crm_shared_v1, c.partnerEval) lẫn các entry đánh giá phía
   Publishing (kho sava_publishing_v1, qua PublishingScore.statuses đọc từ đây
   khi chạy trong trình duyệt). Thứ tự = tiến độ xác minh tăng dần, cộng trạng
   thái đặc biệt "N/A" (không áp dụng) ở cuối.
   - Nhãn cũ "Partner cung cấp" (chiều trạng thái) đã ĐỔI TÊN thành
     "Đối tác đã gửi": normalizeEvidenceStatus() đổi nhãn khi đọc/ghi ở cả hai
     kho nên dữ liệu lưu cũ tự chuyển, không còn nhãn cũ trong UI.
   - Coverage CHỈ tính "Đã xác minh" (như trước); mục "N/A" bị LOẠI khỏi mẫu
     số coverage thay vì tính như chưa xác minh như trước. */
const EVIDENCE_STATUSES = ["Thiếu", "Chưa rõ", "Đã trao đổi", "Đối tác đã gửi", "Đã xác minh", "N/A"];
const PARTNER_EVIDENCE_STATUSES = EVIDENCE_STATUSES;
function normalizeEvidenceStatus(v) { return v === "Partner cung cấp" ? "Đối tác đã gửi" : v; }
/* Fallback DUY NHẤT cho trạng thái evidence lạ (A6/M1, QA vòng 3): đổi nhãn cũ
   rồi, nếu không nằm trong thang EVIDENCE_STATUSES, trả "Chưa rõ" — KHÔNG giữ
   verbatim, KHÔNG tự nâng lên "Đã trao đổi". Đây là hàm dùng chung đặt ở
   shared.js: PartnerEval.normalize, migrateState, adapter PublishingScore và
   bridge đều dùng nó; đợt 2 publishing.js normalizeRevision PHẢI dùng hàm này
   (window.normalizeEvidenceStatusStrict / PartnerEval.normalizeStatusStrict)
   thay cho normalizeStatus (chỉ đổi nhãn) khi chuẩn hoá entry của revision. */
function normalizeEvidenceStatusStrict(v) { const st = normalizeEvidenceStatus(v); return EVIDENCE_STATUSES.includes(st) ? st : "Chưa rõ"; }
if (typeof window !== "undefined") { window.EVIDENCE_STATUSES = EVIDENCE_STATUSES; window.normalizeEvidenceStatus = normalizeEvidenceStatus; window.normalizeEvidenceStatusStrict = normalizeEvidenceStatusStrict; }
const PARTNER_EVIDENCE_TOTAL = 11; /* 7 pillar + 4 ô con Production (mẫu số tối đa; "N/A" bị trừ ra khi tính coverage) */
function partnerRound1(n) { return Math.round((n + Number.EPSILON) * 10) / 10; }
function partnerScoreOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}
function partnerEvalEmpty() {
  const ev = { hardGate: {}, evidence: { productionSubs: {} }, scores: {}, dealFit: null, notesWeak: "", nextAction: "", reviewDate: "", reviewer: "", updatedAt: "" };
  PARTNER_GATES.forEach(([k]) => { ev.hardGate[k] = { status: "Chưa xác minh", note: "" }; });
  PARTNER_PILLARS.forEach(([k]) => { ev.evidence[k] = { note: "", status: "Chưa rõ" }; ev.scores[k] = null; });
  PARTNER_PROD_SUBS.forEach(([k]) => { ev.evidence.productionSubs[k] = { note: "", status: "Chưa rõ" }; });
  return ev;
}
function partnerEvalNormalize(raw) {
  const out = partnerEvalEmpty();
  if (!raw || typeof raw !== "object") return out;
  PARTNER_GATES.forEach(([k]) => {
    let g = raw.hardGate && raw.hardGate[k];
    /* Migration key cổng: dữ liệu cũ dùng "control" cho cổng continuity. */
    if ((!g || typeof g !== "object") && k === "continuity" && raw.hardGate) g = raw.hardGate.control;
    if (g && typeof g === "object") {
      if (PARTNER_GATE_STATUSES.includes(g.status)) out.hardGate[k].status = g.status;
      out.hardGate[k].note = String(g.note || "");
    }
  });
  const evIn = raw.evidence && typeof raw.evidence === "object" ? raw.evidence : {};
  PARTNER_PILLARS.forEach(([k]) => {
    const e = evIn[k];
    if (e && typeof e === "object") {
      /* Đổi nhãn trạng thái cũ "Partner cung cấp" -> "Đối tác đã gửi" khi nạp;
         các nấc giữa của thang hợp nhất đi qua NGUYÊN VẸN (không ép phẳng);
         trạng thái ngoài thang -> fallback duy nhất "Chưa rõ" (A6/M1). */
      out.evidence[k].status = normalizeEvidenceStatusStrict(e.status);
      out.evidence[k].note = String(e.note || "");
    }
  });
  const subsIn = evIn.productionSubs && typeof evIn.productionSubs === "object" ? evIn.productionSubs : {};
  PARTNER_PROD_SUBS.forEach(([k]) => {
    const e = subsIn[k];
    if (e && typeof e === "object") {
      out.evidence.productionSubs[k].status = normalizeEvidenceStatusStrict(e.status);
      out.evidence.productionSubs[k].note = String(e.note || "");
    }
  });
  PARTNER_PILLARS.forEach(([k]) => { out.scores[k] = partnerScoreOrNull(raw.scores ? raw.scores[k] : null); });
  out.dealFit = partnerScoreOrNull(raw.dealFit);
  out.notesWeak = String(raw.notesWeak || "");
  out.nextAction = String(raw.nextAction || "");
  out.reviewDate = String(raw.reviewDate || "");
  out.reviewer = String(raw.reviewer || "");
  out.updatedAt = String(raw.updatedAt || "");
  return out;
}
function partnerEvalCompute(raw) {
  const ev = partnerEvalNormalize(raw);
  const hs = PARTNER_GATES.map(([k]) => (ev.hardGate && ev.hardGate[k] && ev.hardGate[k].status) || "Chưa xác minh");
  const hardGate = hs.includes("Không đạt") ? "KHÔNG ĐẠT" : hs.every(s => s === "Đạt") ? "ĐẠT" : "CHỜ XÁC MINH";
  let verified = 0, excludedNA = 0;
  PARTNER_PILLARS.forEach(([k]) => { const st = ev.evidence && ev.evidence[k] && ev.evidence[k].status; if (st === "Đã xác minh") verified++; else if (st === "N/A") excludedNA++; });
  PARTNER_PROD_SUBS.forEach(([k]) => { const st = ev.evidence && ev.evidence.productionSubs && ev.evidence.productionSubs[k] && ev.evidence.productionSubs[k].status; if (st === "Đã xác minh") verified++; else if (st === "N/A") excludedNA++; });
  /* Mẫu số coverage = 11 mục TRỪ các mục "N/A" (không áp dụng). Không còn mục
     áp dụng nào (toàn bộ N/A) -> pct 0. Khi không có mục N/A nào, total vẫn 11
     và pct y hệt cách tính trước hợp nhất. */
  const coverageTotal = PARTNER_EVIDENCE_TOTAL - excludedNA;
  const coverage = { verified, total: coverageTotal, totalItems: PARTNER_EVIDENCE_TOTAL, excludedNA, pct: coverageTotal > 0 ? partnerRound1(verified / coverageTotal * 100) : 0 };
  const confidence = coverage.pct >= 90 ? "Cao" : coverage.pct >= 60 ? "Trung bình" : "Thấp";
  const evidenceGate = coverage.pct >= 80 ? "ĐẠT" : "CHƯA ĐẠT";
  const vals = PARTNER_PILLARS.map(([k]) => partnerScoreOrNull(ev.scores ? ev.scores[k] : null));
  const partnerFit = vals.some(v => v === null) ? null : partnerRound1(PARTNER_PILLARS.reduce((sum, [, , w], i) => sum + vals[i] * w, 0) / 5 / 90 * 100);
  const classification = (partnerFit === null || partnerFit === undefined) ? null : partnerFit >= 85 ? "Ưu tiên" : partnerFit >= 75 ? "Đạt" : partnerFit >= 65 ? "Có điều kiện" : "Cần xem xét";
  let conclusion;
  if (hardGate === "KHÔNG ĐẠT") conclusion = "Bị chặn";
  else if (hardGate === "CHỜ XÁC MINH") conclusion = "Chờ xác minh";
  else if (evidenceGate !== "ĐẠT") conclusion = "Thiếu Evidence";
  else conclusion = classification || "Chưa đủ điểm";
  let strongest = null, weakest = null;
  PARTNER_PILLARS.forEach(([k, label]) => {
    const s = ev.scores[k];
    if (s === null) return;
    if (!strongest || s > strongest.score) strongest = { key: k, label, score: s };
    if (!weakest || s < weakest.score) weakest = { key: k, label, score: s };
  });
  return { hardGate, coverage, confidence, evidenceGate, partnerFit, classification, conclusion, strongest, weakest, dealFit: ev.dealFit, scores: ev.scores, productionScore: ev.scores.production };
}
if (typeof window !== "undefined") { window.PartnerEval = { GATES: PARTNER_GATES, PILLARS: PARTNER_PILLARS, PROD_SUBS: PARTNER_PROD_SUBS, EVIDENCE_STATUSES, EVIDENCE_TOTAL: PARTNER_EVIDENCE_TOTAL, normalizeStatus: normalizeEvidenceStatus, normalizeStatusStrict: normalizeEvidenceStatusStrict, empty: partnerEvalEmpty, normalize: partnerEvalNormalize, compute: partnerEvalCompute }; }
/* Tiêu chí MKT chấm game — khác bộ tiêu chí thẩm định của BD */
const MKT_CRITERIA = [
  ["market", "Tiềm năng thị trường (độ lớn + đang hot?)"],
  ["audience", "Độ rõ ràng của tệp người chơi mục tiêu"],
  ["ua", "Khả năng làm UA / creative (dễ làm ads, video?)"],
  ["usp", "Điểm khác biệt nổi bật so với game cùng genre"],
  ["trend", "Độ hợp trend / mùa vụ phát hành"],
];

/* === Trạng thái TRỐNG — thay seed dữ liệu mẫu (dọn dữ liệu test 2026-10-30) ===
   Trước đây seed() trả về 14 công ty / 5 game / 12 deal / 5 lead / 6 task /
   5 activity MẪU và loadState() dùng nó mỗi khi kho rỗng hoặc hỏng — trong
   chế độ Supabase (chế độ duy nhất, mọi trang khóa sau đăng nhập) đó là nguồn
   hồi sinh dữ liệu test phía app, kèm nguy cơ diff-sync đẩy ngược lên máy
   chủ. NAY: app KHÔNG BAO GIỜ tự nạp dữ liệu mẫu nghiệp vụ nữa. Trạng thái
   khởi tạo/fallback duy nhất là TRỐNG (members được migrateState bổ sung từ
   defaultMembers — danh sách team thật, và luôn bị dữ liệu máy chủ ghi đè
   qua SavaData.loadAll() ngay sau đăng nhập). Fixture mẫu cho test nằm ở
   tests/ (bd-batch3 / lead-term-view-edit tự tiêm fixture riêng), KHÔNG nằm
   trong code production. */
function emptyState() { return {
  members: [],
  companies: [],
  games: [],
  deals: [],
  leads: [],
  tasks: [],
  activities: [],
  verticals: [],
};}
/* seed() giữ lại như bí danh tương thích ngược cho code/test cũ còn tham
   chiếu — NAY trả trạng thái TRỐNG, tuyệt đối không còn dữ liệu mẫu. */
function seed() { return emptyState(); }

/* === Lead: đầu mối chính của công ty (lead.mainContact) ===
   Một công ty có nhiều lead (người liên hệ); lead nào được tick là
   "đầu mối chính" thì mang mainContact = true. Quy tắc MỘT công ty — MỘT
   đầu mối chính (kiểu radio): tick lead này thì lead đang là main của
   CÙNG công ty tự bỏ tick; bỏ tick -> công ty tạm không có main (hợp lệ);
   lead của công ty khác không bao giờ bị đụng. Field đi qua
   leads.legacy_extra phía Supabase (như lead.phone, CỐ Ý không nằm trong
   LEAD_KNOWN của adapter) — không cần cột/SQL mới.
   MAIN_CONTACT_LABEL là chuỗi hiển thị DUY NHẤT toàn app ("★ Đầu mối
   chính"); publishing.js dùng hằng này thay vì viết lại chuỗi (giữ bất
   biến tĩnh của đợt bỏ field đầu mối cấp công ty: publishing.js không
   chứa nhãn cũ "Đầu mối chính" như một field của công ty). */
const MAIN_CONTACT_LABEL = "★ Đầu mối chính";
function isMainContact(l) { return !!(l && l.mainContact); }
/* Thẻ HTML cạnh tên lead (bề mặt index.html dùng class .chip). MỘT kiểu
   hiển thị duy nhất: mọi bề mặt HTML đều đi qua helper này. */
function mainContactBadgeHTML(l) {
  return isMainContact(l) ? ` <span class="chip" style="background:#d97706">${MAIN_CONTACT_LABEL}</span>` : "";
}
/* === Nhãn LOẠI đối tượng ở vùng tiêu đề khi MỞ chi tiết (drawer/dialog) ===
   Một helper DUY NHẤT (typeBadgeHTML) + một class CSS DUY NHẤT (.type-badge,
   định nghĩa giống hệt nhau trong index.html và publishing.css) cho mọi bề
   mặt mở một mục: drawer Deal/Company/Lead/Game/Member, form việc, one-pager
   Partner (phía BD) và dialog review + chi tiết mechanic (phía Publishing,
   dùng chung cho cả BD publishing.html và MKT mkt.html). Bộ icon + tên gọi
   TÁI SỬ DỤNG đúng bộ chip liên kết việc đã ship ở commit 732fcc8
   (TASK_LINK_META trong index.html: 📋 Deal / 🏢 Công ty / 📥 Lead / 🎮 Game)
   và mở rộng cùng phong cách cho các loại còn lại: ✅ Công việc (nhãn mục
   "✅ Việc liên quan" sẵn có), 👤 Thành viên (icon drawer member sẵn có),
   🕘 Hoạt động, 📊 Mechanic (mục thị trường phía Publishing). Hai loại hồ sơ
   đánh giá phía Publishing dùng đúng cách gọi của app: request kind=company
   là "Đánh giá Partner" (đúng tiền tố tiêu đề dialog sẵn có) và kind=game
   là "Đánh giá Game". Badge CHỈ chứa loại (không chứa tên đối tượng) nên
   tên rỗng/thiếu — app tự fallback "—" ở tiêu đề — badge vẫn hiện đúng.
   Màu nền truyền qua style inline theo đúng tiền lệ .chip của app. */
const TYPE_BADGE_META = {
  deal: { icon: "📋", noun: "Deal", color: "#2563eb" },
  company: { icon: "🏢", noun: "Công ty", color: "#0f766e" },
  lead: { icon: "📥", noun: "Lead", color: "#b45309" },
  game: { icon: "🎮", noun: "Game", color: "#7c3aed" },
  task: { icon: "✅", noun: "Công việc", color: "#15803d" },
  member: { icon: "👤", noun: "Thành viên", color: "#475569" },
  activity: { icon: "🕘", noun: "Hoạt động", color: "#64748b" },
  market: { icon: "📊", noun: "Mechanic / Thị trường", color: "#137e90" },
  "company-review": { icon: "🏢", noun: "Đánh giá Partner", color: "#0f766e" },
  "game-review": { icon: "🎮", noun: "Đánh giá Game", color: "#7c3aed" },
};
function typeBadgeHTML(type) {
  const m = TYPE_BADGE_META[type];
  if (!m) return "";
  return `<span class="type-badge" data-type="${type}" style="background:${m.color}">${m.icon} ${m.noun}</span>`;
}
if (typeof window !== "undefined") { window.TYPE_BADGE_META = TYPE_BADGE_META; window.typeBadgeHTML = typeBadgeHTML; }
/* Thực thi radio Ở TẦNG DỮ LIỆU: gọi NGAY SAU khi gán dữ liệu lead trong
   đường lưu lead (saveLead ở index.html) — mọi đường sửa lead đi qua
   saveLead đều nhất quán, không phụ thuộc UI. Lead chưa gắn công ty
   (company rỗng) không thuộc công ty nào nên không radio với ai. */
function enforceLeadMainContact(leads, lead) {
  if (!Array.isArray(leads) || !lead || !lead.mainContact) return;
  const compId = lead.company || "";
  if (!compId) return;
  leads.forEach(o => {
    if (o && o !== lead && o.id !== lead.id && (o.company || "") === compId && o.mainContact) o.mainContact = false;
  });
}

/* Migration mô hình Lead–Company–Deal:
   - deal.leads là nguồn sự thật DUY NHẤT cho quan hệ deal↔lead (mảng id lead).
   - lead.company trỏ tới 1 công ty; lead.person là người đầu mối cụ thể.
   Dữ liệu cũ không có các trường này -> bổ sung tại đây rồi lưu lại.
   Chỉ migrate khi trường THỰC SỰ thiếu (undefined): lead.company === "" nghĩa là
   đã chủ động gỡ công ty (vd xóa công ty) nên KHÔNG tự tạo lại công ty. */
function migrateState(s) {
  /* A1/A12: mảng (vd "[1,2]") hay scalar KHÔNG phải state hợp lệ — coi như
     hỏng và về trạng thái TRỐNG, tuyệt đối không trả mảng cho app. (loadState còn đi
     thêm đường backup + banner trước khi gọi migrateState — xem dưới.) */
  if (!s || typeof s !== "object" || Array.isArray(s)) return emptyState();
  /* Strip di sản Publishing OS (pubos.js đã gỡ 28/10/2026): chỉ xóa đúng các key
     pubos/pubosPending trên deal, pubos trên game và pubosWithdrawals ở state gốc.
     Chạy mỗi lần load qua migrateState — idempotent, không đụng dữ liệu khác. */
  delete s.pubosWithdrawals;
  /* Thành viên (S.members) — S1b: lọc/sửa TỪNG phần tử thay vì reset toàn bộ
     khi có 1 phần tử hỏng. Phần tử không phải object hoặc thiếu id (không phải
     string / rỗng) -> loại bỏ; thiếu name (không phải string / rỗng) -> name = id;
     role/active chuẩn hoá như trước. Chỉ khi s.members không phải mảng, hoặc
     sau lọc mảng rỗng, mới dùng defaultMembers().
     Lựa chọn: giữ nguyên hàm isValidMembers ở trên (không xoá) để tương thích
     ngược nếu code ngoài còn tham chiếu, nhưng migrateState KHÔNG dùng nó nữa. */
  if (!Array.isArray(s.members)) { s.members = defaultMembers(); }
  else {
    const cleanedMembers = [];
    const seenMemberIds = new Set();
    s.members.forEach(m => {
      if (!m || typeof m !== "object" || Array.isArray(m)) return;
      if (typeof m.id !== "string" || m.id === "") return;
      /* A12: member trùng id chỉ giữ phần tử ĐẦU TIÊN. */
      if (seenMemberIds.has(m.id)) return;
      seenMemberIds.add(m.id);
      if (typeof m.name !== "string" || m.name === "") m.name = m.id;
      if (!["BD", "MKT", "Admin", "Khác"].includes(m.role)) m.role = "Khác";
      if (typeof m.active !== "boolean") m.active = true;
      cleanedMembers.push(m);
    });
    s.members = cleanedMembers.length ? cleanedMembers : defaultMembers();
  }
  if (Array.isArray(s.deals)) s.deals.forEach(d => { if (d && typeof d === "object") { delete d.pubos; delete d.pubosPending; } });
  if (Array.isArray(s.games)) s.games.forEach(g => { if (g && typeof g === "object") delete g.pubos; });
  /* Hợp nhất taxonomy evidence: đổi nhãn trạng thái lưu trữ cũ
     "Partner cung cấp" -> "Đối tác đã gửi" ngay trên c.partnerEval (kho CRM)
     mỗi lần migrateState chạy (đọc/ghi) — idempotent, chỉ đụng đúng field
     status của evidence pillar + ô con Production. Kho Publishing
     (sava_publishing_v1) được đổi nhãn ở publishing.js read()/normalizeRevision. */
  if (Array.isArray(s.companies)) s.companies.forEach(c => {
    const evd = c && typeof c === "object" && !Array.isArray(c) && c.partnerEval && typeof c.partnerEval === "object" ? c.partnerEval.evidence : null;
    if (!evd || typeof evd !== "object") return;
    /* A6/M1: trạng thái lạ -> "Chưa rõ" qua fallback strict dùng chung,
       không giữ verbatim như bản cũ (chỉ đổi nhãn). */
    Object.values(evd).forEach(e => { if (e && typeof e === "object" && typeof e.status === "string") e.status = normalizeEvidenceStatusStrict(e.status); });
    const subs = evd.productionSubs;
    if (subs && typeof subs === "object") Object.values(subs).forEach(e => { if (e && typeof e === "object" && typeof e.status === "string") e.status = normalizeEvidenceStatusStrict(e.status); });
  });
  if (!Array.isArray(s.companies)) s.companies = [];
  if (!Array.isArray(s.deals)) s.deals = [];
  if (!Array.isArray(s.leads)) s.leads = [];
  if (!Array.isArray(s.games)) s.games = [];
  if (!Array.isArray(s.tasks)) s.tasks = [];
  if (!Array.isArray(s.activities)) s.activities = [];
  /* Danh sách ngành Metaverse do người dùng thêm (S.verticals): chuẩn hoá
     thành mảng chuỗi đã trim, bỏ trùng, giữ thứ tự; kiểu lạ -> []. Ngành
     đã gán trên deal vẫn được metaverseVerticals() suy ra kể cả khi mảng
     này bị mất (vd nạp lại từ Supabase), nên đây chỉ là lớp bổ sung. */
  if (!Array.isArray(s.verticals)) s.verticals = [];
  else {
    const seenV = new Set(); const cleanedV = [];
    s.verticals.forEach(v => { if (typeof v === "string") { const t = v.trim(); if (t && !seenV.has(t)) { seenV.add(t); cleanedV.push(t); } } });
    s.verticals = cleanedV;
  }
  /* N10: lọc phần tử KHÔNG phải object (null, chuỗi rác, số...) khỏi mọi mảng
     dữ liệu — một phần tử hỏng không được làm crash các vòng lặp phía sau.
     Phần tử bị loại được ĐẾM và đặt cờ cảnh báo qua window.CRM_LOAD_ISSUE
     (type "sanitized", kèm số lượng) để index.html hiện banner; nếu đã có cờ
     "corrupt" từ loadState thì không ghi đè, chỉ bổ sung số đếm riêng. */
  let droppedNonObjects = 0;
  ["companies", "games", "deals", "leads", "tasks", "activities", "members"].forEach(k => {
    if (Array.isArray(s[k])) {
      const before = s[k].length;
      /* A12: đường xử lý đã chọn cho entity sai kiểu — phần tử là MẢNG hoặc
         scalar/null (deal/lead là mảng/scalar cũng vậy) bị LOẠI khỏi danh
         sách và tính vào droppedNonObjects/cờ sanitized như phần tử hỏng,
         KHÔNG cố chuẩn hoá mảng thành object. */
      s[k] = s[k].filter(x => !!x && typeof x === "object" && !Array.isArray(x));
      droppedNonObjects += before - s[k].length;
    }
  });
  if (droppedNonObjects > 0) {
    try {
      const w = (typeof window !== "undefined" && window) || (typeof globalThis !== "undefined" ? globalThis : null);
      if (w) {
        if (!w.CRM_LOAD_ISSUE) w.CRM_LOAD_ISSUE = { type: "sanitized", dropped: droppedNonObjects, at: new Date().toISOString() };
        w.CRM_SANITIZED_DROPPED = droppedNonObjects;
      }
    } catch (e) {}
  }
  /* N2 + A12: mọi company phải có roles là object THUẦN (drawer/section đọc
     c.roles.*) — roles là MẢNG cũng coi như sai cấu trúc, thay bằng {}. */
  s.companies.forEach(c => { if (c && typeof c === "object" && (!c.roles || typeof c.roles !== "object" || Array.isArray(c.roles))) c.roles = {}; });
  /* A12: ép kiểu ở biên — id của entity do shared.js quản lý và các khóa
     ngoại dạng SỐ được ép về CHUỖI (định danh chuẩn trong app là chuỗi);
     id/khóa ngoại là chuỗi giữ nguyên, kiểu lạ khác để nguyên cho các lớp
     trên tự xử lý như trước. */
  ["companies", "games", "deals", "leads", "tasks", "activities"].forEach(k => {
    s[k].forEach(x => { if (typeof x.id === "number" && Number.isFinite(x.id)) x.id = String(x.id); });
  });
  s.games.forEach(g => { if (typeof g.company === "number" && Number.isFinite(g.company)) g.company = String(g.company); });
  s.deals.forEach(d => {
    ["company", "game"].forEach(f => { if (typeof d[f] === "number" && Number.isFinite(d[f])) d[f] = String(d[f]); });
  });
  s.leads.forEach(l => { if (typeof l.company === "number" && Number.isFinite(l.company)) l.company = String(l.company); });
  s.tasks.forEach(t => { if (typeof t.deal === "number" && Number.isFinite(t.deal)) t.deal = String(t.deal); });
  s.activities.forEach(a => { if (typeof a.deal === "number" && Number.isFinite(a.deal)) a.deal = String(a.deal); });
  (s.deals || []).forEach(d => { if (!Array.isArray(d.leads)) d.leads = []; else d.leads = d.leads.map(v => (typeof v === "number" && Number.isFinite(v)) ? String(v) : v); });
  let migSeq = 0;
  const newCompanyId = () => {
    let id;
    do { migSeq++; id = "c" + Date.now() + "m" + migSeq; } while (s.companies.some(c => c.id === id));
    return id;
  };
  (s.leads || []).forEach(l => {
    if (l.person === undefined || l.person === null) l.person = "";
    if (l.company === undefined || l.company === null) {
      const found = s.companies.find(c => c.name === l.name);
      if (found) { l.company = found.id; }
      else {
        const target = (LINES[l.line] && LINES[l.line].target) || "Đối tác";
        const nc = { id: newCompanyId(), name: l.name || "Công ty của lead (mẫu)", type: target, roles: { [l.line]: target }, last: "Vừa tạo" };
        s.companies.push(nc);
        l.company = nc.id;
      }
    }
  });
  /* N2 (tiếp): company vừa tạo trong migration lead ở trên cũng phải có roles object. */
  s.companies.forEach(c => { if (c && typeof c === "object" && (!c.roles || typeof c.roles !== "object" || Array.isArray(c.roles))) c.roles = {}; });
  /* Đổi tên lead mẫu: lead là NGƯỜI đầu mối, không phải công ty. Dữ liệu đã lưu
     từ seed cũ còn mang tên công ty làm tên lead (l1–l5) -> đổi sang tên người
     tương ứng theo bảng dưới đây. CHỈ đổi khi id thuộc {l1..l5} VÀ name khớp
     CHÍNH XÁC tên mẫu cũ của đúng lead đó: lead user đã tự sửa tên (không khớp
     chính xác) không bị đụng; công ty c10–c14 trùng tên cũ GIỮ NGUYÊN (chỉ sửa
     s.leads). Đặt sau migration gắn lead↔company ở trên để việc tra công ty
     theo tên cũ không bị ảnh hưởng. Idempotent: chạy lại không đổi gì thêm
     vì tên mới không nằm trong bảng tên cũ. */
  const LEAD_SAMPLE_RENAMES = {
    l1: ["Studio Mooncat (mẫu)", "Nguyễn Tuấn Minh (mẫu)"],
    l2: ["Publisher SG (mẫu)", "Rachel Tan (mẫu)"],
    l3: ["Logistics Pro (mẫu)", "Trần Văn Hùng (mẫu)"],
    l4: ["Resort biển (mẫu)", "Phạm Ngọc Lan (mẫu)"],
    l5: ["Dev indie: Cá (mẫu)", "Đỗ Hải Nam (Cá) (mẫu)"],
  };
  s.leads.forEach(l => {
    const pair = LEAD_SAMPLE_RENAMES[l.id];
    if (pair && l.name === pair[0]) l.name = pair[1];
  });
  /* === Migration MỘT LẦN: đầu mối chính cấp công ty -> Lead (chốt nghiệp vụ) ===
     Nguyên tắc đích: người liên hệ của công ty = chính các Lead của công ty
     đó, MỘT nguồn sự thật duy nhất. Field cũ c.contact ("Đầu mối chính",
     text tự do) + c.phone đi kèm khối đầu mối đó (mọi bề mặt cũ đều hiện
     phone cặp ngay dưới/trong khối contact; app KHÔNG có SĐT tổng đài/hotline
     riêng của công ty) là trùng lặp với Lead nên bị loại khỏi mọi bề mặt.
     Dữ liệu cũ KHÔNG được mất: công ty nào còn giá trị đầu mối có nghĩa
     (khác rỗng/khác dấu "—" giữ chỗ) mà chưa có lead tương ứng -> tạo 1 Lead
     thuộc công ty đó:
       - name = nguyên giá trị đầu mối (lead là NGƯỜI liên hệ); person = cùng
         giá trị đó (đúng tiền lệ cũ: company.contact vốn được ghi từ
         lead.person ở các đường tạo công ty từ lead);
       - phone = c.phone (Lead mang thêm field phone; phía Supabase field
         này đi qua legacy_extra của bảng leads — xem supabase-adapter.js —
         nên KHÔNG cần cột/SQL mới);
       - line suy từ vai trò theo mảng đầu tiên của công ty (thứ tự LINES),
         không có thì lấy line của deal đầu tiên của công ty, cuối cùng mới
         mặc định "publishing" (mảng có lead phổ biến nhất trong app);
       - status "new", when = ngày ISO hôm nay;
       - mainContact = true (lead này VỐN là đầu mối chính của công ty —
         nó được sinh ra từ field đầu mối cũ), TRỪ KHI công ty đã có lead
         main khác rồi: giữ main hiện hữu, lead migrate sinh ra không
         giành (mainContact = false). Công ty có sẵn lead từ trước mà
         không qua migration này thì KHÔNG tự đoán main — để user tick.
     Chống trùng + idempotent:
       - Marker RIÊNG TỪNG CÔNG TY c.contactLeadMigrated = true, đặt ngay
         khi công ty đã được xét migration (kể cả khi đã có lead trùng /
         đầu mối là giữ chỗ): chạy lại không tạo thêm, và user XÓA lead đã
         migrate (hoặc lead trùng có sẵn) thì lần nạp sau KHÔNG hồi sinh
         lead từ field cũ nữa. Marker này không nằm trong COMPANY_KNOWN của
         adapter nên tự đi qua companies.legacy_extra và sống sót qua
         đồng bộ Supabase (không cần SQL).
       - Kể cả chưa có marker, một lead của CÙNG công ty mà name HOẶC person
         (trim, không phân biệt hoa/thường) trùng nguyên giá trị đầu mối
         cũng được coi là lead tương ứng -> không tạo trùng. Lead user đã
         tự tạo/sửa không bao giờ bị đụng (chỉ đọc để đối chiếu).
     Field cũ SAU migration: c.contact/c.phone được GIỮ NGUYÊN trong dữ
     liệu thô (localStorage + cột companies.contact/phone phía Supabase,
     adapter giữ mapping như cũ để round-trip không mất dữ liệu và shape
     state không lệch khỏi dữ liệu máy chủ — lệch shape từng gây vòng lặp
     reload 30/10/2026), nhưng KHÔNG còn bề mặt nào đọc/hiển thị/ghi:
     form/drawer/danh sách công ty, drawer deal, one-pager Partner và khối
     thông tin phía đánh giá đều lấy đầu mối từ danh sách Lead; mọi đường
     tạo công ty mới không còn đặt contact/phone nữa. Đặt SAU migration
     gắn lead<->company ở trên để công ty vừa được tạo từ lead mồ côi
     (contact cũ vốn ghi từ chính lead.person đó) được dedup đúng bằng
     person, không sinh lead trùng. */
  const CONTACT_PLACEHOLDERS = new Set(["", "—", "-", "–"]);
  const normContactKey = v => String(v || "").trim().toLowerCase();
  let migLeadSeq = 0;
  const newLeadId = () => {
    let id;
    do { migLeadSeq++; id = "l" + Date.now() + "m" + migLeadSeq; } while (s.leads.some(l => l.id === id));
    return id;
  };
  s.companies.forEach(c => {
    if (!c || typeof c !== "object" || Array.isArray(c)) return;
    if (c.contactLeadMigrated) return;
    /* Công ty tạo bởi bản mới không còn field contact/phone -> không có gì để migrate, cũng không gắn marker thừa. */
    if (!("contact" in c) && !("phone" in c)) return;
    c.contactLeadMigrated = true;
    const contactVal = String(c.contact || "").trim();
    if (CONTACT_PLACEHOLDERS.has(contactVal)) return;
    const key = normContactKey(contactVal);
    const exists = s.leads.some(l => l && l.company === c.id && (normContactKey(l.name) === key || normContactKey(l.person) === key));
    if (exists) return;
    const roleLine = Object.keys(LINES).find(k => c.roles && c.roles[k]);
    const dealLine = (s.deals || []).map(d => d && d.company === c.id ? d.line : null).find(x => x && LINES[x]);
    /* Lead migrate sinh ra vốn là đầu mối chính -> mainContact = true,
       trừ khi công ty đã có main khác (không giành main hiện hữu). */
    const companyHasMain = s.leads.some(l => l && l.company === c.id && l.mainContact);
    s.leads.push({
      id: newLeadId(),
      name: contactVal,
      company: c.id,
      person: contactVal,
      phone: String(c.phone || "").trim(),
      mainContact: !companyHasMain,
      line: roleLine || dealLine || "publishing",
      source: "",
      status: "new",
      note: "",
      when: new Date().toISOString().slice(0, 10),
    });
  });
  return s;
}
/* S1a: dữ liệu localStorage hỏng (JSON.parse lỗi hoặc migrateState ném lỗi)
   KHÔNG được lặng lẽ reset rồi ghi đè mất dữ liệu thật. Hành vi mới:
   (1) sao lưu raw nguyên văn vào key backup (ghi đè bản backup cũ — chỉ giữ
       sự cố hỏng mới nhất, đơn giản và truy vết được qua field `at`);
   (2) đặt window.CRM_LOAD_ISSUE để index.html hiển thị cảnh báo;
   (3) KHÔNG ghi đè key chính trong loadState — raw hỏng giữ nguyên cho tới
       lần save() hợp lệ đầu tiên;
   (4) trả migrateState(emptyState()) — trạng thái TRỐNG — để app vẫn chạy. Raw rỗng -> hành vi như cũ. */
/* Đường dữ liệu hỏng DÙNG CHUNG cho mọi dạng raw không dùng được (A1/A2):
   backup raw vào key corrupt_backup + đặt cờ CRM_LOAD_ISSUE (banner) +
   trả trạng thái TRỐNG đã migrate. KHÔNG ghi đè key chính ở đây: raw hỏng giữ nguyên
   cho tới lần storeState() hợp lệ đầu tiên, và storeState chỉ còn được gọi
   với state đã chuẩn hoá bởi migrateState nên không còn đường nào ghi lại
   raw mảng/scalar lạ lên kho. */
function corruptStateFallback(raw) {
  const at = new Date().toISOString();
  const backupKey = STORE_KEY + "__corrupt_backup";
  try { localStorage.setItem(backupKey, JSON.stringify({ at, raw })); } catch (e2) {}
  try {
    const w = (typeof window !== "undefined" && window) || (typeof globalThis !== "undefined" ? globalThis : null);
    if (w) w.CRM_LOAD_ISSUE = { type: "corrupt", backupKey, at };
  } catch (e3) {}
  return migrateState(emptyState());
}
function loadState() {
  let raw = null;
  try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return migrateState(emptyState()); }
  if (!raw) return migrateState(emptyState());
  let parsedRaw;
  try { parsedRaw = JSON.parse(raw); } catch (e) { return corruptStateFallback(raw); }
  /* A1/A2: JSON parse được nhưng KHÔNG phải object thuần — mảng ("[1,2]")
     hay scalar hợp lệ (null / "hello" / 123 / true) — đều là dữ liệu hỏng:
     đi đúng đường backup + banner như JSON hỏng, không trả mảng cho app và
     không ghi đè im lặng ngay lần load đầu. */
  if (!parsedRaw || typeof parsedRaw !== "object" || Array.isArray(parsedRaw)) return corruptStateFallback(raw);
  try {
    const parsed = migrateState(parsedRaw);
    storeState(parsed);
    return parsed;
  } catch (e) {
    return corruptStateFallback(raw);
  }
}
function storeState(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} }
function money(n, cur) { if (n == null || typeof n !== "number" || !Number.isFinite(n)) return "—"; return cur === "USD" ? "$" + n.toLocaleString("en-US") : Math.round(n / 1e6).toLocaleString("vi-VN") + "tr ₫"; }
function stageOf(line, key) { return LINES[line].stages.find(s => s[0] === key); }
function isOpen(d) { return d.stage !== "won" && d.stage !== "lost"; }
function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg; t.classList.add("on");
  setTimeout(() => t.classList.remove("on"), 2400);
}
