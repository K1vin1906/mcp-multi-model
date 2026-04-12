# mcp-multi-model

> If you find this useful, please consider giving it a ⭐ — it helps others discover the project!

An MCP server that lets Claude Code query multiple AI models (DeepSeek, Gemini, Kimi, and more) in parallel. Compare answers, leverage each model's strengths, and get real-time monitoring — all from within Claude Code.

![demo](demo/demo.gif)

## Features

- **Parallel multi-model queries** — Ask one question, get answers from all configured models side by side
- **Streaming output** — Real-time SSE streaming for OpenAI-compatible and Gemini APIs
- **Conversation history** — Multi-turn context with `conversation_id` (30min expiry, up to 10 turns)
- **Built-in tools** — `translate` (CN/EN) and `research` (with web search) out of the box
- **Web search** — Kimi web search and Gemini Google Search grounding
- **Cost tracking** — Per-call token usage and cost estimation based on model pricing
- **Auto-retry & fallback** — Exponential backoff on 429/5xx, plus automatic fallback to a backup model on failure
- **Health check** — `check_health` tool to ping all models and report status/latency
- **Response caching** — Cache identical prompts with configurable TTL to save cost and time
- **Image generation** — Generate images via Gemini Nano Banana models with `generate_image` tool
- **Video generation** — Generate short video clips via Gemini Veo models with `generate_video` tool
- **Unified `ask_ai` tool** — One tool to query any configured model, with per-call `temperature` / `top_p` inference control
- **Daily budget limit** — Set a daily spending cap; calls are blocked when exceeded
- **YAML config** — Add new models by editing `config.yaml`, no code changes needed
- **Real-time monitoring** — Optional [Agent Monitor](https://github.com/K1vin1906/agent-monitor) TUI dashboard via Unix socket

## Supported Models

Works with any OpenAI-compatible API or Google Gemini API. Pre-configured examples:

| Model | Adapter | Highlights |
|-------|---------|------------|
| DeepSeek | `openai` | Code, math, logic. Very low cost |
| Gemini | `gemini` | Long context, broad knowledge, Google Search |
| Kimi (Moonshot) | `openai` | Chinese web search, real-time info |
| **Ollama / LM Studio / llama.cpp** | `openai` | **Local models — no API key, no cost, full privacy** |

Add more models (GPT-4o, Qwen, Yi, Mistral, etc.) by adding entries to `config.yaml`. Any OpenAI-compatible API works, including local model runners.

## Installation

### Option 1: npx (recommended)

No install needed. Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "multi-model": {
      "command": "npx",
      "args": ["-y", "mcp-multi-model"],
      "env": {
        "DEEPSEEK_API_KEY": "sk-...",
        "GEMINI_API_KEY": "AI..."
      }
    }
  }
}
```

### Option 2: Clone and run locally

```bash
git clone https://github.com/K1vin1906/mcp-multi-model.git
cd mcp-multi-model
npm install
npm run setup   # Interactive setup wizard — validates your API keys
```

Then add to Claude Code config:

```json
{
  "mcpServers": {
    "multi-model": {
      "command": "node",
      "args": ["/path/to/mcp-multi-model/index.js"]
    }
  }
}
```

> API keys can be set via `env` in the config above, or in a `.env` file in the project directory.

## Configuration

Copy and edit the config file:

```bash
cp config.example.yaml config.yaml
```

```yaml
defaults:
  max_tokens: 4000
  temperature: 0.7
  timeout_ms: 60000
  max_retries: 2
  # cache_ttl_ms: 300000   # Cache identical prompts for 5 min (0 = disabled)
  # daily_budget_usd: 5.0  # Daily spending limit in USD (omit = unlimited)

models:
  deepseek:
    name: DeepSeek
    adapter: openai                    # openai or gemini
    endpoint: https://api.deepseek.com/chat/completions
    api_key_env: DEEPSEEK_API_KEY      # reads from environment
    model: deepseek-chat
    description: "Code, math, logic. Low cost."
    fallback_to: gemini                # auto-fallback if this model fails
    pricing:
      input: 0.14    # $/M tokens
      output: 0.28

  gemini:
    name: Gemini
    adapter: gemini
    endpoint: https://generativelanguage.googleapis.com/v1beta
    api_key_env: GEMINI_API_KEY
    model: gemini-2.5-flash-preview-04-17
    description: "Long context, broad knowledge, Google Search."
    features:
      - google_search
    pricing:
      input: 0.10
      output: 0.40

  # Add any OpenAI-compatible model:
  # qwen:
  #   name: Qwen
  #   adapter: openai
  #   endpoint: https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
  #   api_key_env: DASHSCOPE_API_KEY
  #   model: qwen-plus

  # Local models — no API key needed:
  # ollama:
  #   name: Ollama
  #   adapter: openai
  #   endpoint: http://localhost:11434/v1/chat/completions
  #   model: llama3.2
  #   description: "Local Ollama model. No API key, no cost, full privacy."

