#!/bin/bash
#
# 火山引擎语音识别（大模型录音文件识别标准版）
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
SKILL_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
ENV_FILE="$SKILL_ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ 找不到 $ENV_FILE"
  echo "请创建: cp .env.example .env 并填入 VOLCENGINE_API_KEY"
  exit 1
fi

read_env() {
  local key="$1"
  local value="${!key:-}"
  if [ -z "$value" ]; then
    value=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d'=' -f2-)
    value="${value%$'\r'}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
  fi
  printf '%s' "$value"
}

get_header() {
  local file="$1"
  local name="$2"
  grep -i "^${name}:" "$file" | tail -n 1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '\r'
}

API_KEY=$(read_env VOLCENGINE_API_KEY)
APP_KEY=$(read_env VOLCENGINE_APP_KEY)
ACCESS_KEY=$(read_env VOLCENGINE_ACCESS_KEY)
RESOURCE_ID=$(read_env VOLCENGINE_RESOURCE_ID)
SUBMIT_URL=$(read_env VOLCENGINE_SUBMIT_URL)
QUERY_URL=$(read_env VOLCENGINE_QUERY_URL)
QUERY_INTERVAL_SECONDS=$(read_env VOLCENGINE_QUERY_INTERVAL_SECONDS)
QUERY_MAX_ATTEMPTS=$(read_env VOLCENGINE_QUERY_MAX_ATTEMPTS)
HOTWORDS_FILE=$(read_env VOLCENGINE_HOTWORDS_FILE)

if [ -z "$API_KEY" ] && { [ -z "$APP_KEY" ] || [ -z "$ACCESS_KEY" ]; }; then
  echo "❌ VOLCENGINE_API_KEY 未配置"
  echo "也可以改用 VOLCENGINE_APP_KEY + VOLCENGINE_ACCESS_KEY"
  exit 1
fi

if [ -z "$RESOURCE_ID" ] || [ "$RESOURCE_ID" = "volc.bigasr.auc_turbo" ]; then
  RESOURCE_ID="volc.seedasr.auc"
fi

if [ -z "$SUBMIT_URL" ]; then
  SUBMIT_URL="https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit"
fi

if [ -z "$QUERY_URL" ]; then
  QUERY_URL="https://openspeech.bytedance.com/api/v3/auc/bigmodel/query"
fi

if [ -z "$QUERY_INTERVAL_SECONDS" ]; then
  QUERY_INTERVAL_SECONDS=5
fi

if [ -z "$QUERY_MAX_ATTEMPTS" ]; then
  QUERY_MAX_ATTEMPTS=240
fi

if [ -z "$HOTWORDS_FILE" ]; then
  HOTWORDS_FILE="$SKILL_ROOT/字幕/词典.txt"
