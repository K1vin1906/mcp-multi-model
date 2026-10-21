// eval/score.js — objective scorers for code / extraction / reasoning tasks.
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SANDBOX_TIMEOUT_MS = 10_000;

// ── code ──
export function extractCodeBlock(content, fnName) {
  const blocks = [];
  const re = /```(?:js|javascript|mjs|ts|typescript)?[^\n]*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(content))) blocks.push(m[1]);
  if (blocks.length === 0) return content.trim();            // no fence: hope it is bare code
  const withFn = blocks.filter(b => b.includes(fnName));
  const pool = withFn.length ? withFn : blocks;
  return pool.reduce((a, b) => (b.length > a.length ? b : a), "").trim();
}

// Each `check("name", fn(...), want)` line runs in its own try/catch so a solution that throws on one
// case still gets credit for the others (and the throw is counted as that case's failure).
function isolateChecks(harness) {
  return harness.split("\n").map(line => {
    const m = line.match(/^(\s*)check\("([^"]+)",(.*)$/);
    if (!m) return line;
    return `${m[1]}try { check("${m[2]}",${m[3]} } catch (e) { results.total++; results.failures.push("${m[2]}: threw " + (e && e.message)); }`;
  }).join("\n");
}

function buildHarness(task, isCJS) {
  return `import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const FN = ${JSON.stringify(task.fn)};
const IS_CJS = ${isCJS};
const results = { pass: 0, total: 0, failures: [] };
const J = (v) => JSON.stringify(v);
function check(name, got, want) { results.total++; if (J(got) === J(want)) results.pass++; else results.failures.push(name + ": got " + J(got) + " want " + J(want)); }
function checkThrows(name, f) { results.total++; try { f(); results.failures.push(name + ": expected throw"); } catch { results.pass++; } }
function partial() { console.log("__EVAL_PARTIAL__" + J(results)); }
const pick = (m) => (m && typeof m[FN] === "function") ? m[FN]
  : (typeof m === "function") ? m
  : (m && typeof m.default === "function") ? m.default
  : (m && m.default && typeof m.default[FN] === "function") ? m.default[FN]
  : undefined;
async function load() {
  const mod = IS_CJS ? require("./solution.cjs") : await import("./solution.mjs");
  let fn = pick(mod);
  if (!fn && !IS_CJS) { try { fn = pick(await import("./solution_exported.mjs")); } catch {} }
  if (typeof fn !== "function") throw new Error("function " + FN + " not found in exports (keys: " + Object.keys(mod || {}).join(",") + ")");
  return fn;
}
try {
  const fn = await load();
${isolateChecks(task.harness)}
} catch (e) { results.error = String((e && e.stack) || e).slice(0, 600); }
console.log("__EVAL_RESULT__" + J(results));
`;
}

export function scoreCode(task, content) {
  const code = extractCodeBlock(content || "", task.fn);
  if (!code) return { score: 0, pass: 0, total: task.cases, error: "no code found" };
  const isCJS = /module\.exports|\brequire\(/.test(code) && !/\bexport\b/.test(code);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "mcp-eval-")));
  try {
    writeFileSync(join(dir, isCJS ? "solution.cjs" : "solution.mjs"), code);
    if (!isCJS) writeFileSync(join(dir, "solution_exported.mjs"), code + `\nexport { ${task.fn} };\n`);
    writeFileSync(join(dir, "harness.mjs"), buildHarness(task, isCJS));
    const r = spawnSync(process.execPath, ["--permission", `--allow-fs-read=${dir}`, join(dir, "harness.mjs")],
      { cwd: dir, timeout: SANDBOX_TIMEOUT_MS, encoding: "utf8", maxBuffer: 4 << 20 });
    const out = r.stdout || "";
    const lines = out.split("\n");
    const final = [...lines].reverse().find(l => l.startsWith("__EVAL_RESULT__"));
    const part = [...lines].reverse().find(l => l.startsWith("__EVAL_PARTIAL__"));
    let res;
    if (final) res = JSON.parse(final.slice("__EVAL_RESULT__".length));
    else if (part) { res = JSON.parse(part.slice("__EVAL_PARTIAL__".length)); res.error = (res.error || "") + ` [no final result: ${r.error?.code === "ETIMEDOUT" || r.signal ? "sandbox timeout (" + SANDBOX_TIMEOUT_MS + "ms)" : "crash"}]`; }
    else res = { pass: 0, total: 0, failures: [], error: r.error?.code === "ETIMEDOUT" || r.signal ? `sandbox timeout (${SANDBOX_TIMEOUT_MS}ms)` : (r.stderr || "").replace(/^.*ExperimentalWarning.*$/gm, "").trim().slice(-600) || "no output" };
    const total = task.cases;
    return { score: Math.min(res.pass, total) / total, pass: res.pass, total, failures: res.failures, error: res.error, cjs: isCJS };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── extraction ──
export function extractJSON(content) {
  let s = (content || "").trim();
  const fence = s.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (fence) s = fence[1];
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON object found");
  const body = s.slice(a, b + 1);
  try { return JSON.parse(body); }
  catch { return JSON.parse(body.replace(/,\s*([}\]])/g, "$1")); }
}

const isScalar = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);
function normStr(s) {
  return String(s).trim().toLowerCase()
    .replace(/（/g, "(").replace(/）/g, ")").replace(/：/g, ":")
    .replace(/\s+/g, " ").replace(/[.。]$/, "");
}
function normVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean" || typeof v === "number") return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (/^(true|false)$/i.test(t)) return t.toLowerCase() === "true";
    const n = t.replace(/,/g, "");
    if (/^-?\d+(\.\d+)?$/.test(n)) return Number(n);
    return normStr(t);
  }
  return v;
}
function eqScalar(got, want) {
  const g = normVal(got), w = normVal(want);
  if (typeof w === "number") return typeof g === "number" && Math.abs(g - w) < 1e-6;
  if (typeof w === "boolean") return g === w;
  if (w === null) return g === null || g === "";
  return typeof g === "string" && g === w;
}
function fuzzyEq(got, want) {
  if (eqScalar(got, want)) return true;
  const g = normVal(got), w = normVal(want);
  if (typeof g !== "string" || typeof w !== "string") return false;
  if (g.length < 2 || w.length < 2) return false;
  return g.includes(w) || w.includes(g);
}
function f1(want, got, eq) {
  if (!Array.isArray(got) || got.length === 0) return 0;
  const mw = want.filter(w => got.some(g => eq(g, w))).length;
  const mg = got.filter(g => want.some(w => eq(g, w))).length;
  const p = mg / got.length, r = mw / want.length;
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}
export function scoreField(got, want) {
  if (want && typeof want === "object" && want.__anyOf) return Math.max(...want.__anyOf.map(w => scoreField(got, w)));
  if (Array.isArray(want)) {
    if (!Array.isArray(got)) return 0;
    if (want.length === 0) return got.length === 0 ? 1 : 0;
    if (want.every(isScalar)) return f1(want, got, fuzzyEq);
    return f1(want, got, (g, w) => !!g && typeof g === "object" && Object.keys(w).every(k => scoreField(g[k], w[k]) === 1));
  }
  if (want && typeof want === "object") {
    if (!got || typeof got !== "object" || Array.isArray(got)) return 0;
    const keys = Object.keys(want);
    return keys.reduce((a, k) => a + scoreField(got[k], want[k]), 0) / keys.length;
  }
  return eqScalar(got, want) ? 1 : 0;
}
export function scoreExtraction(task, content) {
  let obj;
  try { obj = extractJSON(content); }
  catch (e) { return { score: 0, parse_error: e.message, fields: {} }; }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { score: 0, parse_error: "not an object", fields: {} };
  const fields = {};
  for (const k of Object.keys(task.gold)) fields[k] = Number(scoreField(obj[k], task.gold[k]).toFixed(3));
  const vals = Object.values(fields);
  return { score: vals.reduce((a, b) => a + b, 0) / vals.length, fields, wrong: Object.keys(fields).filter(k => fields[k] < 1) };
}

// ── reasoning ──
export function scoreReasoning(task, content) {
  const lines = (content || "").trim().split("\n").map(l => l.trim()).filter(Boolean);
  const line = [...lines].reverse().find(l => /answer\s*[:：]/i.test(l));
  const format_ok = !!line && lines[lines.length - 1] === line;
  const text = line ? line.replace(/^.*?answer\s*[:：]\s*/i, "") : (lines[lines.length - 1] || "");
  const norm = text.toLowerCase().replace(/[*_`$\\]/g, "").replace(/boxed\{/g, "").trim();
  let ok;
  if (task.numeric) {
    const nums = norm.replace(/,(?=\d{3}\b)/g, "").match(/-?\d+(\.\d+)?/g) || [];
    ok = nums.length > 0 && Number(nums[nums.length - 1]) === task.expect;
  } else {
    // word answer: the expected word must appear, and before any rejected alternative ("knave (not a knight)" is still knave)
    const pos = norm.indexOf(String(task.expect).toLowerCase());
    ok = pos >= 0 && (task.reject || []).every(r => { const rp = norm.indexOf(r.toLowerCase()); return rp < 0 || rp > pos; });
  }
  return { score: ok ? 1 : 0, answer_line: text.slice(0, 200), format_ok, found_answer_line: !!line };
}

export function scoreObjective(task, content) {
  switch (task.category) {
    case "code": return scoreCode(task, content);
    case "extraction": return scoreExtraction(task, content);
    case "reasoning": return scoreReasoning(task, content);
    default: throw new Error(`no objective scorer for category ${task.category}`);
  }
}
