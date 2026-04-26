#!/usr/bin/env node
/**
 * Launch a CommonJS script using Electron's bundled Node runtime.
 * Required because better-sqlite3 in this repo is built against
 * Electron's NODE_MODULE_VERSION (not the system Node version).
 *
 * Usage: node scripts/_run-in-electron.cjs <target-script.cjs>
 */
const path = require("node:path");
const { spawn } = require("node:child_process");

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/_run-in-electron.cjs <script>");
  process.exit(2);
}

const electronPath = require("electron");
const child = spawn(electronPath, [path.resolve(target)], {
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
  },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
