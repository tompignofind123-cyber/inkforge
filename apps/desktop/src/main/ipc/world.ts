import { ipcMain } from "electron";
import type {
  WorldCreateInput,
  WorldDeleteInput,
  WorldEntryRecord,
  WorldGetInput,
  WorldListInput,
  WorldSearchInput,
  WorldUpdateInput,
  ipcChannels,
} from "@inkforge/shared";
import {
  createWorldEntry,
  deleteWorldEntryRecord,
  getWorldEntry,
  listWorldEntryRecords,
  searchWorldEntryRecords,
  updateWorldEntryRecord,
} from "../services/world-service";

const WORLD_LIST: typeof ipcChannels.worldList = "world:list";
const WORLD_GET: typeof ipcChannels.worldGet = "world:get";
const WORLD_CREATE: typeof ipcChannels.worldCreate = "world:create";
const WORLD_UPDATE: typeof ipcChannels.worldUpdate = "world:update";
const WORLD_DELETE: typeof ipcChannels.worldDelete = "world:delete";
const WORLD_SEARCH: typeof ipcChannels.worldSearch = "world:search";

export function registerWorldHandlers(): void {
  ipcMain.handle(
    WORLD_LIST,
    async (_event, input: WorldListInput): Promise<WorldEntryRecord[]> =>
      listWorldEntryRecords(input),
  );
  ipcMain.handle(
    WORLD_GET,
    async (_event, input: WorldGetInput): Promise<WorldEntryRecord | null> =>
      getWorldEntry(input),
  );
  ipcMain.handle(
    WORLD_CREATE,
    async (_event, input: WorldCreateInput): Promise<WorldEntryRecord> =>
      createWorldEntry(input),
  );
  ipcMain.handle(
    WORLD_UPDATE,
    async (_event, input: WorldUpdateInput): Promise<WorldEntryRecord> =>
      updateWorldEntryRecord(input),
  );
  ipcMain.handle(
    WORLD_DELETE,
    async (_event, input: WorldDeleteInput): Promise<{ id: string }> =>
      deleteWorldEntryRecord(input),
  );
  ipcMain.handle(
    WORLD_SEARCH,
    async (_event, input: WorldSearchInput): Promise<WorldEntryRecord[]> =>
      searchWorldEntryRecords(input),
  );
}