elif [[ "$HOTWORDS_FILE" != /* ]]; then
  HOTWORDS_FILE="$SKILL_ROOT/$HOTWORDS_FILE"
fi

echo "🎤 提交火山引擎转录任务（标准版）..."
echo "音频 URL: $AUDIO_URL"
echo "资源 ID: $RESOURCE_ID"

REQUEST_ID=$(uuidgen 2>/dev/null || node -e "console.log(require('crypto').randomUUID())")

REQUEST_BODY=$(node -e "
const fs = require('fs');
const url = process.argv[1];
const hotwordsFile = process.argv[2];

function loadHotwords(file) {
  if (!file || !fs.existsSync(file)) return [];
  const seen = new Set();
  return fs.readFileSync(file, 'utf8')
    .split(/\\r?\\n/)
    .map((line, index) => index === 0 ? line.replace(/^\\uFEFF/, '') : line)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('|')[0].trim())
    .filter(Boolean)
    .filter(word => {
      if (seen.has(word)) return false;
      seen.add(word);
      return true;
    })
    .slice(0, 5000)
    .map(word => ({word}));
}

const hotwords = loadHotwords(hotwordsFile);
const body = {
  user: { uid: '豆包语音' },
  audio: {
    url,
    format: 'mp3',
    codec: 'raw',
    rate: 16000,
    bits: 16,
    channel: 1
  },
  request: {
    model_name: 'bigmodel',
    enable_itn: true,
    enable_punc: false,
    enable_ddc: false,
    enable_speaker_info: false,
    enable_channel_split: false,
    show_utterances: true,
    vad_segment: false,
    sensitive_words_filter: ''
  }
};

if (hotwords.length > 0) {
  body.request.corpus = {
    context: JSON.stringify({hotwords})
  };
}

console.log(JSON.stringify(body));
" "$AUDIO_URL" "$HOTWORDS_FILE")

echo "$REQUEST_BODY" > volcengine_request.json

HOTWORDS_COUNT=$(node -e "
const fs = require('fs');
const body = JSON.parse(fs.readFileSync('volcengine_request.json', 'utf8'));
const context = body.request && body.request.corpus && body.request.corpus.context;
const hotwords = context ? JSON.parse(context).hotwords || [] : [];
console.log(hotwords.length);
")

if [ "$HOTWORDS_COUNT" -gt 0 ]; then
  echo "热词文件: $HOTWORDS_FILE"
  echo "热词数量: $HOTWORDS_COUNT"
else
  echo "热词文件: 未加载（未找到或为空）"
fi

COMMON_HEADERS=(
  -H "Content-Type: application/json"
  -H "X-Api-Resource-Id: $RESOURCE_ID"
  -H "X-Api-Request-Id: $REQUEST_ID"
  -H "X-Api-Sequence: -1"
)

if [ -n "$API_KEY" ]; then
  COMMON_HEADERS+=(-H "x-api-key: $API_KEY")
else
  COMMON_HEADERS+=(-H "X-Api-App-Key: $APP_KEY" -H "X-Api-Access-Key: $ACCESS_KEY")
fi

SUBMIT_HEADERS="volcengine_submit_headers.txt"
SUBMIT_BODY="volcengine_submit_response.json"
QUERY_HEADERS="volcengine_query_headers.txt"
QUERY_BODY="volcengine_query_response.json"

curl -s -L -X POST "$SUBMIT_URL" \
  -D "$SUBMIT_HEADERS" \
  -o "$SUBMIT_BODY" \
  "${COMMON_HEADERS[@]}" \
  -d "$REQUEST_BODY"

SUBMIT_STATUS=$(get_header "$SUBMIT_HEADERS" "X-Api-Status-Code")
SUBMIT_MESSAGE=$(get_header "$SUBMIT_HEADERS" "X-Api-Message")
SUBMIT_LOG_ID=$(get_header "$SUBMIT_HEADERS" "X-Tt-Logid")

if [ "$SUBMIT_STATUS" != "20000000" ]; then
  echo "❌ 提交转录任务失败"
  echo "状态码: ${SUBMIT_STATUS:-无}"
  echo "消息: ${SUBMIT_MESSAGE:-无}"
  if [ -s "$SUBMIT_BODY" ]; then
    echo "响应体:"
    cat "$SUBMIT_BODY"
    echo
  fi
  exit 1
fi

echo "✅ 任务已提交，Request ID: $REQUEST_ID"
if [ -n "$SUBMIT_LOG_ID" ]; then
  echo "Log ID: $SUBMIT_LOG_ID"
fi

attempt=1
while [ "$attempt" -le "$QUERY_MAX_ATTEMPTS" ]; do
  curl -s -L -X POST "$QUERY_URL" \
    -D "$QUERY_HEADERS" \
    -o "$QUERY_BODY" \
    "${COMMON_HEADERS[@]}" \
    -d '{}'

  QUERY_STATUS=$(get_header "$QUERY_HEADERS" "X-Api-Status-Code")
  QUERY_MESSAGE=$(get_header "$QUERY_HEADERS" "X-Api-Message")

  if [ "$QUERY_STATUS" = "20000000" ]; then
    cp "$QUERY_BODY" volcengine_raw_result.json
    break
  fi

  if [ "$QUERY_STATUS" = "20000001" ] || [ "$QUERY_STATUS" = "20000002" ]; then
    echo "⏳ 转录中 ${attempt}/${QUERY_MAX_ATTEMPTS}（${QUERY_STATUS} ${QUERY_MESSAGE:-处理中}）..."
    sleep "$QUERY_INTERVAL_SECONDS"
    attempt=$((attempt + 1))
    continue
  fi

  echo "❌ 查询转录结果失败"
  echo "状态码: ${QUERY_STATUS:-无}"
  echo "消息: ${QUERY_MESSAGE:-无}"
  if [ -s "$QUERY_BODY" ]; then
    echo "响应体:"
    cat "$QUERY_BODY"
    echo
  fi
  exit 1
done

if [ ! -f volcengine_raw_result.json ]; then
  echo "❌ 转录超时：已等待 $((QUERY_INTERVAL_SECONDS * QUERY_MAX_ATTEMPTS)) 秒"
  exit 1
fi

node -e "
const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('volcengine_raw_result.json', 'utf8'));
if (!raw.result || !Array.isArray(raw.result.utterances)) {
  console.error('❌ 转录失败，响应:');
  console.error(JSON.stringify(raw));
  console.error('提示：语音剪辑流程需要 request.show_utterances=true 才能生成字级字幕。');
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
