/**
 * Steep Design System - 全局三态主题管理器
 * 支持跟随系统 (system)、浅色 (light)、深色 (dark)
 * 状态持久化存储于 localStorage['study_theme_mode']
 */
(function () {
  const THEME_KEY = 'study_theme_mode';

  function getSystemPreference() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function getStoredMode() {
    return localStorage.getItem(THEME_KEY) || 'system';
  }

  function applyTheme(mode) {
    const effectiveTheme = mode === 'system' ? getSystemPreference() : mode;
    const root = document.documentElement;

    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }

    // 更新页面上所有的主题切换按钮状态
    const buttons = document.querySelectorAll('[data-theme-choice]');
    buttons.forEach((btn) => {
      const choice = btn.getAttribute('data-theme-choice');
      if (choice === mode) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
      }
    });
  }

  // 立即在解析阶段应用主题，避免页面闪白
  const initialMode = getStoredMode();
  applyTheme(initialMode);

  // 全局 API 暴露
  window.SteepTheme = {
    getMode: getStoredMode,
    setMode: function (mode) {
      if (mode !== 'system' && mode !== 'light' && mode !== 'dark') return;
      localStorage.setItem(THEME_KEY, mode);
      applyTheme(mode);
    },
    toggleNext: function () {
      const current = getStoredMode();
      const order = ['system', 'light', 'dark'];
      const next = order[(order.indexOf(current) + 1) % order.length];
      this.setMode(next);
      return next;
    },
    refresh: function () {
      applyTheme(getStoredMode());
    }
  };

  // 监听操作系统深浅色变化
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (getStoredMode() === 'system') {
        applyTheme('system');
      }
    });
  }

  // DOM 准备完毕后绑定主题控制器的点击事件
  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(getStoredMode());
    document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
      btn.addEventListener('click', function () {
        const choice = this.getAttribute('data-theme-choice');
        window.SteepTheme.setMode(choice);
      });
    });
  });
})();
