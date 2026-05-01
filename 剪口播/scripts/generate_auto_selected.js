#!/usr/bin/env node
/**
 * 生成自动预选删除列表。
 *
 * 听感优先：
 * - 同一句内部 >=0.18s 停顿默认删除
 * - <=0.8s 句间停顿默认保留
 * - 0.8-1.2s 只记录到分析报告，不预选
 * - >=1.2s 长停顿预选删除
 * - 开头 >=0.3s 静音预选删除
 *
 * 用法:
 *   node generate_auto_selected.js ../1_转录/subtitles_words.json [out_dir] [volcengine_result.json]
 *
 * 输出:
 *   auto_selected.json
 *   静音分析.md
 */

const fs = require('fs');
const path = require('path');

const input = process.argv[2] || '../1_转录/subtitles_words.json';
const outDir = process.argv[3] || '.';
const transcriptInput = process.argv[4] || path.join(path.dirname(input), 'volcengine_result.json');
const IN_SENTENCE_PAUSE_THRESHOLD = 0.18;

if (!fs.existsSync(input)) {
  console.error('找不到字幕文件:', input);
  process.exit(1);
}

fs.mkdirSync(outDir, {recursive: true});

const words = JSON.parse(fs.readFileSync(input, 'utf8'));
const selected = new Set();
const inSentence = [];
const watch = [];
const kept = [];
let utterances = [];

if (fs.existsSync(transcriptInput)) {
  const transcript = JSON.parse(fs.readFileSync(transcriptInput, 'utf8'));
  utterances = (transcript.utterances || [])
    .filter(u => Number.isFinite(u.start_time) && Number.isFinite(u.end_time))
    .map(u => ({
      start: u.start_time / 1000,
      end: u.end_time / 1000,
      text: String(u.text || '').trim(),
    }));
}

function findContainingUtterance(start, end) {
  return utterances.find(u => start >= u.start - 0.001 && end <= u.end + 0.001);
}

for (let i = 0; i < words.length;) {
  const w = words[i];
  if (!w.isGap) {
    i++;
    continue;
  }

  const run = [];
  let j = i;
  while (j < words.length && words[j].isGap) {
    run.push(j);
    j++;
  }

  const first = words[run[0]];
  const last = words[run[run.length - 1]];
  const dur = Number((last.end - first.start).toFixed(3));

  const row = {
    idx: run.length === 1 ? String(run[0]) : `${run[0]}-${run[run.length - 1]}`,
    start: Number(first.start.toFixed(2)),
    end: Number(last.end.toFixed(2)),
    dur: Number(dur.toFixed(2)),
  };

  const isOpeningSilence = first.start <= 0.3 && dur >= 0.3;
  const isLongPause = dur >= 1.2;
  const containingUtterance = findContainingUtterance(first.start, last.end);
  const isInSentencePause = containingUtterance && dur >= IN_SENTENCE_PAUSE_THRESHOLD;

  if (isOpeningSilence || isLongPause) {
    run.forEach(idx => selected.add(idx));
  } else if (isInSentencePause) {
    run.forEach(idx => selected.add(idx));
    inSentence.push({...row, sentence: containingUtterance.text});
  } else if (dur >= 0.8) {
    watch.push(row);
  } else {
    kept.push(row);
  }

  i = j;
}

const selectedList = [...selected].sort((a, b) => a - b);
fs.writeFileSync(path.join(outDir, 'auto_selected.json'), JSON.stringify(selectedList, null, 2));

const md = [
  '# 静音分析',
  '',
  `听感优先策略：同一句内部 ≥${IN_SENTENCE_PAUSE_THRESHOLD}s 预选删除；句间 ≤0.8s 保留；句间 0.8-1.2s 只记录；≥1.2s 预选删除；开头 ≥0.3s 静音预选删除。`,
  '',
  `- 预选删除静音元素: ${selectedList.length}`,
  `- 句中停顿预选: ${inSentence.length}`,
  `- 仅记录待人工判断: ${watch.length}`,
  `- 默认保留短停顿: ${kept.length}`,
  '',
  '## 句中停顿，预选删除',
  '',
  '| idx | 时间 | 时长 | 所在句 |',
  '|---:|---|---:|---|',
  ...inSentence.map(g => `| ${g.idx} | ${g.start.toFixed(2)}-${g.end.toFixed(2)} | ${g.dur.toFixed(2)}s | ${g.sentence.replace(/\|/g, '/')} |`),
  '',
  '## 仅记录，不预选',
  '',
  '| idx | 时间 | 时长 |',
  '|---:|---|---:|',
  ...watch.map(g => `| ${g.idx} | ${g.start.toFixed(2)}-${g.end.toFixed(2)} | ${g.dur.toFixed(2)}s |`),
  '',
].join('\n');

fs.writeFileSync(path.join(outDir, '静音分析.md'), md);

console.log(`预选删除静音元素: ${selectedList.length}`);
console.log(`仅记录待人工判断: ${watch.length}`);
console.log(`默认保留短停顿: ${kept.length}`);
