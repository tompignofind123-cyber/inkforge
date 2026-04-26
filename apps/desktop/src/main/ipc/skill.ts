import { ipcMain, type BrowserWindow } from "electron";
import type {
  SkillCreateInput,
  SkillDefinition,
  SkillDeleteInput,
  SkillExportJsonInput,
  SkillExportJsonResponse,
  SkillGetInput,
  SkillImportJsonInput,
  SkillImportReport,
  SkillListInput,
  SkillRunInput,
  SkillRunResponse,
  SkillUpdateInput,
  ipcChannels,
} from "@inkforge/shared";
import {
  createSkillRecord,
  deleteSkillRecord,
  getSkillRecord,
  listSkillRecords,
  runSkill,
  updateSkillRecord,
} from "../services/skill-service";
import { exportSkillJson, importSkillJson } from "../services/skill-io-service";

const SKILL_CREATE: typeof ipcChannels.skillCreate = "skill:create";
const SKILL_UPDATE: typeof ipcChannels.skillUpdate = "skill:update";
const SKILL_GET: typeof ipcChannels.skillGet = "skill:get";
const SKILL_LIST: typeof ipcChannels.skillList = "skill:list";
const SKILL_DELETE: typeof ipcChannels.skillDelete = "skill:delete";
const SKILL_RUN: typeof ipcChannels.skillRun = "skill:run";
const SKILL_IMPORT_JSON: typeof ipcChannels.skillImportJson = "skill:import-json";
const SKILL_EXPORT_JSON: typeof ipcChannels.skillExportJson = "skill:export-json";

export function registerSkillHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(SKILL_CREATE, async (_event, input: SkillCreateInput): Promise<SkillDefinition> => {
    return createSkillRecord(input);
  });
  ipcMain.handle(SKILL_UPDATE, async (_event, input: SkillUpdateInput): Promise<SkillDefinition> => {
    return updateSkillRecord(input);
  });
  ipcMain.handle(SKILL_GET, async (_event, input: SkillGetInput): Promise<SkillDefinition | null> => {
    return getSkillRecord(input);
  });
  ipcMain.handle(SKILL_LIST, async (_event, input: SkillListInput): Promise<SkillDefinition[]> => {
    return listSkillRecords(input ?? {});
  });
  ipcMain.handle(SKILL_DELETE, async (_event, input: SkillDeleteInput): Promise<{ id: string }> => {
    return deleteSkillRecord(input);
  });
  ipcMain.handle(SKILL_RUN, async (_event, input: SkillRunInput): Promise<SkillRunResponse> => {
    return runSkill({
      input,
      window: getWindow(),
    });
  });
  ipcMain.handle(SKILL_IMPORT_JSON, async (_event, input: SkillImportJsonInput): Promise<SkillImportReport> => {
    return importSkillJson({
      jsonText: input.content,
      onConflict: input.onConflict,
      scopeOverride: input.scopeOverride,
    });
  });
  ipcMain.handle(
    SKILL_EXPORT_JSON,
    async (_event, input: SkillExportJsonInput): Promise<SkillExportJsonResponse> => {
      return exportSkillJson(input ?? {});
    },
  );
}
