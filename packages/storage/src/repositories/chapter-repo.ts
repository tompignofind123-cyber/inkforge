import type { DB } from "../db";
import type { ChapterRecord, ChapterUpdateInput } from "@inkforge/shared";

type ChapterRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  order: number;
  status: string;
  word_count: number;
  file_path: string;
  updated_at: string | null;
};

function rowToRecord(row: ChapterRow): ChapterRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    title: row.title,
    order: row.order,
    status: row.status,
    wordCount: row.word_count,
    filePath: row.file_path,
    updatedAt: row.updated_at,
  };
}

export interface CreateChapterRow {
  id: string;
  projectId: string;
  parentId?: string | null;
  title: string;
  order?: number;
  status?: string;
  wordCount?: number;
  filePath: string;
}

export function insertChapter(db: DB, input: CreateChapterRow): ChapterRecord {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO chapters (id, project_id, parent_id, title, "order", status, word_count, file_path, updated_at)
     VALUES (@id, @project_id, @parent_id, @title, @order, @status, @word_count, @file_path, @updated_at)`,
  ).run({
    id: input.id,
    project_id: input.projectId,
    parent_id: input.parentId ?? null,
    title: input.title,
    order: input.order ?? 0,
    status: input.status ?? "draft",
    word_count: input.wordCount ?? 0,
    file_path: input.filePath,
    updated_at: now,
  });
  return {
    id: input.id,
    projectId: input.projectId,
    parentId: input.parentId ?? null,
    title: input.title,
    order: input.order ?? 0,
    status: input.status ?? "draft",
    wordCount: input.wordCount ?? 0,
    filePath: input.filePath,
    updatedAt: now,
  };
}

export function listChapters(db: DB, projectId: string): ChapterRecord[] {
  const rows = db
    .prepare(`SELECT * FROM chapters WHERE project_id = ? ORDER BY "order" ASC, title ASC`)
    .all(projectId) as ChapterRow[];
  return rows.map(rowToRecord);
}

export function getChapter(db: DB, id: string): ChapterRecord | null {
  const row = db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(id) as ChapterRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function updateChapter(db: DB, input: ChapterUpdateInput): ChapterRecord {
  const existing = getChapter(db, input.id);
  if (!existing) throw new Error(`Chapter not found: ${input.id}`);
  const now = new Date().toISOString();
  const next: ChapterRecord = {
    ...existing,
    title: input.title ?? existing.title,
    status: input.status ?? existing.status,
    wordCount: input.wordCount ?? existing.wordCount,
    filePath: input.filePath ?? existing.filePath,
    updatedAt: now,
  };
  db.prepare(
    `UPDATE chapters
       SET title = @title, status = @status, word_count = @word_count,
           file_path = @file_path, updated_at = @updated_at
     WHERE id = @id`,
  ).run({
    id: next.id,
    title: next.title,
    status: next.status,
    word_count: next.wordCount,
    file_path: next.filePath,
    updated_at: next.updatedAt,
  });
  return next;
}

export function deleteChapter(db: DB, id: string): void {
  db.prepare(`DELETE FROM chapters WHERE id = ?`).run(id);
}

export function reorderChapters(db: DB, projectId: string, orderedIds: string[]): ChapterRecord[] {
  const stmt = db.prepare(`UPDATE chapters SET "order" = ? WHERE id = ? AND project_id = ?`);
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((id, index) => stmt.run(index, id, projectId));
  });
  tx(orderedIds);
  return listChapters(db, projectId);
}

export function countChapterWords(db: DB, projectId: string): number {
  const row = db
    .prepare(`SELECT COALESCE(SUM(word_count), 0) AS total FROM chapters WHERE project_id = ?`)
    .get(projectId) as { total: number } | undefined;
  return row?.total ?? 0;
}
