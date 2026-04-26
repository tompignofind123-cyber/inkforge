import type { DB } from "../db";
import type { ResearchNoteRecord, ResearchProvider } from "@inkforge/shared";

type ResearchNoteRow = {
  id: string;
  project_id: string;
  topic: string;
  source_url: string | null;
  source_title: string | null;
  source_provider: string;
  excerpt: string;
  note: string;
  tags: string;
  created_at: string;
  updated_at: string;
};

const KNOWN_PROVIDERS: ResearchProvider[] = [
  "tavily",
  "bing",
  "serpapi",
  "llm-fallback",
  "manual",
];

function normalizeProvider(value: string): ResearchProvider {
  return (KNOWN_PROVIDERS as string[]).includes(value)
    ? (value as ResearchProvider)
    : "manual";
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x));
  } catch {
    // fallthrough
  }
  return [];
}

function rowToRecord(row: ResearchNoteRow): ResearchNoteRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    topic: row.topic,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    sourceProvider: normalizeProvider(row.source_provider),
    excerpt: row.excerpt,
    note: row.note,
    tags: parseTags(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertResearchNoteInput {
  id: string;
  projectId: string;
  topic: string;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  sourceProvider: ResearchProvider;
  excerpt?: string;
  note?: string;
  tags?: string[];
}

export function insertResearchNote(
  db: DB,
  input: InsertResearchNoteInput,
): ResearchNoteRecord {
  const now = new Date().toISOString();
  const row: ResearchNoteRow = {
    id: input.id,
    project_id: input.projectId,
    topic: input.topic.trim(),
    source_url: input.sourceUrl ?? null,
    source_title: input.sourceTitle ?? null,
    source_provider: input.sourceProvider,
    excerpt: input.excerpt ?? "",
    note: input.note ?? "",
    tags: JSON.stringify(input.tags ?? []),
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO research_notes
       (id, project_id, topic, source_url, source_title, source_provider,
        excerpt, note, tags, created_at, updated_at)
     VALUES (@id, @project_id, @topic, @source_url, @source_title, @source_provider,
             @excerpt, @note, @tags, @created_at, @updated_at)`,
  ).run(row);
  return rowToRecord(row);
}

export interface UpdateResearchNoteInput {
  id: string;
  topic?: string;
  note?: string;
  tags?: string[];
}

export function updateResearchNote(
  db: DB,
  input: UpdateResearchNoteInput,
): ResearchNoteRecord {
  const existing = db
    .prepare(`SELECT * FROM research_notes WHERE id = ?`)
    .get(input.id) as ResearchNoteRow | undefined;
  if (!existing) throw new Error(`ResearchNote not found: ${input.id}`);
  const next: ResearchNoteRow = {
    ...existing,
    topic: input.topic !== undefined ? input.topic.trim() : existing.topic,
    note: input.note !== undefined ? input.note : existing.note,
    tags: input.tags !== undefined ? JSON.stringify(input.tags) : existing.tags,
    updated_at: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE research_notes SET topic = @topic, note = @note, tags = @tags,
     updated_at = @updated_at WHERE id = @id`,
  ).run(next);
  return rowToRecord(next);
}

export function getResearchNoteById(
  db: DB,
  id: string,
): ResearchNoteRecord | null {
  const row = db
    .prepare(`SELECT * FROM research_notes WHERE id = ?`)
    .get(id) as ResearchNoteRow | undefined;
  return row ? rowToRecord(row) : null;
}

export interface ListResearchNotesOptions {
  projectId: string;
  topic?: string;
  limit?: number;
}

export function listResearchNotes(
  db: DB,
  options: ListResearchNotesOptions,
): ResearchNoteRecord[] {
  const clauses: string[] = [`project_id = ?`];
  const params: Array<string | number> = [options.projectId];
  if (options.topic) {
    clauses.push(`topic = ?`);
    params.push(options.topic);
  }
  const limit = options.limit ?? 200;
  const sql = `SELECT * FROM research_notes
               WHERE ${clauses.join(" AND ")}
               ORDER BY created_at DESC
               LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit) as ResearchNoteRow[];
  return rows.map(rowToRecord);
}

export function deleteResearchNote(db: DB, id: string): void {
  db.prepare(`DELETE FROM research_notes WHERE id = ?`).run(id);
}
