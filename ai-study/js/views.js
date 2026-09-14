'use strict';

/* ---------- 首页：板块化动态展示（route 预留路由变量） ---------- */
const FEATS = [
  { route: 'vocab', badge: '01 · 背单词', title: '艾宾浩斯曲线驱动的单词背诵',
    desc: '陌生、学习中、完全背诵三色标签，科学安排每一次复习。',
    bullets: ['Azure Natural 拟真人声朗读，美式 / 英式可切换',
              '自定义词库导入，自动防重复、保留学习进度',
              '学习日历与七天柱状图，进度一目了然'],
    mock: 'word' },
  { route: 'setup', badge: '02 · 刷题练习', title: '自由组卷，随堂自测',
    desc: '题库交给 AI，也交给你自己——题型、数量、限时自由搭配。',
    bullets: ['单选 / 多选 / 填空 / 简答数量自由组合',
              '章节筛选、随机顺序、限时倒计时',
              '答错自动归档，一步不错过'],
    mock: 'quiz' },
  { route: 'mindmap', badge: '03 · 总复习脑图', title: '知识框架，一眼到底',
    desc: 'Markdown 大纲一键生成交互式脑图，由广入深逐层展开。',
    bullets: ['知识点直接关联题目，点击即练',
              '展开 / 收起 / 缩放，复习节奏自己掌控',
              '与题库章节联动，学练闭环'],
    mock: 'map' },
  { route: 'wrongbook', badge: '04 · 错题本', title: '错题归集，针对性复盘',
    desc: '答错即收录，错误次数自动累计，考前重做一遍最安心。',
    bullets: ['错题自动归集，按题库溯源',
              '记录错误次数与最近错误时间',
              '一键重做全部错题，针对性训练'],
    mock: 'wrong' },
];

/* ---------- 板块动态演示 mock（纯 CSS 动画，配色全部来自现有令牌） ---------- */
function featMock(kind) {
  if (kind === 'word') return `
    <div class="mock m-word">
      <div class="mk-whead">今日 · 待复习 <span>🔊</span></div>
      <div class="mk-wstack">
        <div class="mk-word" style="--i:0"><b>abandon</b><span>/əˈbændən/ 放弃</span></div>
        <div class="mk-word" style="--i:1"><b>ephemeral</b><span>/ɪˈfemərəl/ 短暂的</span></div>
        <div class="mk-word" style="--i:2"><b>zenith</b><span>/ˈzenɪθ/ 顶点</span></div>
      </div>
      <div class="mk-btns"><i class="ok">认识</i><i class="no">不认识</i></div>
    </div>`;
  if (kind === 'quiz') return `
    <div class="mock m-quiz">
      <div class="mk-line w70"></div>
      <div class="mk-opt o1"><b>A</b><i class="w50"></i></div>
      <div class="mk-opt o2"><b>B</b><i class="w40"></i></div>
      <div class="mk-opt o3"><b>C</b><i class="w55"></i></div>
    </div>`;
  if (kind === 'map') return `
    <div class="mock m-map">
      <div class="mk-root">课程</div>
      <div class="mk-branches">
        <span>第一章</span><span>第二章</span><span>第三章</span>
      </div>
    </div>`;
  if (kind === 'wrong') return `
    <div class="mock m-wrong">
      <div class="mk-wrow" style="--i:0"><i>✗</i><u class="w55"></u><b>错 2 次</b></div>
      <div class="mk-wrow" style="--i:1"><i>✗</i><u class="w40"></u><b>错 1 次</b></div>
      <div class="mk-wrow" style="--i:2"><i>✗</i><u class="w48"></u><b>错 1 次</b></div>
      <div class="mk-redo">↻ 重做全部错题</div>
    </div>`;
  return '';
}

