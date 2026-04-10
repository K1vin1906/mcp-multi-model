#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import net from "net";
import yaml from "js-yaml";
import { existsSync, unlinkSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 加载 .env ──
try {
  const envFile = readFileSync(join(__dirname, ".env"), "utf-8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^\s*([\w]+)\s*=\s*"?([^"#\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

// ── 加载配置 ──
let configPath = join(__dirname, "config.yaml");
if (!existsSync(configPath)) {
  configPath = join(__dirname, "config.example.yaml");
  if (!existsSync(configPath)) {
    console.error("❌ config.yaml not found. Copy config.example.yaml and configure your API keys.");
    process.exit(1);
  }
  console.error("ℹ  Using default config (config.example.yaml). Create config.yaml to customize.");
}
const config = yaml.load(readFileSync(configPath, "utf-8"));
const defaults = config.defaults || {};
const TIMEOUT = defaults.timeout_ms || 60000;
const MAX_RETRIES = defaults.max_retries ?? 2;
const DEFAULT_MAX_TOKENS = defaults.max_tokens || 4000;
const DEFAULT_TEMP = defaults.temperature || 0.7;
const MAX_HISTORY_TURNS = defaults.max_history_turns || 10;
const CONVERSATION_EXPIRY = 30 * 60 * 1000; // 30 minutes
const CACHE_TTL = defaults.cache_ttl_ms || 0; // 0 = disabled
const DAILY_BUDGET = defaults.daily_budget_usd ?? Infinity;

// ── 对话历史管理 ──
const conversations = new Map(); // id -> { [modelKey]: { messages: [], lastAccess } }

function getHistory(conversationId, modelKey) {
  if (!conversationId) return [];
  const conv = conversations.get(conversationId);
  return conv?.[modelKey]?.messages || [];
}

function saveHistory(conversationId, modelKey, userMsg, assistantMsg) {
  if (!conversationId) return;
  if (!conversations.has(conversationId)) conversations.set(conversationId, {});
  const conv = conversations.get(conversationId);
  if (!conv[modelKey]) conv[modelKey] = { messages: [], lastAccess: 0 };
  const h = conv[modelKey];
  h.messages.push({ role: "user", content: userMsg }, { role: "assistant", content: assistantMsg });
  h.lastAccess = Date.now();
  while (h.messages.length > MAX_HISTORY_TURNS * 2) h.messages.splice(0, 2);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, conv] of conversations) {
    const last = Math.max(0, ...Object.values(conv).map(c => c.lastAccess || 0));
    if (now - last > CONVERSATION_EXPIRY) conversations.delete(id);
  }
}, 60_000);

// ── Response cache ──
const responseCache = new Map(); // cacheKey -> { result, expires }

function makeCacheKey(modelKey, prompt, systemPrompt) {
  return `${modelKey}\0${prompt}\0${systemPrompt || ""}`;
}

// 定期清理过期缓存
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of responseCache) {
    if (now >= v.expires) responseCache.delete(k);
  }
}, 60_000);

// ── Budget tracking ──
const budget = { date: new Date().toDateString(), spent: 0 };

function checkBudget() {
  const today = new Date().toDateString();
  if (today !== budget.date) { budget.spent = 0; budget.date = today; }
  if (budget.spent >= DAILY_BUDGET) {
    throw new Error(`Daily budget ($${DAILY_BUDGET}) exceeded. Spent today: $${budget.spent.toFixed(4)}`);
  }
}

// ── API key 申请链接 ──
const API_KEY_URLS = {
  DEEPSEEK_API_KEY: "https://platform.deepseek.com/api_keys",
  GEMINI_API_KEY: "https://aistudio.google.com/apikey",
  KIMI_API_KEY: "https://platform.moonshot.cn/console/api-keys",
  OPENAI_API_KEY: "https://platform.openai.com/api-keys",
};

// 解析模型配置
const models = {};
const skippedModels = []; // { name, envVar, url }
for (const [key, cfg] of Object.entries(config.models || {})) {
  const apiKey = cfg.api_key_env ? process.env[cfg.api_key_env] : "";
  if (cfg.api_key_env && !apiKey) {
    skippedModels.push({ name: cfg.name, envVar: cfg.api_key_env, url: API_KEY_URLS[cfg.api_key_env] });
    console.error(`⚠️  ${cfg.name}: ${cfg.api_key_env} not set, skipped`);
    continue;
  }
  const pricing = cfg.pricing || {};
  models[key] = { ...cfg, key, apiKey, fallbackTo: cfg.fallback_to || null, pricing: { input: pricing.input || 0, output: pricing.output || 0 } };
}

const modelKeys = Object.keys(models);
if (modelKeys.length === 0) {
  console.error("❌ No models available. Check your API keys and config.yaml");
  process.exit(1);
}
console.error(`✅ Loaded ${modelKeys.length} models: ${modelKeys.join(", ")}`);

