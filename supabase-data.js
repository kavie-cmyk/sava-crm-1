/* Sava Meta CRM — Tầng dữ liệu Supabase (Giai đoạn 2b).
   Chiến lược (ít xâm lấn, giữ nguyên UI/tính điểm):
   - Supabase là NGUỒN SỰ THẬT. Khi vào app (đã đăng nhập), loadAll() nạp
     toàn bộ bảng cần cho trang -> adapter đổi rows thành đúng hình dạng
     state cũ -> ghi vào 2 kho localStorage như một BẢN CACHE GƯƠNG.
     Mọi code hiện tại (loadState/read/write/save, tính điểm) chạy nguyên
     trên cache như trước, không sửa logic.
   - Ghi: bọc localStorage.setItem — mọi lần app ghi 1 trong 2 kho đều lên
     lịch ĐỒNG BỘ DIFF theo entity lên Supabase (upsert theo id, xoá theo
     id, tách field private đúng adapter). localStorage cũ KHÔNG bị xoá:
     trước lần ghi đè cache đầu tiên, bản gốc được sao lưu sang khoá
     *__pre_supabase_backup (công cụ import đọc từ đó).
   - Xung đột: trước khi ghi đè một entity đã có, đối chiếu updated_at ở
     server với mốc lúc nạp; lệch -> vẫn ghi (last-write-wins) nhưng cảnh
     báo rõ. Revision Publishing là append-only: chỉ INSERT revision mới,
     không bao giờ UPDATE/DELETE (xoá request thì cascade theo FK).
   - Lỗi mạng/RLS: banner đỏ cố định + tự thử lại; không mất dữ liệu âm
     thầm (bản local vẫn còn nguyên trong cache và sẽ đồng bộ tiếp).
   Vai trò: MKT không đẩy kho CRM (RLS cũng chặn ghi CRM với MKT) và không
   tạo request mới; vai 'Khác' không đẩy gì. */
