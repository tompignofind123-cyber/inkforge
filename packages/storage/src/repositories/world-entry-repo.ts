import type { DB } from "../db";
import type { WorldEntryRecord } from "@inkforge/shared";

type WorldEntryRow = {
  id: string;
  project_id: string;
  category: string;
  title: string;
  content: string;
  aliases: string;
  tags: string;
  created_at: string;
  updated_at: string;
};

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x));
    }
  } catch {
    // fallthrough
  }
  return [];
}

function rowToRecord(row: WorldEntryRow): WorldEntryRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    category: row.category,
    title: row.title,
    content: row.content,
    aliases: parseStringArray(row.aliases),
    tags: parseStringArray(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertWorldEntryInput {
  id: string;
  projectId: string;
  category: string;
  title: string;
  content?: string;
  aliases?: string[];
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export function insertWorldEntry(
  db: DB,
  input: InsertWorldEntryInput,
): WorldEntryRecord {
  const now = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? now;
  const row: WorldEntryRow = {
    id: input.id,
    project_id: input.projectId,
    category: input.category,
    title: input.title,
    content: input.content ?? "",
    aliases: JSON.stringify(input.aliases ?? []),
    tags: JSON.stringify(input.tags ?? []),
    created_at: now,
    updated_at: updatedAt,
  };
  db.prepare(
    `INSERT INTO world_entries
       (id, project_id, category, title, content, aliases, tags, created_at, updated_at)
     VALUES (@id, @project_id, @category, @title, @content, @aliases, @tags, @created_at, @updated_at)`,
  ).run(row);
  return rowToRecord(row);
}

export interface UpdateWorldEntryInput {
  id: string;
  category?: string;
  title?: string;
  content?: string;
  aliases?: string[];
  tags?: string[];
}

export function updateWorldEntry(
  db: DB,
  input: UpdateWorldEntryInput,
): WorldEntryRecord {
  const existing = db
    .prepare(`SELECT * FROM world_entries WHERE id = ?`)
    .get(input.id) as WorldEntryRow | undefined;
  if (!existing) throw new Error(`WorldEntry not found: ${input.id}`);
  const next: WorldEntryRow = {
    ...existing,
    category: input.category ?? existing.category,
    title: input.title ?? existing.title,
    content: input.content ?? existing.content,
    aliases:
      input.aliases !== undefined ? JSON.stringify(input.aliases) : existing.aliases,
    tags: input.tags !== undefined ? JSON.stringify(input.tags) : existing.tags,
    updated_at: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE world_entries SET
       category = @category,
       title = @title,
       content = @content,
       aliases = @aliases,
       tags = @tags,
       updated_at = @updated_at
     WHERE id = @id`,
  ).run(next);
  return rowToRecord(next);
}

export function getWorldEntryById(
  db: DB,
  id: string,
): WorldEntryRecord | null {
  const row = db
    .prepare(`SELECT * FROM world_entries WHERE id = ?`)
    .get(id) as WorldEntryRow | undefined;
  return row ? rowToRecord(row) : null;
}

export interface ListWorldEntriesOptions {
  projectId: string;
  category?: string;
  search?: string;
  limit?: number;
}

export function listWorldEntries(
  db: DB,
  options: ListWorldEntriesOptions,
): WorldEntryRecord[] {
  const clauses: string[] = [`project_id = ?`];
  const params: Array<string | number> = [options.projectId];
  if (options.category && options.category !== "全部") {
    clauses.push(`category = ?`);
    params.push(options.category);
  }
  if (options.search && options.search.trim().length > 0) {
    const like = `%${options.search.trim()}%`;
    clauses.push(`(title LIKE ? OR aliases LIKE ? OR tags LIKE ? OR content LIKE ?)`);
    params.push(like, like, like, like);
  }
  const limit = options.limit ?? 500;
  const sql = `SELECT * FROM world_entries
               WHERE ${clauses.join(" AND ")}
               ORDER BY updated_at DESC
               LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit) as WorldEntryRow[];
  return rows.map(rowToRecord);
}

export function deleteWorldEntry(db: DB, id: string): void {
  db.prepare(`DELETE FROM world_entries WHERE id = ?`).run(id);
}

export interface SearchWorldEntriesOptions {
  projectId: string;
  query: string;
  limit?: number;
}

/**
 * Exact-word search for dimension "worldbuilding" review.
 * Matches title or any alias via LIKE anchored on word boundaries (`"alias"`),
 * ensuring we do not match substrings of unrelated words.
 * Falls back to generic LIKE when the query has no alphanumeric chars.
 */
export function searchWorldEntries(
  db: DB,
  options: SearchWorldEntriesOptions,
): WorldEntryRecord[] {
  const query = options.query.trim();
  if (!query) return [];
  const limit = options.limit ?? 50;
  const titleLike = `%${query}%`;
  const aliasJsonLike = `%"${query.replace(/"/g, '\\"')}"%`;
  const rows = db
    .prepare(
      `SELECT *,
              CASE
                WHEN title = ? THEN 3
                WHEN aliases LIKE ? THEN 2
                WHEN title LIKE ? THEN 1
                ELSE 0
              END AS rank
       FROM world_entries
       WHERE project_id = ?
         AND (title LIKE ? OR aliases LIKE ? OR content LIKE ?)
       ORDER BY rank DESC, updated_at DESC
       LIMIT ?`,
    )
    .all(
      query,
      aliasJsonLike,
      titleLike,
      options.projectId,
      titleLike,
      aliasJsonLike,
      titleLike,
      limit,
    ) as (WorldEntryRow & { rank: number })[];
  return rows.map(rowToRecord);
}
