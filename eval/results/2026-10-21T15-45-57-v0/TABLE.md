# mcp-multi-model routing benchmark — 2026-10-21T15-45-57-v0

Taskset v0 · server v3.9.0 · node v22.22.1 · 120 calls · timeout 60s · max_tokens 8000 · repeat 1
Temperature: code=0, extraction=0, reasoning=0, research=0.7, creative=0.7 (reasoning-flagged models ignore temperature). Quality: code = hidden tests passed; extraction = field-level match vs gold; reasoning = exact final answer; research/creative = blind Claude grade 0–5 → %.

| key | model | $/M in | $/M out | notes |
|---|---|---:|---:|---|
| deepseek | deepseek-v4-flash | 0.14 | 0.28 |  |
| gemini | gemini-3.8-flash | 0.75 | 3.75 | google_search |
| openai | gpt-5.6-luna | 0.2 | 1.2 | reasoning |
| kimi | kimi-k2.6 | 0.92 | 3.8 | reasoning, web_search |
| deepseek-pro | deepseek-v4-pro | 0.435 | 0.87 | non-streaming |
| gemini-pro | gemini-3.1-pro-preview | 2 | 12 | google_search |

## Quality (avg score, %)

| model | code | extraction | reasoning | research | creative | overall |
|---|---:|---:|---:|---:|---:|---:|
| deepseek | 100 | 97 | 100 | 100 | 65 | 92 |
| gemini | 75 | 100 | 100 | 95 | 85 | 91 |
| openai | 85 | 97 | 100 | 100 | 65 | 89 |
| kimi | 50 | 100 | 100 | 90 | 55 | 79 |
| deepseek-pro | 75 | 100 | 100 | 90 | 80 | 89 |
| gemini-pro | 100 | 100 | 100 | 70 | 70 | 88 |

## Cost (avg $ per call)

| model | code | extraction | reasoning | research | creative | overall |
|---|---:|---:|---:|---:|---:|---:|
| deepseek | $0.0003 | $0.0002 | $0.0001 | $0.0003 | $0.0004 | $0.0051 total |
| gemini | $0.0050 | $0.0057 | $0.0031 | $0.0045 | $0.0113 | $0.1186 total |
| openai | $0.0005 | $0.0004 | $0.0003 | $0.0006 | $0.0004 | $0.0085 total |
| kimi | $0.0045 | $0.0064 | $0.0033 | $0.0115 | $0.0061 | $0.1270 total |
| deepseek-pro | $0.0008 | $0.0010 | $0.0004 | $0.0009 | $0.0028 | $0.0239 total |
| gemini-pro | $0.0256 | $0.0228 | $0.0126 | $0.0195 | $0.0430 | $0.4940 total |

## Latency (median s, failures included)

| model | code | extraction | reasoning | research | creative | overall |
|---|---:|---:|---:|---:|---:|---:|
| deepseek | 2.5 | 2.0 | 1.9 | 4.7 | 6.6 | 2.5 |
| gemini | 14.3 | 9.6 | 7.2 | 12.0 | 14.8 | 11.7 |
| openai | 6.0 | 3.9 | 3.8 | 7.6 | 7.2 | 5.1 |
| kimi | 52.0 | 26.9 | 13.3 | 29.2 | 45.1 | 33.9 |
| deepseek-pro | 15.4 | 6.2 | 5.1 | 15.1 | 43.3 | 9.9 |
| gemini-pro | 17.1 | 15.5 | 12.2 | 17.2 | 32.0 | 17.2 |

## Output tokens (avg, thinking included)

| model | code | extraction | reasoning | research | creative |
|---|---:|---:|---:|---:|---:|
| deepseek | 967 | 471 | 265 | 893 | 1532 |
| gemini | 1327 | 1428 | 806 | 1197 | 3002 |
| openai | 418 | 251 | 199 | 481 | 291 |
| kimi | 1176 | 1584 | 839 | 1527 | 1578 |
| deepseek-pro | 784 | 957 | 408 | 1016 | 3174 |
| gemini-pro | 2107 | 1836 | 1034 | 1618 | 3569 |

## Failures (timeout / API error / reasoning-exhausted)

