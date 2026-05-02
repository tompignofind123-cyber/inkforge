import type { DB } from "../db";
import type { ChapterOrigin, ChapterOriginTagRecord } from "@inkforge/shared";

type Row = {
  chapter_id: string;
  origin: ChapterOrigin;
  tagged_at: string;
};

function rowToRecord(row: Row): ChapterOriginTagRecord {
  return {
    chapterId: row.chapter_id,
    origin: row.origin,
    taggedAt: row.tagged_at,
  };
}

/**
 * 设置或更新章节来源标签。chapter_id 是 PK，所以是 upsert 语义。
 * 旧章节没记录 → 视图层渲染时按 'manual' 兜底；本仓库不主动写入兜底。
 */
export function setChapterOrigin(
  db: DB,
  chapterId: string,
  origin: ChapterOrigin,
): ChapterOriginTagRecord {
  const taggedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO chapter_origin_tags (chapter_id, origin, tagged_at)
     VALUES (@chapter_id, @origin, @tagged_at)
     ON CONFLICT(chapter_id) DO UPDATE SET
       origin = excluded.origin,
       tagged_at = excluded.tagged_at`,
  ).run({ chapter_id: chapterId, origin, tagged_at: taggedAt });
  return { chapterId, origin, taggedAt };
}

export function getChapterOrigin(
  db: DB,
  chapterId: string,
): ChapterOriginTagRecord | null {
  const row = db
    .prepare(`SELECT * FROM chapter_origin_tags WHERE chapter_id = ?`)
    .get(chapterId) as Row | undefined;
  return row ? rowToRecord(row) : null;
}

export function deleteChapterOrigin(db: DB, chapterId: string): void {
  db.prepare(`DELETE FROM chapter_origin_tags WHERE chapter_id = ?`).run(chapterId);
}

/**
 * 列出某 project 下指定 origin 的所有 chapter id（用于书房按 Tab 过滤）。
 * 对 origin = 'manual'，调用方应该额外把「该 project 下未在本表中登记的章节」也归入此分类。
 */
export function listChapterIdsByOrigin(
  db: DB,
  projectId: string,
  origin: ChapterOrigin,
): string[] {
  const rows = db
    .prepare(
      `SELECT t.chapter_id AS chapter_id
         FROM chapter_origin_tags t
         JOIN chapters c ON c.id = t.chapter_id
        WHERE c.project_id = ? AND t.origin = ?`,
    )
    .all(projectId, origin) as Array<{ chapter_id: string }>;
  return rows.map((r) => r.chapter_id);
}

/** 一次性返回某 project 的所有 origin 映射，给前端做批量渲染。 */
export function listChapterOriginsForProject(
  db: DB,
  projectId: string,
): ChapterOriginTagRecord[] {
  const rows = db
    .prepare(
      `SELECT t.* FROM chapter_origin_tags t
        JOIN chapters c ON c.id = t.chapter_id
       WHERE c.project_id = ?`,
    )
    .all(projectId) as Row[];
  return rows.map(rowToRecord);
}
