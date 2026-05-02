import type { DB } from "../db";
import type {
  ChapterLogEntryAuthor,
  ChapterLogEntryKind,
  ChapterLogEntryRecord,
  ChapterLogRecord,
} from "@inkforge/shared";
import { randomUUID } from "crypto";

type LogRow = {
  id: string;
  chapter_id: string;
  project_id: string;
  created_at: string;
};

type EntryRow = {
  id: string;
  log_id: string;
  chapter_id: string;
  kind: ChapterLogEntryKind;
  author: ChapterLogEntryAuthor;
  content: string;
  metadata: string;
  created_at: string;
};

function logRowToRecord(row: LogRow): ChapterLogRecord {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    projectId: row.project_id,
    createdAt: row.created_at,
  };
}

function entryRowToRecord(row: EntryRow): ChapterLogEntryRecord {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = row.metadata ? JSON.parse(row.metadata) : {};
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    logId: row.log_id,
    chapterId: row.chapter_id,
    kind: row.kind,
    author: row.author,
    content: row.content,
    metadata,
    createdAt: row.created_at,
  };
}

/**
 * 找到或为某章节创建一条日志元数据行。
 * chapter_logs.chapter_id 有 UNIQUE 约束，所以同一章节最多一条。
 */
export function ensureChapterLog(
  db: DB,
  chapterId: string,
  projectId: string,
): ChapterLogRecord {
  const existing = db
    .prepare(`SELECT * FROM chapter_logs WHERE chapter_id = ?`)
    .get(chapterId) as LogRow | undefined;
  if (existing) return logRowToRecord(existing);

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO chapter_logs (id, chapter_id, project_id, created_at)
     VALUES (@id, @chapter_id, @project_id, @created_at)`,
  ).run({ id, chapter_id: chapterId, project_id: projectId, created_at: createdAt });
  return { id, chapterId, projectId, createdAt };
}

export function getChapterLog(db: DB, chapterId: string): ChapterLogRecord | null {
  const row = db
    .prepare(`SELECT * FROM chapter_logs WHERE chapter_id = ?`)
    .get(chapterId) as LogRow | undefined;
  return row ? logRowToRecord(row) : null;
}

export interface AppendChapterLogEntryInput {
  chapterId: string;
  projectId: string;
  kind: ChapterLogEntryKind;
  author: ChapterLogEntryAuthor;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * 追加一条日志条目。如果该章节没有 log 行，自动创建。
 * 所有触发源（progress / ai-run / manual / daily-reminder）都通过这里写入。
 */
export function appendChapterLogEntry(
  db: DB,
  input: AppendChapterLogEntryInput,
): ChapterLogEntryRecord {
  const log = ensureChapterLog(db, input.chapterId, input.projectId);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const metadata = input.metadata ?? {};
  db.prepare(
    `INSERT INTO chapter_log_entries
       (id, log_id, chapter_id, kind, author, content, metadata, created_at)
     VALUES (@id, @log_id, @chapter_id, @kind, @author, @content, @metadata, @created_at)`,
  ).run({
    id,
    log_id: log.id,
    chapter_id: input.chapterId,
    kind: input.kind,
    author: input.author,
    content: input.content,
    metadata: JSON.stringify(metadata),
    created_at: createdAt,
  });
  return {
    id,
    logId: log.id,
    chapterId: input.chapterId,
    kind: input.kind,
    author: input.author,
    content: input.content,
    metadata,
    createdAt,
  };
}

export interface ListChapterLogEntriesOptions {
  limit?: number;
  /** 按时间倒序（默认 true，最新在前）。 */
  desc?: boolean;
}

export function listChapterLogEntries(
  db: DB,
  chapterId: string,
  options: ListChapterLogEntriesOptions = {},
): ChapterLogEntryRecord[] {
  const desc = options.desc ?? true;
  const limit = Math.max(1, Math.min(500, options.limit ?? 100));
  const rows = db
    .prepare(
      `SELECT * FROM chapter_log_entries
        WHERE chapter_id = ?
        ORDER BY created_at ${desc ? "DESC" : "ASC"}
        LIMIT ?`,
    )
    .all(chapterId, limit) as EntryRow[];
  return rows.map(entryRowToRecord);
}

export function deleteChapterLogEntry(db: DB, entryId: string): void {
  db.prepare(`DELETE FROM chapter_log_entries WHERE id = ?`).run(entryId);
}

/** 删除整个章节的日志（章节本身被删时，FK CASCADE 也会触发；这里作为显式 API。） */
export function deleteChapterLog(db: DB, chapterId: string): void {
  db.prepare(`DELETE FROM chapter_logs WHERE chapter_id = ?`).run(chapterId);
}
