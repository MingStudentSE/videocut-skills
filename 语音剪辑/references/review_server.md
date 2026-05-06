# 审核页和服务器

## 生成审核页

```bash
cd 3_审核
SKILL_DIR="${SKILL_DIR:?请先将 SKILL_DIR 设置为当前「语音剪辑」skill 目录}"
node "$SKILL_DIR/scripts/generate_review.js" ../1_转录/subtitles_words.json ../2_分析/auto_selected.json "$VIDEO_PATH"
```

输出：

```text
review.html
video.mp4 -> 源视频符号链接
```

## 启动审核服务器

```bash
node "$SKILL_DIR/scripts/review_server.js" 8899 "$VIDEO_PATH"
```

打开：

```text
http://localhost:8899/review.html
```

必须用 `review_server.js`，不能用 `python3 -m http.server` 替代。视频播放依赖 HTTP Range 请求（206），Python 简易服务器可能导致视频无法播放或无声音。

启动长期服务器时，不要在命令末尾加 `&`；使用工具的后台运行能力。

## 用户审核动作

用户在网页中：
- 播放视频画面确认
- 勾选/取消删除项
- 点击「执行剪辑」

用户点击后，`review_server.js` 会保存 `delete_segments.json`，再调用 `cut_video.sh` 输出 `_cut.mp4`。
