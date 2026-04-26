import type { DB } from "../db";
import type { NovelCharacterRecord } from "@inkforge/shared";

type NovelCharacterRow = {
  id: string;
  project_id: string;
  name: string;
  persona: string | null;
  traits: string;
  backstory: string;
  relations: string;
  linked_tavern_card_id: string | null;
  created_at: string;
  updated_at: string;
};

function safeParseObject(value: string, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fallthrough
  }
  return fallback;
}

function safeParseRelations(value: string): NovelCharacterRecord["relations"] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (x) => x && typeof x === "object" && typeof (x as { otherId?: unknown }).otherId === "string",
        )
        .map((x) => ({
          otherId: String((x as { otherId: string }).otherId),
          label: typeof (x as { label?: unknown }).label === "string" ? (x as { label: string }).label : "",
        }));
    }
  } catch {
    // fallthrough
  }
  return [];
}

function rowToRecord(row: NovelCharacterRow): NovelCharacterRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    persona: row.persona,
    traits: safeParseObject(row.traits),
    backstory: row.backstory,
    relations: safeParseRelations(row.relations),
    linkedTavernCardId: row.linked_tavern_card_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateNovelCharacterRow {
  id: string;
  projectId: string;
  name: string;
  persona?: string | null;
  traits?: Record<string, unknown>;
  backstory?: string;
  relations?: NovelCharacterRecord["relations"];
  linkedTavernCardId?: string | null;
}

export function insertNovelCharacter(
  db: DB,
  input: CreateNovelCharacterRow,
): NovelCharacterRecord {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO characters
       (id, project_id, name, persona, traits, backstory, relations,
        linked_tavern_card_id, created_at, updated_at)
     VALUES (@id, @project_id, @name, @persona, @traits, @backstory, @relations,
             @linked_tavern_card_id, @created_at, @updated_at)`,
  ).run({
    id: input.id,
    project_id: input.projectId,
    name: input.name,
    persona: input.persona ?? null,
    traits: JSON.stringify(input.traits ?? {}),
    backstory: input.backstory ?? "",
    relations: JSON.stringify(input.relations ?? []),
    linked_tavern_card_id: input.linkedTavernCardId ?? null,
    created_at: now,
    updated_at: now,
  });
  return {
    id: input.id,
    projectId: input.projectId,
    name: input.name,
    persona: input.persona ?? null,
    traits: input.traits ?? {},
    backstory: input.backstory ?? "",
    relations: input.relations ?? [],
    linkedTavernCardId: input.linkedTavernCardId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface UpdateNovelCharacterRow {
  id: string;
  name?: string;
  persona?: string | null;
  traits?: Record<string, unknown>;
  backstory?: string;
  relations?: NovelCharacterRecord["relations"];
  linkedTavernCardId?: string | null;
}

export function updateNovelCharacter(
  db: DB,
  input: UpdateNovelCharacterRow,
): NovelCharacterRecord {
  const existing = db
    .prepare(`SELECT * FROM characters WHERE id = ?`)
    .get(input.id) as NovelCharacterRow | undefined;
  if (!existing) throw new Error(`NovelCharacter not found: ${input.id}`);
  const next: NovelCharacterRow = {
    ...existing,
    name: input.name ?? existing.name,
    persona: input.persona === undefined ? existing.persona : input.persona,
    traits: input.traits !== undefined ? JSON.stringify(input.traits) : existing.traits,
    backstory: input.backstory ?? existing.backstory,
    relations:
      input.relations !== undefined ? JSON.stringify(input.relations) : existing.relations,
    linked_tavern_card_id:
      input.linkedTavernCardId === undefined
        ? existing.linked_tavern_card_id
        : input.linkedTavernCardId,
    updated_at: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE characters SET
       name = @name, persona = @persona, traits = @traits, backstory = @backstory,
       relations = @relations, linked_tavern_card_id = @linked_tavern_card_id,
       updated_at = @updated_at
     WHERE id = @id`,
  ).run(next);
  return rowToRecord(next);
}

export function getNovelCharacterById(db: DB, id: string): NovelCharacterRecord | null {
  const row = db
    .prepare(`SELECT * FROM characters WHERE id = ?`)
    .get(id) as NovelCharacterRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function listNovelCharacters(db: DB, projectId: string): NovelCharacterRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM characters WHERE project_id = ? ORDER BY updated_at DESC, name ASC`,
    )
    .all(projectId) as NovelCharacterRow[];
  return rows.map(rowToRecord);
}

export function deleteNovelCharacter(db: DB, id: string): void {
  const tx = db.transaction((charId: string) => {
    db.prepare(
      `UPDATE tavern_cards SET linked_novel_character_id = NULL, updated_at = ? WHERE linked_novel_character_id = ?`,
    ).run(new Date().toISOString(), charId);
    db.prepare(`DELETE FROM characters WHERE id = ?`).run(charId);
  });
  tx(id);
}

export function clearNovelCharacterLink(db: DB, characterId: string): void {
  db.prepare(
    `UPDATE characters SET linked_tavern_card_id = NULL, updated_at = ? WHERE id = ?`,
  ).run(new Date().toISOString(), characterId);
}
