#!/bin/bash
#
# 语音剪辑确定性流水线：从视频到审核页。
#
# 用法:
#   run_pipeline.sh <video.mp4> [--audio-url URL] [--output-root output] [--date YYYY-MM-DD]
#
# 默认会提取音频、按 VIDEO_UPLOAD_PROVIDER 上传、调用火山转录、生成字幕/分析/审核页。
# 如果传入 --audio-url，则跳过上传，直接用该公网音频 URL 转录。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<'EOF'
用法:
  run_pipeline.sh <video.mp4> [--audio-url URL] [--output-root output] [--date YYYY-MM-DD]

选项:
  --audio-url URL       跳过上传，直接使用已有公网音频 URL
  --output-root DIR     输出根目录，默认 output
  --date YYYY-MM-DD     输出目录日期前缀，默认今天

环境变量:
  VIDEO_UPLOAD_PROVIDER 上传器，默认 uguu；可设 none 禁止第三方上传
EOF
}

VIDEO_PATH=""
AUDIO_URL=""
OUTPUT_ROOT="output"
DATE="$(date +%Y-%m-%d)"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --audio-url)
      AUDIO_URL="${2:-}"
      shift 2
      ;;
    --output-root)
      OUTPUT_ROOT="${2:-}"
      shift 2
      ;;
    --date)
      DATE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "❌ 未知参数: $1"
      usage
      exit 1
      ;;
    *)
      if [ -z "$VIDEO_PATH" ]; then
        VIDEO_PATH="$1"
      else
        echo "❌ 只能传入一个视频文件"
        usage
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -z "$VIDEO_PATH" ]; then
  echo "❌ 缺少视频文件"
  usage
  exit 1
fi

if [ ! -f "$VIDEO_PATH" ]; then
  echo "❌ 找不到视频文件: $VIDEO_PATH"
  exit 1
fi

VIDEO_ABS="$(cd "$(dirname "$VIDEO_PATH")" && pwd)/$(basename "$VIDEO_PATH")"
VIDEO_NAME="$(basename "$VIDEO_PATH")"
VIDEO_NAME="${VIDEO_NAME%.*}"
BASE_DIR="$OUTPUT_ROOT/${DATE}_${VIDEO_NAME}/语音剪辑"
TRANS_DIR="$BASE_DIR/1_转录"
ANALYSIS_DIR="$BASE_DIR/2_分析"
REVIEW_DIR="$BASE_DIR/3_审核"

echo "📁 输出目录: $BASE_DIR"
mkdir -p "$TRANS_DIR" "$ANALYSIS_DIR" "$REVIEW_DIR"

echo "🎧 提取音频..."
ffmpeg -hide_banner -loglevel error -y -i "file:$VIDEO_ABS" -vn -acodec libmp3lame "$TRANS_DIR/audio.mp3"

if [ -z "$AUDIO_URL" ]; then
  PROVIDER="${VIDEO_UPLOAD_PROVIDER:-uguu}"
  echo "☁️ 上传音频（provider=${PROVIDER}）..."
  (
    cd "$TRANS_DIR"
    AUDIO_URL="$("$SCRIPT_DIR/upload_audio.sh" audio.mp3 "$PROVIDER")"
    printf '%s\n' "$AUDIO_URL" > audio_url.txt
  )
  AUDIO_URL="$(cat "$TRANS_DIR/audio_url.txt")"
else
  printf '{"success":true,"files":[{"url":"%s"}]}\n' "$AUDIO_URL" > "$TRANS_DIR/upload_response.json"
  printf '%s\n' "$AUDIO_URL" > "$TRANS_DIR/audio_url.txt"
fi
echo "音频 URL: $AUDIO_URL"

echo "📝 火山转录..."
(
  cd "$TRANS_DIR"
  "$SCRIPT_DIR/volcengine_transcribe.sh" "$AUDIO_URL"
)

echo "🔤 生成字级字幕..."
(
  cd "$TRANS_DIR"
  node "$SCRIPT_DIR/generate_subtitles.js" volcengine_result.json
)

echo "🧾 生成分析中间文件..."
node "$SCRIPT_DIR/prepare_analysis_inputs.js" "$TRANS_DIR/subtitles_words.json" "$ANALYSIS_DIR"

echo "🔎 自动静音/语义筛查..."
node "$SCRIPT_DIR/generate_auto_selected.js" "$TRANS_DIR/subtitles_words.json" "$ANALYSIS_DIR" "$TRANS_DIR/volcengine_result.json"
node "$SCRIPT_DIR/generate_semantic_selected.js" "$TRANS_DIR/subtitles_words.json" "$ANALYSIS_DIR/auto_selected.json" "$ANALYSIS_DIR"

echo "🖥️ 生成审核页..."
(
  cd "$REVIEW_DIR"
  node "$SCRIPT_DIR/generate_review.js" "../1_转录/subtitles_words.json" "../2_分析/auto_selected.json" "$VIDEO_ABS"
)

echo "✅ 校验输出..."
node "$SCRIPT_DIR/validate_outputs.js" --base "$BASE_DIR" --require-review

cat <<EOF

✅ 语音剪辑流水线完成
输出目录: $BASE_DIR
审核页: $REVIEW_DIR/review.html

启动审核服务器:
node "$SCRIPT_DIR/review_server.js" 8899 "$VIDEO_ABS"

打开:
http://localhost:8899/review.html
EOF
