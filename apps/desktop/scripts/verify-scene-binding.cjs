#!/usr/bin/env node
/**
 * Scene Bindings 验收脚本（ported from ainovel）
 * 步骤：
 *   1) 跑迁移到 v16，断言 scene_bindings_basic / scene_bindings_advanced 存在
 *   2) 断言 5 + 9 行 seed 数据已写入
 *   3) upsert basic + advanced 各一条 → 读回验证
 *   4) reset → providerId/model 应回到 NULL
 *   5) get/set sceneRoutingMode → app_settings 联动
 *   6) 双模式互不污染：advanced upsert 不影响 basic 同 sceneKey
 *
 * 运行：pnpm --filter @inkforge/desktop run verify:scene-binding
 * 前置：先跑 pnpm --filter @inkforge/storage build
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  openDatabase,
  runMigrations,
  listSceneBindings,
  upsertSceneBinding,
  resetSceneBinding,
  getSceneBinding,
  getAppSettings,
  setAppSettings,
} = require("@inkforge/storage");

function fail(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
}

function main() {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "inkforge-scene-"));
  console.log(`[verify-scene-binding] workspace: ${workspaceDir}`);
  let db;
  try {
    db = openDatabase({ workspaceDir });
    runMigrations(db);

    // 1) 表存在
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((r) => r.name);
    if (!tables.includes("scene_bindings_basic")) {
      fail("scene_bindings_basic table missing");
    } else if (!tables.includes("scene_bindings_advanced")) {
      fail("scene_bindings_advanced table missing");
    } else {
      ok("dual scene_bindings tables exist");
    }

    // 2) seed 行数
    const basicRows = listSceneBindings(db, "basic");
    const advancedRows = listSceneBindings(db, "advanced");
    if (basicRows.length !== 5) {
      fail(`basic seed rows=${basicRows.length}, expected 5`);
    } else {
      ok(`basic seed rows = 5 (${basicRows.map((r) => r.sceneKey).join(",")})`);
    }
    if (advancedRows.length !== 9) {
      fail(`advanced seed rows=${advancedRows.length}, expected 9`);
    } else {
      ok(`advanced seed rows = 9 (${advancedRows.map((r) => r.sceneKey).join(",")})`);
    }

    // Seed real providers (FK targets)
    db.prepare(
      `INSERT INTO providers (id, label, vendor, default_model) VALUES (?, ?, ?, ?)`,
    ).run("test-provider", "Test", "openai", "test-model");
    db.prepare(
      `INSERT INTO providers (id, label, vendor, default_model) VALUES (?, ?, ?, ?)`,
    ).run("skill-provider", "Skill", "openai", "skill-model");

    // 3) upsert basic
    const basicUpsert = upsertSceneBinding(db, {
      mode: "basic",
      sceneKey: "main_generation",
      providerId: "test-provider",
      model: "test-model",
    });
    if (basicUpsert.providerId !== "test-provider" || basicUpsert.model !== "test-model") {
      fail(`basic upsert wrong: ${JSON.stringify(basicUpsert)}`);
    } else {
      ok("basic upsert main_generation -> test-provider/test-model");
    }

    // 4) upsert advanced 不污染 basic
    const advUpsert = upsertSceneBinding(db, {
      mode: "advanced",
      sceneKey: "skill",
      providerId: "skill-provider",
      model: null,
    });
    if (advUpsert.providerId !== "skill-provider") {
      fail(`advanced upsert wrong: ${JSON.stringify(advUpsert)}`);
    }
    const basicAfter = getSceneBinding(db, "basic", "main_generation");
    if (basicAfter?.providerId !== "test-provider") {
      fail("advanced upsert leaked into basic table");
    } else {
      ok("dual-mode isolation verified (advanced upsert does not touch basic)");
    }

    // 5) reset
    resetSceneBinding(db, "basic", "main_generation");
    const resetCheck = getSceneBinding(db, "basic", "main_generation");
    if (resetCheck?.providerId !== null) {
      fail(`reset failed: providerId=${resetCheck?.providerId}`);
    } else {
      ok("reset basic.main_generation cleared providerId");
    }

    // 6) sceneRoutingMode round-trip
    const initialMode = getAppSettings(db).sceneRoutingMode;
    if (initialMode !== "basic") {
      fail(`default sceneRoutingMode=${initialMode}, expected 'basic'`);
    } else {
      ok("default sceneRoutingMode = 'basic'");
    }
    setAppSettings(db, { sceneRoutingMode: "advanced" });
    const switched = getAppSettings(db).sceneRoutingMode;
    if (switched !== "advanced") {
      fail(`setAppSettings advanced did not persist: got ${switched}`);
    } else {
      ok("setAppSettings sceneRoutingMode='advanced' persisted");
    }
    setAppSettings(db, { sceneRoutingMode: "basic" });
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  if (process.exitCode && process.exitCode !== 0) {
    console.error("\x1b[31mScene Bindings 验证失败\x1b[0m");
  } else {
    console.log("\x1b[32mScene Bindings 验证通过\x1b[0m");
  }
}

main();
