import { randomUUID } from "crypto";
import type { BrowserWindow } from "electron";
import {
  assertSkillDefinition,
  renderSkillTemplate,
} from "@inkforge/skill-engine";
import {
  createSkill,
  deleteSkill,
  getSkill,
  insertFeedback,
  listSkills,
  updateSkill,
} from "@inkforge/storage";
import type {
  SkillChunkEvent,
  SkillCreateInput,
  SkillDefinition,
  SkillDeleteInput,
  SkillDoneEvent,
  SkillGetInput,
  SkillListInput,
  SkillRunInput,
  SkillRunResponse,
  SkillUpdateInput,
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
import { buildRagBlock } from "./rag-service";
import { RateLimiter } from "./rate-limiter";

const SKILL_CHUNK_CHANNEL: typeof ipcEventChannels.skillChunk = "skill:chunk";
const SKILL_DONE_CHANNEL: typeof ipcEventChannels.skillDone = "skill:done";

const skillRateLimiter = new RateLimiter<{ skillId: string }>({
  max: 30,
  windowMs: 60_000,
  keyer: (input) => input.skillId,
});
const runState = new Map<string, { cancelled: boolean }>();

function emitChunk(window: BrowserWindow | null, payload: SkillChunkEvent): void {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(SKILL_CHUNK_CHANNEL, payload);
}

function emitDone(window: BrowserWindow | null, payload: SkillDoneEvent): void {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(SKILL_DONE_CHANNEL, payload);
}

export function createSkillRecord(input: SkillCreateInput): SkillDefinition {
  const ctx = getAppContext();
  const now = new Date().toISOString();
  const candidate = assertSkillDefinition({
    id: randomUUID(),
    name: input.name,
    prompt: input.prompt,
    variables: input.variables ?? [],
    triggers: input.triggers ?? [],
    binding: input.binding ?? {},
    output: input.output,
    enabled: input.enabled ?? true,
    scope: input.scope,
    createdAt: now,
    updatedAt: now,
  });
  return createSkill(ctx.db, {
    id: candidate.id,
    name: candidate.name,
    prompt: candidate.prompt,
    variables: candidate.variables,
    triggers: candidate.triggers,
    binding: candidate.binding,
    output: candidate.output,
    enabled: candidate.enabled,
    scope: candidate.scope,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  });
}

export function updateSkillRecord(input: SkillUpdateInput): SkillDefinition {
  const ctx = getAppContext();
  const existing = getSkill(ctx.db, input.id);
  if (!existing) throw new Error(`Skill not found: ${input.id}`);
  const next = assertSkillDefinition({
    ...existing,
    ...input,
    updatedAt: new Date().toISOString(),
  });
  return updateSkill(ctx.db, {
    id: next.id,
    name: next.name,
    prompt: next.prompt,
    variables: next.variables,
    triggers: next.triggers,
    binding: next.binding,
    output: next.output,
    enabled: next.enabled,
    scope: next.scope,
    updatedAt: next.updatedAt,
  });
}

export function getSkillRecord(input: SkillGetInput): SkillDefinition | null {
  const ctx = getAppContext();
  return getSkill(ctx.db, input.id);
}

export function listSkillRecords(input: SkillListInput = {}): SkillDefinition[] {
  const ctx = getAppContext();
  const rows = listSkills(ctx.db, {
    scope: input.scope,
    enabledOnly: input.enabledOnly,
  });
  return rows;
}

export function deleteSkillRecord(input: SkillDeleteInput): { id: string } {
  const ctx = getAppContext();
  deleteSkill(ctx.db, input.id);
  return { id: input.id };
}

export function cancelSkillRun(runId: string): boolean {
  const state = runState.get(runId);
  if (!state) return false;
  state.cancelled = true;
  return true;
}

export interface RunSkillOptions {
  input: SkillRunInput & { runId?: string; persist?: boolean };
  window: BrowserWindow | null;
}

export async function runSkill(options: RunSkillOptions): Promise<SkillRunResponse> {
  const runId = options.input.runId ?? randomUUID();
  runState.set(runId, { cancelled: false });
  void executeRun({
    runId,
    input: options.input,
    window: options.window,
  }).catch((error) => {
    logger.warn("skill run failed unexpectedly", error);
  });
  return { runId, status: "started" };
}

interface ExecuteRunOptions {
  runId: string;
  input: SkillRunInput & { persist?: boolean };
  window: BrowserWindow | null;
}

async function executeRun(options: ExecuteRunOptions): Promise<void> {
  const { runId, input, window } = options;
  const ctx = getAppContext();
  const limiterKey = skillRateLimiter.keyOf({ skillId: input.skillId });

  if (!skillRateLimiter.check(limiterKey)) {
    emitDone(window, {
      runId,
      skillId: input.skillId,
      projectId: input.projectId,
      chapterId: input.chapterId,
      status: "failed",
      error: "rate_limited",
      finishedAt: new Date().toISOString(),
    });
    runState.delete(runId);
    return;
  }
  skillRateLimiter.touch(limiterKey);

  const skill = getSkill(ctx.db, input.skillId);
  if (!skill) {
    emitDone(window, {
      runId,
      skillId: input.skillId,
      projectId: input.projectId,
      chapterId: input.chapterId,
      status: "failed",
      error: "skill_not_found",
      finishedAt: new Date().toISOString(),
    });
    runState.delete(runId);
    return;
  }

  const resolvedScene = resolveSceneBinding("skill", {
    explicitProviderId: skill.binding.providerId,
    explicitModel: skill.binding.model ?? null,
  });
  const providerRecord = resolveProviderRecord(
    resolvedScene.providerId ?? skill.binding.providerId,
  );
  if (!providerRecord) {
    emitDone(window, {
      runId,
      skillId: input.skillId,
      projectId: input.projectId,
      chapterId: input.chapterId,
      status: "failed",
      error: "provider_not_configured",
      finishedAt: new Date().toISOString(),
    });
    runState.delete(runId);
    return;
  }

  const apiKey = await resolveApiKey(providerRecord);
  if (!apiKey) {
    emitDone(window, {
      runId,
      skillId: input.skillId,
      projectId: input.projectId,
      chapterId: input.chapterId,
      status: "failed",
      error: "api_key_missing",
      finishedAt: new Date().toISOString(),
    });
    runState.delete(runId);
    return;
  }

  const renderResult = renderSkillTemplate(
    skill.prompt,
    {
      selection: input.selection,
      chapter: {
        title: input.chapterTitle,
        text: input.chapterText,
      },
      character: input.character,
      vars: input.manualVariables,
    },
    {
      strict: false,
      emptyOnMissing: true,
    },
  );

  const model = skill.binding.model ?? providerRecord.defaultModel;
  const triggerType = input.triggerType ?? "manual";
  const ragBlock = buildRagBlock(input.projectId, renderResult.text);
  const userMessage = ragBlock ? `${ragBlock}\n${renderResult.text}` : renderResult.text;
  let accumulatedText = "";
  let usage: SkillDoneEvent["usage"];

  try {
    const stream = streamText({
      providerRecord,
      apiKey,
      systemPrompt: "你是小说写作技能执行助手。严格执行技能指令，输出简洁、可直接使用的结果。",
      userMessage,
      temperature: skill.binding.temperature,
      maxTokens: skill.binding.maxTokens,
      model,
    });
    for await (const chunk of stream) {
      const state = runState.get(runId);
      if (state?.cancelled) {
        emitDone(window, {
          runId,
          skillId: input.skillId,
          projectId: input.projectId,
          chapterId: input.chapterId,
          status: "cancelled",
          finishedAt: new Date().toISOString(),
          usage,
        });
        runState.delete(runId);
        return;
      }

      if (chunk.type === "delta" && chunk.textDelta) {
        accumulatedText += chunk.textDelta;
        emitChunk(window, {
          runId,
          skillId: input.skillId,
          projectId: input.projectId,
          chapterId: input.chapterId,
          delta: chunk.textDelta,
          accumulatedText,
          providerId: providerRecord.id,
          model,
          emittedAt: new Date().toISOString(),
        });
        continue;
      }
      if (chunk.type === "done") {
        usage = chunk.usage;
        continue;
      }
      if (chunk.type === "error") {
        throw new Error(chunk.error ?? "unknown_error");
      }
    }

    let feedbackId: string | undefined;
    if (input.persist !== false) {
      const feedback = insertFeedback(ctx.db, {
        id: randomUUID(),
        projectId: input.projectId,
        chapterId: input.chapterId,
        type: "skill",
        payload: {
          text: accumulatedText,
          skillId: skill.id,
          skillName: skill.name,
          providerId: providerRecord.id,
          model,
          usage,
          missingTokens: renderResult.missing,
        },
        trigger: `skill:${triggerType}:${skill.id}`,
      });
      feedbackId = feedback.id;
    }

    emitDone(window, {
      runId,
      skillId: input.skillId,
      projectId: input.projectId,
      chapterId: input.chapterId,
      status: "completed",
      feedbackId,
      usage,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    emitDone(window, {
      runId,
      skillId: input.skillId,
      projectId: input.projectId,
      chapterId: input.chapterId,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      usage,
      finishedAt: new Date().toISOString(),
    });
  } finally {
    runState.delete(runId);
  }
}
