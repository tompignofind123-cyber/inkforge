import type { DB } from "../db";
import type {
  AutoWriterAgentRole,
  ChapterSnapshotKind,
  ChapterSnapshotRecord,
} from "@inkforge/shared";
import { createHash, randomUUID } from "crypto";

type Row = {
  id: string;
  chapter_id: string;
  project_id: string;
  kind: ChapterSnapshotKind;
  label: string | null;
  content_hash: string;
  file_path: string;
  word_count: number;
  run_id: string | null;
  agent_role: AutoWriterAgentRole | null;
  source_message_id: string | null;
  created_at: string;
};

function rowToRecord(row: Row): ChapterSnapshotRecord {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    projectId: row.project_id,
    kind: row.kind,
    label: row.label,
    contentHash: row.content_hash,
    filePath: row.file_path,
    wordCount: row.word_count,
    runId: row.run_id,
    agentRole: row.agent_role,
    sourceMessageId: row.source_message_id,
    createdAt: row.created_at,
  };
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

export interface CreateSnapshotRowInput {
  /** 调用方决定 id（通常为 randomUUID），便于先确定 file_path 再写文件再写 DB。 */
  id?: string;
  chapterId: string;
  projectId: string;
  kind: ChapterSnapshotKind;
  label?: string | null;
  contentHash: string;
  filePath: string;
  wordCount?: number;
  runId?: string | null;
  agentRole?: AutoWriterAgentRole | null;
  sourceMessageId?: string | null;
}

/**
 * 仅写 DB 行；快照文件由调用方（snapshot-service）使用 `writeSnapshotFile` 完成。
 * 这样能让「先写文件再写行」或「事务回滚时擦除文件」的策略由 service 控制。
 */
export function insertChapterSnapshot(
  db: DB,
  input: CreateSnapshotRowInput,
): ChapterSnapshotRecord {
  const id = input.id ?? randomUUID();
  const createdAt = new Date().toISOString();
  const wordCount = Math.max(0, Math.floor(input.wordCount ?? 0));
  db.prepare(
    `INSERT INTO chapter_snapshots
       (id, chapter_id, project_id, kind, label, content_hash, file_path,
        word_count, run_id, agent_role, source_message_id, created_at)
     VALUES (@id, @chapter_id, @project_id, @kind, @label, @content_hash, @file_path,
             @word_count, @run_id, @agent_role, @source_message_id, @created_at)`,
  ).run({
    id,
    chapter_id: input.chapterId,
    project_id: input.projectId,
    kind: input.kind,
    label: input.label ?? null,
    content_hash: input.contentHash,
    file_path: input.filePath,
    word_count: wordCount,
    run_id: input.runId ?? null,
    agent_role: input.agentRole ?? null,
    source_message_id: input.sourceMessageId ?? null,
    created_at: createdAt,
  });
  return {
    id,
    chapterId: input.chapterId,
    projectId: input.projectId,
    kind: input.kind,
    label: input.label ?? null,
    contentHash: input.contentHash,
    filePath: input.filePath,
    wordCount,
    runId: input.runId ?? null,
    agentRole: input.agentRole ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
    createdAt,
  };
}

export interface ListChapterSnapshotsOptions {
  limit?: number;
  /** 仅列指定 kind；不传则全部。 */
  kinds?: ChapterSnapshotKind[];
  /** 仅列某次 AutoWriter 运行的快照。 */
  runId?: string;
}

export function listChapterSnapshots(
  db: DB,
  chapterId: string,
  options: ListChapterSnapshotsOptions = {},
): ChapterSnapshotRecord[] {
  const limit = Math.max(1, Math.min(1000, options.limit ?? 100));
  const clauses: string[] = ["chapter_id = ?"];
  const params: unknown[] = [chapterId];
  if (options.kinds && options.kinds.length > 0) {
    const placeholders = options.kinds.map(() => "?").join(",");
    clauses.push(`kind IN (${placeholders})`);
    params.push(...options.kinds);
  }
  if (options.runId) {
    clauses.push("run_id = ?");
    params.push(options.runId);
  }
  params.push(limit);
  const rows = db
    .prepare(
      `SELECT * FROM chapter_snapshots
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT ?`,
    )
    .all(...params) as Row[];
  return rows.map(rowToRecord);
}

export function getChapterSnapshot(
  db: DB,
  id: string,
): ChapterSnapshotRecord | null {
  const row = db
    .prepare(`SELECT * FROM chapter_snapshots WHERE id = ?`)
    .get(id) as Row | undefined;
  return row ? rowToRecord(row) : null;
}

export function deleteChapterSnapshot(db: DB, id: string): ChapterSnapshotRecord | null {
  const existing = getChapterSnapshot(db, id);
  if (!existing) return null;
  db.prepare(`DELETE FROM chapter_snapshots WHERE id = ?`).run(id);
  return existing;
}

/**
 * 找出该章节中可以被 prune 的自动快照（kind ∈ pre-ai/post-ai/pre-rewrite/auto-periodic
 * 且不是最近 keepN 条）。手动快照（kind='manual'）和 pre-restore 永不被 prune。
 * 返回需要删除的 row 列表，调用方负责删 DB 行 + 删文件。
 */
export function findPrunableSnapshots(
  db: DB,
  chapterId: string,
  keepN: number,
): ChapterSnapshotRecord[] {
  const safeKeep = Math.max(0, keepN);
  const rows = db
    .prepare(
      `SELECT * FROM chapter_snapshots
        WHERE chapter_id = ?
          AND kind IN ('pre-ai','post-ai','pre-rewrite','auto-periodic')
        ORDER BY created_at DESC`,
    )
    .all(chapterId) as Row[];
  if (rows.length <= safeKeep) return [];
  return rows.slice(safeKeep).map(rowToRecord);
}

/** 找出该章节最近的同 kind 的快照，用于去重（相同内容不重复写入）。 */
export function findRecentSnapshotByHash(
  db: DB,
  chapterId: string,
  contentHash: string,
): ChapterSnapshotRecord | null {
  const row = db
    .prepare(
      `SELECT * FROM chapter_snapshots
        WHERE chapter_id = ? AND content_hash = ?
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get(chapterId, contentHash) as Row | undefined;
  return row ? rowToRecord(row) : null;
}
