/* Sava Meta CRM — Lịch sử chỉnh sửa (audit log), phía client.
   Nguồn sự thật của lịch sử là bảng `audit_log` trên Supabase (xem
   supabase/audit-log.sql): append-only, chỉ hệ thống ghi qua tầng dữ liệu
   (window.SavaAudit trong supabase-data.js), KHÔNG nằm trong state đồng bộ
   của app — lịch sử chỉ được ĐỌC theo từng đối tượng khi mở drawer
   (query entityType+entityId, mới nhất trước, limit 100).
   File này chỉ lo PHẦN HIỂN THỊ dùng chung cho cả 2 giao diện (CRM
   index.html + Publishing publishing.js/mkt): dòng thời gian hệ thống
   "Tạo: … · Cập nhật lần cuối: … bởi …" và mục "🕘 Lịch sử chỉnh sửa".
   Mọi thao tác đọc/ghi audit đều BẮT LỖI + NUỐT ÊM: khi bảng audit_log
   chưa tồn tại trên server (SQL chưa chạy) hoặc tầng dữ liệu chưa sẵn
   sàng, drawer hiện trạng thái nhẹ nhàng "Lịch sử chưa khả dụng" và
   app vẫn chạy bình thường — ghi audit lỗi KHÔNG bao giờ được làm hỏng
   việc lưu dữ liệu chính (đường ghi nằm SAU khi dữ liệu chính đã lưu,
   bọc try/catch + promise catch riêng). */
