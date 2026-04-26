import type { DB } from "../db";
import type { DailyProgressRecord, DailySummaryRecord } from "@inkforge/shared";

type DailyLogRow = {
  date: string;
  project_id: string;
  words_added: number;
  goal_hit: number;
  summary: string | null;
  summary_provider_id: string | null;
  summary_model: string | null;
  generated_at: string | null;
};

export function todayKey(date?: Date): string {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDailyWords(
  db: DB,
  projectId: string,
  wordsDelta: number,
  date = todayKey(),
): void {
  if (wordsDelta === 0) return;
  db.prepare(
    `INSERT INTO daily_logs (date, project_id, words_added, goal_hit, summary)
     VALUES (@date, @project_id, @words_added, 0, NULL)
     ON CONFLICT(date, project_id) DO UPDATE SET
       words_added = MAX(0, daily_logs.words_added + @words_added)`,
  ).run({ date, project_id: projectId, words_added: wordsDelta });
}

export function markGoalHit(db: DB, projectId: string, date: string, hit: boolean): void {
  db.prepare(
    `UPDATE daily_logs SET goal_hit = @hit WHERE date = @date AND project_id = @project_id`,
  ).run({ date, project_id: projectId, hit: hit ? 1 : 0 });
}

export function getDailyLog(
  db: DB,
  projectId: string,
  date = todayKey(),
): DailyLogRow | null {
  const row = db
    .prepare(`SELECT * FROM daily_logs WHERE date = ? AND project_id = ?`)
    .get(date, projectId) as DailyLogRow | undefined;
  return row ?? null;
}

export function getDailyProgress(
  db: DB,
  projectId: string,
  goal: number,
  date = todayKey(),
): DailyProgressRecord {
  const row = getDailyLog(db, projectId, date);
  const wordsAdded = row?.words_added ?? 0;
  const goalHit = wordsAdded >= goal;
  if (row && goalHit && row.goal_hit !== 1) {
    markGoalHit(db, projectId, date, true);
  }
  return { date, projectId, wordsAdded, goal, goalHit };
}

function rowToSummary(
  row: DailyLogRow,
  goal: number,
): DailySummaryRecord {
  const wordsAdded = row.words_added;
  return {
    date: row.date,
    projectId: row.project_id,
    wordsAdded,
    goal,
    goalHit: wordsAdded >= goal,
    summary: row.summary,
    summaryProviderId: row.summary_provider_id,
    summaryModel: row.summary_model,
    generatedAt: row.generated_at,
  };
}

export function getDailySummary(
  db: DB,
  projectId: string,
  date: string,
  goal: number,
): DailySummaryRecord | null {
  const row = getDailyLog(db, projectId, date);
  if (!row) return null;
  return rowToSummary(row, goal);
}

export interface UpsertDailySummaryInput {
  date: string;
  projectId: string;
  summary: string;
  summaryProviderId?: string | null;
  summaryModel?: string | null;
  generatedAt?: string;
}

export function upsertDailySummary(
  db: DB,
  input: UpsertDailySummaryInput,
  goal: number,
): DailySummaryRecord {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const info = db
    .prepare(
      `UPDATE daily_logs
       SET summary = @summary,
           summary_provider_id = @summary_provider_id,
           summary_model = @summary_model,
           generated_at = @generated_at
       WHERE date = @date AND project_id = @project_id`,
    )
    .run({
      date: input.date,
      project_id: input.projectId,
      summary: input.summary,
      summary_provider_id: input.summaryProviderId ?? null,
      summary_model: input.summaryModel ?? null,
      generated_at: generatedAt,
    });
  if (info.changes === 0) {
    db.prepare(
      `INSERT INTO daily_logs
         (date, project_id, words_added, goal_hit, summary,
          summary_provider_id, summary_model, generated_at)
       VALUES (@date, @project_id, 0, 0, @summary,
               @summary_provider_id, @summary_model, @generated_at)`,
    ).run({
      date: input.date,
      project_id: input.projectId,
      summary: input.summary,
      summary_provider_id: input.summaryProviderId ?? null,
      summary_model: input.summaryModel ?? null,
      generated_at: generatedAt,
    });
  }
  const row = getDailyLog(db, input.projectId, input.date);
  if (!row) throw new Error(`daily_logs row missing after upsert: ${input.date}`);
  return rowToSummary(row, goal);
}

export interface ListDailySummariesOptions {
  projectId: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export function listDailySummaries(
  db: DB,
  options: ListDailySummariesOptions,
  goal: number,
): DailySummaryRecord[] {
  const clauses: string[] = [`project_id = ?`];
  const params: Array<string | number> = [options.projectId];
  if (options.startDate) {
    clauses.push(`date >= ?`);
    params.push(options.startDate);
  }
  if (options.endDate) {
    clauses.push(`date <= ?`);
    params.push(options.endDate);
  }
  const limit = options.limit ?? 60;
  const sql = `SELECT * FROM daily_logs
               WHERE ${clauses.join(" AND ")}
               ORDER BY date DESC
               LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit) as DailyLogRow[];
  return rows.map((row) => rowToSummary(row, goal));
}
