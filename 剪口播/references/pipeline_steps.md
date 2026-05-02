# 剪口播手工流程

本文件保存完整确定性步骤。等 `run_pipeline` 入口脚本完成后，SKILL.md 应优先调用脚本，本文件作为 fallback 和排障参考。

优先入口：

```bash
SKILL_DIR="${SKILL_DIR:?请先将 SKILL_DIR 设置为当前「剪口播」skill 目录}"
"$SKILL_DIR/scripts/run_pipeline.sh" "$VIDEO_PATH"
```

只有当一键流水线需要排障或需要人工接管中间步骤时，才按下面手工流程执行。

## 0. 创建输出目录

```bash
VIDEO_PATH="/path/to/视频.mp4"
VIDEO_NAME=$(basename "$VIDEO_PATH" .mp4)
DATE=$(date +%Y-%m-%d)
BASE_DIR="output/${DATE}_${VIDEO_NAME}/剪口播"

mkdir -p "$BASE_DIR/1_转录" "$BASE_DIR/2_分析" "$BASE_DIR/3_审核"
cd "$BASE_DIR"
```

## 1. 提取音频并上传

```bash
cd 1_转录

# 文件名含冒号时必须加 file: 前缀
ffmpeg -i "file:$VIDEO_PATH" -vn -acodec libmp3lame -y audio.mp3

"$SKILL_DIR/scripts/upload_audio.sh" audio.mp3 "${VIDEO_UPLOAD_PROVIDER:-uguu}"
# 输出公网音频 URL
```

隐私边界：默认 `VIDEO_UPLOAD_PROVIDER=uguu` 会上传音频到第三方临时文件服务。敏感内容请使用 `VIDEO_UPLOAD_PROVIDER=none`，并通过 `run_pipeline.sh --audio-url <可信公网URL>` 传入音频 URL。

## 2. 火山引擎转录

```bash
SKILL_DIR="${SKILL_DIR:?请先将 SKILL_DIR 设置为当前「剪口播」skill 目录}"
"$SKILL_DIR/scripts/volcengine_transcribe.sh" "<公网音频URL>"
```

转录脚本使用火山 AUC 标准版：

```text
POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit
POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/query
X-Api-Resource-Id: volc.seedasr.auc
```

脚本会自动读取 `../字幕/词典.txt` 作为热词，通过 `request.corpus.context` 直传；可在 `.env` 用 `VOLCENGINE_HOTWORDS_FILE` 覆盖。脚本会保留 `volcengine_request.json`、提交/查询响应头、`volcengine_raw_result.json`，并生成 `volcengine_result.json`。

## 3. 生成字级字幕

```bash
node "$SKILL_DIR/scripts/generate_subtitles.js" volcengine_result.json
# 输出: subtitles_words.json
cd ..
```

## 4. 生成分析中间文件

```bash
cd 2_分析

node -e "
const data = require('../1_转录/subtitles_words.json');
let output = [];
data.forEach((w, i) => {
  if (w.isGap) {
    const dur = (w.end - w.start).toFixed(2);
    if (dur >= 0.2) output.push(i + '|[静' + dur + 's]|' + w.start.toFixed(2) + '-' + w.end.toFixed(2));
  } else {
    output.push(i + '|' + w.text + '|' + w.start.toFixed(2) + '-' + w.end.toFixed(2));
  }
});
require('fs').writeFileSync('readable.txt', output.join('\\n'));
"

node -e "
const data = require('../1_转录/subtitles_words.json');
let sentences = [];
let curr = { text: '', startIdx: -1, endIdx: -1 };

data.forEach((w, i) => {
  const isLongGap = w.isGap && (w.end - w.start) >= 0.5;
  if (isLongGap) {
    if (curr.text.length > 0) sentences.push({...curr});
    curr = { text: '', startIdx: -1, endIdx: -1 };
  } else if (!w.isGap) {
    if (curr.startIdx === -1) curr.startIdx = i;
    curr.text += w.text;
    curr.endIdx = i;
  }
});
if (curr.text.length > 0) sentences.push(curr);

sentences.forEach((s, i) => {
  console.log(i + '|' + s.startIdx + '-' + s.endIdx + '|' + s.text);
});
" > sentences.txt
```

## 5. 自动预选

```bash
node "$SKILL_DIR/scripts/generate_auto_selected.js" ../1_转录/subtitles_words.json . ../1_转录/volcengine_result.json
node "$SKILL_DIR/scripts/generate_semantic_selected.js" ../1_转录/subtitles_words.json auto_selected.json .
```

输出：
- `auto_selected.json`
- `静音分析.md`
- `语义分析.md`

## 6. 生成审核页

```bash
cd ../3_审核
node "$SKILL_DIR/scripts/generate_review.js" ../1_转录/subtitles_words.json ../2_分析/auto_selected.json "$VIDEO_PATH"
node "$SKILL_DIR/scripts/review_server.js" 8899 "$VIDEO_PATH"
```

打开 `http://localhost:8899/review.html`。
