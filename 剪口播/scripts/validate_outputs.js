#!/usr/bin/env node
/**
 * Validate core videocut pipeline artifacts.
 *
 * Usage:
 *   node validate_outputs.js --base output/YYYY-MM-DD_视频名/剪口播
 *   node validate_outputs.js --transcript 1_转录/volcengine_result.json --words 1_转录/subtitles_words.json
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const base = args.base ? path.resolve(args.base) : null;

const files = {
  transcript: args.transcript || (base && path.join(base, '1_转录', 'volcengine_result.json')),
  request: args.request || (base && path.join(base, '1_转录', 'volcengine_request.json')),
  words: args.words || (base && path.join(base, '1_转录', 'subtitles_words.json')),
  selected: args.selected || (base && path.join(base, '2_分析', 'auto_selected.json')),
  deleteSegments: args['delete-segments'] || (base && path.join(base, '3_审核', 'delete_segments.json')),
  review: args.review || (base && path.join(base, '3_审核', 'review.html')),
};

const errors = [];
const warnings = [];
const summary = {};

function exists(file) {
  return file && fs.existsSync(file);
}

function readJson(file, label, required = true) {
  if (!file) {
    if (required) errors.push(`${label}: 未指定文件路径`);
    return null;
  }
  if (!fs.existsSync(file)) {
    if (required) errors.push(`${label}: 文件不存在 ${file}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    errors.push(`${label}: JSON 解析失败 ${err.message}`);
    return null;
  }
}

function finite(n) {
  return Number.isFinite(n);
}

function validateTranscript(file) {
  const data = readJson(file, 'volcengine_result.json');
  if (!data) return null;
  if (!Array.isArray(data.utterances)) {
    errors.push('volcengine_result.json: utterances 必须是数组');
    return null;
  }
  if (data.utterances.length === 0) {
    warnings.push('volcengine_result.json: utterances 为空');
  }

  let wordCount = 0;
  data.utterances.forEach((u, ui) => {
    if (!finite(u.start_time) || !finite(u.end_time)) {
      errors.push(`volcengine_result.json: utterances[${ui}] 缺少有效 start_time/end_time`);
    } else if (u.end_time < u.start_time) {
      errors.push(`volcengine_result.json: utterances[${ui}] end_time 小于 start_time`);
    }
    if (typeof u.text !== 'string') {
      errors.push(`volcengine_result.json: utterances[${ui}].text 必须是字符串`);
    }
    if (!Array.isArray(u.words)) {
      errors.push(`volcengine_result.json: utterances[${ui}].words 必须存在，剪口播需要 show_utterances=true`);
      return;
    }
    u.words.forEach((w, wi) => {
      wordCount++;
      if (typeof w.text !== 'string') {
        errors.push(`volcengine_result.json: utterances[${ui}].words[${wi}].text 必须是字符串`);
      }
      if (!finite(w.start_time) || !finite(w.end_time)) {
        errors.push(`volcengine_result.json: utterances[${ui}].words[${wi}] 缺少有效 start_time/end_time`);
      } else if (w.end_time < w.start_time) {
        errors.push(`volcengine_result.json: utterances[${ui}].words[${wi}] end_time 小于 start_time`);
      }
    });
  });

  summary.utterances = data.utterances.length;
  summary.transcriptWords = wordCount;
  return data;
}

function validateWords(file) {
  const data = readJson(file, 'subtitles_words.json');
  if (!data) return null;
  if (!Array.isArray(data)) {
    errors.push('subtitles_words.json: 必须是数组');
    return null;
  }
  let lastEnd = 0;
  data.forEach((w, i) => {
    if (typeof w.text !== 'string') {
      errors.push(`subtitles_words.json: [${i}].text 必须是字符串`);
    }
    if (typeof w.isGap !== 'boolean') {
      errors.push(`subtitles_words.json: [${i}].isGap 必须是布尔值`);
    }
    if (!finite(w.start) || !finite(w.end)) {
      errors.push(`subtitles_words.json: [${i}] 缺少有效 start/end`);
    } else {
      if (w.start < 0 || w.end < 0) errors.push(`subtitles_words.json: [${i}] 时间不能为负`);
      if (w.end < w.start) errors.push(`subtitles_words.json: [${i}] end 小于 start`);
      if (w.start + 0.01 < lastEnd) warnings.push(`subtitles_words.json: [${i}] 时间早于前一元素结束`);
      lastEnd = Math.max(lastEnd, w.end);
    }
  });
  summary.subtitleElements = data.length;
  summary.textElements = data.filter(w => !w.isGap).length;
  summary.gapElements = data.filter(w => w.isGap).length;
  return data;
}

function validateSelected(file, words) {
  const data = readJson(file, 'auto_selected.json');
  if (!data) return;
  if (!Array.isArray(data)) {
    errors.push('auto_selected.json: 必须是数组');
    return;
  }
  const seen = new Set();
  data.forEach((idx, i) => {
    if (!Number.isInteger(idx)) {
      errors.push(`auto_selected.json: [${i}] 必须是整数 idx`);
      return;
    }
    if (words && (idx < 0 || idx >= words.length)) {
      errors.push(`auto_selected.json: [${i}] idx ${idx} 超出 subtitles_words 范围`);
    }
    if (seen.has(idx)) warnings.push(`auto_selected.json: idx ${idx} 重复`);
    seen.add(idx);
    if (i > 0 && data[i - 1] > idx) warnings.push('auto_selected.json: 建议按升序排序');
  });
  summary.autoSelected = data.length;
}

function validateDeleteSegments(file) {
  if (!exists(file)) return;
  const data = readJson(file, 'delete_segments.json', false);
  if (!data) return;
  if (!Array.isArray(data)) {
    errors.push('delete_segments.json: 必须是数组');
    return;
  }
  let lastEnd = 0;
  data.forEach((seg, i) => {
    if (!finite(seg.start) || !finite(seg.end)) {
      errors.push(`delete_segments.json: [${i}] 缺少有效 start/end`);
    } else {
      if (seg.start < 0 || seg.end < 0) errors.push(`delete_segments.json: [${i}] 时间不能为负`);
      if (seg.end <= seg.start) errors.push(`delete_segments.json: [${i}] end 必须大于 start`);
      if (seg.start < lastEnd) warnings.push(`delete_segments.json: [${i}] 与前一段重叠或未排序`);
      lastEnd = Math.max(lastEnd, seg.end);
    }
  });
  summary.deleteSegments = data.length;
}

function validateRequest(file) {
  if (!exists(file)) return;
  const data = readJson(file, 'volcengine_request.json', false);
  if (!data) return;
  if (data.request && data.request.show_utterances !== true) {
    errors.push('volcengine_request.json: request.show_utterances 必须为 true');
  }
  const context = data.request && data.request.corpus && data.request.corpus.context;
  if (context) {
    try {
      const parsed = JSON.parse(context);
      summary.hotwords = Array.isArray(parsed.hotwords) ? parsed.hotwords.length : 0;
    } catch (err) {
      warnings.push(`volcengine_request.json: corpus.context 不是合法 JSON 字符串: ${err.message}`);
    }
  }
}

validateRequest(files.request);
validateTranscript(files.transcript);
const words = validateWords(files.words);
validateSelected(files.selected, words);
validateDeleteSegments(files.deleteSegments);

if (exists(files.review)) {
  summary.reviewHtml = files.review;
} else if (args['require-review']) {
  errors.push(`review.html: 文件不存在 ${files.review}`);
}

if (args.json) {
  console.log(JSON.stringify({ok: errors.length === 0, summary, warnings, errors}, null, 2));
} else {
  console.log('校验摘要:', JSON.stringify(summary));
  warnings.forEach(w => console.warn('⚠️ ' + w));
  errors.forEach(e => console.error('❌ ' + e));
  if (errors.length === 0) console.log('✅ 输出校验通过');
}

process.exit(errors.length === 0 ? 0 : 1);