// ── Agent Monitor: UDS 事件广播 ──
const SOCKET_PATH = "/tmp/agent-monitor.sock";
const monitorClients = new Set();
let ownsSocket = false;

const udsServer = net.createServer((client) => {
  monitorClients.add(client);
  client.on("close", () => monitorClients.delete(client));
  client.on("error", () => monitorClients.delete(client));
});

function listenSocket() {
  if (ownsSocket) return; // 已经在监听
  udsServer.listen(SOCKET_PATH, () => {
    ownsSocket = true;
    console.error("📡 Monitor socket: " + SOCKET_PATH);
  });
  udsServer.once("error", (err) => {
    if (err.code === "EADDRINUSE") {
      // probe: 连得上说明有活进程在用；连不上说明是残留，清理重建
      const probe = net.createConnection(SOCKET_PATH);
      probe.on("connect", () => {
        probe.destroy();
        console.error("📡 Monitor socket in use by another instance, will retry in 30s");
      });
      probe.on("error", () => {
        try { unlinkSync(SOCKET_PATH); } catch {}
        // 立即重试一次
        udsServer.listen(SOCKET_PATH, () => {
          ownsSocket = true;
          console.error("📡 Monitor socket: " + SOCKET_PATH);
        });
      });
    }
  });
}

// 定期重试，直到拿到 socket
const socketRetryInterval = setInterval(() => {
  if (ownsSocket) { clearInterval(socketRetryInterval); return; }
  if (existsSync(SOCKET_PATH)) {
    // 探测是否还活着
    const probe = net.createConnection(SOCKET_PATH);
    probe.on("connect", () => probe.destroy()); // 还在用，下次再试
    probe.on("error", () => {
      try { unlinkSync(SOCKET_PATH); } catch {}
      listenSocket();
    });
  } else {
    listenSocket();
  }
}, 30_000);
listenSocket();

function emitEvent(event) {
  const line = JSON.stringify({ ...event, timestamp: Date.now() }) + "\n";
  for (const client of monitorClients) {
    try { client.write(line); } catch { monitorClients.delete(client); }
  }
}

// ── 带超时和重试的 fetch ──
async function fetchWithRetry(url, options, { agent, retries = MAX_RETRIES } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT) });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const wait = Math.min(1000 * 2 ** attempt, 8000);
        emitEvent({ type: "AGENT_RETRY", agent, status: res.status, attempt: attempt + 1, wait });
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        const errMsg = await res.text();
        const errType = res.status === 429 ? "rate_limit" : res.status >= 500 ? "server_error" : "api_error";
        emitEvent({ type: "AGENT_ERROR", agent, error: errMsg, status: res.status, errType });
        throw new Error(`API error (${res.status}): ${errMsg}`);
      }
      return await res.json();
    } catch (e) {
      if (e.name === "TimeoutError" || e.name === "AbortError") {
        emitEvent({ type: "AGENT_ERROR", agent, error: `Request timeout (${TIMEOUT}ms)`, errType: "timeout" });
        throw new Error(`请求超时 (${TIMEOUT / 1000}s)`);
      }
      if (e.message?.includes("fetch failed") || e.cause?.code === "ECONNREFUSED") {
        if (attempt < retries) {
          const wait = 1000 * 2 ** attempt;
          emitEvent({ type: "AGENT_RETRY", agent, error: e.message, attempt: attempt + 1, wait });
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        emitEvent({ type: "AGENT_ERROR", agent, error: e.message, errType: "network" });
        throw new Error(`网络连接失败: ${e.message}`);
      }
      throw e;
    }
  }
}

// ── SSE 流式解析 ──
async function* parseSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;
          try { yield JSON.parse(data); } catch {}
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function fetchStream(url, options, { agent } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      const errMsg = await res.text();
      const errType = res.status === 429 ? "rate_limit" : res.status >= 500 ? "server_error" : "api_error";
      emitEvent({ type: "AGENT_ERROR", agent, error: errMsg, status: res.status, errType });
      throw new Error(`API error (${res.status}): ${errMsg}`);
    }
    return res;
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") {
      emitEvent({ type: "AGENT_ERROR", agent, error: `Request timeout (${TIMEOUT}ms)`, errType: "timeout" });
      throw new Error(`请求超时 (${TIMEOUT / 1000}s)`);
    }
    throw e;
  }
}

