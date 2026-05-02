import type { BrowserWindow } from "electron";
import {
  appendChapterLogEntry,
  deleteChapterLogEntry,
  ensureChapterLog,
  getChapter,
  listChapterLogEntries,
  type AppendChapterLogEntryInput,
} from "@inkforge/storage";
import {
  ipcEventChannels,
  type ChapterLogDailyReminderEvent,
  type ChapterLogEntryRecord,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";
import { logger } from "./logger";

/**
 * 章节日志服务：薄封装 storage 层 + 每日 12:00 提醒定时器。
 * AutoWriter 在 PR-7 里直接调 `appendAiEntry`；用户手动追加走 IPC handler。
 */

export function appendManualEntry(input: {
  chapterId: string;
  projectId: string;
  content: string;
}): ChapterLogEntryRecord {
  const ctx = getAppContext();
  const chapter = getChapter(ctx.db, input.chapterId);
  if (!chapter) throw new Error(`Chapter not found: ${input.chapterId}`);
  ensureChapterLog(ctx.db, input.chapterId, input.projectId);
  const payload: AppendChapterLogEntryInput = {
    chapterId: input.chapterId,
    projectId: input.projectId,
    kind: "manual",
    author: "user",
    content: input.content,
  };
  return appendChapterLogEntry(ctx.db, payload);
}

export function appendAiEntry(input: {
  chapterId: string;
  projectId: string;
  kind: "ai-run" | "progress";
  content: string;
  metadata?: Record<string, unknown>;
}): ChapterLogEntryRecord {
  const ctx = getAppContext();
  ensureChapterLog(ctx.db, input.chapterId, input.projectId);
  return appendChapterLogEntry(ctx.db, {
    chapterId: input.chapterId,
    projectId: input.projectId,
    kind: input.kind,
    author: input.kind === "progress" ? "user" : "ai",
    content: input.content,
    metadata: input.metadata,
  });
}

export function listEntries(chapterId: string, limit?: number, desc?: boolean) {
  const ctx = getAppContext();
  return listChapterLogEntries(ctx.db, chapterId, { limit, desc });
}

export function deleteEntry(entryId: string): { entryId: string } {
  const ctx = getAppContext();
  deleteChapterLogEntry(ctx.db, entryId);
  return { entryId };
}

// =====================================================================
// 每日 12:00 提醒
// =====================================================================

let reminderTimeout: NodeJS.Timeout | null = null;

function msUntilNextNoon(): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(12, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

/**
 * 启动每日 12:00 写日志提醒。每天触发一次，直到进程退出。
 * 提醒事件通过 IPC 发到 renderer，由 ReminderToast 组件捕获显示。
 */
export function startDailyReminder(getWindow: () => BrowserWindow | null): void {
  if (reminderTimeout) return; // 防止重复启动

  const tick = () => {
    try {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        const event: ChapterLogDailyReminderEvent = {
          emittedAt: new Date().toISOString(),
        };
        win.webContents.send(ipcEventChannels.chapterLogReminder, event);
      }
    } catch (error) {
      logger.warn("daily reminder dispatch failed", error);
    }
    reminderTimeout = setTimeout(tick, msUntilNextNoon());
  };

  reminderTimeout = setTimeout(tick, msUntilNextNoon());
}

export function stopDailyReminder(): void {
  if (reminderTimeout) {
    clearTimeout(reminderTimeout);
    reminderTimeout = null;
  }
}
