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
const CRM_ENTITY_TYPES = [["deals", "deal"], ["companies", "company"], ["leads", "lead"], ["games", "game"], ["tasks", "task"], ["members", "member"], ["activities", "activity"], ["events", "event"]];
/* === Hồ sơ công ty (Company Profile) — bộ field phụ qua legacy_extra ===
   COMPANY_PROFILE_FIELDS là DANH SÁCH DÙNG CHUNG DUY NHẤT (key + nhãn +
   loại input) cho cả khối "Hồ sơ công ty" xem/sửa trong drawer công ty
   lẫn mục "Hồ sơ công ty" trong form công ty (editCompany) ở index.html
   — hai bề mặt KHÔNG được giữ danh sách riêng. Các key này CỐ Ý không
   nằm trong COMPANY_KNOWN của supabase-adapter.js: chúng đi qua
   legacy_extra của bảng companies (extrasOf khi ghi / mergeExtras khi
   đọc) như lead.phone/mainContact — KHÔNG cần cột/SQL mới. Giá trị luôn
   là CHUỖI nguyên văn (không ép số: "Năm thành lập"/"Số nhân sự" giữ
   đúng chữ người dùng nhập); field rỗng thì KHÔNG ghi key vào object
   (đường ghi xoá key khi để trống — xem applyCompanyProfile ở index.html).
   Loại input: "text" = ô 1 dòng; "textarea" = ô nhiều dòng (danh sách /
   tín hiệu dài: domain, tên tổ chức con, buying signals — cùng mẫu ô
   textarea của form game); "vertical" = SELECT ngành (xem
   companyProfileVerticalOptions ở index.html). */
const COMPANY_PROFILE_FIELDS = [
  { key: "location", label: "Địa điểm", type: "text" },
  { key: "establishedYear", label: "Năm thành lập", type: "text" },
  { key: "size", label: "Quy mô", type: "text" },
  { key: "employees", label: "Số nhân sự", type: "text" },
  { key: "industry", label: "Ngành", type: "text" },
  { key: "website", label: "Website", type: "text" },
  { key: "linkedinUrl", label: "LinkedIn công ty", type: "text" },
  { key: "parentCompany", label: "Công ty mẹ / Nhà đầu tư", type: "text" },
  { key: "parentWebsite", label: "Website công ty mẹ", type: "text" },
  { key: "suborgCount", label: "Số tổ chức con", type: "text" },
  { key: "suborgDomains", label: "Domain tổ chức con", type: "textarea" },
  { key: "suborgNames", label: "Tên tổ chức con", type: "textarea" },
  { key: "buyingSignals", label: "Tín hiệu mua (Buying Signals)", type: "textarea" },
  { key: "vertical", label: "Ngành dọc", type: "vertical" },
  { key: "savaOffering", label: "SAVA Offering", type: "text" },
  { key: "bizModel", label: "Mô hình kinh doanh (Biz Model)", type: "text" },
  { key: "priority", label: "Mức ưu tiên (Priority)", type: "text" },
];
if (typeof window !== "undefined") { window.COMPANY_PROFILE_FIELDS = COMPANY_PROFILE_FIELDS; window.CompanyProfileFields = COMPANY_PROFILE_FIELDS; }
const FIELD_LABELS = {
  deal: { title: "Tiêu đề", line: "Mảng", stage: "Giai đoạn", owner: "Người phụ trách", company: "Công ty", game: "Game", due: "Hạn chốt", amount: "Giá trị", cur: "Tiền tệ", vertical: "Phân khúc ngành", leads: "Lead gắn kèm", custom: "Thông tin riêng theo mảng", term: "Điều khoản (Term)", contract: "Hợp đồng", idle: "Số ngày chưa cập nhật", activity: "Hoạt động" },
  company: { name: "Tên công ty", type: "Loại hình", roles: "Vai trò theo mảng", last: "Tương tác cuối", partnerEval: "Đánh giá Partner (legacy)", partnerEvalMigrated: "Cờ chuyển dữ liệu Partner", location: "Địa điểm", establishedYear: "Năm thành lập", size: "Quy mô", employees: "Số nhân sự", industry: "Ngành", website: "Website", linkedinUrl: "LinkedIn công ty", parentCompany: "Công ty mẹ / Nhà đầu tư", parentWebsite: "Website công ty mẹ", suborgCount: "Số tổ chức con", suborgDomains: "Domain tổ chức con", suborgNames: "Tên tổ chức con", buyingSignals: "Tín hiệu mua (Buying Signals)", vertical: "Ngành dọc", savaOffering: "SAVA Offering", bizModel: "Mô hình kinh doanh (Biz Model)", priority: "Mức ưu tiên (Priority)" },
  lead: { name: "Tên lead", company: "Công ty", person: "Position", phone: "Điện thoại", email: "Email", linkedinUrl: "LinkedIn cá nhân", ownerId: "Người phụ trách", line: "Mảng", source: "Nguồn", status: "Trạng thái", note: "Ghi chú", when: "Thời điểm", mainContact: "Đầu mối chính", activity: "Hoạt động" },
  game: { title: "Tên game", own: "Loại game", company: "Studio sở hữu", genre: "Genre", platform: "Nền tảng", stage: "Giai đoạn phát triển", emoji: "Emoji", desc: "Mô tả", bdNote: "Ghi chú BD", buildUrl: "Link build", trailerUrl: "Link trailer", scores: "Điểm BD /10 (lưu trữ)", verdict: "Kết luận BD (lưu trữ)", mktEval: "Đánh giá MKT /10 (lưu trữ)", activity: "Hoạt động" },
  task: { title: "Tiêu đề việc", assignee: "Người được giao", deal: "Deal liên kết", company: "Công ty liên kết", lead: "Lead liên kết", game: "Game liên kết", due: "Hạn (nhãn)", dueDate: "Hạn", done: "Đã xong", overdue: "Quá hạn" },
  member: { name: "Tên thành viên", role: "Vai trò", active: "Đang hoạt động" },
  activity: { deal: "Deal", lead: "Lead", game: "Game", type: "Loại hoạt động", who: "Người thực hiện", when: "Thời gian", text: "Nội dung", url: "Link hội thoại / tài liệu" },
  event: { name: "Tên sự kiện", date: "Ngày diễn ra", endDate: "Ngày kết thúc", location: "Địa điểm", attendees: "Người tham dự", note: "Ghi chú", status: "Trạng thái sự kiện", eventUrl: "Link sự kiện", line: "Mảng liên quan", reportMet: "Báo cáo — Đã gặp ai", reportOutcome: "Báo cáo — Kết quả", reportNext: "Báo cáo — Việc tiếp theo", reportLinks: "Báo cáo — Link đính kèm", companies: "Công ty từ sự kiện", leads: "Lead từ sự kiện", deals: "Deal từ sự kiện" },
  request: { kind: "Loại hồ sơ", entityId: "Hồ sơ CRM", requestedBy: "BD phụ trách", assignee: "MKT được giao", due: "Hạn đánh giá", requestNote: "Thông tin đầu vào / yêu cầu BD", source: "Link build / bằng chứng", build: "Build / phiên bản", status: "Trạng thái", intake: "Hồ sơ đầu vào", entitySnapshot: "Dữ liệu chụp hồ sơ" },
};
const REF_FIELDS = {
  deal: { owner: "member", company: "company", game: "game" },
  lead: { company: "company", ownerId: "member" },
  game: { company: "company" },
  task: { assignee: "member", deal: "deal", company: "company", lead: "lead", game: "game" },
  activity: { who: "member", deal: "deal", lead: "lead", game: "game" },
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
/* === Nhãn hiển thị audit (FIX C3+B2) ===
   Giá trị ghi vào audit_log phải là NHÃN người đọc được của app, không phải
   mã thô / JSON thô, và TUYỆT ĐỐI không chứa intake.expectations của request
   (field đã chốt ẩn khỏi MKT, bảo vệ bằng bảng private phía Publishing —
   audit_log có policy đọc riêng nên expectations lọt vào đây sẽ thành một
   đường rò rỉ thứ hai). Ba lớp chặn expectations:
   (1) diffEntity bỏ qua hẳn key "expectations" ở mọi entity;
   (2) diff field "intake" tách theo TỪNG sub-key và loại "expectations"
       khỏi danh sách sub-key được diff (kể cả mục create dump toàn bộ);
   (3) auditValue trả "" cho field "expectations" + tóm tắt object của
       field "intake" cũng loại sub-key đó — phòng thủ chiều sâu nếu có
       đường gọi khác truyền nguyên object intake vào. */
/* Nhãn audit của lead.status — KHỚP ĐÚNG bộ nhãn của LEAD_STATUSES phía
   index.html (nguồn sự thật cho UI lead: form/chip/block). shared.js nạp
   ở cả 3 trang (kể cả trang không có LEAD_STATUSES) nên giữ bảng nhãn
   riêng tại đây cho đường audit; đổi nhãn trạng thái lead thì sửa CẢ hai
   nơi theo đúng cặp key↔nhãn này. */
/* "qualified": "Đạt chuẩn" CHỈ còn ở bảng audit này để đọc lại lịch sử
   sửa đổi cũ (stage đã bỏ khỏi LEAD_STATUSES từ 2026-11-03, dữ liệu đã
   di trú sang contacted) — không bề mặt lead nào dùng nó nữa. */
const AUDIT_LEAD_STATUS_LABELS = { new: "Mới", sent_connect: "Sent connect", first_message: "1st message", first_email: "1st email", first_fu: "1st FU", in_response: "In-response", in_reply: "In reply", discovery_meeting: "Discovery meeting", contacted: "Đã liên hệ", qualified: "Đạt chuẩn", converted: "Đã chuyển đổi", not_yet_have_demand: "Not yet have demand" };
const AUDIT_GAME_OWN_LABELS = { ours: "Game của Sava", partner: "Game đối tác" };
/* Nhãn sub-key intake: đúng bộ nhãn Publishing đang dùng (GAME_INTAKE_LABELS
   + COMPANY_INTAKE_LABELS trong publishing.js). "expectations" CỐ Ý không
   có mặt ở đây và bị loại ở tầng diff (xem diffIntake). */
const AUDIT_INTAKE_LABELS = {
  mechanicId: "Mechanic khớp dữ liệu thị trường", genre: "Genre", subGenre: "Sub-genre", artStyle: "Art style",
  coreLoop: "Core loop", gameFeel: "Game feel / archetype", platforms: "Nền tảng", devStage: "Giai đoạn phát triển",
  monetizationModel: "Mô hình monetization", targetGeo: "Thị trường mục tiêu", metricDownloads: "Downloads (studio báo)",
  metricRetention: "Retention (studio báo)", metricCpi: "CPI test thực tế (USD)", metricRevenue: "Revenue (studio báo)",
  storeUrl: "Link store", videoUrl: "Link video / trailer",
  teamSize: "Quy mô team", country: "Quốc gia", mainGenres: "Genre chính", mainPlatforms: "Nền tảng chính",
  trackRecord: "Track record", website: "Website studio",
};
function auditDealStageLabel(entity, v) {
  const lineKey = entity && entity.line;
  const ordered = [];
  if (lineKey && typeof LINES !== "undefined" && LINES[lineKey]) ordered.push(LINES[lineKey]);
  if (typeof LINES !== "undefined") Object.keys(LINES).forEach(k => { if (k !== lineKey) ordered.push(LINES[k]); });
  for (const L of ordered) { const s = L.stages.find(x => x[0] === v); if (s) return s[1]; }
  return String(v);
}
/* === Tập field NGÀY cho audit (F2, chuẩn dd-mm-yyyy) ===
   Tên field dùng chung cho mọi entity (audit ghi/hiển thị dùng chung cả 3
   trang nên danh sách theo TÊN field, không theo entity):
   - due: deal (Hạn chốt), request (Hạn đánh giá), task (Hạn — nhãn chữ tự
     do như "Hôm nay"/"tuần sau": chỉ đổi khi giá trị ĐÚNG dạng ISO, chữ tự
     do giữ nguyên văn — xem auditDateText);
   - dueDate: task (Hạn); signed: deal.contract.signed (nằm lồng trong
     object contract — xử lý ở auditObjectSummary) + field độc lập nếu có;
   - when: lead + activity (Thời gian; dữ liệu cũ có thể là chữ tự do);
   - date / endDate: event (Ngày diễn ra / Ngày kết thúc);
   - requestedAt: request (mốc thời gian ISO datetime);
   - reviewDate: company.partnerEval.reviewDate (lồng trong object
     partnerEval — xử lý ở auditObjectSummary).
   startDate / eventDate KHÔNG tồn tại trong code hiện tại — vẫn đưa vào
   tập để field ngày tương lai mang đúng tên chuẩn thì được áp ngay. */
const AUDIT_DATE_FIELDS = new Set(["due", "dueDate", "signed", "when", "date", "endDate", "startDate", "eventDate", "requestedAt", "reviewDate"]);
/* Đổi 1 giá trị ngày ISO sang dd-mm-yyyy để GHI vào audit:
   - yyyy-mm-dd -> dd-mm-yyyy; ISO datetime -> dd-mm-yyyy hh:mm
     (qua fmtSysTime, Asia/Ho_Chi_Minh — 2 helper khai báo ở dưới, được
     hoist nên gọi từ đây an toàn);
   - giá trị ĐÃ là dd-mm-yyyy -> giữ nguyên (idempotent, không format 2 lần);
   - không phải ngày ISO (chữ tự do, ngày không đọc được) -> null để caller
     giữ nguyên văn. */
function auditDateText(v) {
  if (typeof v !== "string" || !v) return null;
  if (/^\d{2}-\d{2}-\d{4}$/.test(v)) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const dmy = fmtDateDMY(v); return dmy || null; }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v)) { const t = fmtSysTime(v); return (t && t !== "—" && t !== v) ? t : null; }
  return null;
}
function auditPrimitiveText(v) { return typeof v === "boolean" ? (v ? "Có" : "Không") : String(v); }
/* Object/array KHÔNG dump JSON nữa: tóm tắt dễ đọc — liệt kê các cặp
   key: giá trị ở mức NÔNG khi toàn giá trị nguyên thuỷ và đủ ngắn (vd term
   có rev_share -> hiện "rev_share: …" dạng text), ngược lại "Đã cập nhật
   (n mục)". Mảng toàn giá trị nguyên thuỷ -> nối ", ". */
