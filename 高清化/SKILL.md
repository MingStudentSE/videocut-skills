---
name: videocut:高清化
description: 视频高清导出。2-pass编码+锐化，匹配或超越原片画质。触发词：高清化、高清导出、导出高清、渲染高清
---

<!--
input: 视频文件（剪辑后的 _cut.mp4 或任意视频）
output: 高清化后的视频 _hd.mp4
pos: 后置 skill，语音剪辑/字幕完成后调用

架构守护者：一旦我被修改，请同步更新：
1. ../README.md 的 Skill 清单
2. /CLAUDE.md 路由表
-->

# 高清化

> 2-pass 编码 + 可选锐化，像剪映一样导出高清

## 快速使用

```
用户: 高清化一下这个视频
用户: 导出高清
用户: /高清化 video.mp4
```

## 设计理念

剪映的做法：**剪辑时不管画质，导出时统一渲染成高清**。

对我们的管线来说：
- 语音剪辑 `cut_video.sh` 已经做了帧级精确切割 + 匹配码率重编码
- 高清化是**可选的额外增强**，用 2-pass + 更高码率 + 锐化，让画质超过原片

## 流程

```
0. 定位视频文件（自动查找或用户指定）
    ↓
1. 检测原片编码参数（profile/pix_fmt/bitrate）
    ↓
2. Pass 1: 分析画面复杂度（不输出文件）
    ↓
3. Pass 2: 编码 + 可选锐化
    ↓
4. 输出 _hd.mp4
```

## 执行步骤

### 步骤 0: 定位视频

**优先级**（从高到低）：
1. 用户传入的视频路径
2. 当前 output 目录下的 `语音剪辑/3_审核/*_cut.mp4`
3. 字幕烧录后的 `字幕/3_输出/*_字幕.mp4`

```bash
# 自动查找
OUTPUT_DIR="output/YYYY-MM-DD_视频名"
VIDEO=$(find "$OUTPUT_DIR/语音剪辑/3_审核" -name "*_cut.mp4" -type f 2>/dev/null | head -1)
```

### 步骤 1-4: 执行高清化

```bash
# Agent 执行时，SKILL_DIR 使用当前 SKILL.md 所在的「高清化」目录；不要硬编码用户目录
SKILL_DIR="${SKILL_DIR:?请先将 SKILL_DIR 设置为当前「高清化」skill 目录}"

# 简单用法：自动检测参数，1.2x 码率，2-pass
bash "$SKILL_DIR/scripts/hd_export.sh" input.mp4

# 指定输出
bash "$SKILL_DIR/scripts/hd_export.sh" input.mp4 output_hd.mp4

# 自定义码率倍率（1.5 = 原片的 1.5 倍码率）
bash "$SKILL_DIR/scripts/hd_export.sh" input.mp4 output_hd.mp4 1.5
```

## 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 码率倍率 | 1.2x | 相对原片码率的倍数 |
| preset | slow | 编码速度（越慢质量越好） |
| 锐化 | 开启 | `unsharp=5:5:0.3` 轻微锐化 |
| 编码 | 2-pass | 两遍编码，码率分配更均匀 |

## 原理

### 为什么 2-pass 比 1-pass 好？

- 1-pass：按固定规则分配码率，简单画面可能过度分配，复杂画面码率不足
- 2-pass：第一遍分析全片复杂度，第二遍按分析结果精准分配码率
- 同码率下，2-pass 画质更好；同画质下，2-pass 文件更小

### 为什么加锐化？

- 任何重编码都会引入微小的模糊（量化噪声）
- 轻微锐化（`unsharp=5:5:0.3`）补偿这个损失
- 参数很保守，不会产生锐化伪影

### 匹配原片参数

自动检测并匹配：
- `-profile:v` → 原片的 profile（通常是 high）
- `-pix_fmt` → 原片的像素格式（通常是 yuv420p）
- `-b:v` → 原片码率 × 倍率

---

## 来源

详见 `语音剪辑/log/编码方案演进-匹配码率.md`