function featSection(f, i) {
  return `
  <section class="feat${i % 2 === 1 ? ' flip' : ''}" data-route="${f.route}" role="button" tabindex="0" aria-label="前往${esc(f.title)}">
    <div class="feat-text">
      <span class="pill-badge">${esc(f.badge)}</span>
      <h3 class="feat-title">${esc(f.title)}</h3>
      <p class="feat-desc">${esc(f.desc)}</p>
      <ul class="feat-list">${f.bullets.map(b => `<li><i></i><span>${esc(b)}</span></li>`).join('')}</ul>
      <button class="feat-link">前往使用 →</button>
    </div>
    <div class="feat-visual">
      <div class="feat-blob b${i % 3}"></div>
      <div class="feat-mock">${featMock(f.mock)}</div>
    </div>
  </section>`;
}

/* ---------- 今日背单词：三词轮盘（上=已展示 / 中=展示中 / 下=待展示） ---------- */
let reelTimer = null;
function hwReelStop() {
  if (reelTimer) { clearInterval(reelTimer); reelTimer = null; }
}
function hwReelStart(words) {
  hwReelStop();
  const box = $('#hw-reel');
  if (!box || words.length < 3) return; /* 词数不足三张轮盘时静态展示，不轮换 */
  let idx = 0;
  const n = words.length;
  const slot = (w, cls) => w ? `<div class="mk-word ${cls}"><b>${esc(w.word)}</b><span>${esc(w.meaning || '')}</span></div>` : '';
  const paint = () => {
    box.innerHTML =
      slot(words[(idx - 1 + n) % n], 'is-prev') +
      slot(words[idx], 'is-cur') +
      slot(words[(idx + 1) % n], 'is-next');
  };
  paint();
  reelTimer = setInterval(() => { idx = (idx + 1) % n; paint(); }, 3000);
}

function renderHome() {
  const banks = Store.banks();
  const outlines = Store.outlines();
  const folderName = Store.data.activeFolder === '__all__' ? '全部课程' : Store.folderName(Store.data.activeFolder);
  const vocabCount = Object.keys(Store.data.vocab.words).length;
  const today = Store.getToday();
  const pct = Math.min(100, Math.round(today.done / today.goal * 100));
  const allWords = Object.values(Store.data.vocab.words);

  $('#main').innerHTML = `
    <section class="hero2">
      <div class="hero2-l">
        <h1>学、练、背，<br>一个平台完成</h1>
        <p>当前课程「<b>${esc(folderName)}</b>」：题库 <b>${banks.length}</b> · 大纲 <b>${outlines.length}</b> · 单词 <b>${vocabCount}</b>。<br>所有数据保存在本机浏览器中，随时备份迁移。</p>
        <div class="hero2-actions glass-group">
          <button class="btn primary lg" id="h-vocab">背单词</button>
          <button class="btn lg" id="h-data">导入数据</button>
        </div>
      </div>
      <div class="hero2-r">
        <div class="feat-blob b0"></div>
        <div class="hw-card">
          <div class="hw-head"><b>今日 · 背单词</b><span class="vtag t-new">${esc(folderName)}</span></div>
          <div class="hw-goal">
            <div class="hw-goal-row"><span>今日目标</span><span><b>${today.done}</b> / ${today.goal} 词</span></div>
            <div class="pg-bar"><div class="pg-fill" style="width:${pct}%"></div></div>
          </div>
          <div class="hw-words hw-reel" id="hw-reel">${allWords.length ? '' : '<p class="muted">词库还是空的——去「数据管理」导入词库试试</p>'}</div>
        </div>
      </div>
    </section>

    <div class="home-sects">
      <div class="home-sects-head">
        <h2>五大板块，覆盖学习闭环</h2>
        <p>每个板块独立可用、数据互联互通；点击卡片任意位置直达。</p>
      </div>
      ${FEATS.map((f, i) => featSection(f, i)).join('')}
    </div>

    <details class="card help">
      <summary>📖 规则说明</summary>
      <ul>
        <li><b>课程文件夹</b>：顶栏切换；刷题、总复习、错题本都只使用该文件夹内的题库与大纲。</li>
        <li><b>刷题</b>：自由组卷、限时可选；答错自动进错题本。</li>
        <li><b>背单词</b>：艾宾浩斯曲线安排复习；Azure Natural 语音朗读。</li>
        <li><b>数据</b>：全部保存在本机浏览器，支持一键备份迁移。</li>
      </ul>
    </details>`;

  $('#h-vocab').onclick = () => App.showView('vocab');
  $('#h-data').onclick = () => App.showView('data');

  /* 今日背单词轮盘：进入首页启动；词数不足三槽时静态展示 */
  hwReelStart(allWords);

  /* 板块卡片：整卡可点（路由变量 data-route），回车触发 */
  $$('.feat').forEach(card => {
    const go = () => App.showView(card.dataset.route);
    card.addEventListener('click', go);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
    /* 链接按钮不重复触发整卡跳转 */
    card.querySelector('.feat-link').addEventListener('click', e => e.stopPropagation());
  });

  /* 板块"由远及近"飞入：滚入视野时触发一次 */
  const revealEls = document.querySelectorAll('.home-sects-head, .feat');
  if ('IntersectionObserver' in window) {
    const ob = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in-view'); ob.unobserve(en.target); }
    }), { threshold: 0.18 });
    revealEls.forEach(el => ob.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in-view'));
  }
}

