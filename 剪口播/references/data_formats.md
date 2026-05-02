# 数据格式示例

结构校验规则见 [schemas.md](schemas.md)。机器校验使用：

```bash
node scripts/validate_outputs.js --base output/YYYY-MM-DD_视频名/剪口播
```

## volcengine_result.json

剪口播后续依赖：

```json
{
  "utterances": [
    {
      "start_time": 0,
      "end_time": 500,
      "text": "示例",
      "words": [
        {"text": "示", "start_time": 0, "end_time": 200}
      ]
    }
  ],
  "text": "示例",
  "audio_info": {},
  "request_id": "uuid"
}
```

`utterances[].words` 必须存在，否则无法生成字级字幕。

## subtitles_words.json

```json
[
  {"text": "大", "start": 0.12, "end": 0.2, "isGap": false},
  {"text": "", "start": 6.78, "end": 7.48, "isGap": true}
]
```

`start` 和 `end` 单位是秒。

## auto_selected.json

```json
[72, 85, 120]
```

数组元素是 `subtitles_words.json` 的索引 idx，不是 `readable.txt` 行号。

## delete_segments.json

审核页提交给剪辑脚本的删除片段：

```json
[
  {"start": 1.23, "end": 2.34}
]
```

`start` 和 `end` 单位是秒。
