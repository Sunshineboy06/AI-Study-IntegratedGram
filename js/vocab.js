'use strict';

/* ---------- 背单词模块：词库导入 / 随机背诵 / 词库展示 ----------
   词库为全局数据（不按课程文件夹划分），存储在 Store.data.vocab。
   标签规则：蓝=未背诵(reviewCount=0)、黄=学习中(背过未完全)、绿=完全背诵。
   完全背诵按艾宾浩斯 6 节点（当天/1/2/4/7/15天）自动判定，也可手动置绿。 */

const VOCAB_MODEL_KEY = 'icenote.modelSettings.v1';   // 与 AI生成页共用模型设置

/* ---------- 浏览器原生 TTS 读音（纯离线，无需联网） ---------- */
const TTS = {
  ready: false,

  init() {
    if (!('speechSynthesis' in window)) return;
    this.ready = true;
    const load = () => { this.voices = speechSynthesis.getVoices(); };
    load();
    speechSynthesis.onvoiceschanged = load;   // 语音列表异步加载
  },

  /* 按口音挑最佳语音：Natural/Online（Edge 内置免费 Azure 拟真音色）> Microsoft > 第一个 */
  pickVoice(lang) {
    const voices = (speechSynthesis.getVoices() || [])
      .filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(lang.toLowerCase()));
    return voices.find(v => /natural|online/i.test(v.name)) ||
           voices.find(v => /microsoft/i.test(v.voiceURI)) || voices[0] || null;
  },

  /* 按 accent('us'|'uk') 播放；找不到对应口音语音时回退语言标签 */
  speak(word, accent, speed = 1) {
    if (!this.ready) return false;
    const lang = accent === 'uk' ? 'en-GB' : 'en-US';
    try {
      speechSynthesis.cancel();               // 防止连读叠音
      const u = new SpeechSynthesisUtterance(String(word).replace(/\(\d+\)$/, ''));
      u.lang = lang;
      u.rate = Math.min(2, Math.max(0.5, speed)) * 0.9;
      const voice = this.pickVoice(lang);
      if (voice) {
        u.voice = voice;
      } else if (!this._warned) {
        /* 系统未装英文语音包：每个浏览器会话仅提示一次，读音仍按语言标签尽力发声 */
        let warned = false;
        try { warned = sessionStorage.getItem('tts.voiceWarned') === '1'; } catch (e) { /* 忽略 */ }
        if (!warned) {
          try { sessionStorage.setItem('tts.voiceWarned', '1'); } catch (e) { /* 忽略 */ }
          this._warned = true;
          setTimeout(() => toast('未检测到英文语音，读音可能不准。可在 Windows 设置 → 时间和语言 → 语音 中添加英语语音包', 'error'), 0);
        }
      }
      speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  },
};
TTS.init();

/* ---------- Azure 神经网络语音（更拟人）：REST 直连 + 本地音频缓存 ----------
   密钥/区域/音色存本机浏览器（localStorage），未配置或请求失败自动回退原生 TTS。 */