// ── 适配器：OpenAI 兼容 ──
async function adapterOpenAI(modelCfg, prompt, systemPrompt, maxTokens, history = [], extra = {}) {
  const messages = [];
  const sysParts = [modelCfg.system_prefix, systemPrompt].filter(Boolean).join("\n\n");
  if (sysParts) messages.push({ role: "system", content: sysParts });
  if (history.length) messages.push(...history);
  messages.push({ role: "user", content: prompt });

  const reqBody = {
    model: modelCfg.model,
    messages,
    max_tokens: maxTokens,
    temperature: extra.temperature ?? modelCfg.temperature ?? DEFAULT_TEMP,
  };
  if (extra.topP != null) reqBody.top_p = extra.topP;

  const features = modelCfg.features || [];
  const hasToolLoop = features.includes("web_search");

  if (hasToolLoop) {
    reqBody.tools = [{ type: "builtin_function", function: { name: "$web_search" } }];
  }

  const headers = { "Content-Type": "application/json" };
  if (modelCfg.apiKey) headers.Authorization = `Bearer ${modelCfg.apiKey}`;

  // 有工具循环的模型（如 Kimi web_search）使用非流式
  if (hasToolLoop) {
    const fetchOpts = { method: "POST", headers, body: JSON.stringify(reqBody) };
    let data = await fetchWithRetry(modelCfg.endpoint, fetchOpts, { agent: modelCfg.key });
    let choice = data.choices?.[0];
    const loopMax = modelCfg.tool_loop_max || 5;
    let rounds = 0;
    while (choice?.finish_reason === "tool_calls" && choice?.message?.tool_calls && rounds < loopMax) {
      rounds++;
      messages.push(choice.message);
      for (const tc of choice.message.tool_calls) {
        messages.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: tc.function.arguments || "{}" });
      }
      reqBody.messages = messages;
      data = await fetchWithRetry(modelCfg.endpoint,
        { method: "POST", headers, body: JSON.stringify(reqBody) },
        { agent: modelCfg.key }
      );
      choice = data.choices?.[0];
    }
    const usage = data.usage || {};
    return {
      content: choice?.message?.content || "",
      model: data.model || modelCfg.model,
      tokens: { prompt: usage.prompt_tokens || 0, completion: usage.completion_tokens || 0, total: usage.total_tokens || 0 },
    };
  }

  // 流式请求
  reqBody.stream = true;
  reqBody.stream_options = { include_usage: true };
  const res = await fetchStream(modelCfg.endpoint,
    { method: "POST", headers, body: JSON.stringify(reqBody) },
    { agent: modelCfg.key }
  );

  let content = "";
  let usage = {};
  let model = modelCfg.model;

  for await (const chunk of parseSSE(res)) {
    const delta = chunk.choices?.[0]?.delta?.content || "";
    if (delta) {
      content += delta;
      emitEvent({ type: "AGENT_CHUNK", agent: modelCfg.key, delta });
    }
    if (chunk.usage) usage = chunk.usage;
    if (chunk.model) model = chunk.model;
  }

  return {
    content,
    model,
    tokens: { prompt: usage.prompt_tokens || 0, completion: usage.completion_tokens || 0, total: usage.total_tokens || 0 },
  };
}

// ── 适配器：Gemini ──
async function adapterGemini(modelCfg, prompt, systemPrompt, maxTokens, history = [], extra = {}) {
  const contents = history.map(msg => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));
  contents.push({ role: "user", parts: [{ text: prompt }] });

  const body = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature: extra.temperature ?? DEFAULT_TEMP },
  };
  if (extra.topP != null) body.generationConfig.topP = extra.topP;

  const features = modelCfg.features || [];
  if (features.includes("google_search")) {
    body.tools = [{ google_search: {} }];
  }
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  // Image generation: non-streaming, responseModalities + imageConfig
  if (modelCfg.image_generation) {
    body.generationConfig.responseModalities = ["TEXT", "IMAGE"];
    const imgCfg = extra.imageConfig || {};
    if (Object.keys(imgCfg).length) body.generationConfig.imageConfig = imgCfg;

    const url = `${modelCfg.endpoint}/models/${modelCfg.model}:generateContent?key=${modelCfg.apiKey}`;
    const data = await fetchWithRetry(url,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      { agent: modelCfg.key }
    );

    let content = "";
    const images = [];
    const parts = data.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.text) content += part.text;
      if (part.inlineData) images.push({ mimeType: part.inlineData.mimeType, data: part.inlineData.data });
    }
    const usage = data.usageMetadata || {};
    return {
      content, images,
      model: modelCfg.model,
      tokens: { prompt: usage.promptTokenCount || 0, completion: usage.candidatesTokenCount || 0, total: usage.totalTokenCount || 0 },
    };
  }

  // 流式：streamGenerateContent + alt=sse
  const url = `${modelCfg.endpoint}/models/${modelCfg.model}:streamGenerateContent?key=${modelCfg.apiKey}&alt=sse`;
  const res = await fetchStream(url,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    { agent: modelCfg.key }
  );

  let content = "";
  let usage = {};

  for await (const chunk of parseSSE(res)) {
    const parts = chunk.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.text) {
        content += part.text;
        emitEvent({ type: "AGENT_CHUNK", agent: modelCfg.key, delta: part.text });
      }
    }
    if (chunk.usageMetadata) usage = chunk.usageMetadata;
  }

  return {
    content,
    model: modelCfg.model,
    tokens: { prompt: usage.promptTokenCount || 0, completion: usage.candidatesTokenCount || 0, total: usage.totalTokenCount || 0 },
  };
}