function auditObjectSummary(field, v) {
  if (Array.isArray(v)) {
    if (!v.length) return "";
    if (v.every(x => x === null || typeof x !== "object")) return v.filter(x => x !== null && x !== undefined && x !== "").map(auditPrimitiveText).join(", ");
    return "Đã cập nhật (" + v.length + " mục)";
  }
  let keys = Object.keys(v).filter(k => v[k] !== undefined);
  if (field === "intake") keys = keys.filter(k => k !== "expectations");
  if (!keys.length) return "";
  const parts = [];
  keys.forEach(k => {
    const val = v[k];
    if (val === null || val === "" || typeof val === "object") return;
    /* Sub-key ngày lồng trong object (contract.signed, partnerEval.reviewDate)
       cũng phải ghi dạng dd-mm-yyyy, không lộ ISO trong chuỗi tóm tắt. */
    const dateTxt = AUDIT_DATE_FIELDS.has(k) ? auditDateText(val) : null;
    parts.push(k + ": " + (dateTxt !== null ? dateTxt : auditPrimitiveText(val)));
  });
  const joined = parts.join("; ");
  if (parts.length && joined.length <= 120) return joined;
  return "Đã cập nhật (" + keys.length + " mục)";
}
function auditValue(state, entityType, entity, field, v) {
  if (v === undefined || v === null || v === "") return "";
  if (field === "expectations") return ""; /* chốt bảo mật C3: không đường nào ghi giá trị này vào audit */
  /* F2 lớp ghi: field ngày ghi vào audit ở dạng dd-mm-yyyy ngay từ đầu để
     mục audit MỚI nhất quán (mục cũ đã ghi ISO được lớp hiển thị ở audit.js
     cứu khi render). Giá trị chữ tự do (vd task.due "Hôm nay", lead.when
     dữ liệu cũ) không phải ISO -> auditDateText trả null -> rơi xuống
     đường String(v) nguyên văn ở cuối như cũ. */
  if (AUDIT_DATE_FIELDS.has(field)) { const d = auditDateText(v); if (d !== null) return d; }
  const refs = REF_FIELDS[entityType] || {};
  if (refs[field]) {
    if (Array.isArray(v)) return v.map(x => resolveRefLabel(state, refs[field], x, entityType, entity)).join(", ");
    const lbl = resolveRefLabel(state, refs[field], v, entityType, entity);
    return lbl && lbl !== String(v) ? lbl + " (" + String(v) + ")" : String(v);
  }
  if (field === "leads" && Array.isArray(v)) return v.map(x => resolveRefLabel(state, "lead", x, entityType, entity)).join(", ");
  if (field === "line" && typeof LINES !== "undefined" && LINES[v]) return LINES[v].name;
  if (typeof v === "boolean") return v ? "Có" : "Không";
  if (entityType === "deal" && field === "stage") return auditDealStageLabel(entity, v);
  if (entityType === "lead" && field === "status") return AUDIT_LEAD_STATUS_LABELS[v] || String(v);
  /* status của request LƯU SẴN bằng nhãn Publishing đang dùng ("Chờ đánh
     giá" / "Đang đánh giá" / "Chờ bổ sung" / "Hoàn tất") nên giữ nguyên —
     giá trị lạ cũng giữ nguyên như quy ước nhãn lạ của lead. */
  if (entityType === "game" && field === "own") return AUDIT_GAME_OWN_LABELS[v] || String(v);
  if (field === "amount" && typeof v === "number") { try { return money(v, entity && entity.cur); } catch (e) { return String(v); } }
  if (typeof v === "object") return auditObjectSummary(field, v);
  return String(v);
}
/* Diff field intake của request: tách theo TỪNG sub-key, LOẠI BỎ HẲN
   sub-key "expectations" (không ghi tên, không ghi giá trị). Sub-key còn
   lại thành mục change riêng với nhãn "Hồ sơ đầu vào — <nhãn sub-key>". */
function diffIntake(state, entityType, entity, baseLabel, bv, av) {
  const bObj = (bv && typeof bv === "object" && !Array.isArray(bv)) ? bv : null;
  const aObj = (av && typeof av === "object" && !Array.isArray(av)) ? av : null;
  if (!bObj && !aObj) return [{ field: "intake", label: baseLabel, from: auditValue(state, entityType, entity, "intake", bv), to: auditValue(state, entityType, entity, "intake", av) }];
  const bb = bObj || {}, aa = aObj || {};
  const subs = [];
  Object.keys(bb).forEach(k => { if (k !== "expectations" && !subs.includes(k)) subs.push(k); });
  Object.keys(aa).forEach(k => { if (k !== "expectations" && !subs.includes(k)) subs.push(k); });
  const out = [];
  subs.forEach(sk => {
    if (deepEqualLoose(bb[sk], aa[sk])) return;
    out.push({ field: "intake." + sk, label: baseLabel + " — " + (AUDIT_INTAKE_LABELS[sk] || sk), from: auditValue(state, entityType, entity, sk, bb[sk]), to: auditValue(state, entityType, entity, sk, aa[sk]) });
  });
  return out;
}
function diffEntity(state, entityType, before, after) {
  const labels = FIELD_LABELS[entityType] || {};
  const b = stripSysFields(before || {}), a = stripSysFields(after || {});
  const keys = [];
  Object.keys(b).forEach(k => { if (!keys.includes(k)) keys.push(k); });
  Object.keys(a).forEach(k => { if (!keys.includes(k)) keys.push(k); });
  const changes = [];
  keys.forEach(k => {
    if (k === "id") return; /* id là định danh của chính entity (đã nằm ở entityId của mục audit) — không phải một thay đổi dữ kiện, không sinh change "id" trong mục tạo mới/sửa/xoá */
    if (k === "expectations") return; /* chốt bảo mật C3 */
    if (deepEqualLoose(b[k], a[k])) return;
    if (k === "intake") { diffIntake(state, entityType, after, labels[k] || "Hồ sơ đầu vào", b[k], a[k]).forEach(c => changes.push(c)); return; }
    changes.push({ field: k, label: labels[k] || k, from: auditValue(state, entityType, after, k, b[k]), to: auditValue(state, entityType, after, k, a[k]) });
  });
  return changes;
}
/* Đóng dấu + sinh audit cho 1 danh sách entity. beforeMap: Map id -> bản
   chụp TRƯỚC khi sửa (đã clone). Trả mảng mục audit (chưa ghi).
   forcedChangesById (tuỳ chọn, Map id -> mảng change): thay đổi NẰM NGOÀI
   field của chính entity nhưng VẪN là một lần cập nhật thật của entity —
   vd hoạt động (collection riêng) gắn vào lead/game/deal thay đổi: field
   của bản ghi chủ không đổi nên diff thường rỗng, chủ không được đóng
   dấu. Caller (stampCrmAndAudit phía index.html) tiền-tính các change mô
   tả đó (field "activity") và truyền vào đây: entity được đóng dấu
   updatedAt/updatedBy NHƯ MỌI lần sửa thật khác (vẫn qua save() +
   legacy_extra + diff-sync như thường, máy khác nhận về qua snapshot nên
   không đóng dấu lại) và các change ép được GỘP vào ĐÚNG mục audit duy
   nhất của entity trong lần lưu này (không sinh mục thứ hai); entity đã
   bị xoá trong cùng lần lưu thì phần tử của nó không nằm trong `list`
   nên không bị ép dấu (mục delete riêng xử lý). */
