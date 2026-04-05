#!/usr/bin/env node
import { createInterface } from "readline";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, ".env");
const configPath = join(__dirname, "config.yaml");
const examplePath = join(__dirname, "config.example.yaml");

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

// 颜色
const G = "\x1b[32m", Y = "\x1b[33m", R = "\x1b[31m", C = "\x1b[36m", D = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";

async function testKey(modelCfg, apiKey) {
  const { adapter, endpoint, model } = modelCfg;
  try {
    let res;
    if (adapter === "gemini") {
      res = await fetch(`${endpoint}/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Hi" }] }], generationConfig: { maxOutputTokens: 10 } }),
        signal: AbortSignal.timeout(15000),
      });
    } else {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "Hi" }], max_tokens: 10 }),
        signal: AbortSignal.timeout(15000),
      });
    }
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status}` + (body ? `: ${body.slice(0, 100)}` : "") };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  console.log(`\n${B}${C}╔══════════════════════════════════════╗${X}`);
  console.log(`${B}${C}║   mcp-multi-model Setup Wizard       ║${X}`);
  console.log(`${B}${C}╚══════════════════════════════════════╝${X}\n`);

  // 加载配置模板
  if (!existsSync(examplePath)) {
    console.log(`${R}❌ config.example.yaml not found${X}`);
    process.exit(1);
  }
  const config = yaml.load(readFileSync(examplePath, "utf-8"));

  // 加载已有的 .env
  const existingEnv = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
      const m = line.match(/^\s*([\w]+)\s*=\s*"?([^"#\n]*)"?\s*$/);
      if (m) existingEnv[m[1]] = m[2].trim();
    }
  }

  console.log(`${D}配置向导将帮你设置各模型的 API Key。${X}`);
  console.log(`${D}按 Enter 跳过不需要的模型，至少配置一个即可。${X}\n`);

  const newEnv = { ...existingEnv };
  let configured = 0;

  for (const [key, cfg] of Object.entries(config.models)) {
    const envVar = cfg.api_key_env;
    const existing = existingEnv[envVar];
    const masked = existing ? existing.slice(0, 6) + "..." + existing.slice(-4) : null;

    console.log(`${B}── ${cfg.name} ──${X}`);
    if (masked) {
      console.log(`  ${D}当前: ${masked}${X}`);
    }

    const input = await ask(`  ${envVar}${masked ? " (Enter 保留当前)" : ""}: `);
    const apiKey = input.trim() || existing || "";

    if (!apiKey) {
      console.log(`  ${Y}⏭ 跳过${X}\n`);
      continue;
    }

    // 验证 key
    process.stdout.write(`  ${D}验证中...${X}`);
    const result = await testKey(cfg, apiKey);
    if (result.ok) {
      console.log(`\r  ${G}✓ 验证通过${X}       `);
      configured++;
    } else {
      console.log(`\r  ${R}✗ 验证失败: ${result.error}${X}       `);
      const keep = await ask(`  ${Y}仍然保存这个 key? (y/N): ${X}`);
      if (keep.toLowerCase() !== "y") {
        console.log(`  ${Y}⏭ 跳过${X}\n`);
        continue;
      }
    }

    newEnv[envVar] = apiKey;
    // 同时保存模型名
    const modelVar = `${key.toUpperCase()}_MODEL`;
    if (!newEnv[modelVar]) newEnv[modelVar] = cfg.model;
    console.log();
  }

  if (configured === 0 && Object.keys(newEnv).length === 0) {
    console.log(`\n${R}❌ 没有配置任何模型。请至少配置一个 API Key。${X}\n`);
    rl.close();
    process.exit(1);
  }

  // 写入 .env
  const envContent = Object.entries(newEnv).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  writeFileSync(envPath, envContent);
  console.log(`${G}✅ .env 已保存${X}`);

  // 确保 config.yaml 存在
  if (!existsSync(configPath)) {
    copyFileSync(examplePath, configPath);
    console.log(`${G}✅ config.yaml 已从模板创建${X}`);
  } else {
    console.log(`${D}ℹ  config.yaml 已存在，保持不变${X}`);
  }

  console.log(`\n${G}${B}🎉 设置完成！${X}`);
  console.log(`${D}MCP Server 将在下次 Claude Code 启动时自动加载新配置。${X}`);
  console.log(`${D}如需修改配置，编辑 config.yaml 或重新运行 node setup.js${X}\n`);

  rl.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
