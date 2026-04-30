#!/bin/bash
#
# 火山引擎语音识别（大模型录音文件极速版）
#
# 用法: ./volcengine_transcribe.sh <audio_url>
# 输出: volcengine_result.json
#

AUDIO_URL="$1"

if [ -z "$AUDIO_URL" ]; then
  echo "❌ 用法: ./volcengine_transcribe.sh <audio_url>"
  exit 1
fi

# 获取 API Key
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$(dirname "$(dirname "$SCRIPT_DIR")")/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ 找不到 $ENV_FILE"
  echo "请创建: cp .env.example .env 并填入 VOLCENGINE_API_KEY"
  exit 1
fi

API_KEY=$(grep '^VOLCENGINE_API_KEY=' "$ENV_FILE" | cut -d'=' -f2-)
RESOURCE_ID=$(grep '^VOLCENGINE_RESOURCE_ID=' "$ENV_FILE" | cut -d'=' -f2-)

if [ -z "$API_KEY" ]; then
  echo "❌ VOLCENGINE_API_KEY 未配置"
  exit 1
fi

if [ -z "$RESOURCE_ID" ]; then
  RESOURCE_ID="volc.bigasr.auc_turbo"
fi

echo "🎤 提交火山引擎转录任务..."
echo "音频 URL: $AUDIO_URL"
echo "资源 ID: $RESOURCE_ID"

REQUEST_ID=$(uuidgen 2>/dev/null || node -e "console.log(require('crypto').randomUUID())")

REQUEST_BODY=$(node -e "
const url = process.argv[1];
console.log(JSON.stringify({
  user: { uid: 'videocut' },
  audio: { url },
  request: {
    model_name: 'bigmodel',
    enable_itn: true,
    enable_punc: true,
    enable_ddc: true,
    show_utterances: true
  }
}));
" "$AUDIO_URL")

RESPONSE=$(curl -s -L -X POST "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $API_KEY" \
  -H "X-Api-Resource-Id: $RESOURCE_ID" \
  -H "X-Api-Request-Id: $REQUEST_ID" \
  -H "X-Api-Sequence: -1" \
  -d "$REQUEST_BODY")

if [ -z "$RESPONSE" ]; then
  echo "❌ 转录失败：接口无响应"
  exit 1
fi

echo "$RESPONSE" > volcengine_raw_result.json

node -e "
const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('volcengine_raw_result.json', 'utf8'));
if (!raw.result || !Array.isArray(raw.result.utterances)) {
  console.error('❌ 转录失败，响应:');
  console.error(JSON.stringify(raw));
  process.exit(1);
}
const out = {
  utterances: raw.result.utterances,
  text: raw.result.text || '',
  audio_info: raw.audio_info || {},
  request_id: '$REQUEST_ID'
};
fs.writeFileSync('volcengine_result.json', JSON.stringify(out, null, 2));
console.log('✅ 转录完成，已保存 volcengine_result.json');
console.log('📝 识别到 ' + out.utterances.length + ' 段语音');
"
