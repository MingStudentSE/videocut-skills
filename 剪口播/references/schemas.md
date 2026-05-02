# 输出校验 Schema

机器校验入口：

```bash
node scripts/validate_outputs.js --base output/YYYY-MM-DD_视频名/剪口播
```

本文件是给 Agent 阅读的契约说明；真实校验逻辑以 `scripts/validate_outputs.js` 为准。

## volcengine_result.json

必需字段：
- `utterances`: array
- `utterances[].start_time`: number，毫秒
- `utterances[].end_time`: number，毫秒，必须大于等于 `start_time`
- `utterances[].text`: string
- `utterances[].words`: array，必须存在，因为剪口播依赖字级时间戳
- `utterances[].words[].text`: string
- `utterances[].words[].start_time`: number，毫秒
- `utterances[].words[].end_time`: number，毫秒

## subtitles_words.json

必须是数组，每个元素：
- `text`: string
- `start`: number，秒
- `end`: number，秒，必须大于等于 `start`
- `isGap`: boolean

时间应整体非递减。

## auto_selected.json

必须是整数数组，每个整数都是 `subtitles_words.json` 的合法索引。

推荐保持升序且不重复。

## delete_segments.json

审核后才会出现。必须是数组，每个元素：
- `start`: number，秒
- `end`: number，秒，必须大于 `start`

推荐按时间升序且不重叠。
