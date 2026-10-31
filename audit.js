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
    if (!v) return '—';
    const dt = new Date(v);
    return Number.isNaN(dt.getTime()) ? String(v) : dt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
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
      ? `<ul style="margin:4px 0 0;padding-left:18px;font-size:12.5px">${changes.map(c => `<li>${escHtml(c.label || c.field || '')}: ${escHtml(truncVal(c.from) || '—')} → ${escHtml(truncVal(c.to) || '—')}</li>`).join('')}</ul>`
      : '';
    return `<div class="audit-entry" style="border-left:2px solid var(--line,#e2e8f0);padding:2px 0 8px 10px;margin:0 0 6px 4px"><div style="font-size:13px"><b>${escHtml(ACTION_LABELS[row.action] || row.action || '')}</b> · ${escHtml(fmtTime(row.at))} · bởi ${escHtml(byLabel(state, row.byMemberId))}</div>${list}</div>`;
  }
  function sectionHTML(entityType, entityId) {
    return `<section class="audit-history" data-audit-for="${escHtml(entityType)}:${escHtml(entityId)}"><h3 style="margin:18px 0 8px">🕘 Lịch sử chỉnh sửa</h3><div class="audit-list"><p class="mut" style="color:var(--mut,#64748b);font-size:12.5px">Đang tải lịch sử…</p></div></section>`;
  }
  /* Đọc lịch sử của đúng 1 đối tượng rồi đổ vào section đã render.
     Lỗi/bảng chưa có -> trạng thái nhẹ nhàng, không ném lỗi ra ngoài. */
  async function loadInto(rootEl, state, entityType, entityId) {
    try {
      const box = rootEl && rootEl.querySelector ? rootEl.querySelector('.audit-history .audit-list') : null;
      if (!box) return;
      const api = (typeof window !== 'undefined' && window.SavaAudit) || null;
      if (!api || typeof api.listFor !== 'function') { box.innerHTML = '<p class="mut" style="color:var(--mut,#64748b);font-size:12.5px">Lịch sử chưa khả dụng.</p>'; return; }
      const rows = await api.listFor(entityType, entityId);
      if (!Array.isArray(rows)) { box.innerHTML = '<p class="mut" style="color:var(--mut,#64748b);font-size:12.5px">Lịch sử chưa khả dụng.</p>'; return; }
      if (!rows.length) { box.innerHTML = '<p class="mut" style="color:var(--mut,#64748b);font-size:12.5px">Chưa có lịch sử chỉnh sửa.</p>'; return; }
      box.innerHTML = rows.map(r => entryHTML(state, r)).join('');
    } catch (e) {
      try {
        const box = rootEl && rootEl.querySelector ? rootEl.querySelector('.audit-history .audit-list') : null;
        if (box) box.innerHTML = '<p class="mut" style="color:var(--mut,#64748b);font-size:12.5px">Lịch sử chưa khả dụng.</p>';
      } catch (e2) {}
    }
  }
  const api = { metaLineHTML, sectionHTML, loadInto, entryHTML, fmtTime, byLabel, ACTION_LABELS };
  if (typeof window !== 'undefined') window.SavaAuditUI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
