'use strict';

/* ---------- 应用入口与视图路由 ---------- */
const App = {
  views: {},

  async showView(name) {
    if (Quiz.active && name !== 'runner' && name !== 'result') {
      const ok = await confirmDlg('退出本次刷题？', '退出后本次作答进度不会保存。', true);
      if (!ok) return;
      Quiz.abort();
    }
    $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    /* 首页：全屏蓝 Hero 从页面顶端铺起，顶部公告条让位（黑色横条会割裂首屏） */
    document.body.classList.toggle('view-home', name === 'home');
    const r = this.views[name];
    if (r) r();
  },
};

/* ---------- 顶栏课程文件夹选择器 ---------- */function renderFolderBar() {
  const sel = $('#folder-select');
  if (!sel) return;
  const opts = [{ id: '__all__', name: '全部课程' }]
    .concat(Store.data.folders);
  sel.innerHTML = opts.map(f =>
    `<option value="${esc(f.id)}"${f.id === Store.data.activeFolder ? ' selected' : ''}>${esc(f.name)}</option>`).join('');
  sel.onchange = () => {
    Store.setFolder(sel.value);
    App.showView('home');
    toast(`已切换到「${sel.value === '__all__' ? '全部课程' : Store.folderName(sel.value)}」`, 'ok');
  };
}

window.addEventListener('DOMContentLoaded', () => {
  Store.init();
  renderFolderBar();

  /* ---------- 深浅色主题切换（偏好存本机，夜间学习友好） ---------- */
  const themeBtn = $('#theme-toggle');
  const applyTheme = dark => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('platform.theme', dark ? 'dark' : 'light'); } catch (e) { /* 忽略 */ }
    /* 图标反映当前主题：用单色几何符号，避免 emoji 自带彩色破坏单色体系 */
    themeBtn.textContent = dark ? '◐ 夜间' : '◑ 日间';
    themeBtn.title = dark ? '当前为夜间模式，点击切换' : '当前为日间模式，点击切换';
  };
  applyTheme(document.documentElement.classList.contains('dark'));
  themeBtn.addEventListener('click', () =>
    applyTheme(!document.documentElement.classList.contains('dark')));

  /* 滚动动态模糊：滚动中轻微高斯模糊，停止后恢复清晰 */
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let scrollTimer = null;
    window.addEventListener('scroll', () => {
      document.body.classList.add('is-scrolling');
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => document.body.classList.remove('is-scrolling'), 120);
    }, { passive: true });
  }

  /* 顶栏下滑收缩：滚动超过阈值后收紧间距，但始终保持居中对称 */
  const topbar = $('#topbar');
  if (topbar) {
    let ticking = false;
    const syncTopbar = () => {
      topbar.classList.toggle('is-compact', window.scrollY > 64);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(syncTopbar); }
    }, { passive: true });
    syncTopbar();
  }

  // 保活长连接：浏览器窗口/标签页全部关闭后，本地服务器据此自动退出
  try {
    window.__keepAlive = new EventSource('/sse');
  } catch (e) { /* 非服务器环境（直接打开 index.html）时忽略 */ }

  App.views = {
    home: renderHome,
    vocab: () => Vocab.render(),
    setup: () => Quiz.renderSetup(),
    runner: () => Quiz.renderRunner(),
    result: () => Quiz.renderResultView(),
    mindmap: () => Mindmap.render(),
    wrongbook: () => Wrongbook.render(),
    data: () => DataMan.render(),
  };
  $$('.tabs button').forEach(b => b.addEventListener('click', () => App.showView(b.dataset.view)));
  $('#folder-manage').addEventListener('click', () => App.showView('data'));
  App.showView('home');
});
