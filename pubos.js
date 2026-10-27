/* Sava Meta CRM — lớp nối dữ liệu thật với SAVA Publishing OS (Supabase).
   Toàn bộ logic Supabase nằm ở file này; index.html chỉ gọi qua window.PubOS.
   - Project: cpbaqafixndjysanweox (của SAVA Publishing OS)
   - Publishable key là khóa công khai phía frontend của Publishing OS
     (đọc từ supabase-config.js của repo kieuttl-dovey/sava-publishing-os),
     KHÔNG phải secret/service-role key. Mọi truy cập vẫn qua Supabase Auth
     + RLS theo profiles.role (viewer chỉ đọc, editor/admin mới ghi).
   - TUYỆT ĐỐI không nhúng credentials (email/mật khẩu) nào vào code.
     Người dùng tự đăng nhập qua modal; session do supabase-js tự lưu.
   Quy ước ID bám theo app.js của Publishing OS:
   - partners:  P + số thứ tự pad 3   (vd P001)   — app.js: `P${length+1 pad 3}`
   - games:     PUB- + số pad 3       (vd PUB-001) — app.js: `PUB-${length+1 pad 3}`
   - sourcing:  SRC- + số pad 3       (vd SRC-001) — app.js: đếm id SRC- + 1 pad 3
   Bản này tính số tiếp theo theo max số hiện có (và >= số lượng id cùng tiền tố)
   để không sinh trùng khi đã có record bị xóa — định dạng giữ nguyên.
   Ghi nguồn: game ghi intake.Source = 'Từ SAVA CRM' + intake.CRM_Game_ID
   (field phụ trong JSONB, app của họ bỏ qua field lạ khi hiển thị — ít xung đột nhất);
   partner ghi profile['Nguồn'] = 'SAVA CRM' (đây là field sẵn có của họ);
   sourcing ghi source = 'SAVA CRM' (field sẵn có của họ).
   Trạng thái partner mặc định: profile['Trạng thái'] là ô text tự do trong app
   của họ (không có danh sách enum suy ra được) -> dùng 'Đang đánh giá'. */