/* ---------- 错题本 ---------- */
const Wrongbook = {
  render() {
    const list = Store.wrongbook();
    if (!list.length) {
      $('#main').innerHTML = `<h2 class="page-title">错题本</h2>` +
        emptyState(Store.data.wrongbook.length ? '当前文件夹内没有错题，切换到「全部课程」可查看其他错题。' : '错题本是空的，先去刷几道题吧！', '去刷题', "App.showView('setup')");
      return;
    }

    $('#main').innerHTML = `
      <h2 class="page-title">错题本（${list.length}）</h2>
      <div class="card">
        <div class="res-actions">
          <button class="btn primary" id="wb-redo">重做全部错题（${list.length} 题，不限时）</button>
          <button class="btn ghost danger-text" id="wb-clear">清空错题本</button>
        </div>
        <div id="wb-list"></div>
      </div>`;

    $('#wb-redo').onclick = () => {
      const paper = list.map(e => {
        const q = JSON.parse(JSON.stringify(e.q));
        q._wbKey = e.key;
        return q;
      });
      Quiz.startQuiz(paper, { durationMin: 0 }, 'wrong');
    };
    $('#wb-clear').onclick = async () => {
      if (await confirmDlg('清空错题本？', '所有错题记录将被删除，且无法恢复。', true)) {
        Store.data.wrongbook = [];
        Store.save();
        Wrongbook.render();
        toast('错题本已清空', 'ok');
      }
    };

    /* 长列表懒加载：首屏 60 行，滚动到底自动追加 */
    const rowHtml = e => `
            <details class="res-item wrong">
              <summary>
                <span class="res-ico">❌</span>
                <span class="badge b-${e.q.type}">${TYPE_LABEL[e.q.type]}</span>
                <span class="res-stem">${esc(truncate(e.q.stem, 40))}</span>
                <span class="muted">错 ${e.wrongCount} 次</span>
              </summary>
              <div class="res-body">
                <p><b>题干：</b>${esc(e.q.stem)}</p>
                ${e.q.type === 'short'
                  ? `<p><b>参考答案：</b>${esc(e.q.refAnswer || '—')}</p>`
                  : e.q.type === 'fill'
                    ? `<p><b>正确答案：</b>${esc(answerText(e.q))}</p>`
                    : `<p><b>正确答案：</b>${letters(e.q)}</p>`}
                ${e.q.note ? `<p><b>📝 注释：</b>${esc(e.q.note)}</p>` : ''}
                <p class="muted">来自 ${esc(e.bankName || '题库')} · 最近错误 ${fmtDate(e.lastWrong)}</p>
                <button class="btn ghost sm wb-remove" data-key="${esc(e.key)}">从错题本移除</button>
              </div>
            </details>`;
    LazyList.create(list.map(rowHtml), $('#wb-list'), () => {
      $$('.wb-remove').forEach(b => b.onclick = () => {
        Store.removeWrong(b.dataset.key);
        Store.save();
        Wrongbook.render();
      });
    });
  },
};