function stampCollection(state, list, beforeMap, entityType, byMemberId, nowIso, forcedChangesById) {
  const entries = [];
  if (!Array.isArray(list)) return entries;
  const forcedOf = id => {
    if (!forcedChangesById) return null;
    const v = typeof forcedChangesById.get === "function" ? forcedChangesById.get(id) : forcedChangesById[id];
    return Array.isArray(v) && v.length ? v.map(c => ({ ...c })) : null;
  };
  const seen = new Set();
  list.forEach(ent => {
    if (!ent || typeof ent !== "object" || !ent.id) return;
    seen.add(String(ent.id));
    const before = beforeMap ? beforeMap.get(String(ent.id)) : undefined;
    if (!before) {
      ent.createdAt = nowIso; ent.updatedAt = nowIso; ent.updatedBy = byMemberId || "";
      const createChanges = diffEntity(state, entityType, {}, ent);
      const fcNew = forcedOf(String(ent.id));
      if (fcNew) createChanges.push(...fcNew);
      entries.push({ entityType, entityId: String(ent.id), at: nowIso, byMemberId: byMemberId || "", action: "create", changes: createChanges });
      return;
    }
    let changes = diffEntity(state, entityType, before, ent);
    const fc = forcedOf(String(ent.id));
    if (fc) changes = changes.concat(fc);
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
/* Người sửa cuối: tên resolve theo members HIỆN TẠI; id không còn trong
   members -> nhãn "thành viên đã xoá (…)" ĐÚNG format audit.js đang dùng
   (C9: KHÔNG fallback sang bảng tên legacy USERS nữa — bảng đó hồi sinh
   tên người đã xoá hẳn như thể họ còn là thành viên hiện tại). */
function updatedByLabel(state, ent) {
  const id = ent && ent.updatedBy;
  if (!id) return "—";
  const m = memberList(state).find(x => x.id === id);
  if (m && m.name) return m.name;
  return "thành viên đã xoá (" + String(id).slice(0, 8) + ")";
}
/* Định dạng ngày dd-mm-yyyy (chuẩn Zac chốt 4/11/2026): MỌI ngày hiển thị
   trong CRM/Publishing đều qua các helper này. Ngày thuần yyyy-mm-dd được
   đổi TRỰC TIẾP từ thành phần (không qua Date nên không lệch múi giờ);
   mốc thời gian (ISO datetime) lấy thành phần ngày/giờ theo
   Asia/Ho_Chi_Minh. Giờ giữ dạng hh:mm phía sau ngày. */
function fmtDateDMY(v) {
  if (!v) return "";
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return m[3] + "-" + m[2] + "-" + m[1];
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return "";
  const o = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(dt).forEach(x => { o[x.type] = x.value; });
  return o.day + "-" + o.month + "-" + o.year;
}
function isoToDMY(v) { return fmtDateDMY(v); }
/* Parse chuỗi người dùng nhập dd-mm-yyyy -> ISO yyyy-mm-dd để LƯU.
   Trả { ok:true, iso:"" } khi để trống; { ok:false } khi sai định dạng
   hoặc ngày không tồn tại (vd 31-02-2026) — caller phải chặn lưu. */
function parseDMYtoISO(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return { ok: true, iso: "" };
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (!m) return { ok: false, iso: "" };
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return { ok: false, iso: "" };
  return { ok: true, iso: m[3] + "-" + m[2] + "-" + m[1] };
}
function fmtSysTime(v) {
  if (!v) return "—";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const dmy = fmtDateDMY(s); return dmy || String(v); }
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return String(v);
  const date = fmtDateDMY(v);
  if (!date) return String(v);
  if (!/[T ]\d{2}:\d{2}/.test(s)) return date;
  const o = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(dt).forEach(x => { o[x.type] = x.value; });
  return date + " " + o.hour + ":" + o.minute;
}
if (typeof window !== "undefined") {
  window.SavaSys = { SYS_FIELDS, CRM_ENTITY_TYPES, FIELD_LABELS, stampCollection, snapshotById, diffEntity, auditValue, auditDateFields: [...AUDIT_DATE_FIELDS], auditDateText, updatedByLabel, fmtSysTime, fmtDateDMY, isoToDMY, parseDMYtoISO, cloneForDiff };
}
/* === Sắp xếp danh sách (Việc 6) — window.SavaSort: logic THUẦN dùng chung ===
   Một cơ chế sort DUY NHẤT cho mọi danh sách của app BD (index.html) và
   danh sách request của Publishing (publishing.js):
   - Tiêu chí: "name" (Tên, so sánh KHÔNG DẤU tiếng Việt qua sortFold —
     cùng phép chuẩn hoá NFD bỏ dấu Mn + đ->d như impFold/dedupe/combobox
     của codebase, nên "Ếch"/"Ân" không bị đẩy xuống cuối), "updated"
     (Date modified = dấu updatedAt hệ thống do save() đóng qua
     stampCollection ở trên), "amount" (Deal size = deal.amount).
   - Chiều mặc định khi CHỌN MỚI một tiêu chí: name = asc (A→Z),
     updated = desc (Mới→Cũ), amount = desc (Lớn→Nhỏ). Bấm lại CÙNG
     tiêu chí thì đảo chiều (nextSortState).
   - Bản ghi THIẾU dấu updatedAt (hoặc dấu không đọc được) luôn xếp CUỐI
     ở CẢ hai chiều — không bịa thời gian. Deal KHÔNG có amount hợp lệ
     (thiếu/không phải số hữu hạn, hoặc deal mảng game Game
     Studio/Publishing vốn không có amount — rev-share) cũng luôn xếp
     CUỐI ở cả hai chiều khi sort theo amount.
   - sortItems KHÔNG mutate mảng vào lẫn bản ghi: trả MẢNG MỚI đã sắp
     (bản ghi giữ nguyên tham chiếu + nguyên mọi field, gồm updatedAt).
     Sort là thao tác hiển thị thuần: tầng UI chỉ render() lại, TUYỆT
     ĐỐI không gọi save()/sync, không đóng dấu, không sinh audit.
   - Hoà (tie) ở tiêu chí chính: phá hoà bằng tên đã fold tăng dần rồi
     bằng vị trí gốc (ổn định, xác định). */
const SORT_KEYS = ["name", "updated", "amount"];
const SORT_DEFAULT_DIR = { name: "asc", updated: "desc", amount: "desc" };
function sortFold(v) {
  if (v === null || v === undefined) return "";
  return String(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/\s+/g, " ").trim();
}
function sortTimeOf(item) {
  const v = item && item.updatedAt;
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}
function sortAmountOf(item) {
  if (!item || typeof item !== "object") return null;
  if (typeof GAME_LINES !== "undefined" && GAME_LINES.includes(item.line)) return null;
  const v = item.amount;
  return (typeof v === "number" && Number.isFinite(v)) ? v : null;
}
function sortCmpText(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function sortItems(items, state, getters) {
  const list = Array.isArray(items) ? items : [];
  const key = state && SORT_KEYS.includes(state.key) ? state.key : null;
  if (!key) return list.slice();
  const dir = state.dir === "asc" || state.dir === "desc" ? state.dir : (SORT_DEFAULT_DIR[key] || "asc");
  const sign = dir === "desc" ? -1 : 1;
  const g = getters || {};
  const nameOf = typeof g.name === "function" ? g.name : (x => (x && (x.name || x.title)) || "");
  const timeOf = typeof g.updated === "function" ? g.updated : sortTimeOf;
  const amountOf = typeof g.amount === "function" ? g.amount : sortAmountOf;
  const decorated = list.map((item, idx) => {
    const tv = timeOf(item), av = amountOf(item);
    return { item, idx, name: sortFold(nameOf(item)), time: (typeof tv === "number" && Number.isFinite(tv)) ? tv : null, amount: (typeof av === "number" && Number.isFinite(av)) ? av : null };
  });
  decorated.sort((a, b) => {
    let c = 0;
    if (key === "name") {
      c = sign * sortCmpText(a.name, b.name);
    } else if (key === "updated") {
      /* Thiếu dấu: CUỐI ở cả hai chiều (không nhân sign). */
      if (a.time === null && b.time === null) c = 0;
      else if (a.time === null) return 1;
      else if (b.time === null) return -1;
      else c = sign * (a.time - b.time);
    } else if (key === "amount") {
      /* Không có amount hợp lệ: CUỐI ở cả hai chiều (không nhân sign). */
      if (a.amount === null && b.amount === null) c = 0;
      else if (a.amount === null) return 1;
      else if (b.amount === null) return -1;
      else c = sign * (a.amount - b.amount);
    }
    if (c !== 0) return c;
    const cn = sortCmpText(a.name, b.name);
    if (cn !== 0) return cn;
    return a.idx - b.idx;
  });
  return decorated.map(d => d.item);
}
/* Bấm vào một tiêu chí: đang chọn đúng tiêu chí đó -> đảo chiều; chọn
   tiêu chí mới -> chiều mặc định của tiêu chí đó. Trả state MỚI (không
   mutate state cũ). */
function nextSortState(state, key) {
  if (!SORT_KEYS.includes(key)) return state && SORT_KEYS.includes(state.key) ? { key: state.key, dir: state.dir } : { key: null, dir: null };
  if (state && state.key === key && (state.dir === "asc" || state.dir === "desc")) return { key, dir: state.dir === "asc" ? "desc" : "asc" };
  return { key, dir: SORT_DEFAULT_DIR[key] || "asc" };
}
/* Chỉ dấu chiều cho tiêu đề/nút sort: đang chọn -> ▲ (tăng) / ▼ (giảm);
   chưa chọn -> ↕ trung tính. */
function sortIndicator(state, key) {
  if (!state || state.key !== key) return "↕";
  return state.dir === "desc" ? "▼" : "▲";
}
const SavaSort = { KEYS: SORT_KEYS, DEFAULT_DIR: SORT_DEFAULT_DIR, fold: sortFold, timeOf: sortTimeOf, amountOf: sortAmountOf, sortItems, next: nextSortState, indicator: sortIndicator };
if (typeof window !== "undefined") { window.SavaSort = SavaSort; }
/* === Phân trang danh sách (Việc 8) — window.SavaPager: logic THUẦN dùng chung ===
   MỘT cơ chế phân trang duy nhất cho mọi danh sách dài, tách từ mẫu chuẩn
   đã live ở view Lead dạng Block (LEAD_BLOCK_PAGE_SIZE = 10, pager
   Trước/Sau + dòng "Trang X/Y · Đang hiện A–B / N mục", ẩn khi ≤1 trang):
   - PAGE_SIZE mặc định 10 mục/trang cho mọi list (phẳng lẫn theo block).
   - pagerInfo(total, page): KẸP trang yêu cầu về [1, totalPages] — tập
     đã lọc/sort co lại thì trang sâu tự về trang cuối hợp lệ, không bao
     giờ trả trang trống khi total > 0. from/to là vị trí 1-based của
     mục đầu/cuối trang trong tập ĐÃ LỌC + ĐÃ SORT: STT liên tục qua các
     trang = from + chỉ số trong trang (Việc 6: sort trước, phân trang sau).
   - THUẦN tuyệt đối: không mutate mảng/bản ghi, không đọc/ghi kho, không
     đóng dấu updatedAt, không sinh lịch sử — trạng thái trang/đóng-mở
     sống ở UI-state trong phiên của từng trang (index.html/publishing.js). */
const LIST_PAGE_SIZE = 10;
function pagerInfo(total, page, size) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  const sz = Math.max(1, Math.floor(Number(size) || LIST_PAGE_SIZE));
  const totalPages = Math.max(1, Math.ceil(n / sz));
  let p = Math.floor(Number(page) || 1);
  if (p > totalPages) p = totalPages;
  if (p < 1) p = 1;
  const start = (p - 1) * sz;
  return { page: p, totalPages, total: n, size: sz, start, from: n ? start + 1 : 0, to: Math.min(start + sz, n) };
}
function pagerSlice(items, page, size) {
  const list = Array.isArray(items) ? items : [];
  const info = pagerInfo(list.length, page, size);
  return { info, pageItems: list.slice(info.start, info.start + info.size) };
}
const SavaPager = { PAGE_SIZE: LIST_PAGE_SIZE, info: pagerInfo, slice: pagerSlice };
if (typeof window !== "undefined") { window.SavaPager = SavaPager; }
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
  events: [],
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
   và mở rộng cùng phong cách cho các loại còn lại: ✅ Việc (thống nhất từ
   vựng Task = "Việc" toàn app, P5 đợt 7 quyết định; khớp nhãn mục
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
  task: { icon: "✅", noun: "Việc", color: "#15803d" },
  member: { icon: "👤", noun: "Thành viên", color: "#475569" },
  activity: { icon: "🕘", noun: "Hoạt động", color: "#64748b" },
  event: { icon: "🎪", noun: "Sự kiện", color: "#db2777" },
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
  if (!Array.isArray(s.events)) s.events = [];
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
  ["companies", "games", "deals", "leads", "tasks", "activities", "events", "members"].forEach(k => {
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
  ["companies", "games", "deals", "leads", "tasks", "activities", "events"].forEach(k => {
    s[k].forEach(x => { if (typeof x.id === "number" && Number.isFinite(x.id)) x.id = String(x.id); });
  });
  /* Sự kiện: 3 mảng liên kết (companies/leads/deals) là nguồn sự thật của
     quan hệ Event<->{Company,Lead,Deal} — luôn là mảng, id số ép về chuỗi
     như deal.leads ở dưới. attendees cũng luôn là mảng id thành viên. */
  s.events.forEach(e => {
    ["companies", "leads", "deals", "attendees"].forEach(f => {
      if (!Array.isArray(e[f])) e[f] = [];
      else e[f] = e[f].map(v => (typeof v === "number" && Number.isFinite(v)) ? String(v) : v);
    });
    /* Vòng đời sự kiện (đợt 3/11): reportLinks (link đính kèm của báo cáo
       sau sự kiện) luôn là mảng khi đã có; status/endDate/eventUrl/line/
       report* còn lại là chuỗi tự do — giữ nguyên văn, trạng thái hiệu
       lực được SUY ở tầng hiển thị (eventStatusKey phía index.html) nên
       migration ở đây tuyệt đối KHÔNG tự ghi status cho sự kiện cũ. */
    if (e.reportLinks !== undefined && !Array.isArray(e.reportLinks)) e.reportLinks = [];
  });
  s.games.forEach(g => { if (typeof g.company === "number" && Number.isFinite(g.company)) g.company = String(g.company); });
  s.deals.forEach(d => {
    ["company", "game"].forEach(f => { if (typeof d[f] === "number" && Number.isFinite(d[f])) d[f] = String(d[f]); });
  });
  s.leads.forEach(l => { if (typeof l.company === "number" && Number.isFinite(l.company)) l.company = String(l.company); });
  s.tasks.forEach(t => { if (typeof t.deal === "number" && Number.isFinite(t.deal)) t.deal = String(t.deal); });
  s.activities.forEach(a => { ["deal", "lead", "game"].forEach(f => { if (typeof a[f] === "number" && Number.isFinite(a[f])) a[f] = String(a[f]); }); });
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
  /* C7: Lead sinh ra trong migration dưới đây phải mang trường HỆ THỐNG
     ngay tại thời điểm tạo (createdAt/updatedAt = thời điểm migration;
     updatedBy = member đang đăng nhập NẾU xác định được qua kênh chuẩn
     window.SavaAuth.currentUser() tại thời điểm đó, không xác định được
     thì để "" — KHÔNG bịa). Trước đây lead migrate không có 3 trường này.
     Về audit: migrateState chạy trong loadState lúc nạp trang, TRƯỚC khi
     tầng dữ liệu Supabase được bật và TRƯỚC khi danh tính đăng nhập được
     xác lập (RLS audit_log còn bắt by_member_id khớp member người gọi;
     hàng đợi SavaAudit bị xoá khi tầng dữ liệu chưa enabled) — KHÔNG có
     kênh ghi audit chuẩn nào khả thi an toàn tại thời điểm đó, và
     crmPrevSnap phía index.html được chụp SAU loadState nên save() sau
     đó cũng không sinh mục create cho lead này. Vì vậy migration chỉ
     đóng dấu hệ thống tại chỗ, không tự dựng đường ghi audit mới. */
  const migNowIso = new Date().toISOString();
  let migBy = "";
  try {
    const w = (typeof window !== "undefined" && window) || null;
    const u = w && w.SavaAuth && typeof w.SavaAuth.currentUser === "function" ? w.SavaAuth.currentUser() : null;
    if (u && u.memberId) migBy = String(u.memberId);
  } catch (e) {}
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
      createdAt: migNowIso,
      updatedAt: migNowIso,
      updatedBy: migBy,
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
/* Định dạng tiền CHỈ ở tầng hiển thị (B6): VND < 1tr hiện nguyên số có
   phân cách nghìn + " ₫" (trước đây làm tròn tới hàng triệu nên 400.000
   thành "0tr ₫"); VND >= 1tr hiện "Xtr ₫" tối đa 2 chữ số thập phân, cắt
   số 0 thừa, dấu thập phân theo vi-VN (dấu phẩy — cùng cách pipelineValue
   trong index.html in "tỷ ₫"); USD tối đa 2 chữ số thập phân. */
function money(n, cur) {
  if (n == null || typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (cur === "USD") return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (Math.abs(n) < 1e6) return n.toLocaleString("vi-VN") + " ₫";
  return (n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + "tr ₫";
}
/* === Định dạng điểm TỔNG /100 — helper DUY NHẤT toàn app (P4, đợt 7 quyết định) ===
   Mọi bề mặt in điểm TỔNG của khung Game (Final v2 + Final legacy/Khung
   workbook cũ) và điểm TỔNG Partner Fit đều qua helper này: LUÔN đúng 1 chữ
   số thập phân (80 -> "80.0", 64.96 -> "65.0" — làm tròn chỉ ở tầng hiển
   thị, không đổi giá trị tính / ngưỡng / nhãn quyết định). Điểm THÀNH PHẦN
   (Market, Prototype, từng tiêu chí, điểm /5) và % completeness/coverage
   KHÔNG dùng helper này — giữ định dạng riêng như cũ. Thiếu dữ liệu
   (null / undefined / rỗng / không phải số hữu hạn) -> "—" như mẫu hiển
   thị chung của app. shared.js được nạp TRƯỚC publishing-score.js /
   publishing-bridge.js / publishing.js ở cả 3 trang (index.html,
   publishing.html, mkt.html) nên mọi phía đều đọc được qua window. */
function fmtFinalScore(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
if (typeof window !== "undefined") { window.fmtFinalScore = fmtFinalScore; }
function stageOf(line, key) { return LINES[line].stages.find(s => s[0] === key); }
function isOpen(d) { return d.stage !== "won" && d.stage !== "lost"; }
/* === Dashboard Phân tích (khu "Phân tích" ở Tổng quan BD) — HELPER THUẦN ===
   Mọi con số của khu Phân tích tính qua các helper dưới đây: hàm thuần nhận
   danh sách/state + kỳ + mốc "now", KHÔNG đọc biến toàn cục của trang,
   KHÔNG ghi dữ kiện — unit-test trực tiếp qua window.SavaDash.
   Bộ màu dùng chung cho MỌI biểu đồ trong khu (định nghĩa MỘT chỗ duy nhất):
   company = teal đậm (màu chủ đạo theme), lead = xanh dương, deal = hổ phách. */
const DASH_COLORS = { company: "#0f766e", lead: "#0284c7", deal: "#d97706" };
function dashParseDate(v) {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? new Date(v.getTime()) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function dashDayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function dashMondayStart(d) { const x = dashDayStart(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x; }
/* % thuần: mẫu số 0 / không hợp lệ -> null (tầng hiển thị tự đổi thành "—"
   hoặc nhãn chữ "Chưa có deal đóng"); có mẫu số -> % dạng số (0–100). */
function dashPct(num, den) {
  if (!den || !Number.isFinite(den)) return null;
  return (num / den) * 100;
}
/* Đếm "mới trong kỳ": kỳ = days ngày gần nhất tính cả hôm nay (days = null
   -> "Tất cả": mọi bản ghi có createdAt hợp lệ). Bản ghi thiếu/rỗng/không
   parse được createdAt bị LOẠI và đếm vào missing để UI ghi chú trung thực. */
function dashCountNew(list, days, now) {
  const nowD = dashDayStart(now || new Date());
  const start = (days === null || days === undefined) ? null : (() => { const s = new Date(nowD); s.setDate(s.getDate() - (days - 1)); return s; })();
  let count = 0, missing = 0;
  (list || []).forEach(e => {
    const d = dashParseDate(e && e.createdAt);
    if (!d) { missing++; return; }
    if (!start || dashDayStart(d) >= start) count++;
  });
  return { count, missing };
}
/* Xu hướng thêm mới — quy tắc bucket:
   - Kỳ 7 / 30 ngày -> theo NGÀY (đúng N bucket, bucket cuối = hôm nay).
   - Kỳ 90 ngày -> theo TUẦN (bucket tuần bắt đầu thứ Hai; tuần đầu là tuần
     chứa ngày bắt đầu kỳ, tuần cuối là tuần hiện tại).
   - "Tất cả" (days = null) -> theo TUẦN nếu toàn bộ dữ kiện trải ≤ 730 ngày
     (từ createdAt sớm nhất tới hôm nay), theo THÁNG nếu trải > 730 ngày.
   Bản ghi thiếu createdAt: loại khỏi mọi bucket, đếm vào missing.
   Bản ghi có createdAt TRƯỚC cửa sổ kỳ (kỳ cố định): không vào bucket nào
   và không tính missing (chỉ nằm ngoài kỳ). */
function dashTrend(sets, days, now) {
  const nowD = dashDayStart(now || new Date());
  const keys = ["company", "lead", "deal"];
  const parsed = {}, allDates = [];
  let missing = 0;
  keys.forEach(k => {
    parsed[k] = [];
    ((sets && sets[k]) || []).forEach(e => {
      const d = dashParseDate(e && e.createdAt);
      if (!d) { missing++; return; }
      const dd = dashDayStart(d);
      parsed[k].push(dd); allDates.push(dd);
    });
  });
  let gran, starts = [];
  const pushWeeks = (from, to) => { for (let t = new Date(from); t <= to; t.setDate(t.getDate() + 7)) starts.push(new Date(t)); };
  if (days === 7 || days === 30) {
    gran = "day";
    const s0 = new Date(nowD); s0.setDate(s0.getDate() - (days - 1));
    for (let i = 0; i < days; i++) { const t = new Date(s0); t.setDate(t.getDate() + i); starts.push(t); }
  } else if (days === 90) {
    gran = "week";
    const raw = new Date(nowD); raw.setDate(raw.getDate() - 89);
    pushWeeks(dashMondayStart(raw), nowD);
  } else {
    if (!allDates.length) return { granularity: "week", buckets: [], missing };
    const earliest = new Date(Math.min.apply(null, allDates));
    const spanDays = Math.round((nowD - earliest) / 86400000);
    if (spanDays > 730) {
      gran = "month";
      let t = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
      const last = new Date(nowD.getFullYear(), nowD.getMonth(), 1);
      while (t <= last) { starts.push(new Date(t)); t = new Date(t.getFullYear(), t.getMonth() + 1, 1); }
    } else {
      gran = "week";
      pushWeeks(dashMondayStart(earliest), nowD);
    }
  }
  const fmtDM = d => String(d.getDate()).padStart(2, "0") + "-" + String(d.getMonth() + 1).padStart(2, "0");
  const buckets = starts.map((s, i) => {
    let label;
    if (gran === "day") label = fmtDM(s);
    else if (gran === "week") { const e = new Date(starts[i + 1] || new Date(s.getTime() + 7 * 86400000)); e.setDate(e.getDate() - 1); label = fmtDM(s) + "–" + fmtDM(e > nowD && days !== null && days !== undefined ? nowD : e); }
    else label = String(s.getMonth() + 1).padStart(2, "0") + "-" + s.getFullYear();
    return { label, company: 0, lead: 0, deal: 0 };
  });
  const bucketIdx = d => {
    if (gran === "month") {
      const di = (d.getFullYear() - starts[0].getFullYear()) * 12 + (d.getMonth() - starts[0].getMonth());
      return di >= 0 && di < starts.length ? di : -1;
    }
    const di = Math.floor((d - starts[0]) / (gran === "day" ? 86400000 : 7 * 86400000));
    return di >= 0 && di < starts.length ? di : -1;
  };
  keys.forEach(k => parsed[k].forEach(d => { const i = bucketIdx(d); if (i >= 0) buckets[i][k]++; }));
  return { granularity: gran, buckets, missing };
}
/* Phễu Lead TÍCH LUỸ "đã tới bước này trở lên" từ trạng thái HIỆN TẠI
   (hệ thống không lưu lịch sử từng bước): số ở bước i = số lead có status
   ở vị trí >= i trong đường chính mainKeys (gồm "new" ở đầu; KHÔNG gồm
   droppedKey = "not_yet_have_demand" — lối ra riêng, không vào dãy tích
   luỹ). Dãy tích luỹ đơn điệu không tăng; tích luỹ ở bước cuối (converted)
   = đúng số lead converted; tích luỹ ở bước 2 (sent_connect) = N − số lead
   đang ở "new".
   N (total) = tổng lead ĐƯỜNG CHÍNH trong phạm vi = tổng các exact của
   mainKeys. Status lạ -> unknown: không vào dòng nào, KHÔNG tính vào N,
   tầng hiển thị ghi chú số bị loại. Lead ở droppedKey cũng không tính vào
   N (dropped.pct vẫn tính TRÊN N = % trên tổng ban đầu) — chỉ định nghĩa
   này mới giữ đúng bất biến "tích luỹ sent_connect = N − số ở new".
   Mỗi step: count = tích luỹ, exact = số lead đang đứng đúng ở bước đó,
   pct / fromStart = % so với điểm bắt đầu (count / N), toNext = % đi tiếp
   sang bước kề (count[i+1] / count[i]; null ở bước cuối / khi bước này = 0).
   summary: reachedContactedPlus = số lead ở contacted ∪ converted (=
   tích luỹ ở contacted — "đã tới bước Đã liên hệ trở lên"; trước
   2026-11-03 khái niệm này là qualifiedPlus trên stage "qualified" đã
   bỏ), converted = số lead converted; % đều trên N. Mọi % là số
   thô (0–100) hoặc null khi mẫu số 0 — tầng hiển thị của phễu tự làm tròn
   0 thập phân, không dùng fmtPctVal 1 thập phân của các khối khác. */
function dashLeadFunnel(leads, mainKeys, droppedKey) {
  const idx = {}; (mainKeys || []).forEach((k, i) => { idx[k] = i; });
  const exact = (mainKeys || []).map(() => 0);
  let dropped = 0, unknown = 0;
  const list = leads || [];
  list.forEach(l => {
    const st = l && l.status;
    if (st === droppedKey) { dropped++; return; }
    if (Object.prototype.hasOwnProperty.call(idx, st)) exact[idx[st]]++;
    else unknown++;
  });
  const total = exact.reduce((a, b) => a + b, 0);
  const cum = exact.slice();
  for (let i = cum.length - 2; i >= 0; i--) cum[i] += cum[i + 1];
  const steps = (mainKeys || []).map((k, i) => ({
    key: k, count: cum[i], exact: exact[i],
    toNext: i < mainKeys.length - 1 ? dashPct(cum[i + 1], cum[i]) : null,
    fromStart: dashPct(cum[i], total), pct: dashPct(cum[i], total),
  }));
  const exactOf = k => Object.prototype.hasOwnProperty.call(idx, k) ? exact[idx[k]] : 0;
  const reachedContactedPlus = exactOf("contacted") + exactOf("converted");
  const converted = exactOf("converted");
  return {
    steps,
    dropped: { key: droppedKey, count: dropped, pct: dashPct(dropped, total) },
    unknown, total, rawTotal: list.length,
    summary: {
      reachedContactedPlus, reachedContactedPlusPct: dashPct(reachedContactedPlus, total),
      converted, convertedPct: dashPct(converted, total),
    },
  };
}
function dashWinRate(deals) {
  const won = (deals || []).filter(d => d && d.stage === "won").length;
  const lost = (deals || []).filter(d => d && d.stage === "lost").length;
  return { won, lost, rate: dashPct(won, won + lost) };
}
/* Deal theo từng mảng: số deal ở từng stage theo ĐÚNG thứ tự pipeline của
   mảng (gồm won/lost ở cuối như định nghĩa stage) + tỉ lệ thắng của mảng +
   tổng amount của deal ĐANG MỞ nhóm theo tiền tệ (chỉ mảng có amount —
   mảng game không có amount nên openAmounts rỗng, đúng money() ở render). */
function dashDealStages(deals, linesDef) {
  return Object.keys(linesDef || {}).map(k => {
    const L = linesDef[k];
    const ds = (deals || []).filter(d => d && d.line === k);
    const stages = (L.stages || []).map(s => ({ key: s[0], label: s[1], count: ds.filter(d => d.stage === s[0]).length }));
    const wr = dashWinRate(ds);
    const openAmounts = {};
    ds.filter(d => isOpen(d)).forEach(d => { if (d.amount && !GAME_LINES.includes(k)) openAmounts[d.cur || "VND"] = (openAmounts[d.cur || "VND"] || 0) + d.amount; });
    return { line: k, stages, won: wr.won, lost: wr.lost, rate: wr.rate, openCount: ds.filter(d => isOpen(d)).length, openAmounts };
  });
}
/* Tập owner phụ trách thật trong dữ kiện: lead.ownerId ∪ deal.owner
   (không gồm rỗng). Dùng cho bộ chọn phạm vi + bảng so sánh BD. */
function dashScopeOwners(state) {
  const out = [];
  const push = v => { if (v && !out.includes(v)) out.push(v); };
  ((state && state.leads) || []).forEach(l => push(l && l.ownerId));
  ((state && state.deals) || []).forEach(d => push(d && d.owner));
  return out;
}
/* Lọc toàn bộ dashboard theo 1 BD (scopeId = member id; rỗng = Toàn hệ).
   Khoá phụ trách: lead -> ownerId, deal -> owner, việc -> assignee.
   Company KHÔNG có owner: "công ty của BD" = tập công ty PHÂN BIỆT của
   (các lead BD phụ trách) ∪ (các deal BD phụ trách). */
function dashScopeFilter(state, scopeId) {
  const s = state || {};
  const all = { companies: s.companies || [], leads: s.leads || [], deals: s.deals || [], tasks: s.tasks || [], scoped: false, companyIds: null };
  if (!scopeId) return all;
  const leads = all.leads.filter(l => l && l.ownerId === scopeId);
  const deals = all.deals.filter(d => d && d.owner === scopeId);
  const tasks = all.tasks.filter(t => t && t.assignee === scopeId);
  const ids = new Set();
  leads.forEach(l => { if (l.company) ids.add(l.company); });
  deals.forEach(d => { if (d.company) ids.add(d.company); });
  const companies = all.companies.filter(c => c && ids.has(c.id));
  return { companies, leads, deals, tasks, scoped: true, companyIds: Array.from(ids) };
}
/* 3 tỉ lệ chuyển đổi tổng hợp trên MỘT tập đã lọc (Toàn hệ hoặc 1 BD):
   (a) Lead -> Deal = lead status "converted" / tổng lead;
   (b) Deal thắng = won / (won + lost) của tập deal;
   (c) Công ty có deal = số công ty (trong tập) có >= 1 deal (trong tập)
       / tổng công ty của tập. Mỗi tỉ lệ kèm tử/mẫu dạng "x / y". */
function dashConversions(scoped) {
  const sc = scoped || {};
  const leads = sc.leads || [], deals = sc.deals || [], companies = sc.companies || [];
  const converted = leads.filter(l => l && l.status === "converted").length;
  const wr = dashWinRate(deals);
  const compIds = new Set(companies.map(c => c && c.id));
  const withDeal = new Set();
  deals.forEach(d => { if (d && d.company && compIds.has(d.company)) withDeal.add(d.company); });
  return {
    leadToDeal: { x: converted, y: leads.length, pct: dashPct(converted, leads.length) },
    dealWin: { x: wr.won, y: wr.won + wr.lost, pct: wr.rate },
    companyWithDeal: { x: withDeal.size, y: companies.length, pct: dashPct(withDeal.size, companies.length) },
  };
}
/* Quá hạn DỰ PHÒNG khi không có hàm của app: chưa xong + dueDate hợp lệ
   (YYYY-MM-DD) đã qua hôm nay — bản sao tối thiểu của isOverdue ở BD app;
   khi render thật, app truyền isOverdue của chính nó vào dashCompare. */
function dashIsOverdueFallback(t, now) {
  if (!t || t.done) return false;
  if (typeof t.dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)) return !!t.overdue;
  const n = now || new Date();
  const today = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  return t.dueDate < today;
}
/* Bảng so sánh BD (chỉ ở phạm vi Toàn hệ): 1 hàng / owner có mặt trong
   lead.ownerId ∪ deal.owner ∪ task.assignee (xếp theo thứ tự S.members,
   id lạ xếp sau), cộng hàng "__none__" (Chưa gán) ở cuối. Các chỉ số cộng
   được (lead phụ trách, lead mới, converted, deal mở, won, lost, việc quá
   hạn) cộng dồn mọi hàng PHẢI bằng đúng toàn hệ. */
function dashCompare(state, days, now, isOverdueFn) {
  const s = state || {};
  const overdue = typeof isOverdueFn === "function" ? isOverdueFn : (t => dashIsOverdueFallback(t, now));
  const memberOrder = memberList(s).map(m => m.id);
  const ids = dashScopeOwners(s);
  ((s.tasks) || []).forEach(t => { if (t && t.assignee && !ids.includes(t.assignee)) ids.push(t.assignee); });
  ids.sort((a, b) => {
    const ia = memberOrder.indexOf(a), ib = memberOrder.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  const rowFor = id => {
    const none = id === "__none__";
    const leads = (s.leads || []).filter(l => l && (none ? !l.ownerId : l.ownerId === id));
    const deals = (s.deals || []).filter(d => d && (none ? !d.owner : d.owner === id));
    const tasks = (s.tasks || []).filter(t => t && (none ? !t.assignee : t.assignee === id));
    const wr = dashWinRate(deals);
    const converted = leads.filter(l => l.status === "converted").length;
    return {
      id, none,
      leadTotal: leads.length,
      leadNew: dashCountNew(leads, days, now).count,
      converted, leadRate: dashPct(converted, leads.length),
      open: deals.filter(d => isOpen(d)).length,
      won: wr.won, lost: wr.lost, winRate: wr.rate,
      overdue: tasks.filter(overdue).length,
    };
  };
  return ids.map(rowFor).concat([rowFor("__none__")]);
}
if (typeof window !== "undefined") { window.SavaDash = { DASH_COLORS, dashParseDate, dashPct, dashCountNew, dashTrend, dashLeadFunnel, dashWinRate, dashDealStages, dashScopeOwners, dashScopeFilter, dashConversions, dashCompare, dashIsOverdueFallback }; }
function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg; t.classList.add("on");
  setTimeout(() => t.classList.remove("on"), 2400);
}

/* === Import xlsx/csv (window.SavaImport) — planner THUẦN, không DOM ===
   Toàn bộ logic nghiệp vụ của view Import (index.html) nằm ở đây dưới dạng
   hàm thuần (không chạm DOM/localStorage/mạng) để test Node được và QA dùng
   lại độc lập — cùng mẫu window.SavaDash ở trên:
   - impFold: chuẩn hoá tên bỏ dấu/khoảng trắng/gạch (đúng hàm norm() của
     các transform nạp Metaverse 2026-11-02: NFD bỏ dấu Mn, đ->d, thường
     hoá, [^a-z0-9]+ -> 1 khoảng trắng, gộp khoảng trắng). Khớp danh tính
     CHỈ theo tên đã chuẩn hoá này, KHÔNG BAO GIỜ theo số dòng.
   - guessMapping: đoán cột file -> field CRM theo tên header (Anh + Việt,
     có dấu hay không đều qua impFold nên khớp như nhau).
   - parseEmailPhone: tách email/SĐT khỏi ô gộp bằng regex — SĐT gồm cả số
     quốc tế (+xx / 00xx) như transform w4 (vòng đầu chỉ bắt số VN nên sót
     2 số Thái), không chỉ số VN.
   - mapStatus: map nhãn trạng thái file sang đúng 12 key LEAD_STATUSES;
     nhãn lạ -> 'new' + known=false để planner cảnh báo (không bịa key).
   - planImport: dry-run thuần đối chiếu state hiện tại (công ty mới /
     công ty khớp sẵn có CHỈ điền field hồ sơ đang trống / lead mới / trùng
     CRM / trùng nội bộ file / lỗi thiếu công ty hoặc PIC sau carry-down /
     mainContact theo 3 trường hợp của hợp đồng). KHÔNG ghi gì.
   - planRemoveBatch + listBatches: suy danh sách lô từ marker importBatch
     trên state; gỡ lô xoá lead của lô, công ty do lô tạo chỉ xoá khi
     không còn lead/deal NGOÀI lô tham chiếu tới.
   Field đích: lead.name = PIC, lead.person = Title/Position, email /
   linkedinUrl / ownerId / importBatch là field phụ qua legacy_extra (như
   saveLead đang ghi); hồ sơ công ty theo COMPANY_PROFILE_FIELDS. */
const SavaImport = (() => {
  "use strict";
  function impFold(s) {
    if (s === null || s === undefined) return "";
    return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function impCellStr(v) {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
    return String(v).trim();
  }
  /* Đích ghép cột: key nội bộ + nhãn hiển thị. profile.<key> là field hồ sơ
     công ty theo COMPANY_PROFILE_FIELDS; linkedinUrl trần là LinkedIn CÁ
     NHÂN của lead, profile.linkedinUrl là LinkedIn CÔNG TY. */
  const DESTINATIONS = [
    { key: "companyName", label: "Tên công ty (bắt buộc)", required: true },
    { key: "picName", label: "Tên PIC (bắt buộc)", required: true },
    { key: "person", label: "Position (Title)" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Số điện thoại" },
    { key: "linkedinUrl", label: "LinkedIn cá nhân (lead)" },
    { key: "status", label: "Trạng thái" },
    { key: "note", label: "Ghi chú" },
    { key: "when", label: "Lần tiếp cận cuối" },
  ].concat((typeof COMPANY_PROFILE_FIELDS !== "undefined" ? COMPANY_PROFILE_FIELDS : []).map(f => ({ key: "profile." + f.key, label: "Hồ sơ công ty — " + f.label })));
  /* Bí danh header đã fold (impFold) -> key đích. Thứ tự khai báo không
     quan trọng vì so khớp theo chuỗi fold ĐÚNG NGUYÊN VĂN, nhưng các bí
     danh dài/cụ thể (company linkedin url) khác hẳn bí danh ngắn
     (linkedin) nên không tranh nhau. Header không có bí danh -> bỏ qua. */
  const HEADER_ALIASES = {
    "company name": "companyName", "account name": "companyName", "ten cong ty": "companyName", "cong ty": "companyName", "company": "companyName", "account": "companyName",
    "pic": "picName", "ten pic": "picName", "pic name": "picName", "nguoi lien he": "picName", "ten nguoi lien he": "picName", "contact person": "picName", "contact name": "picName", "ho ten": "picName",
    "title": "person", "position": "person", "chuc vu": "person", "chuc danh": "person", "vi tri cong viec": "person",
    "email": "email", "e mail": "email", "dia chi email": "email",
    "phone number": "phone", "phone": "phone", "so dien thoai": "phone", "dien thoai": "phone", "sdt": "phone", "mobile": "phone", "tel": "phone",
    "linkedin": "linkedinUrl", "linkedin url": "linkedinUrl", "linkedin ca nhan": "linkedinUrl", "personal linkedin": "linkedinUrl", "pic linkedin": "linkedinUrl",
    "status": "status", "trang thai": "status",
    "note": "note", "notes": "note", "ghi chu": "note",
    "last approach": "when", "last approach date": "when", "lan tiep can cuoi": "when", "ngay tiep can cuoi": "when", "last contact": "when", "last contacted": "when",
    "location": "profile.location", "company location": "profile.location", "dia diem": "profile.location",
    "established year": "profile.establishedYear", "foundation year": "profile.establishedYear", "nam thanh lap": "profile.establishedYear", "founded year": "profile.establishedYear", "year founded": "profile.establishedYear",
    "size": "profile.size", "company size": "profile.size", "quy mo": "profile.size",
    "employees": "profile.employees", "so nhan su": "profile.employees", "number of employees": "profile.employees", "nhan su": "profile.employees", "headcount": "profile.employees",
    "industry": "profile.industry", "nganh": "profile.industry", "nganh nghe": "profile.industry", "linh vuc": "profile.industry",
    "website": "profile.website", "trang web": "profile.website",
    "company linkedin url": "profile.linkedinUrl", "company linkedin": "profile.linkedinUrl", "linkedin cong ty": "profile.linkedinUrl",
    "ultimate parent company name investors supported by": "profile.parentCompany", "ultimate parent company name": "profile.parentCompany", "parent company": "profile.parentCompany", "cong ty me": "profile.parentCompany",
    "ultimate parent company investors company website": "profile.parentWebsite", "ultimate parent company website": "profile.parentWebsite", "parent company website": "profile.parentWebsite", "website cong ty me": "profile.parentWebsite",
    "number of suborganizations": "profile.suborgCount", "so to chuc con": "profile.suborgCount",
    "suborganization domains": "profile.suborgDomains", "domain to chuc con": "profile.suborgDomains",
    "suborganization names": "profile.suborgNames", "ten to chuc con": "profile.suborgNames",
    "buying signals": "profile.buyingSignals", "tin hieu mua": "profile.buyingSignals",
    "vertical": "profile.vertical", "nganh doc": "profile.vertical",
    "sava offering": "profile.savaOffering",
    "biz model": "profile.bizModel", "business model": "profile.bizModel", "mo hinh kinh doanh": "profile.bizModel",
    "priority": "profile.priority", "muc uu tien": "profile.priority",
  };
  function guessMapping(headers) {
    const used = new Set();
    return (Array.isArray(headers) ? headers : []).map(h => {
      const f = impFold(h);
      if (!f) return "";
      const key = HEADER_ALIASES[f] || "";
      if (!key || used.has(key)) return "";
      used.add(key);
      return key;
    });
  }
  /* Dòng header thật của file Raw data KHÔNG luôn ở dòng đầu (các tab có
     khối tổng quan phía trên): tìm trong 50 dòng đầu dòng mà guessMapping
     ghép được CẢ Tên công ty lẫn PIC. Không thấy -> -1 (UI rơi về dòng 0
     và để người dùng ghép tay). */
  function findHeaderRow(aoa) {
    if (!Array.isArray(aoa)) return -1;
    const n = Math.min(aoa.length, 50);
    for (let i = 0; i < n; i++) {
      const m = guessMapping((aoa[i] || []).map(impCellStr));
      if (m.includes("companyName") && m.includes("picName")) return i;
    }
    return -1;
  }
  const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;
  const PHONE_RE = /(?:\+|00)(?:[\s.\-]?\d){8,14}|(?:\+?84|0)(?:[\s.\-]?\d){8,10}/;
  function extractPhone(raw) {
    const m = PHONE_RE.exec(String(raw || ""));
    return m ? m[0].replace(/[\s.\-]/g, "") : "";
  }
  function parseEmailPhone(cell) {
    const raw = String(cell === null || cell === undefined ? "" : cell).trim();
    if (!raw) return { email: "", phone: "", emailRaw: "" };
    const m = EMAIL_RE.exec(raw);
    const email = m ? m[0] : "";
    /* Tìm SĐT trên phần còn lại sau khi gỡ email (tránh bắt dãy số trong
       chính email); không thấy thì mới tìm trên cả ô như transform cũ. */
    const rest = email ? raw.replace(email, " ") : raw;
    const phone = extractPhone(rest) || extractPhone(raw);
    return { email, phone, emailRaw: email ? "" : raw };
  }
  const STATUS_BY_FOLDED = {
    "": "new", "new": "new", "moi": "new",
    "sent connect": "sent_connect", "1st message": "first_message", "1st email": "first_email", "1st fu": "first_fu",
    "in response": "in_response", "in reply": "in_reply", "discovery meeting": "discovery_meeting",
    "not yet have demand": "not_yet_have_demand",
    "contacted": "contacted", "da lien he": "contacted",
    "qualified": "contacted", "dat chuan": "contacted", /* stage qualified đã bỏ 2026-11-03: file cũ ghi "Đạt chuẩn" -> Đã liên hệ */
    "converted": "converted", "da chuyen doi": "converted",
  };
  function mapStatus(raw) {
    const r = String(raw === null || raw === undefined ? "" : raw).trim();
    const f = impFold(r);
    if (Object.prototype.hasOwnProperty.call(STATUS_BY_FOLDED, f)) return { key: STATUS_BY_FOLDED[f], known: true, raw: r };
    return { key: "new", known: false, raw: r };
  }
  const NUMERIC_PROFILE_KEYS = { establishedYear: true, employees: true, suborgCount: true };
  function normalizeNumericProfile(key, v) {
    const s = String(v === null || v === undefined ? "" : v).trim();
    if (NUMERIC_PROFILE_KEYS[key]) return s.replace(/^(\d+)\.0+$/, "$1");
    return s;
  }
  function normalizeWhen(raw) {
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? "" : raw.toISOString().slice(0, 10);
    const s = String(raw === null || raw === undefined ? "" : raw).trim();
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
    return m ? m[1] : s;
  }
  /* aoa (mảng dòng x cột, giá trị thô từ SheetJS) + mapping (key đích theo
     cột) + links ({"<row>,<col>": url} theo CHỈ SỐ aoa) -> records chuẩn
     cho planImport. LinkedIn cá nhân lấy ở mức Ô: hyperlink của ô PIC
     (ws[addr].l.Target phía UI) thắng giá trị ô (ô PIC chỉ chứa tên);
     ô LinkedIn có hyperlink thì lấy Target thay cho chữ hiển thị. */
  function rowsToRecords(aoa, headerRowIdx, mapping, links) {
    const out = [];
    if (!Array.isArray(aoa)) return out;
    const map = Array.isArray(mapping) ? mapping : [];
    const picCol = map.indexOf("picName");
    const liCol = map.indexOf("linkedinUrl");
    for (let r = headerRowIdx + 1; r < aoa.length; r++) {
      const row = Array.isArray(aoa[r]) ? aoa[r] : [];
      const rec = { _row: r + 1, empty: true, companyName: "", picName: "", person: "", emailCell: "", phoneCell: "", linkedinUrl: "", statusRaw: "", note: "", whenRaw: "", profile: {} };
      /* "Rỗng" xét CHỈ trên các cột ĐÃ GHÉP: cột phụ trợ không ghép (vd cột
         "Hiển thị (phụ trợ)" chứa 0/1 ở mọi dòng của file Raw data) không
         được biến dòng trống thành dòng lỗi. */
      map.forEach((target, c) => {
        if (!target) return;
        const val = impCellStr(row[c]);
        if (val !== "") rec.empty = false;
        if (target.indexOf("profile.") === 0) {
          const k = target.slice("profile.".length);
          if (val !== "") rec.profile[k] = normalizeNumericProfile(k, val);
          return;
        }
        if (target === "companyName") rec.companyName = val;
        else if (target === "picName") rec.picName = val;
        else if (target === "person") rec.person = val;
        else if (target === "email") rec.emailCell = val;
        else if (target === "phone") rec.phoneCell = val;
        else if (target === "linkedinUrl") rec.linkedinUrl = val;
        else if (target === "status") rec.statusRaw = val;
        else if (target === "note") rec.note = val;
        else if (target === "when") rec.whenRaw = row[c] instanceof Date ? row[c] : val;
      });
      if (links) {
        if (picCol >= 0 && links[r + "," + picCol]) rec.linkedinUrl = links[r + "," + picCol];
        if (liCol >= 0 && links[r + "," + liCol]) rec.linkedinUrl = links[r + "," + liCol];
      }
      out.push(rec);
    }
    return out;
  }
  /* === Khớp trùng công ty cho Import (Phần 2 — dùng SavaDedupe Phần 1) ===
     Thứ tự khớp ĐÃ CHỐT: (1) website đã chuẩn hoá, (2) nameKey tuyệt đối,
     (3) tên giống > SIMILARITY_THRESHOLD — trong đó (1)+(2) CỘNG trùng
     LinkedIn đã chuẩn hoá là khớp EXACT (công ty có sẵn, KHÔNG tạo trùng;
     khi nhiều công ty cùng exact thì ưu tiên công ty khớp theo website
     trước); tên giống (3) chỉ là CẢNH BÁO nêu trong xem
     trước, công ty vẫn nằm ở nhóm sắp tạo để người dùng tự quyết khi nạp.
     Nguồn khớp chính là SavaDedupe.matchCompanies (Phần 1); candidate lấy
     website / LinkedIn CÔNG TY từ profile của nhóm dòng import
     (profile.website / profile.linkedinUrl — đúng 2 key trong
     COMPANY_PROFILE_FIELDS, vốn lưu phẳng trên object công ty), tên từ tên
     nhóm. Khi SavaDedupe chưa/không nạp được, fallback tối thiểu ngay dưới
     đây giữ nguyên hành vi cũ (khớp tên theo impFold) CỘNG khớp website
     theo domain gốc — không tự chế thêm thuật toán mờ nào khác ngoài một
     phép giống tên bigram đơn giản cho cảnh báo similar. */
  function dedupeApi() {
    try {
      if (typeof SavaDedupe !== "undefined" && SavaDedupe && typeof SavaDedupe.matchCompanies === "function") return SavaDedupe;
    } catch (e) {}
    try {
      if (typeof window !== "undefined" && window.SavaDedupe && typeof window.SavaDedupe.matchCompanies === "function") return window.SavaDedupe;
    } catch (e) {}
    return null;
  }
  function fallbackWebsiteKey(raw) {
    let s = String(raw || "").trim().toLowerCase();
    if (!s) return "";
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^\/\//, "");
    s = s.split(/[/?#]/)[0].replace(/^www\./, "").replace(/:\d+$/, "").replace(/\.+$/, "");
    return s.includes(".") ? s : "";
  }
  function fallbackLinkedinKey(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (!s) return "";
    const m = /linkedin\.com\/(?:company|school)\/([^/?#]+)/.exec(s);
    if (m) return m[1].replace(/\/+$/, "");
    return s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^www\./, "").split(/[/?#]/).filter(Boolean).pop() || "";
  }
  function fallbackNameSimilarity(a, b) {
    const x = impFold(a), y = impFold(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    const grams = t => { const g = new Map(); const p = " " + t + " "; for (let i = 0; i + 2 <= p.length; i++) { const k = p.slice(i, i + 2); g.set(k, (g.get(k) || 0) + 1); } return g; };
    const gx = grams(x), gy = grams(y);
    let hit = 0, nx = 0, ny = 0;
    gx.forEach(v => { nx += v; }); gy.forEach(v => { ny += v; });
    gx.forEach((v, k) => { hit += Math.min(v, gy.get(k) || 0); });
    return nx + ny ? (2 * hit) / (nx + ny) : 0;
  }
  /* Chuẩn hoá 1 mục kết quả matchCompanies về {company, score, reasons}
     (chấp cả dạng {company,...} lẫn dạng bản ghi công ty trần). */
  function dedupeEntryNorm(entry) {
    if (!entry || typeof entry !== "object") return null;
    const company = entry.company && typeof entry.company === "object" ? entry.company : entry;
    if (!company || !company.id) return null;
    /* reasons của SavaDedupe là [{kind:'website'|'linkedin'|'nameKey'|'nameSimilarity', value}] */
    const reasons = Array.isArray(entry.reasons) ? entry.reasons.map(r => String(r && typeof r === "object" ? (r.kind || r.code || r.type || r.label || "") : r)).filter(Boolean) : [];
    const score = typeof entry.score === "number" && Number.isFinite(entry.score) ? entry.score : null;
    const percent = typeof entry.percent === "number" && Number.isFinite(entry.percent) ? entry.percent : (score !== null ? Math.round(score * 100) : null);
    return { company, score, percent, reasons };
  }
  function dedupeReasonRank(reasons) {
    const rs = (reasons || []).map(r => String(r).toLowerCase());
    if (rs.some(r => r.includes("website") || r.includes("domain"))) return 0;
    if (rs.some(r => r.includes("linkedin"))) return 1;
    if (rs.some(r => r.includes("name"))) return 2;
    return 3;
  }
  /* matchCompanyForImport(candidate, companies) ->
     { exact: [{company, score, reasons}], similar: [{company, score, reasons}] }
     exact đã sắp theo ưu tiên website -> LinkedIn -> tên. */
  function matchCompanyForImport(candidate, companies) {
    const cand = candidate || {};
    const list = Array.isArray(companies) ? companies.filter(c => c && c.id) : [];
    const api = dedupeApi();
    if (api) {
      const fullCandidate = {
        name: String(cand.name || ""),
        website: String(cand.website || ""),
        linkedin: String(cand.linkedin || cand.linkedinUrl || ""),
        linkedinUrl: String(cand.linkedinUrl || cand.linkedin || ""),
      };
      if (cand.excludeId) fullCandidate.excludeId = cand.excludeId;
      const mapped = list.map(c => Object.assign({}, c, {
        linkedin: String(c.linkedin || c.linkedinUrl || ""),
        linkedinUrl: String(c.linkedinUrl || c.linkedin || ""),
      }));
      let res = null;
      try { res = api.matchCompanies(fullCandidate, mapped); } catch (e) { res = null; }
      if (res && typeof res === "object") {
        const byId = new Map(list.map(c => [String(c.id), c]));
        const normList = arr => (Array.isArray(arr) ? arr : []).map(dedupeEntryNorm).filter(Boolean)
          .map(e => ({ company: byId.get(String(e.company.id)) || e.company, score: e.score, percent: e.percent, reasons: e.reasons }));
        const exact = normList(res.exact).sort((a, b) => dedupeReasonRank(a.reasons) - dedupeReasonRank(b.reasons));
        const exactIds = new Set(exact.map(e => String(e.company.id)));
        const similar = normList(res.similar).filter(e => !exactIds.has(String(e.company.id)));
        return { exact, similar };
      }
    }
    /* Fallback khi chưa có SavaDedupe (hoặc matchCompanies lỗi): website
       -> LinkedIn -> tên (impFold); ngưỡng similar lấy từ hằng của module
       nếu đọc được, mặc định 0.70 (= SavaDedupe.SIMILARITY_THRESHOLD). */
    const threshold = api && typeof api.SIMILARITY_THRESHOLD === "number" ? api.SIMILARITY_THRESHOLD : 0.70;
    const exact = [], similar = [];
    const wKey = fallbackWebsiteKey(cand.website);
    const lKey = fallbackLinkedinKey(cand.linkedin || cand.linkedinUrl);
    const nKey = impFold(cand.name);
    list.forEach(c => {
      if (cand.excludeId && String(c.id) === String(cand.excludeId)) return;
      const reasons = [];
      if (wKey && fallbackWebsiteKey(c.website) === wKey) reasons.push("website");
      if (lKey && fallbackLinkedinKey(c.linkedinUrl || c.linkedin) === lKey) reasons.push("linkedin");
      if (nKey && impFold(c.name) === nKey) reasons.push("name");
      if (reasons.length) { exact.push({ company: c, score: 1, percent: 100, reasons }); return; }
      const sim = fallbackNameSimilarity(cand.name, c.name);
      if (sim > threshold) similar.push({ company: c, score: sim, percent: Math.round(sim * 100), reasons: ["nameSimilarity"] });
    });
    exact.sort((a, b) => dedupeReasonRank(a.reasons) - dedupeReasonRank(b.reasons));
    return { exact, similar };
  }
  function planImport(state, records, opts) {
    const s = state || {};
    const o = opts || {};
    const batch = String(o.batch || "").trim();
    const line = String(o.line || "");
    const ownerId = String(o.ownerId || "");
    /* Gắn lô vào sự kiện (tuỳ chọn, đợt Sự kiện 3/11): eventId chỉ là
       NGỮ CẢNH của lô — planner ghi nó vào plan + đặt source của lead
       sắp tạo; việc GẮN liên kết thật (đẩy id vào ev.companies/ev.leads)
       do tầng UI (impApply) làm qua đúng cơ chế event_links như gắn tay.
       Sự kiện không tồn tại trong state -> coi như không gắn (UI cũng
       chỉ liệt kê sự kiện hiện có). */
    const eventId = String(o.eventId || "").trim();
    const eventOk = !!eventId && (Array.isArray(s.events) ? s.events : []).some(e => e && String(e.id) === eventId);
    const leadSource = eventOk ? "Sự kiện" : "";
    const companies = Array.isArray(s.companies) ? s.companies : [];
    const leads = Array.isArray(s.leads) ? s.leads : [];
    const compById = new Map(companies.filter(c => c && c.id).map(c => [String(c.id), c]));
    const companyNameOfLead = l => { const c = l && l.company ? compById.get(String(l.company)) : null; return c ? String(c.name || "") : ""; };
    const existingLeadKeys = new Set(leads.filter(Boolean).map(l => impFold(companyNameOfLead(l)) + "|" + impFold(l.name)));
    const existingMainCompanyIds = new Set(leads.filter(l => l && l.mainContact && l.company).map(l => String(l.company)));
    const groups = new Map();
    const duplicates = [], errors = [];
    const seenFileKeys = new Set();
    let lastCompany = "", nonEmptyRows = 0;
    (Array.isArray(records) ? records : []).forEach((rec, i) => {
      if (!rec || rec.empty) return;
      nonEmptyRows++;
      const rowNo = rec._row || (i + 1);
      let companyRaw = String(rec.companyName || "").trim();
      if (companyRaw) lastCompany = companyRaw; else companyRaw = lastCompany; /* carry-down ô công ty trống (merge cell) */
      const pic = String(rec.picName || "").trim();
      if (!companyRaw || !pic) {
        errors.push({ row: rowNo, companyName: companyRaw, picName: pic, reason: !companyRaw ? "missing_company" : "missing_pic" });
        return;
      }
      const key = impFold(companyRaw) + "|" + impFold(pic);
      if (existingLeadKeys.has(key)) { duplicates.push({ row: rowNo, companyName: companyRaw, picName: pic, reason: "crm" }); return; }
      if (seenFileKeys.has(key)) { duplicates.push({ row: rowNo, companyName: companyRaw, picName: pic, reason: "file" }); return; }
      seenFileKeys.add(key);
      const gk = impFold(companyRaw);
      let g = groups.get(gk);
      if (!g) { g = { key: gk, nameCounts: new Map(), firstName: companyRaw, profile: {}, leads: [] }; groups.set(gk, g); }
      g.nameCounts.set(companyRaw, (g.nameCounts.get(companyRaw) || 0) + 1);
      const prof = rec.profile || {};
      Object.keys(prof).forEach(k => { const v = String(prof[k] === null || prof[k] === undefined ? "" : prof[k]).trim(); if (v && !g.profile[k]) g.profile[k] = normalizeNumericProfile(k, v); });
      g.leads.push({ rec, row: rowNo, pic });
    });
    const companiesToCreate = [], companiesMatched = [], leadsToCreate = [];
    const unknownByRaw = new Map();
    let unknownStatusTotal = 0;
    groups.forEach(g => {
      let name = g.firstName, best = -1;
      g.nameCounts.forEach((cnt, raw) => { if (cnt > best) { best = cnt; name = raw; } });
      /* Khớp công ty có sẵn theo thứ tự website -> LinkedIn -> nameKey
         (matchCompanyForImport ở trên): exact = công ty có sẵn; similar
         (>70%) KHÔNG tự gộp — chỉ gắn cảnh báo vào công ty sắp tạo để bản
         xem trước nêu rõ ứng viên + % + lý do. */
      const dedupe = matchCompanyForImport({ name, website: g.profile.website || "", linkedinUrl: g.profile.linkedinUrl || "" }, companies);
      const existing = dedupe.exact.length ? dedupe.exact[0].company : null;
      let companyId = null, mainTaken = false;
      if (existing) {
        companyId = String(existing.id);
        const fill = {};
        Object.keys(g.profile).forEach(k => {
          const cur = existing[k];
          if ((cur === undefined || cur === null || String(cur).trim() === "") && g.profile[k]) fill[k] = g.profile[k];
        });
        companiesMatched.push({ id: companyId, name: String(existing.name || name), fill, matchKind: "exact", matchReasons: dedupe.exact[0].reasons.slice(), matchScore: dedupe.exact[0].score });
        mainTaken = existingMainCompanyIds.has(companyId);
      } else {
        const profile = {};
        Object.keys(g.profile).forEach(k => { profile[k] = g.profile[k]; });
        if (!profile.vertical && o.vertical) profile.vertical = String(o.vertical);
        const L = (typeof LINES !== "undefined" && LINES[line]) ? LINES[line] : null;
        companiesToCreate.push({ key: g.key, name, profile, type: L ? L.target : "Doanh nghiệp", roles: L ? { [line]: L.target } : {}, importBatch: batch,
          dedupeWarnings: dedupe.similar.map(w => ({ id: String(w.company.id), name: String(w.company.name || ""), score: w.score, percent: w.percent, reasons: w.reasons.slice() })) });
      }
      g.leads.forEach((entry, idx) => {
        const rec = entry.rec;
        const ep = parseEmailPhone(rec.emailCell);
        const phone = extractPhone(rec.phoneCell) || ep.phone;
        const st = mapStatus(rec.statusRaw);
        if (!st.known) { unknownStatusTotal++; unknownByRaw.set(st.raw, (unknownByRaw.get(st.raw) || 0) + 1); }
        leadsToCreate.push({
          name: entry.pic, companyKey: g.key, companyId, companyName: name,
          person: String(rec.person || "").trim(), phone, email: ep.email, emailRaw: ep.emailRaw,
          linkedinUrl: String(rec.linkedinUrl || "").trim(),
          status: st.key, statusRaw: st.raw, statusUnknown: !st.known,
          note: String(rec.note || "").trim(), when: normalizeWhen(rec.whenRaw),
          line, ownerId, importBatch: batch, source: leadSource,
          mainContact: idx === 0 && !mainTaken,
        });
      });
    });
    const stats = {
      totalRows: nonEmptyRows,
      newCompanies: companiesToCreate.length, matchedCompanies: companiesMatched.length,
      newLeads: leadsToCreate.length, duplicates: duplicates.length, errors: errors.length,
      unknownStatus: unknownStatusTotal,
    };
    return {
      batch, line, ownerId, eventId: eventOk ? eventId : "", companiesToCreate, companiesMatched, leadsToCreate, duplicates, errors,
      unknownStatuses: Array.from(unknownByRaw, ([raw, count]) => ({ raw, count })),
      stats,
      preview: leadsToCreate.slice(0, 10).map(l => ({ company: l.companyName, pic: l.name, email: l.email, phone: l.phone, linkedin: !!l.linkedinUrl, status: l.status })),
    };
  }
  function listBatches(state) {
    const s = state || {};
    const byBatch = new Map();
    const bump = (ent, kind) => {
      const b = ent && ent.importBatch ? String(ent.importBatch).trim() : "";
      if (!b) return;
      if (!byBatch.has(b)) byBatch.set(b, { batch: b, leads: 0, companies: 0, events: [], eventIds: [] });
      byBatch.get(b)[kind]++;
    };
    (Array.isArray(s.leads) ? s.leads : []).forEach(l => bump(l, "leads"));
    (Array.isArray(s.companies) ? s.companies : []).forEach(c => bump(c, "companies"));
    /* Sự kiện gắn với lô (đợt Sự kiện 3/11): SUY RA từ liên kết thật —
       sự kiện nào đang gắn ≥1 lead/công ty MANG MARKER của lô này thì lô
       đó "thuộc" sự kiện đó. Chỉ entity do lô TẠO (mang importBatch) mới
       được tính: công ty khớp sẵn có được gắn tay vào sự kiện không làm
       lô hiện tên sự kiện đó. Gỡ lô xoá các entity đó + unlink sẵn có
       trong impRemoveBatch nên suy ra này tự hết sau khi gỡ. */
    const idsOfBatch = b => {
      const ids = new Set();
      (Array.isArray(s.leads) ? s.leads : []).forEach(l => { if (l && String(l.importBatch || "").trim() === b) ids.add(String(l.id)); });
      (Array.isArray(s.companies) ? s.companies : []).forEach(c => { if (c && String(c.importBatch || "").trim() === b) ids.add(String(c.id)); });
      return ids;
    };
    (Array.isArray(s.events) ? s.events : []).forEach(ev => {
      if (!ev || !ev.id) return;
      const linked = new Set([...(Array.isArray(ev.companies) ? ev.companies : []), ...(Array.isArray(ev.leads) ? ev.leads : [])].map(String));
      if (!linked.size) return;
      byBatch.forEach(entry => {
        const ids = idsOfBatch(entry.batch);
        for (const id of ids) { if (linked.has(id)) { entry.events.push(String(ev.name || "—")); entry.eventIds.push(String(ev.id)); break; } }
      });
    });
    return Array.from(byBatch.values()).sort((a, b) => a.batch < b.batch ? -1 : a.batch > b.batch ? 1 : 0);
  }
  function planRemoveBatch(state, batch) {
    const s = state || {};
    const b = String(batch || "").trim();
    const leads = Array.isArray(s.leads) ? s.leads : [];
    const companies = Array.isArray(s.companies) ? s.companies : [];
    const deals = Array.isArray(s.deals) ? s.deals : [];
    const leadsToDelete = leads.filter(l => l && String(l.importBatch || "").trim() === b && b).map(l => String(l.id));
    const delSet = new Set(leadsToDelete);
    const remainingLeads = leads.filter(l => l && !delSet.has(String(l.id)));
    const companiesToDelete = [], companiesToKeep = [];
    companies.filter(c => c && String(c.importBatch || "").trim() === b && b).forEach(c => {
      const leadRefs = remainingLeads.filter(l => String(l.company || "") === String(c.id)).length;
      const dealRefs = deals.filter(d => d && String(d.company || "") === String(c.id)).length;
      if (leadRefs === 0 && dealRefs === 0) companiesToDelete.push(String(c.id));
      else companiesToKeep.push({ id: String(c.id), name: String(c.name || ""), leadRefs, dealRefs });
    });
    return { batch: b, leadsToDelete, companiesToDelete, companiesToKeep, stats: { leads: leadsToDelete.length, companiesDeleted: companiesToDelete.length, companiesKept: companiesToKeep.length } };
  }
  return { impFold, impCellStr, DESTINATIONS, HEADER_ALIASES, guessMapping, findHeaderRow, extractPhone, parseEmailPhone, mapStatus, normalizeNumericProfile, normalizeWhen, rowsToRecords, planImport, listBatches, planRemoveBatch, matchCompanyForImport };
})();
if (typeof window !== "undefined") { window.SavaImport = SavaImport; }