(function (global) {
  "use strict";

  var PUBOS_URL = "https://cpbaqafixndjysanweox.supabase.co";
  var PUBOS_KEY = "sb_publishable_f3Ro-ZMnT005Q22CKeo31w_B7vQKoJc";
  var PUBOS_WEB = "https://kieuttl-dovey.github.io/sava-publishing-os/";
  var PARTNER_DEFAULT_STATUS = "Đang đánh giá";

  var _client = null;
  var _session = null;
  var _profile = null;
  var _libMissing = false;
  var _lastError = "";

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }
  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function normName(s) { return String(s == null ? "" : s).trim().toLowerCase(); }
  function recordOf(row) {
    if (!row || typeof row !== "object") return {};
    if (row.data && typeof row.data === "object" && !Array.isArray(row.data)) return row.data;
    return row;
  }
  function nextPrefixedId(ids, prefix) {
    var list = (ids || []).map(function (x) { return String(x == null ? "" : x); });
    var re = new RegExp("^" + prefix.replace(/-/g, "\\-") + "(\\d+)$");
    var nums = [];
    list.forEach(function (id) { var m = id.match(re); if (m) nums.push(parseInt(m[1], 10)); });
    var countWithPrefix = list.filter(function (id) { return id.indexOf(prefix) === 0; }).length;
    var next = Math.max(nums.length ? Math.max.apply(null, nums) : 0, countWithPrefix) + 1;
    var candidate = prefix + String(next).padStart(3, "0");
    while (list.indexOf(candidate) !== -1) { next++; candidate = prefix + String(next).padStart(3, "0"); }
    return candidate;
  }
  function userId() { return (_session && _session.user && _session.user.id) || null; }
  function userEmail() {
    return (_profile && _profile.email) || (_session && _session.user && _session.user.email) || "";
  }
  function canEdit() { return !!_profile && (_profile.role === "editor" || _profile.role === "admin"); }
  function isConnected() { return !!_session; }

  /* ---------------- client (lazy) ---------------- */
  function getClient() {
    if (_client) return _client;
    if (!global.supabase || typeof global.supabase.createClient !== "function") {
      _libMissing = true;
      return null;
    }
    try {
      _client = global.supabase.createClient(PUBOS_URL, PUBOS_KEY);
    } catch (e) {
      _libMissing = true;
      _lastError = e && e.message ? e.message : String(e);
      return null;
    }
    return _client;
  }

  /* ---------------- low-level queries ----------------
     Viết theo đúng supabase-js: from(table).select('*') là thenable,
     .eq() lọc, .single() lấy 1 row, .upsert(row, {onConflict:'id'}). */
  async function selectAll(table) {
    var client = getClient();
    if (!client) throw new Error("Không tải được thư viện kết nối Publishing OS (supabase-js).");
    var res = await client.from(table).select("*");
    if (res && res.error) throw new Error(table + ": " + (res.error.message || "lỗi không rõ"));
    return (res && res.data) || [];
  }
  async function selectById(table, id) {
    if (!id) return null;
    var client = getClient();
    if (!client) throw new Error("Không tải được thư viện kết nối Publishing OS (supabase-js).");
    // Ưu tiên .single() nếu client hỗ trợ; fallback sang mảng (mock đơn giản).
    try {
      var q = client.from(table).select("*").eq("id", id);
      if (q && typeof q.single === "function") {
        var r1 = await q.single();
        if (r1 && !r1.error && r1.data) return r1.data;
        if (r1 && r1.data) return r1.data;
        // single() báo không có row -> coi như không tìm thấy, không fallback gây nhiễu
        if (r1 && r1.error) return null;
      }
    } catch (e) { /* rơi xuống fallback bên dưới */ }
    var res = await client.from(table).select("*").eq("id", id);
    if (res && res.error) throw new Error(table + ": " + (res.error.message || "lỗi không rõ"));
    var data = res && res.data;
    return Array.isArray(data) ? (data[0] || null) : (data || null);
  }
  async function upsertRow(table, row) {
    var client = getClient();
    if (!client) throw new Error("Không tải được thư viện kết nối Publishing OS (supabase-js).");
    var res = await client.from(table).upsert(row, { onConflict: "id" });
    if (res && res.error) throw new Error(table + " save failed: " + (res.error.message || "lỗi không rõ"));
    return true;
  }
  async function loadProfile() {
    if (!_session || !_session.user || !_session.user.id) { _profile = null; return null; }
    var row = await selectById("profiles", _session.user.id);
    _profile = row || { id: _session.user.id, email: userEmail(), role: "viewer" };
    return _profile;
  }

  /* ---------------- auth ---------------- */
  async function connect(email, password) {
    var client = getClient();
    if (!client) throw new Error("Không tải được thư viện kết nối Publishing OS (supabase-js) — kiểm tra mạng rồi tải lại trang.");
    if (!client.auth || typeof client.auth.signInWithPassword !== "function") throw new Error("Client Supabase không có chức năng đăng nhập.");
    var res = await client.auth.signInWithPassword({ email: String(email || "").trim(), password: password || "" });
    if (res && res.error) throw new Error(res.error.message || "Đăng nhập thất bại.");
    _session = (res && res.data && (res.data.session || res.data)) || null;
    if (!_session) throw new Error("Đăng nhập không trả về session.");
    await loadProfile();
    renderSidebar();
    return { session: _session, profile: _profile };
  }
  async function disconnect() {
    var client = getClient();
    try { if (client && client.auth && typeof client.auth.signOut === "function") await client.auth.signOut(); } catch (e) {}
    _session = null; _profile = null; _lastError = "";
    renderSidebar();
    return true;
  }
  async function init() {
    var client = getClient();
    renderSidebar();
    if (!client) return null;
    try {
      if (client.auth && typeof client.auth.getSession === "function") {
        var res = await client.auth.getSession();
        if (res && res.error) throw res.error;
        var sess = res && res.data ? res.data.session : null;
        if (sess) { _session = sess; await loadProfile(); }
      }
    } catch (e) { _lastError = e && e.message ? e.message : String(e); }
    renderSidebar();
    return _session;
  }
  function getState() {
    return {
      connected: isConnected(),
      email: userEmail(),
      role: _profile ? _profile.role : null,
      profile: _profile,
      canEdit: canEdit(),
      libMissing: _libMissing || !getClientSilent(),
      lastError: _lastError
    };
  }
  function getClientSilent() {
    if (_client) return _client;
    return (global.supabase && typeof global.supabase.createClient === "function") ? true : null;
  }

  /* ---------------- push game ---------------- */
  async function pushGame(crmGame, studioName) {
    if (!crmGame) throw new Error("Không có game để đẩy.");
    if (!isConnected()) throw new Error("Chưa kết nối Publishing OS — hãy Kết nối trước.");
    if (!canEdit()) throw new Error("Tài khoản Viewer chỉ đọc được, không đẩy được dữ liệu. Cần role Editor/Admin trên Publishing OS.");
    var studio = String(studioName || "").trim();
    if (!studio) throw new Error("Game chưa có studio sở hữu — gắn studio cho game trước khi đẩy.");
    var email = userEmail();
    var uid = userId();
    var existing = (crmGame.pubos && typeof crmGame.pubos === "object") ? crmGame.pubos : null;
    var isUpdate = !!(existing && existing.gameId);

    /* (a) Partner theo tên studio */
    var partnerRows = await selectAll("partners");
    var foundPartner = null;
    for (var i = 0; i < partnerRows.length; i++) {
      var rec = recordOf(partnerRows[i]);
      var pname = rec.profile && rec.profile["Tên Partner / Studio"];
      if (normName(pname) === normName(studio)) { foundPartner = partnerRows[i]; break; }
    }
    var partnerId;
    if (foundPartner) {
      partnerId = recordOf(foundPartner).id || foundPartner.id;
    } else {
      partnerId = (existing && existing.partnerId) || nextPrefixedId(partnerRows.map(function (r) { return recordOf(r).id || r.id; }), "P");
      var partnerRecord = {
        id: partnerId,
        profile: {
          "Tên Partner / Studio": studio,
          "Trạng thái": PARTNER_DEFAULT_STATUS,
          "Owner Publishing": email,
          "Partner ID": partnerId,
          "Nguồn": "SAVA CRM"
        },
        hardGate: {}, evidence: {}, scores: {}, scorecard: {}, decision: {}, productionPotential: {}
      };
      await upsertRow("partners", {
        id: partnerId,
        name: partnerRecord.profile["Tên Partner / Studio"],
        status: partnerRecord.profile["Trạng thái"],
        owner: partnerRecord.profile["Owner Publishing"],
        data: partnerRecord,
        updated_by: uid
      });
    }

    /* (b) Game — tạo mới hoặc upsert cập nhật, giữ scorecard/intake cũ phía họ nếu có */
    var gameId = (existing && existing.gameId) || null;
    var existingGameRecord = null;
    if (gameId) {
      var grow = await selectById("games", gameId);
      if (grow) existingGameRecord = recordOf(grow);
      else gameId = null; // mapping trỏ tới record đã bị xóa phía họ -> tạo lại bên dưới
    }
    if (!gameId) {
      var gameRows = await selectAll("games");
      gameId = nextPrefixedId(gameRows.map(function (r) { return recordOf(r).id || r.id; }), "PUB-");
    }
    var oldIntake = (existingGameRecord && existingGameRecord.intake) || {};
    var gameRecord = {
      id: gameId,
      intake: Object.assign({}, oldIntake, {
        Candidate_ID: gameId,
        Game_Title: crmGame.title || oldIntake.Game_Title || "",
        Studio: studio,
        Build_Stage: crmGame.stage || oldIntake.Build_Stage || "",
        Owner: email,
        Build_URL: crmGame.buildUrl || oldIntake.Build_URL || "",
        Trailer_URL: crmGame.trailerUrl || oldIntake.Trailer_URL || "",
        Source: "Từ SAVA CRM",
        CRM_Game_ID: crmGame.id || ""
      }),
      scorecard: (existingGameRecord && existingGameRecord.scorecard) || {},
      tests: (existingGameRecord && existingGameRecord.tests) || []
    };
    await upsertRow("games", {
      id: gameId,
      title: gameRecord.intake.Game_Title,
      studio: gameRecord.intake.Studio,
      stage: (gameRecord.scorecard && gameRecord.scorecard.decisionStage) || gameRecord.intake.Build_Stage,
      recommendation: (gameRecord.scorecard && gameRecord.scorecard.recommendation) || null,
      owner: gameRecord.intake.Owner,
      data: gameRecord,
      updated_by: uid
    });

    /* (c) Sourcing stage Lead — chỉ tạo khi chưa liên kết (đẩy cập nhật không tạo trùng) */
    var sourcingId = (existing && existing.sourcingId) || null;
    if (!isUpdate || !sourcingId) {
      var sourcingRows = await selectAll("sourcing");
      sourcingId = nextPrefixedId(sourcingRows.map(function (r) { return recordOf(r).id || r.id; }), "SRC-");
      var sourcingRecord = {
        id: sourcingId,
        partnerId: partnerId,
        gameId: gameId,
        leadName: crmGame.title || "",
        game: crmGame.title || "",
        studio: studio,
        source: "SAVA CRM",
        screeningResult: "",
        status: "Đang xử lý",
        stage: "Lead",
        leadDate: todayISO(),
        owner: email
      };
      await upsertRow("sourcing", {
        id: sourcingId,
        partner_id: sourcingRecord.partnerId,
        game_id: sourcingRecord.gameId,
        lead_name: sourcingRecord.leadName,
        stage: sourcingRecord.stage,
        owner: sourcingRecord.owner,
        data: sourcingRecord,
        updated_by: uid
      });
    }

    /* (d) Mapping lưu vào game CRM (object được truyền vào chính là game trong S.games) */
    var mapping = {
      partnerId: partnerId,
      gameId: gameId,
      sourcingId: sourcingId,
      pushedAt: new Date().toISOString(),
      pushedBy: email
    };
    crmGame.pubos = mapping;
    return mapping;
  }

  /* ---------------- fetch result ---------------- */
  async function fetchResult(crmGame) {
    if (!crmGame || !crmGame.pubos || !crmGame.pubos.gameId) throw new Error("Game chưa liên kết Publishing OS.");
    if (!isConnected()) throw new Error("Chưa kết nối Publishing OS — hãy Kết nối để lấy kết quả đánh giá.");
    var sourcingRow = crmGame.pubos.sourcingId ? await selectById("sourcing", crmGame.pubos.sourcingId) : null;
    var gameRow = await selectById("games", crmGame.pubos.gameId);
    var sData = sourcingRow ? recordOf(sourcingRow) : null;
    var gData = gameRow ? recordOf(gameRow) : null;
    return {
      sourcingStage: sData ? (sData.stage || (sourcingRow && sourcingRow.stage) || null) : null,
      screeningResult: sData ? (sData.screeningResult == null ? "" : sData.screeningResult) : null,
      sourcingStatus: sData ? (sData.status || "") : null,
      gameStage: gData ? (((gData.scorecard || {}).decisionStage) || ((gData.intake || {}).Build_Stage) || (gameRow && gameRow.stage) || null) : null,
      decisionStage: gData ? ((gData.scorecard || {}).decisionStage || null) : null,
      recommendation: gData ? (((gData.scorecard || {}).recommendation) || (gameRow && gameRow.recommendation) || null) : null,
      sourcing: sData,
      game: gData
    };
  }

  /* ---------------- UI: sidebar + modal ---------------- */
  function renderSidebar() {
    var box = typeof document !== "undefined" ? document.getElementById("pubosBox") : null;
    if (!box) return;
    if (_libMissing || !getClientSilent()) {
      box.innerHTML = '<div style="font-size:12.5px;color:#fca5a5"><b>Publishing OS:</b> không tải được thư viện kết nối</div>' +
        '<div style="font-size:11.5px;color:#94a3b8;margin-top:3px">CRM vẫn dùng bình thường. Kiểm tra mạng rồi tải lại trang để kết nối.</div>';
      return;
    }
    if (!isConnected()) {
      box.innerHTML = '<div style="font-size:12.5px;color:#e2e8f0"><b>Publishing OS:</b> Chưa kết nối</div>' +
        '<button type="button" onclick="PubOS.openConnectModal()" style="margin-top:7px;background:#0ea5e9;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700">🔗 Kết nối Publishing OS</button>' +
        (_lastError ? '<div style="font-size:11.5px;color:#fca5a5;margin-top:5px">' + esc(_lastError) + "</div>" : "");
      return;
    }
    var role = _profile ? _profile.role : "viewer";
    box.innerHTML = '<div style="font-size:12.5px;color:#e2e8f0"><b>Publishing OS:</b> Đã kết nối</div>' +
      '<div style="font-size:12px;color:#94a3b8;margin-top:2px">' + esc(userEmail()) + " (" + esc(role) + ")</div>" +
      (role === "viewer" ? '<div style="font-size:11.5px;color:#fbbf24;margin-top:3px">Viewer: chỉ đọc — nút Đẩy bị ẩn/cấm.</div>' : "") +
      '<button type="button" onclick="PubOS.disconnect()" style="margin-top:7px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px">Ngắt kết nối</button>';
  }
  function ensureModal() {
    var modal = document.getElementById("pubosModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "pubosModal";
    modal.innerHTML = '<div class="box">' +
      '<h3 style="font-size:16px">🔗 Kết nối SAVA Publishing OS</h3>' +
      '<p class="mut" style="margin-top:6px">Đăng nhập bằng tài khoản Publishing OS của bạn. Tài khoản do admin Publishing OS tạo; CRM không lưu mật khẩu — session do Supabase quản lý.</p>' +
      "<label>Email</label>" + '<input id="pubos_email" type="email" autocomplete="username" placeholder="ten@savameta.com">' +
      "<label>Mật khẩu</label>" + '<input id="pubos_password" type="password" autocomplete="current-password" placeholder="Mật khẩu Publishing OS">' +
      '<div id="pubos_error" style="color:#dc2626;font-size:13px;margin-top:8px"></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">' +
      '<button class="btn ghost" type="button" onclick="PubOS.closeConnectModal()">Hủy</button>' +
      '<button class="btn" type="button" onclick="PubOS.doConnect()">Kết nối</button></div></div>';
    document.body.appendChild(modal);
    return modal;
  }
  function openConnectModal() { ensureModal().classList.add("on"); }
  function closeConnectModal() { var m = document.getElementById("pubosModal"); if (m) m.classList.remove("on"); }
  async function doConnect() {
    var emailEl = document.getElementById("pubos_email");
    var passEl = document.getElementById("pubos_password");
    var errEl = document.getElementById("pubos_error");
    try {
      await connect(emailEl ? emailEl.value : "", passEl ? passEl.value : "");
      closeConnectModal();
      if (typeof global.toast === "function") global.toast("Đã kết nối Publishing OS — " + userEmail() + " (" + ((_profile || {}).role || "viewer") + ")");
      if (typeof global.refreshDrawer === "function") global.refreshDrawer();
    } catch (e) {
      if (errEl) errEl.textContent = e && e.message ? e.message : String(e);
    }
  }

  /* ---------------- UI: khối trong drawer game ---------------- */
  function renderResultHTML(r) {
    if (!r) return "";
    return '<div style="font-size:13px;line-height:1.65">' +
      "<div>🔎 <b>Stage phễu sourcing:</b> " + esc(r.sourcingStage || "—") + "</div>" +
      "<div>🧪 <b>Screening:</b> " + esc(r.screeningResult || "— (chưa có kết quả)") + (r.sourcingStatus ? ' · <b>Trạng thái:</b> ' + esc(r.sourcingStatus) : "") + "</div>" +
      "<div>🎮 <b>Stage game (Publishing OS):</b> " + esc(r.gameStage || "—") + "</div>" +
      "<div>🏁 <b>Recommendation:</b> " + esc(r.recommendation || "— (chưa có)") + "</div></div>";
  }
  function gameSectionHTML(g) {
    if (!g || g.own !== "partner") return "";
    var head = '<h3 style="margin:16px 0 6px">🚀 Publishing OS</h3>';
    if (_libMissing || !getClientSilent()) {
      return head + '<div class="mut">Không tải được thư viện kết nối — CRM vẫn dùng bình thường, thử tải lại trang khi có mạng.</div>';
    }
    if (!g.pubos || !g.pubos.gameId) {
      if (!isConnected()) {
        return head + '<div class="mut" style="margin-bottom:8px">Chưa kết nối Publishing OS. Kết nối để đẩy game này sang cho đội Publishing đánh giá.</div>' +
          '<button class="btn" type="button" onclick="PubOS.openConnectModal()">🔗 Kết nối Publishing OS</button>';
      }
      if (!canEdit()) {
        return head + '<div class="mut">Đã kết nối bằng tài khoản <b>Viewer</b> (' + esc(userEmail()) + ") — Viewer chỉ đọc, không đẩy được. Cần Editor/Admin để đẩy game.</div>";
      }
      return head + '<div class="mut" style="margin-bottom:8px">Đẩy game này sang SAVA Publishing OS: tự tạo/tìm Partner theo studio, tạo Game + Sourcing (stage Lead) bên đó.</div>' +
        '<button class="btn" type="button" onclick="pubosPushGame(\'' + esc(g.id) + '\')">🚀 Đẩy sang Publishing OS</button>' +
        '<div id="pubosMsg" class="mut" style="margin-top:6px"></div>';
    }
    var p = g.pubos;
    var html = head +
      '<div style="font-size:13px;line-height:1.6"><b>✅ Đã liên kết Publishing OS</b><br>' +
      "Partner: <b>" + esc(p.partnerId) + "</b> · Game: <b>" + esc(p.gameId) + "</b> · Sourcing: <b>" + esc(p.sourcingId || "—") + "</b><br>" +
      '<span class="mut">Đẩy lúc ' + esc(p.pushedAt || "") + (p.pushedBy ? " bởi " + esc(p.pushedBy) : "") + "</span></div>" +
      '<div style="display:flex;gap:8px;margin-top:9px;flex-wrap:wrap">';
    if (isConnected() && canEdit()) html += '<button class="btn ghost" type="button" onclick="pubosPushGame(\'' + esc(g.id) + '\')">↻ Đẩy cập nhật</button>';
    if (isConnected()) html += '<button class="btn" type="button" onclick="pubosFetchResult(\'' + esc(g.id) + '\')">🔄 Lấy kết quả đánh giá</button>';
    html += '<a class="btn ghost" style="text-decoration:none" target="_blank" rel="noopener" href="' + PUBOS_WEB + '#sourcing">🔎 Mở Sourcing ↗</a>' +
      '<a class="btn ghost" style="text-decoration:none" target="_blank" rel="noopener" href="' + PUBOS_WEB + '#games">🎮 Mở Games ↗</a></div>';
    if (!isConnected()) html += '<div class="mut" style="margin-top:7px">Chưa kết nối — bấm Kết nối ở sidebar để lấy kết quả đánh giá mới nhất.</div>';
    if (isConnected() && !canEdit()) html += '<div class="mut" style="margin-top:7px">Viewer: đọc được kết quả, không Đẩy cập nhật được.</div>';
    html += '<div id="pubosResult" style="margin-top:10px"></div><div id="pubosMsg" class="mut" style="margin-top:6px"></div>';
    return html;
  }
  async function loadResultIntoDrawer(crmGame) {
    var target = typeof document !== "undefined" ? document.getElementById("pubosResult") : null;
    if (!target) return null;
    try {
      var r = await fetchResult(crmGame);
      target.innerHTML = renderResultHTML(r);
      return r;
    } catch (e) {
      target.innerHTML = '<div style="color:#dc2626;font-size:13px">⚠️ Không lấy được kết quả từ Publishing OS: ' + esc(e && e.message ? e.message : String(e)) + " — dữ liệu CRM không bị ảnh hưởng.</div>";
      return null;
    }
  }
  function renderGameSection(g) {
    var host = typeof document !== "undefined" ? document.getElementById("pubosSection") : null;
    if (!host) return;
    host.innerHTML = gameSectionHTML(g);
    if (g && g.pubos && g.pubos.gameId && isConnected()) loadResultIntoDrawer(g);
  }

  /* ---------------- public API ---------------- */
  var api = {
    URL: PUBOS_URL,
    WEB: PUBOS_WEB,
    PARTNER_DEFAULT_STATUS: PARTNER_DEFAULT_STATUS,
    connect: connect,
    disconnect: disconnect,
    init: init,
    getState: getState,
    isConnected: isConnected,
    canEdit: canEdit,
    getClient: getClient,
    pushGame: pushGame,
    fetchResult: fetchResult,
    renderSidebar: renderSidebar,
    openConnectModal: openConnectModal,
    closeConnectModal: closeConnectModal,
    doConnect: doConnect,
    gameSectionHTML: gameSectionHTML,
    renderGameSection: renderGameSection,
    renderResultHTML: renderResultHTML,
    loadResultIntoDrawer: loadResultIntoDrawer,
    _nextPrefixedId: nextPrefixedId,
    /* Chỉ dùng cho kiểm thử mock — không dùng ở production flow */
    _setMockClient: function (client, session, profile) {
      _client = client; _session = session || null; _profile = profile || null; _libMissing = false;
    },
    _resetForTest: function () { _client = null; _session = null; _profile = null; _libMissing = false; _lastError = ""; }
  };
  global.PubOS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof document !== "undefined") {
    renderSidebar(); // sidebar đã có trong DOM trước thẻ script -> vẽ trạng thái ngay
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(); });
    else init();
  }
})(typeof window !== "undefined" ? window : globalThis);
