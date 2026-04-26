#!/usr/bin/env node
/**
 * §5.4 性能基准：在临时工作区里造一个"大项目" SQLite DB，
 * 测量章节列表、按 ID 读取、批量更新、VACUUM 等核心操作耗时。
 * 输出 JSON + 人类可读摘要，供后续回归对照。
 *
 * 运行：pnpm --filter @inkforge/desktop run bench:storage
 * 前置：先跑 pnpm build 让 packages/storage/dist 就绪。
 *
 * 调节规模：
 *   BENCH_PROJECTS  默认 5
 *   BENCH_CHAPTERS  默认 500（每个 project 各 500 章）
 *   BENCH_FEEDBACKS 默认 5（每章 5 条 ai_feedbacks）
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  openDatabase,
  runMigrations,
  vacuum,
  insertProject,
  insertChapter,
  listChapters,
  getChapter,
  updateChapter,
} = require("@inkforge/storage");

const PROJECTS = Number(process.env.BENCH_PROJECTS) || 5;
const CHAPTERS_PER_PROJECT = Number(process.env.BENCH_CHAPTERS) || 500;
const FEEDBACKS_PER_CHAPTER = Number(process.env.BENCH_FEEDBACKS) || 5;

function hrms(start) {
  const diff = process.hrtime.bigint() - start;
  return Number(diff) / 1e6;
}

function uuid() {
  return `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function lorem(words) {
  const seed =
    "the quick brown fox jumps over the lazy dog 一只敏捷的棕色狐狸越过那只懒散的狗 ";
  let out = "";
  while (out.length < words * 6) out += seed;
  return out.slice(0, words * 6);
}

function bench(label, fn) {
  const start = process.hrtime.bigint();
  const result = fn();
  const ms = hrms(start);
  return { label, ms: Number(ms.toFixed(2)), result };
}

function seed(db) {
  const projectIds = [];
  const chapterIds = [];
  const startSeed = process.hrtime.bigint();

  const tx = db.transaction(() => {
    for (let p = 0; p < PROJECTS; p++) {
      const projectId = uuid();
      projectIds.push(projectId);
      insertProject(db, {
        id: projectId,
        name: `Bench Project ${p}`,
        path: `/bench/project-${p}`,
        dailyGoal: 1000,
      });
      for (let c = 0; c < CHAPTERS_PER_PROJECT; c++) {
        const chapterId = uuid();
        chapterIds.push(chapterId);
        insertChapter(db, {
          id: chapterId,
          projectId,
          title: `Chapter ${c}`,
          order: c,
          status: "draft",
          wordCount: 1500 + (c % 300),
          filePath: `chapters/${c.toString().padStart(4, "0")}.md`,
        });
      }
    }

    // ai_feedbacks rows make VACUUM more meaningful (variable-length JSON).
    const insFb = db.prepare(
      `INSERT INTO ai_feedbacks (id, project_id, chapter_id, type, payload, trigger, created_at, dismissed)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    );
    const now = new Date().toISOString();
    for (const chapterId of chapterIds) {
      const row = db
        .prepare(`SELECT project_id FROM chapters WHERE id = ?`)
        .get(chapterId);
      if (!row) continue;
      for (let f = 0; f < FEEDBACKS_PER_CHAPTER; f++) {
        insFb.run(
          uuid(),
          row.project_id,
          chapterId,
          "analysis",
          JSON.stringify({ note: lorem(40) }),
          "auto-200",
          now,
        );
      }
    }
  });
  tx();

  return { projectIds, chapterIds, seedMs: hrms(startSeed) };
}

function fileSize(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function main() {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "inkforge-bench-"));
  const dbPath = path.join(workspaceDir, "inkforge.db");
  console.log(`[bench:storage] workspace: ${workspaceDir}`);
  console.log(
    `[bench:storage] scale: ${PROJECTS} projects × ${CHAPTERS_PER_PROJECT} chapters × ${FEEDBACKS_PER_CHAPTER} feedbacks`,
  );

  let db;
  const samples = [];
  try {
    db = openDatabase({ workspaceDir });
    runMigrations(db);

    const seeded = seed(db);
    samples.push({ label: "seed", ms: Number(seeded.seedMs.toFixed(2)) });

    // schemaSize is the on-disk size right after seeding.
    const sizeAfterSeed = fileSize(dbPath);

    // List all chapters across all projects.
    samples.push(
      bench("list_chapters_per_project_avg", () => {
        let total = 0;
        for (const projectId of seeded.projectIds) {
          total += listChapters(db, projectId).length;
        }
        return total;
      }),
    );

    // Random-access read.
    samples.push(
      bench(`get_chapter_by_id × ${seeded.chapterIds.length}`, () => {
        let count = 0;
        for (const id of seeded.chapterIds) {
          if (getChapter(db, id)) count++;
        }
        return count;
      }),
    );

    // Word-count update — exercises write path + indexes.
    samples.push(
      bench(`update_chapter × ${Math.min(1000, seeded.chapterIds.length)}`, () => {
        const subset = seeded.chapterIds.slice(0, 1000);
        const tx = db.transaction(() => {
          for (const id of subset) {
            updateChapter(db, { id, wordCount: 2000 });
          }
        });
        tx();
        return subset.length;
      }),
    );

    // Feedback fan-out query (typical inspector load).
    samples.push(
      bench("count_feedbacks_per_chapter_avg", () => {
        const stmt = db.prepare(
          `SELECT COUNT(*) AS c FROM ai_feedbacks WHERE chapter_id = ?`,
        );
        let total = 0;
        for (const id of seeded.chapterIds.slice(0, 200)) {
          total += stmt.get(id).c;
        }
        return total;
      }),
    );

    samples.push(
      bench("vacuum", () => {
        vacuum(db);
        return "ok";
      }),
    );

    const sizeAfterVacuum = fileSize(dbPath);

    const summary = {
      scale: { PROJECTS, CHAPTERS_PER_PROJECT, FEEDBACKS_PER_CHAPTER },
      sizeAfterSeed,
      sizeAfterVacuum,
      samples,
    };

    console.log("\n[bench:storage] results");
    for (const s of samples) {
      const result = "result" in s ? ` → ${s.result}` : "";
      console.log(`  ${s.label.padEnd(40)} ${String(s.ms).padStart(8)} ms${result}`);
    }
    console.log(
      `  db size after seed:   ${fmtBytes(sizeAfterSeed)}\n  db size after vacuum: ${fmtBytes(sizeAfterVacuum)}`,
    );
    console.log("\n[bench:storage] JSON\n" + JSON.stringify(summary, null, 2));
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
}

main();
