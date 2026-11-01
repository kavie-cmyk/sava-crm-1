/* Presentation only: no storage, authentication, network or business mutations. */
(() => {
  'use strict';
  const icons = {
    market:'<path d="M4 4v16h16M8 16v-5m4 5V8m4 8v-3"/>',
    reviews:'<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M9 3h6v4H9zm-1 10 2 2 5-5M8 18h8"/>',
    framework:'<path d="M5 4h14v17l-7-3-7 3V4Zm4 4h6m-6 4h6"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  };
  function svg(name,cls='workspace-nav-icon') {return '<svg class="'+cls+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';}
  function setup() {
    const userBar=document.getElementById('savaUserBar');
    const host=document.querySelector('.workspace-header .header-actions') || document.querySelector('.topbar');
    if(userBar&&host) {
      const slot=document.createElement('div');slot.className='workspace-account';host.appendChild(slot);
      userBar.classList.add('workspace-account-bar');slot.appendChild(userBar);
    }
    const mobile=document.querySelector('.mobile-nav'),menu=document.getElementById('workspaceMenu');
    let more;
    if(mobile&&menu) {
      more=document.createElement('button');more.className='workspace-more';more.type='button';
      more.setAttribute('aria-label','Thêm mục điều hướng');more.setAttribute('aria-controls','workspaceSide');more.setAttribute('aria-expanded','false');
      more.innerHTML=svg('more','ui-icon')+'<span>Thêm</span>';
      more.addEventListener('click',()=>menu.click());mobile.appendChild(more);
    }
    function decorate() {
      for(const button of document.querySelectorAll('.navigation [data-tab]')) {
        if(!button.querySelector('.workspace-nav-icon'))button.insertAdjacentHTML('afterbegin',svg(button.dataset.tab==='market'?'market':button.dataset.tab==='reviews'?'reviews':'framework'));
      }
      if(more) {
        const advanced=[...document.querySelectorAll('#nav button[data-view]')].slice(5).some(b=>b.classList.contains('on'));
        const isOpen=document.body.classList.contains('side-open');
        more.classList.toggle('on',advanced||isOpen);more.setAttribute('aria-expanded',String(isOpen));
      }
    }
    let queued=false;
    const observer=new MutationObserver(()=>{
      if(queued)return;queued=true;queueMicrotask(()=>{queued=false;decorate();});
    });
    // Observe only content replacement and the body's menu class. Avoid a
    // class-observer loop when the decoration itself marks the More button.
    const navigation=document.querySelector('.navigation');
    if(navigation)observer.observe(navigation,{subtree:true,childList:true});
    observer.observe(document.body,{attributes:true,attributeFilter:['class']});
    const nav=document.getElementById('nav');if(nav)observer.observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
    decorate();
    const dialog=document.getElementById('editor'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
    if(dialog) {
      let frame=0,position=1,velocity=0,last=0;
      const reset=()=>{cancelAnimationFrame(frame);frame=0;position=1;velocity=0;dialog.style.removeProperty('transform');dialog.style.removeProperty('opacity');};
      function tick(time) {
        if(!dialog.open||reduced.matches){reset();return;}
        const dt=Math.min((time-last)/1000||.016,.032);last=time;
        velocity+=((1-position)*400-velocity*40)*dt;position+=velocity*dt;
        dialog.style.transform=`translateY(${(1-position)*10}px) scale(${.992+position*.008})`;
        dialog.style.opacity=String(.75+.25*position);
        if(Math.abs(1-position)<.001&&Math.abs(velocity)<.01){reset();return;}
        frame=requestAnimationFrame(tick);
      }
      new MutationObserver(()=>{
        if(!dialog.open||reduced.matches){reset();return;}
        if(!frame){position=0;velocity=0;last=0;frame=requestAnimationFrame(tick);}
      }).observe(dialog,{attributes:true,attributeFilter:['open']});
      dialog.addEventListener('close',reset);reduced.addEventListener('change',()=>{if(reduced.matches)reset();});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
