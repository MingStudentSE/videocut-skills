#!/bin/bash
#
# Upload extracted audio and print a public URL for Volcengine ASR.
#
# Usage:
#   upload_audio.sh <audio.mp3> [provider]
#
# Providers:
#   uguu  Upload to https://uguu.se/upload
#   none  Refuse upload; caller must provide --audio-url

set -euo pipefail

AUDIO_FILE="${1:-}"
PROVIDER="${2:-${VIDEO_UPLOAD_PROVIDER:-uguu}}"

if [ -z "$AUDIO_FILE" ]; then
  echo "❌ 用法: upload_audio.sh <audio.mp3> [provider]" >&2
  exit 1
fi

if [ ! -f "$AUDIO_FILE" ]; then
  echo "❌ 找不到音频文件: $AUDIO_FILE" >&2
  exit 1
fi

case "$PROVIDER" in
  uguu)
    RESPONSE="$(curl -s -F "files[]=@$AUDIO_FILE" https://uguu.se/upload)"
    printf '%s\n' "$RESPONSE" > upload_response.json
    node -e "
const raw = process.argv[1];
const data = JSON.parse(raw);
const file = data.files && data.files[0];
if (!data.success || !file || !file.url) {
  console.error('上传失败: ' + raw);
  process.exit(1);
}
console.log(file.url);
" "$RESPONSE"
    ;;
  none)
    echo "❌ VIDEO_UPLOAD_PROVIDER=none：已禁止上传音频到第三方服务。" >&2
    echo "请先用可信方式上传音频，然后给 run_pipeline.sh 传 --audio-url <URL>。" >&2
    exit 2
    ;;
  *)
    echo "❌ 不支持的 VIDEO_UPLOAD_PROVIDER: $PROVIDER" >&2
    echo "当前支持: uguu, none" >&2
    exit 1
    ;;
esac
