# videocut:外挂字幕

> 根据个人热词和语义复核生成外挂字幕文件

## 文件

| 文件 | 作用 |
|---|---|
| `SKILL.md` | 流程定义 |
| `scripts/build_reviewed_subtitles.js` | 基于火山字级时间戳重切短字幕 |
| `scripts/export_external_subtitles.js` | 从转录结果或校对 JSON 导出 JSON/SRT/VTT |
| `references/semantic_review.md` | 个人热词和语义复核规则 |

## 默认输出

```
output/YYYY-MM-DD_视频名/外挂字幕/
├── 1_转录/
├── 2_校对/
└── 3_输出/
    ├── <视频同名>.srt
    └── <视频同名>.vtt
```
