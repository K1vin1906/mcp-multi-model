#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import net from "net";
import yaml from "js-yaml";
import { existsSync, unlinkSync, readFileSync } from "fs";
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
const configPath = join(__dirname, "config.yaml");
if (!existsSync(configPath)) {
  console.error("❌ config.yaml not found. Copy config.example.yaml and configure your API keys.");
  process.exit(1);
}
const config = yaml.load(readFileSync(configPath, "utf-8"));
const defaults = config.defaults || {};
const TIMEOUT = defaults.timeout_ms || 60000;
const MAX_RETRIES = defaults.max_retries ?? 2;
const DEFAULT_MAX_TOKENS = defaults.max_tokens || 4000;
const DEFAULT_TEMP = defaults.temperature || 0.7;
const MAX_HISTORY_TURNS = defaults.max_history_turns || 10;
const CONVERSATION_EXPIRY = 30 * 60 * 1000; // 30 minutes

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

// 解析模型配置
const models = {};
for (const [key, cfg] of Object.entries(config.models || {})) {
  const apiKey = process.env[cfg.api_key_env];
  if (!apiKey) {
    console.error(`⚠️  ${cfg.name}: ${cfg.api_key_env} 未设置，跳过`);
    continue;
  }
  const pricing = cfg.pricing || {};
  models[key] = { ...cfg, key, apiKey, pricing: { input: pricing.input || 0, output: pricing.output || 0 } };
}

const modelKeys = Object.keys(models);
if (modelKeys.length === 0) {
  console.error("❌ 没有可用的模型，请检查 .env 和 config.yaml");
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

function listenSocket(retry = false) {
  udsServer.listen(SOCKET_PATH, () => {
    ownsSocket = true;
    console.error("📡 Monitor socket: " + SOCKET_PATH);
  });
  udsServer.once("error", (err) => {
    if (err.code === "EADDRINUSE" && !retry) {
      // probe: 连得上说明有活进程在用，跳过；连不上说明是残留，清理重建
      const probe = net.createConnection(SOCKET_PATH);
      probe.on("connect", () => {
        probe.destroy();
        console.error("📡 Monitor socket in use by another instance, skipping");
      });
      probe.on("error", () => {
        try { unlinkSync(SOCKET_PATH); } catch {}
        listenSocket(true);
      });
    }
  });
}
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
async function adapterOpenAI(modelCfg, prompt, systemPrompt, maxTokens, history = []) {
  const messages = [];
  const sysParts = [modelCfg.system_prefix, systemPrompt].filter(Boolean).join("\n\n");
  if (sysParts) messages.push({ role: "system", content: sysParts });
  if (history.length) messages.push(...history);
  messages.push({ role: "user", content: prompt });

  const reqBody = {
    model: modelCfg.model,
    messages,
    max_tokens: maxTokens,
    temperature: modelCfg.temperature || DEFAULT_TEMP,
  };

  const features = modelCfg.features || [];
  const hasToolLoop = features.includes("web_search");

  if (hasToolLoop) {
    reqBody.tools = [{ type: "builtin_function", function: { name: "$web_search" } }];
  }

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${modelCfg.apiKey}` };

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
async function adapterGemini(modelCfg, prompt, systemPrompt, maxTokens, history = []) {
  const contents = history.map(msg => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));
  contents.push({ role: "user", parts: [{ text: prompt }] });

  const body = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature: DEFAULT_TEMP },
  };

  const features = modelCfg.features || [];
  if (features.includes("google_search")) {
    body.tools = [{ google_search: {} }];
  }
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
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

// ── 通用调用入口 ──
const adapters = { openai: adapterOpenAI, gemini: adapterGemini };

async function callModel(key, prompt, { systemPrompt = "", maxTokens = DEFAULT_MAX_TOKENS, conversationId = "" } = {}) {
  const cfg = models[key];
  if (!cfg) throw new Error(`模型 "${key}" 未配置或 API key 缺失`);
  const adapter = adapters[cfg.adapter];
  if (!adapter) throw new Error(`未知的 adapter 类型: ${cfg.adapter}`);

  const history = getHistory(conversationId, key);
  const t0 = Date.now();
  emitEvent({ type: "AGENT_START", agent: key, model: cfg.model, prompt, systemPrompt, conversationId: conversationId || undefined, historyTurns: history.length / 2 });
  try {
    const result = await adapter(cfg, prompt, systemPrompt, maxTokens, history);
    result.duration_ms = Date.now() - t0;
    result.cost_usd = calcCost(result.tokens, cfg.pricing);
    saveHistory(conversationId, key, prompt, result.content);
    emitEvent({ type: "AGENT_END", agent: key, model: result.model, content: result.content, tokens: result.tokens, duration_ms: result.duration_ms, cost_usd: result.cost_usd });
    return result;
  } catch (e) {
    emitEvent({ type: "AGENT_ERROR", agent: key, error: e.message, duration_ms: Date.now() - t0 });
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
const server = new McpServer({ name: "mcp-multi-model", version: "3.0.0" }, { capabilities: { logging: {} } });

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
      return { content: [{ type: "text", text: fmt(cfg.name, r) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `${cfg.name} 错误: ${e.message}` }], isError: true };
    }
  });
}

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

// ── 启动 ──
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`🚀 MCP Multi-Model Server v3.0.0 (${modelKeys.map(k => models[k].name).join(" + ")})`);

process.on("exit", () => { if (ownsSocket) try { unlinkSync(SOCKET_PATH); } catch {} });
process.on("SIGINT", () => process.exit());
process.on("SIGTERM", () => process.exit());
