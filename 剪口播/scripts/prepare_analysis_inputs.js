#!/usr/bin/env node
/**
 * Prepare readable.txt and sentences.txt from subtitles_words.json.
 *
 * Usage:
 *   node prepare_analysis_inputs.js <subtitles_words.json> [out_dir]
 */

const fs = require('fs');
const path = require('path');

const wordsFile = process.argv[2];
const outDir = process.argv[3] || '.';

if (!wordsFile || !fs.existsSync(wordsFile)) {
  console.error('❌ 找不到字幕文件:', wordsFile || '<empty>');
  process.exit(1);
}

fs.mkdirSync(outDir, {recursive: true});

const data = JSON.parse(fs.readFileSync(wordsFile, 'utf8'));
if (!Array.isArray(data)) {
  console.error('❌ subtitles_words.json 必须是数组');
  process.exit(1);
}

const readable = [];
data.forEach((w, i) => {
  if (w.isGap) {
    const dur = (w.end - w.start).toFixed(2);
    if (Number(dur) >= 0.2) {
      readable.push(`${i}|[静${dur}s]|${w.start.toFixed(2)}-${w.end.toFixed(2)}`);
    }
  } else {
    readable.push(`${i}|${w.text}|${w.start.toFixed(2)}-${w.end.toFixed(2)}`);
  }
});

const sentences = [];
let curr = {text: '', startIdx: -1, endIdx: -1};

data.forEach((w, i) => {
  const isLongGap = w.isGap && (w.end - w.start) >= 0.5;
  if (isLongGap) {
    if (curr.text.length > 0) sentences.push({...curr});
    curr = {text: '', startIdx: -1, endIdx: -1};
  } else if (!w.isGap) {
    if (curr.startIdx === -1) curr.startIdx = i;
    curr.text += w.text;
    curr.endIdx = i;
  }
});
if (curr.text.length > 0) sentences.push(curr);

const sentenceLines = sentences.map((s, i) => `${i}|${s.startIdx}-${s.endIdx}|${s.text}`);

fs.writeFileSync(path.join(outDir, 'readable.txt'), readable.join('\n'));
fs.writeFileSync(path.join(outDir, 'sentences.txt'), sentenceLines.join('\n'));

console.log(`✅ 已生成 readable.txt (${readable.length} 行)`);
console.log(`✅ 已生成 sentences.txt (${sentences.length} 句)`);
