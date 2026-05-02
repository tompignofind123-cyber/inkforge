import type { AutoWriterAgentRole, AutoWriterCorrectionEntry } from "@inkforge/shared";
import {
  buildCriticSystem,
  buildCriticUser,
  buildPlannerSystem,
  buildPlannerUser,
  buildReflectorSystem,
  buildReflectorUser,
  buildWriterSystem,
  buildWriterUser,
} from "./context-merger";
import {
  findingsToMarkdown,
  parseFindings,
  shouldRewriteFromFindings,
  summarizeFindings,
} from "./ooc-gate";
import {
  makeRoleResolver,
  type AgentCallOutput,
  type AutoWriterStats,
  type PipelineDeps,
  type PipelineRunInput,
  type SegmentState,
} from "./types";

interface PlannerBeat {
  index: number;
  beat: string;
}

function tryParseBeats(raw: string): PlannerBeat[] {
  if (!raw || !raw.trim()) return [];
  let text = raw.trim();
  const codeBlock = text.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/);
  if (codeBlock) text = codeBlock[1].trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const result: PlannerBeat[] = [];
  parsed.forEach((item, idx) => {
    if (!item || typeof item !== "object") return;
    const obj = item as Record<string, unknown>;
    const beatText = String(obj.beat ?? obj.text ?? obj.summary ?? "").trim();
    if (!beatText) return;
    result.push({
      index: typeof obj.index === "number" ? obj.index : idx + 1,
      beat: beatText,
    });
  });
  return result;
}

/** 段落之间的拼接：插一个换行。 */
function joinChapter(prev: string, segmentText: string): string {
  if (!prev.trim()) return segmentText.trimEnd() + "\n";
  return prev.trimEnd() + "\n\n" + segmentText.trimEnd() + "\n";
}

/**
 * AutoWriter 核心 orchestrator。
 *
 * Phase 序列（针对每个 beat）：
 *   pre-ai snapshot → writer → post-ai snapshot
 *     → critic → (rewrite | reflector) → next-segment
 *
 * 共享上下文 = userIdeas + chapterSoFar + characters + worldEntries
 *           + lastCriticFindings + reflectorMemo + drained user interrupts
 */
