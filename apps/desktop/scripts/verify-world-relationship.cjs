#!/usr/bin/env node
/**
 * World Relationships 验收脚本（ported from ainovel）
 * 步骤：
 *   1) 跑迁移到 v18，断言 world_relationships 表 + 3 索引存在
 *   2) seed 项目 + 2 角色 + 1 世界条目
 *   3) saveWorldRelationship 创建 character→world_entry 关系
 *   4) 跨项目 endpoint 应被拒绝
 *   5) self-link 应被拒绝
 *   6) UNIQUE 防重复（同 src/dst 二次创建报错）
 *   7) cleanupOrphanRelationships：删 character 后 relationships 清零
 *   8) 删 project（CASCADE）后 relationships 清零
 *
 * 运行：pnpm --filter @inkforge/desktop run verify:world-relationship
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const {
  openDatabase,
  runMigrations,
  saveWorldRelationship,
  listWorldRelationships,
  deleteWorldRelationship,
  cleanupOrphanRelationships,
} = require("@inkforge/storage");

function fail(msg) {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
}

function seedProject(db, name) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, name, path, created_at, daily_goal, last_opened)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, name, `/tmp/${id}`, now, 1000, null);
  return id;
}

function seedCharacter(db, projectId, name) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO characters (id, project_id, name, persona, traits, backstory, relations, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, projectId, name, null, "{}", "", "[]", now, now);
  return id;
}

function seedWorldEntry(db, projectId, title) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO world_entries (id, project_id, category, title, content, aliases, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, projectId, "item", title, "", "[]", "[]", now, now);
  return id;
}

function main() {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "inkforge-rel-"));
  console.log(`[verify-world-relationship] workspace: ${workspaceDir}`);
  let db;
  try {
    db = openDatabase({ workspaceDir });
    runMigrations(db);

    // 1. 表 + 索引
    const indexes = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`)
      .all()
      .map((r) => r.name);
    const required = ["idx_world_rel_project", "idx_world_rel_src", "idx_world_rel_dst"];
    const missing = required.filter((i) => !indexes.includes(i));
    if (missing.length) {
      fail(`missing indexes: ${missing.join(", ")}`);
    } else {
      ok("world_relationships table + 3 indexes exist");
    }

    // 2. seed
    const p1 = seedProject(db, "P1");
    const p2 = seedProject(db, "P2");
    const charA = seedCharacter(db, p1, "Alice");
    const charB = seedCharacter(db, p1, "Bob");
    const sword = seedWorldEntry(db, p1, "Sword");
    const enemyChar = seedCharacter(db, p2, "Enemy"); // cross-project

    // 3. create relationship
    const rel1 = saveWorldRelationship(db, {
      projectId: p1,
      srcKind: "character",
      srcId: charA,
      dstKind: "world_entry",
      dstId: sword,
      label: "owns",
      weight: 7,
    });
    if (rel1.label !== "owns" || rel1.weight !== 7) {
      fail(`save returned wrong: ${JSON.stringify(rel1)}`);
    } else {
      ok("character→world_entry relationship saved");
    }

    // 4. cross-project rejection
    let crossOk = false;
    try {
      saveWorldRelationship(db, {
        projectId: p1,
        srcKind: "character",
        srcId: enemyChar, // belongs to p2
        dstKind: "character",
        dstId: charA,
      });
    } catch (err) {
      if (err.message.includes("cross-project") || err.message.includes("missing")) {
        crossOk = true;
      } else {
        fail(`cross-project save threw unexpected: ${err.message}`);
      }
    }
    if (crossOk) ok("cross-project endpoint rejected");
    else fail("cross-project endpoint should have been rejected");

    // 5. self-link rejection
    let selfOk = false;
    try {
      saveWorldRelationship(db, {
        projectId: p1,
        srcKind: "character",
        srcId: charA,
        dstKind: "character",
        dstId: charA,
      });
    } catch (err) {
      if (err.message.includes("self-link")) selfOk = true;
    }
    if (selfOk) ok("self-link rejected");
    else fail("self-link should have been rejected");

    // 6. UNIQUE
    let dupOk = false;
    try {
      saveWorldRelationship(db, {
        projectId: p1,
        srcKind: "character",
        srcId: charA,
        dstKind: "world_entry",
        dstId: sword,
      });
    } catch (err) {
      if (err.message.includes("duplicate")) dupOk = true;
    }
    if (dupOk) ok("UNIQUE constraint enforced");
    else fail("duplicate should have been rejected");

    // 7. cleanupOrphanRelationships when character deleted
    const rel2 = saveWorldRelationship(db, {
      projectId: p1,
      srcKind: "character",
      srcId: charB,
      dstKind: "character",
      dstId: charA,
      label: "rival",
    });
    let count = listWorldRelationships(db, p1).length;
    if (count !== 2) fail(`expected 2 rels, got ${count}`);

    const cleaned = cleanupOrphanRelationships(db, p1, "character", charA);
    if (cleaned !== 2) {
      fail(`cleanupOrphan returned ${cleaned}, expected 2`);
    } else {
      ok(`cleanupOrphan removed both rels touching charA (${cleaned})`);
    }
    count = listWorldRelationships(db, p1).length;
    if (count !== 0) fail(`expected 0 rels after cleanup, got ${count}`);

    // 8. CASCADE on project delete
    const restoredCharA = seedCharacter(db, p1, "Alice2");
    const restoredSword = seedWorldEntry(db, p1, "Sword2");
    saveWorldRelationship(db, {
      projectId: p1,
      srcKind: "character",
      srcId: restoredCharA,
      dstKind: "world_entry",
      dstId: restoredSword,
    });
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(p1);
    const remaining = db.prepare(`SELECT COUNT(*) AS n FROM world_relationships WHERE project_id = ?`).get(p1);
    if (remaining.n !== 0) {
      fail(`CASCADE failed: ${remaining.n} rels remaining`);
    } else {
      ok("project delete CASCADE cleared world_relationships");
    }
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
    console.error("\x1b[31mWorld Relationships 验证失败\x1b[0m");
  } else {
    console.log("\x1b[32mWorld Relationships 验证通过\x1b[0m");
  }
}

main();