(function () {
  'use strict';
  const A = (typeof window !== 'undefined' && window.SavaAdapter) || (typeof globalThis !== 'undefined' && globalThis.SavaAdapter) || null;
  const CRM_KEY = 'sava_crm_shared_v1', PUB_KEY = 'sava_publishing_v1';
  const CRM_BACKUP_KEY = CRM_KEY + '__pre_supabase_backup', PUB_BACKUP_KEY = PUB_KEY + '__pre_supabase_backup';

  const ctx = { client: null, role: null, ready: false, enabled: false };
  let crmSnap = null, pubSnap = null;           // state tại thời điểm nạp / sau lần đồng bộ thành công
  let updMap = {};                              // {table: {id: updated_at}} phục vụ phát hiện xung đột
  let syncing = false, dirty = false, failCount = 0, retryTimer = null;
  let warnedRevChange = false;
  /* Vá lỗ hổng đồng bộ (5/11/2026): promise của vòng runSync đang chạy
     (để flushSync chờ đúng vòng đó thay vì đoán), cờ chống đăng ký trùng
     các handler rời trang/điều hướng, và ngân sách chờ điều hướng. */
  let currentSyncPromise = null;
  let lifecycleRegistered = false, navGuardRegistered = false;
  const NAV_FLUSH_TIMEOUT_MS = 2500;

  /* ---------- UI cảnh báo đồng bộ ---------- */
  function bannerEl() {
    let el = document.getElementById('savaSyncBanner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'savaSyncBanner';
      el.setAttribute('role', 'alert');
      el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:9999;max-width:min(92vw,640px);background:#fef2f2;border:1.5px solid #dc2626;color:#991b1b;border-radius:10px;padding:10px 14px;font-size:13.5px;line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,.18);display:none';
      document.body.appendChild(el);
    }
    return el;
  }
  function showSyncError(msg) {
    try {
      const el = bannerEl();
      el.innerHTML = '';
      const span = document.createElement('span'); span.textContent = '⚠️ ' + msg + ' ';
      const btn = document.createElement('button');
      btn.textContent = 'Thử đồng bộ lại';
      btn.style.cssText = 'background:#dc2626;color:#fff;border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-weight:600';
      btn.onclick = () => { failCount = 0; scheduleSync(0); };
      el.appendChild(span); el.appendChild(btn);
      el.style.display = 'block';
    } catch (e) {}
  }
  function clearSyncError() { try { const el = document.getElementById('savaSyncBanner'); if (el) el.style.display = 'none'; } catch (e) {} }
  function warnTransient(msg) {
    try {
      const el = bannerEl();
      el.textContent = '⚠️ ' + msg;
      el.style.display = 'block';
      el.style.background = '#fffbeb'; el.style.borderColor = '#f59e0b'; el.style.color = '#92400e';
      setTimeout(() => { el.style.display = 'none'; el.style.background = '#fef2f2'; el.style.borderColor = '#dc2626'; el.style.color = '#991b1b'; }, 6000);
    } catch (e) {}
  }

  /* ---------- helpers ---------- */
  function staticRecordIds() {
    try {
      const recs = (typeof window !== 'undefined' && window.PublishingData && window.PublishingData.records) || [];
      return new Set(recs.map(r => r.id));
    } catch (e) { return new Set(); }
  }
  function rawSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  /* So sánh cache cũ với state máy chủ theo NỘI DUNG (deep-equal trên bản
     đã parse), KHÔNG theo chuỗi JSON thô: app tự ghi lại cache qua lớp
     migrate (loadState/storeState trong shared.js, read/write trong
     publishing.js) nên thứ tự khoá/định dạng chuỗi có thể khác mà nội dung
     vẫn là đúng dữ liệu máy chủ. So chuỗi thô khiến `changed` bật ở mọi
     lần nạp -> cổng auth tải lại trang vô hạn (sự cố 30/10/2026).
     Hai khoá _crmRev/_crmTab là siêu dữ liệu guard nhiều tab THUẦN cục bộ
     (save() trong index.html ghi; adapter không bao giờ đưa lên máy chủ)
     nên bị loại khỏi phép so ở cả hai phía. */
  function parseCachedState(raw) {
    if (raw === null || raw === undefined) return undefined;
    try { const v = JSON.parse(raw); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : undefined; } catch (e) { return undefined; }
  }
  function canonicalForCompare(state) {
    const c = A.clone(state);
    if (c && typeof c === 'object') { delete c._crmRev; delete c._crmTab; }
    return c;
  }
  function cacheDiffers(priorRaw, newState) {
    if (priorRaw === null || priorRaw === undefined) return true;
    const prior = parseCachedState(priorRaw);
    if (prior === undefined) return priorRaw !== JSON.stringify(newState);
    return !A.deepEqual(canonicalForCompare(prior), canonicalForCompare(newState));
  }
  function backupOnce(key, backupKey) {
    try {
      const raw = localStorage.getItem(key);
      if (raw && !localStorage.getItem(backupKey)) localStorage.setItem(backupKey, raw);
    } catch (e) {}
  }
  async function q(table, build) {
    let query = ctx.client.from(table).select('*');
    if (build) query = build(query);
    const { data, error } = await query;
    if (error) throw new Error(table + ': ' + (error.message || error.code || 'lỗi không rõ'));
    return data || [];
  }
  async function qSafe(table, build) { try { return await q(table, build); } catch (e) { return []; } }
  function noteUpdated(table, rows) {
    if (!updMap[table]) updMap[table] = {};
    (rows || []).forEach(r => { if (r && r.id && r.updated_at) updMap[table][r.id] = r.updated_at; });
  }

  /* ---------- Nạp toàn bộ từ Supabase -> state cũ -> cache ---------- */
  async function loadAll() {
    if (!A) throw new Error('Thiếu supabase-adapter.js');
    /* Ảnh chụp cache lúc BẮT ĐẦU nạp — dùng ở cuối để phát hiện app đã
       ghi cache trong lúc đang nạp (chỉ có thể xảy ra ở đường boot
       mở-nhanh, khi giao diện đã hiện bằng cache và người dùng kịp sửa
       trước lúc dữ liệu máy chủ về). */
    let startCrm = null, startPub = null;
    try { startCrm = localStorage.getItem(CRM_KEY); } catch (e) {}
    try { startPub = localStorage.getItem(PUB_KEY); } catch (e) {}
    const byCreated = qb => qb.order('created_at', { ascending: true });
    const [members, companies, archive, games, leads, deals, dealTerms, dealContracts, dealLeads, tasks, activities, events, eventLinks] = await Promise.all([
      q('members', byCreated), q('companies', byCreated), qSafe('company_partner_eval_archive'),
      q('games', byCreated), q('leads', byCreated),
      qSafe('deals', byCreated), qSafe('deal_terms'), qSafe('deal_contracts'), qSafe('deal_leads'),
      qSafe('tasks', byCreated), qSafe('activities', byCreated),
      qSafe('events', byCreated), qSafe('event_links'),
    ]);
    const crmState = A.crmRowsToState({ members, companies, company_partner_eval_archive: archive, games, leads, deals, deal_terms: dealTerms, deal_contracts: dealContracts, deal_leads: dealLeads, tasks, activities, events, event_links: eventLinks });
    const [requests, revisions, revPriv, intakePriv, observations, audit] = await Promise.all([
      qSafe('publishing_requests', byCreated),
      qSafe('publishing_revisions', qb => qb.order('revision_no', { ascending: true })),
      qSafe('publishing_revision_private'),
      qSafe('publishing_request_intake_private'),
      qSafe('market_observations', byCreated),
      qSafe('market_observation_audit', qb => qb.order('seq', { ascending: true })),
    ]);
    const pubState = A.publishingRowsToState({ publishing_requests: requests, publishing_revisions: revisions, publishing_revision_private: revPriv, publishing_request_intake_private: intakePriv, market_observations: observations, market_observation_audit: audit });

    updMap = {};
    [['members', members], ['companies', companies], ['games', games], ['leads', leads], ['deals', deals], ['tasks', tasks], ['activities', activities], ['events', events], ['publishing_requests', requests], ['market_observations', observations]]
      .forEach(([t, rows]) => noteUpdated(t, rows));

    /* Sao lưu bản localStorage gốc (dữ liệu thật trước Supabase) rồi mới
       ghi đè cache bằng dữ liệu Supabase. */
    backupOnce(CRM_KEY, CRM_BACKUP_KEY);
    backupOnce(PUB_KEY, PUB_BACKUP_KEY);
    /* `changed`: nội dung cache TRƯỚC khi ghi đè có khác dữ liệu máy chủ
       vừa nạp không (so theo NỘI DUNG đã parse — xem cacheDiffers; so
       chuỗi JSON thô từng khiến changed luôn true và auth tải lại trang
       vô hạn). Tầng auth dùng cờ này để tải lại trang TỐI ĐA 1 lần cho
       mỗi phiên bản dữ liệu máy chủ khi cache đã đổi — nhờ vậy state
       trong bộ nhớ mà trang đã parse từ cache cũ (kể cả dữ liệu mẫu/test
       cũ) bị loại bỏ hoàn toàn trước khi đồng bộ ghi được bật, không còn
       đường nào để save() sau đó ghi đè cache máy chủ bằng bản cũ rồi
       diff-sync đẩy ngược lên. */
    let priorCrm = null, priorPub = null;
    try { priorCrm = localStorage.getItem(CRM_KEY); } catch (e) {}
    try { priorPub = localStorage.getItem(PUB_KEY); } catch (e) {}
    const crmJson = JSON.stringify(crmState), pubJson = JSON.stringify(pubState);
    const changed = cacheDiffers(priorCrm, crmState) || cacheDiffers(priorPub, pubState);
    const hash = A.hashStr(crmJson + '|' + pubJson);
    /* Người dùng ĐÃ SỬA cache trong lúc nạp (boot mở-nhanh): cache cuối
       khác ảnh chụp ban đầu VỀ MẶT CHUỖI và khác dữ liệu máy chủ VỀ NỘI
       DUNG. Khi đó TUYỆT ĐỐI không ghi đè cache bằng dữ liệu máy chủ
       (sẽ nuốt mất bản sửa vừa làm); thay vào đó: snapshot đồng bộ được
       đặt = dữ liệu máy chủ, cache local giữ nguyên, và tầng auth bật
       đồng bộ + đẩy diff ngay — bản sửa được đối xử như mọi lần sửa
       sau khi vào app (last-write-wins theo chính sách xung đột sẵn
       có). Đường cổng cũ không bao giờ gặp nhánh này vì giao diện bị
       khoá trong lúc nạp, không ai sửa được. */
    const localDirty = (priorCrm !== startCrm || priorPub !== startPub) && changed;
    if (localDirty) {
      crmSnap = A.clone(crmState); pubSnap = A.clone(pubState);
      return { crmState, pubState, hash, changed: true, localDirty: true };
    }
    rawSet(CRM_KEY, crmJson);
    rawSet(PUB_KEY, pubJson);
    crmSnap = A.clone(crmState); pubSnap = A.clone(pubState);
    return { crmState, pubState, hash, changed, localDirty: false };
  }

  /* ---------- Đồng bộ diff ---------- */
  function attach(client, role) { ctx.client = client; ctx.role = role; }
  function setEnabled(v) {
    ctx.enabled = !!v;
    if (v) {
      ctx.ready = true;
      /* FIX C8: mục audit sinh trong cửa sổ boot-nhanh (enabled=false)
         được GIỮ trong hàng đợi — bật tầng dữ liệu là lúc flush chúng,
         nếu không chúng sẽ nằm kẹt vô thời hạn tới lần ghi audit kế. */
      try { if (typeof auditQueue !== 'undefined' && auditQueue.length) scheduleAuditFlush(0); } catch (e) {}
    }
  }

  function scheduleSync(delay) {
    if (!ctx.enabled) return;
    dirty = true;
    if (syncing) return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(runSync, delay === undefined ? 700 : delay);
  }

  function installHook() {
    if (installHook.done) return;
    installHook.done = true;
    registerLifecycleFlush();
    registerNavGuard();
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) {
      orig(k, v);
      if ((k === CRM_KEY || k === PUB_KEY) && ctx.enabled && !installHook._mute) scheduleSync();
    };
    installHook._orig = orig;
  }
  function cacheWrite(key, stateObj) {
    installHook._mute = true;
    try { localStorage.setItem(key, JSON.stringify(stateObj)); } finally { installHook._mute = false; }
  }

  function indexBy(rows, key) { const m = new Map(); (rows || []).forEach(r => { if (r && r[key] !== undefined && r[key] !== null) m.set(String(r[key]), r); }); return m; }
  function planFor(newRows, snapRows, key) {
    const n = indexBy(newRows, key), s = indexBy(snapRows, key);
    const upserts = [], deletes = [];
    n.forEach((row, id) => { const old = s.get(id); if (!old || !A.deepEqual(row, old)) upserts.push(row); });
    s.forEach((row, id) => { if (!n.has(id)) deletes.push(id); });
    return { upserts, deletes };
  }
  async function checkConflicts(table, rows) {
    const ids = rows.map(r => r.id).filter(id => updMap[table] && updMap[table][id]);
    if (!ids.length) return [];
    try {
      const { data, error } = await ctx.client.from(table).select('id,updated_at').in('id', ids);
      if (error || !data) return [];
      return data.filter(r => updMap[table][r.id] && r.updated_at !== updMap[table][r.id]).map(r => table + '/' + r.id);
    } catch (e) { return []; }
  }
  async function upsert(table, rows, onConflict) {
    if (!rows.length) return [];
    const { data, error } = await ctx.client.from(table).upsert(rows, onConflict ? { onConflict } : undefined).select('*');
    if (error) throw new Error(table + ': ' + (error.message || error.code));
    return data || [];
  }
  async function insertRows(table, rows, onConflict) {
    if (!rows.length) return [];
    let query = ctx.client.from(table).insert(rows);
    const { data, error } = await query.select('*');
    if (error) throw new Error(table + ': ' + (error.message || error.code));
    return data || [];
  }
  async function deleteIds(table, ids, key) {
    if (!ids.length) return;
    const { error } = await ctx.client.from(table).delete().in(key || 'id', ids);
    if (error) throw new Error(table + ': ' + (error.message || error.code));
  }

  const CONFLICT_TABLES = ['members', 'companies', 'games', 'leads', 'deals', 'tasks', 'activities', 'events', 'publishing_requests', 'market_observations'];

  async function syncCrm(local) {
    const newRows = A.crmStateToRows(local);
    const snapRows = A.crmStateToRows(crmSnap || {});
    const conflicts = [];
    /* Thứ tự ghi tôn trọng FK: cha trước (members->companies->games->leads
       ->deals->term/contract/leads->tasks->events->activities); xoá thì
       ngược lại. Hai bảng nối deal_leads + event_links được xử lý riêng
       SAU vòng upsert bên dưới (xem FIX Việc 1 ở khối deal_leads). */
    const order = [
      ['members', 'id'], ['companies', 'id'], ['company_partner_eval_archive', 'company_id'],
      ['games', 'id'], ['leads', 'id'], ['deals', 'id'], ['deal_terms', 'deal_id'],
      ['deal_contracts', 'deal_id'], ['tasks', 'id'], ['events', 'id'], ['activities', 'id'], /* Sự kiện TRƯỚC activities: activities.event_id FK -> events (đợt 5/11/2026); vòng xoá chạy ngược order nên activities vẫn bị xoá trước events */
    ];
    const plans = {};
    for (const [table, key] of order) plans[table] = planFor(newRows[table], snapRows[table], key);
    /* deal_leads: so theo từng deal; khác -> xoá hết của deal đó rồi nạp lại. */
    const groupLeads = rows => { const m = {}; (rows || []).forEach(r => { (m[r.deal_id] = m[r.deal_id] || []).push(r.lead_id); }); Object.values(m).forEach(v => v.sort()); return m; };
    const nl = groupLeads(newRows.deal_leads), sl = groupLeads(snapRows.deal_leads);
    const leadChangedDeals = new Set([...Object.keys(nl), ...Object.keys(sl)].filter(id => !A.deepEqual(nl[id] || [], sl[id] || [])));
    /* event_links: so theo từng event như deal_leads — mỗi phần tử so là
       cặp 'entity_type:entity_id' đã sắp xếp, vì một event liên kết tới
       3 loại đối tượng khác nhau trong cùng một bảng nối. */
    const groupEventLinks = rows => { const m = {}; (rows || []).forEach(r => { (m[r.event_id] = m[r.event_id] || []).push(r.entity_type + ':' + r.entity_id); }); Object.values(m).forEach(v => v.sort()); return m; };
    const nev = groupEventLinks(newRows.event_links), sev = groupEventLinks(snapRows.event_links);
    const linkChangedEvents = new Set([...Object.keys(nev), ...Object.keys(sev)].filter(id => !A.deepEqual(nev[id] || [], sev[id] || [])));

    /* FIX Việc 1 (3/11/2026) — ĐẢM BẢO CHA CÓ MẶT TRONG VÒNG NÀY: nếu một
       dòng CON có upsert (hoặc một bảng nối có thay đổi) mà dòng CHA không
       đổi ở local nên không nằm trong plan, cha vẫn phải được upsert kèm
       trong vòng này — TRƯỚC con theo đúng thứ tự `order`. Nếu không, khi
       cha vắng mặt trên server (vd bị phiên khác xoá sau lần nạp) con sẽ
       insert vào khoảng trống và chết FK, dù local không hề sai. Cha còn
       sống ở local mới được bổ sung (cha đã xoá ở local thì con của nó
       hoặc đã bị xoá theo, hoặc FK cascade/SET NULL của DB xử lý). Chạy
       2 lượt để chuỗi cha lồng nhau (term -> deal -> game/company) khép
       kín; hàm có tính idempotent nhờ tập `planned`. */
    function ensureParentRows(childRows, fkCol, parentTable) {
      const byId = indexBy(newRows[parentTable], 'id');
      const planned = new Set(plans[parentTable].upserts.map(r => String(r.id)));
      (childRows || []).forEach(r => {
        const pid = r && r[fkCol];
        if (pid === null || pid === undefined || pid === '' || planned.has(String(pid))) return;
        const prow = byId.get(String(pid));
        if (prow) { plans[parentTable].upserts.push(prow); planned.add(String(pid)); }
      });
    }
    function ensureAllParents() {
      ensureParentRows(plans.company_partner_eval_archive.upserts, 'company_id', 'companies');
      ensureParentRows(plans.games.upserts, 'company_id', 'companies');
      ensureParentRows(plans.leads.upserts, 'company_id', 'companies');
      ensureParentRows(plans.deals.upserts, 'company_id', 'companies');
      ensureParentRows(plans.deals.upserts, 'game_id', 'games');
      ensureParentRows(plans.deal_terms.upserts, 'deal_id', 'deals');
      ensureParentRows(plans.deal_contracts.upserts, 'deal_id', 'deals');
      ensureParentRows(plans.tasks.upserts, 'deal_id', 'deals');
      ensureParentRows(plans.activities.upserts, 'deal_id', 'deals');
      /* Đợt Lead/Game: hoạt động gắn TRỰC TIẾP vào lead/game — cha của
         chúng là leads/games, và thứ tự `order` (games/leads TRƯỚC
         activities) đã đảm bảo cha được upsert trước con trong cùng vòng
         khi cả hai cùng có plan; ensureParentRows phủ ca cha không đổi ở
         local (không nằm trong plan) nhưng vắng mặt trên server. */
      ensureParentRows(plans.activities.upserts, 'lead_id', 'leads');
      ensureParentRows(plans.activities.upserts, 'game_id', 'games');
      /* Đợt Sự kiện (5/11/2026): hoạt động gắn TRỰC TIẾP vào sự kiện — cha là events, cùng mẫu lead/game ở trên. */
      ensureParentRows(plans.activities.upserts, 'event_id', 'events');
      ensureParentRows([...leadChangedDeals].map(id => ({ deal_id: id })), 'deal_id', 'deals');
      ensureParentRows([...linkChangedEvents].map(id => ({ event_id: id })), 'event_id', 'events');
    }
    ensureAllParents(); ensureAllParents();
    for (const [table] of order) {
      if (CONFLICT_TABLES.includes(table) && plans[table].upserts.length) {
        conflicts.push(...await checkConflicts(table, plans[table].upserts.filter(r => (updMap[table] || {})[r.id])));
      }
    }

    for (const [table] of [...order].reverse()) {
      const key = order.find(([t]) => t === table)[1];
      await deleteIds(table, plans[table].deletes, key);
    }
    for (const [table] of order) {
      const saved = await upsert(table, plans[table].upserts, undefined);
      if (CONFLICT_TABLES.includes(table)) noteUpdated(table, saved);
    }
    /* deal_leads: deal nào đổi -> xoá hết leads của deal đó rồi nạp lại;
       chỉ với deal còn sống — deal đã xoá thì FK cascade của DB tự dọn.
       FIX Việc 1 (3/11/2026): khối này TRƯỚC ĐÂY đặt TRƯỚC vòng upsert ở
       trên — tạo deal MỚI kèm lead trong cùng một lần lưu (vd tạo deal /
       gắn lead từ drawer Game) là insert deal_leads khi dòng deals cha
       CHƯA tồn tại trên server -> vỡ FK "deal_leads_deal_id_fkey" ngay
       lần đồng bộ đầu tiên, và vì snapshot không được cập nhật khi lỗi,
       mọi lần retry đều vỡ y hệt. Nay đặt SAU vòng upsert như event_links
       bên dưới: cha (deals + leads) đã có mặt thì con mới insert; cha lỗi
       ở vòng upsert thì exception ném ra trước, con KHÔNG được đẩy và cả
       cụm nằm lại chờ retry đúng thứ tự (snapshot chỉ tiến khi syncCrm
       chạy trọn). */
    if (leadChangedDeals.size) {
      const aliveDeals = new Set(newRows.deals.map(d => d.id));
      const targets = [...leadChangedDeals].filter(id => aliveDeals.has(id));
      if (targets.length) {
        const { error } = await ctx.client.from('deal_leads').delete().in('deal_id', targets);
        if (error) throw new Error('deal_leads: ' + (error.message || error.code));
        const ins = newRows.deal_leads.filter(r => targets.includes(r.deal_id));
        if (ins.length) await insertRows('deal_leads', ins);
      }
    }
    /* event_links: đúng mẫu deal_leads ở trên (event nào đổi -> xoá hết
       links của event đó rồi nạp lại; chỉ với event còn sống — event đã
       xoá thì FK cascade của DB tự dọn links). Khối này vốn đã đặt SAU
       vòng upsert để dòng events cha đã tồn tại khi nạp links của event
       MỚI, không vi phạm FK event_links.event_id -> events(id). */
    if (linkChangedEvents.size) {
      const aliveEvents = new Set(newRows.events.map(e => e.id));
      const targets = [...linkChangedEvents].filter(id => aliveEvents.has(id));
      if (targets.length) {
        const { error } = await ctx.client.from('event_links').delete().in('event_id', targets);
        if (error) throw new Error('event_links: ' + (error.message || error.code));
        const ins = newRows.event_links.filter(r => targets.includes(r.event_id));
        if (ins.length) await insertRows('event_links', ins);
      }
    }
    return conflicts;
  }

  async function syncPub(local) {
    const conflicts = [];
    /* Vật hoá current lệch (MIGRATION 5.3) ngay trên cache để state và DB
       không lệch nhau dai dẳng. */
    let fixed = false;
    (local.requests || []).forEach(req => {
      if (!A.isObj(req)) return;
      const mat = A.materializeCurrent(req);
      if (mat.materialized) { req.revisions = mat.revisions; req.current = mat.current; req.revision = mat.revisions.length; fixed = true; }
    });
    if (fixed) cacheWrite(PUB_KEY, local);

    const newRows = A.publishingStateToRows(local, staticRecordIds());
    const snapRows = A.publishingStateToRows(pubSnap || { requests: [], marketUpdates: [] }, staticRecordIds());
    const isMkt = ctx.role === 'mkt';

    /* requests: upsert (bản mới của MKT bị bỏ qua — RLS cũng chặn INSERT),
       con trỏ current_revision_no cập nhật ở pass 2 sau khi revision đã có. */
    const reqPlan = planFor(newRows.publishing_requests, snapRows.publishing_requests, 'id');
    const snapReqById = indexBy(snapRows.publishing_requests, 'id');
    let reqUpserts = reqPlan.upserts;
    if (isMkt) reqUpserts = reqUpserts.filter(r => snapReqById.has(String(r.id)));
    /* FIX Việc 1: intake_private tính plan SỚM (thực thi vẫn ở dưới, sau
       revisions) để dùng cho chốt chặn đảm-bảo-cha ngay dưới đây. */
    const intPlan = !isMkt && ctx.role !== 'other'
      ? planFor(newRows.publishing_request_intake_private, snapRows.publishing_request_intake_private, 'request_id')
      : { upserts: [], deletes: [] };
    /* FIX Việc 1 — ĐẢM BẢO CHA CÓ MẶT TRONG VÒNG NÀY (như syncCrm): con
       là intake_private / revision MỚI có thể phát sinh trong khi dòng
       publishing_requests cha không đổi ở local (không nằm trong plan);
       nếu cha vắng mặt trên server thì con chết FK. Bổ sung cha vào
       reqUpserts TRƯỚC pass 1 (vẫn tôn trọng chốt MKT như plan gốc). */
    {
      const snapRevCount0 = {};
      snapRows.publishing_revisions.forEach(r => { snapRevCount0[r.request_id] = Math.max(snapRevCount0[r.request_id] || 0, r.revision_no); });
      const reqRowById = indexBy(newRows.publishing_requests, 'id');
      const reqPlanned = new Set(reqUpserts.map(r => String(r.id)));
      const ensureReqParent = id => {
        if (id === null || id === undefined || reqPlanned.has(String(id))) return;
        if (isMkt && !snapReqById.has(String(id))) return;
        const row = reqRowById.get(String(id));
        if (row) { reqUpserts.push(row); reqPlanned.add(String(id)); }
      };
      intPlan.upserts.forEach(r => ensureReqParent(r.request_id));
      newRows.publishing_revisions.forEach(r => { if (r.revision_no > (snapRevCount0[r.request_id] || 0)) ensureReqParent(r.request_id); });
    }
    if (CONFLICT_TABLES.includes('publishing_requests') && reqUpserts.length) {
      conflicts.push(...await checkConflicts('publishing_requests', reqUpserts.filter(r => (updMap.publishing_requests || {})[r.id])));
    }
    /* Pass 1: pointer để NULL với mọi request mà con trỏ THAY ĐỔI so với
       snapshot (request mới hoặc vừa có revision mới) — FK current là
       DEFERRABLE nhưng PostgREST cam kết theo từng lệnh, revision chưa
       insert thì pointer trỏ vào đó sẽ bị FK từ chối. Pass 2 (sau khi
       revision đã insert) mới set pointer thật. */
    const pass1 = reqUpserts.map(r => {
      const old = snapReqById.get(String(r.id));
      return (!old || old.current_revision_no !== r.current_revision_no) ? { ...r, current_revision_no: null } : r;
    });
    const savedReqs = await upsert('publishing_requests', pass1, undefined);
    noteUpdated('publishing_requests', savedReqs);

    /* revisions: CHỈ insert revision_no lớn hơn bản đã có ở snapshot;
       revision cũ bị sửa cục bộ -> không ghi đè lịch sử, cảnh báo 1 lần. */
    const snapRevCount = {};
    snapRows.publishing_revisions.forEach(r => { snapRevCount[r.request_id] = Math.max(snapRevCount[r.request_id] || 0, r.revision_no); });
    const snapRevByKey = indexBy(snapRows.publishing_revisions.map(r => ({ ...r, _k: r.request_id + '#' + r.revision_no })), '_k');
    const newRevs = [], newPrivs = [];
    newRows.publishing_revisions.forEach(r => {
      const cnt = snapRevCount[r.request_id] || 0;
      if (r.revision_no > cnt) newRevs.push(r);
      else {
        const old = snapRevByKey.get(r.request_id + '#' + r.revision_no);
        if (old && !A.deepEqual({ ...old, _k: undefined }, r) && !warnedRevChange) {
          warnedRevChange = true;
          warnTransient('Một phiên bản đánh giá cũ đã bị thay đổi cục bộ — lịch sử đánh giá là bất biến nên thay đổi đó không được ghi lên máy chủ.');
        }
      }
    });
    const newRevKeys = new Set(newRevs.map(r => r.request_id + '#' + r.revision_no));
    newRows.publishing_revision_private.forEach(r => { if (newRevKeys.has(r.request_id + '#' + r.revision_no)) newPrivs.push(r); });
    await insertRows('publishing_revisions', newRevs);
    if (!isMkt) { try { await insertRows('publishing_revision_private', newPrivs); } catch (e) { /* private rỗng với MKT bị RLS chặn là bình thường */ if (ctx.role === 'bd' || ctx.role === 'admin') throw e; } }
    else if (newPrivs.some(p => p.bd_comment || p.game_gate_note || p.game_gate_source || p.deal_entry || p.legal_entry || p.gate_details || p.production_pillar_source)) {
      /* MKT không có quyền ghi private; revision của MKT vốn không mang field private. */
    }

    /* intake private: chỉ BD/Admin (plan đã tính sớm ở đầu syncPub) */
    if (!isMkt && ctx.role !== 'other') {
      await upsert('publishing_request_intake_private', intPlan.upserts, 'request_id');
      await deleteIds('publishing_request_intake_private', intPlan.deletes, 'request_id');
    }

    /* pass 2: con trỏ current_revision_no */
    const ptrUpdates = reqUpserts.filter(r => {
      const old = snapReqById.get(String(r.id));
      return r.current_revision_no !== null && (!old || old.current_revision_no !== r.current_revision_no || !snapReqById.has(String(r.id)));
    });
    for (const r of ptrUpdates) {
      const { error } = await ctx.client.from('publishing_requests').update({ current_revision_no: r.current_revision_no, legacy_revision_counter: r.legacy_revision_counter }).eq('id', r.id);
      if (error) throw new Error('publishing_requests(current): ' + (error.message || error.code));
    }
    await deleteIds('publishing_requests', reqPlan.deletes, 'id');

    /* market observations + audit (audit chỉ thêm seq mới) */
    const obsPlan = planFor(newRows.market_observations, snapRows.market_observations, 'id');
    if (obsPlan.upserts.length) conflicts.push(...await checkConflicts('market_observations', obsPlan.upserts.filter(r => (updMap.market_observations || {})[r.id])));
    const snapObsById = indexBy(snapRows.market_observations, 'id');
    /* FIX Việc 1: audit MỚI có thể phát sinh khi dòng market_observations
       cha không đổi ở local — tính newAudit SỚM và bổ sung cha vào plan
       upsert của vòng này (trước khi audit được upsert ở dưới), tránh FK
       market_observation_audit.observation_id khi cha vắng trên server. */
    const snapAuditCount = {};
    snapRows.market_observation_audit.forEach(a => { snapAuditCount[a.observation_id] = Math.max(snapAuditCount[a.observation_id] || 0, a.seq + 1); });
    const newAudit = newRows.market_observation_audit.filter(a => a.seq >= (snapAuditCount[a.observation_id] || 0));
    {
      const obsRowById = indexBy(newRows.market_observations, 'id');
      const obsPlanned = new Set(obsPlan.upserts.map(r => String(r.id)));
      newAudit.forEach(a => {
        if (obsPlanned.has(String(a.observation_id))) return;
        const row = obsRowById.get(String(a.observation_id));
        if (row) { obsPlan.upserts.push(row); obsPlanned.add(String(row.id)); }
      });
    }
    const obsIns = obsPlan.upserts.filter(r => !snapObsById.has(String(r.id)));
    const obsUpd = obsPlan.upserts.filter(r => snapObsById.has(String(r.id))).map(r => { const c = { ...r }; delete c.updated_at; return c; });
    const savedObs = [...await upsert('market_observations', obsIns, undefined), ...await upsert('market_observations', obsUpd, undefined)];
    /* updated_at ở server do trigger đặt khi UPDATE — ghi nhận để vòng sau không báo xung đột giả. */
    noteUpdated('market_observations', savedObs);
    if (newAudit.length) await ctx.client.from('market_observation_audit').upsert(newAudit.map(({ legacy_extra, ...rest }) => rest), { onConflict: 'observation_id,seq' }).then(({ error }) => { if (error) throw new Error('market_observation_audit: ' + (error.message || error.code)); });
    await deleteIds('market_observations', obsPlan.deletes, 'id');
    return conflicts;
  }

  /* runSync giữ nguyên thân cũ (diff-sync + last-write-wins) nhưng được
     bọc trong một promise dùng chung: nơi gọi kiểu cũ (setTimeout) bỏ qua
     promise như trước, còn flushSync() chờ được đúng vòng đang chạy /
     vòng nó vừa kích hoạt. Promise này KHÔNG bao giờ reject (lỗi đã được
     xử lý ở catch bên trong như cũ) nên chờ nó không nuốt cơ chế retry. */
  function runSync() {
    if (syncing || !ctx.enabled || !ctx.client) return currentSyncPromise || Promise.resolve(false);
    syncing = true;
    currentSyncPromise = (async () => {
    try {
      let crmLocal = null, pubLocal = null;
      try { crmLocal = JSON.parse(localStorage.getItem(CRM_KEY) || 'null'); } catch (e) {}
      try { pubLocal = JSON.parse(localStorage.getItem(PUB_KEY) || 'null'); } catch (e) {}
      const conflicts = [];
      if (ctx.role !== 'other') {
        if (crmLocal && crmSnap && ctx.role !== 'mkt') { conflicts.push(...await syncCrm(crmLocal)); crmSnap = A.clone(crmLocal); }
        if (pubLocal && pubSnap) { conflicts.push(...await syncPub(pubLocal)); pubSnap = A.clone(pubLocal); }
      }
      dirty = false; failCount = 0;
      clearSyncError();
      if (conflicts.length) warnTransient('Phát hiện ' + conflicts.length + ' mục vừa được cập nhật ở nơi khác (' + conflicts.slice(0, 3).join(', ') + (conflicts.length > 3 ? '…' : '') + '). Bản bạn vừa lưu đã được ghi (last-write-wins).');
      return true;
    } catch (e) {
      failCount++;
      showSyncError('Đồng bộ lên Supabase thất bại: ' + (e && e.message ? e.message : e) + '. Dữ liệu vẫn còn trên máy này và sẽ tự đồng bộ lại.');
      if (failCount <= 4) { retryTimer = setTimeout(runSync, 12000); }
      return false;
    } finally {
      syncing = false;
      if (dirty && ctx.enabled) scheduleSync(900);
    }
    })();
    return currentSyncPromise;
  }

  /* ---------- Flush đồng bộ (vá lỗ hổng mất dữ liệu khi rời trang) ----------
     Gốc lỗi: ghi cache chỉ lên lịch debounce 700ms qua scheduleSync();
     chuyển trang trong cửa sổ đó thì trang đích loadAll() ghi đè cache
     bằng state máy chủ cũ -> bản ghi mới mất vĩnh viễn (deal của BD
     Hoàng, 5/11/2026). flushSync() huỷ timer chờ và chạy/vòng chờ đồng
     bộ NGAY, trả true khi cache đã sạch (dirty=false).
     Kỷ luật để không phá cơ chế cũ:
     - Không dirty + không đang sync -> trả ngay, 0 request thừa (đường
       debounce thường ngày không đổi, flush chỉ là đường bổ sung).
     - Vòng sync THẤT BẠI (failCount > 0 sau khi chờ): DỪNG ngay, giữ
       nguyên timer retry mà runSync đã lên lịch trong finally — flush
       không thử lại dồn dập và không nuốt retry.
     - Dirty còn lại sau một vòng THÀNH CÔNG chỉ có thể do người dùng
       sửa tiếp trong lúc sync đang chạy: huỷ timer 900ms mà finally
       vừa đặt và flush thêm vòng nữa (tối đa 3 vòng). */
  async function flushSync() {
    if (!ctx.enabled || !ctx.client) return false;
    if (!syncing && !dirty) return true;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    for (let pass = 0; pass < 3; pass++) {
      if (syncing) { if (currentSyncPromise) await currentSyncPromise; }
      else if (dirty) { await runSync(); }
      else return true;
      if (!dirty) return true;
      if (failCount > 0) return false; /* lỗi thật: chừa đường retry của runSync */
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    }
    return !dirty;
  }

  /* Điều hướng có chờ flush, kèm timeout cứng (mặc định 2500ms): sync
     kẹt/mạng chết thì VẪN đi sau timeout — cache local giữ nguyên và
     timer retry của runSync vẫn còn để vòng sau ở trang cũ/ngữ cảnh
     khác xử lý tiếp; tuyệt đối không treo người dùng ở trang cũ. */
  function navigateTo(url) {
    try {
      const loc = (typeof window !== 'undefined' && window.location) || (typeof location !== 'undefined' ? location : null);
      if (!loc) return false;
      if (typeof loc.assign === 'function') { loc.assign(url); return true; }
      loc.href = url; return true;
    } catch (e) { return false; }
  }
  async function flushBeforeNavigate(url, timeoutMs) {
    const ms = (typeof timeoutMs === 'number' && timeoutMs > 0) ? timeoutMs : NAV_FLUSH_TIMEOUT_MS;
    let timer = null, timedOut = false, flushed = false;
    try { flushAudit(); } catch (e) {} /* audit là phụ trợ: kích hoạt, không chờ */
    try {
      flushed = await Promise.race([
        flushSync().catch(() => false),
        new Promise(res => { timer = setTimeout(() => { timedOut = true; res(false); }, ms); }),
      ]);
    } catch (e) { flushed = false; }
    if (timer) { clearTimeout(timer); timer = null; }
    const navigated = url ? navigateTo(url) : false;
    return { flushed: !!flushed, timedOut, navigated, url: url || null };
  }

  /* Nhận diện link LIÊN TRANG trong app (3 trang dùng chung tầng dữ
     liệu này): href tương đối/tuyệt đối trỏ vào index.html / mkt.html /
     publishing.html (kèm query deep-link như ?tab=reviews&kind=game&
     id=... của nút "Yêu cầu đánh giá"). Trả href GỐC để điều hướng giữ
     nguyên dạng tương đối như tác giả link đã viết; null nếu không
     phải link liên trang (link ngoài, neo trong trang, mailto...). */
  const APP_PAGES = ['index.html', 'mkt.html', 'publishing.html'];
  function appPageHref(href) {
    if (!href || typeof href !== 'string') return null;
    const h = href.trim();
    if (!h || h.charAt(0) === '#' || /^(javascript|mailto|tel|data):/i.test(h)) return null;
    let file = '', origin = null, samePage = false;
    try {
      const loc = (typeof window !== 'undefined' && window.location) || (typeof location !== 'undefined' ? location : null);
      const base = (loc && loc.href) || 'http://localhost/';
      const u = new URL(h, base);
      file = (u.pathname || '').split('/').pop() || '';
      origin = u.origin || null;
      if (loc && origin && loc.origin && origin !== loc.origin) return null;
      samePage = !!(loc && u.pathname === loc.pathname && (u.search || '') === (loc.search || ''));
    } catch (e) {
      file = h.split('#')[0].split('?')[0].split('/').pop() || '';
    }
    if (!APP_PAGES.includes(file)) return null;
    if (samePage) return null; /* chỉ đổi hash/trỏ lại chính trang hiện tại */
    return h;
  }
  function anchorFromEvent(ev) {
    try {
      let t = ev && ev.target;
      if (t && typeof t.closest === 'function') { const a = t.closest('a'); if (a) return a; }
      let n = t, hops = 0;
      while (n && hops < 6) {
        if ((n.tagName === 'A' || n.nodeName === 'A') && (n.href || (typeof n.getAttribute === 'function' && n.getAttribute('href')))) return n;
        n = n.parentNode || n.parentElement || null; hops++;
      }
    } catch (e) {}
    return null;
  }
  /* Chặn click ở pha capture trên document (một handler dùng chung cho
     cả 3 trang — mọi link liên trang sinh động trong drawer/render đều
     được phủ, không phải sửa từng chỗ sinh link): chỉ chặn khi THẬT SỰ
     có dữ liệu chưa đồng bộ (dirty hoặc đang sync) và tầng dữ liệu đang
     bật; ngoài ra để trình duyệt đi như cũ, 0 thay đổi hành vi. */
  function onInterPageClick(ev) {
    try {
      if (!ev || ev.defaultPrevented) return;
      if (typeof ev.button === 'number' && ev.button !== 0) return;
      if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
      if (!ctx.enabled || !ctx.client || (!dirty && !syncing)) return;
      const a = anchorFromEvent(ev);
      if (!a) return;
      if (typeof a.hasAttribute === 'function' && a.hasAttribute('download')) return;
      const target = (typeof a.getAttribute === 'function' ? a.getAttribute('target') : a.target) || '';
      if (target && target !== '_self') return;
      const rawHref = (typeof a.getAttribute === 'function' && a.getAttribute('href')) || a.href || '';
      const href = appPageHref(rawHref);
      if (!href) return;
      ev.preventDefault();
      flushBeforeNavigate(href);
    } catch (e) {}
  }
  function onPageHideFlush() {
    /* pagehide / ẩn tab: kích hoạt flush NGAY (không chờ được lâu —
       trình duyệt có thể đóng trang bất cứ lúc nào; đây là nỗ lực tốt
       nhất, còn đường chính cho link liên trang là flushBeforeNavigate
       có chờ + timeout ở trên). flushSync tự lo idempotent: đang sync
       thì không sinh vòng trùng. */
    try { flushSync(); } catch (e) {}
    try { flushAudit(); } catch (e) {}
  }
  function onVisibilityFlush() {
    try { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') onPageHideFlush(); } catch (e) {}
  }
  function safeListen(target, type, fn, opts) {
    try { if (target && typeof target.addEventListener === 'function') target.addEventListener(type, fn, opts); } catch (e) {}
  }
  function registerLifecycleFlush() {
    if (lifecycleRegistered) return;
    lifecycleRegistered = true;
    const w = (typeof window !== 'undefined') ? window : null;
    const d = (typeof document !== 'undefined') ? document : null;
    safeListen(w, 'pagehide', onPageHideFlush);
    safeListen(w, 'visibilitychange', onVisibilityFlush);
    safeListen(d, 'visibilitychange', onVisibilityFlush);
  }
  function registerNavGuard() {
    if (navGuardRegistered) return;
    navGuardRegistered = true;
    const d = (typeof document !== 'undefined') ? document : null;
    safeListen(d, 'click', onInterPageClick, true);
  }

  /* ---------- Lịch sử chỉnh sửa (audit_log) ----------
     Bảng riêng append-only (supabase/audit-log.sql), KHÔNG nằm trong state
     đồng bộ: ghi bằng insert thuần, đọc theo từng đối tượng khi mở drawer.
     AN TOÀN KHI BẢNG CHƯA TỒN TẠI (SQL chạy sau): mọi lỗi đều bị nuốt êm —
     recordBatch không bao giờ ném lỗi vào đường lưu chính (save()/write()
     gọi nó SAU khi dữ liệu chính đã lưu xong), listFor trả null để UI hiện
     "Lịch sử chưa khả dụng". Hàng đợi ghi dồn theo đợt (tối đa 1 insert /
     lần flush) để 1 lần save đụng nhiều entity không tạo nhiều request. */
  const auditQueue = [];
  /* FIX C8: trần hàng đợi audit — khi insert liên tục lỗi (vd bảng chưa
     tồn tại) các mục được giữ lại để thử lần sau, nhưng không được phình
     vô hạn trong một phiên dài: vượt trần thì bỏ mục CŨ NHẤT. */
  const AUDIT_QUEUE_MAX = 500;
  function trimAuditQueue() {
    if (auditQueue.length > AUDIT_QUEUE_MAX) auditQueue.splice(0, auditQueue.length - AUDIT_QUEUE_MAX);
  }
  let auditFlushTimer = null, auditFlushing = false;
  async function flushAudit() {
    auditFlushTimer = null;
    if (auditFlushing || !auditQueue.length) return;
    /* FIX C8: tầng dữ liệu chưa bật (cửa sổ boot-nhanh: người dùng đã sửa
       và save() đã sinh audit, nhưng setEnabled(true) chưa tới) — GIỮ
       NGUYÊN hàng đợi, TUYỆT ĐỐI không xoá. Các thay đổi đó được
       localDirty đẩy lên server ngay sau đó; audit của chúng phải sống
       tới khi enabled để flush cùng. setEnabled(true) sẽ gọi lại flush. */
    if (!ctx.client || !ctx.enabled) return;
    auditFlushing = true;
    let batchFailed = false;
    const batch = auditQueue.splice(0, auditQueue.length);
    try {
      const rows = batch.map(e => ({
        entity_type: e.entityType, entity_id: e.entityId, at: e.at,
        by_member_id: e.byMemberId || null, action: e.action, changes: Array.isArray(e.changes) ? e.changes : [],
      }));
      const { error } = await ctx.client.from('audit_log').insert(rows);
      if (error) throw error;
    } catch (err) {
      batchFailed = true;
      /* FIX C8: insert lỗi (bảng chưa tồn tại / mất mạng / RLS chặn) —
         ĐƯA LẠI batch vào ĐẦU hàng đợi (giữ thứ tự, trước các mục mới
         phát sinh trong lúc đang flush) để lần flush sau thử lại, có áp
         trần AUDIT_QUEUE_MAX (bỏ cũ nhất khi vượt). */
      auditQueue.unshift(...batch);
      trimAuditQueue();
      /* Nuốt êm có chủ đích: lịch sử là phụ trợ, tuyệt đối không ảnh
         hưởng dữ liệu chính — lỗi chỉ được ghi warn, không ném ra. */
      try { console.warn('[audit] ghi lịch sử thất bại (đã giữ lại để thử sau):', err && err.message ? err.message : err); } catch (e2) {}
    } finally {
      auditFlushing = false;
      /* Chỉ lên lịch tiếp khi batch vừa rồi THÀNH CÔNG mà đã có mục mới
         tới trong lúc flush. Batch THẤT BẠI thì KHÔNG thử lại ngay theo
         vòng 300ms (bảng chưa tồn tại sẽ lỗi y hệt, gây vòng lặp request
         vô hạn) — mục đã giữ trong hàng đợi sẽ được flush ở lần kích
         hoạt tiếp theo: recordBatch() kế tiếp hoặc setEnabled(true). */
      if (!batchFailed && auditQueue.length) scheduleAuditFlush(300);
    }
  }
  function scheduleAuditFlush(delay) {
    if (auditFlushTimer) return;
    auditFlushTimer = setTimeout(() => { flushAudit(); }, delay === undefined ? 400 : delay);
  }
  function auditRecordBatch(entries) {
    try {
      if (!Array.isArray(entries) || !entries.length) return;
      entries.forEach(e => { if (e && e.entityType && e.entityId) auditQueue.push(e); });
      trimAuditQueue();
      scheduleAuditFlush();
    } catch (e) { /* nuốt êm — xem flushAudit */ }
  }
  function auditRowToEntry(r) {
    return {
      entityType: r.entity_type, entityId: r.entity_id, at: r.at,
      byMemberId: r.by_member_id || '', action: r.action,
      changes: Array.isArray(r.changes) ? r.changes : [],
    };
  }
  async function auditListFor(entityType, entityId) {
    try {
      if (!ctx.client || !entityType || !entityId) return null;
      const { data, error } = await ctx.client.from('audit_log')
        .select('entity_type,entity_id,at,by_member_id,action,changes')
        .eq('entity_type', entityType).eq('entity_id', String(entityId))
        .order('at', { ascending: false }).limit(100);
      if (error) return null;
      return (data || []).map(auditRowToEntry);
    } catch (e) { return null; }
  }
  /* Lịch sử TỔNG (màn hình Admin ở index.html): các mục audit gần nhất
     XUYÊN mọi loại đối tượng — gồm cả mục của đối tượng ĐÃ XOÁ (bảng
     audit_log là append-only, không phụ thuộc entity còn tồn tại).
     Cùng tập cột + cùng ánh xạ dòng như auditListFor, mới nhất trước,
     trần 200 mục. Lọc tuỳ chọn entity_type / by_member_id áp NGAY ở tầng
     query (eq) chứ không lọc ở client. Lỗi/bảng chưa có -> null như mẫu
     listFor để UI hiện trạng thái "không tải được", không crash. */
  async function auditListRecent(options) {
    try {
      if (!ctx.client) return null;
      const opts = options || {};
      let q = ctx.client.from('audit_log')
        .select('entity_type,entity_id,at,by_member_id,action,changes');
      if (opts.entityType) q = q.eq('entity_type', String(opts.entityType));
      if (opts.byMemberId) q = q.eq('by_member_id', String(opts.byMemberId));
      const { data, error } = await q.order('at', { ascending: false }).limit(200);
      if (error) return null;
      return (data || []).map(auditRowToEntry);
    } catch (e) { return null; }
  }
  const auditApi = { recordBatch: auditRecordBatch, listFor: auditListFor, listRecent: auditListRecent, _flush: flushAudit, _queue: auditQueue, _queueMax: AUDIT_QUEUE_MAX };
  if (typeof window !== 'undefined') window.SavaAudit = auditApi;

  /* Đăng ký flush rời trang ngay khi file được nạp (mọi trang dùng
     file này đều hưởng, kể cả trước khi auth gọi installHook); các
     đăng ký trong installHook là lớp dự phòng và bị cờ chống trùng
     nuốt nếu đã đăng ký ở đây. Handler tự kiểm tra ctx.enabled/dirty
     nên lúc tầng dữ liệu chưa bật chúng là no-op. */
  registerLifecycleFlush();
  registerNavGuard();

  const api = {
    attach, setEnabled, loadAll, installHook, scheduleSync,
    /* syncNow NAY là flush thật (trả promise, chờ được vòng sync hoàn
       tất) thay cho scheduleSync(0) bắn-rồi-quên như trước; nơi gọi cũ
       bỏ qua giá trị trả về vẫn chạy đúng như cũ. */
    syncNow: () => flushSync(),
    flushSync, flushBeforeNavigate,
    isReady: () => ctx.ready, CRM_KEY, PUB_KEY, CRM_BACKUP_KEY, PUB_BACKUP_KEY,
    _ctx: ctx, audit: auditApi,
    _syncState: () => ({ dirty, syncing, failCount }),
    _navFlushTimeoutMs: NAV_FLUSH_TIMEOUT_MS,
    _appPageHref: appPageHref,
  };
  if (typeof window !== 'undefined') window.SavaData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
