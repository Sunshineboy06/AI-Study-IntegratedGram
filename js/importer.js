'use strict';

/* ---------- 题库 JSON 导入与规范化 ---------- */
const TYPE_MAP = {
  single: 'single', '单选': 'single', '单选题': 'single',
  multi: 'multi', '多选': 'multi', '多选题': 'multi',
  fill: 'fill', '填空': 'fill', '填空题': 'fill',
  short: 'short', '简答': 'short', '简答题': 'short', '问答': 'short', '主观题': 'short',
};

/* 把 answer 字段解析为选项下标（兼容 "A"、"A."、"A、"、全角点、数组等多种写法） */
function answerIndexes(q) {
  const opts = q.options || [];
  const clean = s => String(s).trim().toUpperCase().replace(/\s+/g, '');

  if (q.type === 'multi') {
    const raw = Array.isArray(q.answer) ? q.answer.map(clean).join('') : clean(q.answer);
    const ls = raw.replace(/[^A-Z]/g, '').split('');
    let idxs = ls.map(l => opts.findIndex(o => {
      const c = clean(o);
      return c.startsWith(l + '.') || c.startsWith(l + '．') || c.startsWith(l + '、') || c === l;
    })).filter(i => i >= 0);
    if (!idxs.length) idxs = ls.map(l => l.charCodeAt(0) - 65).filter(i => i >= 0 && i < opts.length);
    return [...new Set(idxs)].sort((a, b) => a - b);
  }

  const a = clean(q.answer);
  let i = opts.findIndex(o => {
    const c = clean(o);
    return c.startsWith(a + '.') || c.startsWith(a + '．') || c.startsWith(a + '、') || c === a;
  });
  const am = a.replace(/[^A-Z]/g, '');
  if (i < 0 && am.length === 1) {
    i = opts.findIndex(o => {
      const c = clean(o);
      return c.startsWith(am + '.') || c.startsWith(am + '．') || c.startsWith(am + '、');
    });
  }
  if (i < 0 && am.length === 1) i = am.charCodeAt(0) - 65;
  if (i < 0 && a.length >= 2) i = opts.findIndex(o => clean(o).includes(a));
  return i >= 0 ? [i] : [];
}

/* 从简答题参考答案中自动提取关键词（未预置 keywords 时的兜底方案） */
function extractKeywords(text, max = 6) {
  const toks = String(text || '')
    .split(/[，。；、！？：,,.;:!?\s（）()""''\[\]【】]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && t.length <= 12);
  const freq = {};
  toks.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
  const scored = Object.keys(freq)
    .map(t => ({ t, s: freq[t] * 2 + Math.min(t.length, 5) }))
    .sort((a, b) => b.s - a.s);
  const out = [];
  for (const { t } of scored) {
    if (out.length >= max) break;
    if (out.some(k => k.includes(t) || t.includes(k))) continue;
    out.push(t);
  }
  return out;
}

