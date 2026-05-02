import type { DB } from "../db";
import type {
  CharacterLetterRecord,
  CharacterLetterTone,
} from "@inkforge/shared";

type Row = {
  id: string;
  project_id: string;
  character_id: string;
  subject: string;
  body: string;
  tone: string;
  generated_at: string;
  read: number;
  pinned: number;
  dismissed: number;
  provider_id: string | null;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
};

function rowToRecord(row: Row): CharacterLetterRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    characterId: row.character_id,
    subject: row.subject,
    body: row.body,
    tone: row.tone as CharacterLetterTone,
    generatedAt: row.generated_at,
    read: row.read === 1,
    pinned: row.pinned === 1,
    dismissed: row.dismissed === 1,
    providerId: row.provider_id ?? null,
    model: row.model ?? null,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
  };
}

export interface InsertLetterInput {
  id: string;
  projectId: string;
  characterId: string;
  subject: string;
  body: string;
  tone: CharacterLetterTone;
  providerId?: string | null;
  model?: string | null;
  tokensIn?: number;
  tokensOut?: number;
}

export function insertLetter(
  db: DB,
  input: InsertLetterInput,
): CharacterLetterRecord {
  const generatedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO character_letters
       (id, project_id, character_id, subject, body, tone, generated_at,
        read, pinned, dismissed, provider_id, model, tokens_in, tokens_out)
     VALUES (@id, @project_id, @character_id, @subject, @body, @tone, @generated_at,
             0, 0, 0, @provider_id, @model, @tokens_in, @tokens_out)`,
  ).run({
    id: input.id,
    project_id: input.projectId,
    character_id: input.characterId,
    subject: input.subject,
    body: input.body,
    tone: input.tone,
    generated_at: generatedAt,
    provider_id: input.providerId ?? null,
    model: input.model ?? null,
    tokens_in: input.tokensIn ?? 0,
    tokens_out: input.tokensOut ?? 0,
  });
  return {
    id: input.id,
    projectId: input.projectId,
    characterId: input.characterId,
    subject: input.subject,
    body: input.body,
    tone: input.tone,
    generatedAt,
    read: false,
    pinned: false,
    dismissed: false,
    providerId: input.providerId ?? null,
    model: input.model ?? null,
    tokensIn: input.tokensIn ?? 0,
    tokensOut: input.tokensOut ?? 0,
  };
}

export interface ListLettersInput {
  projectId: string;
  includeDismissed?: boolean;
  characterId?: string;
  limit?: number;
}

export function listLetters(
  db: DB,
  input: ListLettersInput,
): CharacterLetterRecord[] {
  const where: string[] = ["project_id = @projectId"];
  if (!input.includeDismissed) where.push("dismissed = 0");
  if (input.characterId) where.push("character_id = @characterId");
  const sql = `
    SELECT * FROM character_letters
    WHERE ${where.join(" AND ")}
    ORDER BY pinned DESC, generated_at DESC
    LIMIT @limit
  `;
  const rows = db.prepare(sql).all({
    projectId: input.projectId,
    characterId: input.characterId ?? null,
    limit: input.limit ?? 100,
  }) as Row[];
  return rows.map(rowToRecord);
}

export function getLetter(db: DB, id: string): CharacterLetterRecord | null {
  const row = db
    .prepare(`SELECT * FROM character_letters WHERE id = ?`)
    .get(id) as Row | undefined;
  return row ? rowToRecord(row) : null;
}

export function markLetterRead(db: DB, id: string, read: boolean): void {
  db.prepare(`UPDATE character_letters SET read = ? WHERE id = ?`).run(
    read ? 1 : 0,
    id,
  );
}

export function pinLetter(db: DB, id: string, pinned: boolean): void {
  db.prepare(`UPDATE character_letters SET pinned = ? WHERE id = ?`).run(
    pinned ? 1 : 0,
    id,
  );
}

export function dismissLetter(db: DB, id: string): void {
  db.prepare(`UPDATE character_letters SET dismissed = 1 WHERE id = ?`).run(id);
}

export function deleteLetter(db: DB, id: string): void {
  db.prepare(`DELETE FROM character_letters WHERE id = ?`).run(id);
}

export function countUnreadLetters(db: DB, projectId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM character_letters
       WHERE project_id = ? AND read = 0 AND dismissed = 0`,
    )
    .get(projectId) as { n: number };
  return row.n;
}