tools:
  translate:
    model: deepseek
    description: "CN/EN translation via DeepSeek."
  research:
    model: gemini
    description: "Tech research with web search via Gemini."
```

## Local Models

Any OpenAI-compatible local model runner works out of the box. Just omit `api_key_env`:

**Ollama**
```bash
ollama pull llama3.2
```
```yaml
models:
  ollama:
    name: Ollama
    adapter: openai
    endpoint: http://localhost:11434/v1/chat/completions
    model: llama3.2
    description: "Local Llama 3.2 via Ollama."
```

**LM Studio**
```yaml
models:
  lmstudio:
    name: LM Studio
    adapter: openai
    endpoint: http://localhost:1234/v1/chat/completions
    model: loaded-model
    description: "Local model via LM Studio."
```

**llama.cpp / vLLM / text-generation-webui** — any server with `/v1/chat/completions` endpoint works the same way.

You can mix local and cloud models freely — e.g., use `ask_all` to compare Ollama vs DeepSeek vs Gemini in one call.

## Image Generation

Generate images using Gemini's Nano Banana models. Uses the same `GEMINI_API_KEY`.

```yaml
models:
  gemini-image:
    name: Gemini Image
    adapter: gemini
    endpoint: https://generativelanguage.googleapis.com/v1beta
    api_key_env: GEMINI_API_KEY
    model: gemini-2.5-flash-image   # Nano Banana — fast, 2K RPM free tier
    description: "Generate images with Gemini."
    image_generation: true

tools:
  generate_image:
    model: gemini-image
    description: "Generate images from text descriptions."
```

Available image models:

| Model ID | Codename | Speed | Free RPM |
|----------|----------|-------|----------|
| `gemini-2.5-flash-image` | Nano Banana | Fast (~3s) | 2,000 |
| `gemini-3.1-flash-image-preview` | Nano Banana 2 | Medium (~5s) | 500 |
| `gemini-3-pro-image-preview` | Nano Banana Pro | Slow (~10s) | 500 |

The `generate_image` tool supports `aspect_ratio` parameter: `1:1`, `3:2`, `4:3`, `16:9`, `9:16`.

## Video Generation

Generate short video clips from text prompts using Gemini Veo models. Uses the same `GEMINI_API_KEY`.

```yaml
models:
  gemini-video:
    name: Gemini Video
    adapter: gemini
    endpoint: https://generativelanguage.googleapis.com/v1beta
    api_key_env: GEMINI_API_KEY
    model: veo-3.1-generate-preview   # also: veo-3.1-fast-generate-preview, veo-3.1-lite-generate-preview
    description: "Generate videos with Veo."
    video_generation: true

tools:
  generate_video:
    model: gemini-video
    description: "Generate short videos from text prompts."
