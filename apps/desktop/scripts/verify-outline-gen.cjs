#!/usr/bin/env node
/**
 * Module 6 — Outline Generation 验收脚本
 *
 * Tests storage layer only (LLM calls require live provider, skipped here):
 *   1) v19 columns added to projects (synopsis/genre/sub_genre/tags/master_outline/pre_refine_master_outline)
 *   2) updateProjectMeta patches camelCase fields, parses tags JSON
 *   3) master outline + undo snapshot round-trip
 *   4) outline_cards CRUD (insert/update/delete) with chapter_id linkage
 *
 * 运行：pnpm --filter @inkforge/desktop run verify:outline-gen
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const {
  openDatabase,
  runMigrations,
  insertProject,
  getProject,
  updateProjectMeta,
  insertOutline,
  updateOutline,
  listOutlines,
  deleteOutline,
} = require("@inkforge/storage");

function fail(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exitCode = 1;
}
function ok(msg) {
  console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
}

function main() {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "inkforge-outline-gen-"));
  console.log(`[verify-outline-gen] workspace: ${workspaceDir}`);
  let db;
  try {
    db = openDatabase({ workspaceDir });
    runMigrations(db);

    // 1. v19 columns
    const cols = db
      .prepare(`PRAGMA table_info('projects')`)
      .all()
      .map((r) => r.name);
    const required = ["synopsis", "genre", "sub_genre", "tags", "master_outline", "pre_refine_master_outline"];
    const missing = required.filter((c) => !cols.includes(c));
    if (missing.length) {
      fail(`v19 columns missing: ${missing.join(", ")}`);
    } else {
      ok("v19 added 6 columns to projects");
    }

    // 2. insertProject defaults
    const project = insertProject(db, {
      id: randomUUID(),
      name: "Test",
      path: `/tmp/${randomUUID()}`,
    });
    if (project.synopsis !== "" || project.genre !== "" || project.tags.length !== 0 || project.masterOutline !== "" || project.preRefineMasterOutline !== null) {
      fail(`insertProject defaults wrong: ${JSON.stringify(project)}`);
    } else {
      ok("insertProject sets v19 defaults (empty strings + [] + null)");
    }

    // 3. updateProjectMeta patch
    const patched = updateProjectMeta(db, {
      id: project.id,
      synopsis: "主角穿越异世界",
      genre: "玄幻",
      subGenre: "修仙",
      tags: ["爽文", "双男主"],
    });
    if (patched.synopsis !== "主角穿越异世界" || patched.genre !== "玄幻" || patched.tags.length !== 2 || patched.tags[0] !== "爽文") {
      fail(`updateProjectMeta result wrong: ${JSON.stringify(patched)}`);
    } else {
      ok("updateProjectMeta patches synopsis/genre/tags (CSV-parsed back)");
    }

    // 4. master outline + undo snapshot
    updateProjectMeta(db, { id: project.id, masterOutline: "v1: 开端\n发展\n高潮" });
    const beforeRefine = getProject(db, project.id);
    updateProjectMeta(db, {
      id: project.id,
      preRefineMasterOutline: beforeRefine.masterOutline,
      masterOutline: "v2: 改写后",
    });
    const afterRefine = getProject(db, project.id);
    if (afterRefine.masterOutline !== "v2: 改写后" || afterRefine.preRefineMasterOutline !== "v1: 开端\n发展\n高潮") {
      fail(`refine snapshot wrong: ${JSON.stringify(afterRefine)}`);
    } else {
      ok("master_outline + pre_refine snapshot round-trip");
    }

    // Undo: restore prev outline + clear snapshot
    updateProjectMeta(db, {
      id: project.id,
      masterOutline: afterRefine.preRefineMasterOutline,
      preRefineMasterOutline: null,
    });
    const undone = getProject(db, project.id);
    if (undone.masterOutline !== "v1: 开端\n发展\n高潮" || undone.preRefineMasterOutline !== null) {
      fail(`undo did not restore properly: ${JSON.stringify(undone)}`);
    } else {
      ok("undo restores prev master outline + clears snapshot");
    }

    // 5. outline_cards CRUD
    const card = insertOutline(db, {
      id: randomUUID(),
      projectId: project.id,
      chapterId: null,
      title: "第一章 · 觉醒",
      content: "主角觉醒灵根",
      status: "planned",
      order: 0,
    });
    const cards = listOutlines(db, project.id);
    if (cards.length !== 1 || cards[0].title !== "第一章 · 觉醒") {
      fail(`insertOutline / listOutlines wrong: ${JSON.stringify(cards)}`);
    } else {
      ok("outline_cards insert + list");
    }

    // Link to chapter (simulating commitChapterDraft)
    const fakeChapterId = randomUUID();
    db.prepare(
      `INSERT INTO chapters (id, project_id, title, "order", status, word_count, file_path, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(fakeChapterId, project.id, "第一章 · 觉醒", 0, "draft", 0, "chapters/ch1.md", null);
    updateOutline(db, { id: card.id, chapterId: fakeChapterId, status: "written" });
    const after = listOutlines(db, project.id);
    if (after[0].chapterId !== fakeChapterId || after[0].status !== "written") {
      fail(`outline link to chapter failed: ${JSON.stringify(after)}`);
    } else {
      ok("outline_cards link to chapter via update + status='written'");
    }

    deleteOutline(db, card.id);
    const after2 = listOutlines(db, project.id);
    if (after2.length !== 0) fail(`deleteOutline failed: ${after2.length} remaining`);
    else ok("outline_cards delete");
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
    console.error("\x1b[31mOutline Generation 验证失败\x1b[0m");
  } else {
    console.log("\x1b[32mOutline Generation 验证通过\x1b[0m");
  }
}

main();