| model | code | extraction | reasoning | research | creative | overall |
|---|---:|---:|---:|---:|---:|---:|
| deepseek | 0 | 0 | 0 | 0 | 0 | 0/20 |
| gemini | 1/4 (timeout) | 0 | 0 | 0 | 0 | 1/20 |
| openai | 0 | 0 | 0 | 0 | 0 | 0/20 |
| kimi | 2/4 (timeout) | 0 | 0 | 0 | 1/4 (timeout) | 3/20 |
| deepseek-pro | 1/4 (timeout) | 0 | 0 | 0 | 0 | 1/20 |
| gemini-pro | 0 | 0 | 0 | 0 | 0 | 0/20 |

## Per-task scores (%)

### code

| task | deepseek | gemini | openai | kimi | deepseek-pro | gemini-pro |
|---|---:|---:|---:|---:|---:|---:|
| code-merge-intervals | 100 | 100 | 100 | 100 | 100 | 100 |
| code-parse-duration | 100 | 0 (timeout) | 42 | 0 (timeout) | 0 (timeout) | 100 |
| code-lru-cache | 100 | 100 | 100 | 100 | 100 | 100 |
| code-wildcard-match | 100 | 100 | 100 | 0 (timeout) | 100 | 100 |

### extraction

| task | deepseek | gemini | openai | kimi | deepseek-pro | gemini-pro |
|---|---:|---:|---:|---:|---:|---:|
| extract-receipt-zh | 100 | 100 | 100 | 100 | 100 | 100 |
| extract-job-posting-en | 100 | 100 | 99 | 100 | 100 | 100 |
| extract-rental-zh | 100 | 100 | 100 | 100 | 100 | 100 |
| extract-server-log | 89 | 100 | 89 | 100 | 100 | 100 |

### reasoning

| task | deepseek | gemini | openai | kimi | deepseek-pro | gemini-pro |
|---|---:|---:|---:|---:|---:|---:|
| reason-grid-paths | 100 | 100 | 100 | 100 | 100 | 100 |
| reason-mod-power | 100 | 100 | 100 | 100 | 100 | 100 |
| reason-knights-knaves | 100 | 100 | 100 | 100 | 100 | 100 |
| reason-crt-sum | 100 | 100 | 100 | 100 | 100 | 100 |

### research

| task | deepseek | gemini | openai | kimi | deepseek-pro | gemini-pro |
|---|---:|---:|---:|---:|---:|---:|
| research-sqlite-vs-postgres | 100 | 80 | 100 | 100 | 80 | 60 |
| research-websocket-vs-sse | 100 | 100 | 100 | 100 | 100 | 60 |
| research-swift6-strict-concurrency | 100 | 100 | 100 | 80 | 80 | 80 |
| research-letsencrypt-behind-cloudflare | 100 | 100 | 100 | 80 | 100 | 80 |

### creative

| task | deepseek | gemini | openai | kimi | deepseek-pro | gemini-pro |
|---|---:|---:|---:|---:|---:|---:|
| creative-app-store-copy | 60 | 80 | 40 | 60 | 100 | 40 |
| creative-app-names | 40 | 100 | 60 | 80 | 80 | 100 |
| creative-moments-post | 100 | 100 | 80 | 80 | 80 | 100 |
| creative-blog-titles | 60 | 60 | 80 | 0 (timeout) | 60 | 40 |

## Failure log

| task | model | kind | detail |
|---|---|---|---|
| code-parse-duration | gemini | timeout | 请求超时 (60s) |
| code-parse-duration | kimi | timeout | 请求超时 (60s) |
| code-parse-duration | deepseek-pro | timeout | 请求超时 (60s) |
| code-wildcard-match | kimi | timeout | 请求超时 (60s) |
| creative-blog-titles | kimi | timeout | 请求超时 (60s) |

## Objective misses (what exactly failed)

| task | model | score | detail |
|---|---|---:|---|
| code-parse-duration | openai | 42 | 1h30m: threw Invalid duration; 45s: threw Invalid duration; 2d4h: threw Invalid duration |
| extract-job-posting-en | openai | 99 | wrong: required_skills=0.833 |
| extract-server-log | deepseek | 89 | wrong: ip_with_most_requests=0 |
| extract-server-log | openai | 89 | wrong: ip_with_most_requests=0 |
