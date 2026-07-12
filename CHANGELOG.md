# Changelog

All notable changes to `mcp-multi-model` will be documented here.

## [3.8.0] - 2026-07-12

### Added
- **Kimi K2.7 Code 入口 (`ask_kimi_k27_code` / `ask_ai model="kimi_k27_code"`)** — Moonshot 新编程旗舰 `kimi-k2.7-code`,262K context + 多模态(图/视频),agentic coding 最强。走 `reasoning: true`(API 锁 temperature=1 / top_p=0.95,server 对 reasoning 模型跳过这两参数)。**故意不开 `web_search`**:code 用途无需联网,且规避 K2.7「多步 tool call 必须回传 assistant 的 `reasoning_content`」的新约束(当前 tool loop 未实现,开了会在第二轮报错)。编程默认仍走 DeepSeek,此为显式备选。已对真 API 验证:model ID 有效、不发 temperature 返回正常、发 temperature=0.5 确认被锁。

### Removed
- **Kimi K2.6 (`kimi_k26`)** — 被 K2.7 Code 逐项取代:同 262K context、同多模态、同价(¥6.50/¥27 in/out),更新且编程更强,无剩余差异化价值。联网搜索仍走默认 `kimi` (moonshot-v1-32k),不受影响。

### Changed（三家模型刷新,基于 live `/models` + 官方定价核对,每个新 ID 都 curl 验证过）
- **OpenAI GPT-5.4/5.5 → GPT-5.6**(2026-07-09 GA):`openai` = `gpt-5.4-mini` → **`gpt-5.6-luna`**($0.75/$4.50 → $1/$6,新一代廉价档);`openai-pro` = `gpt-5.5` → **`gpt-5.6-sol`**(同价 $5/$30,新旗舰)。⚠️ **GPT-5.6 全系锁 `temperature=1`**(curl 实测 `only 1 is allowed`),两条都加 `reasoning: true`;`index.js` 的 isReasoningModel 正则只到 gpt-5.5,5.6 靠 config flag。中档 Terra($2.50/$15)未加入。
- **视频模型死链修复**:`gemini-video` = `veo-3.0-generate-001` → **`veo-3.1-generate-preview`**。旧 ID 已 404 下线(`generate_video` 之前必失败,因 check_health 跳过视频模型未被发现)。Veo 3.1 目前只有 preview 版。
- **DeepSeek 定价核对 + 证伪注释清理**:删掉 `deepseek-pro` 那条「2026-05-31 后价格回归 4x」的预测——实际未发生,现价维持 `$0.435/$0.87`(官方 + 核对)。`deepseek-v4-flash` output 微调 `$0.29 → $0.28`。无模型变更(`/models` 只有 v4-flash/v4-pro)。
- **Gemini 保持不变**:`gemini-3.5-flash` 已 GA 但价格是现用 `gemini-3-flash-preview` 的 3 倍($1.50/$9 vs $0.50/$3),用户选择主力默认继续用便宜的 preview 档;`gemini-pro` 无 3.5 版可升。

## [3.7.0] - 2026-05-17

### Fixed
- **`ask_all` / `ask_both` 把文本 prompt 发给 image/video 生成模型导致桌面端尴尬响应** — 之前两个工具迭代全部 `modelKeys`,Imagen / Nano Banana / Veo / GPT Image 收到 chat 格式 prompt 后或返回 endpoint 错误,或返回"我是视频/图像模型,无法回答"。现在派生 `chatModelKeys`(过滤掉带 `image_generation` / `video_generation` flag 的),`ask_all` 和 `ask_both` 只跑 chat 模型;tool description 显式说明"Image/video models excluded — use generate_image / generate_video instead",让 Claude 桌面端不再尝试。
- **`delegate` 的 category 在 `delegate_to` 模型 key 缺失时静默 fallback 到全局 deepseek,与 category 语义错配** — 例如用户没配 DeepSeek key 时,`code` category 本应找另一个能写代码的模型,但旧逻辑直接走全局 fallback(可能完全不合适)。现在每个 category 新增 `fallback_chain`(同类型备选清单),启动时按顺序 resolve 出实际可用模型,在 reason 里标 `[fallback: X key missing → Y]`。

### Added
- **启动日志打印 routing 路由表** — `📋 Delegate routing: research → Gemini, code → DeepSeek, ...`,fallback 项显式标出 `(fallback, deepseek key missing)`,用户一眼能看到自己 key 配置触发了哪些重映射。
- **`delegate` tool description 动态包含 category 映射** — 之前只有"智能委派"一句,Claude 不知道每个 category 路由到谁,倾向直接走 `ask_<provider>` 绕开。现在 description 形如 `(Routes: research→Gemini, code→DeepSeek*, ...; * = fallback due to missing key)`,Claude 可基于映射信任地用 delegate。

## [3.6.6] - 2026-05-11

### Fixed
- **Kimi K2.6 `invalid temperature: only 1 is allowed`** — K2.6 是 reasoning 模型,Moonshot API 拒绝 temperature ≠ 1。新增通用 config 字段 `reasoning: true`,让 server 跳过自动设 temperature;canonical 与 example 的 `kimi_k26` 已启用。原有正则 `(gpt-5\.5|o1-|o3-|o4-)` 作 fallback,未来新增 reasoning 模型直接改 config 不动代码。
- **`check_health` 把视频/图像生成模型当 chat 模型 ping 导致 (a) 视频模型必报 offline,(b) 图像模型真实扣费** — Veo / Imagen / Nano Banana / GPT Image 等模型走专用 endpoint(`:predictLongRunning` / `:predict`),check_health 通用 ping 走 `:streamGenerateContent` / `chat/completions` 不仅会报错,图像类还会真实产出图片并计费。现在带 `video_generation` / `image_generation` flag 的模型在 check_health 中标 `skipped`(⏭️ icon)而非 online/offline。

