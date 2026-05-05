import { randomUUID } from "node:crypto";
import type { DB } from "../db";
import type {
  SampleChunkRecord,
  SampleLibRecord,
} from "@inkforge/shared";

interface LibRow {
  id: string;
  project_id: string;
  title: string;
  author: string | null;
  notes: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

interface ChunkRow {
  id: string;
  lib_id: string;
  ordinal: number;
  chapter_title: string | null;
  text: string;
}

const SELECT_LIBS = `
  SELECT
    l.id              AS id,
    l.project_id      AS project_id,
    l.title           AS title,
    l.author          AS author,
    l.notes           AS notes,
    l.created_at      AS created_at,
    l.updated_at      AS updated_at,
    (SELECT COUNT(*) FROM sample_chunks c WHERE c.lib_id = l.id) AS chunk_count
  FROM sample_libs l
`;

function toLibRecord(row: LibRow): SampleLibRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    author: row.author,
    notes: row.notes,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSampleLibs(db: DB, projectId: string): SampleLibRecord[] {
  const rows = db
    .prepare(`${SELECT_LIBS} WHERE l.project_id = ? ORDER BY l.updated_at DESC`)
    .all(projectId) as LibRow[];
  return rows.map(toLibRecord);
}

export function getSampleLib(db: DB, libId: string): SampleLibRecord | null {
  const row = db.prepare(`${SELECT_LIBS} WHERE l.id = ?`).get(libId) as
    | LibRow
    | undefined;
  return row ? toLibRecord(row) : null;
}

export function createSampleLib(
  db: DB,
  input: {
    projectId: string;
    title: string;
    author?: string | null;
    notes?: string | null;
    chunks?: Array<{ ordinal: number; chapterTitle?: string | null; text: string }>;
  },
): SampleLibRecord {
  const id = randomUUID();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO sample_libs (id, project_id, title, author, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.projectId,
      input.title,
      input.author ?? null,
      input.notes ?? null,
      now,
      now,
    );
    if (input.chunks && input.chunks.length > 0) {
      insertSampleChunks(db, id, input.chunks);
    }
  });
  tx();
  const lib = getSampleLib(db, id);
  if (!lib) throw new Error("sample-lib insert failed");
  return lib;
}

export function deleteSampleLib(db: DB, libId: string): void {
  // CASCADE FK clears sample_chunks automatically.
  db.prepare(`DELETE FROM sample_libs WHERE id = ?`).run(libId);
}

export function insertSampleChunks(
  db: DB,
  libId: string,
  chunks: Array<{ ordinal: number; chapterTitle?: string | null; text: string }>,
): number {
  const stmt = db.prepare(
    `INSERT INTO sample_chunks (id, lib_id, ordinal, chapter_title, text)
     VALUES (?, ?, ?, ?, ?)`,
  );
  let inserted = 0;
  const tx = db.transaction(() => {
    for (const c of chunks) {
      const text = (c.text ?? "").trim();
      if (!text) continue;
      stmt.run(randomUUID(), libId, c.ordinal, c.chapterTitle ?? null, text);
      inserted += 1;
    }
    if (inserted > 0) {
      db.prepare(`UPDATE sample_libs SET updated_at = ? WHERE id = ?`).run(
        new Date().toISOString(),
        libId,
      );
    }
  });
  tx();
  return inserted;
}

export function listSampleChunks(
  db: DB,
  libId: string,
): SampleChunkRecord[] {
  const rows = db
    .prepare(
      `SELECT id, lib_id, ordinal, chapter_title, text
       FROM sample_chunks WHERE lib_id = ? ORDER BY ordinal ASC`,
    )
    .all(libId) as ChunkRow[];
  return rows.map((r) => ({
    id: r.id,
    libId: r.lib_id,
    ordinal: r.ordinal,
    chapterTitle: r.chapter_title,
    text: r.text,
  }));
}
