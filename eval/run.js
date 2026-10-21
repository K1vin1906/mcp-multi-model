#!/usr/bin/env node
// eval/run.js — mcp-multi-model routing benchmark (eval v0)
//
//   node eval/run.js run    [--models=a,b] [--categories=x,y] [--tasks=id,id] [--repeat=1] [--max-tokens=8000] [--parallel-tasks=2] [--tag=name]
//   node eval/run.js report <run-id|run-dir>        # merges results/<run>/grades.json (blind grading) if present, writes TABLE.md
//   node eval/run.js sheet  <run-id|run-dir>        # regenerate the blind grading sheet
//   node eval/run.js rescore <run-id|run-dir>       # re-run objective scorers on stored responses (no API calls)
//
// Reuses the server's own adapters via `MCP_MULTI_MODEL_LIBRARY=1` + `import("../index.js")`, so timeouts,
// retries, reasoning flags, tool loops and cost accounting are exactly what `delegate` / `ask_ai` see.
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { TASKS, CATEGORIES, RUBRICS, TASKSET_VERSION, buildPrompt } from "./tasks.js";
import { scoreObjective } from "./score.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, "results");
const DEFAULT_MODELS = ["deepseek", "gemini", "openai", "kimi", "deepseek-pro", "gemini-pro"];
const CAT_ORDER = Object.keys(CATEGORIES);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}
const die = (msg) => { console.error("✖ " + msg); process.exit(1); };
const resolveRunDir = (arg) => {
  if (!arg) {
    const runs = existsSync(RESULTS_DIR) ? readdirSync(RESULTS_DIR).filter(d => existsSync(join(RESULTS_DIR, d, "raw.jsonl"))).sort() : [];
    if (!runs.length) die("no runs found");
    return join(RESULTS_DIR, runs[runs.length - 1]);
  }
  return existsSync(join(arg, "raw.jsonl")) ? resolve(arg) : join(RESULTS_DIR, arg);
};
const readJsonl = (p) => readFileSync(p, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
const median = (xs) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

// ───────────────────────── run ─────────────────────────
async function runCmd(args) {
  const modelsSel = args.models ? String(args.models).split(",") : DEFAULT_MODELS;
  const cats = args.categories ? String(args.categories).split(",") : CAT_ORDER;
  const taskSel = args.tasks ? String(args.tasks).split(",") : null;
  const repeat = Number(args.repeat || 1);
  const maxTokens = Number(args["max-tokens"] || 8000);
  const parallelTasks = Number(args["parallel-tasks"] || 2);
  const tag = args.tag ? `-${args.tag}` : "";

  process.env.MCP_MULTI_MODEL_LIBRARY = "1";
  const srv = await import("../index.js");
  for (const m of modelsSel) {
    if (!srv.models[m]) die(`model "${m}" is not configured or its API key is missing`);
    if (srv.models[m].image_generation || srv.models[m].video_generation) die(`model "${m}" is a generation model, not a chat model`);
  }
  for (const c of cats) if (!CATEGORIES[c]) die(`unknown category "${c}"`);
  const tasks = TASKS.filter(t => cats.includes(t.category) && (!taskSel || taskSel.includes(t.id)));
  if (!tasks.length) die("no tasks selected");

  const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + tag;
  const dir = join(RESULTS_DIR, runId);
  mkdirSync(dir, { recursive: true });
  const meta = {
    run_id: runId, created_at: new Date().toISOString(), taskset_version: TASKSET_VERSION,
    node: process.version, pkg_version: srv.PKG_VERSION, timeout_ms: srv.TIMEOUT, max_tokens: maxTokens, repeat, parallel_tasks: parallelTasks,
    models: Object.fromEntries(modelsSel.map(k => { const c = srv.models[k]; return [k, { model: c.model, name: c.name, pricing: c.pricing, reasoning: !!c.reasoning, force_non_streaming: !!c.force_non_streaming, features: c.features || [], thinking_level: c.thinking_level || null }]; })),
    categories: Object.fromEntries(cats.map(c => [c, CATEGORIES[c]])),
    tasks: tasks.map(t => t.id),
  };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  const rawPath = join(dir, "raw.jsonl");
  writeFileSync(rawPath, "");
  console.error(`\n🏁 run ${runId}: ${tasks.length} tasks × ${modelsSel.length} models × ${repeat} rep = ${tasks.length * modelsSel.length * repeat} calls → ${dir}\n`);

  let spent = 0;
  const callOne = async (task, mk, rep) => {
    const cat = CATEGORIES[task.category];
    const base = { run_id: runId, task_id: task.id, category: task.category, model_key: mk, model: srv.models[mk].model, rep };
    const t0 = Date.now();
    try {
      const r = await srv.callModel(mk, buildPrompt(task), { systemPrompt: cat.system, maxTokens, temperature: cat.temperature, _skipCache: true });
      const exhausted = typeof r.content === "string" && r.content.startsWith("⚠️ 模型的思考");
      const rec = { ...base, model: r.model || base.model, ok: true, duration_ms: r.duration_ms, tokens: r.tokens, cost_usd: r.cost_usd, exhausted, content: r.content };
      if (cat.grading === "auto") { const sc = scoreObjective(task, exhausted ? "" : r.content); rec.score = sc.score; rec.score_detail = sc; }
      else rec.score = null;
      return rec;
    } catch (e) {
      return { ...base, ok: false, error: String(e.message || e).slice(0, 500), duration_ms: Date.now() - t0, tokens: { prompt: 0, completion: 0, total: 0 }, cost_usd: 0, exhausted: false, content: "", score: cat.grading === "auto" ? 0 : null };
    }
  };
  const runTask = async (task, rep) => {
    const recs = await Promise.all(modelsSel.map(mk => callOne(task, mk, rep)));
    for (const rec of recs) {
      appendFileSync(rawPath, JSON.stringify(rec) + "\n");
      spent += rec.cost_usd || 0;
      const q = rec.score == null ? "blind" : `${Math.round(rec.score * 100)}%`;
      const flag = !rec.ok ? ` ✖ ${rec.error.slice(0, 80)}` : rec.exhausted ? " ⚠ reasoning-exhausted" : "";
      console.error(`  ${rec.task_id.padEnd(34)} ${rec.model_key.padEnd(13)} ${q.padStart(5)}  ${(rec.duration_ms / 1000).toFixed(1).padStart(5)}s  $${(rec.cost_usd || 0).toFixed(5)}${flag}`);
    }
  };
  const jobs = [];
  for (let rep = 1; rep <= repeat; rep++) for (const t of tasks) jobs.push([t, rep]);
  for (let i = 0; i < jobs.length; i += parallelTasks) {
    const batch = jobs.slice(i, i + parallelTasks);
    console.error(`▶ ${batch.map(([t, r]) => t.id + (repeat > 1 ? `#${r}` : "")).join("  |  ")}`);
    await Promise.all(batch.map(([t, r]) => runTask(t, r)));
  }
  console.error(`\n💵 total spent: $${spent.toFixed(4)}`);
  writeSheet(dir);
  writeReport(dir);
  process.exit(0);
}

// ───────────────────────── blind grading sheet ─────────────────────────
function writeSheet(dir) {
  const recs = readJsonl(join(dir, "raw.jsonl")).filter(r => CATEGORIES[r.category]?.grading === "blind");
  if (!recs.length) return;
  const keyPath = join(dir, "grading_key.json");
  const key = existsSync(keyPath) ? JSON.parse(readFileSync(keyPath, "utf8")) : {};
  const used = new Set(Object.keys(key));
  const idFor = (r) => {
    const found = Object.entries(key).find(([, v]) => v.task_id === r.task_id && v.model_key === r.model_key && v.rep === r.rep);
    if (found) return found[0];
    let id; do { id = "R-" + randomBytes(2).toString("hex"); } while (used.has(id));
    used.add(id); key[id] = { task_id: r.task_id, model_key: r.model_key, rep: r.rep };
    return id;
  };
  const lines = [`# Blind grading sheet — ${basename(dir)}`, "",
    "Grade every response below WITHOUT looking at raw.jsonl / grading_key.json. Write `grades.json` in this directory as:",
    '```json\n{ "R-xxxx": { "score": 4, "note": "one-line justification" }, ... }\n```',
    "Scores are integers 0–5 per the rubric of each task. Failed calls are listed for completeness and get 0 automatically.", ""];
  for (const cat of CAT_ORDER) {
    const tasks = TASKS.filter(t => t.category === cat && recs.some(r => r.task_id === t.id));
    if (!tasks.length) continue;
    lines.push(`## ${cat}`, "", `**Rubric:** ${RUBRICS[cat]}`, "");
    for (const t of tasks) {
      lines.push(`### ${t.id}`, "", "**Prompt:**", "", "```", t.prompt, "```", "");
      if (t.notes) lines.push(`**Grader notes (gold facts):** ${t.notes}`, "");
      const rs = recs.filter(r => r.task_id === t.id);
      for (let i = rs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rs[i], rs[j]] = [rs[j], rs[i]]; }
      for (const r of rs) {
        const id = idFor(r);
        if (!r.ok) { lines.push(`#### ${id}  (FAILED — auto 0: ${r.error})`, ""); continue; }
        if (r.exhausted) { lines.push(`#### ${id}  (REASONING EXHAUSTED — auto 0)`, ""); continue; }
        lines.push(`#### ${id}`, "", r.content.trim(), "", "---", "");
      }
    }
  }
  writeFileSync(keyPath, JSON.stringify(key, null, 2));
  writeFileSync(join(dir, "grading_sheet.md"), lines.join("\n"));
  console.error(`📝 blind grading sheet: ${join(dir, "grading_sheet.md")} (${recs.length} responses) → write grades.json, then \`node eval/run.js report ${basename(dir)}\``);
}

// ───────────────────────── report ─────────────────────────
function writeReport(dir) {
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const recs = readJsonl(join(dir, "raw.jsonl"));
  const keyPath = join(dir, "grading_key.json"), gradesPath = join(dir, "grades.json");
  let graded = 0, ungraded = 0;
  if (existsSync(keyPath) && existsSync(gradesPath)) {
    const key = JSON.parse(readFileSync(keyPath, "utf8")), grades = JSON.parse(readFileSync(gradesPath, "utf8"));
    for (const r of recs) {
      if (CATEGORIES[r.category]?.grading !== "blind") continue;
      if (!r.ok || r.exhausted) { r.score = 0; continue; }
      const id = Object.keys(key).find(k => key[k].task_id === r.task_id && key[k].model_key === r.model_key && key[k].rep === r.rep);
      const g = id && grades[id];
      if (g && typeof g.score === "number") { r.score = g.score / 5; r.grade = g.score; r.grade_note = g.note || ""; graded++; }
      else ungraded++;
    }
  } else {
    for (const r of recs) if (CATEGORIES[r.category]?.grading === "blind") { if (!r.ok || r.exhausted) r.score = 0; else ungraded++; }
  }
  const modelsK = Object.keys(meta.models);
  const cats = CAT_ORDER.filter(c => recs.some(r => r.category === c));
  const cell = (mk, cat) => recs.filter(r => r.model_key === mk && r.category === cat);
  const pct = (xs) => { const v = xs.filter(x => typeof x === "number"); return v.length ? `${Math.round(mean(v) * 100)}` : "—"; };
  const isFail = (r) => !r.ok || r.exhausted;
  const failTag = (r) => !r.ok ? (/超时|timeout/i.test(r.error) ? "timeout" : "error") : r.exhausted ? "exhausted" : null;

  const L = [];
  L.push(`# mcp-multi-model routing benchmark — ${meta.run_id}`, "");
  L.push(`Taskset ${meta.taskset_version} · server v${meta.pkg_version} · node ${meta.node} · ${recs.length} calls · timeout ${meta.timeout_ms / 1000}s · max_tokens ${meta.max_tokens} · repeat ${meta.repeat}`);
  L.push(`Temperature: ${cats.map(c => `${c}=${CATEGORIES[c].temperature}`).join(", ")} (reasoning-flagged models ignore temperature). Quality: code = hidden tests passed; extraction = field-level match vs gold; reasoning = exact final answer; research/creative = blind Claude grade 0–5 → %.`);
  if (ungraded) L.push(`\n> ⚠️ ${ungraded} blind responses not yet graded — research/creative cells are incomplete.`);
  L.push("", "| key | model | $/M in | $/M out | notes |", "|---|---|---:|---:|---|");
  for (const mk of modelsK) { const m = meta.models[mk]; L.push(`| ${mk} | ${m.model} | ${m.pricing.input} | ${m.pricing.output} | ${[m.reasoning && "reasoning", m.force_non_streaming && "non-streaming", ...(m.features || [])].filter(Boolean).join(", ")} |`); }

  const matrix = (title, f, overall) => {
    L.push("", `## ${title}`, "", `| model | ${cats.join(" | ")} |${overall ? " overall |" : ""}`, `|---|${cats.map(() => "---:").join("|")}|${overall ? "---:|" : ""}`);
    for (const mk of modelsK) {
      const row = cats.map(c => f(cell(mk, c)));
      L.push(`| ${mk} | ${row.join(" | ")} |${overall ? ` ${overall(recs.filter(r => r.model_key === mk))} |` : ""}`);
    }
  };
  matrix("Quality (avg score, %)", rs => pct(rs.map(r => r.score)), rs => pct(rs.map(r => r.score)));
  matrix("Cost (avg $ per call)", rs => rs.length ? `$${mean(rs.map(r => r.cost_usd || 0)).toFixed(4)}` : "—", rs => `$${rs.reduce((a, r) => a + (r.cost_usd || 0), 0).toFixed(4)} total`);
  matrix("Latency (median s, failures included)", rs => rs.length ? `${(median(rs.map(r => r.duration_ms)) / 1000).toFixed(1)}` : "—", rs => `${(median(rs.map(r => r.duration_ms)) / 1000).toFixed(1)}`);
  matrix("Output tokens (avg, thinking included)", rs => rs.length ? `${Math.round(mean(rs.map(r => r.tokens?.completion || 0)))}` : "—");
  if (recs.some(isFail)) matrix("Failures (timeout / API error / reasoning-exhausted)", rs => { const f = rs.filter(isFail); return f.length ? `${f.length}/${rs.length} (${[...new Set(f.map(failTag))].join(",")})` : "0"; }, rs => `${rs.filter(isFail).length}/${rs.length}`);

  L.push("", "## Per-task scores (%)");
  for (const c of cats) {
    const tids = [...new Set(recs.filter(r => r.category === c).map(r => r.task_id))];
    L.push("", `### ${c}`, "", `| task | ${modelsK.join(" | ")} |`, `|---|${modelsK.map(() => "---:").join("|")}|`);
    for (const t of tids) {
      L.push(`| ${t} | ${modelsK.map(mk => { const rs = recs.filter(r => r.task_id === t && r.model_key === mk); const s = pct(rs.map(r => r.score)); const tag = rs.map(failTag).filter(Boolean)[0]; return tag ? `${s} (${tag})` : s; }).join(" | ")} |`);
    }
  }
  const fails = recs.filter(isFail);
  if (fails.length) { L.push("", "## Failure log", "", "| task | model | kind | detail |", "|---|---|---|---|"); for (const r of fails) L.push(`| ${r.task_id} | ${r.model_key} | ${failTag(r)} | ${(r.error || "reasoning exhausted at max_tokens").replace(/\|/g, "\\|").slice(0, 120)} |`); }
  const wrong = recs.filter(r => r.ok && !r.exhausted && CATEGORIES[r.category].grading === "auto" && r.score < 1);
  if (wrong.length) {
    L.push("", "## Objective misses (what exactly failed)", "", "| task | model | score | detail |", "|---|---|---:|---|");
    for (const r of wrong) {
      const d = r.score_detail || {};
      const detail = r.category === "code" ? (d.error ? `error: ${d.error.split("\n")[0]}` : (d.failures || []).slice(0, 3).join("; "))
        : r.category === "extraction" ? (d.parse_error ? `parse: ${d.parse_error}` : `wrong: ${(d.wrong || []).map(k => `${k}=${d.fields[k]}`).join(", ")}`)
        : `answer line: "${d.answer_line}"${d.found_answer_line ? "" : " (no ANSWER line)"}`;
      L.push(`| ${r.task_id} | ${r.model_key} | ${Math.round(r.score * 100)} | ${detail.replace(/\|/g, "\\|").slice(0, 160)} |`);
    }
  }
  const text = L.join("\n") + "\n";
  writeFileSync(join(dir, "TABLE.md"), text);
  console.log(text);
  console.error(`📊 report: ${join(dir, "TABLE.md")}${graded ? ` (${graded} blind grades merged)` : ""}`);
}

// ───────────────────────── rescore (re-run objective scorers on stored content, no API calls) ─────────────────────────
function rescoreCmd(dir) {
  const recs = readJsonl(join(dir, "raw.jsonl"));
  let n = 0;
  for (const r of recs) {
    const task = TASKS.find(t => t.id === r.task_id);
    if (!task || CATEGORIES[r.category]?.grading !== "auto" || !r.ok) continue;
    const sc = scoreObjective(task, r.exhausted ? "" : r.content);
    r.score = sc.score; r.score_detail = sc; n++;
  }
  writeFileSync(join(dir, "raw.jsonl"), recs.map(r => JSON.stringify(r)).join("\n") + "\n");
  console.error(`🔁 rescored ${n} objective records`);
  writeReport(dir);
}

// ───────────────────────── main ─────────────────────────
const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (cmd === "run") await runCmd(args);
else if (cmd === "report") writeReport(resolveRunDir(args._[1]));
else if (cmd === "sheet") writeSheet(resolveRunDir(args._[1]));
else if (cmd === "rescore") rescoreCmd(resolveRunDir(args._[1]));
else { console.error(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 8).map(l => l.replace(/^\/\/ ?/, "")).join("\n")); process.exit(1); }
