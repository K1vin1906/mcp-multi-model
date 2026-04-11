#!/usr/bin/env node
// Cross-platform startup smoke test for mcp-multi-model.
// Spawns the server, waits a short window, and verifies it did not crash
// with a fatal JS error during initialization.
//
// Used by .github/workflows/smoke.yml to run on macOS / Windows / Linux.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "index.js");
const WAIT_MS = 3000;

const proc = spawn(process.execPath, [serverPath], {
  stdio: ["pipe", "pipe", "pipe"],
});

let stderrBuf = "";
proc.stderr.on("data", (d) => {
  const s = d.toString();
  stderrBuf += s;
  process.stderr.write(s);
});
proc.stdout.on("data", (d) => process.stdout.write(d));
proc.on("error", (e) => {
  console.error("spawn error:", e.message);
  process.exit(1);
});

setTimeout(() => {
  proc.kill();
  // Warnings like "KIMI_API_KEY not set, skipped" are expected in CI — ignore them.
  // Only fail on hard JS errors.
  const fatal = stderrBuf.match(
    /SyntaxError|TypeError|ReferenceError|Error: Cannot find module/
  );
  if (fatal) {
    console.error(`\nFATAL: startup error detected (${fatal[0]})`);
    process.exit(1);
  }
  console.log(`\nOK: server started without fatal errors within ${WAIT_MS}ms`);
  process.exit(0);
}, WAIT_MS);
