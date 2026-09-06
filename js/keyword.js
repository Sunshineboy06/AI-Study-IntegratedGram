'use strict';

/* ---------- 简答题关键词匹配 ---------- */

/* 归一化：转小写、去掉空白与中英文标点/符号 */
function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

/* 逐个关键词判断是否被作答包含 */
function matchKeywords(userAnswer, keywords) {
  const ans = normalizeText(userAnswer);
  return (keywords || []).map(k => ({ keyword: k, hit: ans.includes(normalizeText(k)) }));
}

function keywordScore(detail) {
  if (!detail || !detail.length) return { hits: 0, total: 0, ratio: 0 };
  const hits = detail.filter(d => d.hit).length;
  return { hits, total: detail.length, ratio: hits / detail.length };
}
