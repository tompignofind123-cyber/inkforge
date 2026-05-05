import { randomUUID } from "crypto";
import {
  cleanupOrphanRelationships,
  deleteNovelCharacter,
  getNovelCharacterById,
  insertNovelCharacter,
  listNovelCharacters,
  updateNovelCharacter,
} from "@inkforge/storage";
import type {
  NovelCharacterCreateInput,
  NovelCharacterDeleteInput,
  NovelCharacterGetInput,
  NovelCharacterListInput,
  NovelCharacterRecord,
  NovelCharacterUpdateInput,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";

export function createNovelCharacter(input: NovelCharacterCreateInput): NovelCharacterRecord {
  const ctx = getAppContext();
  return insertNovelCharacter(ctx.db, {
    id: randomUUID(),
    projectId: input.projectId,
    name: input.name,
    persona: input.persona ?? null,
    traits: input.traits ?? {},
    backstory: input.backstory ?? "",
    relations: input.relations ?? [],
    linkedTavernCardId: input.linkedTavernCardId ?? null,
  });
}

export function updateNovelCharacterRecord(
  input: NovelCharacterUpdateInput,
): NovelCharacterRecord {
  const ctx = getAppContext();
  const { id, ...patch } = input;
  return updateNovelCharacter(ctx.db, { id, ...patch });
}

export function getNovelCharacterRecord(
  input: NovelCharacterGetInput,
): NovelCharacterRecord | null {
  const ctx = getAppContext();
  return getNovelCharacterById(ctx.db, input.id);
}

export function listNovelCharacterRecords(
  input: NovelCharacterListInput,
): NovelCharacterRecord[] {
  const ctx = getAppContext();
  return listNovelCharacters(ctx.db, input.projectId);
}

export function deleteNovelCharacterRecord(
  input: NovelCharacterDeleteInput,
): { id: string } {
  const ctx = getAppContext();
  // Look up project_id before delete to clean orphan polymorphic relationships.
  const existing = getNovelCharacterById(ctx.db, input.id);
  deleteNovelCharacter(ctx.db, input.id);
  if (existing) {
    cleanupOrphanRelationships(ctx.db, existing.projectId, "character", input.id);
  }
  return { id: input.id };
}