function normalizeQuestion(raw, i) {
  const tRaw = String(raw.type ?? raw.题型 ?? '').trim().toLowerCase();
  const type = TYPE_MAP[tRaw] || TYPE_MAP[String(raw.type ?? raw.题型 ?? '').trim()];
  if (!type) throw new Error(`第 ${i + 1} 题：无法识别的题型 "${raw.type ?? raw.题型}"（支持 single/单选、multi/多选、fill/填空、short/简答）`);

  const stem = String(raw.stem ?? raw.question ?? raw.题干 ?? raw.title ?? '').trim();
  if (!stem) throw new Error(`第 ${i + 1} 题：缺少题干（stem）`);

  let options = raw.options ?? raw.选项 ?? [];
  if (typeof options === 'string') options = options.split('\n');
  options = options.map(o => String(o).trim()).filter(Boolean);
  if ((type === 'single' || type === 'multi') && options.length < 2) {
    throw new Error(`第 ${i + 1} 题：选择题至少需要 2 个选项（options）`);
  }

  const answer = raw.answer ?? raw.答案;
  if (type !== 'short' && (answer === undefined || answer === null || answer === '')) {
    throw new Error(`第 ${i + 1} 题：缺少答案（answer）`);
  }

  let keywords = raw.keywords ?? raw.关键词 ?? [];
  if (typeof keywords === 'string') keywords = keywords.split(/[,，、;；]+/);
  keywords = keywords.map(k => String(k).trim()).filter(Boolean);

  const q = {
    id: String(raw.id ?? raw.编号 ?? `q${i + 1}`),
    type,
    chapter: String(raw.chapter ?? raw.章节 ?? '').trim(),
    stem,
    options: (type === 'single' || type === 'multi') ? options : [],
    answer,
    note: String(raw.note ?? raw.解析 ?? raw.注释 ?? raw.annotation ?? '').trim(),
    refAnswer: String(raw.refAnswer ?? raw.参考答案 ?? '').trim(),
    keywords,
    difficulty: Number(raw.difficulty ?? raw.难度 ?? 0) || 0,
  };

  if (type === 'short' && !q.keywords.length && q.refAnswer) {
    q.keywords = extractKeywords(q.refAnswer);
    q._autoKw = q.keywords.length > 0;
  }

  if (type === 'fill') {
    q._blanks = (Array.isArray(answer) ? answer : [answer]).map(s => String(s).trim());
    if (q._blanks.some(s => !s)) throw new Error(`第 ${i + 1} 题：填空题答案不能为空`);
    const markers = q.stem.match(/_{3,}|＿{3,}/g);
    const markCount = markers ? markers.length : 0;
    if (markCount > 0 && markCount !== q._blanks.length) {
      q._stemNoMarkers = true;   // 标记数与答案数不一致：不内嵌空位，按逐空列表作答
      q._blankCount = q._blanks.length;
    } else {
      q._blankCount = markCount || q._blanks.length;
    }
  }

  q._answerIdxs = (type === 'single' || type === 'multi') ? answerIndexes(q) : [];
  if ((type === 'single' || type === 'multi') && !q._answerIdxs.length) {
    throw new Error(`第 ${i + 1} 题：答案 "${answer}" 无法匹配到任何选项`);
  }
  return q;
}

/* 支持两种形态：{name, questions:[...]} 或题目数组 */
function parseBankJSON(text) {
  text = String(text).replace(/^\uFEFF/, '').trim();
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw new Error('JSON 解析失败：' + e.message); }
  let name, questions;
  if (Array.isArray(obj)) {
    questions = obj;
    name = '';
  } else {
    questions = obj.questions ?? obj.题目 ?? obj.data;
    name = obj.name ?? obj.title ?? obj.名称 ?? (obj.meta && obj.meta.subject) ?? '';
  }
  if (!Array.isArray(questions) || !questions.length) {
    throw new Error('未找到题目数组：需要 {"name":"课程名","questions":[...]} 或题目数组');
  }
  const qs = questions.map(normalizeQuestion);
  if (!name) name = '导入题库 ' + new Date().toLocaleDateString();
  return { name, questions: qs };
}

function normalizeImportedBank(raw, opts = {}) {
  const qs = (raw.questions || []).map(normalizeQuestion);
  return {
    id: uid('bank'),
    name: opts.name || raw.name || '未命名题库',
    source: opts.source || 'import',
    importedAt: Date.now(),
    folderId: opts.folderId || '',
    questions: qs,
  };
}

/* ---------- Markdown 知识点大纲解析 ---------- */

/* 「知识点：说明」→ 冒号后作为节点说明，在脑图详情面板展示 */
function mkOutlineNode(text) {
  const parts = String(text).split(/[:：]/);
  const name = (parts[0] || '').trim() || String(text).trim();
  const note = parts.slice(1).join('：').trim();
  return { name, note, children: [] };
}

function parseOutlineMarkdown(md) {
  const lines = String(md).replace(/\r/g, '').replace(/\t/g, '  ').split('\n');
  const root = { name: '知识框架', note: '', children: [] };
  const stack = [{ level: 0, node: root }];
  let curHeadingLevel = 0;

  const attach = (level, node) => {
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) parent.node.children.push(node);
    else root.children.push(node);
    stack.push({ level, node });
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      curHeadingLevel = h[1].length;
      attach(curHeadingLevel, mkOutlineNode(h[2]));
      continue;
    }
    const dash = line.match(/^(\s*)[-*•]\s*(.+)$/);
    const num = line.match(/^(\s*)(\d+[.、．])\s*(.+)$/);
    if (dash || num) {
      const indent = Math.floor(((dash || num)[1] || '').length / 2);
      const text = dash ? dash[2] : num[3];
      attach(curHeadingLevel + indent + 1, mkOutlineNode(text));
    }
    /* 其余行忽略 */
    }
  /* 只有一个一级标题时直接以它为根，避免脑图出现多余的虚拟根节点 */
  if (root.children.length === 1) return root.children[0];
  return root;
}

function countNodes(n) {
  return 1 + (n.children || []).reduce((s, c) => s + countNodes(c), 0);
}
