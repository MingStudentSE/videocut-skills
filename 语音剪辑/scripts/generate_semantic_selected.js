#!/usr/bin/env node
/**
 * 语义口误筛查：在保留自然停顿的基础上，追加重说、残句、句内重复等预选删除。
 *
 * 输入:
 *   node generate_semantic_selected.js ../1_转录/subtitles_words.json auto_selected.json [out_dir]
 *
 * 输出:
 *   auto_selected.json   合并后的预选 idx
 *   语义分析.md
 */

const fs = require('fs');
const path = require('path');

const wordsFile = process.argv[2] || '../1_转录/subtitles_words.json';
const selectedFile = process.argv[3] || 'auto_selected.json';
const outDir = process.argv[4] || '.';

if (!fs.existsSync(wordsFile)) {
  console.error('找不到字幕文件:', wordsFile);
  process.exit(1);
}

const words = JSON.parse(fs.readFileSync(wordsFile, 'utf8'));
const selected = new Set(fs.existsSync(selectedFile) ? JSON.parse(fs.readFileSync(selectedFile, 'utf8')) : []);

const norm = (s) => String(s || '')
  .replace(/[\s\u200b，。！？、；：,.!?;:\-—_`'"“”‘’（）()【】\[\]<>《》\/\\|~·*#]/g, '')
  .toLowerCase();

function addRange(startIdx, endIdx, reason, content, rows) {
  if (startIdx < 0 || endIdx < startIdx) return;
  for (let i = startIdx; i <= endIdx; i++) selected.add(i);
  const start = words[startIdx]?.start ?? 0;
  const end = words[endIdx]?.end ?? start;
  rows.push({range: `${startIdx}-${endIdx}`, time: `${start.toFixed(2)}-${end.toFixed(2)}`, reason, content});
}

function buildSentences() {
  const sentences = [];
  let curr = {text: '', startIdx: -1, endIdx: -1};
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const isLongGap = w.isGap && (w.end - w.start) >= 0.5;
    if (isLongGap) {
      if (curr.text) sentences.push({...curr});
      curr = {text: '', startIdx: -1, endIdx: -1};
    } else if (!w.isGap) {
      if (curr.startIdx === -1) curr.startIdx = i;
      curr.text += w.text;
      curr.endIdx = i;
    }
  }
  if (curr.text) sentences.push(curr);
  return sentences;
}

function commonPrefixLen(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

function longestCommonSubstring(a, b) {
  let best = '';
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 4; j <= a.length; j++) {
      const sub = a.slice(i, j);
      if (sub.length > best.length && b.includes(sub)) best = sub;
    }
  }
  return best;
}

function isSubstantialCorrection(curNorm, nextNorm, overlap, prefix) {
  if (!overlap) return false;
  const overlapRatio = overlap.length / Math.max(1, curNorm.length);
  const curIncomplete = /的$|这个$|我们$|然后$|接下来$|成功的$|可以$|需要$/.test(curNorm);

  // 同开头的相邻重说，或者前一句明显没说完，才删前保后。
  if (prefix >= 4 && overlap.length >= 6) return true;
  if (curIncomplete && overlap.length >= 6 && overlapRatio >= 0.45) return true;

  // 前一句几乎被后一句覆盖，常见于“说了一半又完整重来”。
  if (overlapRatio >= 0.7 && curNorm.length < nextNorm.length) return true;

  return false;
}

function findSentenceInternalRepeat(s) {
  const t = norm(s.text);
  const max = Math.floor(t.length / 2);
  for (let len = Math.min(14, max); len >= 4; len--) {
    for (let i = 0; i + len * 2 <= t.length; i++) {
      const a = t.slice(i, i + len);
      const rest = t.slice(i + len);
      const next = rest.indexOf(a);
      if (next >= 0 && next <= 4) return true;
    }
  }
  return false;
}

const sentences = buildSentences();
const findings = [];

for (let i = 0; i < sentences.length; i++) {
  const cur = sentences[i];
  const next = sentences[i + 1];
  const curNorm = norm(cur.text);
  const nextNorm = next ? norm(next.text) : '';

  if (!curNorm) continue;

  // 很短的残句，后面接更完整句子时删前保后。
  if (next && curNorm.length <= 8 && nextNorm.length >= 12) {
    const overlap = longestCommonSubstring(curNorm, nextNorm);
    const startsSame = commonPrefixLen(curNorm, nextNorm) >= 2;
    if (overlap.length >= 3 || startsSame || /^(好|首先|然后|接下来|我们|那|这个|去|win|cloud|version)$/i.test(curNorm)) {
      addRange(cur.startIdx, cur.endIdx, '残句/重说前半句', cur.text, findings);
      continue;
    }
  }

  if (next) {
    const prefix = commonPrefixLen(curNorm, nextNorm);
    if (prefix >= 5) {
      addRange(cur.startIdx, cur.endIdx, '相邻句开头重复，删前保后', cur.text, findings);
      continue;
    }

    const overlap = longestCommonSubstring(curNorm, nextNorm);
    if (isSubstantialCorrection(curNorm, nextNorm, overlap, prefix)) {
      addRange(cur.startIdx, cur.endIdx, '隔句/相邻重说纠正，删较不完整前句', cur.text, findings);
      continue;
    }
  }

  if (findSentenceInternalRepeat(cur)) {
    // 第一版保守处理：整句预选，审核页人工可取消。
    addRange(cur.startIdx, cur.endIdx, '句内重复，需要人工确认删除重复部分', cur.text, findings);
  }

  // 明显口头卡顿词单句。
  if (/^(嗯+|啊+|呃+|那个+|就是+|好+|首先呢我们|那我们这里|去)$/i.test(curNorm)) {
    addRange(cur.startIdx, cur.endIdx, '孤立卡顿词/口头起手', cur.text, findings);
  }
}

const selectedList = [...selected].sort((a, b) => a - b);
fs.writeFileSync(selectedFile, JSON.stringify(selectedList, null, 2));

const lines = [
  '# 语义口误分析',
  '',
  `- 追加语义发现: ${findings.length}`,
  `- 合并后预选元素: ${selectedList.length}`,
  '',
  '| idx | 时间 | 类型 | 内容 |',
  '|---|---|---|---|',
  ...findings.map(f => `| ${f.range} | ${f.time} | ${f.reason} | ${f.content.replace(/\|/g, '/')} |`),
  '',
];
fs.writeFileSync(path.join(outDir, '语义分析.md'), lines.join('\n'));

console.log(`追加语义发现: ${findings.length}`);
console.log(`合并后预选元素: ${selectedList.length}`);
