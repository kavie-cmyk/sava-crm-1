/* Read Publishing evaluations inside existing CRM dossiers without changing CRM records. */
(function () {
  const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function find(kind,id) {
    let record;
    try { record=JSON.parse(localStorage.getItem('sava_publishing_v1')||'{}').requests?.find(r=>r.kind===kind&&r.entityId===id); } catch {}
    return record;
  }
  function gameBadge(id) {
    const r=find('game',id);
    return `<span class="pill gray">${esc(r?'MKT: '+r.status:'Đánh giá mới: chưa gửi yêu cầu')}</span>`;
  }
  function summary(kind,id) {
    const record=find(kind,id);
    let status='Chưa gửi yêu cầu đánh giá',result='';
    if(record) {
      status=record.status;
      if(record.current && window.PublishingScore) {
        const res=kind==='company'?PublishingScore.company(record.current):PublishingScore.game(record.current);
        const total=kind==='company'?res.total:res.final;
        result=`<p style="margin:7px 0">${esc(res.recommendation)} · <b>${total==null?'NE':total.toLocaleString('en-US',{maximumFractionDigits:1})}/100</b> · ${record.revisions.length} phiên bản</p>`;
      }
    }
    return `<section style="background:#f0f7f8;border:1px solid #d7e6ea;border-radius:12px;padding:15px;margin:16px 0"><h3 style="margin:0 0 7px">${kind==='company'?'Năng lực sản xuất · MKT':'Đánh giá game · Market + Prototype'}</h3><p style="font-size:13px;margin:0">${esc(status)}</p>${result}<a class="btn" style="text-decoration:none;margin-top:9px" href="publishing.html?tab=reviews&amp;kind=${kind}&amp;id=${encodeURIComponent(id)}">${record?'Xem kết quả / bổ sung BD':'Gửi MKT đánh giá'} →</a></section>`;
  }
  window.PublishingBridge={summary,gameBadge};
  addEventListener('storage',e=>{if(e.key==='sava_publishing_v1'){if(typeof render==='function')render();if(typeof refreshDrawer==='function')refreshDrawer();}});
})();