// ── Veo 视频生成（异步轮询） ──
async function generateVeoVideo(modelCfg, prompt, { aspectRatio = "16:9", durationSeconds = 8 } = {}) {
  const apiKey = modelCfg.apiKey;
  const model = modelCfg.model;
  const baseUrl = modelCfg.endpoint;

  // Step 1: 提交生成请求
  const submitUrl = `${baseUrl}/models/${model}:predictLongRunning?key=${apiKey}`;
  emitEvent({ type: "AGENT_START", agent: modelCfg.key, model, prompt });

  const submitBody = {
    instances: [{ prompt }],
    parameters: { sampleCount: 1, durationSeconds, aspectRatio },
  };

  const submitRes = await fetchWithRetry(submitUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submitBody),
  }, { agent: modelCfg.key });

  const opName = submitRes.name;
  if (!opName) throw new Error("No operation name in response: " + JSON.stringify(submitRes).slice(0, 500));

  emitEvent({ type: "AGENT_CHUNK", agent: modelCfg.key, delta: `[submitted: ${opName}]` });

  // Step 2: 轮询等待完成
  const VIDEO_TIMEOUT = 180_000; // 3 min
  const POLL_INTERVAL = 5_000;   // 5s
  const t0 = Date.now();

  while (Date.now() - t0 < VIDEO_TIMEOUT) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    const pollUrl = `${baseUrl}/${opName}?key=${apiKey}`;
    const pollRes = await fetch(pollUrl, { signal: AbortSignal.timeout(30_000) });
    if (!pollRes.ok) {
      const errText = await pollRes.text();
      throw new Error(`Video poll error (${pollRes.status}): ${errText}`);
    }
    const status = await pollRes.json();

    if (status.error) {
      throw new Error(`Video generation failed: ${JSON.stringify(status.error)}`);
    }

    const elapsed = Math.round((Date.now() - t0) / 1000);
    emitEvent({ type: "AGENT_CHUNK", agent: modelCfg.key, delta: `[polling ${elapsed}s...]` });

    if (status.done) {
      // 尝试多种可能的响应格式
      const resp = status.response || {};
      const samples = resp.generateVideoResponse?.generatedSamples
        || resp.generatedVideos
        || [];

      if (!samples.length) throw new Error("Video generation completed but no samples: " + JSON.stringify(status).slice(0, 1000));

      const videos = [];
      for (const sample of samples) {
        const videoObj = sample.video || sample;
        const uri = videoObj.uri;
        if (!uri) continue;

        // 下载视频文件
        const dlUrl = uri.includes("key=") ? uri : `${uri}${uri.includes("?") ? "&" : "?"}key=${apiKey}`;
        const dlRes = await fetch(dlUrl, { signal: AbortSignal.timeout(60_000) });
        if (!dlRes.ok) throw new Error(`Video download failed (${dlRes.status}): ${await dlRes.text()}`);
        const buffer = Buffer.from(await dlRes.arrayBuffer());
        const encoding = videoObj.encoding || "video/mp4";
        const ext = encoding.includes("webm") ? "webm" : "mp4";
        videos.push({ buffer, ext });
      }

      if (!videos.length) throw new Error("No downloadable videos in response");

      const duration_ms = Date.now() - t0;
      emitEvent({ type: "AGENT_END", agent: modelCfg.key, model, duration_ms, content: `[${videos.length} video(s) generated]` });
      return { videos, duration_ms };
    }
  }

  throw new Error(`Video generation timed out (${VIDEO_TIMEOUT / 1000}s)`);
}

// ── 通用调用入口 ──
const adapters = { openai: adapterOpenAI, gemini: adapterGemini };

