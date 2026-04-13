# Changelog

All notable changes to `mcp-multi-model` will be documented here.

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