### Changed
- **`ask_all` / `ask_both` description 双语化** — 原中文描述让 ToolSearch 的英文关键词 `ask_all` / `all models` / `parallel` 命中率低,影响其他 Claude(尤其桌面端)的工具发现。改为英文为主 + 中文括注。

## [3.6.5] - 2026-05-11

### Fixed
- **DeepSeek V4 Pro 等思考模型流式空响应** — 思考模型(`reasoning_content` 通道)流式 SSE 的 `delta.content` 在 thinking 阶段长时间为空,且 reasoning_tokens 会吃掉 `max_tokens` 预算导致最终始终拿不到可见 content。新增 `force_non_streaming` 模型级 flag,设了之后跳过流式,直接读非流式 `message.content`(实测 800 token 预算下 reasoning_tokens=78 + completion_tokens=104,content 完整返回)。canonical + example 已在 `deepseek-pro` 启用。

### Added
- 模型配置项 `force_non_streaming: true` — 通用 flag,任何走 OpenAI 兼容协议但希望强制非流式的模型(reasoning 类、批处理类)都可启用。

## [3.6.4] - 2026-05-11

### Fixed
- **`config.example.yaml` 模型清单与 README 对齐** — 修复 npx / `.mcpb` 用户开箱即坏的产品问题:此前 `config.example.yaml` 仍是 2024 末/2025 初的模型 id(`gpt-4o-mini`、`gemini-2.x` 等),但 README 一直宣传"GPT-5 reasoning、Imagen 4、Veo 3.x"。现在 example 同步到最新清单:DeepSeek V4 (flash + pro)、GPT-5.4 mini / GPT-5.5、Gemini 3 Flash / 3.1 Pro、Imagen 4 Fast / Ultra、Nano Banana 2 / Pro、GPT Image 2 (medium + HD)、Veo 3.x、Kimi v1-32k / K2.6。

## [3.6.0] - 2026-04-13

### Added
- **Startup version check** — async check against npm registry on startup; notifies via stderr when a newer version is available (`📦 Update available: vX → vY`). Non-blocking, fails silently if offline.
- **Multi-model cost summary** — `ask_all` and `ask_both` now append a `📊` summary line showing models called, total tokens, and per-model + total cost breakdown.
- **3 new providers** — Mistral, Groq, Together AI added to manifest and config template (12 providers total).
- **Provider reorder** — manifest `user_config` and config template sorted by global popularity: OpenAI → Gemini → Grok → Perplexity → Mistral → Groq → OpenRouter → DeepSeek → Qwen → GLM → Kimi → Together AI.

### Changed
- **New icon** — bright hub-and-spoke design on white background; high contrast at small sizes (replaces dark cosmic icon that was invisible in Claude Desktop tool buttons).
- **Version string from package.json** — `PKG_VERSION` read once at startup, eliminates hardcoded version in 2 places (`McpServer` constructor + startup banner).

## [3.5.0] - 2026-04-10

### Added
- **Unified `ask_ai` tool** — one entry point to query any configured model by passing `model` parameter (e.g. `deepseek`, `gemini`, `kimi`), with per-call `temperature` (0–2) and `top_p` (0–1) inference parameters. Existing `ask_deepseek` / `ask_gemini` / `ask_kimi` tools remain available for backward compatibility. `delegate` retains independent value for category-based auto-routing.

## [3.4.0] - 2026-04-10

### Added
- **`generate_video` tool** — generate short video clips via Gemini Veo models (`veo-3.1-generate-preview` and `fast`/`lite` variants). Uses long-running polling (up to 3 minutes). Videos saved to `/tmp/mcp-media/videos/vid_{timestamp}.mp4` or custom `save_path`, and auto-opened.
- Missing API key startup hint — on server start, show signup links for any required `*_API_KEY` env var that is not set.

### Fixed
- `generate_video` `duration` schema: constrained to exactly `4`, `6`, or `8` seconds via `z.literal` union. Veo API rejects odd seconds despite the error message suggesting "between 4 and 8".
- `generate_image`: confirmed correct Gemini model id `gemini-2.5-flash-image` (previously docs had stale `preview-image` suffix).

## [3.3.0 – 3.3.2] - 2026-04-10

### Added
- **Model fallback chain** — `callModel` auto-switches to `fallback_to` target on failure, with `_isFallback` guard to prevent loops.
- **`check_health` tool** — pings all configured models and reports online/offline status plus latency.
- **Response caching** — identical prompts cached with configurable `cache_ttl_ms`; conversation calls are never cached.
- **Daily budget limit** — configurable `daily_budget_usd`; calls exceeding the daily spend are rejected.
- **Image generation** — Gemini Nano Banana model family (`gemini-2.5-flash-image`, `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview`). Auto-saves to `/tmp/mcp-media/images/` and opens preview.
- **`delegate` routing tool** — category-based auto-routing to appropriate model (research / code / realtime / creative / auto).

## [3.2.0] - earlier

### Added
- Local model support (Ollama, LM Studio, llama.cpp) via `openai`-compatible adapter.
- Streaming output (SSE) for OpenAI-compatible and Gemini APIs.
- Cost tracking with per-model `pricing` config.
- Conversation history via `conversation_id` (30-minute expiry, up to 10 turns).

## Earlier

See git log for pre-3.2 history.
