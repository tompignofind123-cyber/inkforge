import { randomUUID } from "crypto";
import type { BrowserWindow } from "electron";
import {
  getDailySummary,
  getProject,
  listChapters,
  listDailySummaries as listDailySummariesRepo,
  readChapterFile,
  todayKey,
  upsertDailySummary,
  type ProviderPersistenceRecord,
} from "@inkforge/storage";
import type {
  DailySummaryChunkEvent,
  DailySummaryDoneEvent,
  DailySummaryGenerateInput,
  DailySummaryGenerateResponse,
  DailySummaryGetInput,
  DailySummaryListInput,
  DailySummaryRecord,
  ipcEventChannels,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";
import { logger } from "./logger";
import {
  resolveApiKey,
  resolveProviderRecord,
  streamText,
} from "./llm-runtime";
import { resolveSceneBinding } from "./scene-binding-service";

const CHUNK_CHANNEL: typeof ipcEventChannels.dailySummaryChunk = "daily:summary-chunk";
const DONE_CHANNEL: typeof ipcEventChannels.dailySummaryDone = "daily:summary-done";

const MAX_CHAPTERS = 8;
const MAX_CHAPTER_EXCERPT = 600;

function emit<T>(
  window: BrowserWindow | null,
  channel: string,
  payload: T,
): void {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(channel, payload);
}

function buildUserPrompt(options: {
  projectName: string;
  date: string;
  wordsAdded: number;
  goal: number;
  chapterExcerpts: Array<{ title: string; excerpt: string; wordCount: number }>;
}): string {
  const { projectName, date, wordsAdded, goal, chapterExcerpts } = options;
  const header = [
    `项目：《${projectName}》`,
    `日期：${date}`,
    `今日新增字数：${wordsAdded} / 目标 ${goal}${wordsAdded >= goal ? "（已达成）" : ""}`,
  ].join("\n");
  const chapterList = chapterExcerpts
    .map(
      (c, idx) =>
        `### ${idx + 1}. ${c.title}（${c.wordCount} 字）\n${c.excerpt || "（无可读正文）"}`,
    )
    .join("\n\n");
  return [
    header,
    "",
    "以下是最近编辑过的章节节选：",
    chapterList,
  ].join("\n");
}

function collectContext(projectId: string): {
  projectName: string;
  goal: number;
  chapters: Array<{ title: string; excerpt: string; wordCount: number }>;
} {
  const ctx = getAppContext();
  const project = getProject(ctx.db, projectId);
  if (!project) throw new Error(`project not found: ${projectId}`);
  const allChapters = listChapters(ctx.db, projectId);
  const recent = allChapters.slice(0, MAX_CHAPTERS);
  const items = recent.map((chapter) => {
    let excerpt = "";
    try {
      const content = readChapterFile(project.path, chapter.filePath);
      excerpt = content
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_CHAPTER_EXCERPT);
    } catch {
      excerpt = "";
    }
    return {
      title: chapter.title,
      excerpt,
      wordCount: chapter.wordCount,
    };
  });
  return {
    projectName: project.name,
    goal: project.dailyGoal,
    chapters: items,
  };
}

export async function startDailySummary(
  input: DailySummaryGenerateInput,
  window: BrowserWindow | null,
): Promise<DailySummaryGenerateResponse> {
  const ctx = getAppContext();
  const date = input.date ?? todayKey();
  const summaryId = randomUUID();
  const projectId = input.projectId;
  const project = getProject(ctx.db, projectId);
  if (!project) {
    emit(window, DONE_CHANNEL, {
      summaryId,
      projectId,
      date,
      status: "failed",
      error: "project_not_found",
      finishedAt: new Date().toISOString(),
    } satisfies DailySummaryDoneEvent);
    return { summaryId, status: "started" };
  }
  const resolvedScene = resolveSceneBinding("daily-summary", {
    explicitProviderId: input.providerId,
  });
  const providerRecord = resolveProviderRecord(
    resolvedScene.providerId ?? input.providerId,
  );
  if (!providerRecord) {
    emit(window, DONE_CHANNEL, {
      summaryId,
      projectId,
      date,
      status: "failed",
      error: "provider_not_configured",
      finishedAt: new Date().toISOString(),
    } satisfies DailySummaryDoneEvent);
    return { summaryId, status: "started" };
  }
  const apiKey = await resolveApiKey(providerRecord);
  if (!apiKey) {
    emit(window, DONE_CHANNEL, {
      summaryId,
      projectId,
      date,
      status: "failed",
      error: "api_key_missing",
      finishedAt: new Date().toISOString(),
    } satisfies DailySummaryDoneEvent);
    return { summaryId, status: "started" };
  }

  const progressRow = getDailySummary(ctx.db, projectId, date, project.dailyGoal);
  const wordsAdded = progressRow?.wordsAdded ?? 0;
  const context = collectContext(projectId);
  const userMessage = buildUserPrompt({
    projectName: context.projectName,
    date,
    wordsAdded,
    goal: context.goal,
    chapterExcerpts: context.chapters,
  });
  const model = input.model ?? providerRecord.defaultModel;

  void runDailySummary({
    summaryId,
    date,
    projectId,
    userMessage,
    providerRecord,
    apiKey,
    model,
    window,
  }).catch((error) => {
    logger.warn("daily summary run failed unexpectedly", error);
  });

  return { summaryId, status: "started" };
}

