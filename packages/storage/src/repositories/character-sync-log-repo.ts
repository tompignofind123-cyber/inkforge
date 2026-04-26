import type { DB } from "../db";
import type {
  CharacterSyncDirection,
  CharacterSyncField,
  CharacterSyncLogRecord,
} from "@inkforge/shared";

type SyncLogRow = {
  id: string;
  novel_char_id: string;
  tavern_card_id: string | null;
  field: string;
  old_value: string;
  new_value: string;
  direction: string;
  at: string;
};

function normalizeField(value: string): CharacterSyncField {
  if (value === "persona" || value === "backstory" || value === "traits") return value;
  return "persona";
}

function normalizeDirection(value: string): CharacterSyncDirection {
  if (value === "novel_to_card" || value === "card_to_novel" || value === "manual_merge") {
    return value;
  }
  return "manual_merge";
}

function rowToRecord(row: SyncLogRow): CharacterSyncLogRecord {
  return {
    id: row.id,
    novelCharId: row.novel_char_id,
    tavernCardId: row.tavern_card_id,
    field: normalizeField(row.field),
    oldValue: row.old_value,
    newValue: row.new_value,
    direction: normalizeDirection(row.direction),
    at: row.at,
  };
}

export interface InsertSyncLogInput {
  id: string;
  novelCharId: string;
  tavernCardId: string | null;
  field: CharacterSyncField;
  oldValue: string;
  newValue: string;
  direction: CharacterSyncDirection;
  at?: string;
}

export function insertSyncLog(db: DB, input: InsertSyncLogInput): CharacterSyncLogRecord {
  const at = input.at ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO character_sync_log
       (id, novel_char_id, tavern_card_id, field, old_value, new_value, direction, at)
     VALUES (@id, @novel_char_id, @tavern_card_id, @field, @old_value, @new_value, @direction, @at)`,
  ).run({
    id: input.id,
    novel_char_id: input.novelCharId,
    tavern_card_id: input.tavernCardId,
    field: input.field,
    old_value: input.oldValue,
    new_value: input.newValue,
    direction: input.direction,
    at,
  });
  return {
    id: input.id,
    novelCharId: input.novelCharId,
    tavernCardId: input.tavernCardId,
    field: input.field,
    oldValue: input.oldValue,
    newValue: input.newValue,
    direction: input.direction,
    at,
  };
}

export interface ListSyncLogsOptions {
  novelCharId?: string;
  tavernCardId?: string;
  limit?: number;
}

export function listSyncLogs(db: DB, options: ListSyncLogsOptions = {}): CharacterSyncLogRecord[] {
  const limit = options.limit ?? 100;
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (options.novelCharId) {
    conditions.push("novel_char_id = ?");
    params.push(options.novelCharId);
  }
  if (options.tavernCardId) {
    conditions.push("tavern_card_id = ?");
    params.push(options.tavernCardId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM character_sync_log ${where} ORDER BY at DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit) as SyncLogRow[];
  return rows.map(rowToRecord);
}

export function getLatestSyncLog(
  db: DB,
  novelCharId: string,
  tavernCardId: string | null,
  field: CharacterSyncField,
): CharacterSyncLogRecord | null {
  const row = (tavernCardId
    ? db
        .prepare(
          `SELECT * FROM character_sync_log
           WHERE novel_char_id = ? AND tavern_card_id = ? AND field = ?
           ORDER BY at DESC LIMIT 1`,
        )
        .get(novelCharId, tavernCardId, field)
    : db
        .prepare(
          `SELECT * FROM character_sync_log
           WHERE novel_char_id = ? AND tavern_card_id IS NULL AND field = ?
           ORDER BY at DESC LIMIT 1`,
        )
        .get(novelCharId, field)) as SyncLogRow | undefined;
  return row ? rowToRecord(row) : null;
}
