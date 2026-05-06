#!/usr/bin/env node
/**
 * Build reviewed sidecar subtitles from Volcengine utterances.
 *
 * This script keeps every subtitle timestamp anchored to Volcengine
 * utterances[].words[].start_time/end_time. It never splits time by text ratio.
 *
 * Usage:
 *   node build_reviewed_subtitles.js <volcengine_result.json> <output.json>
 */

const fs = require('fs');

const inputFile = process.argv[2];
const outputFile = process.argv[3] || 'subtitles_with_time.json';

if (!inputFile) {
  console.error('Usage: node build_reviewed_subtitles.js <volcengine_result.json> <output.json>');
  process.exit(1);
}

const result = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
if (!Array.isArray(result.utterances)) {
  console.error('Input must contain utterances[].');
  process.exit(1);
}

const subtitles = [];
for (const [utteranceIndex, utterance] of result.utterances.entries()) {
  const words = (utterance.words || [])
    .filter((word) => String(word.text || '').trim() && Number(word.start_time) >= 0 && Number(word.end_time) > Number(word.start_time))
    .map((word) => ({
      text: String(word.text).trim(),
      start: Number(word.start_time),
      end: Number(word.end_time),
    }));

  for (const chunk of splitWords(words)) {
    const text = formatDisplay(applyTermCorrections(tokensToText(chunk.map((word) => word.text))));
    if (!text) continue;
    subtitles.push({
      id: subtitles.length + 1,
      text,
      start: chunk[0].start / 1000,
      end: chunk[chunk.length - 1].end / 1000,
      volcengine_start_time: chunk[0].start,
      volcengine_end_time: chunk[chunk.length - 1].end,
      source_utterance: utteranceIndex + 1,
    });
  }
}

fs.writeFileSync(outputFile, JSON.stringify(subtitles, null, 2) + '\n');
console.log(`Built ${subtitles.length} subtitles from ${result.utterances.length} utterances.`);

function splitWords(words) {
  const chunks = [];
  let current = [];
  const maxDisplayLength = 34;
  const minDisplayLength = 8;

  for (let i = 0; i < words.length; i++) {
    if (current.length && shouldBreakBefore(current, words[i])) {
      chunks.push(current);
      current = [];
    }

    current.push(words[i]);
    const next = words[i + 1];
    const text = formatDisplay(applyTermCorrections(tokensToText(current.map((word) => word.text))));
    const len = displayLength(text);
    const gap = next ? next.start - words[i].end : 0;
    const breakOnGap = next && gap >= 420 && len >= minDisplayLength;
    const breakOnLength = next && len >= maxDisplayLength && !/[的地得和在对也就不然程黑]$/.test(text);

    if (!next || breakOnGap || breakOnLength) {
      chunks.push(current);
      current = [];
    }
  }

  if (current.length) chunks.push(current);
  return mergeTinyChunks(chunks);
}

function shouldBreakBefore(current, next) {
  const text = formatDisplay(applyTermCorrections(tokensToText(current.map((word) => word.text))));
  if (displayLength(text) < 10) return false;
  const starters = new Set(['但', '如果', '而且', '然后', '因为', '我们', '大家', '这里', '选择', '点击', '好', '它', '你', '我', '那', '这', '第']);
  return starters.has(next.text) && !/[的地得和在对也就不]$/.test(text);
}

function mergeTinyChunks(chunks) {
  const output = [];
  for (const chunk of chunks) {
    const text = formatDisplay(applyTermCorrections(tokensToText(chunk.map((word) => word.text))));
    if (output.length && displayLength(text) < 5) {
      output[output.length - 1] = output[output.length - 1].concat(chunk);
    } else {
      output.push(chunk);
    }
  }
  return output;
}

function tokensToText(tokens) {
  let output = '';
  for (const token of tokens) {
    output += /^[A-Za-z0-9.]+$/.test(token) ? ` ${token} ` : token;
  }
  return output.replace(/\s+/g, ' ').trim();
}

function applyTermCorrections(input) {
  let text = input.replace(/\s+/g, ' ').trim();
  const replacements = [
    [/安克罗科/g, '安装 Claude Code'],
    [/克洛蔻/g, 'Claude Code'],
    [/克洛戴斯涛普/g, 'Claude Desktop'],
    [/\bclaude desktop\b/gi, 'Claude Desktop'],
    [/\bclaude\b/gi, 'Claude'],
    [/强命令/g, '敲命令'],
    [/后点到\s*com/gi, 'Claude.com/download'],
    [/Trouble\s+Shooting/gi, 'Troubleshooting'],
    [/enable\s+development\s+mode/gi, 'Enable Development Mode'],
    [/development\s+developer\s+的菜单/gi, 'Developer 的菜单'],
    [/configure\s+third\s+part/gi, 'Configure Third Party'],
    [/base\s+url/gi, 'Base URL'],
    [/API\s*Key/gi, 'API Key'],
    [/Coding\s+Plan/gi, 'Coding Plan'],
    [/apply\s+locally/gi, 'Apply Locally'],
    [/new\s+task/gi, 'New Task'],
    [/\bproject\b/gi, 'Project'],
    [/using\s+an\s+existing\s+folder/gi, 'Using an Existing Folder'],
    [/\bcustomize\b/gi, 'Customize'],
    [/\bskill\b/gi, 'Skills'],
    [/\bmcp\b/gi, 'MCP'],
    [/右右上角/g, '右上角'],
    [/它它和终端版/g, '它和命令行版它和终端版'],
  ];
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, ' ').trim();
}

function formatDisplay(text) {
  return text
    .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function displayLength(text) {
  let length = 0;
  for (const char of text) {
    length += /[\x00-\x7F]/.test(char) ? 0.65 : 1;
  }
  return length;
}
