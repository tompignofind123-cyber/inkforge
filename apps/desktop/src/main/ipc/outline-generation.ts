import { ipcMain } from "electron";
import type {
  ChapterCommitDraftInput,
  ChapterCommitDraftResponse,
  ChapterGenerateFromOutlineInput,
  ChapterGenerateFromOutlineResponse,
  OutlineGenerateChaptersInput,
  OutlineGenerateChaptersResponse,
  OutlineGenerateMasterInput,
  OutlineGenerateMasterResponse,
  OutlineRefineInput,
  OutlineRefineResponse,
  OutlineUndoRefineInput,
  OutlineUndoRefineResponse,
  ProjectRecord,
  ProjectUpdateMetaInput,
} from "@inkforge/shared";
import {
  generateChapterOutlines,
  generateMasterOutline,
  refineOutline,
  undoRefineMaster,
  updateProjectCreativeMeta,
} from "../services/outline-generation-service";
import {
  commitChapterDraft,
  generateChapterFromOutline,
} from "../services/chapter-generation-service";

export function registerOutlineGenerationHandlers(): void {
  ipcMain.handle(
    "project:update-meta",
    async (_e, input: ProjectUpdateMetaInput): Promise<ProjectRecord> => {
      return updateProjectCreativeMeta(input);
    },
  );

  ipcMain.handle(
    "outline:generate-master",
    async (_e, input: OutlineGenerateMasterInput): Promise<OutlineGenerateMasterResponse> => {
      return generateMasterOutline(input);
    },
  );

  ipcMain.handle(
    "outline:generate-chapters",
    async (_e, input: OutlineGenerateChaptersInput): Promise<OutlineGenerateChaptersResponse> => {
      return generateChapterOutlines(input);
    },
  );

  ipcMain.handle(
    "outline:refine",
    async (_e, input: OutlineRefineInput): Promise<OutlineRefineResponse> => {
      return refineOutline(input);
    },
  );

  ipcMain.handle(
    "outline:undo-refine",
    async (_e, input: OutlineUndoRefineInput): Promise<OutlineUndoRefineResponse> => {
      return undoRefineMaster(input);
    },
  );

  ipcMain.handle(
    "chapter:generate-from-outline",
    async (_e, input: ChapterGenerateFromOutlineInput): Promise<ChapterGenerateFromOutlineResponse> => {
      return generateChapterFromOutline(input);
    },
  );

  ipcMain.handle(
    "chapter:commit-draft",
    async (_e, input: ChapterCommitDraftInput): Promise<ChapterCommitDraftResponse> => {
      return commitChapterDraft(input);
    },
  );
}