async function callModel(key, prompt, { systemPrompt = "", maxTokens = DEFAULT_MAX_TOKENS, conversationId = "", _isFallback = false, _skipCache = false, imageConfig, temperature, topP } = {}) {
  const cfg = models[key];
  if (!cfg) throw new Error(`模型 "${key}" 未配置或 API key 缺失`);
  const adapter = adapters[cfg.adapter];
  if (!adapter) throw new Error(`未知的 adapter 类型: ${cfg.adapter}`);

  // Budget check
  checkBudget();

  // Cache lookup (skip for conversations and explicit bypass)
  const ck = makeCacheKey(key, prompt, systemPrompt);
  if (CACHE_TTL > 0 && !conversationId && !_skipCache) {
    const cached = responseCache.get(ck);
    if (cached && Date.now() < cached.expires) {
      emitEvent({ type: "CACHE_HIT", agent: key, prompt: prompt.slice(0, 100) });
      return { ...cached.result };
    }
  }

  const history = getHistory(conversationId, key);
  const t0 = Date.now();
  emitEvent({ type: "AGENT_START", agent: key, model: cfg.model, prompt, systemPrompt, conversationId: conversationId || undefined, historyTurns: history.length / 2 });
  try {
    const result = await adapter(cfg, prompt, systemPrompt, maxTokens, history, { imageConfig, temperature, topP });
    result.duration_ms = Date.now() - t0;
    result.cost_usd = calcCost(result.tokens, cfg.pricing);
    budget.spent += result.cost_usd;
    saveHistory(conversationId, key, prompt, result.content);
    emitEvent({ type: "AGENT_END", agent: key, model: result.model, content: result.content, tokens: result.tokens, duration_ms: result.duration_ms, cost_usd: result.cost_usd });

    // Cache store
    if (CACHE_TTL > 0 && !conversationId && !_skipCache) {
      responseCache.set(ck, { result: { ...result }, expires: Date.now() + CACHE_TTL });
    }

    return result;
  } catch (e) {
    const duration = Date.now() - t0;
    emitEvent({ type: "AGENT_ERROR", agent: key, error: e.message, duration_ms: duration });
    // Fallback: if not already a fallback attempt and a fallback model is configured
    if (!_isFallback && cfg.fallbackTo && models[cfg.fallbackTo]) {
      emitEvent({ type: "AGENT_FALLBACK", from: key, to: cfg.fallbackTo, error: e.message });
      return callModel(cfg.fallbackTo, prompt, { systemPrompt, maxTokens, conversationId, _isFallback: true });
    }
    throw e;
  }
}

// ── 成本计算 ──
function calcCost(tokens, pricing) {
  if (!pricing) return 0;
  return (tokens.prompt * pricing.input + tokens.completion * pricing.output) / 1_000_000;
}

// ── 格式化 ──
function fmt(name, r) {
  const sec = (r.duration_ms / 1000).toFixed(1);
  const costStr = r.cost_usd > 0 ? ` | $${r.cost_usd.toFixed(6)}` : "";
  return `━━━ ${name} (${r.model}) ━━━\n${r.content}\n[tokens: ${r.tokens.prompt} in → ${r.tokens.completion} out, total ${r.tokens.total} | ${sec}s${costStr}]`;
}

// ── MCP Server ──
const server = new McpServer({ name: "mcp-multi-model", version: "3.5.0" }, { capabilities: { logging: {} } });

// 动态注册每个模型的 ask_{key} 工具
for (const [key, cfg] of Object.entries(models)) {
  server.tool(`ask_${key}`, cfg.description || `向 ${cfg.name} 发送请求。`, {
    prompt: z.string().describe("提示词"),
    system_prompt: z.string().optional().describe("系统提示词"),
    max_tokens: z.number().optional().default(DEFAULT_MAX_TOKENS).describe("最大 token 数"),
    conversation_id: z.string().optional().describe("对话 ID，传入相同 ID 可保持多轮上下文"),
  }, async ({ prompt, system_prompt, max_tokens, conversation_id }) => {
    try {
      const r = await callModel(key, prompt, { systemPrompt: system_prompt || "", maxTokens: max_tokens, conversationId: conversation_id || "" });
      const parts = [{ type: "text", text: fmt(cfg.name, r) }];
      if (r.images?.length) {
        for (const img of r.images) parts.push({ type: "image", data: img.data, mimeType: img.mimeType });
      }
      return { content: parts };
    } catch (e) {
      return { content: [{ type: "text", text: `${cfg.name} 错误: ${e.message}` }], isError: true };
    }
  });
}

// ask_ai — 通用入口，指定模型 + 推理参数
const modelEnum = z.enum(modelKeys);
server.tool("ask_ai", `Unified entry point: send a prompt to any configured model (${modelKeys.join(", ")}). Supports per-call inference parameters.`, {
  model: modelEnum.describe(`Target model key: ${modelKeys.join(", ")}`),
  prompt: z.string().describe("The prompt to send"),
  system_prompt: z.string().optional().describe("Optional system prompt"),
  max_tokens: z.number().optional().default(DEFAULT_MAX_TOKENS).describe("Max output tokens"),
  temperature: z.number().min(0).max(2).optional().describe("Sampling temperature (0-2). Overrides model default for this call."),
  top_p: z.number().min(0).max(1).optional().describe("Top-p (nucleus sampling, 0-1). Overrides model default for this call."),
  conversation_id: z.string().optional().describe("Conversation ID for multi-turn context"),
}, async ({ model, prompt, system_prompt, max_tokens, temperature, top_p, conversation_id }) => {
  try {
    const r = await callModel(model, prompt, {
      systemPrompt: system_prompt || "",
      maxTokens: max_tokens,
      conversationId: conversation_id || "",
      temperature,
      topP: top_p,
    });
    const cfg = models[model];
    const parts = [{ type: "text", text: fmt(cfg.name, r) }];
    if (r.images?.length) {
      for (const img of r.images) parts.push({ type: "image", data: img.data, mimeType: img.mimeType });
    }
    return { content: parts };
  } catch (e) {
    return { content: [{ type: "text", text: `${models[model]?.name || model} error: ${e.message}` }], isError: true };
  }
});

