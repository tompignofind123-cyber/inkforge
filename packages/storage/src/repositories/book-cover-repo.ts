import type { DB } from "../db";
import type { BookCoverRecord } from "@inkforge/shared";

type Row = {
  id: string;
  project_id: string;
  file_path: string;
  mime: string;
  uploaded_at: string;
};

function rowToRecord(row: Row): BookCoverRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    filePath: row.file_path,
    mime: row.mime,
    uploadedAt: row.uploaded_at,
  };
}

export interface UpsertBookCoverInput {
  id: string;
  projectId: string;
  filePath: string;
  mime: string;
}

/**
 * 每个 project 只保留一条封面记录（uidx_book_covers_project 强制唯一）。
 * 覆盖语义：传入新 id 会替换旧行；调用方负责删除旧文件（fs-layout writeCoverFile 已自动 sweep 旧扩展名）。
 */
export function upsertBookCover(db: DB, input: UpsertBookCoverInput): BookCoverRecord {
  const uploadedAt = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM book_covers WHERE project_id = ?`).run(input.projectId);
    db.prepare(
      `INSERT INTO book_covers (id, project_id, file_path, mime, uploaded_at)
       VALUES (@id, @project_id, @file_path, @mime, @uploaded_at)`,
    ).run({
      id: input.id,
      project_id: input.projectId,
      file_path: input.filePath,
      mime: input.mime,
      uploaded_at: uploadedAt,
    });
  });
  tx();
  return {
    id: input.id,
    projectId: input.projectId,
    filePath: input.filePath,
    mime: input.mime,
    uploadedAt,
  };
}

export function getBookCover(db: DB, projectId: string): BookCoverRecord | null {
  const row = db
    .prepare(`SELECT * FROM book_covers WHERE project_id = ?`)
    .get(projectId) as Row | undefined;
  return row ? rowToRecord(row) : null;
}

export function deleteBookCover(db: DB, projectId: string): BookCoverRecord | null {
  const existing = getBookCover(db, projectId);
  if (!existing) return null;
  db.prepare(`DELETE FROM book_covers WHERE project_id = ?`).run(projectId);
  return existing;
}

export function listBookCovers(db: DB): BookCoverRecord[] {
  const rows = db.prepare(`SELECT * FROM book_covers`).all() as Row[];
  return rows.map(rowToRecord);
}
