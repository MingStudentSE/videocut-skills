#!/usr/bin/env node
/**
 * Export corrected subtitles to sidecar subtitle files.
 *
 * Usage:
 *   node export_external_subtitles.js <input.json> [output_base]
 *
 * Input can be:
 * - volcengine_result.json with utterances[]
 * - subtitles_with_time.json with {id,text,start,end}[]
 *
 * Output:
 * - <output_base>.json
 * - <output_base>.srt
 * - <output_base>.vtt
 */

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2];
const outputBase = process.argv[3] || 'video';

if (!inputFile) {
  console.error('Usage: node export_external_subtitles.js <input.json> [output_base]');
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error('Input file not found:', inputFile);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const subtitles = Array.isArray(raw) ? raw : fromVolcengine(raw);

const normalized = subtitles
  .map((item, index) => ({
    id: item.id || index + 1,
    text: normalizeText(item.text || ''),
    start: Number(item.start),
    end: Number(item.end),
  }))
  .filter((item) => item.text && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
  .map((item, index) => ({ ...item, id: index + 1 }));

if (!normalized.length) {
  console.error('No valid subtitle entries found.');
  process.exit(1);
}

fs.writeFileSync(`${outputBase}.json`, JSON.stringify(normalized, null, 2) + '\n');
fs.writeFileSync(`${outputBase}.srt`, toSrt(normalized));
fs.writeFileSync(`${outputBase}.vtt`, toVtt(normalized));

console.log(`Exported ${normalized.length} subtitles:`);
console.log(`- ${path.resolve(`${outputBase}.json`)}`);
console.log(`- ${path.resolve(`${outputBase}.srt`)}`);
console.log(`- ${path.resolve(`${outputBase}.vtt`)}`);

function fromVolcengine(result) {
  if (!Array.isArray(result.utterances)) {
    throw new Error('Input must be an array or a volcengine_result.json with utterances[].');
  }
  return result.utterances.map((u, index) => ({
    id: index + 1,
    text: u.text,
    start: Number(u.start_time) / 1000,
    end: Number(u.end_time) / 1000,
  }));
}

function normalizeText(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/[。！？；;,.，、]+$/g, '')
    .trim();
}

function toSrt(items) {
  return items.map((item) => [
    item.id,
    `${formatSrtTime(item.start)} --> ${formatSrtTime(item.end)}`,
    item.text,
    '',
  ].join('\n')).join('\n');
}

function toVtt(items) {
  return 'WEBVTT\n\n' + items.map((item) => [
    `${formatVttTime(item.start)} --> ${formatVttTime(item.end)}`,
    item.text,
    '',
  ].join('\n')).join('\n');
}

function formatSrtTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const x = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(x).padStart(3, '0')}`;
}

function formatVttTime(seconds) {
  return formatSrtTime(seconds).replace(',', '.');
}

function pad(n) {
  return String(n).padStart(2, '0');
}
