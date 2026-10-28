/* Read Publishing evaluations inside existing CRM dossiers without changing CRM records. */
(function () {
  const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function find(kind,id) {
    let record;
    try { record=JSON.parse(localStorage.getItem('sava_publishing_v1')||'{}').requests?.find(r=>r.kind===kind&&r.entityId===id); } catch {}
    return record;
  }
  /* S3 guard: nếu state CRM (window.S hoặc biến toàn cục S của index.html) tồn
     tại, entity phải còn trong S.games / S.companies; đã bị xoá -> coi như
     chưa có record, không hiện badge/summary ma. Không có state CRM (trang
     khác) thì giữ hành vi cũ (không chặn). */
  function crmState() {
    try { if (typeof window !== "undefined" && window.S) return window.S; } catch {}
    try { if (typeof globalThis !== "undefined" && globalThis.S) return globalThis.S; } catch {}
    try { if (typeof S !== "undefined" && S) return S; } catch {}
    return null;
  }
  function entityExists(kind,id) {
    const st = crmState();
    if (!st) return true;
    const list = kind === 'game' ? st.games : kind === 'company' ? st.companies : null;
    if (!Array.isArray(list)) return true;
    return list.some(x => x && x.id === id);
  }
  function findLive(kind,id) {
    const record = find(kind,id);
    if (!record) return undefined;
    if (!entityExists(kind,id)) return undefined;
    return record;
  }
  function gameBadge(id) {
    const r=findLive('game',id);
    return `<span class="pill gray">${esc(r?'MKT: '+r.status:'Đánh giá mới: chưa gửi yêu cầu')}</span>`;
  }
  function v2InputOf(cur) {
    if (!cur || typeof cur !== 'object') return null;
    if (cur.scoresV2 && typeof cur.scoresV2 === 'object') return cur.scoresV2;
    if ((cur.market && typeof cur.market === 'object') || (cur.prototype && typeof cur.prototype === 'object')) return cur;
    return null;
  }
  function summary(kind,id) {
    const record=findLive(kind,id);
    let status='Chưa gửi yêu cầu đánh giá',result='';
    if(record) {
      status=record.status;
      /* S2 guard: revisions có thể thiếu trong dữ liệu cũ/hỏng. */
      const revCount=(record.revisions||[]).length;
      if(record.current && window.PublishingScore) {
        const v2In = kind==='game' ? v2InputOf(record.current) : null;
        if (v2In && typeof PublishingScore.gameV2 === 'function') {
          /* N5: có điểm v2 -> gameV2 là kết quả chính (Final v2 + nhãn quyết định v2). */
          const v2=PublishingScore.gameV2(v2In);
          const compTotal = typeof v2.completenessTotal === 'number' ? v2.completenessTotal : null;
          const compPctTxt = compTotal==null ? '—' : (compTotal*100).toLocaleString('en-US',{maximumFractionDigits:1});
          const lowCompleteness = (v2.market && v2.market.completeness < 0.8) || (v2.prototype && v2.prototype.completeness < 0.8);
          if (v2.decision == null || lowCompleteness) {
            result=`<p style="margin:7px 0">Chưa đủ dữ liệu để kết luận · <b>— (chưa đủ dữ liệu · ${esc(compPctTxt)}%)</b> · ${revCount} phiên bản</p>`;
          } else {
            result=`<p style="margin:7px 0">${esc(v2.decision)} (đánh giá v2) · Final v2 <b>${v2.final==null?'—':v2.final.toLocaleString('en-US',{maximumFractionDigits:1})}/100</b> · ${revCount} phiên bản</p>`;
          }
        } else if (kind==='company') {
          const res=PublishingScore.company(record.current);
          const total=res.total;
          result=`<p style="margin:7px 0">${esc(res.recommendation)} · <b>${total==null?'NE':total.toLocaleString('en-US',{maximumFractionDigits:1})}/100</b> · ${revCount} phiên bản</p>`;
        } else {
          const res=PublishingScore.game(record.current);
          const total=res.final;
          result=`<p style="margin:7px 0">${esc(res.recommendation)} · <b>${total==null?'NE':total.toLocaleString('en-US',{maximumFractionDigits:1})}/100</b> · đánh giá cũ (legacy) · ${revCount} phiên bản</p>`;
        }
      }
    }
    return `<section style="background:#f0f7f8;border:1px solid #d7e6ea;border-radius:12px;padding:15px;margin:16px 0"><h3 style="margin:0 0 7px">${kind==='company'?'Năng lực sản xuất · MKT':'Đánh giá game · Market + Prototype'}</h3><p style="font-size:13px;margin:0">${esc(status)}</p>${result}<a class="btn" style="text-decoration:none;margin-top:9px" href="publishing.html?tab=reviews&amp;kind=${kind}&amp;id=${encodeURIComponent(id)}">${record?'Xem kết quả / bổ sung BD':'Gửi MKT đánh giá'} →</a></section>`;
  }
  window.PublishingBridge={summary,gameBadge};
  addEventListener('storage',e=>{if(e.key==='sava_publishing_v1'){if(typeof render==='function')render();if(typeof refreshDrawer==='function')refreshDrawer();}});
})();
