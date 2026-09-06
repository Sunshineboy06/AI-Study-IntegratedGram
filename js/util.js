'use strict';

/* ---------- DOM 与通用工具 ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const TYPE_LABEL = { single: '单选题', multi: '多选题', fill: '填空题', short: '简答题' };
const QUIZ_TYPES = ['single', 'multi', 'fill', 'short'];
const letter = i => String.fromCharCode(65 + i);

/* 统一的答案展示文本 */
function answerText(q) {
  if (q.type === 'fill') return (q._blanks || []).map((a, i) => `第${i + 1}空：${a}`).join('　');
  if (q.type === 'short') return q.refAnswer || q.note || '—';
  return letters(q);
}

function letters(q) {
  if (q._answerIdxs && q._answerIdxs.length) return q._answerIdxs.map(letter).join('、');
  const a = q.answer;
  return Array.isArray(a) ? a.join('、') : String(a ?? '');
}

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uid(prefix = 'id') {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
}

function fmtDate(ts) {
  const d = new Date(ts || Date.now());
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toast(msg, type = 'info') {
  const box = $('#toast-box');
  if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 350);
  }, 2400);
}

/* ---------- 弹窗 ---------- */
function openDlg(html) {
  const dlg = $('#dlg');
  dlg.innerHTML = `<div class="dlg-body">${html}</div>`;
  if (!dlg._clickBound) {
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg._clickBound = true;
  }
  if (!dlg.open) dlg.showModal();
  return dlg;
}

function closeDlg() {
  const dlg = $('#dlg');
  if (dlg.open) dlg.close();
}

function confirmDlg(title, body, danger = false) {
  return new Promise(resolve => {
    const dlg = openDlg(`
      <h3 class="dlg-title">${esc(title)}</h3>
      <p class="dlg-text">${body}</p>
      <div class="dlg-actions">
        <button class="btn ghost" id="dlg-cancel">取消</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" id="dlg-ok">确定</button>
      </div>`);
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    $('#dlg-ok', dlg).onclick = () => { finish(true); closeDlg(); };
    $('#dlg-cancel', dlg).onclick = () => { finish(false); closeDlg(); };
    dlg.addEventListener('close', () => finish(false), { once: true });
  });
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* 答错时的界面震动提示 */
function shakeEl(elm) {
  if (!elm) return;
  elm.classList.remove('shake');
  void elm.offsetWidth;
  elm.classList.add('shake');
  elm.addEventListener('animationend', () => elm.classList.remove('shake'), { once: true });
}

/* ---------- 懒加载：长列表分页渲染（滚动到哨兵自动追加下一页） ---------- */
const LazyList = {
  PAGE: 60,

  /* rows: HTML 行字符串数组；mount: 挂载容器；bindAll: 每页追加后重新绑定行内事件 */
  create(rows, mount, bindAll) {
    this.stop(mount);
    let pos = 0;
    const list = document.createElement('div');
    list.className = 'res-list';
    mount.appendChild(list);
    const sentinel = document.createElement('div');
    sentinel.className = 'lazy-sentinel';
    mount.appendChild(sentinel);

    const obs = new IntersectionObserver(entries => {
      /* 容器被重渲染移除后自动断开，避免泄漏 */
      if (!sentinel.isConnected) { obs.disconnect(); return; }
      if (entries.some(e => e.isIntersecting)) {
        obs.disconnect();
        append();
        if (pos < rows.length) obs.observe(sentinel);
      }
    }, { rootMargin: '240px' });

    const append = () => {
      const chunk = rows.slice(pos, pos + this.PAGE);
      list.insertAdjacentHTML('beforeend', chunk.join(''));
      pos += chunk.length;
      if (bindAll) bindAll();
      if (pos >= rows.length) {
        sentinel.classList.add('done');
        sentinel.innerHTML = rows.length ? `— 共 ${rows.length} 项 · 已全部加载 —` : '';
        obs.disconnect();
      } else {
        sentinel.innerHTML = '<span class="lazy-spinner"></span> 加载中…';
      }
    };

    mount._lazyStop = () => obs.disconnect();
    append();
    obs.observe(sentinel);
  },

  stop(mount) {
    if (mount && mount._lazyStop) { mount._lazyStop(); mount._lazyStop = null; }
  },
};

/* ---------- 空状态占位卡片 ---------- */
function emptyState(msg, btnText, action) {
  return `<div class="card empty"><p>${msg}</p>${btnText ? `<button class="btn primary" onclick="${action}">${btnText}</button>` : ''}</div>`;
}

/* ---------- 横向拖拽滚动（鼠标拖拽跟随；触屏走原生滑动；仅手动，无自动轮播） ---------- */
function enableDragScroll(track) {
  if (!track || track._dragBound) return;
  track._dragBound = true;
  let down = false, startX = 0, startScroll = 0, moved = false;

  track.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;   // 触屏/笔走原生滚动
    down = true; moved = false;
    startX = e.clientX;
    startScroll = track.scrollLeft;
    track.classList.add('dragging');
  });
  window.addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) > 6) {
      moved = true;
      track._dragged = true;                 // 拖拽后短暂抑制 click
      try { track.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    }
    if (moved) track.scrollLeft = startScroll - dx;
  });
  window.addEventListener('pointerup', () => {
    if (!down) return;
    down = false;
    track.classList.remove('dragging');
    if (track._dragged) setTimeout(() => { track._dragged = false; }, 80);
  });
}
