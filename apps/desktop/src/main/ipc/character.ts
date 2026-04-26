import { ipcMain } from "electron";
import type {
  CharacterSyncApplyInput,
  CharacterSyncApplyResponse,
  CharacterSyncHistoryInput,
  CharacterSyncLogRecord,
  CharacterSyncPreviewInput,
  CharacterSyncPreviewResponse,
  NovelCharacterCreateInput,
  NovelCharacterDeleteInput,
  NovelCharacterGetInput,
  NovelCharacterListInput,
  NovelCharacterRecord,
  NovelCharacterUpdateInput,
  TavernCardCreateInput,
  TavernCardDeleteInput,
  TavernCardGetInput,
  TavernCardListInput,
  TavernCardRecord,
  TavernCardUpdateInput,
  ipcChannels,
} from "@inkforge/shared";
import {
  createTavernCard,
  deleteTavernCardRecord,
  getTavernCardRecord,
  listTavernCardRecords,
  updateTavernCardRecord,
} from "../services/tavern-card-service";
import {
  createNovelCharacter,
  deleteNovelCharacterRecord,
  getNovelCharacterRecord,
  listNovelCharacterRecords,
  updateNovelCharacterRecord,
} from "../services/novel-character-service";
import {
  applySync,
  listSyncHistory,
  previewSync,
} from "../services/character-sync-service";

const TAVERN_CARD_CREATE: typeof ipcChannels.tavernCardCreate = "tavern-card:create";
const TAVERN_CARD_UPDATE: typeof ipcChannels.tavernCardUpdate = "tavern-card:update";
const TAVERN_CARD_GET: typeof ipcChannels.tavernCardGet = "tavern-card:get";
const TAVERN_CARD_LIST: typeof ipcChannels.tavernCardList = "tavern-card:list";
const TAVERN_CARD_DELETE: typeof ipcChannels.tavernCardDelete = "tavern-card:delete";

const NOVEL_CHARACTER_CREATE: typeof ipcChannels.novelCharacterCreate = "novel-character:create";
const NOVEL_CHARACTER_UPDATE: typeof ipcChannels.novelCharacterUpdate = "novel-character:update";
const NOVEL_CHARACTER_GET: typeof ipcChannels.novelCharacterGet = "novel-character:get";
const NOVEL_CHARACTER_LIST: typeof ipcChannels.novelCharacterList = "novel-character:list";
const NOVEL_CHARACTER_DELETE: typeof ipcChannels.novelCharacterDelete = "novel-character:delete";

const CHARACTER_SYNC_PREVIEW: typeof ipcChannels.characterSyncPreview = "character-sync:preview";
const CHARACTER_SYNC_APPLY: typeof ipcChannels.characterSyncApply = "character-sync:apply";
const CHARACTER_SYNC_HISTORY: typeof ipcChannels.characterSyncHistory = "character-sync:history";

export function registerCharacterHandlers(): void {
  ipcMain.handle(
    TAVERN_CARD_CREATE,
    async (_event, input: TavernCardCreateInput): Promise<TavernCardRecord> => {
      return createTavernCard(input);
    },
  );
  ipcMain.handle(
    TAVERN_CARD_UPDATE,
    async (_event, input: TavernCardUpdateInput): Promise<TavernCardRecord> => {
      return updateTavernCardRecord(input);
    },
  );
  ipcMain.handle(
    TAVERN_CARD_GET,
    async (_event, input: TavernCardGetInput): Promise<TavernCardRecord | null> => {
      return getTavernCardRecord(input);
    },
  );
  ipcMain.handle(
    TAVERN_CARD_LIST,
    async (_event, input: TavernCardListInput): Promise<TavernCardRecord[]> => {
      return listTavernCardRecords(input);
    },
  );
  ipcMain.handle(
    TAVERN_CARD_DELETE,
    async (_event, input: TavernCardDeleteInput): Promise<{ id: string }> => {
      return deleteTavernCardRecord(input);
    },
  );

  ipcMain.handle(
    NOVEL_CHARACTER_CREATE,
    async (_event, input: NovelCharacterCreateInput): Promise<NovelCharacterRecord> => {
      return createNovelCharacter(input);
    },
  );
  ipcMain.handle(
    NOVEL_CHARACTER_UPDATE,
    async (_event, input: NovelCharacterUpdateInput): Promise<NovelCharacterRecord> => {
      return updateNovelCharacterRecord(input);
    },
  );
  ipcMain.handle(
    NOVEL_CHARACTER_GET,
    async (_event, input: NovelCharacterGetInput): Promise<NovelCharacterRecord | null> => {
      return getNovelCharacterRecord(input);
    },
  );
  ipcMain.handle(
    NOVEL_CHARACTER_LIST,
    async (_event, input: NovelCharacterListInput): Promise<NovelCharacterRecord[]> => {
      return listNovelCharacterRecords(input);
    },
  );
  ipcMain.handle(
    NOVEL_CHARACTER_DELETE,
    async (_event, input: NovelCharacterDeleteInput): Promise<{ id: string }> => {
      return deleteNovelCharacterRecord(input);
    },
  );

  ipcMain.handle(
    CHARACTER_SYNC_PREVIEW,
    async (_event, input: CharacterSyncPreviewInput): Promise<CharacterSyncPreviewResponse> => {
      return previewSync(input);
    },
  );
  ipcMain.handle(
    CHARACTER_SYNC_APPLY,
    async (_event, input: CharacterSyncApplyInput): Promise<CharacterSyncApplyResponse> => {
      return applySync(input);
    },
  );
  ipcMain.handle(
    CHARACTER_SYNC_HISTORY,
    async (_event, input: CharacterSyncHistoryInput): Promise<CharacterSyncLogRecord[]> => {
      return listSyncHistory(input);
    },
  );
}
