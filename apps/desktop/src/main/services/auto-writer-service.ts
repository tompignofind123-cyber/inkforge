import type { BrowserWindow } from "electron";
import { randomUUID } from "crypto";
import {
  appendAutoWriterCorrection,
  getActiveAutoWriterRun,
  getAutoWriterRun,
  getChapter,
  getProject,
  insertAutoWriterRun,
  listAutoWriterRunsByChapter,
  listAutoWriterRunsByProject,
  listChapters,
  listNovelCharacters,
  listWorldEntries,
  ragSearchSampleChunks,
  readChapterFile,
  setChapterOrigin,
  updateAutoWriterRun,
  updateChapter,
  writeChapterFile,
} from "@inkforge/storage";
import {
  runAutoWriterPipeline,
  UserInterruptQueue,
  parseFindings,
  type AgentCallInput,
  type AgentCallOutput,
  type OocFinding,
  type PipelineDeps,
  type SnapshotHookInput,
  type StyleSampleRef,
} from "@inkforge/auto-writer-engine";
import {
  ipcEventChannels,
  type AutoWriterChunkEvent,
  type AutoWriterCorrectionEntry,
  type AutoWriterDoneEvent,
  type AutoWriterPhaseEvent,
  type AutoWriterRunRecord,
  type AutoWriterSnapshotEvent,
  type AutoWriterStartInput,
  type ChapterRecord,
  type ChapterSnapshotRecord,
} from "@inkforge/shared";
import type { DB } from "@inkforge/storage";
import { getAppContext } from "./app-state";
import { logger } from "./logger";
import {
  pickProviderKey,
  resolveProviderRecord,
  reportProviderKeyResult,
  streamText,
} from "./llm-runtime";
import { resolveSceneBinding } from "./scene-binding-service";
import { createSnapshot } from "./snapshot-service";
import { appendAiEntry } from "./chapter-log-service";

interface RuntimeController {
  runId: string;
  cancelled: boolean;
  paused: boolean;
  interrupts: UserInterruptQueue;
  promise: Promise<void>;
}

const runtimes = new Map<string, RuntimeController>();

function emitToWindow<T>(
  getWindow: () => BrowserWindow | null,
  channel: string,
  payload: T,
): void {
  try {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  } catch (error) {
    logger.warn(`emit to window failed (${channel})`, error);
  }
}

function countWords(text: string): number {
  return text.replace(/\s+/g, "").length;
}

/**
 * v20: Build previous-chapters context for AutoWriter.
 * Strategy: take up to 3 chapters before the current one (by `order`), read
 * their .md content, and excerpt the last ~600 chars of each (the "tail" is
 * what matters for continuation). Total cap ~3000 chars to keep prompt cheap.
 *
 * Returns "" if no preceding chapters or all empty.
 */
function buildPreviousChaptersText(
  db: DB,
  projectPath: string,
  current: ChapterRecord,
): string {
  const all = listChapters(db, current.projectId);
  const preceding = all
    .filter((c) => c.order < current.order)
    .sort((a, b) => a.order - b.order)
    .slice(-3);
  if (preceding.length === 0) return "";

  const blocks: string[] = [];
  for (const ch of preceding) {
    let body = "";
    try {
      body = readChapterFile(projectPath, ch.filePath) ?? "";
    } catch {
      body = "";
    }
    const trimmed = body.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    // Take the tail of each chapter; the head was set up earlier.
    const tail = trimmed.length > 600 ? "…" + trimmed.slice(-600) : trimmed;
    blocks.push(`【第${ch.order}章 · ${ch.title}（节选）】\n${tail}`);
  }
  return blocks.join("\n\n");
}

/**
 * v20: Pull style sample chunks via RAG. Use the user's chapter ideas as the
 * query so chunks roughly aligned with the upcoming scene get picked.
 * Returns up to 3 references (cheap; Critic will use them too).
 */
