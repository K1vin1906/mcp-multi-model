#!/usr/bin/env node
// eval/reliability.js — "no silent truncation, no unexplained errors" check (v3.12).
//
//   node eval/reliability.js                      # every suite
//   node eval/reliability.js --suites=fast,deep   # subset: long, fast, deep, headroom, fallback, askall, realtime, search, effort
//   node eval/reliability.js --repeat=10 --concurrency=4 --tag=name
//
// Imports index.js in library mode, so every call goes through the exact adapter path the MCP tools use
// (timeouts, retries, effort maps, thinking headroom, truncation markers, fallback chains).
//
// Acceptance (exit code 1 when violated):
//   • silent truncation = 0     (a non-STOP finish without a ⚠️ marker, or empty text without a diagnostic)
//   • unexplained failures ≤ 5% (errors after fallback / total calls)
// Everything else (latency, thinking tokens, cost) is reported as data.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

process.env.MCP_MULTI_MODEL_LIBRARY = "1";
const srv = await import("../index.js");
const { callModel, callWithFallback, models, chatModelKeys, config, THINKING_HEADROOM, DEFAULT_MAX_TOKENS } = srv;

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, "results");

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1); else out[a.slice(2)] = true;
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const SUITES = args.suites ? String(args.suites).split(",") : ["long", "fast", "deep", "headroom", "fallback", "askall", "realtime", "search", "effort"];
const REPEAT = Number(args.repeat || 5);
const CONCURRENCY = Number(args.concurrency || 4);
const TAG = args.tag ? `-${args.tag}` : "";
const have = (k) => !!models[k];

// ───────────────────────── prompts ─────────────────────────
const LONG_PROMPT = "Write a thorough, well-structured technical guide of about 2000 words, with headings and bullet lists, on operating a small single-server PostgreSQL deployment: installation choices, the configuration settings that matter, backup and restore strategies, monitoring, and five common failure modes with how to recover from each. Do not stop early. Finish with a short checklist and the literal line END-OF-GUIDE.";
const RESEARCH_PROMPT = "Research and compare the current (October 2026) state of N26, Revolut and Wise for a Chinese passport holder opening an account in Germany before Anmeldung. For each: documents required, whether Anmeldung is needed, card delivery, monthly fee. Cite sources.";
const MEDIUM_PROMPT = "In 150-250 words: what are the main trade-offs between SQLite and PostgreSQL for a single-server web app? Be concrete.";
const REALTIME_CN = "请联网搜索:今天上海的天气如何,明天的天气预报是什么?用中文简要回答,并给出信息来源。";
const SHORT_PROMPT = "In one sentence: why is the sky blue?";

// ───────────────────────── case builders ─────────────────────────
// Each case: { suite, id, run: () => Promise<{r, key, attempts}> , expect: (obs) => string[] of violations }
const cases = [];
const add = (suite, id, run, expect = () => []) => cases.push({ suite, id, run, expect });
const single = (key, prompt, opts = {}) => async () => ({ r: await callModel(key, prompt, opts), key, attempts: [] });

