import type { DB } from "../db";
import type { ProjectRecord } from "@inkforge/shared";

type ProjectRow = {
  id: string;
  name: string;
  path: string;
  created_at: string;
  daily_goal: number;
  last_opened: string | null;
  synopsis: string;
  genre: string;
  sub_genre: string;
  tags: string;
  master_outline: string;
  pre_refine_master_outline: string | null;
  global_worldview: string;
};

function parseTags(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function rowToRecord(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    createdAt: row.created_at,
    dailyGoal: row.daily_goal,
    lastOpened: row.last_opened,
    synopsis: row.synopsis ?? "",
    genre: row.genre ?? "",
    subGenre: row.sub_genre ?? "",
    tags: parseTags(row.tags ?? "[]"),
    masterOutline: row.master_outline ?? "",
    preRefineMasterOutline: row.pre_refine_master_outline,
    globalWorldview: row.global_worldview ?? "",
  };
}

export interface CreateProjectRow {
  id: string;
  name: string;
  path: string;
  dailyGoal?: number;
}

export function insertProject(db: DB, input: CreateProjectRow): ProjectRecord {
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, name, path, created_at, daily_goal, last_opened)
     VALUES (@id, @name, @path, @created_at, @daily_goal, NULL)`,
  ).run({
    id: input.id,
    name: input.name,
    path: input.path,
    created_at: createdAt,
    daily_goal: input.dailyGoal ?? 1000,
  });
  const created = getProject(db, input.id);
  if (!created) throw new Error("project insert failed");
  return created;
}

export function listProjects(db: DB): ProjectRecord[] {
  const rows = db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all() as ProjectRow[];
  return rows.map(rowToRecord);
}

export function getProject(db: DB, id: string): ProjectRecord | null {
  const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as ProjectRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function touchProject(db: DB, id: string): void {
  db.prepare(`UPDATE projects SET last_opened = ? WHERE id = ?`).run(new Date().toISOString(), id);
}

export interface UpdateProjectInput {
  id: string;
  name?: string;
  dailyGoal?: number;
}

export function updateProject(db: DB, input: UpdateProjectInput): ProjectRecord {
  const existing = getProject(db, input.id);
  if (!existing) throw new Error(`Project not found: ${input.id}`);
  const next: ProjectRecord = {
    ...existing,
    name: input.name?.trim() || existing.name,
    dailyGoal: input.dailyGoal ?? existing.dailyGoal,
  };
  db.prepare(
    `UPDATE projects SET name = @name, daily_goal = @daily_goal WHERE id = @id`,
  ).run({ id: next.id, name: next.name, daily_goal: next.dailyGoal });
  return next;
}

export interface UpdateProjectMetaInput {
  id: string;
  synopsis?: string;
  genre?: string;
  subGenre?: string;
  tags?: string[];
  masterOutline?: string;
  preRefineMasterOutline?: string | null;
  globalWorldview?: string;
}

/**
 * Patch creative metadata. Only fields present in input are written.
 * `tags` is JSON-stringified. `null` for preRefineMasterOutline clears the snapshot.
 */
export function updateProjectMeta(db: DB, input: UpdateProjectMetaInput): ProjectRecord {
  const existing = getProject(db, input.id);
  if (!existing) throw new Error(`Project not found: ${input.id}`);

  const fields: string[] = [];
  const params: Record<string, unknown> = { id: input.id };
  if (input.synopsis !== undefined) {
    fields.push("synopsis = @synopsis");
    params.synopsis = input.synopsis;
  }
  if (input.genre !== undefined) {
    fields.push("genre = @genre");
    params.genre = input.genre;
  }
  if (input.subGenre !== undefined) {
    fields.push("sub_genre = @sub_genre");
    params.sub_genre = input.subGenre;
  }
  if (input.tags !== undefined) {
    fields.push("tags = @tags");
    params.tags = JSON.stringify(input.tags);
  }
  if (input.masterOutline !== undefined) {
    fields.push("master_outline = @master_outline");
    params.master_outline = input.masterOutline;
  }
  if (input.preRefineMasterOutline !== undefined) {
    fields.push("pre_refine_master_outline = @pre_refine_master_outline");
    params.pre_refine_master_outline = input.preRefineMasterOutline;
  }
  if (input.globalWorldview !== undefined) {
    fields.push("global_worldview = @global_worldview");
    params.global_worldview = input.globalWorldview;
  }
  if (fields.length === 0) return existing;

  db.prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id = @id`).run(params);
  const updated = getProject(db, input.id);
  if (!updated) throw new Error("project meta update failed");
  return updated;
}

export function deleteProject(db: DB, id: string): void {
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
}
