import type { DB } from "../db";
import type {
  ReviewBuiltinId,
  ReviewDimensionKind,
  ReviewDimensionRecord,
  ReviewScope,
  ReviewSeverity,
} from "@inkforge/shared";

type ReviewDimRow = {
  id: string;
  project_id: string | null;
  name: string;
  kind: string;
  builtin_id: string | null;
  skill_id: string | null;
  scope: string;
  severity: string;
  enabled: number;
  order: number;
  created_at: string;
  updated_at: string;
};

function normalizeKind(value: string): ReviewDimensionKind {
  return value === "skill" ? "skill" : "builtin";
}

function normalizeScope(value: string): ReviewScope {
  return value === "chapter" || value === "selection" ? value : "book";
}

function normalizeSeverity(value: string): ReviewSeverity {
  return value === "info" || value === "error" ? value : "warn";
}

function normalizeBuiltin(value: string | null): ReviewBuiltinId | null {
  if (value === null) return null;
  switch (value) {
    case "consistency-character":
    case "consistency-timeline":
    case "foreshadowing":
    case "worldbuilding":
    case "style":
      return value;
    default:
      return null;
  }
}

function rowToRecord(row: ReviewDimRow): ReviewDimensionRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    kind: normalizeKind(row.kind),
    builtinId: normalizeBuiltin(row.builtin_id),
    skillId: row.skill_id,
    scope: normalizeScope(row.scope),
    severity: normalizeSeverity(row.severity),
    enabled: row.enabled === 1,
    order: row.order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UpsertReviewDimensionInput {
  id: string;
  projectId: string | null;
  name: string;
  kind: ReviewDimensionKind;
  builtinId?: ReviewBuiltinId | null;
  skillId?: string | null;
  scope?: ReviewScope;
  severity?: ReviewSeverity;
  enabled?: boolean;
  order?: number;
}

export function upsertReviewDimension(
  db: DB,
  input: UpsertReviewDimensionInput,
): ReviewDimensionRecord {
  const existing = db
    .prepare(`SELECT * FROM review_dimensions WHERE id = ?`)
    .get(input.id) as ReviewDimRow | undefined;
  const now = new Date().toISOString();
  const row: ReviewDimRow = {
    id: input.id,
    project_id: input.projectId,
    name: input.name,
    kind: input.kind,
    builtin_id: input.builtinId ?? null,
    skill_id: input.skillId ?? null,
    scope: input.scope ?? "book",
    severity: input.severity ?? "warn",
    enabled: input.enabled === false ? 0 : 1,
    order: input.order ?? 0,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO review_dimensions
       (id, project_id, name, kind, builtin_id, skill_id, scope,
        severity, enabled, "order", created_at, updated_at)
     VALUES (@id, @project_id, @name, @kind, @builtin_id, @skill_id, @scope,
             @severity, @enabled, @order, @created_at, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       project_id = excluded.project_id,
       name = excluded.name,
       kind = excluded.kind,
       builtin_id = excluded.builtin_id,
       skill_id = excluded.skill_id,
       scope = excluded.scope,
       severity = excluded.severity,
       enabled = excluded.enabled,
       "order" = excluded."order",
       updated_at = excluded.updated_at`,
  ).run(row);
  return rowToRecord(row);
}

export function listReviewDimensions(
  db: DB,
  projectId: string,
): ReviewDimensionRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM review_dimensions
       WHERE project_id IS NULL OR project_id = ?
       ORDER BY "order" ASC, created_at ASC`,
    )
    .all(projectId) as ReviewDimRow[];
  return rows.map(rowToRecord);
}

export function getReviewDimensionById(
  db: DB,
  id: string,
): ReviewDimensionRecord | null {
  const row = db
    .prepare(`SELECT * FROM review_dimensions WHERE id = ?`)
    .get(id) as ReviewDimRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function deleteReviewDimension(db: DB, id: string): void {
  db.prepare(`DELETE FROM review_dimensions WHERE id = ?`).run(id);
}

export function setReviewDimensionOrders(
  db: DB,
  projectId: string,
  orderedIds: string[],
): ReviewDimensionRecord[] {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `UPDATE review_dimensions
     SET "order" = @order, updated_at = @updated_at
     WHERE id = @id
       AND (project_id IS NULL OR project_id = @project_id)`,
  );
  const tx = db.transaction(() => {
    orderedIds.forEach((id, idx) => {
      stmt.run({
        id,
        order: idx,
        updated_at: now,
        project_id: projectId,
      });
    });
  });
  tx();
  return listReviewDimensions(db, projectId);
}