(function () {
  'use strict';
  function escHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function sysApi() {
    try { return (typeof window !== 'undefined' && window.SavaSys) || null; } catch (e) { return null; }
  }
  function fmtTime(v) {
    const S = sysApi();
    if (S && typeof S.fmtSysTime === 'function') return S.fmtSysTime(v);
    /* Dự phòng khi shared.js chưa nạp: cùng định dạng dd-mm-yyyy hh:mm
       (Asia/Ho_Chi_Minh) như fmtSysTime — không quay về gạch chéo. */
    if (!v) return '—';
    const s = String(v);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return m[3] + '-' + m[2] + '-' + m[1];
    const dt = new Date(v);
    if (Number.isNaN(dt.getTime())) return String(v);
    const o = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(dt).forEach(x => { o[x.type] = x.value; });
    const date = o.day + '-' + o.month + '-' + o.year;
    if (!/[T ]\d{2}:\d{2}/.test(s)) return date;
    const tp = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(dt).forEach(x => { tp[x.type] = x.value; });
    return date + ' ' + tp.hour + ':' + tp.minute;
  }
  /* Tên người sửa: resolve theo members của state CRM truyền vào; member
     đã bị xoá -> nhãn dự phòng "thành viên đã xoá (…)" — không lỗi. */
  function byLabel(state, id) {
    if (!id) return '—';
    const S = sysApi();
    if (S && typeof S.updatedByLabel === 'function') {
      try { return S.updatedByLabel(state, { updatedBy: id }); } catch (e) {}
    }
    try {
      const ms = (state && Array.isArray(state.members)) ? state.members : [];
      const m = ms.find(x => x && x.id === id);
      if (m && m.name) return m.name;
    } catch (e) {}
    return 'thành viên đã xoá (' + String(id).slice(0, 8) + ')';
  }
  /* Dòng thời gian hệ thống trong drawer/chi tiết. Entity cũ chưa có
     trường hệ thống -> hiện "—", không bịa thời gian. */
  function metaLineHTML(state, ent) {
    const created = ent && ent.createdAt ? fmtTime(ent.createdAt) : '—';
    const updated = ent && ent.updatedAt ? fmtTime(ent.updatedAt) : '—';
    const by = ent && ent.updatedBy ? byLabel(state, ent.updatedBy) : '—';
    return `<div class="sys-meta" style="color:var(--mut,#64748b);font-size:12.5px;margin:8px 0">Tạo: ${escHtml(created)} · Cập nhật lần cuối: ${escHtml(updated)} bởi ${escHtml(by)}</div>`;
  }
  const ACTION_LABELS = { create: 'Đã tạo mới', update: 'Đã cập nhật', delete: 'Đã xoá' };
  /* === F2 lớp HIỂN THỊ: giá trị ngày trong mục lịch sử ===
     Mục audit CŨ đã ghi trên server mang from/to dạng ISO (yyyy-mm-dd /
     datetime ISO) — dữ liệu cũ KHÔNG sửa, lớp hiển thị này chuyển khi
     render, áp cho cả drawer Lịch sử chỉnh sửa lẫn Lịch sử tổng (cả hai
     dùng chung entryHTML này). Tập field ngày: ưu tiên danh sách dùng
     chung từ shared.js (SavaSys.auditDateFields — nguồn sự thật duy
     nhất); khi shared.js chưa nạp / chạy độc lập (test) thì dùng bản
     dự phòng khớp hệt bên dưới. Idempotent: giá trị đã dd-mm-yyyy giữ
     nguyên; chữ tự do / không phải ngày giữ nguyên văn. */
  const AUDIT_DATE_FIELDS_FALLBACK = ['due', 'dueDate', 'signed', 'when', 'date', 'endDate', 'startDate', 'eventDate', 'requestedAt', 'reviewDate'];
  function auditDateFieldSet() {
    const S = sysApi();
    if (S && Array.isArray(S.auditDateFields) && S.auditDateFields.length) return new Set(S.auditDateFields);
    return new Set(AUDIT_DATE_FIELDS_FALLBACK);
  }
  /* Chuỗi nguyên là 1 ngày ISO (hoặc đã dd-mm-yyyy) -> dd-mm-yyyy
     (+ hh:mm với datetime, qua fmtTime như mốc thời gian của mục);
     không khớp trọn chuỗi -> null (giữ nguyên văn). */
  function pureDateText(s) {
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtTime(s);
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) { const t = fmtTime(s); return t !== s ? t : null; }
    return null;
  }
  function fmtAuditChangeValue(field, v) {
    const s = String(v ?? '');
    if (!s) return s;
    const fields = auditDateFieldSet();
    const base = String(field || '').split('.').pop();
    if (fields.has(base)) { const d = pureDateText(s); return d !== null ? d : s; }
    /* Chuỗi tóm tắt object CŨ (vd field contract ghi "signed: 2026-10-15; …"
       / partnerEval ghi "reviewDate: …"): chỉ đổi đúng đoạn "<sub-key ngày>:
       <ISO>" của các sub-key ngày đã biết, phần chữ còn lại giữ nguyên. */
    return s.replace(/(^|[;,\n]\s*)([A-Za-z]+):\s*(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?)/g,
      (m, pre, key, iso) => fields.has(key) ? pre + key + ': ' + (pureDateText(iso) ?? iso) : m);
  }
  function truncVal(v, max) {
    const s = String(v ?? '');
    const m = max || 120;
    return s.length > m ? s.slice(0, m) + '…' : s;
  }
  /* === Mục TỔNG của lô (Import/Gỡ lô, gộp audit 05/11/2026) ===
     Dòng tổng mang entityId = mã lô và changes là mảng 1 phần tử có cờ
     batch:true + importBatch + count + ids (+ records đầy đủ khi là
     dòng delete của gỡ lô — payload khôi phục, KHÔNG render ra đây).
     Nhận diện + trích thông tin lô dùng chung cho entryHTML ở dưới và
     tiêu đề dòng ở Lịch sử tổng (index.html tự đọc cùng cấu trúc). */
  const BATCH_TYPE_LABELS = { deal: 'Deal', company: 'Công ty', lead: 'Lead', game: 'Game', task: 'Việc', member: 'Thành viên', activity: 'Hoạt động', event: 'Sự kiện', request: 'Yêu cầu đánh giá' };
  function batchChangeOf(row) {
    const changes = row && Array.isArray(row.changes) ? row.changes : [];
    return changes.find(c => c && c.batch === true) || null;
  }
  function batchInfo(row) {
    const c = batchChangeOf(row);
    if (!c) return null;
    return { marker: String(c.importBatch || c.batchMarker || (row && row.entityId) || ''), count: (typeof c.count === 'number' ? c.count : (Array.isArray(c.ids) ? c.ids.length : 0)), ids: Array.isArray(c.ids) ? c.ids.slice() : [], mode: c.mode || (row && row.action === 'delete' ? 'remove' : 'import') };
  }
  /* 1 mục lịch sử: ai, lúc nào, hành động + từng thay đổi "nhãn: cũ → mới".
     KHÔNG có bất kỳ nút sửa/xoá nào trong mục lịch sử. */
  function entryHTML(state, row) {
    const changes = Array.isArray(row.changes) ? row.changes : [];
    const batch = batchInfo(row);
    if (batch) {
      const typeLabel = BATCH_TYPE_LABELS[row.entityType] || row.entityType || '';
      const txt = row.action === 'delete'
        ? `Gỡ lô “${batch.marker}” — đã xoá ${batch.count} ${typeLabel} (nội dung đầy đủ của từng bản ghi đã lưu kèm trong mục này để khôi phục)`
        : `Lô “${batch.marker}” — đã tạo ${batch.count} ${typeLabel}`;
      return `<div class="audit-entry audit-entry--batch" style="border-left:2px solid var(--line,#e2e8f0);padding:2px 0 8px 10px;margin:0 0 6px 4px"><div style="font-size:13px"><b>${escHtml(ACTION_LABELS[row.action] || row.action || '')}</b> · ${escHtml(fmtTime(row.at))} · bởi ${escHtml(byLabel(state, row.byMemberId))}</div><div style="font-size:12.5px;margin-top:2px">📦 ${escHtml(txt)}</div></div>`;
    }
    const list = changes.length
      ? `<ul style="margin:4px 0 0;padding-left:18px;font-size:12.5px">${changes.map(c => `<li>${escHtml(c.label || c.field || '')}: ${escHtml(truncVal(fmtAuditChangeValue(c.field, c.from)) || '—')} → ${escHtml(truncVal(fmtAuditChangeValue(c.field, c.to)) || '—')}</li>`).join('')}</ul>`
      : '';
    return `<div class="audit-entry" style="border-left:2px solid var(--line,#e2e8f0);padding:2px 0 8px 10px;margin:0 0 6px 4px"><div style="font-size:13px"><b>${escHtml(ACTION_LABELS[row.action] || row.action || '')}</b> · ${escHtml(fmtTime(row.at))} · bởi ${escHtml(byLabel(state, row.byMemberId))}</div>${list}</div>`;
  }
  function sectionHTML(entityType, entityId) {
    return `<section class="audit-history" data-audit-for="${escHtml(entityType)}:${escHtml(entityId)}"><h3 style="margin:18px 0 8px">🕘 Lịch sử chỉnh sửa</h3><div class="audit-list"><p class="mut" style="color:var(--mut,#64748b);font-size:12.5px">Đang tải lịch sử…</p></div></section>`;
  }
  /* === GOM NHÓM LỊCH SỬ THEO HÀNH ĐỘNG — HELPER DÙNG CHUNG ===
     Chuẩn trình bày lấy ĐÚNG từ Lịch sử tổng (index.html, có từ 01/11/2026):
     block theo `action` với thứ tự vòng đời Tạo mới -> Chỉnh sửa -> Xoá,
     nhãn + màu pill: create "Tạo mới" #22c55e / update "Chỉnh sửa" #2563eb /
     delete "Xoá" #dc2626; action lạ gom vào block "Khác" #64748b ở cuối,
     CHỈ xuất hiện khi thật có mục lạ. Định nghĩa nhóm + phép gom
     (groupAuditRows) sống DUY NHẤT tại đây (audit.js là module hiển thị
     audit nạp ở cả 3 trang index/publishing/mkt): Lịch sử tổng uỷ quyền
     bước gom cho helper này qua auditGroupedRows ở index.html, drawer
     dùng groupedHistoryHTML ở dưới — không còn hai phép gom lệch nhau.
     Trong mỗi nhóm giữ nguyên thứ tự dữ liệu đã nạp (mới nhất -> cũ
     nhất, chỉ filter theo action, không sắp xếp lại) và giữ nguyên
     cách render từng mục (entryHTML). Phép gom THUẦN, không chạm dữ
     liệu/giới hạn nạp (listFor vẫn 100/đối tượng, listRecent vẫn 200). */
  const AUDIT_GROUP_DEFS = [
    { key: 'create', label: 'Tạo mới', color: '#22c55e' },
    { key: 'update', label: 'Chỉnh sửa', color: '#2563eb' },
    { key: 'delete', label: 'Xoá', color: '#dc2626' },
  ];
  const AUDIT_GROUP_UNKNOWN = { key: '__unknown__', label: 'Khác', color: '#64748b' };
  function auditGroupDef(action) { return AUDIT_GROUP_DEFS.find(d => d.key === action) || null; }
  /* Trả đủ 3 nhóm vòng đời (kể cả nhóm rỗng, count = 0) + nhóm Khác ở
     cuối CHỈ khi có mục lạ; mỗi nhóm mang sẵn count để bề mặt hiển thị
     tự quyết ẩn/hiện nhóm rỗng theo quy ước của mình. */
  function groupAuditRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const groups = AUDIT_GROUP_DEFS.map(def => { const rs = list.filter(r => r && r.action === def.key); return { ...def, rows: rs, count: rs.length }; });
    const unknown = list.filter(r => !r || !auditGroupDef(r.action));
    if (unknown.length) groups.push({ ...AUDIT_GROUP_UNKNOWN, rows: unknown, count: unknown.length });
    return groups;
  }
  /* Nhóm chứa mục MỚI NHẤT = nhóm của rows[0] (dữ liệu đã nạp luôn xếp
     mới nhất trước); rỗng -> null. Đây là nhóm mở sẵn mặc định ở drawer. */
  function newestAuditGroupKey(rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    const def = auditGroupDef(rows[0] && rows[0].action);
    return def ? def.key : AUDIT_GROUP_UNKNOWN.key;
  }
  /* Trạng thái thu/mở của drawer là UI-state trong phiên theo từng
     (đối tượng, nhóm): auditGroupCollapsed[key] có mặt = người dùng đã
     bấm chọn tường minh; chưa có = mặc định (nhóm mới nhất mở, còn lại
     thu gọn). THUẦN hiển thị: không ghi gì, không đổi dữ liệu audit. */
  const auditGroupCollapsed = {};
  let auditLastState = null;
  let auditLastRoot = null;
  let auditLastTarget = null;
  let auditLastRows = null;
  /* Render lịch sử drawer ĐÃ GOM NHÓM (accordion): nhóm 0 mục ẩn hẳn;
     header mỗi nhóm = pill nhãn (đúng mẫu Lịch sử tổng) + "<n> mục" +
     nút ▸ Mở / ▾ Thu gọn bấm để thu/mở nhóm đó (SavaAuditUI.toggleGroup).
     Nhóm Xoá mang nền/viền danger #fff0f0/#f1d5d7 như block Xoá của
     Lịch sử tổng (class audit-action-block--delete ở index; ở đây cộng
     inline style để trang Publishing/MKT — không có CSS đó — vẫn khớp). */
  function groupedHistoryHTML(state, rows, entityType, entityId) {
    const newestKey = newestAuditGroupKey(rows);
    return groupAuditRows(rows).filter(g => g.rows.length).map(g => {
      const ck = entityType + ':' + entityId + ':' + g.key;
      const collapsed = Object.prototype.hasOwnProperty.call(auditGroupCollapsed, ck) ? !!auditGroupCollapsed[ck] : g.key !== newestKey;
      const isDelete = g.key === 'delete';
      const secStyle = isDelete
        ? 'border:1px solid #f1d5d7;background:#fff0f0;border-radius:8px;padding:6px 8px;margin:0 0 8px'
        : 'border:1px solid var(--line,#e2e8f0);border-radius:8px;padding:6px 8px;margin:0 0 8px';
      const body = collapsed ? '' : `<div style="margin-top:6px">${g.rows.map(r => entryHTML(state, r)).join('')}</div>`;
      return `<section class="audit-group${isDelete ? ' audit-action-block--delete' : ''}${collapsed ? ' audit-group--collapsed' : ''}" data-audit-action="${escHtml(g.key)}" style="${secStyle}"><div class="audit-group-head" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h4 style="margin:0;font-size:13px"><span class="pill" style="background:${g.color}">${escHtml(g.label)}</span> <span class="count-badge">${g.rows.length} mục</span></h4><button type="button" class="btn ghost small" onclick="window.SavaAuditUI.toggleGroup('${entityType}','${entityId}','${g.key}')" aria-expanded="${collapsed ? 'false' : 'true'}" title="${collapsed ? 'Mở nhóm' : 'Thu gọn nhóm'}">${collapsed ? '▸ Mở' : '▾ Thu gọn'}</button></div>${body}</section>`;
    }).join('');
  }
  function toggleGroup(entityType, entityId, groupKey) {
    const ck = entityType + ':' + entityId + ':' + groupKey;
    /* Lật đúng trạng thái ĐANG THẤY: đã bấm trước đó -> lấy giá trị đã
       lưu; chưa bấm -> trạng thái hiện tại là mặc định của groupedHistoryHTML
       (thu gọn trừ nhóm chứa mục mới nhất, suy từ lần nạp gần nhất của
       đúng đối tượng này; không có lần nạp nào -> coi như đang thu gọn). */
    let currentlyCollapsed;
    if (Object.prototype.hasOwnProperty.call(auditGroupCollapsed, ck)) currentlyCollapsed = !!auditGroupCollapsed[ck];
    else if (auditLastTarget && auditLastTarget.entityType === entityType && auditLastTarget.entityId === entityId) currentlyCollapsed = groupKey !== newestAuditGroupKey(auditLastRows);
    else currentlyCollapsed = true;
    auditGroupCollapsed[ck] = !currentlyCollapsed;
    try { if (auditLastRoot && auditLastTarget) loadInto(auditLastRoot, auditLastState, auditLastTarget.entityType, auditLastTarget.entityId); } catch (e) {}
  }
  /* Tương thích ngược: goPage từng là pager phẳng 10 mục/trang của
     drawer (Việc 8) — nay drawer gom nhóm accordion, không còn pager
     phẳng; giữ tên hàm để mọi tham chiếu cũ chỉ nạp lại drawer. */
  function goPage(entityType, entityId) {
    try {
      const doc = (typeof document !== 'undefined') ? document : null;
      const sec = doc && doc.querySelector ? doc.querySelector('.audit-history') : null;
      const root = (auditLastRoot) || (sec && sec.parentElement ? sec.parentElement : (doc ? doc.body : null));
      if (root) loadInto(root, auditLastState, entityType, entityId);
    } catch (e) {}
  }
  /* Đọc lịch sử của đúng 1 đối tượng rồi đổ vào section đã render.
     Lỗi/bảng chưa có -> trạng thái nhẹ nhàng, không ném lỗi ra ngoài. */
  async function loadInto(rootEl, state, entityType, entityId) {
    try {
      const box = rootEl && rootEl.querySelector ? rootEl.querySelector('.audit-history .audit-list') : null;
      if (!box) return;
      auditLastState = state;
      const api = (typeof window !== 'undefined' && window.SavaAudit) || null;
      if (!api || typeof api.listFor !== 'function') { box.innerHTML = '<p class="mut" style="color:var(--mut,#64748b);font-size:12.5px">Lịch sử chưa khả dụng.</p>'; return; }
      const rows = await api.listFor(entityType, entityId);
      if (!Array.isArray(rows)) { box.innerHTML = '<p class="mut" style="color:var(--mut,#64748b);font-size:12.5px">Lịch sử chưa khả dụng.</p>'; return; }
      if (!rows.length) { box.innerHTML = '<p class="mut" style="color:var(--mut,#64748b);font-size:12.5px">Chưa có lịch sử chỉnh sửa.</p>'; return; }
      auditLastRoot = rootEl;
      auditLastTarget = { entityType, entityId };
      auditLastRows = rows;
      box.innerHTML = groupedHistoryHTML(state, rows, entityType, entityId);
    } catch (e) {
      try {
        const box = rootEl && rootEl.querySelector ? rootEl.querySelector('.audit-history .audit-list') : null;
        if (box) box.innerHTML = '<p class="mut" style="color:var(--mut,#64748b);font-size:12.5px">Lịch sử chưa khả dụng.</p>';
      } catch (e2) {}
    }
  }
  const api = { metaLineHTML, sectionHTML, loadInto, entryHTML, fmtTime, fmtAuditChangeValue, byLabel, ACTION_LABELS, goPage, batchInfo, batchChangeOf, AUDIT_GROUP_DEFS, AUDIT_GROUP_UNKNOWN, groupAuditRows, newestAuditGroupKey, groupedHistoryHTML, toggleGroup };
  if (typeof window !== 'undefined') window.SavaAuditUI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