if (SUITES.includes("long")) {
  for (const k of ["gemini", "openai", "deepseek", "kimi"].filter(have)) {
    add("long", `long/${k}/fast`, single(k, LONG_PROMPT, { maxTokens: 4000, effort: "fast" }),
      (o) => [o.truncated && "truncated", o.chars < 3000 && `short(${o.chars} chars)`, !o.content.includes("END-OF-GUIDE") && "no END marker"].filter(Boolean));
  }
  if (have("gemini")) add("long", "long/gemini/deep", single("gemini", LONG_PROMPT, { maxTokens: 4000, effort: "deep" }),
    (o) => [o.truncated && "truncated", o.chars < 3000 && `short(${o.chars})`, !(o.thinking > 0) && "no thinking tokens at deep"].filter(Boolean));
}
if (SUITES.includes("fast") && have("gemini")) {
  for (let i = 0; i < REPEAT; i++) add("fast", `fast/gemini/research#${i + 1}`, single("gemini", RESEARCH_PROMPT),
    (o) => [o.truncated && "truncated", o.effort !== "fast" && `effort=${o.effort}`, o.chars < 400 && `short(${o.chars})`].filter(Boolean));
}
if (SUITES.includes("deep") && have("gemini")) {
  for (let i = 0; i < Math.min(REPEAT, 2); i++) add("deep", `deep/gemini/research#${i + 1}`, single("gemini", RESEARCH_PROMPT, { effort: "deep" }),
    (o) => [o.truncated && "truncated", !(o.thinking > 200) && `thinking=${o.thinking} (expected >200 at deep)`, o.chars < 400 && `short(${o.chars})`].filter(Boolean));
}
if (SUITES.includes("headroom") && have("gemini")) {
  // Before v3.12 this exact shape (1500 tokens, default thinking) came back cut mid-sentence with no marker.
  for (const eff of ["fast", "deep"]) for (let i = 0; i < 2; i++)
    add("headroom", `headroom/gemini/${eff}/1500#${i + 1}`, single("gemini", RESEARCH_PROMPT, { maxTokens: 1500, effort: eff }),
      (o) => [!(o.sentMax >= 1500 + THINKING_HEADROOM) && `sent ${o.sentMax} (< 1500 + headroom)`].filter(Boolean));
}
if (SUITES.includes("fallback")) {
  const fb = (chainKeys) => chainKeys.filter(have);
  const base = models.gemini || models[chatModelKeys[0]];
  add("fallback", "fallback/timeout→chain", async () => {
    models.__slow = { ...base, key: "__slow", name: "Slow (1ms timeout)", timeout_ms: 1 };
    try { return await callWithFallback("__slow", fb(["deepseek", "openai"]), SHORT_PROMPT, { maxTokens: 300 }); }
    finally { delete models.__slow; }
  }, (o) => [o.key === "__slow" && "primary did not fail", o.attempts.length !== 1 && `attempts=${o.attempts.length}`, !/timed out/.test(o.attempts[0]?.error || "") && "first error is not a timeout"].filter(Boolean));
  add("fallback", "fallback/both-fail→error", async () => {
    models.__slow = { ...base, key: "__slow", name: "Slow A", timeout_ms: 1 };
    models.__slow2 = { ...base, key: "__slow2", name: "Slow B", timeout_ms: 1 };
    try {
      await callWithFallback("__slow", ["__slow2", "deepseek"], SHORT_PROMPT, { maxTokens: 300 });
      return { r: { content: "", tokens: {}, duration_ms: 0 }, key: "none", attempts: [], unexpectedSuccess: true };
    } catch (e) {
      return { r: { content: e.message, tokens: {}, duration_ms: 0, finish_reason: "error-expected" }, key: "error", attempts: e.attempts || [], expectedError: e };
    } finally { delete models.__slow; delete models.__slow2; }
  }, (o) => [o.raw.unexpectedSuccess && "should have thrown", o.raw.expectedError && o.raw.attempts.length !== 2 && `attempts=${o.raw.attempts.length} (bounded to 2)`, o.raw.expectedError && !/Slow A.*Slow B/s.test(o.raw.expectedError.message) && "error does not name both models"].filter(Boolean));
}
if (SUITES.includes("askall")) {
  const keys = chatModelKeys.filter(k => models[k].ask_all !== false);
  for (let i = 0; i < 2; i++) for (const k of keys)
    add("askall", `askall/${k}#${i + 1}`, single(k, MEDIUM_PROMPT, { effort: "fast" }),
      (o) => [o.truncated && "truncated", o.exhausted && "reasoning exhausted (empty answer)", o.chars < 200 && `short(${o.chars})`].filter(Boolean));
}
if (SUITES.includes("realtime") && have("kimi")) {
  for (let i = 0; i < REPEAT; i++) add("realtime", `realtime/kimi#${i + 1}`, single("kimi", REALTIME_CN),
    (o) => [o.truncated && "truncated", o.exhausted && "reasoning exhausted", o.chars < 50 && `short(${o.chars})`].filter(Boolean));
}
if (SUITES.includes("search") && have("openai-search")) {
  for (let i = 0; i < 2; i++) add("search", `search/openai-search/fast#${i + 1}`, single("openai-search", RESEARCH_PROMPT, { effort: "fast" }),
    (o) => [o.truncated && "truncated", !/Sources:/.test(o.content) && "no sources", o.effort !== "fast" && `effort=${o.effort}`].filter(Boolean));
  add("search", "search/openai-search/deep", single("openai-search", RESEARCH_PROMPT, { effort: "deep" }),
    (o) => [o.truncated && "truncated", !/Sources:/.test(o.content) && "no sources"].filter(Boolean));
}
if (SUITES.includes("effort")) {
  // Every model with an effort map must accept both levels (a 400 here means the provider rejected the mapped parameter).
  for (const k of chatModelKeys.filter(k => models[k].effort)) for (const eff of ["fast", "deep"])
    add("effort", `effort/${k}/${eff}`, single(k, SHORT_PROMPT, { maxTokens: 300, effort: eff }),
      (o) => [o.effort !== eff && `effort=${o.effort}`, o.chars < 10 && `short(${o.chars})`].filter(Boolean));
}

// ───────────────────────── runner ─────────────────────────
function observe(out) {
  const r = out.r || {};
  const content = String(r.content || "");
  return {
    raw: out, key: out.key, attempts: out.attempts || [],
    content, chars: content.length,
    finish: r.finish_reason ?? null,
    truncated: !!r.truncated,
    marked: /⚠️/.test(content),
    exhausted: /spent its whole max_tokens budget on reasoning/.test(content),
    thinking: r.thinking_tokens || 0,
    effort: r.effort || null,
    sentMax: r.max_tokens_sent,
    ms: r.duration_ms || 0,
    cost: r.cost_usd || 0,
    tokens: r.tokens || {},
  };
}
// "Silent": the model did not finish normally, yet nothing in the text says so.
function isSilent(o) {
  if (o.raw.expectedError || o.raw.unexpectedSuccess) return false;
  const abnormal = o.truncated || (o.finish && !/^(STOP|stop|completed|tool_calls)$/.test(String(o.finish)));
  if (abnormal && !o.marked) return true;
  if (!o.content.trim()) return true;
  return false;
}

