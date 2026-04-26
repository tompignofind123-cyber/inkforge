import type { DB } from "../db";
import type {
  ReviewReportRecord,
  ReviewReportStatus,
  ReviewReportSummary,
} from "@inkforge/shared";

type ReviewReportRow = {
  id: string;
  project_id: string;
  range_kind: string;
  range_ids: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  summary: string;
  error: string | null;
};

const EMPTY_SUMMARY: ReviewReportSummary = {
  totals: { info: 0, warn: 0, error: 0 },
  perDimension: [],
  perChapter: [],
};

function normalizeRangeKind(value: string): "book" | "chapter" | "range" {
  return value === "chapter" || value === "range" ? value : "book";
}

function normalizeStatus(value: string): ReviewReportStatus {
  switch (value) {
    case "pending":
    case "running":
    case "completed":
    case "failed":
    case "cancelled":
      return value;
    default:
      return "pending";
  }
}

function parseRangeIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x));
  } catch {
    // fallthrough
  }
  return [];
}

function parseSummary(raw: string): ReviewReportSummary {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        totals: {
          info: Number(parsed.totals?.info ?? 0),
          warn: Number(parsed.totals?.warn ?? 0),
          error: Number(parsed.totals?.error ?? 0),
        },
        perDimension: Array.isArray(parsed.perDimension)
          ? parsed.perDimension
              .filter((x: unknown) => x && typeof x === "object")
              .map((x: { dimensionId: string; count: number }) => ({
                dimensionId: String(x.dimensionId ?? ""),
                count: Number(x.count ?? 0),
              }))
          : [],
        perChapter: Array.isArray(parsed.perChapter)
          ? parsed.perChapter
              .filter((x: unknown) => x && typeof x === "object")
              .map((x: { chapterId: string; count: number }) => ({
                chapterId: String(x.chapterId ?? ""),
                count: Number(x.count ?? 0),
              }))
          : [],
        usage: parsed.usage,
      };
    }
  } catch {
    // fallthrough
  }
  return { ...EMPTY_SUMMARY };
}

function rowToRecord(row: ReviewReportRow): ReviewReportRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    rangeKind: normalizeRangeKind(row.range_kind),
    rangeIds: parseRangeIds(row.range_ids),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: normalizeStatus(row.status),
    summary: parseSummary(row.summary),
    error: row.error,
  };
}

export interface InsertReviewReportInput {
  id: string;
  projectId: string;
  rangeKind: "book" | "chapter" | "range";
  rangeIds: string[];
}

export function insertReviewReport(
  db: DB,
  input: InsertReviewReportInput,
): ReviewReportRecord {
  const now = new Date().toISOString();
  const row: ReviewReportRow = {
    id: input.id,
    project_id: input.projectId,
    range_kind: input.rangeKind,
    range_ids: JSON.stringify(input.rangeIds),
    started_at: now,
    finished_at: null,
    status: "running",
    summary: JSON.stringify(EMPTY_SUMMARY),
    error: null,
  };
  db.prepare(
    `INSERT INTO review_reports
       (id, project_id, range_kind, range_ids, started_at, finished_at,
        status, summary, error)
     VALUES (@id, @project_id, @range_kind, @range_ids, @started_at, @finished_at,
             @status, @summary, @error)`,
  ).run(row);
  return rowToRecord(row);
}

export interface UpdateReviewReportInput {
  id: string;
  status?: ReviewReportStatus;
  summary?: ReviewReportSummary;
  error?: string | null;
  finishedAt?: string | null;
}

export function updateReviewReport(
  db: DB,
  input: UpdateReviewReportInput,
): ReviewReportRecord {
  const existing = db
    .prepare(`SELECT * FROM review_reports WHERE id = ?`)
    .get(input.id) as ReviewReportRow | undefined;
  if (!existing) throw new Error(`ReviewReport not found: ${input.id}`);
  const next: ReviewReportRow = {
    ...existing,
    status: input.status ?? normalizeStatus(existing.status),
    summary:
      input.summary !== undefined ? JSON.stringify(input.summary) : existing.summary,
    error: input.error !== undefined ? input.error : existing.error,
    finished_at:
      input.finishedAt !== undefined ? input.finishedAt : existing.finished_at,
  };
  db.prepare(
    `UPDATE review_reports SET
       status = @status,
       summary = @summary,
       error = @error,
       finished_at = @finished_at
     WHERE id = @id`,
  ).run(next);
  return rowToRecord(next);
}

export function getReviewReportById(
  db: DB,
  id: string,
): ReviewReportRecord | null {
  const row = db
    .prepare(`SELECT * FROM review_reports WHERE id = ?`)
    .get(id) as ReviewReportRow | undefined;
  return row ? rowToRecord(row) : null;
}

export interface ListReviewReportsOptions {
  projectId: string;
  limit?: number;
}

export function listReviewReports(
  db: DB,
  options: ListReviewReportsOptions,
): ReviewReportRecord[] {
  const limit = options.limit ?? 100;
  const rows = db
    .prepare(
      `SELECT * FROM review_reports
       WHERE project_id = ?
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(options.projectId, limit) as ReviewReportRow[];
  return rows.map(rowToRecord);
}

export function deleteReviewReport(db: DB, id: string): void {
  db.prepare(`DELETE FROM review_reports WHERE id = ?`).run(id);
}
