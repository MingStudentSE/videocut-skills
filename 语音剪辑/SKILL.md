---
name: videocut:语音剪辑
description: 口播视频转录、口误识别、静音预选和网页审核。Use when user asks to 语音剪辑、处理口播视频、识别口误、去掉卡顿/重复/静音，or generate review.html/delete_segments for spoken videos.
---

<!--
input: 视频文件 (*.mp4)
output: subtitles_words.json、auto_selected.json、review.html、video.mp4(符号链接)
pos: 转录+识别，到用户网页审核为止

架构守护者：一旦我被修改，请同步更新：
1. ../README.md 的 Skill 清单
2. /CLAUDE.md 路由表
-->

# 语音剪辑 v2

> 火山引擎转录 + 自动静音/语义筛查 + AI 复核 + 网页审核

## 快速使用

用户常见说法：
- 帮我剪这个口播视频
- 处理一下这个视频
- 识别口误/卡顿/重复句

## 输出结构

```
output/YYYY-MM-DD_视频名/语音剪辑/
├── 1_转录/
│   ├── audio.mp3
│   ├── volcengine_request.json
│   ├── volcengine_result.json
│   └── subtitles_words.json
├── 2_分析/
│   ├── readable.txt
│   ├── sentences.txt
│   ├── auto_selected.json
│   ├── 静音分析.md
│   ├── 语义分析.md
│   └── 口误分析.md
└── 3_审核/
    ├── review.html
    └── video.mp4 -> 源视频
```

已有文件夹则复用，否则新建。

## 主流程

1. 解析用户给的视频路径，设置 `VIDEO_PATH`。
2. 设置 `SKILL_DIR` 为当前 `语音剪辑` skill 目录，不要硬编码用户目录。
3. 优先运行一键流水线：

```bash
"$SKILL_DIR/scripts/run_pipeline.sh" "$VIDEO_PATH"
```

4. 流水线会完成：建目录、提取音频、按 `VIDEO_UPLOAD_PROVIDER` 上传或使用 `--audio-url`、转录、生成字幕、自动静音/语义筛查、生成审核页、校验输出。
5. 需要 AI 复核口误时，再读取 [misread_rules.md](references/misread_rules.md) 和 `用户习惯/` 下的规则文件，追加到 `auto_selected.json`。
6. 流水线结束后按其输出命令启动 `review_server.js`，或按 [review_server.md](references/review_server.md) 操作。
7. 等用户在网页确认；用户点击「执行剪辑」后，由 `review_server.js` 调用 `cut_video.sh` 输出 `_cut.mp4`。

如果一键脚本需要排障或临时手工执行，再读取 [pipeline_steps.md](references/pipeline_steps.md)。

## 关键脚本

| 脚本 | 作用 |
|---|---|
| `scripts/run_pipeline.sh` | 从视频到审核页的一键确定性流水线 |
| `scripts/upload_audio.sh` | 上传音频；支持 `VIDEO_UPLOAD_PROVIDER=uguu/none` |
| `scripts/volcengine_transcribe.sh` | 火山 AUC submit/query 转录；自动读取 `../字幕/词典.txt` 热词；输出 `volcengine_result.json` |
| `scripts/generate_subtitles.js` | 从火山结果生成字级 `subtitles_words.json` |
| `scripts/prepare_analysis_inputs.js` | 生成 `readable.txt` 和 `sentences.txt` |
| `scripts/generate_auto_selected.js` | 按静音规则生成 `auto_selected.json` 和 `静音分析.md` |
| `scripts/generate_semantic_selected.js` | 自动追加残句、相邻重说、孤立卡顿词、句内重复候选 |
| `scripts/generate_review.js` | 生成 `review.html` 和视频符号链接 |
| `scripts/review_server.js` | 提供审核页和 `/api/cut`，支持 HTTP Range 播放视频 |
| `scripts/cut_video.sh` | 按 `delete_segments.json` 帧级精确剪辑 |
| `scripts/validate_outputs.js` | 校验核心 JSON 和审核页产物 |

## 何时读取 References

| 场景 | 读取 |
|---|---|
| 执行完整手工流程 | [pipeline_steps.md](references/pipeline_steps.md) |
| 判断静音/句中停顿策略 | [silence_rules.md](references/silence_rules.md) |
| AI 复核口误、重复、残句 | [misread_rules.md](references/misread_rules.md) 和 `用户习惯/` |
| 生成/启动审核页 | [review_server.md](references/review_server.md) |
| 检查 JSON 格式 | [schemas.md](references/schemas.md) 和 [data_formats.md](references/data_formats.md) |
| 理解剪辑编码原则 | [cut_encoding.md](references/cut_encoding.md) |

## 必守原则

- `show_utterances` 必须为 `true`，否则没有字级时间戳，后续字幕和静音分析会断。
- `readable.txt` 的行号不是 idx；分析时必须使用每行开头的 `idx|内容|时间`。
- 删除残句/重复句时，范围内的文字和 gap 都要加入 `auto_selected.json`，不能只挑文字。
- 审核服务器必须用 `review_server.js`，不能用 `python3 -m http.server` 替代。
- 剪辑编码规则见 [cut_encoding.md](references/cut_encoding.md)，不要随意改成只用 CRF。
- 默认 `VIDEO_UPLOAD_PROVIDER=uguu` 会把提取出的音频上传到第三方临时文件服务。敏感素材应设 `VIDEO_UPLOAD_PROVIDER=none`，并让用户提供可信公网 `--audio-url`。

## 配置

```bash
cd <videocut-skills 根目录>
cp .env.example .env
# 编辑 .env 填入 VOLCENGINE_API_KEY
# 默认资源: VOLCENGINE_RESOURCE_ID=volc.seedasr.auc
# 默认热词: VOLCENGINE_HOTWORDS_FILE=字幕/词典.txt
# 默认上传: VIDEO_UPLOAD_PROVIDER=uguu
```
