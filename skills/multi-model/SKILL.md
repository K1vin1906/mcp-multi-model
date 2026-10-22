---
name: multi-model
description: Consult other AI models (OpenAI GPT, Google Gemini, DeepSeek, Kimi) and generate images or videos through the mcp-multi-model MCP server. Use when the user wants to delegate research, code, or creative work to another model, compare models side by side, get a second opinion, check real-time or Chinese-web information, gather evidence for an important decision, or generate an image or video. Also use to decide which model to call and what it costs.
license: MIT
metadata:
  version: "1.0.0"
  server: mcp-multi-model
  requires: "mcp-multi-model >= 3.11"
---

# Multi-model playbook

You are the orchestrator. The `mcp-multi-model` server is a set of hands that reach other providers. This skill is the brain: when to reach out, to whom, and how much to trust what comes back.

## What the server gives you

| Tool | What it does | Notes |
|---|---|---|
| `ask_<model>` (one per model) | Send a prompt to one model | Fastest path when you know who to ask |
| `ask_ai` | Same, with `temperature` / `top_p` overrides | Use only when you need those knobs |
| `delegate` | Route a task by category to the default model | `research` / `code` / `realtime` / `creative` / `auto` |
| `ask_both` | Two models in parallel, side by side | Best tool for fact-checking |
| `ask_all` | All chat models in parallel | Bias detection only, see below |
| `research` | Web-grounded report via Gemini + Google Search | `depth`: brief / standard / deep |
| `translate` | Chinese <-> English via DeepSeek | `style`: formal / casual / technical |
| `generate_image` | Text to image, saved to disk | Default model is cheap and fast |
| `generate_video` | Text to 4 / 6 / 8 second video via Veo | Asynchronous, minutes |
| `check_health` | Ping every chat model, report latency | Run first if several calls fail |

Model keys you will see: `deepseek`, `deepseek-pro`, `openai` (GPT-5.6 Luna), `openai-pro` (GPT-6 Astra), `openai-search`, `openai-pro-search`, `gemini` (3.8 Flash), `gemini-pro` (3.1 Pro), `kimi` (K2.6), `kimi_k27_code`, `kimi_k3`, plus image models `nano-banana-lite`, `nano-banana`, `nano-banana-pro`, `gpt-image`, `gpt-image-hd` and video model `gemini-video`. The exact list comes from the server's `config.yaml`; `ask_ai`'s schema shows what is configured.

## Default routing

| Task | Call | Why |
|---|---|---|
| Background research, comparisons, surveys | `delegate(category="research")` or `research` | Gemini has Google Search built in |
| Deep research, long documents | `ask_gemini-pro` | Stronger model, still web-grounded |
| Algorithms, pure functions, math | `delegate(category="code")` | DeepSeek V4 Flash is strong and nearly free |
| Hard reasoning in code or math | `ask_deepseek-pro` | Thinking mode, slower |
| Today's news, prices, Chinese internet | `delegate(category="realtime")` | Kimi K2.6 searches the Chinese web |
| Names, slogans, marketing copy, stories | `delegate(category="creative")` | Gemini |
| A second opinion with a different training lineage | `ask_openai` | GPT-5.6 Luna, cheap |
| Frontier reasoning, agentic coding, vision | `ask_openai-pro` | GPT-6 Astra, expensive |
| Web-grounded answer with source URLs | `ask_openai-search` | Luna + OpenAI web search |
| Images | `generate_image` | See image notes below |
| Video | `generate_video` | Even seconds only: 4, 6, 8 |

Do not delegate work that depends on files, project context, or state only you can see. Those models cannot read the user's repository, memory, or earlier conversation. Delegate self-contained tasks and put every needed fact into the prompt.

## Cost and speed

| Tier | Models | Typical cost per call |
|---|---|---|
| Cheap, fast | `deepseek`, `gemini`, `openai`, `kimi` | fractions of a cent to a few cents |
| Mid | `gemini-pro`, `deepseek-pro`, `openai-search` (~$0.02-0.05 with search) | cents |
| Premium | `openai-pro` (GPT-6 Astra, $10 / $50 per M tokens), `openai-pro-search` (~$0.3-1 per question), `kimi_k3` (slow, often times out) | tens of cents to a dollar |
| Parallel | `ask_all` (~9 models) | ~$0.1-0.2, Astra and K3 dominate |