interface RunDailySummaryParams {
  summaryId: string;
  date: string;
  projectId: string;
  userMessage: string;
  providerRecord: ProviderPersistenceRecord;
  apiKey: string;
  model: string;
  window: BrowserWindow | null;
}

const SUMMARY_SYSTEM_PROMPT = [
  "你是小说作者的每日写作总结助手。",
  "请基于当天新增字数与最近编辑的章节节选，生成一份 Markdown 格式的日报。",
  "包含以下几段：",
  "1. **今日成果**：今日完成的字数和达成情况。",
  "2. **关键进展**：列出 2~3 条最值得注意的情节/人物/节奏变动。",
  "3. **风险与遗留**：指出可能的不一致、未决伏笔或明日需要处理的事。",
  "4. **明日建议**：用一两句话给出下一步写作建议。",
  "写作要求：中文、短段落、避免堆砌形容词，总字数控制在 350 字以内。",
].join("\n");

async function runDailySummary(params: RunDailySummaryParams): Promise<void> {
  const { summaryId, date, projectId, userMessage, providerRecord, apiKey, model, window } =
    params;
  const ctx = getAppContext();
  let accumulated = "";
  let summaryText = "";
  try {
    const stream = streamText({
      providerRecord,
      apiKey,
      model,
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.4,
      maxTokens: 600,
    });
    for await (const chunk of stream) {
      if (chunk.type === "delta" && chunk.textDelta) {
        accumulated += chunk.textDelta;
        emit(window, CHUNK_CHANNEL, {
          summaryId,
          projectId,
          date,
          delta: chunk.textDelta,
          accumulatedText: accumulated,
          emittedAt: new Date().toISOString(),
        } satisfies DailySummaryChunkEvent);
        continue;
      }
      if (chunk.type === "error") {
        throw new Error(chunk.error ?? "unknown_error");
      }
    }
    summaryText = accumulated.trim();
    if (summaryText.length === 0) {
      throw new Error("empty_summary");
    }
    upsertDailySummary(
      ctx.db,
      {
        date,
        projectId,
        summary: summaryText,
        summaryProviderId: providerRecord.id,
        summaryModel: model,
      },
      0,
    );
    emit(window, DONE_CHANNEL, {
      summaryId,
      projectId,
      date,
      status: "completed",
      summary: summaryText,
      finishedAt: new Date().toISOString(),
    } satisfies DailySummaryDoneEvent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit(window, DONE_CHANNEL, {
      summaryId,
      projectId,
      date,
      status: "failed",
      error: message,
      finishedAt: new Date().toISOString(),
    } satisfies DailySummaryDoneEvent);
  }
}

export function getDailySummaryRecord(
  input: DailySummaryGetInput,
): DailySummaryRecord | null {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.projectId);
  if (!project) return null;
  return getDailySummary(ctx.db, input.projectId, input.date, project.dailyGoal);
}

export function listDailySummaryRecords(
  input: DailySummaryListInput,
): DailySummaryRecord[] {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.projectId);
  if (!project) return [];
  return listDailySummariesRepo(
    ctx.db,
    {
      projectId: input.projectId,
      startDate: input.startDate,
      endDate: input.endDate,
      limit: input.limit,
    },
    project.dailyGoal,
  );
}
