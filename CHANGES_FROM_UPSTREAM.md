# 相比上游的修改

本 fork 基于 [Ceeon/videocut-skills](https://github.com/Ceeon/videocut-skills) 改造，上游 README 标注为 MIT License。

本文档用于记录本 fork 的主要修改，方便后续使用者和维护者区分「上游原始行为」与「本 fork 新增/修改行为」。

## 优化依据

本轮改造参考了《花叔的 Claude Skills 白皮书 2025年12月》的 Skill 设计建议，不只是补功能，也对 skill 的可维护性和 Agent 执行稳定性做了系统整理。

主要遵循的原则包括：

- 脚本优先于临场生成代码：把确定性流程封装成可重复运行的脚本，减少 Agent 每次手写步骤导致的误差。
- `SKILL.md` 保持轻量导航：主文件只保留触发条件、主流程和关键分支，复杂规则迁移到 `references/` 按需读取。
- 减少文档漂移：同步 README、安装说明、`.env.example` 和各 skill 文档，避免 Agent 读到旧接口、旧路径或旧流程。
- 使用相对路径和动态 `SKILL_DIR`：移除个人机器上的硬编码路径，提升迁移性。
- 为核心产物补 schema、fixture 和校验脚本：让转录、分析、审核、剪辑之间的数据契约更清楚。
- 补充 `agents/openai.yaml` 元数据：让 skill 在列表展示、默认提示和迁移场景中更稳定。
- 明确安全和隐私边界：把默认第三方上传行为写进文档，并提供禁用上传的配置路径。

## 许可和来源说明

- 在 `README.md` 中保留上游项目来源。
- 继续按 MIT License 分发，与上游 README 的 license 标注保持一致。
- 新增根目录 `LICENSE` 文件，补齐 MIT License 全文，便于再分发。
- 新增本文档，集中记录 fork 后的主要修改。

## 火山引擎 ASR 修改

- 将转录后端改为火山引擎 AUC bigmodel 标准版两段式流程：
  - `POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit`
  - `POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/query`
- 默认资源 ID 改为 `volc.seedasr.auc`。
- 文档中明确并验证当前使用的模型能力是「豆包录音文件识别模型 2.0」。
- 保留 `show_utterances=true`，因为剪口播流程依赖字级时间戳。
- 新增 `volcengine_request.json` 输出，便于检查请求体和排查转录问题。

## 热词和词典

- 实现从 `字幕/词典.txt` 自动读取热词。
- 新增 `VOLCENGINE_HOTWORDS_FILE`，允许用户覆盖热词词典路径。
- 通过火山引擎 `request.corpus.context` 直传热词。

## 网页审核和剪辑流程

- 继续保留网页审核式口播剪辑流程：
  - `generate_review.js` 生成 `review.html`。
  - `review_server.js` 提供审核页面服务，并接收删除片段。
  - `cut_video.sh` 执行帧级精确 FFmpeg 剪辑。
- 修复审核页生成后的服务器启动提示，改为指向 `review_server.js`，不再提示使用 `python3 -m http.server`。
- 保留并修复 macOS 友好的 Shift 批量选中能力：使用 Pointer Events 和 Shift 状态追踪，改善 Mac 电脑上按住 Shift 拖动批量选中的体验。

## Skill 架构优化

本部分主要对应白皮书里「降低 Agent 上下文负担」「确定性步骤脚本化」「规则按需加载」和「用可验证产物替代口头约定」的建议。

- 新增顶层路由 skill：`SKILL.md`，名称为 `videocut`。用户不知道该用哪个子 skill 时，可以先用 `$videocut` 获得流程引导。
- 新增顶层 `agents/openai.yaml`，让路由 skill 在列表展示和默认提示里更稳定。
- 按 `skill-builder` 质量门优化顶层路由：补充触发正例、不应触发场景、决策步骤、缺信息提问规则和上传/剪辑安全边界。
- 将 `剪口播/SKILL.md` 压缩成 Agent 导航页，减少常驻上下文。
- 将详细规则迁移到按需读取的 references：
  - `剪口播/references/pipeline_steps.md`
  - `剪口播/references/silence_rules.md`
  - `剪口播/references/misread_rules.md`
  - `剪口播/references/review_server.md`
  - `剪口播/references/cut_encoding.md`
  - `剪口播/references/data_formats.md`
  - `剪口播/references/schemas.md`
- 新增 `剪口播/scripts/run_pipeline.sh`，作为从视频到审核页的推荐确定性入口。
- 新增 `剪口播/scripts/prepare_analysis_inputs.js`，用于生成 `readable.txt` 和 `sentences.txt`。
- 新增 `剪口播/scripts/validate_outputs.js`，用于校验核心 JSON 产物。
- 新增 `剪口播/fixtures/sample_volcengine_result.json`，用于本地验证和回归测试。

## 上传隐私边界

- 新增 `剪口播/scripts/upload_audio.sh`。
- 新增 `VIDEO_UPLOAD_PROVIDER=uguu`，作为默认上传器。
- 新增 `VIDEO_UPLOAD_PROVIDER=none`，用于禁止把敏感音频上传到第三方服务，并要求用户提供可信的 `--audio-url`。
- 在文档中明确说明：默认上传流程会把提取出来的音频上传到第三方临时文件托管服务，以便火山引擎拉取音频。

## 文档完善

- README 新增火山引擎「豆包录音文件识别模型 2.0」开通步骤和截图。
- `.env.example` 更新为当前 ASR、热词和上传器配置。
- `安装/SKILL.md` 同步当前火山控制台流程和 `.env` 位置。
- 移除 skill 文档中陈旧的本地硬编码路径，例如 `/Users/chengfeng/...`。
- 为各个 skill 新增 `agents/openai.yaml` 元数据。

## 说明

本文档不是完整 commit log，而是面向用户和维护者的 fork 级修改摘要。完整细节请以 Git 提交历史和代码 diff 为准。