/* ---------- 数据管理 ---------- */
const DataMan = {
  render() {
    const banks = Store.data.banks;
    const outlines = Store.data.outlines;
    const folders = Store.data.folders;

    $('#main').innerHTML = `
      <h2 class="page-title">数据管理</h2>
      <p class="muted page-sub">所有数据保存在本机浏览器的本地存储中，导入一次后每次打开自动加载，无需重复导入。新导入的数据存入下方选定的目标文件夹。</p>

      <div class="card">
        <h3 class="card-title">📁 课程文件夹（${folders.length}）</h3>
        <p class="muted">按课程分类管理题库与大纲；顶栏选择文件夹后，刷题 / 复习 / 错题本都只使用该文件夹内的数据。</p>
        <div class="res-list">${folders.map(f => {
          const nb = banks.filter(b => b.folderId === f.id).length;
          const no = outlines.filter(o => o.folderId === f.id).length;
          return `<div class="ds-row">
            <div>
              <b>📁 ${esc(f.name)}</b>
              <span class="muted ds-meta">${nb} 个题库 · ${no} 个大纲</span>
            </div>
            <div class="row">
              <button class="btn ghost sm fl-rename" data-id="${f.id}">重命名</button>
              <button class="btn ghost sm fl-del" data-id="${f.id}"${folders.length <= 1 ? ' disabled' : ''}>删除</button>
            </div>
          </div>`;
        }).join('')}</div>
        <div class="row">
          <input type="text" id="fl-new-name" placeholder="新文件夹名称（如：高等数学）" style="flex:1;max-width:280px">
          <button class="btn primary" id="fl-new">➕ 新建文件夹</button>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">📦 导入文件（自动识别脑图 / 题库）</h3>
        <p class="muted">一次选择 IceNote 生成的 <code>_mindmap.md</code> + <code>_quiz.json</code> 文件对（也支持单独导入或混选多个文件），自动识别类型并存入目标文件夹。</p>
        <div class="form-grid">
          <label class="field">目标文件夹
            <select id="im-folder">${folders.map(f =>
              `<option value="${f.id}"${f.id === Store.data.activeFolder ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
          </label>
        </div>
        <input type="file" id="pair-file" accept=".md,.markdown,.txt,.json" multiple>
        <div class="row" style="margin-top:10px">
          <button class="btn primary" id="pair-import">导入所选文件</button>
        </div>
        <p class="muted" id="pair-result"></p>
      </div>

      <div class="card">
        <h3 class="card-title">🧠 第三方 AI 生成文件提示词</h3>
        <p class="muted">把提示词复制/下载后发给任意第三方 AI（Kimi、ChatGPT、豆包等），AI 会按平台固定格式产出<b>可直接导入</b>的文件。把提示词末尾的「素材」替换成你的笔记/教材内容即可。提示词文本也存放在平台目录的「提示词」文件夹中。</p>
        ${Object.keys(PROMPTS).map(k => `
        <div class="ds-row">
          <div><b>${esc(PROMPTS[k].title)}</b></div>
          <div class="row" style="margin-top:0">
            <button class="btn ghost sm pr-copy" data-key="${k}">📋 复制提示词</button>
            <button class="btn ghost sm pr-dl" data-key="${k}">⬇ 下载 .txt</button>
          </div>
        </div>`).join('')}
      </div>

      <div class="card">
        <h3 class="card-title">📚 题库（${banks.length}）</h3>
        ${banks.length ? `<div class="res-list">${banks.map(b => `
          <div class="ds-row">
            <div>
              <b>${esc(b.name)}</b>
              <span class="src-tag ${b.source === 'built-in' ? 'bi' : 'im'}">${b.source === 'built-in' ? '内置示例' : b.source === 'ai' ? 'AI生成' : '导入'}</span>
              <span class="src-tag fl">${esc(Store.folderName(b.folderId))}</span>
              <div class="muted ds-meta">
                ${b.questions.filter(q => q.type === 'single').length} 单选 ·
                ${b.questions.filter(q => q.type === 'multi').length} 多选 ·
                ${b.questions.filter(q => q.type === 'fill').length} 填空 ·
                ${b.questions.filter(q => q.type === 'short').length} 简答 · ${fmtDate(b.importedAt)}
              </div>
            </div>
            <button class="btn ghost sm ds-del" data-id="${b.id}">删除</button>
          </div>`).join('')}</div>` : '<p class="muted">暂无题库</p>'}
        <details class="import-box">
          <summary>➕ 导入题库（JSON 文件或粘贴）</summary>
          <div class="import-body">
            <input type="file" id="bank-file" accept=".json,application/json">
            <textarea id="bank-paste" rows="6" placeholder='或在此粘贴题库 JSON：{"name":"课程名","questions":[...]}'></textarea>
            <div class="row">
              <button class="btn primary" id="bank-import">导入题库</button>
              <button class="btn ghost" id="bank-tpl">下载 JSON 模板</button>
            </div>
            <p class="muted">每题字段：type（single / multi / fill / short，或中文 单选 / 多选 / 填空 / 简答）、stem 题干、options 选项数组、answer 答案、note 注释或解析、chapter 章节；填空题在题干中用 ＿＿＿ 或 ___ 表示空位、answer 给出每个空的答案（数组），没有占位符时按逐空列表作答；简答题可加 refAnswer 参考答案与 keywords 关键词（数组），缺省时系统会自动从参考答案中提取关键词。</p>
          </div>
        </details>
      </div>

      <div class="card">
        <h3 class="card-title">🧠 知识点大纲（${outlines.length}）</h3>
        ${outlines.length ? `<div class="res-list">${outlines.map(o => `
          <div class="ds-row">
            <div>
              <b>${esc(o.name)}</b>
              <span class="src-tag ${o.source === 'built-in' ? 'bi' : 'im'}">${o.source === 'built-in' ? '内置示例' : o.source === 'ai' ? 'AI生成' : '导入'}</span>
              <span class="src-tag fl">${esc(Store.folderName(o.folderId))}</span>
              <div class="muted ds-meta">${countNodes(o.tree) - 1} 个知识点 · ${fmtDate(o.importedAt)}</div>
            </div>
            <button class="btn ghost sm ol-del" data-id="${o.id}">删除</button>
          </div>`).join('')}</div>` : '<p class="muted">暂无大纲</p>'}
        <details class="import-box">
          <summary>➕ 导入知识点大纲（Markdown 文件或粘贴）</summary>
          <div class="import-body">
            <input type="file" id="ol-file" accept=".md,.markdown,.txt">
            <textarea id="ol-paste" rows="6" placeholder="或在此粘贴 Markdown 大纲：# 课程 → ## 章 → ### 节 → - 知识点：说明"></textarea>
            <div class="row">
              <button class="btn primary" id="ol-import">导入大纲</button>
              <button class="btn ghost" id="ol-tpl">下载 Markdown 模板</button>
            </div>
            <p class="muted">用 # 层级表示章节层级，用 - 列表表示知识点；「知识点：说明」冒号后的文字将作为脑图中的知识点说明。</p>
          </div>
        </details>
      </div>

      <div class="card">
        <h3 class="card-title">💾 备份与恢复</h3>
        <div class="row">
          <button class="btn" id="bk-export">导出全部数据</button>
          <label class="btn ghost" for="bk-file">导入备份</label>
          <input type="file" id="bk-file" accept=".json" style="display:none">
          <button class="btn ghost" id="bk-sample">恢复内置示例</button>
          <button class="btn danger" id="bk-clear">清空全部数据</button>
        </div>
        <p class="muted">导出的备份包含全部文件夹、题库、大纲与错题本，可在其他电脑上导入还原。</p>
      </div>`;

    this.bind();
  },

  bind() {
    /* ---- 第三方 AI 提示词：复制 / 下载 ---- */
    const fallbackCopy = (text, done) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请用「下载 .txt」按钮', 'error'); }
      ta.remove();
    };
    $$('.pr-copy').forEach(b => b.onclick = () => {
      const text = PROMPTS[b.dataset.key].text;
      const done = () => toast('提示词已复制，去粘贴给任意 AI 即可', 'ok');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
      } else {
        fallbackCopy(text, done);
      }
    });
    $$('.pr-dl').forEach(b => b.onclick = () => {
      const p = PROMPTS[b.dataset.key];
      download(p.file, p.text);
    });

    /* ---- 文件夹管理 ---- */
    $('#fl-new').onclick = () => {
      const name = $('#fl-new-name').value.trim();
      if (!name) return toast('请输入文件夹名称', 'error');
      if (Store.data.folders.some(f => f.name === name)) return toast('已存在同名文件夹', 'error');
      Store.data.folders.push({ id: uid('fl'), name, createdAt: Date.now() });
      Store.save();
      renderFolderBar();
      this.render();
      toast(`文件夹「${name}」已创建`, 'ok');
    };
    $('#fl-new-name').onkeydown = e => { if (e.key === 'Enter') $('#fl-new').click(); };

    $$('.fl-rename').forEach(b => b.onclick = async () => {
      const f = Store.data.folders.find(x => x.id === b.dataset.id);
      if (!f) return;
      const dlg = openDlg(`
        <h3 class="dlg-title">重命名文件夹</h3>
        <div class="mp-form">
          <label class="field">名称
            <input id="fl-rename-input" value="${esc(f.name)}">
          </label>
        </div>
        <div class="dlg-actions">
          <button class="btn ghost" id="fl-rename-cancel">取消</button>
          <button class="btn primary" id="fl-rename-ok">保存</button>
        </div>`);
      $('#fl-rename-cancel', dlg).onclick = closeDlg;
      $('#fl-rename-ok', dlg).onclick = () => {
        const name = $('#fl-rename-input', dlg).value.trim();
        if (!name) return toast('名称不能为空', 'error');
        f.name = name;
        Store.save();
        renderFolderBar();
        closeDlg();
        this.render();
        toast('已重命名为「' + name + '」', 'ok');
      };
    });

    $$('.fl-del').forEach(b => b.onclick = async () => {
      const f = Store.data.folders.find(x => x.id === b.dataset.id);
      if (!f) return;
      const nb = Store.data.banks.filter(x => x.folderId === f.id).length;
      const no = Store.data.outlines.filter(x => x.folderId === f.id).length;
      const hasData = nb + no > 0;
      const others = Store.data.folders.filter(x => x.id !== f.id);
      const dlg = openDlg(`
        <h3 class="dlg-title">删除文件夹「${esc(f.name)}」？</h3>
        <p class="dlg-text">${hasData
          ? `该文件夹内还有 <b>${nb}</b> 个题库、<b>${no}</b> 个大纲。`
          : '该文件夹是空的。'}</p>
        ${hasData && others.length ? `<p class="dlg-text">其中数据将移动到：<select id="fl-move-target">${others.map(o =>
          `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></p>` : ''}
        <div class="dlg-actions">
          <button class="btn ghost" id="fl-del-cancel">取消</button>
          <button class="btn danger" id="fl-del-ok">删除</button>
        </div>`);
      $('#fl-del-cancel', dlg).onclick = closeDlg;
      $('#fl-del-ok', dlg).onclick = () => {
        const target = $('#fl-move-target', dlg) ? $('#fl-move-target', dlg).value : null;
        Store.data.banks.forEach(x => { if (x.folderId === f.id && target) x.folderId = target; });
        Store.data.outlines.forEach(x => { if (x.folderId === f.id && target) x.folderId = target; });
        if (hasData && !target) {
          Store.data.banks = Store.data.banks.filter(x => x.folderId !== f.id);
          Store.data.outlines = Store.data.outlines.filter(x => x.folderId !== f.id);
        }
        Store.data.folders = Store.data.folders.filter(x => x.id !== f.id);
        if (Store.data.activeFolder === f.id || Store.data.activeFolder === '__all__') {
          Store.data.activeFolder = Store.data.folders[0].id;
        }
        Quiz._selBank = null;
        Mindmap.outlineId = null;
        Store.save();
        renderFolderBar();
        closeDlg();
        this.render();
        toast('文件夹已删除', 'ok');
      };
    });

    /* ---- 文件对导入（自动识别 md/json） ---- */
    $('#pair-import').onclick = () => {
      const files = Array.from($('#pair-file').files || []);
      if (!files.length) return toast('请先选择文件（可多选 .md 和 .json）', 'error');
      const fid = $('#im-folder').value;
      const results = [], failed = [];
      let remaining = files.length;
      files.forEach(f => {
        const r = new FileReader();
        r.onload = () => {
          const text = String(r.result);
          try {
            if (/\.json$/i.test(f.name)) {
              results.push('✅ 题库「' + this.importBank(text, fid) + '」');
            } else {
              results.push('✅ 大纲「' + this.importOutline(text, f.name.replace(/\.[^.]+$/, ''), fid) + '」');
            }
          } catch (e) {
            failed.push('⚠️ ' + f.name + '：' + e.message);
          }
          if (--remaining === 0) {
            const msg = results.concat(failed).join('<br>') || '没有导入任何文件';
            if (results.length) {
              toast(`已导入 ${results.length} 个文件到「${Store.folderName(fid)}」`, 'ok');
              renderFolderBar();
            }
            this.render();
            const el = $('#pair-result');
            if (el) el.innerHTML = msg;
          }
        };
        r.readAsText(f, 'utf-8');
      });
    };

    $$('.ds-del').forEach(b => b.onclick = async () => {
      const bank = Store.data.banks.find(x => x.id === b.dataset.id);
      if (!bank) return;
      if (await confirmDlg('删除题库？', `「${esc(bank.name)}」将被删除（错题本中的记录会保留）。`, true)) {
        if (bank.source === 'built-in') Store.data.flags.sampleBankRemoved = true;
        Store.data.banks = Store.data.banks.filter(x => x.id !== b.dataset.id);
        if (Quiz._selBank === bank.id) Quiz._selBank = null;
        Store.save();
        this.render();
        toast('题库已删除', 'ok');
      }
    });

    $$('.ol-del').forEach(b => b.onclick = async () => {
      const ol = Store.data.outlines.find(x => x.id === b.dataset.id);
      if (!ol) return;
      if (await confirmDlg('删除大纲？', `「${esc(ol.name)}」将被删除。`, true)) {
        if (ol.source === 'built-in') Store.data.flags.sampleOutlineRemoved = true;
        Store.data.outlines = Store.data.outlines.filter(x => x.id !== b.dataset.id);
        if (Mindmap.outlineId === ol.id) Mindmap.outlineId = null;
        Store.save();
        this.render();
        toast('大纲已删除', 'ok');
      }
    });

    $('#bank-import').onclick = () => {
      const fid = $('#im-folder') ? $('#im-folder').value : Store.data.activeFolder;
      const f = $('#bank-file').files[0];
      if (f) {
        const r = new FileReader();
        r.onload = () => {
          try {
            const name = this.importBank(String(r.result), fid);
            toast(`导入成功：${name}（已永久保存）`, 'ok');
            this.render();
          } catch (e) {
            toast('导入失败：' + e.message, 'error');
          }
        };
        r.readAsText(f, 'utf-8');
      } else if ($('#bank-paste').value.trim()) {
        try {
          const name = this.importBank($('#bank-paste').value, fid);
          toast(`导入成功：${name}（已永久保存）`, 'ok');
          this.render();
        } catch (e) {
          toast('导入失败：' + e.message, 'error');
        }
      } else {
        toast('请选择文件或粘贴 JSON', 'error');
      }
    };
    $('#bank-tpl').onclick = () => download('题库JSON模板.json', BANK_TEMPLATE);

    $('#ol-import').onclick = () => {
      const fid = $('#im-folder') ? $('#im-folder').value : Store.data.activeFolder;
      const doImport = (text, fileName) => {
        try {
          const name = this.importOutline(text, fileName, fid);
          toast(`导入成功：${name}（已永久保存）`, 'ok');
          this.render();
        } catch (e) {
          toast('导入失败：' + e.message, 'error');
        }
      };
      const f = $('#ol-file').files[0];
      if (f) {
        const r = new FileReader();
        r.onload = () => doImport(String(r.result), f.name.replace(/\.[^.]+$/, ''));
        r.readAsText(f, 'utf-8');
      } else if ($('#ol-paste').value.trim()) {
        doImport($('#ol-paste').value, '');
      } else {
        toast('请选择文件或粘贴 Markdown', 'error');
      }
    };
    $('#ol-tpl').onclick = () => download('知识点大纲模板.md', OUTLINE_TEMPLATE);

    /* ---- 备份与恢复 ---- */
    $('#bk-export').onclick = () =>
      download(`AI学习一体化平台备份-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(Store.data));

    $('#bk-file').onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(String(r.result));
          if (!d || !Array.isArray(d.banks) || !Array.isArray(d.outlines)) throw new Error('不是有效的备份文件');
          if (!Array.isArray(d.wrongbook)) d.wrongbook = [];
          if (!d.flags || typeof d.flags !== 'object') d.flags = {};
          delete d.background;
          Store.data = d;
          Store.migrateFolders();
          Store.save();
          renderFolderBar();
          Quiz._selBank = null;
          Mindmap.outlineId = null;
          toast('备份导入成功', 'ok');
          this.render();
        } catch (err) {
          toast('导入失败：' + err.message, 'error');
        }
      };
      r.readAsText(f, 'utf-8');
    };

    $('#bk-sample').onclick = () => {
      Store.data.flags.sampleBankRemoved = false;
      Store.data.flags.sampleOutlineRemoved = false;
      Store.ensureSample();
      Store.save();
      renderFolderBar();
      this.render();
      toast('已恢复内置示例', 'ok');
    };

    $('#bk-clear').onclick = async () => {
      if (await confirmDlg('清空全部数据？', '所有文件夹、题库、大纲、错题记录都将被删除，且无法恢复。建议先导出备份。', true)) {
        Store.data = { banks: [], outlines: [], wrongbook: [], flags: { sampleBankRemoved: true, sampleOutlineRemoved: true } };
        Store.migrateFolders();
        Store.save();
        renderFolderBar();
        Quiz._selBank = null;
        Mindmap.outlineId = null;
        this.render();
        toast('已清空全部数据', 'ok');
      }
    };
  },

  importBank(text, folderId) {
    const { name, questions } = parseBankJSON(text);
    if (!questions.length) throw new Error('题库中没有任何题目');
    Store.data.banks.push({ id: uid('bank'), name, source: 'import', importedAt: Date.now(), folderId, questions });
    Store.save();
    return name;
  },

  importOutline(text, fileName, folderId) {
    const tree = parseOutlineMarkdown(text);
    const total = countNodes(tree) - 1;
    if (total <= 0) throw new Error('没有解析到任何知识点');
    const name = (tree.name !== '知识框架' && tree.name) ||
      (tree.children[0] && tree.children[0].name) || fileName || '知识大纲';
    Store.data.outlines.push({ id: uid('ol'), name, source: 'import', importedAt: Date.now(), folderId, tree });
    Store.save();
    return name;
  },
};
