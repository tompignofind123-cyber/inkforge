import type {
  CompactResult,
  SkillRunUsage,
  TavernMessageRecord,
} from "@inkforge/shared";
import { TavernRuntimeError } from "./errors";
import type { LLMMessage } from "./context-builder";

export interface CompactorStreamInput {
  providerId: string;
  model: string;
  systemPrompt: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface CompactorDeps {
  resolveSummaryProvider: (sessionId: string) => Promise<{
    providerId: string;
    model: string;
  }>;
  streamCompletion: (input: CompactorStreamInput) => AsyncIterable<{
    type: "delta" | "done" | "error";
    textDelta?: string;
    error?: string;
    usage?: SkillRunUsage;
  }>;
  replaceMessages: (input: {
    sessionId: string;
    deleteMessageIds: string[];
    insertSummary: {
      id: string;
      content: string;
      tokensIn: number;
      tokensOut: number;
      createdAt: string;
    };
  }) => Promise<TavernMessageRecord>;
  formatSpeakerName: (message: TavernMessageRecord) => string;
}

export interface CompactInput {
  sessionId: string;
  topic: string;
  history: TavernMessageRecord[];
  keepLastK: number;
}

const SUMMARY_SYSTEM_PROMPT = [
  "你是小说酒馆对话的摘要助手。",
  "请把下面的多角色对话压缩为一份结构化摘要，严格遵循以下三段：",
  "1) 已发生事实：列出已经发生的关键事件（动作/决定/冲突）。",
  "2) 角色立场：简要列出每位已出场角色当前的观点与倾向。",
  "3) 未决问题：列出尚未解决的问题与悬念。",
  "要求：仅使用中文；使用短句；不要任何角色扮演或新增剧情。",
  "控制在 400 字以内。",
].join("\n");

function createId(): string {
  return `smry-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatHistory(
  history: TavernMessageRecord[],
  formatSpeakerName: (message: TavernMessageRecord) => string,
): string {
  return history
    .map((msg) => {
      if (msg.role === "summary") return `[历史摘要] ${msg.content}`;
      const label = formatSpeakerName(msg);
      return `[${label}] ${msg.content}`;
    })
    .join("\n");
}

export class SummaryCompactor {
  private readonly deps: CompactorDeps;

  constructor(deps: CompactorDeps) {
    this.deps = deps;
  }

  async compact(input: CompactInput): Promise<CompactResult> {
    const { sessionId, topic, history, keepLastK } = input;
    if (!Number.isFinite(keepLastK) || keepLastK < 0) {
      throw new TavernRuntimeError(
        "invalid_keep_last_k",
        `keepLastK must be a non-negative integer, got ${keepLastK}`,
      );
    }

    const chronological = [...history].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    if (chronological.length <= keepLastK) {
      throw new TavernRuntimeError(
        "nothing_to_compact",
        `no messages older than keepLastK=${keepLastK} available`,
      );
    }
    const toCompact = chronological.slice(0, chronological.length - keepLastK);
    if (toCompact.length === 0) {
      throw new TavernRuntimeError(
        "nothing_to_compact",
        "compact target is empty after applying keepLastK",
      );
    }

    const provider = await this.deps.resolveSummaryProvider(sessionId);

    const historyText = formatHistory(toCompact, this.deps.formatSpeakerName);
    const userPrompt = [
      `议题：${topic}`,
      "以下是需要压缩的历史对话：",
      historyText,
    ].join("\n\n");

    const messages: LLMMessage[] = [
      { role: "user", content: userPrompt },
    ];

    let output = "";
    let usage: SkillRunUsage | undefined;
    const stream = this.deps.streamCompletion({
      providerId: provider.providerId,
      model: provider.model,
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      messages,
      temperature: 0.3,
      maxTokens: 800,
    });
    for await (const chunk of stream) {
      if (chunk.type === "delta" && chunk.textDelta) {
        output += chunk.textDelta;
        continue;
      }
      if (chunk.type === "done") {
        usage = chunk.usage;
        continue;
      }
      if (chunk.type === "error") {
        throw new TavernRuntimeError(
          "summary_stream_error",
          chunk.error ?? "unknown_summary_error",
        );
      }
    }

    const trimmed = output.trim();
    if (trimmed.length === 0) {
      throw new TavernRuntimeError(
        "summary_empty",
        "summary model returned empty content",
      );
    }

    const lastReplacedAt = new Date(toCompact[toCompact.length - 1].createdAt).getTime();
    const summaryCreatedAt = new Date(Math.max(0, lastReplacedAt - 1)).toISOString();
    const summaryId = createId();
    const inserted = await this.deps.replaceMessages({
      sessionId,
      deleteMessageIds: toCompact.map((msg) => msg.id),
      insertSummary: {
        id: summaryId,
        content: trimmed,
        tokensIn: usage?.inputTokens ?? 0,
        tokensOut: usage?.outputTokens ?? 0,
        createdAt: summaryCreatedAt,
      },
    });

    return {
      summaryMessageId: inserted.id,
      replacedMessageCount: toCompact.length,
      usage: {
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        totalTokens: usage?.totalTokens ?? (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
      },
    };
  }
}
