---
name: videocut:外挂字幕
description: 根据个人热词和大模型语义复核生成外挂字幕文件。This skill should be used when the user asks to 生成外挂字幕、导出 SRT/VTT、只要字幕文件不要烧录、用个人热词校对字幕、或对口播转录做语义检查后输出字幕文件.
---

<!--
input: 视频文件（可选，不传则自动查找剪辑后视频）
output: 外挂字幕文件（.srt/.vtt）和语义复核记录
pos: 后置 skill，语音剪辑完成后调用；也可单独处理任意视频
-->

# 外挂字幕

> 转录 → 个人热词校对 → 大模型语义复核 → 导出 SRT/VTT

## 使用边界

- 生成外挂字幕文件时使用本 skill。
- 需要把字幕烧进视频时，改用 `videocut:烧录字幕`。
- 需要先剪掉口误、静音或重复句时，先用 `videocut:语音剪辑`。

## 输出结构

```
output/YYYY-MM-DD_视频名/外挂字幕/
├── 1_转录/
│   ├── audio.mp3
│   ├── audio_url.txt
│   ├── volcengine_request.json
│   ├── volcengine_result.json
│   └── subtitles_with_time.raw.json
├── 2_校对/
│   ├── subtitles_with_time.json
│   └── 语义复核.md
└── 3_输出/
    ├── <视频同名>.srt
    └── <视频同名>.vtt
```

已有文件夹则复用，否则新建。

## 主流程

1. 解析用户给的视频路径；没有路径时优先查找最近的语音剪辑输出 `语音剪辑/3_审核/*_cut.mp4`。
2. 设置 `SKILL_DIR` 为当前 `外挂字幕` skill 目录，设置 `VIDEOCUT_ROOT` 为上级 `videocut-skills` 根目录。
3. 建立输出目录 `output/YYYY-MM-DD_视频名/外挂字幕/`。
4. 复用语音剪辑脚本提取并上传音频：

```bash
ffmpeg -i "$VIDEO_PATH" -vn -acodec libmp3lame -y "1_转录/audio.mp3"
"$VIDEOCUT_ROOT/语音剪辑/scripts/upload_audio.sh" "1_转录/audio.mp3"
```

5. 使用火山转录脚本转录。脚本会读取 `.env` 和默认热词 `字幕/词典.txt`；如用户提供自己的热词文件，设置 `VOLCENGINE_HOTWORDS_FILE`。

```bash
cd "1_转录"
"$VIDEOCUT_ROOT/语音剪辑/scripts/volcengine_transcribe.sh" "$AUDIO_URL"
```

6. 用 `build_reviewed_subtitles.js` 基于火山 `utterances[].words[]` 字级时间戳重切短字幕，并做第一轮热词修正：

```bash
node "$SKILL_DIR/scripts/build_reviewed_subtitles.js" \
  "1_转录/volcengine_result.json" \
  "2_校对/subtitles_with_time.json"
```

7. 读取 [semantic_review.md](references/semantic_review.md)，结合个人热词对 `volcengine_result.json` 和重切后的字幕逐条做大模型语义复核。
8. 将复核后的字幕保存为 `2_校对/subtitles_with_time.json`，同时把修改依据、不确定项写入 `2_校对/语义复核.md`。
9. 再次运行导出脚本，用复核后的 JSON 输出与视频同名的外挂字幕。`OUTPUT_BASENAME` 必须取自实际视频文件名去掉扩展名，不能固定写成 `video`：

```bash
OUTPUT_BASENAME="$(basename "$VIDEO_PATH" .mp4)"
node "$SKILL_DIR/scripts/export_external_subtitles.js" "2_校对/subtitles_with_time.json" "3_输出/$OUTPUT_BASENAME"
```

## 个人热词

优先使用这些来源：

1. `.env` 中的 `VOLCENGINE_HOTWORDS_FILE`
2. `字幕/词典.txt`
3. 用户本次提供的产品名、人名、命令名和专有词

复核时必须重点检查热词的同音误识别、英文大小写、空格和命令格式。

## 语义复核原则

- 只改不加：不能从原稿或常识里补视频中没说的话。
- 只修转录：不要把口语改写成文案。
- 默认短字幕：必须基于 `volcengine_result.json` 的字级 `utterances[].words[]` 时间戳重切。
- 时间戳来源：每条字幕 start 取该字幕第一个字/词的 `words[].start_time`，end 取最后一个字/词的 `words[].end_time`。
- 禁止比例拆分：不能按文本长度比例分配时间，也不能手工平移整条时间轴。
- 不确定则记录：把疑点写入 `语义复核.md`，留给用户确认。
- 外挂优先简洁：默认一条字幕一行，句尾去掉标点，句中必要逗号可保留。

## 关键脚本

| 脚本 | 作用 |
|---|---|
| `scripts/build_reviewed_subtitles.js` | 基于火山字级 `words[]` 重切短字幕，并做常见热词修正 |
| `scripts/export_external_subtitles.js` | 从火山结果或校对 JSON 导出 `.srt` 和 `.vtt` |
| `../语音剪辑/scripts/upload_audio.sh` | 复用音频上传能力 |
| `../语音剪辑/scripts/volcengine_transcribe.sh` | 复用火山转录和热词能力 |

## 何时读取 References

| 场景 | 读取 |
|---|---|
| 做热词校对和语义复核 | [semantic_review.md](references/semantic_review.md) |
