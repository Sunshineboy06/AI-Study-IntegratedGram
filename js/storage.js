'use strict';

/* ---------- 本地存储层：一次导入，永久保存 ---------- */
const Store = {
  KEY: 'studyAssist.v1',
  data: null,

  init() {
    let raw = null;
    try { raw = localStorage.getItem(this.KEY); } catch (e) { /* 隐私模式等场景忽略 */ }
    if (raw) {
      try { this.data = JSON.parse(raw); } catch (e) { this.data = null; }
    }
    if (!this.data || typeof this.data !== 'object') {
      this.data = { banks: [], outlines: [], wrongbook: [], flags: {} };
    }
    if (!Array.isArray(this.data.banks)) this.data.banks = [];
    if (!Array.isArray(this.data.outlines)) this.data.outlines = [];
    if (!Array.isArray(this.data.wrongbook)) this.data.wrongbook = [];
    if (!this.data.flags || typeof this.data.flags !== 'object') this.data.flags = {};
    /* 背景图片功能已移除：清理旧版本遗留数据，释放本地存储空间 */
    delete this.data.background;
    this.migrateFolders();
    this.migrateVocab();
    this.ensureSample();
    this.save();
  },

  /* ---------- 英语词库（全局，不按课程文件夹划分） ----------
     words 以小写单词为键；status 派生规则：
     - 未背诵（蓝）：reviewCount === 0
     - 学习中（黄）：reviewCount > 0 且未 mastered
     - 完全背诵（绿）：mastered（艾宾浩斯 6 节点走完，或手动"完全背诵"）
     艾宾浩斯：EB_STAGES = [0,1,2,4,7,15] 天，认识后进入下一节点，
     stageDueAt 为该节点到期时间；到期后复习且"认识"才推进。 */
  migrateVocab() {
    if (!this.data.vocab || typeof this.data.vocab !== 'object') this.data.vocab = {};
    const v = this.data.vocab;
    if (!v.words || typeof v.words !== 'object') v.words = {};
    if (!v.settings || typeof v.settings !== 'object') v.settings = {};
    if (typeof v.settings.dailyGoal !== 'number' || v.settings.dailyGoal < 10) v.settings.dailyGoal = 20;
    /* 发音设置：accent us=美式 / uk=英式；autoSpeak 背词时自动朗读 */
    if (v.settings.accent !== 'uk') v.settings.accent = 'us';
    if (typeof v.settings.autoSpeak !== 'boolean') v.settings.autoSpeak = true;
    if (typeof v.settings.speed !== 'number' || v.settings.speed <= 0) v.settings.speed = 1;
    if (!v.daily || typeof v.daily !== 'object') v.daily = {};
    Object.keys(v.words).forEach(k => {
      const w = v.words[k];
      w.word = String(w.word || k);
      w.phonetic = String(w.phonetic || '');
      w.pos = String(w.pos || '');
      w.meaning = String(w.meaning || '');
      w.example = String(w.example || '');
      w.fav = !!w.fav;
      w.addedAt = w.addedAt || Date.now();
      w.reviewCount = Number(w.reviewCount) || 0;
      w.stage = Number(w.stage) || 0;
      w.stageDueAt = Number(w.stageDueAt) || 0;
      w.mastered = !!w.mastered;
      w.masteredAt = Number(w.masteredAt) || 0;
      w.lastPickAt = Number(w.lastPickAt) || 0;
    });
  },

  wordStatus(w) {
    if (w.mastered) return 'mastered';     // 绿
    if (w.reviewCount > 0) return 'learning'; // 黄
    return 'new';                           // 蓝
  },

  /* 按小写单词取词条 */
  getWord(word) {
    return this.data.vocab.words[String(word || '').trim().toLowerCase()] || null;
  },

  /* 导入合并（防重复）：识别到词库中已有的单词时保留旧数据，直接跳过，
     不新增也不覆盖任何字段（复习进度、收藏状态天然不受影响） */
  addWords(list) {
    let added = 0, skipped = 0;
    list.forEach(e => {
      const key = String(e.word || '').trim().toLowerCase();
      if (!key) return;
      if (this.data.vocab.words[key]) { skipped++; return; }
      this.data.vocab.words[key] = {
        word: String(e.word).trim(),
        phonetic: String(e.phonetic || ''),
        pos: String(e.pos || ''),
        meaning: String(e.meaning || ''),
        example: String(e.example || ''),
        fav: false, addedAt: Date.now(),
        reviewCount: 0, stage: 0, stageDueAt: 0,
        mastered: false, masteredAt: 0, lastPickAt: 0,
      };
      added++;
    });
    this.save();
    return { added, skipped };
  },

  /* ---------- 每日目标 ---------- */
  _todayKey() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },

  getToday() {
    const key = this._todayKey();
    if (!this.data.vocab.daily[key]) this.data.vocab.daily[key] = { goal: this.data.vocab.settings.dailyGoal, done: 0, new: 0, review: 0 };
    return this.data.vocab.daily[key];
  },

  /* 任意日期的学习记录（缺省补 0），供日历/图表使用 */
  dayStat(key) {
    const r = this.data.vocab.daily[key] || {};
    return { done: r.done || 0, new: r.new || 0, review: r.review || 0, goal: r.goal || 0 };
  },

  _dateKey(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },

  /* 设定每日目标：初始 10–100；已学过之后只允许上调，累计上限 200 */
  setDailyGoal(n) {
    n = Math.floor(n);
    const today = this.getToday();
    const started = today.done > 0;
    if (started && n < today.goal) return false;   // 当天已开始背诵后不可下调
    n = Math.max(10, Math.min(200, n));
    if (!started && n > 100) n = 100;              // 首次设定 10–100
    today.goal = n;
    this.data.vocab.settings.dailyGoal = n;
    this.save();
    return true;
  },

  countStudied(mode) {
    const t = this.getToday();
    t.done++;
    if (mode === 'new') t.new = (t.new || 0) + 1;
    else if (mode === 'review') t.review = (t.review || 0) + 1;
    this.save();
  },

  /* ---------- 课程文件夹 ----------
     folders: [{id, name, createdAt}]；activeFolder 为当前选中文件夹 id，
     特殊值 '__all__' 表示"全部课程"（跨文件夹查看/使用所有数据）。
     旧数据没有 folderId 的题库/大纲在迁移时归入第一个文件夹。 */
  migrateFolders() {
    if (!Array.isArray(this.data.folders)) this.data.folders = [];
    if (!this.data.folders.length) {
      this.data.folders.push({ id: 'f-default', name: '默认课程', createdAt: Date.now() });
    }
    if (typeof this.data.activeFolder !== 'string' ||
        (this.data.activeFolder !== '__all__' &&
         !this.data.folders.some(f => f.id === this.data.activeFolder))) {
      this.data.activeFolder = this.data.folders[0].id;
    }
    const fallback = this.data.folders[0].id;
    this.data.banks.forEach(b => { if (typeof b.folderId !== 'string') b.folderId = fallback; });
    this.data.outlines.forEach(o => { if (typeof o.folderId !== 'string') o.folderId = fallback; });
  },

  folderName(id) {
    const f = this.data.folders.find(f => f.id === id);
    return f ? f.name : '未分类';
  },

  /* 当前文件夹范围内的题库/大纲（'__all__' 返回全部） */
  banks() {
    if (this.data.activeFolder === '__all__') return this.data.banks;
    return this.data.banks.filter(b => b.folderId === this.data.activeFolder);
  },

  outlines() {
    if (this.data.activeFolder === '__all__') return this.data.outlines;
    return this.data.outlines.filter(o => o.folderId === this.data.activeFolder);
  },

  /* 当前文件夹范围内可见的错题（按题库归属过滤；题库已删除的记录始终可见） */
  wrongbook() {
    if (this.data.activeFolder === '__all__') return this.data.wrongbook;
    const ids = new Set(this.banks().map(b => b.id));
    return this.data.wrongbook.filter(e => !e.bankId || ids.has(e.bankId));
  },

  setFolder(id) {
    if (id === this.data.activeFolder) return;
    this.data.activeFolder = id;
    this.save();
    Quiz._selBank = null;
    Mindmap.outlineId = null;
  },

  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.data));
    } catch (e) {
      toast('本地存储写入失败：' + e.message, 'error');
    }
  },

  /* 首次使用自动载入内置示例，之后打开无需任何导入即可使用；
     用户删除示例后会记住，不再重复添加。
     SAMPLE_VERSION 变化时自动替换旧内置示例（不影响用户自己导入的数据） */
  ensureSample() {
    const V = 2;
    const flags = this.data.flags;
    if ((flags.sampleV || 0) >= V) return;

    this.data.banks = this.data.banks.filter(x => x.source !== 'built-in');
    this.data.outlines = this.data.outlines.filter(x => x.source !== 'built-in');

    const fid = this.data.folders[0].id;
    if (!flags.sampleBankRemoved) {
      this.data.banks.push(normalizeImportedBank(SAMPLE_BANK, {
        source: 'built-in',
        name: SAMPLE_BANK.name + '（内置示例）',
        folderId: fid,
      }));
    }
    if (!flags.sampleOutlineRemoved) {
      this.data.outlines.push({
        id: uid('ol'),
        name: SAMPLE_OUTLINE_TITLE + '（内置示例）',
        source: 'built-in',
        importedAt: Date.now(),
        folderId: fid,
        tree: parseOutlineMarkdown(SAMPLE_OUTLINE_MD),
      });
    }
    flags.sampleV = V;
  },

  addWrong(q, bankId) {
    const bank = this.data.banks.find(b => b.id === bankId);
    const key = (bankId || 'unknown') + '/' + q.id;
    const e = this.data.wrongbook.find(w => w.key === key);
    if (e) { e.wrongCount++; e.lastWrong = Date.now(); }
    else {
      this.data.wrongbook.push({
        key,
        bankId: bankId || '',
        bankName: bank ? bank.name : '',
        q: JSON.parse(JSON.stringify(q)),
        wrongCount: 1,
        lastWrong: Date.now(),
      });
    }
  },

  removeWrong(key) {
    this.data.wrongbook = this.data.wrongbook.filter(w => w.key !== key);
  },

  bumpWrong(key) {
    const e = this.data.wrongbook.find(w => w.key === key);
    if (e) { e.wrongCount++; e.lastWrong = Date.now(); }
  },

  /* ---------- 背词操作 ---------- */
  DAY: 24 * 3600 * 1000,
  EB_STAGES: [0, 1, 2, 4, 7, 15],   // 天：认识后第 i+1 次复习应在该间隔后
  PICK_COOLDOWN: { learning: 1, mastered: 3 },  // 冷却天数：学习中 24h，完全背诵 3 天

  /* 点"认识"：今日进度 +1；到期则推进曲线节点，走完第 6 节点自动完全背诵 */
  markKnown(word, mode) {
    const w = this.getWord(word);
    if (!w) return;
    w.reviewCount++;
    if (!w.mastered) {
      const due = !w.stageDueAt || Date.now() >= w.stageDueAt;
      if (due) {
        w.stage = Math.min(w.stage + 1, this.EB_STAGES.length - 1);
        if (w.stage >= this.EB_STAGES.length - 1) {
          w.mastered = true;
          w.masteredAt = Date.now();
        } else {
          w.stageDueAt = Date.now() + this.EB_STAGES[w.stage] * this.DAY;
        }
      }
    }
    this.countStudied(mode);
    this.save();
  },

  /* 点"不认识"：计入进度与次数；未完全背诵的回退到第 1 节点重计，
     已完全背诵的降级回"学习中"并重新走曲线 */
  markUnknown(word, mode) {
    const w = this.getWord(word);
    if (!w) return;
    w.reviewCount++;
    w.mastered = false;
    w.masteredAt = 0;
    w.stage = 1;
    w.stageDueAt = Date.now() + this.EB_STAGES[1] * this.DAY;
    this.countStudied(mode);
    this.save();
  },

  /* 手动"完全背诵"：直接置绿 */
  forceMaster(word) {
    const w = this.getWord(word);
    if (!w) return;
    w.mastered = true;
    w.masteredAt = Date.now();
    w.stage = this.EB_STAGES.length - 1;
    this.save();
  },

  toggleFav(word) {
    const w = this.getWord(word);
    if (!w) return false;
    w.fav = !w.fav;
    this.save();
    return w.fav;
  },

  removeWord(word) {
    delete this.data.vocab.words[String(word || '').trim().toLowerCase()];
    this.save();
  },

  /* 分组列表（冷却判断在 pick 内做） */
  vocabGroups() {
    const g = { new: [], learning: [], mastered: [] };
    Object.values(this.data.vocab.words).forEach(w => g[this.wordStatus(w)].push(w));
    return g;
  },

  /* ---------- 加权随机抽词 ----------
     mode='new'：只抽未背诵（蓝）
     mode='review'：学习中:完全背诵 = 3:1（均尊重冷却），学习中到期者优先；无复习词时回落到未背诵
     mode='mix'：未背诵:学习中:完全背诵 = 5:3:1
     冷却：学习中抽中后 24h 内不再抽；完全背诵 3 天内不再抽；被冷却的组权重分给其余组 */
  pickWord(mode) {
    const g = this.vocabGroups();
    const now = Date.now();
    const cooled = w => {
      const cd = this.PICK_COOLDOWN[this.wordStatus(w)];
      if (!cd) return false;
      return now - (w.lastPickAt || 0) < cd * this.DAY;
    };
    const due = w => w.stage === 0 || !w.stageDueAt || now >= w.stageDueAt;

    let groups;
    if (mode === 'new') {
      groups = [[g.new, 1]];
    } else if (mode === 'review') {
      /* 学习中优先到期词，再全部学习中，最后完全背诵 */
      const dueLearn = g.learning.filter(due);
      if (dueLearn.length) return this._pickOne(dueLearn);
      groups = [[g.learning, 3], [g.mastered, 1]];
    } else {
      groups = [[g.new, 5], [g.learning, 3], [g.mastered, 1]];
    }

    const avail = groups.map(([arr, wt]) => [arr.filter(w => !cooled(w)), wt]);
    const totalW = avail.reduce((s, [arr, wt]) => s + (arr.length ? wt : 0), 0);
    if (!totalW) {
      /* 全部被冷却：忽略冷却兜底，避免无词可抽 */
      const pool = groups.map(([a]) => a).reduce((s, a) => { s.push(...a); return s; }, []);
      if (!pool.length) return null;
      return this._pickOne(pool);
    }
    let r = Math.random() * totalW;
    for (const [arr, wt] of avail) {
      if (!arr.length) continue;
      if (r < wt) return arr[Math.floor(Math.random() * arr.length)];
      r -= wt;
    }
    return null;
  },

  _pickOne(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  },

  /* 记录"已抽中"：写入冷却时间 */
  touchPick(word) {
    const w = this.getWord(word);
    if (w) { w.lastPickAt = Date.now(); this.save(); }
  },
};
