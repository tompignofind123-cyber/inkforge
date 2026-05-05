import type { DB } from "../db";
import type { MaterialKind, MaterialRecord } from "@inkforge/shared";

type MaterialRow = {
  id: string;
  project_id: string;
  kind: MaterialKind;
  title: string;
  content: string;
  tags: string;
  created_at: string;
  updated_at: string;
};

function parseTags(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function rowToRecord(row: MaterialRow): MaterialRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    title: row.title,
    content: row.content,
    tags: parseTags(row.tags ?? "[]"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertMaterialInput {
  id: string;
  projectId: string;
  kind: MaterialKind;
  title: string;
  content?: string;
  tags?: string[];
}

export function insertMaterial(db: DB, input: InsertMaterialInput): MaterialRecord {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO materials (id, project_id, kind, title, content, tags, created_at, updated_at)
     VALUES (@id, @project_id, @kind, @title, @content, @tags, @now, @now)`,
  ).run({
    id: input.id,
    project_id: input.projectId,
    kind: input.kind,
    title: input.title,
    content: input.content ?? "",
    tags: JSON.stringify(input.tags ?? []),
    now,
  });
  const created = getMaterial(db, input.id);
  if (!created) throw new Error("material insert failed");
  return created;
}

export function getMaterial(db: DB, id: string): MaterialRecord | null {
  const row = db.prepare(`SELECT * FROM materials WHERE id = ?`).get(id) as
    | MaterialRow
    | undefined;
  return row ? rowToRecord(row) : null;
}

export function listMaterials(
  db: DB,
  projectId: string,
  kind?: MaterialKind,
): MaterialRecord[] {
  const rows = kind
    ? (db
        .prepare(
          `SELECT * FROM materials WHERE project_id = ? AND kind = ?
           ORDER BY updated_at DESC`,
        )
        .all(projectId, kind) as MaterialRow[])
    : (db
        .prepare(
          `SELECT * FROM materials WHERE project_id = ?
           ORDER BY updated_at DESC`,
        )
        .all(projectId) as MaterialRow[]);
  return rows.map(rowToRecord);
}

export interface UpdateMaterialInput {
  id: string;
  kind?: MaterialKind;
  title?: string;
  content?: string;
  tags?: string[];
}

export function updateMaterial(db: DB, input: UpdateMaterialInput): MaterialRecord {
  const existing = getMaterial(db, input.id);
  if (!existing) throw new Error(`Material not found: ${input.id}`);

  const fields: string[] = ["updated_at = @updated_at"];
  const params: Record<string, unknown> = {
    id: input.id,
    updated_at: new Date().toISOString(),
  };
  if (input.kind !== undefined) {
    fields.push("kind = @kind");
    params.kind = input.kind;
  }
  if (input.title !== undefined) {
    fields.push("title = @title");
    params.title = input.title;
  }
  if (input.content !== undefined) {
    fields.push("content = @content");
    params.content = input.content;
  }
  if (input.tags !== undefined) {
    fields.push("tags = @tags");
    params.tags = JSON.stringify(input.tags);
  }
  db.prepare(`UPDATE materials SET ${fields.join(", ")} WHERE id = @id`).run(params);
  const updated = getMaterial(db, input.id);
  if (!updated) throw new Error("material update failed");
  return updated;
}

export function deleteMaterial(db: DB, id: string): void {
  db.prepare(`DELETE FROM materials WHERE id = ?`).run(id);
}