Prices drift. Treat these as tiers, not quotes. Reach for premium only when a cheap model has already failed or the task clearly needs it.

## Protocol for facts that matter

Use this when the answer drives a real decision and you cannot verify it from local files: purchases, versions, legal or policy details, anything with a date or a number.

1. Get two independent web-grounded answers: `ask_both(model_a="openai-search", model_b="gemini-pro", prompt=...)`. Ask for source URLs in the prompt.
2. If your host has its own web tools, open the primary sources yourself. Read the official page, not the models' retelling.
3. Cross-check. Agreement between two grounded sources plus a primary document is evidence. One model's answer is not.
4. Disagreement is a finding, not noise. Say who disagrees, why, and which one you trust.
5. For Chinese-market questions add `ask_kimi` as a third angle. Weight it lower; it is slow and biased to Chinese sites.

Models answering from training data will give confident, outdated facts. Today's defaults, prices, and version numbers change monthly. Grounded or it does not count.

## What `ask_all` is and is not

`ask_all` sends one prompt to every chat model and returns all answers. Use it to detect bias: everyone says X, one model says Y, so go check Y. It is not an evidence source. Inside `ask_all` only `gemini`, `gemini-pro`, and `kimi` have live web search; the rest answer from memory. It takes one to two minutes (each model is capped by its own timeout, slow ones like kimi_k3 simply drop out) and costs about ten single calls. Do not use it for simple questions, and do not call it repeatedly in one task.

## Long calls and host timeouts

Some calls legitimately run for minutes. If a call fails with a timeout, do not retry blindly; the failure is often the host's MCP tool timeout, not the server.

| Host | Default MCP tool timeout | Fix |
|---|---|---|
| Claude Code | long enough | none needed |
| Codex CLI | 60 s | `tool_timeout_sec = 300` under `[mcp_servers.multi-model]` in `~/.codex/config.toml` |
| Gemini CLI | 600 s | none needed |
| Grok Build | 6000 s | none needed |
| Cline | 60 s | Network Timeout dropdown on the server card, set 5 min or more |
| Cursor | not documented | keep calls short; avoid `ask_all` |

Expected durations: single cheap model 5-30 s; `gemini-pro` and `openai-search` 20-90 s; `openai-pro-search` up to 180 s; `ask_all` 60-120 s; `generate_video` several minutes. For a single slow model you can also pass a smaller `max_tokens`.

## Working with results

- Every answer ends with a stats line: tokens in and out, latency, cost. Report cost to the user when it is more than a few cents.
- Multi-turn with one model: pass the same `conversation_id` on each call. Different models do not share a conversation.
- `generate_image` and `generate_video` save the file locally and return the path; tell the user the path. Pass `save_path` to control where it goes.
- Image model choice: default (`generate_image`) is Nano Banana 2 Lite, about $0.03 per image. Reference-image editing: `ask_nano-banana`. 4K or complex prompts: `ask_nano-banana-pro`. Text that must render exactly (posters, labels): `ask_gpt-image`.
- If several models fail at once, run `check_health` before retrying.

## Don'ts

- Don't send secrets, credentials, or private data to external models. Strip them from the prompt first.
- Don't call `ask_all` or `openai-pro-search` for routine questions.
- Don't present a single model's unsourced answer as fact.
- Don't delegate tasks that need the repository, local files, or conversation history.
- Don't request `duration` other than 4, 6, or 8 for video.

## Examples

**Offload a self-contained research task**
`delegate(category="research", task="Compare SQLite WAL mode vs rollback journal for a single-writer desktop app: durability, read concurrency, file size growth. Cite docs.")`

**Fact-check before recommending a purchase**
`ask_both(model_a="openai-search", model_b="gemini-pro", prompt="What is the current price and max session length of Veo 3.1 via the Gemini API? Give the official URL.")` then open the URL yourself.

**Check for bias on a judgment call**
`ask_all(prompt="For a solo developer in 2026, is a native macOS menu bar app better built in SwiftUI or Electron? One paragraph, state your assumption.")` then look for the outlier.