export async function runAutoWriterPipeline(
  input: PipelineRunInput,
  deps: PipelineDeps,
): Promise<AutoWriterStats> {
  const stats: AutoWriterStats = {
    totalSegments: 0,
    totalRewrites: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    startedAt: new Date().toISOString(),
  };
  const resolveRole = makeRoleResolver(input.agents);

  // ---------- Phase: planner ----------
  deps.emitPhase({ phase: "planner", segmentIndex: 0 });
  if (deps.isCancelled()) return finish(stats);

  const initialInterrupts = deps.drainInterrupts();
  const plannerOut = await callAgent(
    deps,
    resolveRole,
    "planner",
    buildPlannerSystem(),
    buildPlannerUser({
      userIdeas: input.userIdeas,
      chapterTitle: input.chapterTitle,
      existingChapterText: input.existingChapterText,
      characters: input.characters,
      worldEntries: input.worldEntries,
      maxSegments: input.maxSegments,
      recentCorrections: initialInterrupts,
    }),
    stats,
  );
  if (deps.isCancelled()) return finish(stats);

  const beats = tryParseBeats(plannerOut.text).slice(0, input.maxSegments);
  if (beats.length === 0) {
    throw new Error("Planner 未返回有效 beat sheet");
  }

  // ---------- Loop over beats ----------
  let chapterSoFar = input.existingChapterText;
  let reflectorMemo: string | null = null;
  // 跨段携带：用于喂下一段的 critic findings
  let lastCriticFindingsText: string | null = null;
  // 累计未消费的 user interrupts（每段开始前会 drain 全部）
  let pendingCorrections: AutoWriterCorrectionEntry[] = [];

  for (let i = 0; i < beats.length; i += 1) {
    if (deps.isCancelled()) break;
    await waitWhilePaused(deps);

    const beat = beats[i];
    const seg: SegmentState = {
      index: i,
      beat: beat.beat,
      text: "",
      rewriteCount: 0,
      lastCriticFindingsText,
      status: "pending",
    };

    // ---------- pre-ai snapshot（章节内容尚未变化）----------
    await deps.createSnapshot({
      kind: "pre-ai",
      segmentIndex: i,
      agentRole: "writer",
      chapterText: chapterSoFar,
    });

    pendingCorrections = [...pendingCorrections, ...deps.drainInterrupts()];

    let segmentText = "";

    // ---------- Writer (with up to N rewrites) ----------
    while (true) {
      if (deps.isCancelled()) break;
      await waitWhilePaused(deps);

      seg.status = "writing";
      deps.emitPhase({ phase: "writer", segmentIndex: i, rewriteCount: seg.rewriteCount });
      const writerOut = await callAgent(
        deps,
        resolveRole,
        "writer",
        buildWriterSystem(input.targetSegmentLength),
        buildWriterUser({
          beat: beat.beat,
          segmentIndex: i,
          targetLength: input.targetSegmentLength,
          characters: input.characters,
          worldEntries: input.worldEntries,
          chapterSoFar,
          lastCriticFindingsText: seg.lastCriticFindingsText,
          reflectorMemo,
          userInterrupts: pendingCorrections,
          rewriteOf: seg.rewriteCount > 0 ? segmentText : null,
        }),
        stats,
      );
      if (deps.isCancelled()) break;
      // 一旦 writer 看过用户介入消息，消费掉
      pendingCorrections = [];

      segmentText = writerOut.text.trim();
      if (!segmentText) {
        // 空输出视作失败，跳过
        break;
      }

      // 临时 apply：把本段附加到章节，便于 UI 实时看到
      const tentativeChapter = joinChapter(chapterSoFar, segmentText);
      await deps.applyChapterContent({
        chapterText: tentativeChapter,
        segmentIndex: i,
      });

      // post-ai snapshot
      await deps.createSnapshot({
        kind: "post-ai",
        segmentIndex: i,
        agentRole: "writer",
        chapterText: tentativeChapter,
      });

      // ---------- Critic / OOC gate ----------
      if (!input.enableOocGate) {
        chapterSoFar = tentativeChapter;
        seg.text = segmentText;
        seg.status = "completed";
        break;
      }

      seg.status = "criticking";
      deps.emitPhase({ phase: "critic", segmentIndex: i });
      const criticOut = await callAgent(
        deps,
        resolveRole,
        "critic",
        buildCriticSystem(),
        buildCriticUser({
          segmentText,
          segmentIndex: i,
          beat: beat.beat,
          userIdeas: input.userIdeas,
          characters: input.characters,
          worldEntries: input.worldEntries,
          recentCorrections: deps.drainInterrupts(),
        }),
        stats,
      );

      // 也做轻量 ooc gate runOocGate（基于人物/世界观的额外校验）
      let extraFindings: ReturnType<typeof parseFindings> = [];
      try {
        extraFindings = await deps.runOocGate({
          chapterTitle: input.chapterTitle,
          segmentText,
          characters: input.characters,
          worldEntries: input.worldEntries,
        });
      } catch {
        extraFindings = [];
      }
      const llmFindings = parseFindings(criticOut.text);
      const findings = [...llmFindings, ...extraFindings];
      const summary = summarizeFindings(findings);
      deps.emitPhase({
        phase: "critic",
        segmentIndex: i,
        criticSummary: summary,
      });

      if (
        shouldRewriteFromFindings(findings) &&
        seg.rewriteCount < input.maxRewritesPerSegment
      ) {
        // ---------- Rewrite path ----------
        seg.rewriteCount += 1;
        stats.totalRewrites += 1;
        deps.emitPhase({
          phase: "rewrite-segment",
          segmentIndex: i,
          rewriteCount: seg.rewriteCount,
        });
        await deps.createSnapshot({
          kind: "pre-rewrite",
          segmentIndex: i,
          agentRole: "writer",
          chapterText: tentativeChapter,
        });
        // 回滚章节到本段开始前
        await deps.applyChapterContent({
          chapterText: chapterSoFar,
          segmentIndex: i,
        });
        seg.lastCriticFindingsText = findingsToMarkdown(findings);
        // 继续下一轮 while(true)
        continue;
      }

      // 通过或耗尽重写：保留章节当前内容
      chapterSoFar = tentativeChapter;
      seg.text = segmentText;
      seg.lastCriticFindingsText = findingsToMarkdown(findings);
      seg.status = "completed";
      break;
    }

    if (deps.isCancelled()) break;

    // ---------- Reflector ----------
    seg.status = "reflecting";
    deps.emitPhase({ phase: "reflector", segmentIndex: i });
    const reflectorOut = await callAgent(
      deps,
      resolveRole,
      "reflector",
      buildReflectorSystem(),
      buildReflectorUser({
        segmentText: seg.text,
        segmentIndex: i,
        criticFindingsText: seg.lastCriticFindingsText ?? "",
        recentCorrections: deps.drainInterrupts(),
      }),
      stats,
    );
    reflectorMemo = reflectorOut.text.trim() || null;
    lastCriticFindingsText = seg.lastCriticFindingsText;

    stats.totalSegments += 1;
    deps.emitPhase({ phase: "next-segment", segmentIndex: i });
  }

  deps.emitPhase({ phase: "done", segmentIndex: stats.totalSegments });
  return finish(stats);
}

async function callAgent(
  deps: PipelineDeps,
  resolve: ReturnType<typeof makeRoleResolver>,
  role: AutoWriterAgentRole,
  systemPrompt: string,
  userPrompt: string,
  stats: AutoWriterStats,
): Promise<AgentCallOutput> {
  const binding = resolve(role);
  const out = await deps.invokeAgent(
    {
      role,
      binding,
      systemPrompt,
      userPrompt,
    },
    () => {
      // delta 转发由 deps 内部处理；orchestrator 不需要在这里聚合
    },
  );
  stats.totalTokensIn += out.tokensIn;
  stats.totalTokensOut += out.tokensOut;
  return out;
}

function finish(stats: AutoWriterStats): AutoWriterStats {
  return { ...stats, finishedAt: new Date().toISOString() };
}

async function waitWhilePaused(deps: PipelineDeps): Promise<void> {
  while (deps.isPaused() && !deps.isCancelled()) {
    await new Promise((r) => setTimeout(r, 200));
  }
}
