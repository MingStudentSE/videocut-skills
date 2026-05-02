---
name: videocut:安装
description: 环境准备。安装依赖、配置 API Key、验证环境。触发词：安装、环境准备、初始化
---

<!--
input: 无
output: 环境就绪
pos: 前置 skill，首次使用前运行

架构守护者：一旦我被修改，请同步更新：
1. ../README.md 的 Skill 清单
2. /CLAUDE.md 路由表
-->

# 安装

> 首次使用前的环境准备

## 快速使用

```
用户: 安装环境
用户: 初始化
```

## 依赖清单

| 依赖 | 用途 | 安装命令 |
|------|------|----------|
| Node.js | 运行脚本 | `brew install node` |
| FFmpeg | 视频剪辑 | `brew install ffmpeg` |
| curl | API 调用 | 系统自带 |

## API 配置

### 火山引擎语音识别

控制台：https://console.volcengine.com/speech/new/overview

1. 打开控制台后，在「快速开始」区域点击「查看详情」。
2. 在「快捷 API 接入」弹窗的 `STEP2 快速接入测试` 中，选择并开通「豆包录音文件识别模型 2.0」。
3. 在 `STEP1 获取 API Key` 中创建 API Key，或对已有 API Key 点击「选择使用」。
4. 将选中的 API Key 配置到本 skill 仓库根目录的 `.env`。

配置文件位置：`videocut-skills/.env`（与 `.env.example` 同级）。

```bash
VOLCENGINE_API_KEY=your_api_key_here
VOLCENGINE_RESOURCE_ID=volc.seedasr.auc
VOLCENGINE_HOTWORDS_FILE=字幕/词典.txt
```

## 安装流程

```
1. 安装 Node.js + FFmpeg
       ↓
2. 配置火山引擎 API Key
       ↓
3. 验证环境
```

## 执行步骤

### 1. 安装依赖

```bash
# macOS
brew install node ffmpeg

# 验证
node -v
ffmpeg -version
```

### 2. 配置 API Key

```bash
# 在 videocut-skills 根目录下创建 .env 文件
cp .env.example .env
# 编辑 .env，填入 VOLCENGINE_API_KEY
```

### 3. 验证环境

```bash
# 检查 Node.js
node -v

# 检查 FFmpeg
ffmpeg -version

# 检查 API Key 是否存在，不要把 key 打印到聊天或公开日志里
test -n "$(grep '^VOLCENGINE_API_KEY=' .env | cut -d= -f2-)" && echo "VOLCENGINE_API_KEY 已配置"
grep -E '^VOLCENGINE_(RESOURCE_ID|HOTWORDS_FILE)=' .env
```

## 常见问题

### Q1: API Key 在哪获取？

火山引擎豆包语音服务控制台 → 快速开始 → 查看详情 → `STEP1 获取 API Key`。模型能力在 `STEP2` 中选择并开通「豆包录音文件识别模型 2.0」。

### Q2: ffmpeg 命令找不到

```bash
which ffmpeg  # 应该输出路径
# 如果没有，重新安装：brew install ffmpeg
```

### Q3: 文件名含冒号报错

FFmpeg 命令需加 `file:` 前缀：

```bash
ffmpeg -i "file:2026:01:26 task.mp4" ...
```