```

The `generate_video` tool parameters:

| Parameter | Type | Notes |
|-----------|------|-------|
| `prompt` | string | Text description of the desired video |
| `aspect_ratio` | `16:9` / `9:16` / `1:1` | |
| `duration` | `4` / `6` / `8` (seconds) | Veo rejects odd seconds — the literal type is enforced |
| `save_path` | string? | Custom save path; defaults to `/tmp/mcp-media/videos/vid_{timestamp}.mp4` |

Generation uses long-running polling (up to 3 minutes).

## MCP Tools

Tools are dynamically generated from your config. With the default 3-model setup you get:

| Tool | Description |
|------|-------------|
| `ask_ai` | **Unified entry** — query any configured model via `model` parameter, with `temperature` / `top_p` control |
| `ask_deepseek` | Query DeepSeek |
| `ask_gemini` | Query Gemini |
| `ask_kimi` | Query Kimi |
| `ask_all` | Query all models in parallel, compare results |
| `ask_both` | Query any two models in parallel |
| `check_health` | Ping all models, report online/offline status and latency |
| `generate_image` | Generate images from text prompts (requires Gemini image model) |
| `generate_video` | Generate short videos from text prompts (requires Gemini video model) |
| `translate` | CN/EN translation |
| `research` | Tech research with web search |

### Parameters

All `ask_*` tools accept:

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | string | Your question |
| `system_prompt` | string? | Optional system prompt |
| `max_tokens` | number? | Max output tokens (default: 4000) |
| `conversation_id` | string? | Pass same ID for multi-turn conversations |

`ask_ai` additionally accepts:

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | string | Which configured model to query (e.g. `deepseek`, `gemini`, `kimi`) |
| `temperature` | number? | Sampling temperature, 0–2 |
| `top_p` | number? | Nucleus sampling, 0–1 |

## Examples

Three complete examples showing prompt → tool call → expected output. They assume you've configured the relevant models in `config.yaml` (or via the Claude Desktop extension installer).

### Example 1 — Compare the same question across all configured models

**You say to Claude:**

    Use ask_all to compare how DeepSeek, OpenAI, Gemini, and Kimi answer "What is 100 + 100?"

**Claude invokes:**

```json
{
  "name": "ask_all",
  "arguments": {
    "prompt": "What is 100 + 100?"
  }
}
```

**Expected output** (each model's response with its latency and cost):

    ━━━ DeepSeek ━━━
    200
    [deepseek-chat · 15 tokens · 6.0s · $0.000004]

    ━━━ OpenAI ━━━
    200
    [gpt-4o-mini · 14 tokens · 3.7s · $0.000008]

    ━━━ Gemini ━━━
    200
    [gemini-3-flash-preview · 12 tokens · 4.1s · $0.000008]

    ━━━ Kimi ━━━
    200
    [moonshot-v1-auto · 16 tokens · 3.4s · $0.000060]

All four models return `200`; side-by-side timing and cost let you see which provider is fastest and cheapest for your workload.

### Example 2 — Technical research with Gemini Google Search grounding

**You say to Claude:**

    Research the current state of WebTransport browser support

**Claude invokes:**

```json
{
  "name": "research",
  "arguments": {
    "topic": "Current state of WebTransport browser support",
    "depth": "standard"
  }
}
```

**Expected output** (Gemini grounds the answer in live Google Search results):

    研究结果:

    WebTransport is currently supported by Chromium-based browsers
    (Chrome, Edge, Opera) since version 97 in 2022. Firefox has had it
    behind a flag in Nightly since 2023; Safari has not shipped support
    as of early 2026.
    ...
    (~500-word structured summary with implementation status and spec references)

    [Gemini · 820 tokens · 5.4s]

### Example 3 — Generate an image with Gemini Nano Banana

**You say to Claude:**

    Generate a 1:1 macOS app icon: glowing central orb with light streams converging inward, deep indigo gradient

**Claude invokes:**

```json
{
  "name": "generate_image",
  "arguments": {
    "prompt": "macOS app icon, squircle, glowing central orb with light streams converging inward, deep indigo gradient, Apple HIG style",
    "aspect_ratio": "1:1"
  }
}
```

**Expected output:**

    Here's an icon for your macOS application...

    [Gemini Image · 1408 tokens · 8.7s · $0.000540 · /tmp/mcp-media/images/img_2026-04-11T17-35-22.png]

The 1024×1024 PNG is saved to `/tmp/mcp-media/images/` and auto-opens in your system's image viewer.

## Privacy

Multi-Model MCP is a **local relay**. It runs on your machine and does not send any data to an endpoint controlled by the extension author — no telemetry, no analytics, no crash reports.

When you invoke a tool, the prompt is sent directly from your machine to the LLM provider you configured for that call (DeepSeek, Gemini, OpenAI, etc.) over HTTPS. That data is governed by the respective provider's privacy policy — please review each one before configuring their API key.

Local state (conversation history, cost tracking, response cache) lives in process memory and is lost on restart. Generated media is saved to `/tmp/mcp-media/` and can be deleted at any time.

**Full policy:** [k1vin1906.github.io/mcp-multi-model/privacy.html](https://k1vin1906.github.io/mcp-multi-model/privacy.html) (also available as [`PRIVACY.md`](./PRIVACY.md) in this repository)

## Agent Monitor (Optional)

A companion TUI dashboard that shows real-time model activity, streaming output, token usage, and cost tracking.

See [agent-monitor](https://github.com/K1vin1906/agent-monitor) for setup instructions.

## License

MIT
