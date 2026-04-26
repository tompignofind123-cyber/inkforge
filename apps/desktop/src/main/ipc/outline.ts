import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import {
  deleteOutline as deleteOutlineRow,
  insertOutline,
  listOutlines,
  updateOutline,
} from "@inkforge/storage";
import type {
  OutlineCardRecord,
  OutlineCreateInput,
  OutlineDeleteInput,
  OutlineListInput,
  OutlineUpdateInput,
  ipcChannels,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";

const OUTLINE_CREATE: typeof ipcChannels.outlineCreate = "outline:create";
const OUTLINE_UPDATE: typeof ipcChannels.outlineUpdate = "outline:update";
const OUTLINE_DELETE: typeof ipcChannels.outlineDelete = "outline:delete";
const OUTLINE_LIST: typeof ipcChannels.outlineList = "outline:list";

export function registerOutlineHandlers(): void {
  ipcMain.handle(OUTLINE_CREATE, async (_event, input: OutlineCreateInput): Promise<OutlineCardRecord> => {
    const ctx = getAppContext();
    return insertOutline(ctx.db, { id: randomUUID(), ...input });
  });
  ipcMain.handle(OUTLINE_UPDATE, async (_event, input: OutlineUpdateInput): Promise<OutlineCardRecord> => {
    const ctx = getAppContext();
    return updateOutline(ctx.db, input);
  });
  ipcMain.handle(OUTLINE_DELETE, async (_event, input: OutlineDeleteInput): Promise<{ id: string }> => {
    const ctx = getAppContext();
    deleteOutlineRow(ctx.db, input.id);
    return { id: input.id };
  });
  ipcMain.handle(OUTLINE_LIST, async (_event, input: OutlineListInput): Promise<OutlineCardRecord[]> => {
    const ctx = getAppContext();
    return listOutlines(ctx.db, input.projectId, input.chapterId);
  });
}
