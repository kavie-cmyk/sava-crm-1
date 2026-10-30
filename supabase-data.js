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
    const byCreated = qb => qb.order('created_at', { ascending: true });
    const [members, companies, archive, games, leads, deals, dealTerms, dealContracts, dealLeads, tasks, activities] = await Promise.all([
      q('members', byCreated), q('companies', byCreated), qSafe('company_partner_eval_archive'),
      q('games', byCreated), q('leads', byCreated),
      qSafe('deals', byCreated), qSafe('deal_terms'), qSafe('deal_contracts'), qSafe('deal_leads'),
      qSafe('tasks', byCreated), qSafe('activities', byCreated),
    ]);
    const crmState = A.crmRowsToState({ members, companies, company_partner_eval_archive: archive, games, leads, deals, deal_terms: dealTerms, deal_contracts: dealContracts, deal_leads: dealLeads, tasks, activities });
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
    [['members', members], ['companies', companies], ['games', games], ['leads', leads], ['deals', deals], ['tasks', tasks], ['activities', activities], ['publishing_requests', requests], ['market_observations', observations]]
      .forEach(([t, rows]) => noteUpdated(t, rows));

    /* Sao lưu bản localStorage gốc (dữ liệu thật trước Supabase) rồi mới
       ghi đè cache bằng dữ liệu Supabase. */
    backupOnce(CRM_KEY, CRM_BACKUP_KEY);
    backupOnce(PUB_KEY, PUB_BACKUP_KEY);
    /* `changed`: nội dung cache TRƯỚC khi ghi đè có khác dữ liệu máy chủ
       vừa nạp không (so chuỗi JSON). Tầng auth dùng cờ này để BẮT BUỘC tải
       lại trang khi cache đã đổi — nhờ vậy state trong bộ nhớ mà trang đã
       parse từ cache cũ (kể cả dữ liệu mẫu/test cũ) bị loại bỏ hoàn toàn
       trước khi đồng bộ ghi được bật, không còn đường nào để save() sau đó
       ghi đè cache máy chủ bằng bản cũ rồi diff-sync đẩy ngược lên. */
    let priorCrm = null, priorPub = null;
    try { priorCrm = localStorage.getItem(CRM_KEY); } catch (e) {}
    try { priorPub = localStorage.getItem(PUB_KEY); } catch (e) {}
    const crmJson = JSON.stringify(crmState), pubJson = JSON.stringify(pubState);
    const changed = priorCrm !== crmJson || priorPub !== pubJson;
    rawSet(CRM_KEY, crmJson);
    rawSet(PUB_KEY, pubJson);
    crmSnap = A.clone(crmState); pubSnap = A.clone(pubState);
    const hash = A.hashStr(crmJson + '|' + pubJson);
    return { crmState, pubState, hash, changed };
  }

  /* ---------- Đồng bộ diff ---------- */
  function attach(client, role) { ctx.client = client; ctx.role = role; }
  function setEnabled(v) { ctx.enabled = !!v; if (v) ctx.ready = true; }

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

  const CONFLICT_TABLES = ['members', 'companies', 'games', 'leads', 'deals', 'tasks', 'activities', 'publishing_requests', 'market_observations'];

  async function syncCrm(local) {
    const newRows = A.crmStateToRows(local);
    const snapRows = A.crmStateToRows(crmSnap || {});
    const conflicts = [];
    /* Thứ tự ghi tôn trọng FK: cha trước (members->companies->games->leads
       ->deals->term/contract/leads->tasks->activities); xoá thì ngược lại. */
    const order = [
      ['members', 'id'], ['companies', 'id'], ['company_partner_eval_archive', 'company_id'],
      ['games', 'id'], ['leads', 'id'], ['deals', 'id'], ['deal_terms', 'deal_id'],
      ['deal_contracts', 'deal_id'], ['tasks', 'id'], ['activities', 'id'],
    ];
    const plans = {};
    for (const [table, key] of order) {
      plans[table] = planFor(newRows[table], snapRows[table], key);
      if (CONFLICT_TABLES.includes(table) && plans[table].upserts.length) {
        conflicts.push(...await checkConflicts(table, plans[table].upserts.filter(r => (updMap[table] || {})[r.id])));
      }
    }
    /* deal_leads: so theo từng deal; khác -> xoá hết của deal đó rồi nạp lại. */
    const groupLeads = rows => { const m = {}; (rows || []).forEach(r => { (m[r.deal_id] = m[r.deal_id] || []).push(r.lead_id); }); Object.values(m).forEach(v => v.sort()); return m; };
    const nl = groupLeads(newRows.deal_leads), sl = groupLeads(snapRows.deal_leads);
    const leadChangedDeals = new Set([...Object.keys(nl), ...Object.keys(sl)].filter(id => !A.deepEqual(nl[id] || [], sl[id] || [])));

    for (const [table] of [...order].reverse()) {
      const key = order.find(([t]) => t === table)[1];
      await deleteIds(table, plans[table].deletes, key);
    }
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
    for (const [table] of order) {
      const saved = await upsert(table, plans[table].upserts, undefined);
      if (CONFLICT_TABLES.includes(table)) noteUpdated(table, saved);
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

    /* intake private: chỉ BD/Admin */
    if (!isMkt && ctx.role !== 'other') {
      const intPlan = planFor(newRows.publishing_request_intake_private, snapRows.publishing_request_intake_private, 'request_id');
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
    const obsIns = obsPlan.upserts.filter(r => !snapObsById.has(String(r.id)));
    const obsUpd = obsPlan.upserts.filter(r => snapObsById.has(String(r.id))).map(r => { const c = { ...r }; delete c.updated_at; return c; });
    const savedObs = [...await upsert('market_observations', obsIns, undefined), ...await upsert('market_observations', obsUpd, undefined)];
    /* updated_at ở server do trigger đặt khi UPDATE — ghi nhận để vòng sau không báo xung đột giả. */
    noteUpdated('market_observations', savedObs);
    const snapAuditCount = {};
    snapRows.market_observation_audit.forEach(a => { snapAuditCount[a.observation_id] = Math.max(snapAuditCount[a.observation_id] || 0, a.seq + 1); });
    const newAudit = newRows.market_observation_audit.filter(a => a.seq >= (snapAuditCount[a.observation_id] || 0));
    if (newAudit.length) await ctx.client.from('market_observation_audit').upsert(newAudit.map(({ legacy_extra, ...rest }) => rest), { onConflict: 'observation_id,seq' }).then(({ error }) => { if (error) throw new Error('market_observation_audit: ' + (error.message || error.code)); });
    await deleteIds('market_observations', obsPlan.deletes, 'id');
    return conflicts;
  }

  async function runSync() {
    if (syncing || !ctx.enabled || !ctx.client) return;
    syncing = true;
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
    } catch (e) {
      failCount++;
      showSyncError('Đồng bộ lên Supabase thất bại: ' + (e && e.message ? e.message : e) + '. Dữ liệu vẫn còn trên máy này và sẽ tự đồng bộ lại.');
      if (failCount <= 4) { retryTimer = setTimeout(runSync, 12000); }
    } finally {
      syncing = false;
      if (dirty && ctx.enabled) scheduleSync(900);
    }
  }

  const api = {
    attach, setEnabled, loadAll, installHook, scheduleSync,
    syncNow: () => scheduleSync(0),
    isReady: () => ctx.ready, CRM_KEY, PUB_KEY, CRM_BACKUP_KEY, PUB_BACKUP_KEY,
    _ctx: ctx,
  };
  if (typeof window !== 'undefined') window.SavaData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
