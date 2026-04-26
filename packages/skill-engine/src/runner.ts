import { SkillRuntimeError } from "./errors";
import type { SkillRunContext } from "./trigger-scheduler";
import type {
  SkillBinding,
  SkillDefinition,
  SkillRunUsage,
  SkillTriggerType,
} from "./types";

export interface SkillRunnerResolveProviderResult {
  providerId: string;
  model: string;
}

export interface SkillRunnerStreamInput {
  providerId: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
}

export interface SkillRunnerDeps {
  resolveProvider: (
    binding: SkillBinding,
    projectId: string,
  ) => Promise<SkillRunnerResolveProviderResult>;
  streamCompletion: (
    input: SkillRunnerStreamInput,
  ) => AsyncIterable<{
    type: "delta" | "done" | "error";
    textDelta?: string;
    error?: string;
    usage?: SkillRunUsage;
  }>;
  persistFeedback: (input: {
    id: string;
    projectId: string;
    chapterId: string;
    type: "skill";
    trigger: string;
    payload: Record<string, unknown>;
  }) => Promise<{ id: string }>;
}

export interface SkillRunnerInput {
  runId?: string;
  skill: SkillDefinition;
  triggerType: SkillTriggerType;
  context: SkillRunContext;
  renderedPrompt: string;
  persist?: boolean;
}

export type SkillRunStreamEvent =
  | {
      type: "chunk";
      runId: string;
      skillId: string;
      delta: string;
      accumulatedText: string;
      providerId: string;
      model: string;
      emittedAt: string;
    }
  | {
      type: "done";
      runId: string;
      skillId: string;
      status: "completed" | "failed" | "cancelled";
      output?: string;
      error?: string;
      feedbackId?: string;
      usage?: SkillRunUsage;
      finishedAt: string;
    };

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class SkillRunner {
  private readonly deps: SkillRunnerDeps;
  private readonly cancelled = new Set<string>();

  constructor(deps: SkillRunnerDeps) {
    this.deps = deps;
  }

  cancel(runId: string): void {
    this.cancelled.add(runId);
  }

  async *run(input: SkillRunnerInput): AsyncIterable<SkillRunStreamEvent> {
    const runId = input.runId ?? createId();
    const skillId = input.skill.id;
    const persist = input.persist !== false;
    const provider = await this.deps.resolveProvider(
      input.skill.binding,
      input.context.projectId,
    );

    let usage: SkillRunUsage | undefined;
    let output = "";

    try {
      const stream = this.deps.streamCompletion({
        providerId: provider.providerId,
        model: provider.model,
        systemPrompt: "你是小说写作技能执行助手。严格遵循用户技能指令。",
        userMessage: input.renderedPrompt,
        temperature: input.skill.binding.temperature,
        maxTokens: input.skill.binding.maxTokens,
      });

      for await (const chunk of stream) {
        if (this.cancelled.has(runId)) {
          this.cancelled.delete(runId);
          yield {
            type: "done",
            runId,
            skillId,
            status: "cancelled",
            output,
            usage,
            finishedAt: new Date().toISOString(),
          };
          return;
        }
        if (chunk.type === "delta" && chunk.textDelta) {
          output += chunk.textDelta;
          yield {
            type: "chunk",
            runId,
            skillId,
            delta: chunk.textDelta,
            accumulatedText: output,
            providerId: provider.providerId,
            model: provider.model,
            emittedAt: new Date().toISOString(),
          };
          continue;
        }
        if (chunk.type === "done") {
          usage = chunk.usage;
          continue;
        }
        if (chunk.type === "error") {
          throw new SkillRuntimeError(
            "skill_stream_error",
            chunk.error ?? "unknown_error",
          );
        }
      }

      let feedbackId: string | undefined;
      if (persist) {
        const feedback = await this.deps.persistFeedback({
          id: runId,
          projectId: input.context.projectId,
          chapterId: input.context.chapterId,
          type: "skill",
          trigger: `skill:${input.triggerType}:${skillId}`,
          payload: {
            text: output,
            skillId,
            skillName: input.skill.name,
            providerId: provider.providerId,
            model: provider.model,
            usage,
          },
        });
        feedbackId = feedback.id;
      }

      yield {
        type: "done",
        runId,
        skillId,
        status: "completed",
        output,
        usage,
        feedbackId,
        finishedAt: new Date().toISOString(),
      };
    } catch (error) {
      yield {
        type: "done",
        runId,
        skillId,
        status: "failed",
        output,
        usage,
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date().toISOString(),
      };
    } finally {
      this.cancelled.delete(runId);
    }
  }
}