const AzureTTS = {
  KEY: 'vocab.azureTts',
  cache: new Map(),
  current: null,

  VOICES: {
    us: ['en-US-JennyNeural', 'en-US-AriaNeural', 'en-US-GuyNeural', 'en-US-MichelleNeural'],
    uk: ['en-GB-SoniaNeural', 'en-GB-LibbyNeural', 'en-GB-RyanNeural', 'en-GB-ThomasNeural'],
  },

  cfg() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || 'null') || null; } catch (e) { return null; }
  },
  save(cfg) {
    try { localStorage.setItem(this.KEY, JSON.stringify(cfg)); } catch (e) { /* 忽略 */ }
  },
  configured() {
    const c = this.cfg();
    return !!(c && c.key && c.region);
  },
  esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),

  stop() {
    if (this.current) {
      try { this.current.pause(); this.current.currentTime = 0; } catch (e) { /* 忽略 */ }
      this.current = null;
    }
  },

  async fetchAudio(word, accent, speed) {
    const cfg = this.cfg();
    const voice = (accent === 'uk' ? (cfg.ukVoice || this.VOICES.uk[0]) : (cfg.usVoice || this.VOICES.us[0]));
    const cacheKey = voice + '|' + speed + '|' + word;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    const ratePct = Math.round((speed - 1) * 100);
    const rate = (ratePct >= 0 ? '+' : '') + ratePct + '%';
    const lang = accent === 'uk' ? 'en-GB' : 'en-US';
    const ssml = `<speak version='1.0' xml:lang='${lang}'><voice name='${voice}'><prosody rate='${rate}'>${this.esc(word)}</prosody></voice></speak>`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    let resp;
    try {
      resp = await fetch(`https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': cfg.key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        },
        body: ssml,
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? '请求超时' : '网络错误');
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) throw new Error('Azure 返回 ' + resp.status + (resp.status === 401 ? '（密钥无效）' : resp.status === 403 ? '（被拒绝，检查密钥/区域）' : ''));
    const buf = await resp.arrayBuffer();
    if (buf.byteLength < 100) throw new Error('Azure 返回空音频');
    const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
    if (this.cache.size >= 120) {
      let i = 0;
      for (const k of this.cache.keys()) {
        URL.revokeObjectURL(this.cache.get(k));
        this.cache.delete(k);
        if (++i >= 30) break;
      }
    }
    this.cache.set(cacheKey, url);
    return url;
  },

  /* 未配置返回 false（调用方回退原生）；重复调用即重复播放 */
  async play(word, accent, speed) {
    if (!this.configured()) return false;
    this.stop();
    if (TTS.ready) speechSynthesis.cancel();
    const url = await this.fetchAudio(word, accent, speed);
    const audio = new Audio(url);
    this.current = audio;
    await audio.play();
    return true;
  },

  async test(accent) {
    const cfg = this.cfg();
    if (!cfg || !cfg.key || !cfg.region) throw new Error('请先填写密钥和区域');
    const text = accent === 'uk' ? 'Good morning, this is a British neural voice test.' : 'Hello! This is a natural Azure neural voice test.';
    const url = await this.fetchAudio(text, accent, 1);
    this.stop();
    const audio = new Audio(url);
    this.current = audio;
    await audio.play();
  },
};

const Vocab = {
  page: 'home',        // home | bank | session
  session: null,       // {mode:'new'|'review'|'mix', current, revealed, answered}
                       //   revealed=提前偷看答案；answered='known'|'unknown'|null=已自评（停在当前词看释义）
  showMode: 'en',      // en=正面英文 | zh=正面中文
  bankCat: 'all',      // all | new | learning | mastered | fav
  bankSort: 'az',      // az | reviews
  cal: null,           // 日历状态 {year, month, metric}，renderHome 时初始化
  trendMode: 'week',   // week | month

  render() {
    if (this.page === 'session' && this.session) return this.renderSession();
    if (this.page === 'bank') return this.renderBank();
    return this.renderHome();
  },

  /* ================= 主页 ================= */
  renderHome() {
    const g = Store.vocabGroups();
    const words = Object.values(Store.data.vocab.words);
    const studied = words.filter(w => w.reviewCount > 0).length;
    const fav = words.filter(w => w.fav).length;
    const today = Store.getToday();
    const pct = Math.min(100, Math.round(today.done / today.goal * 100));
    const canReview = g.learning.length + g.mastered.length > 0;

    $('#main').innerHTML = `
      <h2 class="page-title">背单词</h2>
      <div class="stat-grid">
        <div class="card stat" id="v-s-all"><b>${words.length}</b><span>总词数</span></div>
        <div class="card stat" id="v-s-studied"><b>${studied}</b><span>已背诵</span></div>
        <div class="card stat" id="v-s-learning"><b>${g.learning.length}</b><span>学习中</span></div>
        <div class="card stat" id="v-s-mastered"><b>${g.mastered.length}</b><span>完全背诵</span></div>
        <div class="card stat" id="v-s-fav"><b>${fav}</b><span>⭐ 收藏</span></div>
      </div>

      <div class="card">
        <h3 class="card-title">🎯 今日目标</h3>
        <div class="v-goal-row">
          <span class="v-goal-num"><b>${today.done}</b> / ${today.goal} 词</span>
          ${today.done >= today.goal ? '<span class="v-goal-done">🎉 今日目标已完成</span>' : ''}
        </div>
        <div class="pg-bar"><div class="pg-fill" style="width:${pct}%"></div></div>
        <div class="row" style="margin-top:10px">
          ${today.done > 0
            ? `<button class="btn ghost sm" id="v-goal-add">＋10 词（最多 200）</button>`
            : `<input type="number" id="v-goal-input" min="10" max="100" value="${today.goal}" style="width:90px">
               <button class="btn ghost sm" id="v-goal-set">设定目标（10–100）</button>`}
          <span class="muted">今日目标 10–100 词，可多次追加至 200；开始后当天不可下调。</span>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">开始背诵</h3>
        <div class="row">
          <button class="btn primary lg" id="v-start-new"${g.new.length ? '' : ' disabled'}>▶ 学习新词（${g.new.length}）</button>
          <button class="btn primary lg" id="v-start-review"${canReview ? '' : ' disabled'}>↻ 复习单词（${g.learning.length + g.mastered.length}）</button>
        </div>
        <p class="muted">抽词权重：未背诵 : 学习中 : 完全背诵 = 5 : 3 : 1；学习中单词抽中后 24 小时内不再抽中，完全背诵单词 3 天内不再抽中。
        完全背诵按艾宾浩斯曲线判定：认识后依次在 当天 → 1 天 → 2 天 → 4 天 → 7 天 → 15 天 复习，全部点「认识」即自动置绿；中途「不认识」回退重新计。</p>
        <div class="v-legend">
          <span class="vtag t-new">未背诵</span>
          <span class="vtag t-learning">学习中</span>
          <span class="vtag t-mastered">完全背诵</span>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">📅 学习日历</h3>
        <div class="cal-head">
          <button class="btn ghost sm" id="cal-prev">‹</button>
          <b id="cal-title"></b>
          <button class="btn ghost sm" id="cal-next">›</button>
          <button class="btn ghost sm" id="cal-today">今天</button>
          <div class="seg" id="cal-metric">
            <button data-m="total" class="active">背诵</button>
            <button data-m="new">新学</button>
            <button data-m="review">复习</button>
          </div>
        </div>
        <div class="cal-week">${['一', '二', '三', '四', '五', '六', '日'].map(w => `<span>${w}</span>`).join('')}</div>
        <div class="cal-grid" id="cal-grid"></div>
        <p class="muted">日期下方数字可切换为：当日背诵总数 / 新学词数 / 复习词数</p>
      </div>

      <div class="card">
        <h3 class="card-title">📊 近七天背诵柱状图</h3>
        <div class="v-legend">
          <span class="vtag t-new">新学</span>
          <span class="vtag t-learning">复习</span>
        </div>
        <div class="bars" id="bars"></div>
      </div>

      <div class="card">
        <h3 class="card-title">📈 背诵变化曲线</h3>
        <div class="seg" id="trend-seg">
          <button data-t="week"${this.trendMode === 'week' ? ' class="active"' : ''}>本周</button>
          <button data-t="month"${this.trendMode === 'month' ? ' class="active"' : ''}>本月</button>
        </div>
        <div id="trend"></div>
      </div>

      <div class="card">
        <div class="row">
          <button class="btn lg" id="v-open-bank">📚 词库展示（${words.length} 词）</button>
          <button class="btn ghost lg" id="v-import">⬆ 导入单词</button>
        </div>
      </div>`;

    $('#v-s-all').onclick = $('#v-open-bank').onclick = () => { this.page = 'bank'; this.render(); };
    $('#v-s-studied').onclick = $('#v-s-learning').onclick = $('#v-s-mastered').onclick = $('#v-s-fav').onclick = () => { this.page = 'bank'; this.render(); };
    const goalSet = $('#v-goal-set');
    if (goalSet) goalSet.onclick = () => {
      const n = Math.floor(+$('#v-goal-input').value) || 20;
      Store.setDailyGoal(n);
      this.render();
      toast(`今日目标已设为 ${Store.getToday().goal} 词`, 'ok');
    };
    const goalAdd = $('#v-goal-add');
    if (goalAdd) goalAdd.onclick = () => {
      const t = Store.getToday();
      Store.setDailyGoal(t.goal + 10);
      this.render();
      toast(`今日目标已追加为 ${Store.getToday().goal} 词`, 'ok');
    };
    $('#v-start-new').onclick = () => this.startSession('new');
    $('#v-start-review').onclick = () => this.startSession('review');
    $('#v-import').onclick = () => this.importDialog();

    if (!this.cal || this.cal.year !== new Date().getFullYear() || this.cal.month !== new Date().getMonth() + 1) {
      const n = new Date();
      this.cal = { year: n.getFullYear(), month: n.getMonth() + 1, metric: 'total' };
    }
    $('#cal-prev').onclick = () => { this.cal.month--; if (this.cal.month < 1) { this.cal.month = 12; this.cal.year--; } this.drawCalendar(); };
    $('#cal-next').onclick = () => { this.cal.month++; if (this.cal.month > 12) { this.cal.month = 1; this.cal.year++; } this.drawCalendar(); };
    $('#cal-today').onclick = () => { const n = new Date(); this.cal = { year: n.getFullYear(), month: n.getMonth() + 1, metric: this.cal.metric }; this.drawCalendar(); };
    $$('#cal-metric button').forEach(b => b.onclick = () => {
      this.cal.metric = b.dataset.m;
      $$('#cal-metric button').forEach(x => x.classList.toggle('active', x === b));
      this.drawCalendar();
    });
    this.drawCalendar();

    this.drawBars();
    $$('#trend-seg button').forEach(b => b.onclick = () => {
      this.trendMode = b.dataset.t;
      $$('#trend-seg button').forEach(x => x.classList.toggle('active', x === b));
      this.drawTrend();
    });
    this.drawTrend();
  },

  /* ---------- 学习日历 ---------- */
  drawCalendar() {
    const c = this.cal;
    const grid = $('#cal-grid');
    if (!grid) return;
    $('#cal-title').textContent = `${c.year}年${c.month}月`;
    const first = new Date(c.year, c.month - 1, 1);
    const daysInMonth = new Date(c.year, c.month, 0).getDate();
    let offset = first.getDay() - 1;          // 周一开头
    if (offset < 0) offset = 6;
    const todayK = Store._todayKey();
    let html = '';
    for (let i = 0; i < offset; i++) html += '<div class="cal-cell blank"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${c.year}-${String(c.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const st = Store.dayStat(key);
      const v = c.metric === 'total' ? st.done : c.metric === 'new' ? st.new : st.review;
      html += `<div class="cal-cell${key === todayK ? ' today' : ''}${v ? ' has' : ''}">
        <span class="cal-d">${d}</span><span class="cal-v">${v || '·'}</span></div>`;
    }
    grid.innerHTML = html;
  },

  /* ---------- 近七天堆叠柱状图 ---------- */
  drawBars() {
    const box = $('#bars');
    if (!box) return;
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const st = Store.dayStat(Store._dateKey(d));
      days.push({ d, st, isToday: i === 0 });
    }
    const max = Math.max(1, ...days.map(x => x.st.done));
    const H = 150;
    const week = ['日', '一', '二', '三', '四', '五', '六'];
    box.innerHTML = days.map(({ d, st, isToday }) => {
      const hNew = st.done ? Math.round(st.new / max * (H - 8)) : 0;
      const hRev = st.done ? Math.round(st.review / max * (H - 8)) : 0;
      return `<div class="bar-col${isToday ? ' today' : ''}">
        <span class="bar-val">${st.done || ''}</span>
        <div class="bar-track">
          <div class="bar-seg rev" style="height:${hRev}px"></div>
          <div class="bar-seg new" style="height:${hNew}px"></div>
        </div>
        <span class="bar-label">${week[d.getDay()]}</span>
        <span class="bar-date">${d.getMonth() + 1}/${d.getDate()}</span>
      </div>`;
    }).join('');
  },

  /* ---------- 本周 / 本月变化曲线（SVG） ---------- */
  drawTrend() {
    const box = $('#trend');
    if (!box) return;
    const now = new Date();
    const todayK = Store._todayKey();
    const days = [];
    if (this.trendMode === 'week') {
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
      for (let i = 0; i < 7; i++) days.push(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
    } else {
      const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let d = 1; d <= dim; d++) days.push(new Date(now.getFullYear(), now.getMonth(), d));
    }
    const week = ['日', '一', '二', '三', '四', '五', '六'];
    const pts = days.map(d => {
      const key = Store._dateKey(d);
      const future = key > todayK;
      return {
        label: this.trendMode === 'week' ? '周' + week[d.getDay()] : String(d.getDate()),
        v: future ? null : Store.dayStat(key).done,
      };
    });
    const W = 640, H = 220, PADL = 34, PADR = 16, PADT = 26, PADB = 34;
    const iw = W - PADL - PADR, ih = H - PADT - PADB;
    const max = Math.max(1, ...pts.map(p => p.v || 0));
    const n = pts.length;
    const x = i => PADL + (n === 1 ? iw / 2 : i * iw / (n - 1));
    const y = v => PADT + ih - (v / max) * ih;
    let line = '', area = '';
    pts.forEach((p, i) => { if (p.v === null) return; line += (line ? ' L ' : 'M ') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1); });
    const drawn = pts.map((p, i) => ({ ...p, x: x(i), y: y(p.v ?? 0) })).filter(p => p.v !== null);
    if (drawn.length) {
      area = 'M ' + drawn[0].x.toFixed(1) + ' ' + (PADT + ih) + ' ' + drawn.map(p => 'L ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ') + ' L ' + drawn[drawn.length - 1].x.toFixed(1) + ' ' + (PADT + ih) + ' Z';
    }
    /* 网格线与坐标 */
    let gridLines = '';
    [0, 0.5, 1].forEach(f => {
      const gy = (PADT + ih - f * ih).toFixed(1);
      const val = Math.round(max * f);
      gridLines += `<line x1="${PADL}" y1="${gy}" x2="${W - PADR}" y2="${gy}" class="t-grid"/>` +
        `<text x="${PADL - 8}" y="${+gy + 4}" class="t-ytxt">${val}</text>`;
    });
    /* X 轴标签：本周全标，本月隔 3 天 */
    let xLabels = '';
    pts.forEach((p, i) => {
      if (this.trendMode === 'week' || i % 3 === 0 || i === n - 1) {
        xLabels += `<text x="${x(i).toFixed(1)}" y="${H - 10}" class="t-xtxt">${p.label}</text>`;
      }
    });
    const dots = drawn.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" class="t-dot"/>` +
      (p.v ? `<text x="${p.x.toFixed(1)}" y="${(p.y - 9).toFixed(1)}" class="t-vtxt">${p.v}</text>` : '')).join('');
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="trend-svg">
      <defs><linearGradient id="tgrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(207,218,245,.55)"/><stop offset="100%" stop-color="rgba(207,218,245,0)"/>
      </linearGradient></defs>
      ${gridLines}
      ${area ? `<path d="${area}" fill="url(#tgrad)" stroke="none"/>` : ''}
      ${line ? `<path d="${line}" fill="none" stroke="var(--color-lake-fill, var(--color-lake-blue))" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      ${dots}${xLabels}
    </svg>`;
  },

  /* ================= 背诵模式 ================= */
  startSession(mode) {
    const first = Store.pickWord(mode);
    if (!first) return toast('没有可背诵的单词，请先导入词库', 'error');
    this.session = { mode, current: first, revealed: false, answered: null };
    Store.touchPick(first.word);
    this.page = 'session';
    this.render();
  },

  nextWord() {
    const next = Store.pickWord(this.session.mode);
    if (!next) {
      const t = Store.getToday();
      $('#main').innerHTML = `
        <h2 class="page-title">背单词</h2>
        <div class="card empty">
          <p>🎉 本轮没有更多可抽的单词了！<br>今日已完成 <b>${t.done}</b> / ${t.goal} 词。</p>
          <button class="btn primary" onclick="Vocab.toHome()">返回背单词主页</button>
        </div>`;
      this.session = null;
      this.page = 'home';
      return;
    }
    this.session.current = next;
    this.session.revealed = false;
    this.session.answered = null;      // 新词回到「未自评」状态
    Store.touchPick(next.word);
    this.renderSession();
  },

  toHome() { this.session = null; this.page = 'home'; this.render(); },

  renderSession() {
    const s = this.session;
    const w = s.current;
    const t = Store.getToday();
    const fav = w.fav;
    const status = Store.wordStatus(w);
    const done = !!s.answered;          // 已自评 → 停在当前词展示释义
    const seen = s.revealed || done;    // 答案是否已揭晓
    const meaning = w.meaning || '（无释义）';
    const favBtn = `<button class="btn ghost sm v-fav${fav ? ' on' : ''}" id="v-fav">${fav ? '★' : '☆'}</button>`;
    const subHtml = (w.phonetic || w.pos)
      ? `<div class="v-sub">${esc(w.phonetic)}${w.pos ? '　' + esc(w.pos) : ''}</div>` : '';
    const exampleHtml = w.example
      ? `<div class="v-example">${this.highlightExample(w.example, w.word)}</div>` : '';

    $('#main').innerHTML = `
      <h2 class="page-title">${s.mode === 'new' ? '▶ 学习新词' : '↻ 复习单词'}</h2>
      <div class="card v-topbar">
        <span>今日 <b>${t.done}</b> / ${t.goal} 词</span>
        <span class="vtag t-${status}">${status === 'new' ? '未背诵' : status === 'learning' ? '学习中' : '完全背诵'}</span>
        <button class="btn ghost sm" id="v-exit">退出背诵</button>
      </div>

      <div class="card vcard">
        <div class="row" style="justify-content:flex-end;margin-top:0">
          <button class="btn ghost sm" id="v-showmode">${this.showMode === 'en' ? '🔤 当前：显示英文 → 点击切中文' : '🀄 当前：显示中文 → 点击切英文'}</button>
          <button class="btn ghost sm" id="v-speak" title="播放单词读音（可重复点击反复听）">🔊 播放读音</button>
          <select id="v-speed" class="btn ghost sm" title="语速" style="padding:4px 12px;text-transform:none">
            ${[[0.6, '语速：慢'], [0.8, '语速：较慢'], [1, '语速：正常'], [1.25, '语速：较快'], [1.5, '语速：快']].map(([v, t]) =>
              `<option value="${v}"${Store.data.vocab.settings.speed === v ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
          <button class="btn ghost sm" id="v-accent">${Store.data.vocab.settings.accent === 'uk' ? '🇬🇧 英式' : '🗽 美式'}</button>
          <button class="btn ghost sm" id="v-azure" title="配置 Azure 神经网络语音（更拟人，需免费 Azure 密钥）">🗣 Azure${AzureTTS.configured() ? ' ✓' : ''}</button>
          <button class="btn ghost sm" id="v-autospeak">🔊 自动读音：${Store.data.vocab.settings.autoSpeak ? '开' : '关'}</button>
          ${(() => {
            const v = TTS.pickVoice(Store.data.vocab.settings.accent === 'uk' ? 'en-GB' : 'en-US');
            if (v && /natural|online/i.test(v.name)) return '<span class="vtag t-mastered">🎧 Azure Natural</span>';
            if (v) return `<span class="vtag" title="${esc(v.name)}">系统音色</span>`;
            return '<span class="vtag t-learning">无英文语音</span>';
          })()}
        </div>
        ${this.showMode === 'en' ? `
          <div class="v-word">${esc(w.word)} ${favBtn}</div>
          ${subHtml}
          ${!seen
            ? (w.meaning ? '<button class="btn ghost" id="v-reveal">显示释义</button>' : '')
            : (done ? `<div class="v-answer"><div class="v-meaning">${esc(meaning)}</div></div>`
                    : `<div class="v-meaning">${esc(meaning)}</div>`)}
          ${seen ? exampleHtml : ''}
        ` : `
          ${done
            ? `<div class="v-answer"><div class="v-meaning-big">${esc(meaning)} ${favBtn}</div></div>`
            : `<div class="v-meaning-big">${esc(meaning)} ${favBtn}</div>`}
          ${seen
            ? `<div class="v-word">${esc(w.word)}</div>${subHtml}${exampleHtml}`
            : '<button class="btn ghost" id="v-reveal">显示单词</button>'}
        `}
      </div>

      <div class="card v-actions">
        ${done ? `<p class="v-verdict ${s.answered === 'known' ? 'ok' : 'no'}">${s.answered === 'known' ? '✓ 已标记：认识' : '✗ 已标记：不认识'}　<span class="muted">看完释义后点「下一个」继续</span></p>` : ''}
        <div class="row">
          <button class="btn ${done ? (s.answered === 'known' ? 'picked ok' : 'ghost') : 'primary'} lg" id="v-known"${done ? ' disabled' : ''}>✓ 认识</button>
          <button class="btn ${done ? (s.answered === 'unknown' ? 'picked no' : 'ghost') : 'danger'} lg" id="v-unknown"${done ? ' disabled' : ''}>✗ 不认识</button>
        </div>
        <div class="row">
          ${done ? '<button class="btn primary lg" id="v-next">下一个 →</button>'
                 : '<button class="btn ghost" id="v-skip">跳过</button>'}
          <button class="btn ghost" id="v-master">✅ 完全背诵（直接置绿）</button>
        </div>
        <p class="muted">背诵次数：${w.reviewCount}${!w.mastered && w.stageDueAt ? ` · 下次复习节点：${fmtDate(w.stageDueAt)}` : ''}${w.mastered ? ' · 🟢 已完全背诵' : ''}</p>
        <p class="muted v-keys">快捷键：<b>空格</b> ${done ? '下一个' : '显示释义'}　·　<b>1</b> / <b>→</b> 认识　·　<b>2</b> / <b>←</b> 不认识</p>
      </div>`;

    $('#v-exit').onclick = () => this.toHome();
    $('#v-showmode').onclick = () => { this.showMode = this.showMode === 'en' ? 'zh' : 'en'; this.renderSession(); };
    $('#v-speak').onclick = () => this.speak(w.word);
    $('#v-speed').onchange = e => {
      Store.data.vocab.settings.speed = +e.target.value || 1;
      Store.save();
      this.speak(w.word);   // 换语速立即示范
    };
    $('#v-azure').onclick = () => this.azureDialog();
    $('#v-accent').onclick = () => {
      const st = Store.data.vocab.settings;
      st.accent = st.accent === 'uk' ? 'us' : 'uk';
      Store.save();
      this.renderSession();
      TTS.speak(w.word, st.accent);   // 切换口音后立刻示范朗读
    };
    $('#v-autospeak').onclick = () => {
      const st = Store.data.vocab.settings;
      st.autoSpeak = !st.autoSpeak;
      Store.save();
      this.renderSession();
    };
    const reveal = $('#v-reveal');
    if (reveal) reveal.onclick = () => this.reveal();
    $('#v-fav').onclick = () => { Store.toggleFav(w.word); this.renderSession(); };
    $('#v-known').onclick = () => this.answer('known');
    $('#v-unknown').onclick = () => this.answer('unknown');
    $('#v-master').onclick = () => { Store.forceMaster(w.word); toast(`「${w.word}」已完全背诵`, 'ok'); this.nextWord(); };
    const skip = $('#v-skip');
    if (skip) skip.onclick = () => this.nextWord();
    const next = $('#v-next');
    if (next) { next.onclick = () => this.nextWord(); next.focus({ preventScroll: true }); }
    this.bindKeys();
    /* 作答后停在本词看释义，不再重复朗读 */
    if (Store.data.vocab.settings.autoSpeak && !done) this.speak(w.word);
  },

  /* 提前偷看答案（不改变背诵进度） */
  reveal() { this.session.revealed = true; this.renderSession(); },

  /* ---------- 自评：认识 / 不认识 ----------
     记录进度后**不立即切词**，就地展示释义等完整答案，等用户点「下一个」再继续 */
  answer(kind) {
    const s = this.session;
    if (!s || s.answered) return;               // 防重复点击
    const w = s.current;
    const wasMastered = !!w.mastered;
    if (kind === 'known') Store.markKnown(w.word, s.mode);
    else Store.markUnknown(w.word, s.mode);
    s.answered = kind;
    s.revealed = true;
    this.renderSession();
    /* 只在状态发生跃迁时提示，避免每次作答都弹 */
    if (!wasMastered && w.mastered) toast(`🎉 「${w.word}」走完全部复习节点，自动置绿`, 'ok');
    else if (wasMastered && !w.mastered) toast(`「${w.word}」已降回「学习中」，重新走曲线`, 'info');
  },

  /* ---------- 例句中高亮目标单词（含常见词形变化） ---------- */
  highlightExample(example, word) {
    const safe = esc(example);
    const raw = String(word || '').trim();
    if (raw.length < 2) return safe;      // 单字母词（a / I）高亮纯噪音
    /* 先按同一套 HTML 转义再造正则，例句与单词的字符序列才能对齐（如 don't 的 &#39;） */
    const core = esc(raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pats = new Set();
    const add = (stem, tails) => tails.forEach(t => pats.add(stem + t));
    const T = ['', 's', 'es', 'ed', 'd', 'ing', 'ly', 'er', 'est'];
    add(core, T);                                                                       // 原形与常规变形
    if (/e$/i.test(raw)) add(core.slice(0, -1), ['ing', 'ed', 'es', 'er', 'est']);        // use → using / used
    if (/[^aeiou]y$/i.test(raw)) add(core.slice(0, -1), ['ies', 'ied', 'ier', 'iest', 'ily']);  // study → studies / happier
    if (/[^aeiou][aeiou][^aeiouwxy]$/i.test(raw) && /^[a-z]$/i.test(raw.slice(-1)))
      add(core + raw.slice(-1).toLowerCase(), ['ing', 'ed', 'er', 'est']);                // run → running
    const list = Array.from(pats).sort((a, b) => b.length - a.length);                    // 长匹配优先，避免只吃到词干
    const re = new RegExp('\\b(?:' + list.join('|') + ')\\b', 'ig');
    return safe.replace(re, m => `<mark class="v-hl">${m}</mark>`);
  },

  /* ---------- 键盘快捷键：空格=揭晓/下一个，1/→=认识，2/←=不认识 ---------- */
  bindKeys() {
    if (this._keysBound) return;
    this._keysBound = true;
    document.addEventListener('keydown', e => {
      if (this.page !== 'session' || !this.session) return;
      if (document.querySelector('dialog[open]')) return;                 // 弹窗优先
      const el = e.target || {};
      const tag = String(el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || el.isContentEditable) return;
      const k = e.key;
      /* 焦点在按钮/链接上时交还原生点击，避免一次按键触发两次 */
      if ((k === ' ' || k === 'Enter' || k === 'Spacebar') &&
          (tag === 'button' || tag === 'a' || tag === 'summary')) return;
      if (k === ' ' || k === 'Enter' || k === 'Spacebar') {
        e.preventDefault();
        this.session.answered ? this.nextWord() : this.reveal();
      } else if ((k === '1' || k === 'ArrowRight') && !this.session.answered) {
        e.preventDefault();
        this.answer('known');
      } else if ((k === '2' || k === 'ArrowLeft') && !this.session.answered) {
        e.preventDefault();
        this.answer('unknown');
      }
    });
  },

  /* ---------- 读音：Azure 神经语音优先，未配置/失败回退原生；每次调用都重新播放 ---------- */
  speak(word) {
    const st = Store.data.vocab.settings;
    const speed = st.speed || 1;
    const playNative = () => {
      AzureTTS.stop();
      if (!TTS.speak(word, st.accent, speed)) toast('当前浏览器不支持语音合成', 'error');
    };
    AzureTTS.play(word, st.accent, speed)
      .then(ok => { if (!ok) playNative(); })
      .catch(e => {
        toast('Azure 语音失败（' + e.message + '），已回退本地语音', 'error');
        playNative();
      });
  },

  /* Azure 语音配置对话框 */
  azureDialog() {
    const cfg = AzureTTS.cfg() || { key: '', region: '', usVoice: AzureTTS.VOICES.us[0], ukVoice: AzureTTS.VOICES.uk[0] };
    const voiceOpts = (sel, list) => list.map(v =>
      `<option value="${v}"${v === sel ? ' selected' : ''}>${v.replace(/^en-[A-Z]{2}-/, '').replace('Neural', '（拟真）')}</option>`).join('');
    const dlg = openDlg(`
      <h3 class="dlg-title">🗣 Azure 神经网络语音</h3>
      <p class="dlg-text">比系统自带 TTS 更拟人的读音，密钥只保存在本机浏览器。没有账号也可用：<b>portal.azure.com</b> 创建「语音 (Speech)」资源即送每月 50 万字符免费额度，获取密钥与区域后填入。</p>
      <p class="ai-warn">💡 零配置捷径：用 <b>Microsoft Edge 浏览器</b>打开平台，其原生语音即内置免费的 Azure 拟真音色（Natural/Online），无需本页配置即可获得自然发音。</p>
      <div class="import-body">
        <label class="field">密钥 (Key)
          <input id="az-key" type="password" placeholder="Azure 语音资源密钥" value="${esc(cfg.key || '')}">
        </label>
        <label class="field">区域 (Region)
          <input id="az-region" list="az-region-list" placeholder="如 eastasia" value="${esc(cfg.region || '')}">
          <datalist id="az-region-list">
            <option value="eastasia"><option value="southeastasia"><option value="japaneast">
            <option value="eastus"><option value="westus"><option value="westeurope">
          </datalist>
        </label>
        <label class="field">美式音色
          <select id="az-us">${voiceOpts(cfg.usVoice, AzureTTS.VOICES.us)}</select>
        </label>
        <label class="field">英式音色
          <select id="az-uk">${voiceOpts(cfg.ukVoice, AzureTTS.VOICES.uk)}</select>
        </label>
        <p class="muted" id="az-status">${AzureTTS.configured() ? '✅ 已配置，朗读优先使用 Azure 神经语音' : '当前未配置，使用系统自带语音'}</p>
        <div class="dlg-actions">
          <button class="btn ghost" id="az-clear">清除配置</button>
          <button class="btn ghost" id="az-test">🔊 试听</button>
          <button class="btn primary" id="az-save">保存</button>
        </div>
      </div>`);
    $('#az-clear', dlg).onclick = () => {
      localStorage.removeItem(AzureTTS.KEY);
      $('#az-key', dlg).value = '';
      $('#az-region', dlg).value = '';
      $('#az-status', dlg).textContent = '已清除，使用系统自带语音';
      if (this.page === 'session') this.renderSession();   // 刷新 Azure ✓ 标记
      toast('Azure 配置已清除', 'ok');
    };
    $('#az-test', dlg).onclick = async () => {
      AzureTTS.save({
        key: $('#az-key', dlg).value.trim(),
        region: $('#az-region', dlg).value.trim(),
        usVoice: $('#az-us', dlg).value,
        ukVoice: $('#az-uk', dlg).value,
      });
      const st = $('#az-status', dlg);
      st.textContent = '正在试听…';
      try {
        await AzureTTS.test(Store.data.vocab.settings.accent);
        st.textContent = '✅ 试听成功，Azure 神经语音可用';
      } catch (e) {
        st.textContent = '❌ 试听失败：' + e.message + '（将回退系统语音）';
      }
    };
    $('#az-save', dlg).onclick = () => {
      AzureTTS.save({
        key: $('#az-key', dlg).value.trim(),
        region: $('#az-region', dlg).value.trim(),
        usVoice: $('#az-us', dlg).value,
        ukVoice: $('#az-uk', dlg).value,
      });
      closeDlg();
      toast(AzureTTS.configured() ? 'Azure 语音已配置，朗读更拟人' : '已保存（信息不完整，仍用系统语音）', 'ok');
      if (this.page === 'session') this.renderSession();
    };
  },

  /* ================= 词库展示 ================= */
  renderBank() {
    const words = Object.values(Store.data.vocab.words);
    const counts = { all: words.length };
    ['new', 'learning', 'mastered'].forEach(k => {
      counts[k] = words.filter(w => Store.wordStatus(w) === k).length;
    });
    counts.fav = words.filter(w => w.fav).length;

    let list = words.filter(w => {
      if (this.bankCat === 'fav') return w.fav;
      if (this.bankCat === 'all') return true;
      return Store.wordStatus(w) === this.bankCat;
    });
    const cmpAz = (a, b) => a.word.localeCompare(b.word, 'en');
    if (this.bankSort === 'az') list.sort(cmpAz);
    else list.sort((a, b) => (b.reviewCount - a.reviewCount) || cmpAz(a, b));
    /* 收藏置顶（收藏视图内也同样置顶在已有排序之上） */
    list.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0));

    const CATS = [
      ['all', `总词库（${counts.all}）`],
      ['new', `未背诵（${counts.new}）`],
      ['learning', `学习中（${counts.learning}）`],
      ['mastered', `完全背诵（${counts.mastered}）`],
      ['fav', `⭐ 收藏（${counts.fav}）`],
    ];

    $('#main').innerHTML = `
      <h2 class="page-title">词库展示</h2>
      <div class="card v-bankbar">
        <div class="v-cats">${CATS.map(([k, label]) =>
          `<button class="v-cat${this.bankCat === k ? ' active' : ''}" data-cat="${k}">${label}</button>`).join('')}</div>
        <label class="field">排序
          <select id="v-sort">
            <option value="az"${this.bankSort === 'az' ? ' selected' : ''}>A – Z 顺序</option>
            <option value="reviews"${this.bankSort === 'reviews' ? ' selected' : ''}>背诵次数（高 → 低）</option>
          </select>
        </label>
        <button class="btn ghost sm" id="v-back">返回主页</button>
      </div>
      ${list.length ? `<div class="card"><div id="v-list"></div></div>`
        : `<div class="card empty"><p>该分类下暂无单词。</p><button class="btn primary" onclick="Vocab.importDialog()">⬆ 导入单词</button></div>`}`;

    $$('.v-cat').forEach(b => b.onclick = () => { this.bankCat = b.dataset.cat; this.renderBank(); });
    $('#v-sort').onchange = e => { this.bankSort = e.target.value; this.renderBank(); };
    $('#v-back').onclick = () => { this.page = 'home'; this.render(); };

    /* 长列表懒加载：首屏 60 行，滚动到底自动追加 */
    if (list.length) {
      LazyList.create(list.map(w => this.wordRow(w)), $('#v-list'), () => this.bindBankRows());
    }
  },

  bindBankRows() {
    $$('.v-row-speak').forEach(b => b.onclick = () => this.speak(b.dataset.word));
    $$('.v-row-fav').forEach(b => b.onclick = () => { Store.toggleFav(b.dataset.word); this.renderBank(); });
    $$('.v-row-master').forEach(b => b.onclick = () => {
      Store.forceMaster(b.dataset.word);
      toast(`「${b.dataset.word}」已完全背诵`, 'ok');
      this.renderBank();
    });
    $$('.v-row-del').forEach(b => b.onclick = async () => {
      if (await confirmDlg('删除单词？', `「${esc(b.dataset.word)}」将从词库中删除。`, true)) {
        Store.removeWord(b.dataset.word);
        this.renderBank();
      }
    });
  },

  wordRow(w) {
    const st = Store.wordStatus(w);
    const stLabel = st === 'new' ? '未背诵' : st === 'learning' ? '学习中' : '完全背诵';
    return `
      <details class="res-item v-row${w.fav ? ' fav' : ''}">
        <summary>
          <span class="vtag t-${st}">${stLabel}</span>
          <span class="v-w${w.fav ? ' favw' : ''}">${esc(w.word)}</span>
          <span class="v-p">${esc(w.phonetic)}${w.pos ? '　' + esc(w.pos) : ''}</span>
          <span class="v-m">${esc(truncate(w.meaning, 30))}</span>
          <span class="muted">×${w.reviewCount}</span>
        </summary>
        <div class="res-body">
          ${w.phonetic ? `<p><b>音标：</b>${esc(w.phonetic)}</p>` : ''}
          ${w.pos ? `<p><b>词性：</b>${esc(w.pos)}</p>` : ''}
          <p><b>释义：</b>${esc(w.meaning || '—')}</p>
          ${w.example ? `<p><b>例句：</b>${this.highlightExample(w.example, w.word)}</p>` : ''}
          <div class="row" style="margin-top:8px"><button class="btn ghost sm v-row-speak" data-word="${esc(w.word)}">🔊 播放读音</button></div>
          <p class="muted">已背诵 ${w.reviewCount} 次${w.mastered ? ' · 完全背诵' : (!w.stageDueAt ? '' : ` · 下一节点 ${fmtDate(w.stageDueAt)}`)} · 加入于 ${fmtDate(w.addedAt)}</p>
          <div class="row">
            <button class="btn ghost sm v-row-fav" data-word="${esc(w.word)}">${w.fav ? '★ 取消收藏' : '☆ 收藏'}</button>
            ${!w.mastered ? `<button class="btn ghost sm v-row-master" data-word="${esc(w.word)}">✅ 完全背诵</button>` : ''}
            <button class="btn ghost sm danger-text v-row-del" data-word="${esc(w.word)}">删除</button>
          </div>
        </div>
      </details>`;
  },

  /* ================= 导入 ================= */
  importDialog() {
    const dlg = openDlg(`
      <h3 class="dlg-title">⬆ 导入英语单词</h3>
      <p class="dlg-text">所有导入的单词会汇总到同一个英语词库。<b>防重复</b>：识别到词库中已有的单词时保留旧数据，不添加不覆盖（复习进度与收藏状态不受影响）。</p>
      <div class="import-body">
        <input type="file" id="vv-file" accept=".txt,.md,.markdown,.csv,.tsv,.json,.pdf,.docx" multiple>
        <textarea id="vv-paste" rows="5" placeholder="或在此粘贴单词表：每行一个单词（支持 单词|音标|词性|释义|例句 分隔，或 JSON）"></textarea>
        <label class="field"><input type="checkbox" id="vv-ai" checked> AI 智能抽取（PDF / DOCX / 排版混乱的词表推荐开启，使用「AI生成」页的模型设置）</label>
        <div class="dlg-actions">
          <button class="btn ghost" id="vv-cancel">取消</button>
          <button class="btn primary" id="vv-go">开始导入</button>
        </div>
        <p class="muted" id="vv-status"></p>
      </div>`);

    $('#vv-cancel', dlg).onclick = closeDlg;
    $('#vv-go', dlg).onclick = async () => {
      const files = Array.from($('#vv-file', dlg).files || []);
      const paste = $('#vv-paste', dlg).value.trim();
      const useAI = $('#vv-ai', dlg).checked;
      const status = $('#vv-status', dlg);
      if (!files.length && !paste) return toast('请选择文件或粘贴单词表', 'error');

      const collect = [];
      const setSt = t => { if (status) status.textContent = t; };
      /* 单个来源的抽取策略：
         - 勾选 AI：优先大模型抽取（更准），失败再退回本地解析
         - 未勾选：本地解析；PDF/DOCX 无本地解析能力时提示勾选 AI */
      const extractOne = async (text, ext, label) => {
        if (useAI) {
          try {
            return await this.aiExtract({ text }, setSt);
          } catch (e) {
            setSt(`AI 抽取失败（${e.message || e}），尝试本地解析…`);
            const fb = this.localParse(text, ext);
            if (fb.length) return fb;
            throw e;
          }
        }
        const r = this.localParse(text, ext);
        if (!r.length && (ext === 'pdf' || ext === 'docx')) {
          throw new Error(`「${label}」是 ${ext.toUpperCase()} 文件，本地无法解析，请勾选 AI 智能抽取后重试`);
        }
        return r;
      };
      try {
        if (paste) {
          collect.push(...await extractOne(paste, 'txt', '粘贴内容'));
        }
        for (const f of files) {
          setSt(`正在读取「${f.name}」…`);
          const ext = (f.name.match(/\.([a-z0-9]+)$/i) || [, 'txt'])[1].toLowerCase();
          let text = '';
          if (['pdf', 'docx'].includes(ext)) {
            text = await this.serverExtract(f);
          } else {
            text = await this.readFile(f);
          }
          if (!text) throw new Error(`「${f.name}」没有读取到文本`);
          collect.push(...await extractOne(text, ext, f.name));
        }
        const { added, skipped } = Store.addWords(collect);
        closeDlg();
        this.page = 'home';
        this.render();
        toast(`导入完成：新增 ${added} 词，跳过重复 ${skipped} 词，词库共 ${Object.keys(Store.data.vocab.words).length} 词`, 'ok');
      } catch (e) {
        setSt('❌ ' + (e.message || e));
        toast('导入失败：' + (e.message || e), 'error');
      }
    };
  },

  readFile(f) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('文件读取失败'));
      r.readAsText(f, 'utf-8');
    });
  },

  serverExtract(f) {
    const fd = new FormData();
    fd.append('file', f);
    return fetch('/api/extract-text', { method: 'POST', body: fd })
      .then(r => r.json().then(j => ({ status: r.status, body: j })))
      .then(res => {
        if (!res.body.ok) throw new Error(res.body.error || ('请求失败(' + res.status + ')'));
        return res.body.text;
      });
  },

  aiExtract(payload, setSt) {
    const saved = (() => { try { return JSON.parse(localStorage.getItem(VOCAB_MODEL_KEY) || 'null') || {}; } catch (e) { return {}; } })();
    const body = Object.assign({ api_key: saved.api_key || '', model: saved.model || '', base_url: saved.base_url || '' }, payload);
    setSt('正在调用大模型抽取单词（材料较长时可能需要几分钟）…');
    return fetch('/api/vocab-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(r => r.json().then(j => ({ status: r.status, body: j })))
      .then(res => {
        if (!res.body.ok) throw new Error(res.body.error || ('请求失败(' + res.status + ')'));
        setSt(`AI 抽取到 ${res.body.count} 个单词`);
        return res.body.words;
      });
  },

  /* ---------- 本地解析：json / csv / tsv / txt ---------- */
  localParse(text, ext) {
    text = String(text).replace(/^\uFEFF/, '').trim();
    if (!text) return [];
    if (ext === 'json' || /^[[{]/.test(text)) {
      const r = this.parseJSON(text);
      if (r.length) return r;
    }
    if (ext === 'csv' || ext === 'tsv' || this.looksTabular(text)) return this.parseTable(text);
    return this.parseLines(text);
  },

  parseJSON(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return []; }
    let arr = Array.isArray(obj) ? obj : (Array.isArray(obj.words) ? obj.words : []);
    const out = [];
    arr.forEach(e => {
      if (typeof e === 'string') { out.push({ word: e }); return; }
      if (!e || typeof e !== 'object') return;
      const w = String(e.word ?? e.单词 ?? e.w ?? '').trim();
      if (!w) return;
      out.push({
        word: w,
        phonetic: String(e.phonetic ?? e.音标 ?? '').trim(),
        pos: String(e.pos ?? e.词性 ?? '').trim(),
        meaning: String(e.meaning ?? e.释义 ?? e.翻译 ?? e.def ?? '').trim(),
        example: String(e.example ?? e.例句 ?? e.sentence ?? '').trim(),
      });
    });
    return out;
  },

  looksTabular(text) {
    const lines = text.split('\n').filter(l => l.trim()).slice(0, 20);
    if (lines.length < 2) return false;
    const tab = lines.filter(l => l.includes('\t') || l.includes('|')).length;
    const comma = lines.filter(l => l.split(',').length >= 3).length;
    return tab >= lines.length * 0.6 || comma >= lines.length * 0.6;
  },

  parseTable(text) {
    const lines = text.split('\n').filter(l => l.trim());
    const delim = text.includes('\t') ? '\t' : (text.includes('|') ? '|' : ',');
    const clean = s => String(s).replace(/^["']|["']$/g, '').trim();
    const out = [];
    lines.forEach(line => {
      let cols = line.split(delim).map(clean).filter(c => c !== '');
      if (delim === '|' && cols.length) cols = cols.map(c => c.replace(/^\||\|$/g, '').trim()).filter(Boolean);
      if (cols.length < 2) return;
      /* 跳过表头（word/单词/音标 开头的一行） */
      const h = cols[0].toLowerCase();
      if (h === 'word' || h === 'words' || cols[0] === '单词') return;
      const e = { word: cols[0], phonetic: '', pos: '', meaning: '', example: '' };
      if (cols.length >= 5) { e.phonetic = cols[1]; e.pos = cols[2]; e.meaning = cols[3]; e.example = cols.slice(4).join(' '); }
      else if (cols.length === 4) { e.phonetic = cols[1]; e.pos = ''; e.meaning = cols[2]; e.example = cols[3]; }
      else if (cols.length === 3) { e.phonetic = cols[1]; e.meaning = cols[2]; }
      else { e.meaning = cols.slice(1).join('；'); }
      if (/^[a-zA-Z][a-zA-Z' \-]+$/.test(e.word)) out.push(e);
    });
    return out;
  },

  /* 「中文释义. An English example sentence.」→ 拆成释义与例句 */
  splitMeaningExample(m) {
    m = String(m || '').trim();
    const toks = m.split(/\s+/);
    if (!/[\u4e00-\u9fff]/.test(m)) return { meaning: m, example: '' };
    for (let i = 1; i < toks.length; i++) {
      const rest = toks.slice(i).join(' ');
      if (/^[A-Z][a-zA-Z,'’\- ;:"()]*[.!?]$/.test(rest)) {
        return { meaning: toks.slice(0, i).join(' ').replace(/[.。\s]+$/, ''), example: rest };
      }
    }
    return { meaning: m, example: '' };
  },

  parseLines(text) {
    const out = [];
    const POS_RE = /^(n|v|vt|vi|adj|adv|prep|conj|pron|art|num|int|aux|phr|abbr)\.$/i;
    text.split('\n').forEach(line => {
      line = line.trim().replace(/^[-*•\d]+[.、)]?\s*/, '');
      if (!line || line.startsWith('#')) return;
      /* 分隔符优先级：| 、tab 、多空格 */
      let parts = null;
      if (line.includes('|')) parts = line.split('|');
      else if (line.includes('\t')) parts = line.split('\t');
      else parts = line.split(/\s{2,}/);
      if (parts.length < 2) {
        /* 单空格启发式：首 token 是英文单词，其余按音标/词性/释义归类 */
        const toks = line.split(/\s+/);
        if (toks.length < 2 || !/^[a-zA-Z][a-zA-Z'\-]*$/.test(toks[0])) return;
        const e = { word: toks[0], phonetic: '', pos: '', meaning: '', example: '' };
        toks.slice(1).forEach(t => {
          if (!e.phonetic && /[\/\[\u0300-\u036f\u02b0-\u02ff\u0370-\u03ff]/.test(t)) e.phonetic = t;
          else if (!e.pos && POS_RE.test(t)) e.pos = t;
          else e.meaning = (e.meaning ? e.meaning + ' ' : '') + t;
        });
        const se = this.splitMeaningExample(e.meaning);
        e.meaning = se.meaning;
        e.example = se.example;
        out.push(e);
        return;
      }
      parts = parts.map(p => p.trim()).filter(Boolean);
      const e = { word: parts[0], phonetic: '', pos: '', meaning: '', example: '' };
      let idx = 1;
      if (idx < parts.length && (/[\/\[\u0300-\u036f\u02b0-\u02ff\u0370-\u03ff]/.test(parts[idx]) || /^[\u0250-\u02ff\u0370-\u03ff\/\.\u00b7]+$/.test(parts[idx]))) e.phonetic = parts[idx++];
      if (idx < parts.length && POS_RE.test(parts[idx])) e.pos = parts[idx++];
      e.meaning = parts[idx++] || '';
      e.example = parts.slice(idx).join(' ');
      if (/^[a-zA-Z][a-zA-Z'\- ]+$/.test(e.word)) out.push(e);
    });
    return out;
  },
};
