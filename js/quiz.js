'use strict';

/* ---------- 刷题模块：自由组卷 → 作答 → 结果报告 ---------- */

const Quiz = {
  active: false,
  mode: 'paper',          // paper 正常组卷 | wrong 错题重做
  paper: [],
  idx: 0,
  cfg: null,
  timerId: null,
  startAt: 0,
  endAt: 0,

  /* ============ 组卷页 ============ */
  renderSetup() {
    const banks = Store.banks();
    if (!banks.length) {
      $('#main').innerHTML = `<h2 class="page-title">自由组卷</h2>` +
        emptyState('还没有题库，请先到「数据管理」导入题库（JSON），导入一次即永久保存', '去导入题库', "App.showView('data')");
      return;
    }
    if (!this._selBank || !banks.some(b => b.id === this._selBank)) this._selBank = banks[0].id;

    $('#main').innerHTML = `
      <h2 class="page-title">自由组卷</h2>
      <div class="card">
        <div class="form-grid">
          <label class="field">题库
            <select id="su-bank">${banks.map(b =>
              `<option value="${b.id}"${b.id === this._selBank ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
          </label>
          <label class="field">章节范围
            <select id="su-chapter"></select>
          </label>
          <label class="field">题目顺序
            <select id="su-order">
              <option value="random">随机顺序</option>
              <option value="seq">固定顺序</option>
            </select>
          </label>
          <label class="field">总耗时（分钟，0 = 不限时）
            <input id="su-duration" type="number" min="0" max="600" value="15">
          </label>
        </div>
      </div>
      <div class="card">
        <h3 class="card-title">题型数量搭配</h3>
        <div id="su-steppers"></div>
        <div class="su-total">本次共 <b id="su-total">0</b> 题</div>
        <button class="btn primary lg" id="su-start">开始刷题</button>
      </div>`;

    $('#su-bank').onchange = e => { this._selBank = e.target.value; this._counts = null; this.renderSetup(); };
    $('#su-start').onclick = () => this.startFromSetup();
    this.fillChapters();
    this.renderSteppers();
  },

  bank() { return Store.data.banks.find(b => b.id === this._selBank); },

  fillChapters() {
    const bank = this.bank();
    const chapters = [...new Set(bank.questions.map(q => q.chapter).filter(Boolean))];
    const sel = $('#su-chapter');
    sel.innerHTML = `<option value="__all__" selected>全部章节</option>` +
      chapters.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    sel.onchange = () => { this._counts = null; this.renderSteppers(); };
  },

  pool() {
    const bank = this.bank();
    if (!bank) return [];
    const ch = $('#su-chapter') ? $('#su-chapter').value : '__all__';
    return ch === '__all__' ? bank.questions.slice() : bank.questions.filter(q => q.chapter === ch);
  },

  counts() {
    const c = { single: 0, multi: 0, fill: 0, short: 0 };
    this.pool().forEach(q => c[q.type]++);
    return c;
  },

  renderSteppers() {
    const avail = this.counts();
    if (!this._counts) {
      this._counts = {
        single: Math.min(5, avail.single),
        multi: Math.min(3, avail.multi),
        fill: Math.min(3, avail.fill),
        short: Math.min(2, avail.short),
      };
    }
    QUIZ_TYPES.forEach(t => { this._counts[t] = Math.min(this._counts[t] || 0, avail[t]); });

    $('#su-steppers').innerHTML = QUIZ_TYPES.map(t => `
      <div class="stepper-row">
        <span class="badge b-${t}">${TYPE_LABEL[t]}</span>
        <div class="stepper">
          <button data-t="${t}" data-d="-1"${this._counts[t] <= 0 ? ' disabled' : ''}>−</button>
          <b>${this._counts[t]}</b>
          <button data-t="${t}" data-d="1"${this._counts[t] >= avail[t] ? ' disabled' : ''}>＋</button>
        </div>
        <span class="muted">可用 ${avail[t]} 题</span>
      </div>`).join('');

    $$('#su-steppers button').forEach(b => b.onclick = () => {
      const t = b.dataset.t, d = +b.dataset.d;
      this._counts[t] = Math.max(0, Math.min(avail[t], this._counts[t] + d));
      this.renderSteppers();
    });
    $('#su-total').textContent = QUIZ_TYPES.reduce((s, t) => s + this._counts[t], 0);
  },

  startFromSetup() {
    const counts = this._counts;
    const total = QUIZ_TYPES.reduce((s, t) => s + counts[t], 0);
    if (total === 0) return toast('请至少选择一道题', 'error');
    const order = $('#su-order').value;
    const durationMin = Math.max(0, Math.floor(+$('#su-duration').value) || 0);
    const chapter = $('#su-chapter').value;
    const bank = this.bank();
    const paper = this.buildPaper(bank, chapter, counts, order);
    if (!paper.length) return toast('当前筛选条件下没有可用题目', 'error');
    this.startQuiz(paper, { bankId: bank.id, chapter, counts, order, durationMin });
  },

  buildPaper(bank, chapter, counts, order) {
    const pick = type => {
      let pool = bank.questions.filter(q => q.type === type && (chapter === '__all__' || q.chapter === chapter));
      if (order === 'random') pool = shuffle(pool);
      return pool.slice(0, counts[type]);
    };
    return [...pick('single'), ...pick('multi'), ...pick('fill'), ...pick('short')];
  },

  /* 从脑图知识点直接开练：题目可能来自多个题库，逐题记住所属题库 */
  startFromMindmap(entries, opts = {}) {
    if (!entries || !entries.length) return toast('这个知识点没有可用题目', 'error');
    let list = entries.slice();
    if (opts.order === 'random') list = shuffle(list);
    const limit = opts.limit > 0 ? Math.min(opts.limit, list.length) : list.length;
    list = list.slice(0, limit);
    if (entries.length > limit) toast(`题目较多，本次练习前 ${limit} 道`, 'info');

    const cfg = {
      from: 'mindmap',
      label: opts.label || '',
      entries,                                  // 「再来一套」时复用
      limit,
      order: opts.order || 'seq',
      durationMin: Math.max(0, Math.floor(opts.durationMin) || 0),
      bankId: list[0].bankId,                   // 兜底：单题库场景
      chapter: '__all__',
      counts: null,
    };
    this.startQuiz(list.map(e => e.q), cfg, 'paper', list.map(e => e.bankId));
  },

  /* ============ 答题 ============ */
  startQuiz(paper, cfg, mode = 'paper', bankIds = null) {
    this.paper = paper.map((q, i) => ({
      q, status: 'active', result: null, attempts: 0, wrongPicks: [],
      picked: [], userAnswer: '', viewedHint: false, detail: null, ratio: 0, unanswered: false,
      _bankId: bankIds ? bankIds[i] : null,
    }));
    this.idx = 0;
    this.cfg = cfg;
    this.mode = mode;
    this.active = true;
    this.startAt = Date.now();
    this.endAt = cfg.durationMin > 0 ? this.startAt + cfg.durationMin * 60000 : 0;
    clearInterval(this.timerId);
    this.timerId = setInterval(() => this.tick(), 500);
    App.showView('runner');
  },

  abort() {
    this.active = false;
    clearInterval(this.timerId);
  },

  renderRunner() {
    $('#main').innerHTML = `
      <h2 class="page-title">刷题进行中</h2>
      <div class="card runner-top">
        <button class="btn ghost sm" id="q-quit">✕ 退出</button>
        <div class="q-progress">第 <b id="q-cur">1</b> / ${this.paper.length} 题</div>
        ${this.cfg && this.cfg.from === 'mindmap'
          ? `<span class="q-src" title="来自知识脑图的知识点练习">🧠 ${esc(this.cfg.label || '知识点练习')}</span>` : ''}
        <div id="q-type"></div>
        <div class="timer" id="timer"></div>
      </div>
      <div class="pbar"><i id="pbar-i"></i></div>
      <div id="qcard" class="card qcard"></div>
      <div class="runner-foot">
        <button class="btn ghost" id="q-prev">← 上一题</button>
        <button class="btn primary" id="q-next">下一题 →</button>
      </div>`;

    $('#q-quit').onclick = async () => {
      if (await confirmDlg('退出本次刷题？', '退出后本次作答进度不会保存。', true)) {
        this.abort();
        App.showView(this.cfg && this.cfg.from === 'mindmap' ? 'mindmap' : 'setup');
      }
    };
    $('#q-prev').onclick = () => { if (this.idx > 0) { this.idx--; this.paint(); } };
    $('#q-next').onclick = () => {
      if (this.idx < this.paper.length - 1) { this.idx++; this.paint(); }
      else this.finish();
    };
    this.tick();
    this.paint();
  },

  tick() {
    const t = $('#timer');
    if (!t || !this.active) return;
    if (this.endAt) {
      const left = Math.round((this.endAt - Date.now()) / 1000);
      t.textContent = '剩余 ' + fmtClock(left);
      t.classList.toggle('warn', left <= 60);
      if (left <= 0) {
        toast('时间到，自动交卷', 'error');
        this.finish();
      }
    } else {
      t.textContent = '已用时 ' + fmtClock((Date.now() - this.startAt) / 1000);
    }
  },

  paint() {
    const it = this.paper[this.idx];
    $('#q-cur').textContent = this.idx + 1;
    $('#q-type').innerHTML = `<span class="badge b-${it.q.type}">${TYPE_LABEL[it.q.type]}</span>`;
    $('#pbar-i').style.width = ((this.idx + 1) / this.paper.length * 100) + '%';
    const last = this.idx === this.paper.length - 1;
    $('#q-next').textContent = last ? '交卷 ✔' : '下一题 →';
    this.renderQuestion(it);
  },

  renderQuestion(it) {
    const q = it.q;
    const head = `
      <div class="q-meta">
        <span class="badge b-${q.type}">${TYPE_LABEL[q.type]}</span>
        ${q.chapter ? `<span class="q-chapter">${esc(q.chapter)}</span>` : ''}
        ${q.type === 'short' && it.viewedHint ? '<span class="q-hinted">已查看提示</span>' : ''}
        ${it.status === 'done' ? `<span class="q-state ${it.result === 'correct' ? 'ok' : 'bad'}">${it.result === 'correct' ? '✓ 通过' : '✗ 已结束'}</span>` : ''}
      </div>
      <div class="q-stem">${esc(q.stem)}</div>`;

    if (q.type === 'single') this.renderSingle(it, head);
    else if (q.type === 'multi') this.renderMulti(it, head);
    else if (q.type === 'fill') this.renderFill(it);
    else this.renderShort(it, head);
  },

  optionBtn(q, i, cls, disabled) {
    return `<button class="opt ${cls}" data-i="${i}"${disabled ? ' disabled' : ''}>
      <span class="letter">${letter(i)}</span><span>${esc(q.options[i])}</span></button>`;
  },

  /* ---- 单选题：共 2 次机会，第一次答错震动，机会用完自动弹出注释和答案 ---- */
  renderSingle(it, head) {
    const q = it.q;
    const done = it.status === 'done';
    const opts = q.options.map((_, i) => {
      let cls = '';
      if (it.wrongPicks.includes(i)) cls = 'wrong';
      if (done && q._answerIdxs.includes(i)) cls = 'correct';
      const disabled = done || it.wrongPicks.includes(i);
      return this.optionBtn(q, i, cls, disabled);
    }).join('');

    let fb = '';
    if (done) {
      fb = it.result === 'correct'
        ? `<div class="feedback ok">回答正确 🎉${q.note ? `　<button class="link" id="q-note">查看注释</button>` : ''}</div>`
        : `<div class="feedback bad">两次机会已用完，正确答案是 <b>${letters(q)}</b>。${q.note ? `　<button class="link" id="q-note">查看注释</button>` : ''}</div>`;
    } else if (it.attempts === 1) {
      fb = `<div class="feedback bad">回答错误，还有 <b>1</b> 次机会，请重新选择</div>`;
    }

    $('#qcard').innerHTML = `${head}<div class="opts">${opts}</div><div id="q-fb">${fb}</div>`;
    if (!done) $$('#qcard .opt').forEach(b => b.onclick = () => this.pickSingle(+b.dataset.i));
    const nb = $('#q-note');
    if (nb) nb.onclick = () => openReveal(q, '');
  },

  pickSingle(i) {
    const it = this.paper[this.idx];
    const q = it.q;
    if (it.status === 'done' || it.wrongPicks.includes(i)) return;
    if (q._answerIdxs.includes(i)) {
      it.status = 'done';
      it.result = 'correct';
      it.picked = [i];
      this.renderQuestion(it);
    } else {
      it.wrongPicks.push(i);
      it.attempts++;
      shakeEl($('#qcard'));                      /* 第一次答错：界面震动 */
      if (it.attempts >= 2) {
        it.status = 'done';
        it.result = 'wrong';
        this.renderQuestion(it);
        openReveal(q, '两次机会已用完，自动公布注释与答案');
      } else {
        this.renderQuestion(it);
        toast('回答错误，还有 1 次机会', 'error');
      }
    }
  },

  /* ---- 多选题：仅 1 次机会，答错立即弹出注释和答案 ---- */
  renderMulti(it, head) {
    const q = it.q;
    const done = it.status === 'done';
    const opts = q.options.map((_, i) => {
      let cls = '';
      if (done) {
        if (q._answerIdxs.includes(i)) cls = 'correct';
        else if (it.picked.includes(i)) cls = 'wrong';
      } else if (it.picked.includes(i)) cls = 'picked';
      return this.optionBtn(q, i, cls, done);
    }).join('');

    const fb = done
      ? (it.result === 'correct'
        ? `<div class="feedback ok">回答正确 🎉${q.note ? `　<button class="link" id="q-note">查看注释</button>` : ''}</div>`
        : `<div class="feedback bad">多选题答错即公布答案，正确答案是 <b>${letters(q)}</b>。${q.note ? `　<button class="link" id="q-note">查看注释</button>` : ''}</div>`)
      : `<div class="feedback muted-fb">多选题仅有 1 次机会，点选答案后点击「提交答案」</div>`;

    $('#qcard').innerHTML = `${head}<div class="opts">${opts}</div>
      ${done ? '' : '<button class="btn primary" id="q-submit">提交答案</button>'}
      <div id="q-fb">${fb}</div>`;

    if (!done) {
      $$('#qcard .opt').forEach(b => b.onclick = () => {
        const i = +b.dataset.i;
        const at = it.picked.indexOf(i);
        if (at >= 0) it.picked.splice(at, 1); else it.picked.push(i);
        b.classList.toggle('picked');
      });
      $('#q-submit').onclick = () => this.submitMulti();
    }
    const nb = $('#q-note');
    if (nb) nb.onclick = () => openReveal(q, '');
  },

  submitMulti() {
    const it = this.paper[this.idx];
    const q = it.q;
    if (!it.picked.length) return toast('请先选择至少一个选项', 'error');
    const ok = it.picked.length === q._answerIdxs.length && it.picked.every(i => q._answerIdxs.includes(i));
    it.status = 'done';
    it.result = ok ? 'correct' : 'wrong';
    this.renderQuestion(it);
    if (!ok) openReveal(q, '多选题答错一次，自动公布注释与答案');
  },

  /* ---- 填空题：共 2 次机会，第 1 次提交标出错误空位并震动，第 2 次仍有错自动公布注释与答案 ---- */

  /* 空位判定：忽略首尾空白与多余空格，英文不区分大小写 */
  blankMatch(val, ans) {
    const n = s => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
    return n(val) === n(ans);
  },

  /* 题干带 ＿＿＿ 占位且占位数与答案数一致时，空位内嵌在题干中作答 */
  fillInline(q) {
    return !q._stemNoMarkers && /_{3,}|＿{3,}/.test(q.stem);
  },

  /* 单个空位的作答控件 / 结果展示 */
  blankSlot(it, i, done) {
    const q = it.q;
    if (!done) {
      const wrong = it.wrongPicks.includes(i);
      return `<input class="fill-blank${wrong ? ' wrong' : ''}" data-i="${i}"
        value="${esc(it.picked[i] || '')}" autocomplete="off" placeholder="填入答案">`;
    }
    const ans = q._blanks[i];
    const user = it.picked[i] || '';
    if (this.blankMatch(user, ans)) return `<span class="blank-ans ok">${esc(ans)}</span>`;
    return `<span class="blank-ans bad">${esc(user || '未填')}</span>` +
      `<span class="blank-ans arrow">→</span><span class="blank-ans ok">${esc(ans)}</span>`;
  },

  /* 填空题主体：内嵌空位（题干含 ＿＿＿）或 纯题干 + 逐空列表 */
  fillBody(it) {
    const q = it.q;
    const n = q._blankCount;

    if (this.fillInline(q)) {
      const parts = q.stem.split(/_{3,}|＿{3,}/);
      let html = '';
      parts.forEach((p, i) => {
        html += esc(p);
        if (i < n) html += this.blankSlot(it, i, it.status === 'done');
      });
      return `<div class="q-stem fill-stem">${html}</div>`;
    }

    const rows = Array.from({ length: n }, (_, i) => `
      <div class="fill-row">
        <span class="fill-no">第 ${i + 1} 空</span>
        ${this.blankSlot(it, i, it.status === 'done')}
      </div>`).join('');
    return `<div class="fill-list">${rows}</div>`;
  },

  renderFill(it) {
    const q = it.q;
    const done = it.status === 'done';
    const meta = `
      <div class="q-meta">
        <span class="badge b-${q.type}">${TYPE_LABEL[q.type]}</span>
        ${q.chapter ? `<span class="q-chapter">${esc(q.chapter)}</span>` : ''}
        ${done ? `<span class="q-state ${it.result === 'correct' ? 'ok' : 'bad'}">${it.result === 'correct' ? '✓ 通过' : '✗ 已结束'}</span>` : ''}
      </div>`;
    const stemHtml = this.fillInline(q) ? '' : `<div class="q-stem">${esc(q.stem)}</div>`;

    let fb;
    if (done) {
      fb = it.result === 'correct'
        ? `<div class="feedback ok">全部填对 🎉${q.note ? `　<button class="link" id="q-note">查看注释</button>` : ''}</div>`
        : `<div class="feedback bad">两次机会已用完，正确答案已标注在各空位上。${q.note ? `　<button class="link" id="q-note">查看注释</button>` : ''}</div>`;
    } else if (it.attempts === 1) {
      fb = `<div class="feedback bad">有 <b>${it.wrongPicks.length}</b> 个空不正确（已标红），还有 <b>1</b> 次机会</div>`;
    } else {
      fb = `<div class="feedback muted-fb">填空题共 2 次机会，填好后点击「提交答案」</div>`;
    }

    $('#qcard').innerHTML = `${meta}${stemHtml}${this.fillBody(it)}
      ${done ? '' : '<button class="btn primary" id="q-submit">提交答案</button>'}
      <div id="q-fb">${fb}</div>`;

    if (!done) $('#q-submit').onclick = () => this.submitFill();
    const nb = $('#q-note');
    if (nb) nb.onclick = () => openReveal(q, '');
  },

  submitFill() {
    const it = this.paper[this.idx];
    const q = it.q;
    const inputs = $$('#qcard .fill-blank');
    const vals = inputs.map(inp => inp.value.trim());
    if (vals.some(v => !v)) return toast('请填写所有空位后再提交', 'error');

    it.picked = vals;
    const wrongIdxs = vals.map((v, i) => (this.blankMatch(v, q._blanks[i]) ? -1 : i)).filter(i => i >= 0);

    if (!wrongIdxs.length) {
      it.status = 'done';
      it.result = 'correct';
      this.renderQuestion(it);
      return;
    }

    it.wrongPicks = [...new Set([...it.wrongPicks, ...wrongIdxs])];
    it.attempts++;
    shakeEl($('#qcard'));                      /* 第一次提交有错：界面震动 */
    if (it.attempts >= 2) {
      it.status = 'done';
      it.result = 'wrong';
      this.renderQuestion(it);
      openReveal(q, '两次机会已用完，自动公布注释与答案');
    } else {
      this.renderQuestion(it);
      toast(`有 ${wrongIdxs.length} 个空不正确，还有 1 次机会`, 'error');
    }
  },

  /* ---- 简答题：关键词即注释，作答前可自行选择是否查看 ---- */
  renderShort(it, head) {
    const q = it.q;
    const done = it.status === 'done';
    const keywords = q.keywords || [];

    let hintBlock = '';
    if (!done && keywords.length) {
      hintBlock = `
        <div class="hint-box">
          <button class="btn ghost sm" id="q-hint">${it.viewedHint ? '收起关键词提示' : '👀 查看关键词提示'}</button>
          ${it.viewedHint ? `<div class="kw-chips">${keywords.map(k => `<span class="kw">${esc(k)}</span>`).join('')}</div>
            ${q._autoKw ? '<p class="muted">关键词由系统自动提取，仅供参考。</p>' : ''}` : ''}
          <p class="muted">提示即本题答案关键词（注释），作答前可自行选择是否查看。</p>
        </div>`;
    }

    const body = done
      ? this.shortResultHtml(it)
      : `${hintBlock}
         <textarea id="short-input" rows="5" placeholder="在此输入你的回答……">${esc(it.userAnswer)}</textarea>
         <div class="row"><button class="btn primary" id="q-submit">提交回答</button></div>`;

    $('#qcard').innerHTML = `${head}${body}<div id="q-fb"></div>`;

    if (!done) {
      const hb = $('#q-hint');
      if (hb) hb.onclick = () => {
        it.viewedHint = !it.viewedHint;
        this.renderQuestion(it);
        if (it.viewedHint) toast('已查看关键词提示，本题将标记为「看过提示」');
      };
      $('#q-submit').onclick = () => this.submitShort();
    }
  },

  submitShort() {
    const it = this.paper[this.idx];
    const q = it.q;
    const val = $('#short-input').value.trim();
    if (!val) return toast('请先输入你的回答', 'error');
    it.userAnswer = val;
    it.detail = matchKeywords(val, q.keywords);
    const sc = keywordScore(it.detail);
    if (q.keywords.length) {
      it.ratio = sc.ratio;
      it.status = 'done';
      it.result = sc.ratio >= 0.6 ? 'correct' : 'wrong';
    } else {
      it.ratio = 1;   // 未配置关键词的简答题：展示参考答案供自评，流程上按通过处理
      it.status = 'done';
      it.result = 'correct';
    }
    this.renderQuestion(it);
  },

  shortResultHtml(it) {
    const q = it.q;
    const sc = keywordScore(it.detail || []);
    const noKw = !(q.keywords || []).length;
    return `
      <div class="short-result">
        ${noKw
          ? '<div class="feedback ok">本题未配置关键词，请对照参考答案与注释自评。</div>'
          : `<div class="short-ratio ${sc.ratio >= 0.6 ? 'ok' : 'bad'}">
               <b>${Math.round(sc.ratio * 100)}%</b>
               <span>关键词命中 ${sc.hits} / ${sc.total}（≥60% 达标）${sc.ratio >= 0.6 ? '　✅ 达标' : '　❌ 未达标'}</span>
             </div>
             <div class="kw-chips">${(it.detail || []).map(d =>
               `<span class="kw ${d.hit ? 'hit' : 'miss'}">${esc(d.keyword)} ${d.hit ? '✓' : '✗'}</span>`).join('')}</div>`}
        ${q.refAnswer ? `<div class="ref"><h4>📄 参考答案</h4><p>${esc(q.refAnswer)}</p></div>` : ''}
        ${q.note ? `<div class="ref"><h4>📝 注释</h4><p>${esc(q.note)}</p></div>` : ''}
        <div class="ref your"><h4>✍️ 你的回答</h4><p>${esc(it.userAnswer || '（未作答）')}</p></div>
      </div>`;
  },

  /* ============ 交卷与结果 ============ */
  finish() {
    clearInterval(this.timerId);
    this.active = false;

    this.paper.forEach(it => {
      if (it.status !== 'done') {
        it.status = 'done';
        it.result = 'wrong';
        it.unanswered = true;
        it.ratio = 0;
      }
      if (this.mode === 'paper') {
        if (it.result === 'wrong') Store.addWrong(it.q, it._bankId || this.cfg.bankId);
      } else {
        if (it.result === 'correct') Store.removeWrong(it.q._wbKey);
        else Store.bumpWrong(it.q._wbKey);
      }
    });
    Store.save();
    App.showView('result');
  },

  score() {
    let sum = 0;
    this.paper.forEach(it => {
      if (it.q.type === 'short') sum += it.ratio || 0;
      else if (it.result === 'correct') sum += 1;
    });
    return this.paper.length ? Math.round(sum / this.paper.length * 100) : 0;
  },

  renderResultView() {
    const items = this.paper;
    const score = this.score();
    const wrongItems = items.filter(it => it.result === 'wrong');
    const isMindmap = !!(this.cfg && this.cfg.from === 'mindmap');

    const perType = {};
    items.forEach(it => {
      if (!perType[it.q.type]) perType[it.q.type] = { total: 0, ok: 0 };
      perType[it.q.type].total++;
      if (it.result === 'correct') perType[it.q.type].ok++;
    });

    const r = 56, C = 2 * Math.PI * r;
    const color = score >= 80 ? '#256d3d' : score >= 60 ? '#b3791a' : '#b3402a';
    const ring = `
      <div class="score-ring">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle class="track" cx="70" cy="70" r="${r}" fill="none" stroke-width="12"/>
          <circle cx="70" cy="70" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
            stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - score / 100)}"/>
        </svg>
        <b style="color:${color}">${score}</b>
      </div>`;

    $('#main').innerHTML = `
      <h2 class="page-title">刷题报告${isMindmap && this.cfg.label ? ` · ${esc(this.cfg.label)}` : ''}</h2>
      <div class="card result-head">
        ${ring}
        <div class="result-sum">
          <p>共 ${items.length} 题，通过 ${items.length - wrongItems.length} 题。
          ${this.mode === 'paper'
            ? `错题 ${wrongItems.length} 题已加入错题本。`
            : `答对的错题已移出错题本，仍错的继续保留。`}</p>
          <table class="type-stats">
            <tr><th>题型</th><th>题数</th><th>通过</th><th>通过率</th></tr>
            ${QUIZ_TYPES.filter(t => perType[t]).map(t => `
              <tr>
                <td>${TYPE_LABEL[t]}</td>
                <td>${perType[t].total}</td>
                <td>${perType[t].ok}</td>
                <td>${Math.round(perType[t].ok / perType[t].total * 100)}%</td>
              </tr>`).join('')}
          </table>
        </div>
      </div>
      <div class="card">
        <div class="res-actions">
          ${this.mode === 'paper' ? '<button class="btn primary" id="r-again">🎲 再来一套</button>' : ''}
          ${wrongItems.length ? `<button class="btn" id="r-wrong">重做本轮错题（${wrongItems.length}）</button>` : ''}
          ${isMindmap ? '<button class="btn ghost" id="r-mindmap">🧠 返回知识脑图</button>' : ''}
          <button class="btn ghost" id="r-home">返回首页</button>
        </div>
        <h3 class="card-title">逐题回顾（点击展开）</h3>
        <div class="res-list">
          ${items.map((it, i) => `
            <details class="res-item ${it.result}">
              <summary>
                <span class="res-ico">${it.unanswered ? '⭕' : it.result === 'correct' ? '✅' : '❌'}</span>
                <span class="res-no">${i + 1}</span>
                <span class="badge b-${it.q.type}">${TYPE_LABEL[it.q.type]}</span>
                <span class="res-stem">${esc(truncate(it.q.stem, 46))}</span>
              </summary>
              <div class="res-body">
                <p><b>题干：</b>${esc(it.q.stem)}</p>
                ${it.q.type === 'short'
                  ? `<p><b>参考答案：</b>${esc(it.q.refAnswer || it.q.note || '—')}</p>
                     <p><b>你的回答：</b>${esc(it.userAnswer || '（未作答）')}</p>`
                  : it.q.type === 'fill'
                    ? `<p><b>正确答案：</b>${esc(answerText(it.q))}</p>
                       <p><b>你的回答：</b>${esc((it.picked || []).join('；') || '（未作答）')}</p>`
                    : `<p><b>正确答案：</b>${letters(it.q)}</p>`}
                ${it.q.note ? `<p><b>📝 注释：</b>${esc(it.q.note)}</p>` : ''}
              </div>
            </details>`).join('')}
        </div>
      </div>`;

    const again = $('#r-again');
    if (again) again.onclick = () => this.rebuildSame();
    const rw = $('#r-wrong');
    if (rw) rw.onclick = () => {
      const paper = wrongItems.map(it => {
        const q = JSON.parse(JSON.stringify(it.q));
        q._wbKey = (it._bankId || this.cfg.bankId || 'unknown') + '/' + q.id;
        return q;
      });
      this.startQuiz(paper, { durationMin: 0 }, 'wrong');
    };
    const rm = $('#r-mindmap');
    if (rm) rm.onclick = () => App.showView('mindmap');
    $('#r-home').onclick = () => App.showView('home');
  },

  rebuildSame() {
    const cfg = this.cfg;
    if (cfg.from === 'mindmap' && Array.isArray(cfg.entries)) {
      return this.startFromMindmap(cfg.entries, {
        label: cfg.label, order: cfg.order, durationMin: cfg.durationMin, limit: cfg.limit,
      });
    }
    const bank = Store.data.banks.find(b => b.id === cfg.bankId) || Store.data.banks[0];
    const paper = this.buildPaper(bank, cfg.chapter, cfg.counts, cfg.order);
    this.startQuiz(paper, cfg);
  },
};

/* ---------- 「注释 + 答案」弹窗 ---------- */
function openReveal(q, reason) {
  const ans = q.type === 'short'
    ? (q.refAnswer || q.note || '—')
    : (q.type === 'fill' ? answerText(q) : letters(q));
  openDlg(`
    <div class="reveal-head">
      <span class="badge b-${q.type}">${TYPE_LABEL[q.type]}</span>
      ${reason ? `<span class="reveal-reason">${esc(reason)}</span>` : ''}
    </div>
    <div class="dlg-answer">正确答案：<b>${esc(ans)}</b></div>
    ${q.note ? `<div class="dlg-note"><h4>📝 注释</h4><p>${esc(q.note)}</p></div>` : ''}
    ${q.type === 'short' && q.refAnswer ? `<div class="dlg-note"><h4>📄 参考答案</h4><p>${esc(q.refAnswer)}</p></div>` : ''}
    <div class="dlg-actions"><button class="btn primary" id="rv-ok">知道了</button></div>`);
  $('#rv-ok').onclick = closeDlg;
}
