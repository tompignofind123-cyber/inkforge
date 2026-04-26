import { randomUUID } from "crypto";
import {
  getLatestSyncLog,
  getNovelCharacterById,
  getTavernCardById,
  insertSyncLog,
  listSyncLogs,
  updateNovelCharacter,
  updateTavernCard,
} from "@inkforge/storage";
import type {
  CharacterSyncApplyInput,
  CharacterSyncApplyResponse,
  CharacterSyncField,
  CharacterSyncHistoryInput,
  CharacterSyncLogRecord,
  CharacterSyncPreviewInput,
  CharacterSyncPreviewResponse,
  CharacterSyncRequestDirection,
  CharacterSyncResolutionInput,
  NovelCharacterRecord,
  SyncDiffRow,
  TavernCardRecord,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";

type Side = "novel" | "card";

const SYNC_FIELDS: CharacterSyncField[] = ["persona", "backstory", "traits"];

function getNovelFieldValue(
  record: NovelCharacterRecord,
  field: CharacterSyncField,
): unknown {
  if (field === "persona") return record.persona ?? "";
  if (field === "backstory") return record.backstory ?? "";
  return record.traits ?? {};
}

function getCardFieldValue(record: TavernCardRecord, field: CharacterSyncField): unknown {
  if (field === "persona") return record.persona ?? "";
  if (field === "backstory") return "";
  return {};
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "string" && typeof b === "string") return a === b;
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  } catch {
    return false;
  }
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function pickWinnerByDirection(
  direction: CharacterSyncRequestDirection,
  novel: NovelCharacterRecord,
  card: TavernCardRecord,
): Side {
  if (direction === "novel_to_card") return "novel";
  if (direction === "card_to_novel") return "card";
  // auto: newer updated_at wins; tie → novel
  return new Date(card.updatedAt).getTime() > new Date(novel.updatedAt).getTime() ? "card" : "novel";
}

function detectConflict(
  db: ReturnType<typeof getAppContext>["db"],
  novel: NovelCharacterRecord,
  card: TavernCardRecord,
  field: CharacterSyncField,
  winner: Side,
): boolean {
  const latest = getLatestSyncLog(db, novel.id, card.id, field);
  if (!latest) return false;
  const loserSide: Side = winner === "novel" ? "card" : "novel";
  const loserValue =
    loserSide === "novel"
      ? getNovelFieldValue(novel, field)
      : getCardFieldValue(card, field);
  // If the side we're about to overwrite has changed since last sync, flag conflict.
  return stringifyValue(loserValue) !== stringifyValue(latest.newValue)
    && stringifyValue(loserValue) !== stringifyValue(latest.oldValue);
}

export function previewSync(input: CharacterSyncPreviewInput): CharacterSyncPreviewResponse {
  const ctx = getAppContext();
  const novel = getNovelCharacterById(ctx.db, input.novelCharId);
  if (!novel) throw new Error(`NovelCharacter not found: ${input.novelCharId}`);
  const card = getTavernCardById(ctx.db, input.tavernCardId);
  if (!card) throw new Error(`TavernCard not found: ${input.tavernCardId}`);
  const direction: CharacterSyncRequestDirection = input.direction ?? "auto";
  const diffs: SyncDiffRow[] = [];
  for (const field of SYNC_FIELDS) {
    const novelValue = getNovelFieldValue(novel, field);
    const cardValue = getCardFieldValue(card, field);
    if (valuesEqual(novelValue, cardValue)) continue;
    const winner = pickWinnerByDirection(direction, novel, card);
    const conflict = detectConflict(ctx.db, novel, card, field, winner);
    diffs.push({ field, novelValue, cardValue, winner, conflict });
  }
  return { diffs };
}

function autoResolutions(
  diffs: SyncDiffRow[],
): CharacterSyncResolutionInput[] {
  return diffs.map((diff) => ({
    field: diff.field,
    winner: (diff.winner ?? "novel") as "novel" | "card",
  }));
}

export function applySync(input: CharacterSyncApplyInput): CharacterSyncApplyResponse {
  const ctx = getAppContext();
  const novelBefore = getNovelCharacterById(ctx.db, input.novelCharId);
  if (!novelBefore) throw new Error(`NovelCharacter not found: ${input.novelCharId}`);
  const cardBefore = getTavernCardById(ctx.db, input.tavernCardId);
  if (!cardBefore) throw new Error(`TavernCard not found: ${input.tavernCardId}`);

  let resolutions = input.resolutions;
  if (!resolutions || resolutions.length === 0) {
    const { diffs } = previewSync({
      novelCharId: input.novelCharId,
      tavernCardId: input.tavernCardId,
      direction: input.direction,
    });
    resolutions = autoResolutions(diffs);
  }

  const now = new Date().toISOString();
  let updatedNovel: NovelCharacterRecord = novelBefore;
  let updatedCard: TavernCardRecord = cardBefore;
  let logsWritten = 0;

  const tx = ctx.db.transaction(() => {
    for (const resolution of resolutions ?? []) {
      const field = resolution.field;
      const novelValue = getNovelFieldValue(updatedNovel, field);
      const cardValue = getCardFieldValue(updatedCard, field);
      let nextValue: unknown;
      let direction: CharacterSyncLogRecord["direction"];
      if (resolution.winner === "novel") {
        nextValue = novelValue;
        direction = "novel_to_card";
      } else {
        nextValue = cardValue;
        direction = "card_to_novel";
      }

      const oldNovelValue = novelValue;
      const oldCardValue = cardValue;

      if (direction === "novel_to_card") {
        if (field === "persona") {
          updatedCard = updateTavernCard(ctx.db, {
            id: updatedCard.id,
            persona: typeof nextValue === "string" ? nextValue : stringifyValue(nextValue),
          });
        }
        // backstory / traits have no counterpart on the card side; log only.
      } else {
        if (field === "persona") {
          updatedNovel = updateNovelCharacter(ctx.db, {
            id: updatedNovel.id,
            persona: typeof nextValue === "string" ? nextValue : stringifyValue(nextValue),
          });
        } else if (field === "backstory") {
          updatedNovel = updateNovelCharacter(ctx.db, {
            id: updatedNovel.id,
            backstory: typeof nextValue === "string" ? nextValue : stringifyValue(nextValue),
          });
        } else if (field === "traits") {
          const traits =
            nextValue && typeof nextValue === "object" && !Array.isArray(nextValue)
              ? (nextValue as Record<string, unknown>)
              : {};
          updatedNovel = updateNovelCharacter(ctx.db, {
            id: updatedNovel.id,
            traits,
          });
        }
      }

      insertSyncLog(ctx.db, {
        id: randomUUID(),
        novelCharId: updatedNovel.id,
        tavernCardId: updatedCard.id,
        field,
        oldValue:
          resolution.winner === "card"
            ? stringifyValue(oldNovelValue)
            : stringifyValue(oldCardValue),
        newValue: stringifyValue(nextValue),
        direction,
        at: now,
      });
      logsWritten += 1;
    }
  });
  tx();

  return {
    updatedNovelCharacter: updatedNovel,
    updatedTavernCard: updatedCard,
    logsWritten,
  };
}

export function listSyncHistory(input: CharacterSyncHistoryInput): CharacterSyncLogRecord[] {
  const ctx = getAppContext();
  return listSyncLogs(ctx.db, {
    novelCharId: input.novelCharId,
    tavernCardId: input.tavernCardId,
    limit: input.limit,
  });
}
