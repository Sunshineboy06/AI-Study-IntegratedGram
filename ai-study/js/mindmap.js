'use strict';

/* ---------- 总复习：Markdown 大纲 → 交互式知识脑图 ---------- */

const Mindmap = {
  outlineId: null,
  engine: null,

  render() {
    const outlines = Store.outlines();
    if (!outlines.length) {
      $('#main').innerHTML = `<h2 class="page-title">总复习 · 知识框架</h2>` +
        emptyState('还没有知识点大纲，请先到「数据管理」导入 Markdown 大纲（导入一次即永久保存）', '去导入大纲', "App.showView('data')");
      return;
    }
    if (!this.outlineId || !outlines.some(o => o.id === this.outlineId)) this.outlineId = outlines[0].id;

    $('#main').innerHTML = `
      <h2 class="page-title">总复习 · 知识框架</h2>
      <div class="card mm-toolbar">
        <label class="field">大纲
          <select id="mm-select">${outlines.map(o =>
            `<option value="${o.id}"${o.id === this.outlineId ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
        </label>
        <button class="btn ghost sm" id="mm-expand">展开全部</button>
        <button class="btn ghost sm" id="mm-collapse">收起到章节</button>
        <span class="tip">点击节点逐层展开 / 收起 · 拖动平移 · 滚轮缩放</span>
      </div>
      <div class="mm-wrap">
        <div class="mm-svgbox"><svg id="mm-svg"></svg></div>
        <aside class="card mm-detail" id="mm-detail">
          <div class="mm-empty">点击左侧脑图中的知识点<br>查看说明与关联题目</div>
        </aside>
      </div>`;

    $('#mm-select').onchange = e => { this.outlineId = e.target.value; this.draw(); };
    $('#mm-expand').onclick = () => this.engine && this.engine.expandAll();
    $('#mm-collapse').onclick = () => this.engine && this.engine.collapseTo(1);
    this.draw();
  },

  draw() {
    const ol = Store.data.outlines.find(o => o.id === this.outlineId);
    if (!ol) return;
    /* 渲染在副本上进行，避免污染持久化的大纲数据 */
    const tree = JSON.parse(JSON.stringify(ol.tree));
    this.engine = createMindmap($('#mm-svg'), tree, {
      onSelect: node => this.showDetail(node),
    });
  },

  showDetail(node) {
    const path = [];
    let p = node;
    while (p) { path.unshift(p.name); p = p._parent; }
    const { items, how } = collectPractice(node);
    const total = items.length;
    const limit = Math.min(total, MAX_PRACTICE);

    /* 题型分布小统计 */
    const stat = {};
    items.forEach(e => { stat[e.q.type] = (stat[e.q.type] || 0) + 1; });
    const statText = QUIZ_TYPES.filter(t => stat[t]).map(t => `${TYPE_LABEL[t]} ${stat[t]}`).join(' · ');

    $('#mm-detail').innerHTML = `
      <div class="crumb">${path.map(esc).join(' / ')}</div>
      <h3>${esc(node.name)}</h3>
      ${node.note ? `<p class="mm-note">${esc(node.note)}</p>` : '<p class="muted">（无补充说明）</p>'}
      <h4 class="rel-title">关联题目（${total}）${how ? `<span class="rel-src">${esc(how)}</span>` : ''}</h4>
      ${total ? `
        ${statText ? `<p class="muted rel-stat">${statText}</p>` : ''}
        <ul class="rel-list">${items.slice(0, 8).map(r => `
          <li><span class="badge b-${r.q.type}">${TYPE_LABEL[r.q.type]}</span><span>${esc(truncate(r.q.stem, 40))}</span></li>`).join('')}
          ${total > 8 ? `<li class="rel-more muted">…… 还有 ${total - 8} 道（共 ${total} 道）</li>` : ''}
        </ul>
        <div class="row">
          <button class="btn primary sm" id="mm-practice">▶ 立即练习（${limit} 题）</button>
          <button class="btn ghost sm" id="mm-custom">⚙ 自定义</button>
        </div>
        ${total > MAX_PRACTICE ? `<p class="muted">题目较多，一次最多练习 ${MAX_PRACTICE} 道（默认取前 ${MAX_PRACTICE} 道，可用「自定义」调整）。</p>` : ''}`
        : `<p class="muted">这个知识点及其上下级都还没有匹配到题目。<br>
           题目需要带 <code>chapter</code> 章节字段（与知识点名相关）或题干中包含知识点名称，才会被自动关联。</p>`}`;

    const go = opts => Quiz.startFromMindmap(items, Object.assign({ label: node.name }, opts));
    const b1 = $('#mm-practice');
    if (b1) b1.onclick = () => go({ limit: MAX_PRACTICE, order: 'seq', durationMin: 0 });
    const b2 = $('#mm-custom');
    if (b2) b2.onclick = () => this.practiceDialog(node, items);
  },

  /* 自定义练习题数 / 顺序 / 限时 */
  practiceDialog(node, items) {
    const max = Math.min(items.length, MAX_PRACTICE);
    const dlg = openDlg(`
      <h3 class="dlg-title">练习「${esc(node.name)}」相关题目</h3>
      <p class="dlg-text">共匹配到 <b>${items.length}</b> 道${items.length > MAX_PRACTICE ? `，一次最多练习 ${MAX_PRACTICE} 道` : ''}。</p>
      <div class="mp-form">
        <label class="field">练习题数（1 – ${max}）
          <input id="mp-count" type="number" min="1" max="${max}" value="${max}">
        </label>
        <label class="field">题目顺序
          <select id="mp-order">
            <option value="seq">固定顺序</option>
            <option value="random">随机顺序</option>
          </select>
        </label>
        <label class="field">总耗时（分钟，0 = 不限时）
          <input id="mp-duration" type="number" min="0" max="600" value="0">
        </label>
      </div>
      <div class="dlg-actions">
        <button class="btn ghost" id="mp-cancel">取消</button>
        <button class="btn primary" id="mp-go">开始练习</button>
      </div>`);

    $('#mp-cancel', dlg).onclick = closeDlg;
    $('#mp-go', dlg).onclick = () => {
      const n = Math.max(1, Math.min(max, Math.floor(+$('#mp-count', dlg).value) || max));
      const order = $('#mp-order', dlg).value;
      const durationMin = Math.max(0, Math.floor(+$('#mp-duration', dlg).value) || 0);
      closeDlg();
      Quiz.startFromMindmap(items, { label: node.name, limit: n, order, durationMin });
    };
  },
};

/* 一次练习的题目上限（防止一次卷入过多题目） */
const MAX_PRACTICE = 50;

/* 通过章节名 / 题干关键词，把知识点与题库题目关联起来 */
function relatedQuestions(nodeName) {
  const out = [];
  Store.banks().forEach(b => b.questions.forEach(q => {
    const ch = q.chapter || '';
    if ((ch && (ch.includes(nodeName) || nodeName.includes(ch))) ||
        (q.stem && q.stem.includes(nodeName))) {
      out.push({ bankId: b.id, bankName: b.name, q });
    }
  }));
  return out;
}

/* 收集某知识点可练习的题目：本级优先 → 向上级章节回溯 → 向下含子知识点 */
function collectPractice(node) {
  let items = relatedQuestions(node.name);
  if (items.length) return { items, how: '' };

  let p = node._parent;
  while (p) {
    items = relatedQuestions(p.name);
    if (items.length) return { items, how: `来自上级「${p.name}」` };
    p = p._parent;
  }

  /* 向下：本知识点及其所有子知识点，按题库顺序去重收集 */
  const names = [];
  (function walk(n) { names.push(n.name); (n.children || []).forEach(walk); })(node);
  const seen = new Set();
  items = [];
  names.forEach(nm => relatedQuestions(nm).forEach(e => {
    const key = e.bankId + '/' + e.q.id;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(e);
  }));
  return { items, how: items.length ? '含子知识点' : '' };
}

/* ---------- SVG 脑图渲染器（横向树，支持折叠 / 平移 / 缩放） ---------- */
function createMindmap(svg, tree, opts) {
  let seq = 0;
  (function init(n, parent, depth) {
    n._id = 'n' + seq++;
    n._parent = parent;
    n._depth = depth;
    if (!n.children) n.children = [];
    n.children.forEach(c => init(c, n, depth + 1));
  })(tree, null, 0);

  const state = { collapsed: new Set(), scale: 1, tx: 0, ty: 0, selected: null, drag: null };
  /* 默认只展开到「章」一级，更深层次收起 → 由广到深 */
  (function d(n) {
    if (n._depth >= 1 && n.children.length) state.collapsed.add(n._id);
    n.children.forEach(d);
  })(tree);

  const NODE_H = 38, VGAP = 12, HGAP = 64, PADX = 16;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = '13.5px "Segoe UI","Microsoft YaHei",sans-serif';
  const textW = s => ctx.measureText(String(s)).width;

  const kidsVisible = n => n.children.length > 0 && !state.collapsed.has(n._id);

  function layout() {
    (function walk(n) {
      n._w = Math.max(56, Math.min(300, textW(n.name) + PADX * 2));
      if (kidsVisible(n)) {
        n.children.forEach(walk);
        n._slot = n.children.reduce((s, c) => s + c._slot, 0) + VGAP * (n.children.length - 1);
      } else {
        n._slot = NODE_H;
      }
    })(tree);

    const maxW = {};
    (function cols(n) {
      maxW[n._depth] = Math.max(maxW[n._depth] || 0, n._w);
      if (kidsVisible(n)) n.children.forEach(cols);
    })(tree);
    const maxDepth = Math.max(...Object.keys(maxW).map(Number));
    const colX = [];
    let acc = 0;
    for (let d = 0; d <= maxDepth; d++) { colX[d] = acc; acc += (maxW[d] || 0) + HGAP; }

    (function place(n, top) {
      n._x = colX[n._depth];
      n._y = top + n._slot / 2;
      if (kidsVisible(n)) {
        let cy = top;
        n.children.forEach(c => { place(c, cy); cy += c._slot + VGAP; });
      }
    })(tree, 0);
    return { totalW: acc - HGAP, totalH: tree._slot };
  }

  function render() {
    const size = layout();
    const parts = [];

    (function links(n) {
      if (!kidsVisible(n)) return;
      n.children.forEach(c => {
        const x1 = n._x + n._w, y1 = n._y, x2 = c._x, y2 = c._y, mx = (x1 + x2) / 2;
        parts.push(`<path class="mm-link" d="M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}"/>`);
        links(c);
      });
    })(tree);

    (function nodes(n) {
      const collapsed = state.collapsed.has(n._id) && n.children.length > 0;
      parts.push(`<g class="mm-node d${Math.min(n._depth, 3)}${state.selected === n._id ? ' sel' : ''}" data-id="${n._id}" transform="translate(${n._x},${n._y})">
        <rect x="0" y="${-NODE_H / 2}" width="${n._w}" height="${NODE_H}" rx="10"/>
        <text x="${PADX}" y="1" dominant-baseline="middle">${esc(n.name)}</text>
        ${n.children.length ? `<g class="mm-toggle" transform="translate(${n._w + 13},0)">
          <circle r="8.5"/><text y="1" text-anchor="middle" dominant-baseline="middle">${collapsed ? '+' : '−'}</text>
        </g>` : ''}
      </g>`);
      if (kidsVisible(n)) n.children.forEach(nodes);
    })(tree);

    svg.innerHTML = `<g id="mm-viewport" transform="translate(${state.tx},${state.ty}) scale(${state.scale})">${parts.join('')}</g>`;
    bindNodes();
    return size;
  }

  function nodeById(id) {
    let found = null;
    (function f(n) { if (n._id === id) found = n; n.children.forEach(f); })(tree);
    return found;
  }

  function bindNodes() {
    $$('.mm-node', svg).forEach(g => {
      g.addEventListener('click', e => {
        e.stopPropagation();
        const n = nodeById(g.dataset.id);
        if (!n) return;
        state.selected = n._id;
        if (n.children.length) {
          if (state.collapsed.has(n._id)) state.collapsed.delete(n._id);
          else state.collapsed.add(n._id);
          fit();
        }
        if (opts.onSelect) opts.onSelect(n);
      });
    });
  }

  function apply() {
    const g = svg.querySelector('#mm-viewport');
    if (g) g.setAttribute('transform', `translate(${state.tx},${state.ty}) scale(${state.scale})`);
  }

  function fit() {
    const { totalW, totalH } = render();
    const vw = svg.clientWidth || 900, vh = svg.clientHeight || 600;
    state.scale = Math.max(0.3, Math.min(1.05, (vw - 70) / totalW, (vh - 70) / totalH));
    state.tx = (vw - totalW * state.scale) / 2;
    state.ty = (vh - totalH * state.scale) / 2;
    apply();
  }

  svg.addEventListener('pointerdown', e => {
    if (e.target.closest('.mm-node')) return;
    state.drag = { x: e.clientX, y: e.clientY, tx: state.tx, ty: state.ty };
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
  });
  svg.addEventListener('pointermove', e => {
    if (!state.drag) return;
    state.tx = state.drag.tx + (e.clientX - state.drag.x);
    state.ty = state.drag.ty + (e.clientY - state.drag.y);
    apply();
  });
  svg.addEventListener('pointerup', () => { state.drag = null; });
  svg.addEventListener('pointercancel', () => { state.drag = null; });
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const ns = Math.min(2.5, Math.max(0.3, state.scale * k));
    const r = ns / state.scale;
    state.tx = mx - (mx - state.tx) * r;
    state.ty = my - (my - state.ty) * r;
    state.scale = ns;
    apply();
  }, { passive: false });

  fit();

  return {
    expandAll() { state.collapsed.clear(); fit(); },
    collapseTo(depth) {
      (function c(n) {
        if (n._depth >= depth && n.children.length) state.collapsed.add(n._id);
        n.children.forEach(c);
      })(tree);
      fit();
    },
  };
}
