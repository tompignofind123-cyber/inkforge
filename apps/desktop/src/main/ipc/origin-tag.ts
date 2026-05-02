import { ipcMain } from "electron";
import {
  getChapterOrigin,
  listChapterIdsByOrigin,
  listChapterOriginsForProject,
  listChapters,
  setChapterOrigin,
} from "@inkforge/storage";
import {
  ipcChannels,
  type ChapterOriginTagRecord,
  type OriginTagGetInput,
  type OriginTagListByOriginInput,
  type OriginTagListByOriginResponse,
  type OriginTagSetInput,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";

const ORIGIN_SET: typeof ipcChannels.originTagSet = "origin-tag:set";
const ORIGIN_GET: typeof ipcChannels.originTagGet = "origin-tag:get";
const ORIGIN_LIST: typeof ipcChannels.originTagListByOrigin =
  "origin-tag:list-by-origin";

export function registerOriginTagHandlers(): void {
  ipcMain.handle(
    ORIGIN_SET,
    async (_event, input: OriginTagSetInput): Promise<ChapterOriginTagRecord> => {
      const ctx = getAppContext();
      return setChapterOrigin(ctx.db, input.chapterId, input.origin);
    },
  );

  ipcMain.handle(
    ORIGIN_GET,
    async (_event, input: OriginTagGetInput): Promise<ChapterOriginTagRecord | null> => {
      const ctx = getAppContext();
      return getChapterOrigin(ctx.db, input.chapterId);
    },
  );

  ipcMain.handle(
    ORIGIN_LIST,
    async (
      _event,
      input: OriginTagListByOriginInput,
    ): Promise<OriginTagListByOriginResponse> => {
      const ctx = getAppContext();
      const tagged = listChapterIdsByOrigin(ctx.db, input.projectId, input.origin);
      const includeUntagged = input.includeUntagged ?? true;
      if (input.origin !== "manual" || !includeUntagged) {
        return { chapterIds: tagged };
      }
      // 把未打任何标签的章节也归入 'manual'
      const allChapters = listChapters(ctx.db, input.projectId);
      const allTags = listChapterOriginsForProject(ctx.db, input.projectId);
      const knownTagged = new Set(allTags.map((t) => t.chapterId));
      const result: string[] = [...tagged];
      for (const chapter of allChapters) {
        if (!knownTagged.has(chapter.id)) {
          result.push(chapter.id);
        }
      }
      return { chapterIds: result };
    },
  );
}
