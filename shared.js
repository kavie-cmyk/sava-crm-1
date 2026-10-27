/* Sava Meta CRM — dữ liệu + hàm dùng chung cho cả 2 giao diện (BD & MKT).
   Hai trang cùng origin nên dùng chung 1 kho localStorage:
   BD tạo game/deal -> MKT thấy game chờ đánh giá -> MKT chấm -> BD thấy kết quả.
   Khi nối Supabase, chỉ cần thay loadState/storeState bằng gọi API, cấu trúc dữ liệu giữ nguyên. */
const STORE_KEY = "sava_crm_shared_v1";
const GAME_LINES = ["game_studio", "publishing"];
function isGameDeal(d) { return GAME_LINES.includes(d.line); }

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
const USERS = { zac: "Zac", linh: "Linh (BD)", tuan: "Tuấn (BD)", mai: "Mai (MKT)" };
/* Tiêu chí MKT chấm game — khác bộ tiêu chí thẩm định của BD */
const MKT_CRITERIA = [
  ["market", "Tiềm năng thị trường (độ lớn + đang hot?)"],
  ["audience", "Độ rõ ràng của tệp người chơi mục tiêu"],
  ["ua", "Khả năng làm UA / creative (dễ làm ads, video?)"],
  ["usp", "Điểm khác biệt nổi bật so với game cùng genre"],
  ["trend", "Độ hợp trend / mùa vụ phát hành"],
];