const results = [];
let idx = 0;
async function worker() {
  while (idx < cases.length) {
    const c = cases[idx++];
    const t0 = Date.now();
    let rec;
    try {
      const out = await c.run();
      const o = observe(out);
      const violations = c.expect(o);
      const silent = isSilent(o);
      rec = { suite: c.suite, id: c.id, ok: violations.length === 0 && !silent, error: null, silent, violations,
        key: o.key, fallbacks: o.attempts.length, finish: o.finish, truncated: o.truncated, marked: o.marked, exhausted: o.exhausted,
        chars: o.chars, thinking: o.thinking, effort: o.effort, sentMax: o.sentMax, ms: o.ms || (Date.now() - t0), cost: o.cost,
        tokens: o.tokens, tail: o.content.slice(-120).replace(/\s+/g, " ") };
    } catch (e) {
      rec = { suite: c.suite, id: c.id, ok: false, error: e.message, silent: false, violations: [], ms: Date.now() - t0, cost: 0, fallbacks: 0 };
    }
    results.push(rec);
    const flag = rec.error ? "✖ ERR " : rec.silent ? "✖ SILENT" : rec.ok ? "✔" : "△";
    const extra = [rec.effort && `effort=${rec.effort}`, rec.thinking ? `think=${rec.thinking}` : null, rec.finish && `finish=${rec.finish}`, rec.fallbacks ? `fallback→${rec.key}` : null,
      rec.violations?.length ? `[${rec.violations.join(", ")}]` : null, rec.error && `[${rec.error.slice(0, 140)}]`].filter(Boolean).join(" ");
    console.log(`${flag} ${c.id.padEnd(34)} ${(rec.ms / 1000).toFixed(1).padStart(6)}s ${String(rec.chars ?? "").padStart(6)}ch $${(rec.cost || 0).toFixed(4)} ${extra}`);
  }
}
console.log(`reliability eval: ${cases.length} calls, suites=${SUITES.join(",")}, repeat=${REPEAT}, concurrency=${CONCURRENCY}, headroom=${THINKING_HEADROOM}\n`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// ───────────────────────── summary ─────────────────────────
const med = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const p90 = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)]; };
const bySuite = {};
for (const r of results) (bySuite[r.suite] ||= []).push(r);
const lines = ["| suite | calls | ok | errors | silent | marked-trunc | fallbacks | median s | p90 s | cost $ |", "|---|---|---|---|---|---|---|---|---|---|"];
let totalErr = 0, totalSilent = 0, totalCost = 0;
for (const [suite, rs] of Object.entries(bySuite)) {
  const errs = rs.filter(r => r.error).length, silent = rs.filter(r => r.silent).length, marked = rs.filter(r => r.truncated && r.marked).length;
  const fbs = rs.reduce((a, r) => a + (r.fallbacks || 0), 0), cost = rs.reduce((a, r) => a + (r.cost || 0), 0);
  const ms = rs.filter(r => !r.error).map(r => r.ms);
  totalErr += errs; totalSilent += silent; totalCost += cost;
  lines.push(`| ${suite} | ${rs.length} | ${rs.filter(r => r.ok).length} | ${errs} | ${silent} | ${marked} | ${fbs} | ${(med(ms) / 1000).toFixed(1)} | ${(p90(ms) / 1000).toFixed(1)} | ${cost.toFixed(3)} |`);
}
const errRate = results.length ? totalErr / results.length : 0;
const pass = totalSilent === 0 && errRate <= 0.05;
const summary = lines.join("\n") + `\n\ntotal ${results.length} calls · errors ${totalErr} (${(errRate * 100).toFixed(1)}%) · silent truncation ${totalSilent} · cost $${totalCost.toFixed(3)} → ${pass ? "PASS" : "FAIL"} (acceptance: silent = 0, errors ≤ 5%)`;
console.log("\n" + summary);
const failing = results.filter(r => !r.ok);
if (failing.length) {
  console.log("\nnot ok:");
  for (const r of failing) console.log(`  ${r.id}: ${r.error ? "ERR " + r.error.slice(0, 200) : (r.silent ? "SILENT " : "") + r.violations.join(", ")}`);
}
mkdirSync(RESULTS_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outPath = join(RESULTS_DIR, `reliability-${ts}${TAG}.json`);
writeFileSync(outPath, JSON.stringify({ ts, suites: SUITES, repeat: REPEAT, headroom: THINKING_HEADROOM, default_max_tokens: DEFAULT_MAX_TOKENS, pass, summary, results }, null, 2));
console.log(`\nsaved ${outPath}`);
process.exit(pass ? 0 : 1);
