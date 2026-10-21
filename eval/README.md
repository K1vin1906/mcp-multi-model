# eval — routing benchmark for `delegate`

A small, reproducible benchmark that turns the hand-written `routing.categories` table in `config.yaml` into measured numbers: **task category × model → quality, cost, latency, failures**.

It is a table, not a product. The latest run's table is in `results/<run-id>/TABLE.md`; the "Why these defaults" section of the top-level README quotes it.

## How to run

```bash
# full run: 5 categories × 4 tasks × 6 models = 120 calls (≈ $1–2 at 2026-10 prices, 5–15 min)
node eval/run.js run --tag=v0

# subsets
node eval/run.js run --models=deepseek,gemini --categories=code,reasoning
node eval/run.js run --tasks=code-lru-cache --models=kimi_k3           # any chat model key from config.yaml
node eval/run.js run --repeat=3                                         # latency variance

# blind grading for research/creative (see below), then:
node eval/run.js report <run-id>     # merges grades.json, rewrites TABLE.md
node eval/run.js rescore <run-id>    # re-run objective scorers on stored responses (after fixing a scorer; no API calls)
node eval/run.js sheet <run-id>      # regenerate the grading sheet
```

API keys come from the project `.env` exactly as for the server. The runner imports `index.js` with `MCP_MULTI_MODEL_LIBRARY=1`, so every call goes through the **same adapter code path `delegate` / `ask_ai` use**: 60 s timeout, 2 retries on 429/5xx, `reasoning`/`force_non_streaming` flags, Kimi's `$web_search` tool loop, Gemini `google_search`, thinking-token accounting and `pricing` from `config.yaml`. Timeouts and "reasoning exhausted" outcomes are recorded as data, not discarded.

## What is measured

