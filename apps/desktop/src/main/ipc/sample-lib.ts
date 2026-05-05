import { ipcMain } from "electron";
import {
  createSampleLib,
  deleteSampleLib,
  listSampleLibs,
} from "@inkforge/storage";
import type {
  SampleLibCreateInput,
  SampleLibDeleteInput,
  SampleLibImportEpubInput,
  SampleLibImportResponse,
  SampleLibImportTextInput,
  SampleLibListInput,
  SampleLibRecord,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";
import {
  importEpubAsLib,
  importTextAsLib,
} from "../services/sample-lib-service";

const LIST = "sample-lib:list";
const CREATE = "sample-lib:create";
const DELETE = "sample-lib:delete";
const IMPORT_TEXT = "sample-lib:import-text";
const IMPORT_EPUB = "sample-lib:import-epub";

export function registerSampleLibHandlers(): void {
  ipcMain.handle(LIST, async (_e, input: SampleLibListInput): Promise<SampleLibRecord[]> => {
    const ctx = getAppContext();
    return listSampleLibs(ctx.db, input.projectId);
  });

  ipcMain.handle(CREATE, async (_e, input: SampleLibCreateInput): Promise<SampleLibRecord> => {
    const ctx = getAppContext();
    return createSampleLib(ctx.db, {
      projectId: input.projectId,
      title: input.title,
      author: input.author ?? null,
      notes: input.notes ?? null,
      chunks: input.chunks?.map((c) => ({
        ordinal: c.ordinal,
        chapterTitle: c.chapterTitle ?? null,
        text: c.text,
      })),
    });
  });

  ipcMain.handle(DELETE, async (_e, input: SampleLibDeleteInput): Promise<{ libId: string }> => {
    const ctx = getAppContext();
    deleteSampleLib(ctx.db, input.libId);
    return { libId: input.libId };
  });

  ipcMain.handle(IMPORT_TEXT, async (_e, input: SampleLibImportTextInput): Promise<SampleLibImportResponse> => {
    return importTextAsLib(input);
  });

  ipcMain.handle(IMPORT_EPUB, async (_e, input: SampleLibImportEpubInput): Promise<SampleLibImportResponse> => {
    return importEpubAsLib(input);
  });
}