// check_health — 检查所有模型健康状态
server.tool("check_health", "Ping all configured models and report online/offline status with latency.", {}, async () => {
  const results = await Promise.allSettled(
    modelKeys.map(async (key) => {
      const cfg = models[key];
      const adapter = adapters[cfg.adapter];
      const t0 = Date.now();
      try {
        await adapter(cfg, "Hi", "", 5, []);
        return { key, name: cfg.name, status: "online", latency_ms: Date.now() - t0 };
      } catch (e) {
        return { key, name: cfg.name, status: "offline", latency_ms: Date.now() - t0, error: e.message };
      }
    })
  );
  const lines = results.map(r => {
    const v = r.status === "fulfilled" ? r.value : { name: "?", status: "error", latency_ms: 0, error: r.reason?.message };
    const icon = v.status === "online" ? "✅" : "❌";
    const err = v.error ? ` — ${v.error}` : "";
    return `${icon} ${v.name}: ${v.status} (${v.latency_ms}ms)${err}`;
  });
  return { content: [{ type: "text", text: lines.join("\n") }] };
});

// ask_all — 并行调用所有模型
if (modelKeys.length >= 2) {
  server.tool("ask_all", `并行请求 ${modelKeys.map(k => models[k].name).join("、")}，返回对比结果。`, {
    prompt: z.string().describe("通用提示词"),
    system_prompt: z.string().optional().describe("共用系统提示词"),
    conversation_id: z.string().optional().describe("对话 ID，传入相同 ID 可保持多轮上下文"),
  }, async ({ prompt, system_prompt, conversation_id }) => {
    const opts = { systemPrompt: system_prompt || "", conversationId: conversation_id || "" };
    const results = await Promise.allSettled(
      modelKeys.map(k => callModel(k, prompt, opts))
    );
    const parts = results.map((r, i) =>
      r.status === "fulfilled"
        ? fmt(models[modelKeys[i]].name, r.value)
        : `━━━ ${models[modelKeys[i]].name} 错误 ━━━\n${r.reason?.message}`
    );
    return { content: [{ type: "text", text: parts.join("\n\n" + "═".repeat(50) + "\n\n") }] };
  });
}

// ask_both — 并行调用任意两个模型
if (modelKeys.length >= 2) {
  const modelEnum = z.enum(modelKeys);
  server.tool("ask_both", "并行请求两个模型，返回对比结果。", {
    prompt: z.string().describe("通用提示词"),
    model_a: modelEnum.optional().default(modelKeys[0]).describe("第一个模型"),
    model_b: modelEnum.optional().default(modelKeys[1]).describe("第二个模型"),
    system_prompt: z.string().optional().describe("共用系统提示词"),
    conversation_id: z.string().optional().describe("对话 ID，传入相同 ID 可保持多轮上下文"),
  }, async ({ prompt, model_a, model_b, system_prompt, conversation_id }) => {
    const opts = { systemPrompt: system_prompt || "", conversationId: conversation_id || "" };
    const results = await Promise.allSettled([
      callModel(model_a, prompt, opts),
      callModel(model_b, prompt, opts),
    ]);
    const names = [models[model_a]?.name || model_a, models[model_b]?.name || model_b];
    const parts = [];
    parts.push(results[0].status === "fulfilled" ? fmt(names[0], results[0].value) : `━━━ ${names[0]} 错误 ━━━\n${results[0].reason?.message}`);
    parts.push("\n" + "═".repeat(50) + "\n");
    parts.push(results[1].status === "fulfilled" ? fmt(names[1], results[1].value) : `━━━ ${names[1]} 错误 ━━━\n${results[1].reason?.message}`);
    return { content: [{ type: "text", text: parts.join("\n") }] };
  });
}