| category | tasks | scoring | temp |
|---|---|---|---|
| code | 4 pure functions (merge intervals, duration parser, wildcard matcher, LRU cache) | model's code block is run against **hidden tests** in a `node --permission` sandbox (no fs/network/child_process, 10 s limit); score = tests passed. A perf case catches exponential backtracking. | 0 |
| extraction | 4 documents (Chinese receipt, English job posting, server log, Chinese rental listing) → JSON | **field-level match** against gold: scalars exact after normalisation, lists by fuzzy F1, nested objects recursively; score = mean over fields | 0 |
| reasoning | 4 problems with a single verifiable answer (lattice paths, modular power, knights & knaves, CRT sum) | last number / word on the `ANSWER:` line | 0 |
| research | 4 technical comparisons (SQLite vs Postgres, WS vs SSE, Swift 6 strict concurrency, Let's Encrypt behind Cloudflare) | **blind** Claude grade 0–5: accuracy 0–2 + coverage 0–2 + form 0–1 | 0.7 |
| creative | 4 Chinese copywriting briefs (app names, App Store copy, WeChat Moments post, blog titles) | **blind** Claude grade 0–5: constraints 0–1 + originality 0–2 + fit/naturalness 0–2 | 0.7 |

Prompts, gold answers and rubrics live in `tasks.js` (`TASKSET_VERSION`); do not edit them between runs you want to compare.

Blind protocol: after a run the runner writes `grading_sheet.md` with every research/creative response under a random `R-xxxx` id in shuffled order, and the mapping in `grading_key.json`. The grader writes `grades.json` without opening the key or `raw.jsonl`; `report` joins them.

## Caveats (read before quoting a number)

- **n = 4 per cell, 1 repetition.** Differences of one task (25 points) are noise-level; latency is a single sample per call and depends on the network (this is measured from a Mac in China through a proxy to US/CN endpoints).
- Cost is **as billed through this server's config** (list price × tokens; thinking tokens count as output; Kimi `¥` converted at 7.1). Cache-hit discounts are ignored.
- `max_tokens` is 8000 for the benchmark (server default is 4000) so thinking models are not artificially truncated.
- Research/creative scores are one grader's (Claude) opinion against a written rubric, blind to the model but not to style tells.
- The Kimi entry is the realtime/web-search entry (`kimi-k2.6` with `$web_search` and a search-oriented system prefix); that is what `delegate` would actually call, so it is benchmarked as-is.

## Results — v0 run `2026-10-21T15-45-57-v0`

120 calls, **$0.78 total**. Full table with per-task scores, failure log and objective misses: [`results/2026-10-21T15-45-57-v0/TABLE.md`](results/2026-10-21T15-45-57-v0/TABLE.md).

| model | code | extraction | reasoning | research | creative | **overall** | avg $/call | median s | failures |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| deepseek (V4 Flash) | 100 | 97 | 100 | 100 | 65 | **92** | $0.0003 | 2.5 | 0/20 |
| gemini (3.8 Flash) | 75 | 100 | 100 | 95 | 85 | **91** | $0.0059 | 11.7 | 1/20 |
| openai (GPT-5.6 Luna) | 85 | 97 | 100 | 100 | 65 | **89** | $0.0004 | 5.1 | 0/20 |
| kimi (K2.6 + web search) | 50 | 100 | 100 | 90 | 55 | **79** | $0.0064 | 33.9 | 3/20 |
| deepseek-pro (V4 Pro) | 75 | 100 | 100 | 90 | 80 | **89** | $0.0012 | 9.9 | 1/20 |
| gemini-pro (3.1 Pro) | 100 | 100 | 100 | 70 | 70 | **88** | $0.0247 | 17.2 | 0/20 |

Quality is % (n = 4 tasks per cell); a timeout counts as 0. Latency is the median of 20 single samples.

### What the numbers say about `routing.categories`

- **code → deepseek: confirmed, strongly.** Only DeepSeek Flash and Gemini Pro passed every hidden test; DeepSeek did it at $0.0003/call and 2.5 s, i.e. 80× cheaper and 7× faster than Gemini Pro. The spec-heavy `parse-duration` task pushed three thinking models (Gemini Flash, DeepSeek Pro, Kimi) past the 60 s timeout, and GPT-5.6 Luna shipped a sticky-regex bug (42%).
- **research → gemini: not supported by v0 on quality, kept for Google Search.** On knowledge-stable comparisons DeepSeek (100%) and GPT-5.6 Luna (100%) matched or beat Gemini Flash (95%) at 1/15–1/20 of the cost and a third of the latency. v0 deliberately asked nothing that needs the live web, so Gemini's grounding advantage is untested; if a question does not need freshness, `ask_deepseek` / `ask_openai` are the cheaper call.
- **creative → gemini: confirmed.** Gemini 3.8 Flash had the best blind creative score (4.25/5): the only model that produced names with real imagery and Moments copy with native meme rhythm. DeepSeek Pro was close (4.0/5) at 1/5 the cost but 43 s median on creative prompts.
- **reasoning: at ceiling.** All six models solved all four problems, so cost/latency decide: DeepSeek Flash ($0.0001, 1.9 s). The current `code` category (which also catches 数学/推导) already routes there. v1 needs harder problems to separate Pro from Flash tiers.
- **extraction (no category yet): everyone 97–100%.** The two misses were counting errors (DeepSeek Flash and GPT-5.6 Luna each picked an IP with 3 requests instead of the one with 4). DeepSeek Flash is the obvious default if an `extraction` category is added.
- **Pro tiers bought nothing at this difficulty.** Gemini 3.1 Pro scored *lowest* on research (70%) because it ignored length limits on 3 of 4 prompts, at 4× Flash cost; DeepSeek Pro matched Flash quality while being 4× slower with one timeout.
- **Kimi K2.6 is the slow one.** 34 s median, 3/20 timeouts at the 60 s default, lowest overall (79). That is the realtime/web-search entry doing non-realtime work; v0 says nothing about its actual job (realtime answers), only that nothing else should be routed to it.
- **5/120 calls timed out, all on thinking models.** `defaults.timeout_ms = 60000` is the binding constraint for Kimi and for Gemini Flash / DeepSeek Pro on spec-heavy code prompts.

### What v0 cannot tell you

- Anything about **realtime / web-grounded** answers (not tested) — the one thing the `realtime` and `research` routes are actually for.
- Where **Pro tiers pay off** — nothing in v0 was hard enough to miss.
- **Latency variance** — one sample per call, from a Mac in China through a proxy.
- Blind grades are one grader (Claude) against a written rubric; style tells (markdown habits, 开场白) were visible even without the key.

### v1 wishlist

Harder reasoning/code tasks (target 50–70% pass for Flash tiers); a `realtime` category with date-stamped questions (Kimi `$web_search` vs Gemini grounding); `--repeat=3` for latency; single-task probes of `gpt-6-astra` and `kimi_k3` for the ceiling.
