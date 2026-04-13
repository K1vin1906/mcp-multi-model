# mcp-multi-model

**Give Claude Code superpowers — image gen, video gen, web search, and smart multi-model routing.**

One MCP server. All the models you need. Zero tab-switching.

![demo](demo/demo.gif)

```bash
npx mcp-multi-model
```

> If you find this useful, please give it a ⭐ — it helps others discover the project!

---

## What can it do?

### 🎨 Generate images and videos — right in the terminal

> "Generate a macOS app icon with a glowing indigo orb"

Claude calls Gemini Imagen, saves the PNG, and opens it. No browser, no Figma, no context switch.

Video too — Gemini Veo generates short clips from a text prompt.

### 🧠 Smart routing — the right model for the job

Tell Claude to research something → it routes to **Gemini** (Google Search grounding).
Ask it to write code → it routes to **DeepSeek** (fast, cheap, great at code).
Need real-time info in Chinese → it routes to **Kimi** (web search).

You don't pick the model. The routing does it for you.

### ⚖️ Compare models side by side

> "Ask both DeepSeek and Gemini how to implement a B-tree"

Two answers, one terminal. See which model gives you a better solution.

### 🌐 Web search built in

Gemini uses Google Search grounding. Kimi searches the Chinese web. No separate browser-use MCP needed.

### 🔧 One-line install

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

That's it. No git clone, no build step.

---

## Supported Models

Works with any OpenAI-compatible API or Google Gemini API:

| Model | Adapter | Why use it |
|-------|---------|------------|
| DeepSeek | `openai` | Code, math, logic — extremely low cost |
| Gemini | `gemini` | Long context, broad knowledge, Google Search |
| Kimi (Moonshot) | `openai` | Chinese web search, real-time info |
| **Ollama / LM Studio / llama.cpp** | `openai` | **Local — no API key, no cost, full privacy** |

Add more models (GPT-4o, Qwen, Yi, Mistral, etc.) by editing `config.yaml`.

## MCP Tools

Tools are dynamically generated from your config. With the default setup:

| Tool | What it does |
|------|-------------|
| `ask_ai` | Query any model — unified entry with `temperature` / `top_p` control |
| `ask_deepseek` | Query DeepSeek directly |
| `ask_gemini` | Query Gemini directly |
| `ask_kimi` | Query Kimi directly |
| `ask_all` | Query all models in parallel, compare results |
| `ask_both` | Query any two models in parallel |
| `delegate` | Smart routing — auto-picks the best model for the task |
| `generate_image` | Text → image via Gemini Imagen |
| `generate_video` | Text → video via Gemini Veo |
| `translate` | CN ↔ EN translation |
| `research` | Deep research with web search |
| `check_health` | Ping all models, report status and latency |

## Installation

### Option 1: npx (recommended)

Add to your Claude Code MCP config (`~/.mcp.json`):

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

Then add to your MCP config:

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

```bash
cp config.example.yaml config.yaml
```

```yaml
defaults:
  max_tokens: 4000
  temperature: 0.7
  timeout_ms: 60000
  max_retries: 2
  # cache_ttl_ms: 300000   # Cache identical prompts for 5 min
  # daily_budget_usd: 5.0  # Daily spending limit in USD

models:
  deepseek:
    name: DeepSeek
    adapter: openai
    endpoint: https://api.deepseek.com/chat/completions
    api_key_env: DEEPSEEK_API_KEY
    model: deepseek-chat
    description: "Code, math, logic. Low cost."
    fallback_to: gemini
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

  # Local models — no API key needed:
  # ollama:
  #   name: Ollama
  #   adapter: openai
  #   endpoint: http://localhost:11434/v1/chat/completions
  #   model: llama3.2
```

## Image Generation

Generate images using Gemini Imagen models. Uses the same `GEMINI_API_KEY`.

| Model ID | Speed | Free RPM |
|----------|-------|----------|
| `gemini-2.5-flash-image` | Fast (~3s) | 2,000 |
| `gemini-3.1-flash-image-preview` | Medium (~5s) | 500 |
| `gemini-3-pro-image-preview` | Slow (~10s) | 500 |

Supports `aspect_ratio`: `1:1`, `3:2`, `4:3`, `16:9`, `9:16`.

## Video Generation

Generate short video clips using Gemini Veo models.

| Parameter | Type | Notes |
|-----------|------|-------|
| `prompt` | string | Text description of the desired video |
| `aspect_ratio` | `16:9` / `9:16` / `1:1` | |
| `duration` | `4` / `6` / `8` (seconds) | Must be even |
| `save_path` | string? | Defaults to `/tmp/mcp-media/videos/` |

## Local Models

Any OpenAI-compatible local runner works — Ollama, LM Studio, llama.cpp, vLLM:

```yaml
models:
  ollama:
    name: Ollama
    adapter: openai
    endpoint: http://localhost:11434/v1/chat/completions
    model: llama3.2
```

Mix local and cloud models freely — use `ask_all` to compare Ollama vs DeepSeek vs Gemini in one call.

## Built-in Features

- **Auto-retry & fallback** — Exponential backoff on 429/5xx, automatic fallback to backup model
- **Conversation history** — Multi-turn context with `conversation_id` (30min expiry, up to 10 turns)
- **Cost tracking** — Per-call token usage and cost estimation
- **Response caching** — Cache identical prompts with configurable TTL
- **Daily budget limit** — Set a spending cap; calls are blocked when exceeded
- **Streaming** — Real-time SSE streaming for all adapters

## Privacy

This is a **local relay**. No telemetry, no analytics, no data sent to the extension author. Prompts go directly from your machine to the LLM provider you configured.

**Full policy:** [k1vin1906.github.io/mcp-multi-model/privacy.html](https://k1vin1906.github.io/mcp-multi-model/privacy.html)

## License

MIT
