import { ipcMain } from "electron";
import type {
  ResearchCredentialDeleteInput,
  ResearchCredentialStatus,
  ResearchCredentialStatusInput,
  ResearchCredentialUpsertInput,
  ResearchDeleteInput,
  ResearchGetInput,
  ResearchListInput,
  ResearchNoteRecord,
  ResearchSaveInput,
  ResearchSearchInput,
  ResearchSearchResponse,
  ResearchUpdateInput,
  ipcChannels,
} from "@inkforge/shared";
import {
  deleteResearchCredential,
  deleteResearchNoteRecord,
  getResearchCredentialStatuses,
  getResearchNote,
  listResearchNoteRecords,
  saveResearchNote,
  searchResearch,
  updateResearchNoteRecord,
  upsertResearchCredential,
} from "../services/research-service";

const RESEARCH_SEARCH: typeof ipcChannels.researchSearch = "research:search";
const RESEARCH_LIST: typeof ipcChannels.researchList = "research:list";
const RESEARCH_GET: typeof ipcChannels.researchGet = "research:get";
const RESEARCH_SAVE: typeof ipcChannels.researchSave = "research:save";
const RESEARCH_UPDATE: typeof ipcChannels.researchUpdate = "research:update";
const RESEARCH_DELETE: typeof ipcChannels.researchDelete = "research:delete";
const RESEARCH_CRED_STATUS: typeof ipcChannels.researchCredentialStatus =
  "research:credential-status";
const RESEARCH_CRED_UPSERT: typeof ipcChannels.researchCredentialUpsert =
  "research:credential-upsert";
const RESEARCH_CRED_DELETE: typeof ipcChannels.researchCredentialDelete =
  "research:credential-delete";

export function registerResearchHandlers(): void {
  ipcMain.handle(
    RESEARCH_SEARCH,
    async (_event, input: ResearchSearchInput): Promise<ResearchSearchResponse> =>
      searchResearch(input),
  );
  ipcMain.handle(
    RESEARCH_LIST,
    async (_event, input: ResearchListInput): Promise<ResearchNoteRecord[]> =>
      listResearchNoteRecords(input),
  );
  ipcMain.handle(
    RESEARCH_GET,
    async (_event, input: ResearchGetInput): Promise<ResearchNoteRecord | null> =>
      getResearchNote(input),
  );
  ipcMain.handle(
    RESEARCH_SAVE,
    async (_event, input: ResearchSaveInput): Promise<ResearchNoteRecord> =>
      saveResearchNote(input),
  );
  ipcMain.handle(
    RESEARCH_UPDATE,
    async (_event, input: ResearchUpdateInput): Promise<ResearchNoteRecord> =>
      updateResearchNoteRecord(input),
  );
  ipcMain.handle(
    RESEARCH_DELETE,
    async (_event, input: ResearchDeleteInput): Promise<{ id: string }> =>
      deleteResearchNoteRecord(input),
  );
  ipcMain.handle(
    RESEARCH_CRED_STATUS,
    async (
      _event,
      input: ResearchCredentialStatusInput,
    ): Promise<ResearchCredentialStatus[]> => getResearchCredentialStatuses(input ?? {}),
  );
  ipcMain.handle(
    RESEARCH_CRED_UPSERT,
    async (
      _event,
      input: ResearchCredentialUpsertInput,
    ): Promise<ResearchCredentialStatus> => upsertResearchCredential(input),
  );
  ipcMain.handle(
    RESEARCH_CRED_DELETE,
    async (
      _event,
      input: ResearchCredentialDeleteInput,
    ): Promise<ResearchCredentialStatus> => deleteResearchCredential(input),
  );
}
