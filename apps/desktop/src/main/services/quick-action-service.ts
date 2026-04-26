import { randomUUID } from "crypto";
import {
  insertFeedback,
} from "@inkforge/storage";
import type {
  LLMQuickActionInput,
  LLMQuickActionKind,
  LLMQuickActionResponse,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";
import { logger } from "./logger";
import {
  resolveApiKey,
  resolveProviderRecord,
  streamText,
} from "./llm-runtime";
import { RateLimiter } from "./rate-limiter";

const quickActionRateLimiter = new RateLimiter({ max: 20, windowMs: 60_000 });

interface Prompt {
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
  expectOptions: boolean;
}

function buildPrompt(input: LLMQuickActionInput): Prompt {
  const sel = (input.selectedText ?? "").trim();
  const ctxBefore = (input.contextBefore ?? "").trim();
  const ctxAfter = (input.contextAfter ?? "").trim();
  const extra = input.extraInstruction?.trim();
  const optionsCount = input.options ?? 3;

  switch (input.kind) {
    case "polish":
      return {
        system: [
          "你是一位中文小说的润色编辑。",
          "只输出改写后的段落，不要任何解释、不要前后缀、不要引号。",
          "保持原意与长度相近，仅优化遣词、节奏、画面感；禁止新增情节。",
          extra ? `额外要求：${extra}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        user: [
          ctxBefore ? `【前文】\n${ctxBefore}\n` : "",
          `【原文】\n${sel}`,
          ctxAfter ? `\n【后文】\n${ctxAfter}` : "",
        ].join(""),
        temperature: 0.5,
        maxTokens: Math.min(1200, Math.max(200, sel.length * 2 + 120)),
        expectOptions: false,
      };
    case "critique":
      return {
        system: [
          "你是一位中文小说的审稿人。",
          "阅读选中段落，给出一条最值得修改的问题与具体建议（不超过 120 字）。",
          "格式：① 问题：... ② 建议：...",
          "不要重写原文，也不要罗列多条。",
          extra ? `关注点：${extra}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        user: [
          ctxBefore ? `【前文】\n${ctxBefore}\n` : "",
          `【选段】\n${sel}`,
          ctxAfter ? `\n【后文】\n${ctxAfter}` : "",
        ].join(""),
        temperature: 0.4,
        maxTokens: 300,
        expectOptions: false,
      };
    case "continue":
      return {
        system: [
          "你是一位中文小说续写助手。",
          "基于已有文本，自然接续 1-2 段（不超过 300 字），不要重复已写内容。",
          "直接输出正文，不要标题、不要解释。",
          extra ? `语气提示：${extra}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        user: [
          ctxBefore ? `【前文】\n${ctxBefore}\n` : "",
          sel ? `【光标处已选】\n${sel}\n` : "",
          "请在此之后续写。",
        ].join(""),
        temperature: 0.7,
        maxTokens: 500,
        expectOptions: false,
      };
    case "inspire":
      return {
        system: [
          `你是一位中文小说的灵感伙伴。基于上下文，给出 ${optionsCount} 条走向不同的短续写（每条 30-80 字）。`,
          "要求：方向彼此区分（如情感推进 / 冲突升级 / 意外转折）；直接可用、不要编号前的解释；",
          "输出严格使用 JSON 数组：[\"...\",\"...\",\"...\"]；不要任何其他字符。",
          extra ? `偏好：${extra}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        user: [
          ctxBefore ? `【前文】\n${ctxBefore}\n` : "",
          sel ? `【当前选段】\n${sel}\n` : "",
          ctxAfter ? `【后文】\n${ctxAfter}\n` : "",
          `请给出 ${optionsCount} 条走向不同的续写。`,
        ].join(""),
        temperature: 0.9,
        maxTokens: 700,
        expectOptions: true,
      };
    case "rephrase":
      return {
        system: [
          `你是一位中文小说的代入改写助手。给出 ${optionsCount} 种不同语气的改写。`,
          "每条改写保持原意、长度相近；语气彼此区分（如冷静克制 / 激烈直白 / 诗意婉转）。",
          "输出严格使用 JSON 数组：[\"...\",\"...\",\"...\"]，不要解释。",
          input.persona ? `以该人物口吻改写：${input.persona}` : "",
          extra ? `额外要求：${extra}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        user: `【原文】\n${sel}`,
        temperature: 0.7,
        maxTokens: 800,
        expectOptions: true,
      };
    default:
      throw new Error(`unknown quick action kind: ${input.kind as string}`);
  }
}

function parseOptions(raw: string, expected: number): string[] {
  const trimmed = raw.trim();
  // Strip code fences if any
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter((s) => s.length > 0)
        .slice(0, Math.max(expected, 1));
    }
  } catch {
    // fall through to heuristic split
  }
  const byLine = cleaned
    .split(/\n+/)
    .map((s) => s.replace(/^\s*[-*\d.、)]+\s*/, "").trim())
    .filter((s) => s.length > 0);
  if (byLine.length > 1) return byLine.slice(0, Math.max(expected, 1));
  return [cleaned];
}

export async function runQuickAction(
  input: LLMQuickActionInput,
): Promise<LLMQuickActionResponse> {
  const actionId = randomUUID();
  const startedAt = Date.now();

  if (!quickActionRateLimiter.check("global")) {
    return {
      actionId,
      kind: input.kind,
      status: "failed",
      error: "rate_limited",
      durationMs: Date.now() - startedAt,
      providerId: input.providerId ?? "",
    };
  }
  quickActionRateLimiter.touch("global");

  const ctx = getAppContext();
  const record = resolveProviderRecord(input.providerId);
  if (!record) {
    return {
      actionId,
      kind: input.kind,
      status: "failed",
      error: "provider_not_configured",
      durationMs: Date.now() - startedAt,
      providerId: input.providerId ?? "",
    };
  }

  const apiKey = await resolveApiKey(record);
  if (!apiKey) {
    return {
      actionId,
      kind: input.kind,
      status: "failed",
      error: "api_key_missing",
      durationMs: Date.now() - startedAt,
      providerId: record.id,
    };
  }

  const prompt = buildPrompt(input);

  let accumulated = "";
  try {
    const stream = streamText({
      providerRecord: record,
      apiKey,
      model: input.model ?? record.defaultModel,
      systemPrompt: prompt.system,
      temperature: input.temperature ?? prompt.temperature,
      maxTokens: input.maxTokens ?? prompt.maxTokens,
      userMessage: prompt.user,
    });
    for await (const chunk of stream) {
      if (chunk.type === "delta" && chunk.textDelta) accumulated += chunk.textDelta;
      if (chunk.type === "error" && chunk.error) throw new Error(chunk.error);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`quick action ${input.kind} failed`, message);
    return {
      actionId,
      kind: input.kind,
      status: "failed",
      error: message,
      durationMs: Date.now() - startedAt,
      providerId: record.id,
    };
  }

  const durationMs = Date.now() - startedAt;
  if (prompt.expectOptions) {
    const options = parseOptions(accumulated, input.options ?? 3);
    return {
      actionId,
      kind: input.kind,
      status: "completed",
      options,
      durationMs,
      providerId: record.id,
    };
  }
  const finalText = accumulated.trim();
  // Persist critique into ai_feedbacks so it lands in the timeline.
  if (input.kind === "critique" && input.projectId && input.chapterId && finalText) {
    try {
      insertFeedback(ctx.db, {
        id: actionId,
        projectId: input.projectId,
        chapterId: input.chapterId,
        type: "critique",
        payload: {
          text: finalText,
          providerId: record.id,
          model: input.model ?? record.defaultModel,
        },
        trigger: "selection-critique",
      });
    } catch (error) {
      logger.warn("failed to persist critique feedback", error);
    }
  }
  return {
    actionId,
    kind: input.kind,
    status: "completed",
    text: finalText,
    durationMs,
    providerId: record.id,
  };
}

// exported for type reuse by IPC layer
export type { LLMQuickActionKind };
