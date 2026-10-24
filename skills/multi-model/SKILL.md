---
name: multi-model
description: Consult other AI models (OpenAI GPT, Google Gemini, DeepSeek, Kimi) and generate images or videos through the mcp-multi-model MCP server. Use when the user wants to delegate research, code, or creative work to another model, compare models side by side, get a second opinion, check real-time or Chinese-web information, gather evidence for an important decision, or generate an image or video. Also use to decide which model to call and what it costs.
license: MIT
metadata:
  version: "1.1.0"
  server: mcp-multi-model
  requires: "mcp-multi-model >= 3.12"
---

# Multi-model playbook

You are the orchestrator. The `mcp-multi-model` server is a set of hands that reach other providers. This skill is the brain: when to reach out, to whom, and how much to trust what comes back.

## What the server gives you

| Tool | What it does | Notes |
|---|---|---|
| `ask_<model>` (one per model) | Send a prompt to one model | Fastest path when you know who to ask |
| `ask_ai` | Same, with `temperature` / `top_p` overrides | Use only when you need those knobs |
| (all chat tools) | `effort="fast"` or `"deep"` | fast is the default: low reasoning, quickest. See below |
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

## Effort: fast by default, deep on demand

Every chat tool takes `effort`. It maps to each provider's own knob (Gemini `thinking_level`, OpenAI `reasoning_effort`, Kimi K3 `reasoning_effort`), so you never set those yourself.

| `effort` | What it means | When |
|---|---|---|
| `fast` (default for `gemini`, `openai`, `openai-search`, `kimi`, `deepseek`) | Low reasoning budget. Gemini 3.8 Flash answers a web-grounded research question in ~10-20 s instead of ~55 s, with no loss on lookup-style work | Research, summaries, comparisons, creative, realtime, anything where the answer is mostly retrieved or written, not derived |
| `deep` (default for `gemini-pro`, `openai-pro`, `openai-pro-search`, `kimi_k3`) | High reasoning budget, 2-5× slower, more output tokens billed | Multi-step analysis, hard math or code, decisions where you want the model to actually think. Escalate to `deep` when a `fast` answer is shallow or wrong |

`ask_all` always runs at `fast` unless you pass `effort="deep"`, so the flagship thinking models no longer dominate its latency and cost. Models without an effort map (`deepseek`, `kimi`, `kimi_k27_code`) ignore the parameter.

## Nothing is cut silently

The server guarantees three things so you can trust what comes back:

- **Budget headroom.** Thinking models spend part of `max_tokens` on reasoning tokens. The server adds `thinking_headroom` (default 4000) on top of your `max_tokens` for those models, so "max_tokens: 4000" means 4000 tokens of visible answer. You do not need to inflate `max_tokens` yourself; passing a smaller value does not make a thinking model faster either, use `effort="fast"` for that.
- **Truncation is marked.** If a model still stops on its budget, the text ends with `[⚠️ Output truncated: max_tokens reached (...)]`; an answer that is all reasoning and no text comes back as a one-line diagnostic. Other early stops (safety filter, stalled stream) end with `[⚠️ Output stopped early: ...]`. Treat a marked answer as partial: raise `max_tokens`, narrow the ask, or switch to `fast`.
- **`delegate` and `research` fall back.** If the routed model fails (timeout, 5xx, stalled stream), the server retries once with the first available model of that category's `fallback_chain` and says so in the header: `⚠️ Gemini failed: Request timed out (120s) → answered by OpenAI Search (fallback)`. Two failures in a row are reported as an error naming both models. `ask_<model>` and `ask_ai` are explicit choices and do not fall back.

## Cost and speed

| Tier | Models | Typical cost per call |
|---|---|---|
| Cheap, fast | `deepseek`, `gemini`, `openai`, `kimi` | fractions of a cent to a few cents |
| Mid | `gemini-pro`, `deepseek-pro`, `openai-search` (~$0.02-0.05 with search) | cents |
| Premium | `openai-pro` (GPT-6 Astra, $10 / $50 per M tokens), `openai-pro-search` (~$0.3-1 per question at `deep`), `kimi_k3` (slow at `deep`) | tens of cents to a dollar |
| Parallel | `ask_all` (~9 models, runs at `effort="fast"`) | ~$0.05-0.15 |

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

`ask_all` sends one prompt to every chat model and returns all answers. Use it to detect bias: everyone says X, one model says Y, so go check Y. It is not an evidence source. Inside `ask_all` only `gemini`, `gemini-pro`, and `kimi` have live web search; the rest answer from memory. It runs every model at `effort="fast"` (pass `effort="deep"` only when the comparison needs full reasoning), takes about 10-20 s at `fast` and a minute or more at `deep` (each model is capped by its own timeout and reports its own failure inline) and costs about ten single calls. Do not use it for simple questions, and do not call it repeatedly in one task.

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

Expected durations at `fast`: single cheap model 3-20 s; web-grounded `gemini` / `openai-search` 10-40 s; `kimi` 15-60 s. At `deep`: 2-5× that; `openai-pro-search` up to 180 s. `ask_all` 10-20 s at `fast`, a minute or more at `deep`; `generate_video` several minutes. Server-side timeouts are per model (60 s default, 120 s for web and thinking models, 180 s for `openai-pro-search`), so a host timeout below 180 s is the thing to raise.

## Working with results

- Every answer ends with a stats line: tokens in and out (with the thinking share), latency, `effort=`, cost. Report cost to the user when it is more than a few cents.
- A `[⚠️ Output truncated ...]` or `[⚠️ Output stopped early ...]` tail means the answer is partial; say so, do not quote it as complete. A `⚠️ ... → answered by X (fallback)` header means a different model than the route's default answered.
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
