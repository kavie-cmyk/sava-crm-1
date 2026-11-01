/* workspace-ui.js (đợt UI workspace, trước đây 0 test phủ) — test DOM tối
   thiểu bằng harness vm + DOM stub theo mẫu các test khác của repo (repo
   không có jsdom/package.json):
   (1) Sau khi workspace-ui chạy, #savaUserBar vẫn tồn tại đúng 1 bản,
       được reparent vào header (slot .workspace-account), vẫn giữ nguyên
       nội dung tên/vai trong #savaUserInfo — kiểm trên cấu trúc trang
       index (.workspace-header .header-actions) và cấu trúc trang mkt
       (.topbar + .navigation + dialog#editor).
   (2) Animation spring của dialog#editor: mở dialog thì transform được
       đặt trong lúc chạy; đóng dialog (sự kiện close) thì transform/
       opacity bị reset sạch, không kẹt trạng thái dở dang.
   (3) Tĩnh: nút .line-open không còn bị display:none ở bất kỳ media
       query nào trong workspace-design.css / apple-design.css (nút mở
       pipeline-theo-mảng từ Tổng quan phải hiện ở mọi bề rộng). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

class El {
  constructor(tag = 'div', id = '') {
    this.tagName = tag.toUpperCase(); this.id = id; this.className = '';
    this.children = []; this.parent = null; this.dataset = {}; this.attrs = {};
    this._listeners = {}; this.textContent = ''; this.open = false; this._icon = null;
    const classes = new Set(); this._classes = classes;
    this.classList = {
      add: (...cs) => cs.forEach(c => classes.add(c)),
      remove: (...cs) => cs.forEach(c => classes.delete(c)),
      toggle: (c, f) => { if (f === undefined) { classes.has(c) ? classes.delete(c) : classes.add(c); } else f ? classes.add(c) : classes.delete(c); },
      contains: c => classes.has(c),
    };
    this.style = { removeProperty(k) { delete this[k]; } };
  }
  appendChild(ch) {
    if (ch.parent) { const i = ch.parent.children.indexOf(ch); if (i >= 0) ch.parent.children.splice(i, 1); }
    ch.parent = this; this.children.push(ch); return ch;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn); }
  dispatch(ev) { (this._listeners[ev] || []).slice().forEach(fn => fn({})); }
  click() { this.dispatch('click'); }
  insertAdjacentHTML(pos, html) { this._icon = { html }; }
  querySelector(sel) { return sel === '.workspace-nav-icon' ? this._icon : null; }
}
function countById(root, id) {
  let n = 0;
  (function walk(e) { if (e.id === id) n++; e.children.forEach(walk); })(root);
  return n;
}

/* structure: 'index' (header-actions) hoặc 'mkt' (topbar + navigation + editor) */
function buildEnv(structure) {
  const observers = [];
  class FakeMutationObserver {
    constructor(cb) { this.cb = cb; this.targets = []; observers.push(this); }
    observe(t) { this.targets.push(t); }
    disconnect() {}
  }
  let rafSeq = 0; const rafPending = new Map();
  const requestAnimationFrame = cb => { const id = ++rafSeq; rafPending.set(id, cb); return id; };
  const cancelAnimationFrame = id => { rafPending.delete(id); };
  const runFrame = t => { const cbs = [...rafPending.values()]; rafPending.clear(); cbs.forEach(cb => cb(t)); };

  const body = new El('body');
  const authRoot = new El('div', 'savaAuthRoot');
  const userBar = new El('div', 'savaUserBar');
  const userInfo = new El('span', 'savaUserInfo'); userInfo.textContent = 'Bự · Admin';
  const logoutBtn = new El('button', 'savaLogoutBtn'); logoutBtn.textContent = 'Đăng xuất';
  userBar.appendChild(userInfo); userBar.appendChild(logoutBtn);
  authRoot.appendChild(userBar); body.appendChild(authRoot);

  let headerHost = null, navigation = null, navButtons = [], dialog = null;
  if (structure === 'index') {
    const header = new El('header'); const actions = new El('div');
    header.appendChild(actions); body.appendChild(header); headerHost = actions;
  } else {
    headerHost = new El('header'); body.appendChild(headerHost);
    navigation = new El('nav');
    navButtons = ['market', 'reviews', 'framework'].map(tab => { const b = new El('button'); b.dataset.tab = tab; navigation.appendChild(b); return b; });
    body.appendChild(navigation);
    dialog = new El('dialog', 'editor'); body.appendChild(dialog);
  }
  const byId = { savaUserBar: userBar, editor: dialog };
  const document = {
    readyState: 'complete', body,
    getElementById: id => byId[id] || null,
    createElement: tag => new El(tag),
    addEventListener() {},
    querySelector(sel) {
      if (sel === '.workspace-header .header-actions') return structure === 'index' ? headerHost : null;
      if (sel === '.topbar') return structure === 'mkt' ? headerHost : null;
      if (sel === '.navigation') return navigation;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.navigation [data-tab]') return navButtons;
      return [];
    },
  };
  const sandbox = {
    console, document, setTimeout, clearTimeout, queueMicrotask,
    MutationObserver: FakeMutationObserver,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame, cancelAnimationFrame,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('workspace-ui.js'), sandbox);
  return { body, userBar, userInfo, headerHost, navigation, navButtons, dialog, observers, runFrame };
}