// delegate — 智能委派路由工具
const routingCfg = config.routing;
if (routingCfg) {
  const categories = routingCfg.categories || {};
  const categoryNames = Object.keys(categories);
  const fallbackModel = routingCfg.fallback || modelKeys[0];

  // 关键词匹配：扫描 task 文本，返回 { category, model, reason }
  function routeTask(task, hintCategory) {
    // 如果有明确的 category hint，直接使用
    if (hintCategory && categories[hintCategory]) {
      const cat = categories[hintCategory];
      const target = models[cat.delegate_to] ? cat.delegate_to : fallbackModel;
      return { category: hintCategory, model: target, reason: cat.reason };
    }
    // 关键词扫描
    const taskLower = task.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;
    for (const [catName, cat] of Object.entries(categories)) {
      if (!models[cat.delegate_to]) continue;
      let score = 0;
      for (const kw of cat.keywords || []) {
        if (taskLower.includes(kw.toLowerCase())) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { category: catName, model: cat.delegate_to, reason: cat.reason };
      }
    }
    if (bestMatch) return bestMatch;
    return { category: "default", model: fallbackModel, reason: "无明确匹配，使用默认模型" };
  }

  const categoryEnum = categoryNames.length > 0
    ? z.enum([...categoryNames, "auto"]).optional().default("auto")
    : z.string().optional().default("auto");

  server.tool("delegate", "智能委派：根据任务内容自动选择最合适的模型执行。Claude 不想干的活丢过来。", {
    task: z.string().describe("任务描述，详细说明需要做什么"),
    category: categoryEnum.describe(`任务类别提示（${categoryNames.join("/")}），auto 为自动判断`),
    system_prompt: z.string().optional().describe("额外的系统提示词"),
    max_tokens: z.number().optional().default(DEFAULT_MAX_TOKENS).describe("最大 token 数"),
    conversation_id: z.string().optional().describe("对话 ID"),
  }, async ({ task, category, system_prompt, max_tokens, conversation_id }) => {
    try {
      const route = routeTask(task, category === "auto" ? null : category);
      const opts = {
        systemPrompt: system_prompt || "",
        maxTokens: max_tokens,
        conversationId: conversation_id || "",
      };
      emitEvent({ type: "DELEGATE_ROUTE", task: task.slice(0, 200), category: route.category, model: route.model, reason: route.reason });
      const r = await callModel(route.model, task, opts);
      const header = `🎯 委派路由: ${route.category} → ${models[route.model].name} (${route.reason})`;
      return { content: [{ type: "text", text: `${header}\n\n${fmt(models[route.model].name, r)}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `委派错误: ${e.message}` }], isError: true };
    }
  });
}

// translate — 翻译工具
const translateCfg = config.tools?.translate;
if (translateCfg && models[translateCfg.model]) {
  server.tool("translate", translateCfg.description || "中英互译。", {
    text: z.string().describe("需要翻译的文本"),
    target_language: z.enum(["中文", "英文", "auto"]).optional().default("auto").describe("目标语言"),
    style: z.enum(["formal", "casual", "technical"]).optional().default("formal").describe("翻译风格"),
  }, async ({ text, target_language, style }) => {
    const styles = { formal: "正式专业", casual: "口语化", technical: "技术文档风格，保留专有名词" };
    const sys = `你是专业翻译。风格:${styles[style]}。目标语言:${target_language === "auto" ? "自动检测，中↔英互译" : target_language}。只输出翻译结果。`;
    try {
      const r = await callModel(translateCfg.model, text, { systemPrompt: sys });
      return { content: [{ type: "text", text: `翻译结果 (${style}):\n\n${r.content}\n\n[${models[translateCfg.model].name} · ${r.tokens.total} tokens · ${(r.duration_ms / 1000).toFixed(1)}s]` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `翻译错误: ${e.message}` }], isError: true };
    }
  });
}

// research — 调研工具
const researchCfg = config.tools?.research;
if (researchCfg && models[researchCfg.model]) {
  server.tool("research", researchCfg.description || "技术调研和分析。", {
    topic: z.string().describe("研究主题"),
    depth: z.enum(["brief", "standard", "deep"]).optional().default("standard").describe("研究深度"),
    language: z.enum(["中文", "英文"]).optional().default("中文").describe("输出语言"),
  }, async ({ topic, depth, language }) => {
    const depths = { brief: "200字以内", standard: "500字左右", deep: "1000字以上，含背景、现状、优劣、建议" };
    const sys = `你是资深技术研究员。深度:${depths[depth]}。语言:${language}。结构化输出。`;
    try {
      const r = await callModel(researchCfg.model, topic, { systemPrompt: sys, maxTokens: depth === "deep" ? 8000 : DEFAULT_MAX_TOKENS });
      return { content: [{ type: "text", text: `研究结果:\n\n${r.content}\n\n[${models[researchCfg.model].name} · ${r.tokens.total} tokens · ${(r.duration_ms / 1000).toFixed(1)}s]` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `研究错误: ${e.message}` }], isError: true };
    }
  });
}

// generate_image — 图片生成工具
const imgGenCfg = config.tools?.generate_image;
if (imgGenCfg && models[imgGenCfg.model]) {
  server.tool("generate_image", imgGenCfg.description || "Generate images from text descriptions.", {
    prompt: z.string().describe("Image description / what to generate"),
    aspect_ratio: z.enum(["1:1", "3:2", "4:3", "16:9", "9:16"]).optional().default("1:1").describe("Image aspect ratio"),
    save_path: z.string().optional().describe("Save image to this path. If omitted, saves to /tmp/mcp-images/ and auto-opens."),
  }, async ({ prompt, aspect_ratio, save_path }) => {
    try {
      const modelKey = imgGenCfg.model;
      const r = await callModel(modelKey, prompt, {
        imageConfig: { aspectRatio: aspect_ratio },
        _skipCache: true,
      });
      const parts = [];
      if (r.content) parts.push({ type: "text", text: r.content });

      // Save images to disk
      const savedPaths = [];
      if (r.images?.length) {
        for (let i = 0; i < r.images.length; i++) {
          const img = r.images[i];
          const ext = img.mimeType?.includes("png") ? "png" : "jpg";
          let filePath;
          if (save_path) {
            filePath = r.images.length === 1 ? save_path : save_path.replace(/(\.\w+)$/, `_${i}$1`);
          } else {
            const tmpDir = "/tmp/mcp-media/images";
            mkdirSync(tmpDir, { recursive: true });
            const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            filePath = join(tmpDir, `img_${ts}${r.images.length > 1 ? `_${i}` : ""}.${ext}`);
          }
          writeFileSync(filePath, Buffer.from(img.data, "base64"));
          savedPaths.push(filePath);
        }
        // Auto-open when saving to /tmp (no explicit save_path)
        if (!save_path) {
          try { execSync(`open "${savedPaths[0]}"`); } catch {}
        }
      }

      const sec = (r.duration_ms / 1000).toFixed(1);
      const costStr = r.cost_usd > 0 ? ` · $${r.cost_usd.toFixed(6)}` : "";
      const pathStr = savedPaths.length ? ` · ${savedPaths.join(", ")}` : "";
      parts.push({ type: "text", text: `[${models[modelKey].name} · ${r.tokens.total} tokens · ${sec}s${costStr}${pathStr}]` });
      return { content: parts };
    } catch (e) {
      return { content: [{ type: "text", text: `Image generation error: ${e.message}` }], isError: true };
    }
  });
}

// generate_video — 视频生成工具
const vidGenCfg = config.tools?.generate_video;
if (vidGenCfg && models[vidGenCfg.model]) {
  server.tool("generate_video", vidGenCfg.description || "Generate videos from text descriptions.", {
    prompt: z.string().describe("Video description / what to generate"),
    aspect_ratio: z.enum(["16:9", "9:16", "1:1"]).optional().default("16:9").describe("Video aspect ratio"),
    duration: z.union([z.literal(4), z.literal(6), z.literal(8)]).optional().default(8).describe("Duration in seconds (4, 6, or 8)"),
    save_path: z.string().optional().describe("Save video to this path. If omitted, saves to /tmp/mcp-media/videos/ and auto-opens."),
  }, async ({ prompt, aspect_ratio, duration, save_path }) => {
    try {
      const modelKey = vidGenCfg.model;
      const cfg = models[modelKey];
      const r = await generateVeoVideo(cfg, prompt, {
        aspectRatio: aspect_ratio,
        durationSeconds: duration,
      });

      const savedPaths = [];
      for (let i = 0; i < r.videos.length; i++) {
        const vid = r.videos[i];
        let filePath;
        if (save_path) {
          filePath = r.videos.length === 1 ? save_path : save_path.replace(/(\.\w+)$/, `_${i}$1`);
        } else {
          const tmpDir = "/tmp/mcp-media/videos";
          mkdirSync(tmpDir, { recursive: true });
          const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
          filePath = join(tmpDir, `vid_${ts}${r.videos.length > 1 ? `_${i}` : ""}.${vid.ext}`);
        }
        writeFileSync(filePath, vid.buffer);
        savedPaths.push(filePath);
      }

      // Auto-open when saving to /tmp
      if (!save_path && savedPaths.length) {
        try { execSync(`open "${savedPaths[0]}"`); } catch {}
      }

      const sec = (r.duration_ms / 1000).toFixed(1);
      const sizeKB = r.videos.reduce((sum, v) => sum + v.buffer.length, 0) / 1024;
      const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)}MB` : `${Math.round(sizeKB)}KB`;
      const pathStr = savedPaths.length ? ` · ${savedPaths.join(", ")}` : "";
      return {
        content: [{
          type: "text",
          text: `Video generated (${duration}s, ${aspect_ratio}, ${sizeStr}) in ${sec}s${pathStr}`,
        }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: `Video generation error: ${e.message}` }], isError: true };
    }
  });
}

// ── 启动 ──
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`🚀 MCP Multi-Model Server v3.5.0 (${modelKeys.map(k => models[k].name).join(" + ")})`);

// ── 启动提示：缺失 API key ──
if (skippedModels.length > 0) {
  const lines = ["⚠️ Some models are disabled due to missing API keys:\n"];
  for (const m of skippedModels) {
    lines.push(`  • ${m.name} — set ${m.envVar}${m.url ? ` (get key: ${m.url})` : ""}`);
  }
  lines.push("\nAdd keys to your MCP config env block or .env file to enable them.");
  const msg = lines.join("\n");
  console.error(msg);
  try { await server.sendLoggingMessage({ level: "warning", data: msg }); } catch {}
}

process.on("exit", () => { if (ownsSocket) try { unlinkSync(SOCKET_PATH); } catch {} });
process.on("SIGINT", () => process.exit());
process.on("SIGTERM", () => process.exit());
