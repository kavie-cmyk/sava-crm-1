/* Small, dependency-free interaction layer. No data writes or network requests. */
(() => {
  'use strict';
  const paths = {
    overview: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    pipeline: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
    company: '<path d="M5 21V5l7-2 7 2v16M3 21h18M9 8h.01M15 8h.01M9 12h.01M15 12h.01M10 21v-5h4v5"/>',
    game: '<path d="M8 8h8c3 0 4 2 5 7l.4 2c.4 3-2 4-4 2l-2-2H9l-2 2c-2 2-4.4 1-4-2l.4-2C4 10 5 8 8 8Z"/><path d="M8 11v5M5.5 13.5h5M16 12h.01M18 15h.01"/>',
    inbox: '<path d="M4 4h16l2 12v4H2v-4L4 4Z"/><path d="M2 15h6l2 3h4l2-3h6M9 8h6M10 11h4"/>',
    check: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m7 12 3 3 7-7"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    external: '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
    chevron: '<path d="m8 10 4 4 4-4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    money: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18m-6 5h3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    spark: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z"/>',
    cube: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10 9-5m-9 5L3 8m9 5v9M7.5 5.5l9 5"/>',
    edit: '<path d="m14 5 5 5M4 20l4-1 12-12a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
    note: '<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h6"/>',
    call: '<path d="m7 3-4 2c0 9 7 16 16 16l2-4-5-3-2 2c-3-1-5-3-6-6l2-2-3-5Z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
    meeting: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3M8 17h7"/>',
    link: '<path d="m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
    reset: '<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6"/>',
    team: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>'
  };
  const icon = name => '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.note) + '</svg>';
  window.SavaUI = { icon };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function setup() {
    const drawer = document.getElementById('drawer');
    let progress = drawer?.classList.contains('on') ? 1 : 0;
    let velocity = 0, target = progress, frame = 0, previousTime = 0;
    const focusOrigins = new Map();
    let topOverlay = null;
    const focusables = el => [...el.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(x => !x.hidden && x.getClientRects().length && !x.closest('[inert]'));

    function paint() {
      if (drawer) drawer.style.transform = `translateX(${(1 - progress) * 105}%)`;
    }
    function spring(time) {
      const dt = Math.min((time - previousTime) / 1000 || .016, .032);
      previousTime = time;
      velocity += ((target - progress) * 420 - velocity * 41) * dt;
      progress += velocity * dt;
      paint();
      if (Math.abs(target - progress) < .0008 && Math.abs(velocity) < .01) {
        progress = target; velocity = 0; paint(); frame = 0;
        drawer.removeAttribute('data-moving');
      } else frame = requestAnimationFrame(spring);
    }
    function moveDrawer(open) {
      const next = open ? 1 : 0;
      if (next === target) return;
      target = next;
      if (reduced.matches) {
        cancelAnimationFrame(frame); frame = 0; progress = target; velocity = 0;
        drawer.removeAttribute('data-moving'); paint(); return;
      }
      drawer.setAttribute('data-moving', '');
      if (!frame) { previousTime = 0; frame = requestAnimationFrame(spring); }
    }
    reduced.addEventListener('change', () => {
      if (drawer && reduced.matches) { cancelAnimationFrame(frame); frame = 0; progress = target; velocity = 0; paint(); drawer.removeAttribute('data-moving'); }
    });
    paint();

    function closeOverlay(el) {
      if (el === drawer) window.closeDrawer();
      else if (el.id === 'modal') window.closeAdd();
      else if (el.id === 'editModal') window.closeEdit();
      else if (el.id === 'pubosModal') window.PubOS?.closeConnectModal();
      else el.classList.remove('on');
    }

    const menuButton = document.getElementById('workspaceMenu');
    function closeMenu() { document.body.classList.remove('side-open'); menuButton?.setAttribute('aria-expanded', 'false'); update(); }
    menuButton?.addEventListener('click', () => {
      const open = document.body.classList.toggle('side-open');
      menuButton.setAttribute('aria-expanded', String(open));
      update();
      if (open) document.querySelector('#nav button.on')?.focus();
    });
    document.querySelector('.side-scrim')?.addEventListener('click', () => { closeMenu(); menuButton?.focus(); });
    document.querySelector('#nav')?.addEventListener('click', e => { if (e.target.closest('button')) closeMenu(); });
    document.querySelector('.mobile-nav')?.addEventListener('click', e => {
      const button = e.target.closest('button[data-view]');
      if (button) { window.setView(button.dataset.view); window.scrollTo({ top: 0, behavior: 'instant' }); }
    });
    const search = document.getElementById('search');
    document.getElementById('clearSearch')?.addEventListener('click', () => {
      search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); search.focus();
    });

    function update() {
      document.querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon); });
      const overlays = [...document.querySelectorAll('.drawer, .modal')];
      const open = overlays.filter(el => el.classList.contains('on'));
      const nextTop = [...open].reverse().find(el => el.matches('.modal')) || open[0] || null;
      for (const el of overlays) {
        const isOpen = open.includes(el);
        el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-hidden', String(!isOpen)); el.inert = !isOpen || el !== nextTop;
        const heading = el.querySelector('h2,h3');
        if (heading) { if (!heading.id) heading.id = (el.id || 'dialog') + '-heading'; el.setAttribute('aria-labelledby', heading.id); }
        if (isOpen && !focusOrigins.has(el)) focusOrigins.set(el, document.activeElement);
        if (!isOpen && focusOrigins.has(el)) {
          const origin = focusOrigins.get(el); focusOrigins.delete(el);
          queueMicrotask(() => { if (origin?.isConnected && !origin.closest('[inert]')) origin.focus(); });
        }
      }
      document.body.classList.toggle('overlay-open', !!nextTop);
      const mobile = window.matchMedia('(max-width: 900px)').matches;
      const sideOpen = mobile && document.body.classList.contains('side-open');
      for (const el of document.querySelectorAll('.main,body > .wrap,body > header,.mobile-nav')) el.inert = !!nextTop || sideOpen;
      const side = document.querySelector('.side');
      if (side) { side.inert = !!nextTop || (mobile && !sideOpen); side.setAttribute('aria-hidden', String(mobile && !sideOpen)); }
      if (drawer) moveDrawer(drawer.classList.contains('on'));
      if (nextTop && (nextTop !== topOverlay || !nextTop.contains(document.activeElement))) {
        const first = focusables(nextTop)[0]; if (first) first.focus();
      }
      topOverlay = nextTop;

      document.querySelectorAll('#nav [data-view]').forEach(button => {
        button.setAttribute('aria-current', button.classList.contains('on') ? 'page' : 'false');
        const mobile = document.querySelector(`.mobile-nav [data-view="${button.dataset.view}"]`);
        if (mobile) { mobile.classList.toggle('on', button.classList.contains('on')); mobile.setAttribute('aria-current', button.getAttribute('aria-current')); }
      });
      document.querySelectorAll('.linetabs button,.tabs button').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('on'))));
      document.querySelector('.search-control')?.classList.toggle('has-query', !!search?.value);
      const drawerClose = drawer?.querySelector('.x');
      if (drawerClose) drawerClose.setAttribute('aria-label', 'Đóng chi tiết');
      document.querySelectorAll('label').forEach(label => {
        if (label.htmlFor || label.querySelector('input')) return;
        const field = label.nextElementSibling;
        if (field?.matches('input[id],select[id],textarea[id]')) label.htmlFor = field.id;
      });
      document.querySelectorAll('.task input[type=checkbox]').forEach(input => input.setAttribute('aria-label', 'Hoàn thành: ' + (input.closest('.task').querySelector('.tt')?.textContent || 'công việc')));
      document.querySelectorAll('.crit input[type=range]').forEach(input => input.setAttribute('aria-label', input.closest('.crit').firstElementChild.textContent));
      document.querySelectorAll('.dcard[onclick],.gcard[onclick],.funnel-row[onclick],.activity-item[onclick],tr[onclick],.task .tt[onclick]').forEach(el => {
        el.setAttribute('tabindex', '0');
        if (el.tagName !== 'TR') el.setAttribute('role', 'button');
      });
      document.querySelectorAll('.panel > table').forEach(table => { const wrap = document.createElement('div'); wrap.className = 'table-wrap'; table.before(wrap); wrap.appendChild(table); });
      const toast = document.getElementById('toast');
      if (toast) { toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); }
    }
    let queued = false;
    new MutationObserver(() => {
      if (queued) return; queued = true;
      queueMicrotask(() => { queued = false; update(); });
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    document.addEventListener('keydown', e => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
      if (search && (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing))) {
        e.preventDefault(); search.focus(); search.select(); return;
      }
      if (e.key === 'Escape') {
        if (topOverlay) { e.preventDefault(); closeOverlay(topOverlay); }
        else if (document.body.classList.contains('side-open')) { closeMenu(); menuButton?.focus(); }
        else if (search?.value && document.activeElement === search) { document.getElementById('clearSearch').click(); }
      }
      const scope = topOverlay || (document.body.classList.contains('side-open') ? document.querySelector('.side') : null);
      if (e.key === 'Tab' && scope) {
        const list = focusables(scope), first = list[0], last = list.at(-1);
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[tabindex="0"][onclick]')) { e.preventDefault(); e.target.click(); }
    });
    document.addEventListener('click', e => {
      if (e.target.matches('.modal.on')) closeOverlay(e.target);
    });
    window.matchMedia('(max-width: 900px)').addEventListener('change', update);
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true }); else setup();
})();
