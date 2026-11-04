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
  /* 1 mục lịch sử: ai, lúc nào, hành động + từng thay đổi "nhãn: cũ → mới".
     KHÔNG có bất kỳ nút sửa/xoá nào trong mục lịch sử. */
  function entryHTML(state, row) {
    const changes = Array.isArray(row.changes) ? row.changes : [];
    const list = changes.length
      ? `<ul style="margin:4px 0 0;padding-left:18px;font-size:12.5px">${changes.map(c => `<li>${escHtml(c.label || c.field || '')}: ${escHtml(truncVal(fmtAuditChangeValue(c.field, c.from)) || '—')} → ${escHtml(truncVal(fmtAuditChangeValue(c.field, c.to)) || '—')}</li>`).join('')}</ul>`
      : '';
    return `<div class="audit-entry" style="border-left:2px solid var(--line,#e2e8f0);padding:2px 0 8px 10px;margin:0 0 6px 4px"><div style="font-size:13px"><b>${escHtml(ACTION_LABELS[row.action] || row.action || '')}</b> · ${escHtml(fmtTime(row.at))} · bởi ${escHtml(byLabel(state, row.byMemberId))}</div>${list}</div>`;
  }
  function sectionHTML(entityType, entityId) {
    return `<section class="audit-history" data-audit-for="${escHtml(entityType)}:${escHtml(entityId)}"><h3 style="margin:18px 0 8px">🕘 Lịch sử chỉnh sửa</h3><div class="audit-list"><p class="mut" style="color:var(--mut,#64748b);font-size:12.5px">Đang tải lịch sử…</p></div></section>`;
  }
  /* Việc 8: phân trang mục lịch sử trong drawer — 10 mục/trang theo
     ĐÚNG mẫu pager dùng chung (window.SavaPager của shared.js; vắng
     SavaPager thì tự kẹp/chia tại chỗ, hành vi không đổi). Trạng thái
     trang là UI-state trong phiên theo từng đối tượng (auditPages),
     THUẦN hiển thị: chuyển trang chỉ ĐỌC LẠI + dựng lại, không ghi gì. */
  const AUDIT_PAGE_SIZE = 10;
  const auditPages = {};
  let auditLastState = null;
  function auditPageInfo(total, page) {
    const P = (typeof window !== 'undefined' && window.SavaPager) || null;
    if (P && typeof P.info === 'function') return P.info(total, page, AUDIT_PAGE_SIZE);
    const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
    let p = Math.floor(Number(page) || 1);
    if (p > totalPages) p = totalPages;
    if (p < 1) p = 1;
    const start = (p - 1) * AUDIT_PAGE_SIZE;
    return { page: p, totalPages, total, start, from: total ? start + 1 : 0, to: Math.min(start + AUDIT_PAGE_SIZE, total) };
  }
  function auditPagerHTML(entityType, entityId, info) {
    if (!info || info.totalPages <= 1) return '';
    const dis = (cond) => cond ? ' disabled' : '';
    return `<div class="list-pager" style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap"><button type="button" class="btn ghost small" onclick="window.SavaAuditUI.goPage('${entityType}','${entityId}',${info.page - 1})"${dis(info.page <= 1)}>← Trước</button><span class="mut" style="color:var(--mut,#64748b);font-size:12.5px">Trang ${info.page}/${info.totalPages} · Đang hiện ${info.from}–${info.to} / ${info.total} mục</span><button type="button" class="btn ghost small" onclick="window.SavaAuditUI.goPage('${entityType}','${entityId}',${info.page + 1})"${dis(info.page >= info.totalPages)}>Sau →</button></div>`;
  }
  function goPage(entityType, entityId, page) {
    auditPages[entityType + ':' + entityId] = page;
    try {
      const doc = (typeof document !== 'undefined') ? document : null;
      const sec = doc && doc.querySelector ? doc.querySelector('.audit-history') : null;
      const root = sec && sec.parentElement ? sec.parentElement : (doc ? doc.body : null);
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
      const key = entityType + ':' + entityId;
      const info = auditPageInfo(rows.length, auditPages[key] || 1);
      auditPages[key] = info.page;
      box.innerHTML = rows.slice(info.start, info.start + AUDIT_PAGE_SIZE).map(r => entryHTML(state, r)).join('') + auditPagerHTML(entityType, entityId, info);
    } catch (e) {
      try {
        const box = rootEl && rootEl.querySelector ? rootEl.querySelector('.audit-history .audit-list') : null;
        if (box) box.innerHTML = '<p class="mut" style="color:var(--mut,#64748b);font-size:12.5px">Lịch sử chưa khả dụng.</p>';
      } catch (e2) {}
    }
  }
  const api = { metaLineHTML, sectionHTML, loadInto, entryHTML, fmtTime, fmtAuditChangeValue, byLabel, ACTION_LABELS, goPage };
  if (typeof window !== 'undefined') window.SavaAuditUI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