function seed() { return {
  companies: [
    {id:"c1", name:"Hanbit Publishing (mẫu)", type:"Publisher", roles:{game_studio:"Publisher"}, contact:"Ms. Yoon — Acquisitions", phone:"+82 ...", last:"Hôm qua"},
    {id:"c2", name:"PlayNest Global (mẫu)", type:"Publisher", roles:{game_studio:"Publisher"}, contact:"Mr. Park — BD", phone:"+82 ...", last:"3 ngày trước"},
    {id:"c3", name:"Pixel Ant Studio (mẫu)", type:"Game studio", roles:{publishing:"Game studio"}, contact:"An — Founder", phone:"090x xxx xxx", last:"Hôm nay"},
    {id:"c4", name:"Indie dev: Bông (mẫu)", type:"Indie dev", roles:{publishing:"Indie dev"}, contact:"Bông — Solo dev", phone:"091x xxx xxx", last:"2 ngày trước"},
    {id:"c5", name:"Tiny Rocket Studio (mẫu)", type:"Game studio", roles:{publishing:"Game studio"}, contact:"Huy — CEO", phone:"098x xxx xxx", last:"Tuần trước"},
    {id:"c6", name:"Chuỗi bán lẻ FreshMart (mẫu)", type:"Doanh nghiệp", roles:{ai:"Khách hàng", metaverse:"Khách hàng"}, contact:"Chị Hà — GĐ Digital", phone:"090x xxx xxx", last:"Hôm nay"},
    {id:"c7", name:"Ngân hàng số Timo-like (mẫu)", type:"Doanh nghiệp", roles:{ai:"Khách hàng"}, contact:"Anh Đức — Head of CX", phone:"090x xxx xxx", last:"Hôm qua"},
    {id:"c8", name:"BĐS LandView (mẫu)", type:"Doanh nghiệp", roles:{metaverse:"Khách hàng"}, contact:"Anh Sơn — Marketing Dir.", phone:"093x xxx xxx", last:"3 ngày trước"},
    {id:"c9", name:"ĐH F-like (mẫu)", type:"Doanh nghiệp", roles:{metaverse:"Khách hàng", ai:"Khách hàng"}, contact:"Cô Mai — Trưởng phòng ĐT", phone:"091x xxx xxx", last:"Tuần trước"},
  ],
  games: [
    {id:"g1", title:"Puzzle Cats Adventure", own:"ours", genre:"Puzzle / Match-3", platform:"Android, iOS", stage:"Soft launch ready", emoji:"🐱", desc:"Game puzzle của Sava, đang tìm publisher global.", bdNote:"Game của Sava — không qua MKT đánh giá đầu vào."},
    {id:"g2", title:"Merge Kingdom", own:"ours", genre:"Merge / Idle", platform:"Android, iOS", stage:"Beta", emoji:"🏰", desc:"Game merge của Sava, chuẩn bị pitch publisher khu vực SEA/Hàn.", bdNote:"Game của Sava — không qua MKT đánh giá đầu vào."},
    {id:"g3", title:"Tiny Farm Story", own:"partner", company:"c3", genre:"Farm / Simulation", platform:"Android", stage:"Beta", emoji:"🌾",
     desc:"Game của Pixel Ant Studio gửi thẩm định phát hành.", bdNote:"BD (Tuấn) mang về: studio 6 người ở Đà Nẵng, game đã beta, retention D1 nội bộ báo ~38%. Nhờ MKT xem tiềm năng thị trường farm game ở SEA.",
     buildUrl:"https://drive.google.com/ (link build mẫu)", trailerUrl:"https://youtube.com/ (link trailer mẫu)",
     scores:{Gameplay:8, "Đồ họa":7.5, Monetization:6, "Tiềm năng TT":8, "Kỹ thuật":7}, verdict:"Đang chấm", mktEval:null},
    {id:"g4", title:"Dungeon Dice", own:"partner", company:"c4", genre:"Roguelike / Dice", platform:"Android, iOS", stage:"Vertical slice", emoji:"🎲",
     desc:"Game indie của dev Bông, mới qua sơ tuyển.", bdNote:"BD (Zac) mang về: dev solo, gameplay lạ nhưng genre ngách. Nhờ MKT đánh giá xem tệp người chơi có đủ lớn không.",
     buildUrl:"https://drive.google.com/ (link build mẫu)", trailerUrl:"",
     scores:{Gameplay:7, "Đồ họa":6.5, Monetization:5, "Tiềm năng TT":6, "Kỹ thuật":7.5}, verdict:"Hold", mktEval:null},
    {id:"g5", title:"Racing Mini GP", own:"partner", company:"c5", genre:"Racing / Casual", platform:"Android", stage:"Alpha", emoji:"🏎️",
     desc:"Game của Tiny Rocket, đang đánh giá thương mại.", bdNote:"BD (Tuấn) mang về: studio từng có 1 game racing 5tr lượt tải. MKT đã đánh giá xong (mẫu) — xem kết quả bên BD.",
     buildUrl:"https://drive.google.com/ (link build mẫu)", trailerUrl:"https://youtube.com/ (link trailer mẫu)",
     scores:{Gameplay:6.5, "Đồ họa":8, Monetization:7, "Tiềm năng TT":7.5, "Kỹ thuật":6}, verdict:"Đang chấm",
     mktEval:{ scores:{market:7, audience:8, ua:6.5, usp:6, trend:7}, verdict:"Cân nhắc", by:"mai", at:"Hôm qua",
       comment:"Racing casual còn đất ở SEA nhưng creative đua xe đã bão hòa, CPI dự kiến cao. Nên nhận nếu studio cam kết làm thêm mode multiplayer để có chất liệu làm ads." }},
  ],
  deals: [
    {id:"d1", line:"game_studio", title:"Puzzle Cats — chào Hanbit", company:"c1", game:"g1", stage:"evaluating", owner:"linh", due:"2026-10-30", idle:6, custom:{publisher_regions:"Hàn, Nhật, NA", build_version_sent:"v0.9.2 soft-launch"}, term:{rev_share:"Sava 70% / Publisher 30%", advance:"$50.000 (MG, trừ dần vào rev share)", territories:"Toàn cầu trừ VN", duration:"5 năm", exclusivity:"Độc quyền toàn cầu trừ VN", marketing:"Publisher cam kết tối thiểu $30.000 marketing", payment:"Đối soát hàng tháng, thanh toán sau 45 ngày"}, contract:{status:"Đang đàm phán term — chưa có HĐ", no:"", signed:"", url:""}},
    {id:"d2", line:"game_studio", title:"Merge Kingdom — chào PlayNest", company:"c2", game:"g2", stage:"pitched", owner:"linh", due:"2026-11-05", idle:2, custom:{publisher_regions:"SEA, Hàn", build_version_sent:"v0.7 beta"}, term:{rev_share:"Chưa đề xuất", advance:"—", territories:"SEA + KR", duration:"3 năm (đề xuất)", exclusivity:"Chưa chốt", marketing:"—", payment:"Hàng tháng"}, contract:{status:"Chưa có HĐ", no:"", signed:"", url:""}},
    {id:"d3", line:"game_studio", title:"Puzzle Cats — publisher EU (mẫu)", company:"c2", game:"g1", stage:"target", owner:"zac", due:"2026-11-15", idle:1, custom:{publisher_regions:"EU"}, term:{rev_share:"Chưa đề xuất", advance:"—", territories:"EU", duration:"", exclusivity:"", marketing:"", payment:""}, contract:{status:"Chưa có HĐ", no:"", signed:"", url:""}},
    {id:"d4", line:"publishing", title:"Nhận phát hành Tiny Farm Story", company:"c3", game:"g3", stage:"build_eval", owner:"tuan", due:"2026-10-28", idle:3, custom:{support_needed:"Marketing, Live-ops", planned_investment:"500tr"}, term:{rev_share:"Studio 50% / Sava 50%", advance:"Sava hỗ trợ marketing 500tr (trừ vào rev share)", territories:"VN + SEA", duration:"3 năm", exclusivity:"Độc quyền phát hành VN + SEA", marketing:"Sava phụ trách UA / marketing", payment:"Đối soát hàng tháng, thanh toán sau 30 ngày"}, contract:{status:"Chưa có HĐ — đang thẩm định", no:"", signed:"", url:""}},
    {id:"d5", line:"publishing", title:"Nhận phát hành Racing Mini GP", company:"c5", game:"g5", stage:"biz_eval", owner:"tuan", due:"2026-11-02", idle:9, custom:{support_needed:"Funding, QA", planned_investment:"1,2 tỷ"}, term:{rev_share:"Studio 60% / Sava 40% (đang đàm phán)", advance:"Đầu tư dự kiến 1,2 tỷ", territories:"Toàn cầu", duration:"5 năm (đề xuất)", exclusivity:"Độc quyền toàn cầu", marketing:"Hai bên cùng duyệt kế hoạch marketing", payment:"Đối soát hàng tháng"}, contract:{status:"Đã gửi bản draft HĐ cho studio", no:"HD-PUB-2026-014 (draft)", signed:"", url:"https://drive.google.com/ (link mẫu)"}},
    {id:"d6", line:"publishing", title:"Dungeon Dice — indie dev Bông", company:"c4", game:"g4", stage:"screening", owner:"zac", due:"2026-11-10", idle:4, custom:{support_needed:"Marketing"}, term:{rev_share:"Chưa đề xuất", advance:"—", territories:"VN", duration:"", exclusivity:"", marketing:"", payment:""}, contract:{status:"Chưa có HĐ", no:"", signed:"", url:""}},
    {id:"d7", line:"ai", title:"Chatbot CSKH cho FreshMart", company:"c6", stage:"poc", amount:850000000, cur:"VND", owner:"linh", due:"2026-10-27", idle:2, custom:{use_case:"Chatbot / GenAI", data_readiness:"Đã có dữ liệu FAQ + lịch sử chat", current_systems:"CRM nội bộ, Zalo OA", poc_scope:"1 chi nhánh, 2 tuần", poc_result:"Đang chạy"}},
    {id:"d8", line:"ai", title:"AI phân loại phản hồi khách hàng", company:"c7", stage:"usecase", amount:1500000000, cur:"VND", owner:"zac", due:"2026-11-08", idle:5, custom:{use_case:"Phân loại + tóm tắt phản hồi", data_readiness:"Một phần", current_systems:"App ngân hàng, tổng đài"}},
    {id:"d9", line:"ai", title:"Trợ lý AI tra cứu học vụ", company:"c9", stage:"discovery", amount:600000000, cur:"VND", owner:"tuan", due:"2026-11-12", idle:1, custom:{use_case:"Chatbot / GenAI", data_readiness:"Chưa rõ"}},
    {id:"d10", line:"metaverse", title:"Showroom ảo 3D cho LandView", company:"c8", stage:"proto", amount:1800000000, cur:"VND", owner:"linh", due:"2026-10-29", idle:7, custom:{use_case:"Virtual showroom BĐS", platform_target:"Web + VR headset", expected_users:"200", hardware_needed:"2 kính VR tại điểm bán", concept_url:"drive.google.com/... (mẫu)"}},
    {id:"d11", line:"metaverse", title:"Phòng đào tạo ảo cho ĐH F-like", company:"c9", stage:"concept", amount:2500000000, cur:"VND", owner:"tuan", due:"2026-11-06", idle:3, custom:{use_case:"Đào tạo / Training VR", platform_target:"VR headset", expected_users:"50"}},
    {id:"d12", line:"metaverse", title:"Gian hàng sự kiện ảo FreshMart", company:"c6", stage:"discovery", amount:900000000, cur:"VND", owner:"zac", due:"2026-11-14", idle:2, custom:{use_case:"Sự kiện ảo", platform_target:"Web"}},
  ],
  leads: [
    {id:"l1", name:"Studio Mooncat (mẫu)", line:"publishing", source:"Tự gửi qua web", status:"new", note:"Có game idle farm muốn hợp tác phát hành", when:"Hôm nay"},
    {id:"l2", name:"Publisher SG (mẫu)", line:"game_studio", source:"Giới thiệu", status:"contacted", note:"Quan tâm game puzzle, xin pitch deck", when:"Hôm qua"},
    {id:"l3", name:"Logistics Pro (mẫu)", line:"ai", source:"Form savameta.com", status:"new", note:"Hỏi giải pháp AI đọc chứng từ", when:"Hôm nay"},
    {id:"l4", name:"Resort biển (mẫu)", line:"metaverse", source:"Facebook", status:"qualified", note:"Muốn tour ảo 360/metaverse cho khách đặt phòng", when:"2 ngày trước"},
    {id:"l5", name:"Dev indie: Cá (mẫu)", line:"publishing", source:"Cộng đồng dev", status:"contacted", note:"Game roguelike đang làm, cần publisher", when:"3 ngày trước"},
  ],
  tasks: [
    {id:"t1", title:"Gửi bản build Puzzle Cats v0.9.3 cho Hanbit", assignee:"linh", due:"Hôm nay", deal:"d1", done:false, overdue:false},
    {id:"t2", title:"Chấm điểm build Tiny Farm Story (vòng 2)", assignee:"tuan", due:"Ngày mai", deal:"d4", done:false, overdue:false},
    {id:"t3", title:"Họp tổng kết POC chatbot FreshMart", assignee:"linh", due:"Hôm qua", deal:"d7", done:false, overdue:true},
    {id:"t4", title:"Gửi concept showroom LandView bản 2", assignee:"linh", due:"Hôm nay", deal:"d10", done:false, overdue:false},
    {id:"t5", title:"Xin số liệu retention Racing Mini GP từ studio", assignee:"tuan", due:"Tuần trước", deal:"d5", done:false, overdue:true},
    {id:"t6", title:"Chuẩn bị pitch deck Merge Kingdom EN", assignee:"zac", due:"Tuần này", deal:"d2", done:true, overdue:false},
  ],
  activities: [
    {id:"a1", deal:"d1", type:"Meeting", who:"linh", when:"Hôm qua", text:"Publisher chơi thử build, khen core loop, hỏi kế hoạch live-ops 3 tháng đầu.", url:"https://www.messenger.com/ (link cuộc chat mẫu)"},
    {id:"a2", deal:"d4", type:"Note", who:"tuan", when:"Hôm nay", text:"Đã chơi build 2 giờ: gameplay chắc, monetization còn yếu, cần chấm vòng 2."},
    {id:"a3", deal:"d7", type:"Call", who:"linh", when:"Hôm qua", text:"POC chạy 60% dữ liệu test, tỉ lệ trả lời đúng ~82%, cần thêm dữ liệu FAQ.", url:"https://drive.google.com/ (link file ghi âm mẫu)"},
    {id:"a4", deal:"d10", type:"Demo", who:"linh", when:"3 ngày trước", text:"Khách trải nghiệm prototype showroom, yêu cầu thêm bản đồ dự án 2D."},
    {id:"a5", deal:"d2", type:"Email", who:"linh", when:"2 ngày trước", text:"Đã gửi pitch deck + build beta cho PlayNest, chờ phản hồi.", url:"https://mail.google.com/ (link thread email mẫu)"},
  ],
};}

function loadState() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  return seed();
}
function storeState(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} }
function money(n, cur) { if (n == null) return "—"; return cur === "USD" ? "$" + n.toLocaleString("en-US") : Math.round(n / 1e6).toLocaleString("vi-VN") + "tr ₫"; }
function stageOf(line, key) { return LINES[line].stages.find(s => s[0] === key); }
function isOpen(d) { return d.stage !== "won" && d.stage !== "lost"; }
function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg; t.classList.add("on");
  setTimeout(() => t.classList.remove("on"), 2400);
}
