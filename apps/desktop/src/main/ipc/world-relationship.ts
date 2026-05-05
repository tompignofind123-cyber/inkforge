import { ipcMain } from "electron";
import {
  deleteWorldRelationship,
  listWorldRelationships,
  saveWorldRelationship,
} from "@inkforge/storage";
import type {
  WorldRelationshipDeleteInput,
  WorldRelationshipListInput,
  WorldRelationshipRecord,
  WorldRelationshipSaveInput,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";

const LIST = "world-relationship:list";
const SAVE = "world-relationship:save";
const DELETE = "world-relationship:delete";

export function registerWorldRelationshipHandlers(): void {
  ipcMain.handle(LIST, async (_e, input: WorldRelationshipListInput): Promise<WorldRelationshipRecord[]> => {
    const ctx = getAppContext();
    return listWorldRelationships(ctx.db, input.projectId);
  });

  ipcMain.handle(SAVE, async (_e, input: WorldRelationshipSaveInput): Promise<WorldRelationshipRecord> => {
    const ctx = getAppContext();
    return saveWorldRelationship(ctx.db, {
      id: input.id,
      projectId: input.projectId,
      srcKind: input.srcKind,
      srcId: input.srcId,
      dstKind: input.dstKind,
      dstId: input.dstId,
      label: input.label ?? null,
      weight: input.weight,
    });
  });

  ipcMain.handle(DELETE, async (_e, input: WorldRelationshipDeleteInput): Promise<{ id: string }> => {
    const ctx = getAppContext();
    deleteWorldRelationship(ctx.db, input.id);
    return { id: input.id };
  });
}