test('workspace-ui (index): #savaUserBar được reparent vào header, không mất/không nhân đôi, giữ nguyên tên/vai', () => {
  const env = buildEnv('index');
  assert.equal(countById(env.body, 'savaUserBar'), 1, 'savaUserBar phải tồn tại đúng 1 bản trong cây DOM');
  assert.equal(env.userBar.parent && env.userBar.parent.className, 'workspace-account', 'userBar phải nằm trong slot .workspace-account');
  assert.equal(env.userBar.parent.parent, env.headerHost, 'slot phải nằm trong .header-actions của header');
  assert.equal(env.userBar.classList.contains('workspace-account-bar'), true);
  assert.equal(env.userInfo.parent, env.userBar, '#savaUserInfo vẫn ở trong userBar');
  assert.equal(env.userInfo.textContent, 'Bự · Admin', 'nội dung tên/vai không đổi');
});

test('workspace-ui (mkt): #savaUserBar được reparent vào .topbar, giữ nguyên nội dung; icon nav chỉ gắn 1 lần', async () => {
  const env = buildEnv('mkt');
  assert.equal(countById(env.body, 'savaUserBar'), 1);
  assert.equal(env.userBar.parent && env.userBar.parent.className, 'workspace-account');
  assert.equal(env.userBar.parent.parent, env.headerHost, 'slot phải nằm trong .topbar');
  assert.equal(env.userInfo.textContent, 'Bự · Admin');
  for (const b of env.navButtons) assert.ok(b._icon, 'nút nav phải được gắn icon workspace');
  /* MutationObserver decorate chạy lại -> không gắn icon lần hai */
  const iconsBefore = env.navButtons.map(b => b._icon);
  const navObs = env.observers.find(o => o.targets.includes(env.navigation));
  assert.ok(navObs, 'phải có MutationObserver theo dõi .navigation');
  navObs.cb([]);
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(env.navButtons.map(b => b._icon), iconsBefore, 'decorate lại không nhân đôi icon');
});

test('workspace-ui: dialog#editor đóng thì transform/opacity được reset, không kẹt dở dang', () => {
  const env = buildEnv('mkt');
  const dialog = env.dialog;
  assert.ok(dialog, 'cấu trúc mkt phải có dialog#editor');
  const dlgObs = env.observers.find(o => o.targets.includes(dialog));
  assert.ok(dlgObs, 'phải có MutationObserver theo dõi thuộc tính open của dialog');
  dialog.open = true;
  dlgObs.cb([]);
  env.runFrame(16);
  assert.equal(typeof dialog.style.transform, 'string', 'khi mở, animation spring phải đặt transform');
  assert.match(dialog.style.transform, /translateY\(/);
  dialog.open = false;
  dialog.dispatch('close');
  assert.equal(dialog.style.transform, undefined, 'đóng dialog -> transform bị xoá sạch');
  assert.equal(dialog.style.opacity, undefined, 'đóng dialog -> opacity bị xoá sạch');
  dlgObs.cb([]);
  assert.equal(dialog.style.transform, undefined, 'mutation sau khi đóng cũng không để lại transform');
});

test('tĩnh: .line-open không còn display:none ở bất kỳ media query nào (hiện ở mọi bề rộng)', () => {
  for (const f of ['workspace-design.css', 'apple-design.css']) {
    const css = read(f);
    assert.ok(!/\.line-open\s*\{[^}]*display\s*:\s*none/.test(css), f + ' vẫn còn rule ẩn .line-open');
    assert.ok(css.includes('.line-open'), f + ' vẫn giữ rule trình bày của .line-open');
  }
  assert.ok(read('index.html').includes("class=\"icon-button line-open\""), 'index.html vẫn render nút .line-open mở pipeline theo mảng');
});
