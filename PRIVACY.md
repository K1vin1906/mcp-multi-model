# Privacy Policy — Multi-Model MCP

**Last updated:** 2026-04-11

## Overview

Multi-Model MCP ("the extension") is a Model Context Protocol server that runs locally on your machine. It acts as a **relay** between Claude Desktop and third-party Large Language Model (LLM) providers that you explicitly configure. The extension does not run any backend service, cloud component, or telemetry endpoint.

## What data is collected by this extension

**None.**

- No analytics, telemetry, crash reports, or usage metrics are sent to the extension author or any third party.
- No prompts, responses, API keys, or any other content ever leaves your machine to an endpoint controlled by the extension author.
- The extension performs no tracking or user identification.

## What data leaves your machine

When you invoke a tool (`ask_ai`, `ask_all`, `generate_image`, etc.), the extension sends your prompt (and any attached context, such as `system_prompt` or `conversation_id`-linked history) to **the LLM provider you configured for that call**. This happens over HTTPS directly from your machine to the provider's API endpoint.

The data you send is governed entirely by the privacy policy of the provider you chose. Before configuring a provider's API key, please review that provider's own privacy policy:

| Provider | Privacy Policy |
|---|---|
| DeepSeek | https://platform.deepseek.com/downloads/DeepSeek%20Privacy%20Policy.html |
| Google Gemini | https://policies.google.com/privacy |
| Moonshot Kimi | https://www.moonshot.cn/privacy |
| OpenAI | https://openai.com/policies/privacy-policy |
| OpenRouter | https://openrouter.ai/privacy |
| Perplexity | https://www.perplexity.ai/hub/legal/privacy-policy |
| xAI Grok | https://x.ai/legal/privacy-policy |
| Qwen (Alibaba DashScope) | https://www.alibabacloud.com/help/en/legal/latest/alibaba-cloud-international-website-privacy-policy |
| GLM (Zhipu AI) | https://www.bigmodel.cn/static/agreement/privacy.html |

## Local data storage

The extension stores the following **only on your local machine**:

1. **API keys** — Provided through Claude Desktop's extension configuration UI (stored by Claude Desktop), or via a local `.env` file on your disk. Keys are never written anywhere else by this extension.
2. **Conversation history** — Multi-turn context linked by `conversation_id`, held **in process memory only** for up to 30 minutes or 10 turns, whichever comes first. Nothing is written to disk. History is lost when the extension process exits.
3. **Cost tracking** — A running tally of token usage and estimated cost, held in process memory, cleared on restart.
4. **Response cache** (optional) — If `cache_ttl_ms` is configured, identical prompts are cached in process memory for the configured duration. Cache is lost on restart.
5. **Generated media** — If you use `generate_image` or `generate_video`, files are written to `/tmp/mcp-media/` on macOS/Linux (or the equivalent temp directory on Windows). These files persist until your operating system cleans the temp directory (typically on reboot). You may delete them at any time.

No files are written to any other location.

## Your control

- **Revoke all data flow:** Uninstall the extension from Claude Desktop, or remove the API key(s) for any provider you no longer want the extension to reach.
- **Review logs:** The extension writes diagnostic messages to Claude Desktop's extension log (standard location). These contain tool names, model names, and error messages but **not** full prompts or responses.
- **Inspect the source code:** The extension is open source (MIT License) at https://github.com/K1vin1906/mcp-multi-model.

## Changes to this policy

Material changes will be announced via the project's GitHub releases page and reflected in both the `CHANGELOG.md` file and the "Last updated" date above.

## Contact

Issues or questions: https://github.com/K1vin1906/mcp-multi-model/issues