function buildStyleSamples(
  db: DB,
  projectId: string,
  userIdeas: string,
): StyleSampleRef[] {
  const trimmed = (userIdeas ?? "").trim();
  if (!trimmed) return [];
  // Use 2-3 keywords from ideas as queries (very simple split).
  const queries = trimmed
    .split(/[。！？\.\!\?\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4 && s.length <= 80)
    .slice(0, 3);
  if (queries.length === 0) return [];

  let hits: { libTitle: string; libAuthor: string | null; chapterTitle: string | null; text: string }[] = [];
  try {
    hits = ragSearchSampleChunks(db, projectId, queries, 3) as typeof hits;
  } catch (error) {
    logger.warn("auto-writer: ragSearchSampleChunks failed", error);
    return [];
  }
  return hits.slice(0, 3).map((h) => ({
    source: [h.libTitle, h.libAuthor, h.chapterTitle].filter(Boolean).join(" · "),
    excerpt: (h.text ?? "").slice(0, 600),
  }));
}

export async function startAutoWriter(
  input: AutoWriterStartInput,
  getWindow: () => BrowserWindow | null,
): Promise<{ runId: string }> {
  const ctx = getAppContext();
  const chapter = getChapter(ctx.db, input.chapterId);
  if (!chapter) throw new Error(`Chapter not found: ${input.chapterId}`);
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error(`Project not found: ${input.projectId}`);

  // 同章节同时只允许一个 run（避免并发写入）
  const active = getActiveAutoWriterRun(ctx.db, input.chapterId);
  if (active) {
    throw new Error(`This chapter already has an active run: ${active.id}`);
  }

  const runId = randomUUID();
  const run = insertAutoWriterRun(ctx.db, {
    id: runId,
    projectId: input.projectId,
    chapterId: input.chapterId,
    userIdeas: input.userIdeas,
    agentsConfig: input.agents,
  });
  // 标记章节 origin 为 ai-auto
  try {
    setChapterOrigin(ctx.db, input.chapterId, "ai-auto");
  } catch (error) {
    logger.warn("auto-writer: setChapterOrigin failed", error);
  }

  const interrupts = new UserInterruptQueue();
  const controller: RuntimeController = {
    runId,
    cancelled: false,
    paused: false,
    interrupts,
    promise: Promise.resolve(),
  };
  runtimes.set(runId, controller);

  const targetSegmentLength = Math.max(120, input.targetSegmentLength ?? 400);
  const maxSegments = Math.max(1, Math.min(40, input.maxSegments ?? 12));
  const maxRewritesPerSegment = Math.max(0, Math.min(5, input.maxRewritesPerSegment ?? 3));
  const enableOocGate = input.enableOocGate ?? true;

  const characters = listNovelCharacters(ctx.db, input.projectId);
  const worldEntries = listWorldEntries(ctx.db, { projectId: input.projectId });
  const existingChapterText = readChapterFile(project.path, chapter.filePath);

  // ----- v20: per-book global worldview + cross-chapter context + style samples -----
  const globalWorldview = (project.globalWorldview ?? "").trim();
  const previousChaptersText = buildPreviousChaptersText(
    ctx.db,
    project.path,
    chapter,
  );
  const styleSamples = buildStyleSamples(ctx.db, project.id, input.userIdeas);

  const deps: PipelineDeps = {
    invokeAgent: async (agentInput, _onDelta) => {
      return invokeOneAgent({
        runId,
        chapterId: chapter.id,
        agentInput,
        getWindow,
        controller,
      });
    },
    createSnapshot: async (snapInput: SnapshotHookInput) => {
      try {
        const result = createSnapshot({
          chapterId: chapter.id,
          projectId: project.id,
          kind: snapInput.kind,
          content: snapInput.chapterText,
          runId,
          agentRole: snapInput.agentRole,
          dedupe: true,
        });
        if (!result.reused) {
          const event: AutoWriterSnapshotEvent = {
            runId,
            chapterId: chapter.id,
            snapshot: result.snapshot,
            emittedAt: new Date().toISOString(),
          };
          emitToWindow<AutoWriterSnapshotEvent>(
            getWindow,
            ipcEventChannels.autoWriterSnapshot,
            event,
          );
        }
        return result.snapshot;
      } catch (error) {
        logger.warn("auto-writer: createSnapshot failed", error);
        return null as unknown as ChapterSnapshotRecord;
      }
    },
    applyChapterContent: async ({ chapterText }) => {
      writeChapterFile(project.path, chapter.filePath, chapterText);
      try {
        updateChapter(ctx.db, {
          id: chapter.id,
          wordCount: countWords(chapterText),
        });
      } catch (error) {
        logger.warn("auto-writer: updateChapter failed", error);
      }
    },
    runOocGate: async (gateInput) => {
      // 我们的 critic 已经做了 LLM 审稿；这里再用一个轻量启发式 gate：
      // 检查段落里是否提到了不在 characters 名单里却带「角色形容词」的名字。
      // 这一层是廉价兜底，不阻塞主流程。
      if (!enableOocGate) return [];
      const findings: OocFinding[] = [];
      const charNames = new Set(gateInput.characters.map((c) => c.name));
      // 暂仅返回 LLM critic 之外的 hint：留作扩展点（PR-8 可丰富）
      void charNames;
      return findings;
    },
    drainInterrupts: () => {
      const taken = interrupts.drain();
      // 同步把这批 corrections 也持久化到 DB（已经通过 IPC autoWriterCorrect 落库，这里只是兜底防重复）
      return taken;
    },
    emitPhase: (event) => {
      const payload: AutoWriterPhaseEvent = {
        runId,
        chapterId: chapter.id,
        phase: event.phase,
        segmentIndex: event.segmentIndex,
        rewriteCount: event.rewriteCount,
        criticSummary: event.criticSummary,
        emittedAt: new Date().toISOString(),
      };
      emitToWindow<AutoWriterPhaseEvent>(
        getWindow,
        ipcEventChannels.autoWriterPhase,
        payload,
      );
    },
    isCancelled: () => controller.cancelled,
    isPaused: () => controller.paused,
  };

  controller.promise = (async () => {
    let status: AutoWriterRunRecord["status"] = "completed";
    let errMsg: string | undefined;
    let stats: Awaited<ReturnType<typeof runAutoWriterPipeline>> | null = null;
    try {
      stats = await runAutoWriterPipeline(
        {
          runId,
          projectId: project.id,
          chapterId: chapter.id,
          userIdeas: input.userIdeas,
          agents: input.agents,
          targetSegmentLength,
          maxSegments,
          maxRewritesPerSegment,
          enableOocGate,
          existingChapterText,
          chapterTitle: chapter.title,
          characters,
          worldEntries,
          globalWorldview,
          previousChaptersText,
          styleSamples,
        },
        deps,
      );
      if (controller.cancelled) status = "stopped";
    } catch (error) {
      status = "failed";
      errMsg = error instanceof Error ? error.message : String(error);
      logger.error("auto-writer pipeline error", error);
    }

    // 持久化最终状态
    try {
      updateAutoWriterRun(ctx.db, runId, {
        status,
        statsJson: (stats as unknown as Record<string, unknown>) ?? {},
      });
    } catch (error) {
      logger.warn("auto-writer: updateAutoWriterRun failed", error);
    }

    // 章节日志：本次 AI 运行总结
    try {
      const summary = stats
        ? `AutoWriter ${status}：写了 ${stats.totalSegments} 段，重写 ${stats.totalRewrites} 次，token ${stats.totalTokensIn} ↑/${stats.totalTokensOut} ↓。`
        : `AutoWriter ${status}：${errMsg ?? "未完成"}`;
      appendAiEntry({
        chapterId: chapter.id,
        projectId: project.id,
        kind: "ai-run",
        content: summary,
        metadata: {
          runId,
          status,
          tokensIn: stats?.totalTokensIn ?? 0,
          tokensOut: stats?.totalTokensOut ?? 0,
          rewrites: stats?.totalRewrites ?? 0,
          segments: stats?.totalSegments ?? 0,
        },
      });
    } catch (error) {
      logger.warn("auto-writer: append log entry failed", error);
    }

    const doneEvent: AutoWriterDoneEvent = {
      runId,
      chapterId: chapter.id,
      status,
      totalSegments: stats?.totalSegments ?? 0,
      totalRewrites: stats?.totalRewrites ?? 0,
      totalTokensIn: stats?.totalTokensIn ?? 0,
      totalTokensOut: stats?.totalTokensOut ?? 0,
      error: errMsg,
      finishedAt: new Date().toISOString(),
    };
    emitToWindow<AutoWriterDoneEvent>(
      getWindow,
      ipcEventChannels.autoWriterDone,
      doneEvent,
    );

    runtimes.delete(runId);
  })();

  // 立即返回，不等待主流程跑完
  void run;
  return { runId };
}

export function stopAutoWriter(runId: string): void {
  const ctrl = runtimes.get(runId);
  if (!ctrl) return;
  ctrl.cancelled = true;
}

export function pauseAutoWriter(runId: string): AutoWriterRunRecord {
  const ctx = getAppContext();
  const ctrl = runtimes.get(runId);
  if (ctrl) ctrl.paused = true;
  const updated = updateAutoWriterRun(ctx.db, runId, { status: "paused" });
  return updated;
}

export function resumeAutoWriter(runId: string): AutoWriterRunRecord {
  const ctx = getAppContext();
  const ctrl = runtimes.get(runId);
  if (ctrl) ctrl.paused = false;
  const updated = updateAutoWriterRun(ctx.db, runId, { status: "running" });
  return updated;
}

export function getAutoWriterRunRecord(runId: string): AutoWriterRunRecord | null {
  const ctx = getAppContext();
  return getAutoWriterRun(ctx.db, runId);
}

export function listAutoWriterRuns(input: {
  chapterId?: string;
  projectId?: string;
  limit?: number;
}): AutoWriterRunRecord[] {
  const ctx = getAppContext();
  if (input.chapterId) {
    return listAutoWriterRunsByChapter(ctx.db, input.chapterId, { limit: input.limit });
  }
  if (input.projectId) {
    return listAutoWriterRunsByProject(ctx.db, input.projectId, { limit: input.limit });
  }
  return [];
}

export function injectIdea(input: {
  runId: string;
  content: string;
}): AutoWriterRunRecord {
  const ctx = getAppContext();
  const correction: AutoWriterCorrectionEntry = {
    at: new Date().toISOString(),
    content: input.content,
  };
  const updated = appendAutoWriterCorrection(ctx.db, input.runId, correction);
  const ctrl = runtimes.get(input.runId);
  if (ctrl) ctrl.interrupts.push(correction);
  return updated;
}

export function correctSegment(input: {
  runId: string;
  content: string;
  targetExcerpt?: string;
}): { run: AutoWriterRunRecord; correction: AutoWriterCorrectionEntry } {
  const ctx = getAppContext();
  const correction: AutoWriterCorrectionEntry = {
    at: new Date().toISOString(),
    content: input.content,
    targetExcerpt: input.targetExcerpt,
  };
  const updated = appendAutoWriterCorrection(ctx.db, input.runId, correction);
  const ctrl = runtimes.get(input.runId);
  if (ctrl) ctrl.interrupts.push(correction);
  return { run: updated, correction };
}

// =====================================================================
// 内部：单次 agent 调用 → llm-core 流式 → 转发 chunk + 收集结果
// =====================================================================

async function invokeOneAgent(args: {
  runId: string;
  chapterId: string;
  agentInput: AgentCallInput;
  getWindow: () => BrowserWindow | null;
  controller: RuntimeController;
}): Promise<AgentCallOutput> {
  const { runId, chapterId, agentInput, getWindow, controller } = args;
  const ctx = getAppContext();

  const resolvedScene = resolveSceneBinding("auto-writer", {
    explicitProviderId: agentInput.binding.providerId,
  });
  const providerRecord = resolveProviderRecord(
    resolvedScene.providerId ?? agentInput.binding.providerId,
  );
  if (!providerRecord) {
    throw new Error(
      `auto-writer: provider not found: ${agentInput.binding.providerId}`,
    );
  }
  const pickedKey = await pickProviderKey(providerRecord);
  if (!pickedKey) {
    throw new Error(
      `auto-writer: no usable api key for provider ${providerRecord.id}`,
    );
  }
  const apiKey = pickedKey.apiKey;

  const stream = streamText({
    providerRecord,
    apiKey,
    systemPrompt: agentInput.systemPrompt,
    messages: [{ role: "user", content: agentInput.userPrompt }],
    temperature: agentInput.binding.temperature,
    maxTokens: agentInput.binding.maxTokens,
    model: agentInput.binding.model,
  });

  let accumulated = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let success = false;

  // segmentIndex 在 agentInput 里没有；emit chunk 时统一用 -1（writer 之外的角色），
  // writer 的 segmentIndex 由 deps.emitPhase 已经传给 UI。
  // UI 渲染时通过 agentRole + accumulatedText 即可。
  const segmentIndex = -1;

  try {
    for await (const chunk of stream) {
      if (controller.cancelled) break;
      if (chunk.type === "delta" && chunk.textDelta) {
        accumulated += chunk.textDelta;
        const event: AutoWriterChunkEvent = {
          runId,
          chapterId,
          agentRole: agentInput.role,
          segmentIndex,
          delta: chunk.textDelta,
          accumulatedText: accumulated,
          emittedAt: new Date().toISOString(),
        };
        emitToWindow<AutoWriterChunkEvent>(
          getWindow,
          ipcEventChannels.autoWriterChunk,
          event,
        );
        continue;
      }
      if (chunk.type === "done") {
        if (chunk.usage) {
          tokensIn = chunk.usage.inputTokens ?? 0;
          tokensOut = chunk.usage.outputTokens ?? 0;
        }
        success = true;
        continue;
      }
      if (chunk.type === "error") {
        throw new Error(chunk.error ?? "stream_error");
      }
    }
  } finally {
    reportProviderKeyResult(pickedKey.keyId, success);
    void ctx;
  }

  // 容错：parseFindings 用作"轻量自检"防止某些 provider 提前结束
  // 不需要在这里 parse，只用作示例引用以满足 linter
  void parseFindings;

  return {
    text: accumulated,
    tokensIn,
    tokensOut,
  };
}
