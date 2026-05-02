import {
  countChapterWords,
  getBookCover,
  getDailyProgress,
  listChapterOriginsForProject,
  listChapters,
  listProjects,
} from "@inkforge/storage";
import type { BookSummary, ChapterOrigin } from "@inkforge/shared";
import { getAppContext } from "./app-state";

/**
 * 列出全部 project 的 BookSummary（书架视图源数据）。
 * 复用现有 storage 函数，零新增 SQL。
 */
export function listBooks(): BookSummary[] {
  const ctx = getAppContext();
  const projects = listProjects(ctx.db);
  return projects.map((project) => {
    const cover = getBookCover(ctx.db, project.id);
    const chapters = listChapters(ctx.db, project.id);
    const totalWords = countChapterWords(ctx.db, project.id);
    const todayProgress = getDailyProgress(ctx.db, project.id, project.dailyGoal);
    const originTags = listChapterOriginsForProject(ctx.db, project.id);
    const taggedMap = new Map(originTags.map((t) => [t.chapterId, t.origin]));

    const originCounts: Record<ChapterOrigin, number> = {
      "ai-auto": 0,
      "ai-assisted": 0,
      manual: 0,
    };
    for (const chapter of chapters) {
      const origin = taggedMap.get(chapter.id) ?? "manual";
      originCounts[origin] += 1;
    }

    let lastChapterUpdatedAt: string | null = null;
    for (const c of chapters) {
      if (!c.updatedAt) continue;
      if (!lastChapterUpdatedAt || c.updatedAt > lastChapterUpdatedAt) {
        lastChapterUpdatedAt = c.updatedAt;
      }
    }

    return {
      project,
      cover,
      chapterCount: chapters.length,
      totalWords,
      todayWords: todayProgress.wordsAdded,
      lastChapterUpdatedAt,
      originCounts,
    };
  });
}
