import { ipcMain } from "electron";
import {
  ipcChannels,
  type ChapterLogAppendAiInput,
  type ChapterLogAppendManualInput,
  type ChapterLogDeleteInput,
  type ChapterLogEntryRecord,
  type ChapterLogListInput,
} from "@inkforge/shared";
import {
  appendAiEntry,
  appendManualEntry,
  deleteEntry,
  listEntries,
} from "../services/chapter-log-service";

const LOG_LIST: typeof ipcChannels.chapterLogList = "chapter-log:list";
const LOG_APPEND_MANUAL: typeof ipcChannels.chapterLogAppendManual =
  "chapter-log:append-manual";
const LOG_APPEND_AI: typeof ipcChannels.chapterLogAppendAi = "chapter-log:append-ai";
const LOG_DELETE: typeof ipcChannels.chapterLogDelete = "chapter-log:delete";

export function registerChapterLogHandlers(): void {
  ipcMain.handle(
    LOG_LIST,
    async (_event, input: ChapterLogListInput): Promise<ChapterLogEntryRecord[]> => {
      return listEntries(input.chapterId, input.limit, input.desc);
    },
  );

  ipcMain.handle(
    LOG_APPEND_MANUAL,
    async (
      _event,
      input: ChapterLogAppendManualInput,
    ): Promise<ChapterLogEntryRecord> => {
      return appendManualEntry(input);
    },
  );

  ipcMain.handle(
    LOG_APPEND_AI,
    async (_event, input: ChapterLogAppendAiInput): Promise<ChapterLogEntryRecord> => {
      return appendAiEntry({
        chapterId: input.chapterId,
        projectId: input.projectId,
        kind: input.kind,
        content: input.content,
        metadata: input.metadata,
      });
    },
  );

  ipcMain.handle(
    LOG_DELETE,
    async (_event, input: ChapterLogDeleteInput): Promise<{ entryId: string }> => {
      return deleteEntry(input.entryId);
    },
  );
}
