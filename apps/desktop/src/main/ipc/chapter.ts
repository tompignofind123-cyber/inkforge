import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import * as path from "path";
import {
  addDailyWords,
  clearAutosave,
  deleteChapter as deleteChapterRow,
  deleteChapterFile,
  getChapter,
  getDailyProgress,
  getProject,
  insertChapter,
  listChapters,
  nextChapterFileName,
  readAutosave,
  readChapterFile,
  reorderChapters,
  updateChapter,
  writeAutosave,
  writeChapterFile,
} from "@inkforge/storage";
import type {
  ChapterAutosaveClearInput,
  ChapterAutosavePeekInput,
  ChapterAutosavePeekResponse,
  ChapterAutosaveWriteInput,
  ChapterCreateInput,
  ChapterDeleteInput,
  ChapterExportMdInput,
  ChapterExportMdResponse,
  ChapterImportMdInput,
  ChapterListInput,
  ChapterReadInput,
  ChapterReadResponse,
  ChapterRecord,
  ChapterReorderInput,
  ChapterUpdateInput,
  ProjectRecord,
  ipcChannels,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";
import { flushOnSave } from "../services/skill-trigger-service";
import { logger } from "../services/logger";

const CHAPTER_CREATE: typeof ipcChannels.chapterCreate = "chapter:create";
const CHAPTER_UPDATE: typeof ipcChannels.chapterUpdate = "chapter:update";
const CHAPTER_LIST: typeof ipcChannels.chapterList = "chapter:list";
const CHAPTER_READ: typeof ipcChannels.chapterRead = "chapter:read";
const CHAPTER_DELETE: typeof ipcChannels.chapterDelete = "chapter:delete";
const CHAPTER_REORDER: typeof ipcChannels.chapterReorder = "chapter:reorder";
const CHAPTER_IMPORT_MD: typeof ipcChannels.chapterImportMd = "chapter:import-md";
const CHAPTER_EXPORT_MD: typeof ipcChannels.chapterExportMd = "chapter:export-md";
const CHAPTER_AUTOSAVE_WRITE: typeof ipcChannels.chapterAutosaveWrite = "chapter:autosave-write";
const CHAPTER_AUTOSAVE_PEEK: typeof ipcChannels.chapterAutosavePeek = "chapter:autosave-peek";
const CHAPTER_AUTOSAVE_CLEAR: typeof ipcChannels.chapterAutosaveClear = "chapter:autosave-clear";

function resolveProject(projectId: string): ProjectRecord {
  const ctx = getAppContext();
  const project = getProject(ctx.db, projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}

function defaultFilePath(input: ChapterCreateInput): string {
  if (input.filePath && input.filePath.trim()) return input.filePath.trim();
  const suffix = Date.now();
  return `chapters/chapter-${suffix}.md`;
}

function chapterInitialMarkdown(title: string): string {
  return `# ${title}\n\n`;
}

function stripLeadingTitle(content: string): { title?: string; body: string } {
  const match = content.match(/^\s*#\s+(.+?)\s*\n([\s\S]*)$/);
  if (match) return { title: match[1].trim(), body: match[2].trimStart() };
  return { body: content };
}

export function registerChapterHandlers(): void {
  ipcMain.handle(CHAPTER_CREATE, async (_event, input: ChapterCreateInput): Promise<ChapterRecord> => {
    const ctx = getAppContext();
    const project = resolveProject(input.projectId);
    const filePath = defaultFilePath(input);
    writeChapterFile(project.path, filePath, chapterInitialMarkdown(input.title));
    return insertChapter(ctx.db, {
      id: randomUUID(),
      projectId: input.projectId,
      parentId: input.parentId ?? null,
      title: input.title,
      order: input.order,
      status: input.status,
      wordCount: input.wordCount,
      filePath,
    });
  });

  ipcMain.handle(CHAPTER_UPDATE, async (_event, input: ChapterUpdateInput): Promise<ChapterRecord> => {
    const ctx = getAppContext();
    const current = getChapter(ctx.db, input.id);
    if (!current) throw new Error(`Chapter not found: ${input.id}`);
    const project = resolveProject(current.projectId);
    if (typeof input.content === "string") {
      writeChapterFile(project.path, input.filePath ?? current.filePath, input.content);
    }
    const { content: _c, ...rest } = input;
    const updated = updateChapter(ctx.db, rest);

    if (typeof input.wordCount === "number") {
      const delta = input.wordCount - current.wordCount;
      if (delta > 0) addDailyWords(ctx.db, current.projectId, delta);
      if (delta < 0) addDailyWords(ctx.db, current.projectId, delta);
      getDailyProgress(ctx.db, current.projectId, project.dailyGoal);
    }

    if (typeof input.content === "string") {
      void flushOnSave({
        projectId: updated.projectId,
        chapterId: updated.id,
        chapterTitle: updated.title,
        chapterText: input.content,
      }).catch((error) => {
        logger.warn("skill on-save dispatch failed", error);
      });
    }

    return updated;
  });

  ipcMain.handle(CHAPTER_LIST, async (_event, input: ChapterListInput): Promise<ChapterRecord[]> => {
    const ctx = getAppContext();
    return listChapters(ctx.db, input.projectId);
  });

  ipcMain.handle(CHAPTER_READ, async (_event, input: ChapterReadInput): Promise<ChapterReadResponse> => {
    const ctx = getAppContext();
    const chapter = getChapter(ctx.db, input.id);
    if (!chapter) throw new Error(`Chapter not found: ${input.id}`);
    const project = resolveProject(chapter.projectId);
    const content = readChapterFile(project.path, chapter.filePath);
    return { chapter, content };
  });

  ipcMain.handle(CHAPTER_DELETE, async (_event, input: ChapterDeleteInput): Promise<{ id: string }> => {
    const ctx = getAppContext();
    const chapter = getChapter(ctx.db, input.id);
    if (!chapter) return { id: input.id };
    const project = resolveProject(chapter.projectId);
    deleteChapterFile(project.path, chapter.filePath);
    deleteChapterRow(ctx.db, input.id);
    return { id: input.id };
  });

  ipcMain.handle(
    CHAPTER_REORDER,
    async (_event, input: ChapterReorderInput): Promise<ChapterRecord[]> => {
      const ctx = getAppContext();
      return reorderChapters(ctx.db, input.projectId, input.orderedIds);
    },
  );

  ipcMain.handle(
    CHAPTER_IMPORT_MD,
    async (_event, input: ChapterImportMdInput): Promise<ChapterRecord> => {
      const ctx = getAppContext();
      const project = resolveProject(input.projectId);
      const parsed = stripLeadingTitle(input.content);
      const finalTitle = (input.title?.trim() || parsed.title || "导入章节").slice(0, 80);
      const filePath = nextChapterFileName(project.path, finalTitle);
      const body = parsed.title ? input.content : `# ${finalTitle}\n\n${input.content}`;
      writeChapterFile(project.path, filePath, body);
      const existing = listChapters(ctx.db, input.projectId);
      const order = existing.length + 1;
      const wordCount = body.replace(/\s+/g, "").length;
      const record = insertChapter(ctx.db, {
        id: randomUUID(),
        projectId: input.projectId,
        parentId: input.parentId ?? null,
        title: finalTitle,
        order,
        wordCount,
        filePath,
      });
      if (wordCount > 0) addDailyWords(ctx.db, input.projectId, wordCount);
      return record;
    },
  );

  ipcMain.handle(
    CHAPTER_EXPORT_MD,
    async (_event, input: ChapterExportMdInput): Promise<ChapterExportMdResponse> => {
      const ctx = getAppContext();
      const chapter = getChapter(ctx.db, input.id);
      if (!chapter) throw new Error(`Chapter not found: ${input.id}`);
      const project = resolveProject(chapter.projectId);
      const content = readChapterFile(project.path, chapter.filePath);
      const fileName = path.basename(chapter.filePath);
      return {
        id: chapter.id,
        title: chapter.title,
        fileName,
        content,
      };
    },
  );

  ipcMain.handle(
    CHAPTER_AUTOSAVE_WRITE,
    async (_event, input: ChapterAutosaveWriteInput): Promise<{ savedAt: number }> => {
      const ctx = getAppContext();
      const chapter = getChapter(ctx.db, input.id);
      if (!chapter) throw new Error(`Chapter not found: ${input.id}`);
      const project = resolveProject(chapter.projectId);
      const savedAt = writeAutosave(project.path, chapter.id, input.content);
      return { savedAt };
    },
  );

  // Recovery: an autosave is only considered stale when it was written
  // BEFORE the last DB save — otherwise the user's last keystrokes before a
  // crash could be silently dropped.
  ipcMain.handle(
    CHAPTER_AUTOSAVE_PEEK,
    async (_event, input: ChapterAutosavePeekInput): Promise<ChapterAutosavePeekResponse> => {
      const ctx = getAppContext();
      const chapter = getChapter(ctx.db, input.id);
      if (!chapter) return { content: null, savedAt: null, chapterUpdatedAt: null };
      const project = resolveProject(chapter.projectId);
      const snap = readAutosave(project.path, chapter.id);
      const chapterUpdatedAt =
        chapter.updatedAt ? new Date(chapter.updatedAt).getTime() : null;
      if (!snap) return { content: null, savedAt: null, chapterUpdatedAt };
      const dbContent = readChapterFile(project.path, chapter.filePath);
      if (snap.content === dbContent) {
        clearAutosave(project.path, chapter.id);
        return { content: null, savedAt: null, chapterUpdatedAt };
      }
      if (chapterUpdatedAt !== null && snap.savedAt <= chapterUpdatedAt) {
        clearAutosave(project.path, chapter.id);
        return { content: null, savedAt: null, chapterUpdatedAt };
      }
      return { content: snap.content, savedAt: snap.savedAt, chapterUpdatedAt };
    },
  );

  ipcMain.handle(
    CHAPTER_AUTOSAVE_CLEAR,
    async (_event, input: ChapterAutosaveClearInput): Promise<{ ok: true }> => {
      const ctx = getAppContext();
      const chapter = getChapter(ctx.db, input.id);
      if (!chapter) return { ok: true };
      const project = resolveProject(chapter.projectId);
      clearAutosave(project.path, chapter.id);
      return { ok: true };
    },
  );
}
