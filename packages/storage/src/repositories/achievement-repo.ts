import type { DB } from "../db";
import type {
  AchievementUnlockedRecord,
  AchievementId,
} from "@inkforge/shared";

type Row = {
  id: string;
  project_id: string;
  achievement_id: string;
  unlocked_at: string;
  metadata: string;
};

function rowToRecord(row: Row): AchievementUnlockedRecord {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = row.metadata ? JSON.parse(row.metadata) : {};
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    projectId: row.project_id,
    achievementId: row.achievement_id as AchievementId,
    unlockedAt: row.unlocked_at,
    metadata,
  };
}

export interface InsertAchievementInput {
  id: string;
  projectId: string;
  achievementId: AchievementId;
  metadata?: Record<string, unknown>;
}

/**
 * 解锁一个成就。如果该 (project_id, achievement_id) 已存在，
 * 返回 null（幂等：成就只能解锁一次）。
 */
export function insertAchievement(
  db: DB,
  input: InsertAchievementInput,
): AchievementUnlockedRecord | null {
  const unlockedAt = new Date().toISOString();
  const metadataJson = JSON.stringify(input.metadata ?? {});
  const existing = db
    .prepare(
      `SELECT * FROM achievements_unlocked WHERE project_id = ? AND achievement_id = ?`,
    )
    .get(input.projectId, input.achievementId) as Row | undefined;
  if (existing) return null;
  db.prepare(
    `INSERT INTO achievements_unlocked
       (id, project_id, achievement_id, unlocked_at, metadata)
     VALUES (@id, @project_id, @achievement_id, @unlocked_at, @metadata)`,
  ).run({
    id: input.id,
    project_id: input.projectId,
    achievement_id: input.achievementId,
    unlocked_at: unlockedAt,
    metadata: metadataJson,
  });
  return {
    id: input.id,
    projectId: input.projectId,
    achievementId: input.achievementId,
    unlockedAt,
    metadata: input.metadata ?? {},
  };
}

export function listAchievements(
  db: DB,
  projectId: string,
): AchievementUnlockedRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM achievements_unlocked
       WHERE project_id = ?
       ORDER BY unlocked_at DESC`,
    )
    .all(projectId) as Row[];
  return rows.map(rowToRecord);
}

export function isAchievementUnlocked(
  db: DB,
  projectId: string,
  achievementId: AchievementId,
): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM achievements_unlocked
       WHERE project_id = ? AND achievement_id = ?`,
    )
    .get(projectId, achievementId);
  return Boolean(row);
}

export function countAchievements(db: DB, projectId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM achievements_unlocked WHERE project_id = ?`,
    )
    .get(projectId) as { n: number };
  return row.n;
}
