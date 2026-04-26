import type { DB } from "../db";
import type { ProjectRecord } from "@inkforge/shared";

type ProjectRow = {
  id: string;
  name: string;
  path: string;
  created_at: string;
  daily_goal: number;
  last_opened: string | null;
};

function rowToRecord(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    createdAt: row.created_at,
    dailyGoal: row.daily_goal,
    lastOpened: row.last_opened,
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
  return {
    id: input.id,
    name: input.name,
    path: input.path,
    createdAt,
    dailyGoal: input.dailyGoal ?? 1000,
    lastOpened: null,
  };
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

export function deleteProject(db: DB, id: string): void {
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
}
