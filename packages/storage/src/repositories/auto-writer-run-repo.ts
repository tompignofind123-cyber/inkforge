import type { DB } from "../db";
import type {
  AutoWriterAgentBinding,
  AutoWriterCorrectionEntry,
  AutoWriterRunRecord,
  AutoWriterRunStatus,
} from "@inkforge/shared";
import { randomUUID } from "crypto";

type Row = {
  id: string;
  project_id: string;
  chapter_id: string;
  status: AutoWriterRunStatus;
  user_ideas: string;
  user_corrections: string;
  agents_config: string;
  outline_json: string | null;
  stats_json: string;
  last_snapshot_id: string | null;
  created_at: string;
  updated_at: string;
};

function safeParse<T>(input: string | null | undefined, fallback: T): T {
  if (!input) return fallback;
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function rowToRecord(row: Row): AutoWriterRunRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    chapterId: row.chapter_id,
    status: row.status,
    userIdeas: row.user_ideas,
    userCorrections: safeParse<AutoWriterCorrectionEntry[]>(row.user_corrections, []),
    agentsConfig: safeParse<AutoWriterAgentBinding[]>(row.agents_config, []),
    outlineJson: row.outline_json,
    statsJson: safeParse<Record<string, unknown>>(row.stats_json, {}),
    lastSnapshotId: row.last_snapshot_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateAutoWriterRunInput {
  id?: string;
  projectId: string;
  chapterId: string;
  userIdeas: string;
  agentsConfig: AutoWriterAgentBinding[];
  status?: AutoWriterRunStatus;
}

export function insertAutoWriterRun(
  db: DB,
  input: CreateAutoWriterRunInput,
): AutoWriterRunRecord {
  const id = input.id ?? randomUUID();
  const now = new Date().toISOString();
  const status: AutoWriterRunStatus = input.status ?? "running";
  db.prepare(
    `INSERT INTO auto_writer_runs
       (id, project_id, chapter_id, status, user_ideas, user_corrections,
        agents_config, outline_json, stats_json, last_snapshot_id,
        created_at, updated_at)
     VALUES (@id, @project_id, @chapter_id, @status, @user_ideas, @user_corrections,
             @agents_config, NULL, '{}', NULL, @created_at, @updated_at)`,
  ).run({
    id,
    project_id: input.projectId,
    chapter_id: input.chapterId,
    status,
    user_ideas: input.userIdeas,
    user_corrections: "[]",
    agents_config: JSON.stringify(input.agentsConfig ?? []),
    created_at: now,
    updated_at: now,
  });
  return {
    id,
    projectId: input.projectId,
    chapterId: input.chapterId,
    status,
    userIdeas: input.userIdeas,
    userCorrections: [],
    agentsConfig: input.agentsConfig ?? [],
    outlineJson: null,
    statsJson: {},
    lastSnapshotId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function getAutoWriterRun(
  db: DB,
  id: string,
): AutoWriterRunRecord | null {
  const row = db
    .prepare(`SELECT * FROM auto_writer_runs WHERE id = ?`)
    .get(id) as Row | undefined;
  return row ? rowToRecord(row) : null;
}

export interface UpdateAutoWriterRunPatch {
  status?: AutoWriterRunStatus;
  outlineJson?: string | null;
  statsJson?: Record<string, unknown>;
  lastSnapshotId?: string | null;
}

export function updateAutoWriterRun(
  db: DB,
  id: string,
  patch: UpdateAutoWriterRunPatch,
): AutoWriterRunRecord {
  const existing = getAutoWriterRun(db, id);
  if (!existing) throw new Error(`AutoWriter run not found: ${id}`);
  const now = new Date().toISOString();
  const next: AutoWriterRunRecord = {
    ...existing,
    status: patch.status ?? existing.status,
    outlineJson:
      patch.outlineJson === undefined ? existing.outlineJson : patch.outlineJson,
    statsJson: patch.statsJson ?? existing.statsJson,
    lastSnapshotId:
      patch.lastSnapshotId === undefined ? existing.lastSnapshotId : patch.lastSnapshotId,
    updatedAt: now,
  };
  db.prepare(
    `UPDATE auto_writer_runs
        SET status = @status,
            outline_json = @outline_json,
            stats_json = @stats_json,
            last_snapshot_id = @last_snapshot_id,
            updated_at = @updated_at
      WHERE id = @id`,
  ).run({
    id,
    status: next.status,
    outline_json: next.outlineJson,
    stats_json: JSON.stringify(next.statsJson),
    last_snapshot_id: next.lastSnapshotId,
    updated_at: now,
  });
  return next;
}

export function appendAutoWriterCorrection(
  db: DB,
  id: string,
  correction: AutoWriterCorrectionEntry,
): AutoWriterRunRecord {
  const existing = getAutoWriterRun(db, id);
  if (!existing) throw new Error(`AutoWriter run not found: ${id}`);
  const next = [...existing.userCorrections, correction];
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE auto_writer_runs
        SET user_corrections = @user_corrections, updated_at = @updated_at
      WHERE id = @id`,
  ).run({
    id,
    user_corrections: JSON.stringify(next),
    updated_at: now,
  });
  return { ...existing, userCorrections: next, updatedAt: now };
}

export interface ListAutoWriterRunsOptions {
  limit?: number;
  status?: AutoWriterRunStatus;
}

export function listAutoWriterRunsByChapter(
  db: DB,
  chapterId: string,
  options: ListAutoWriterRunsOptions = {},
): AutoWriterRunRecord[] {
  const limit = Math.max(1, Math.min(200, options.limit ?? 50));
  if (options.status) {
    const rows = db
      .prepare(
        `SELECT * FROM auto_writer_runs
          WHERE chapter_id = ? AND status = ?
          ORDER BY created_at DESC LIMIT ?`,
      )
      .all(chapterId, options.status, limit) as Row[];
    return rows.map(rowToRecord);
  }
  const rows = db
    .prepare(
      `SELECT * FROM auto_writer_runs
        WHERE chapter_id = ?
        ORDER BY created_at DESC LIMIT ?`,
    )
    .all(chapterId, limit) as Row[];
  return rows.map(rowToRecord);
}

export function listAutoWriterRunsByProject(
  db: DB,
  projectId: string,
  options: ListAutoWriterRunsOptions = {},
): AutoWriterRunRecord[] {
  const limit = Math.max(1, Math.min(200, options.limit ?? 50));
  const rows = db
    .prepare(
      `SELECT * FROM auto_writer_runs
        WHERE project_id = ?
        ORDER BY created_at DESC LIMIT ?`,
    )
    .all(projectId, limit) as Row[];
  return rows.map(rowToRecord);
}

/** 找当前章节正在跑或暂停的 run（最多一个）。 */
export function getActiveAutoWriterRun(
  db: DB,
  chapterId: string,
): AutoWriterRunRecord | null {
  const row = db
    .prepare(
      `SELECT * FROM auto_writer_runs
        WHERE chapter_id = ? AND status IN ('running','paused')
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get(chapterId) as Row | undefined;
  return row ? rowToRecord(row) : null;
}

export function deleteAutoWriterRun(db: DB, id: string): void {
  db.prepare(`DELETE FROM auto_writer_runs WHERE id = ?`).run(id);
}
