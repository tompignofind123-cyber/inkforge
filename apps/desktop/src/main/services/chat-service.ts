import { randomUUID } from "crypto";
import type { LLMChatInput, LLMChatResponse } from "@inkforge/shared";
import { logger } from "./logger";
import {
  resolveApiKey,
  resolveProviderRecord,
  streamText,
} from "./llm-runtime";
import { resolveSceneBinding } from "./scene-binding-service";
import { buildRagBlock } from "./rag-service";
import { RateLimiter } from "./rate-limiter";

const chatRateLimiter = new RateLimiter({ max: 30, windowMs: 60_000 });

const DEFAULT_SYSTEM_PROMPT = [
  "你是一位中文小说的写作伙伴，性格温和、实用、简洁。",
  "回答默认不超过 200 字，必要时可分点；不要长篇大论；不要改写用户原文除非被明确要求。",
  "当被问到情节、人物、设定时，给出具体可执行的选项；当被问到文笔时，给出一条最关键建议。",
].join("\n");

function buildSystemPrompt(custom: string | undefined, chapterExcerpt?: string): string {
  const base = custom && custom.trim() ? custom.trim() : DEFAULT_SYSTEM_PROMPT;
  const excerpt = (chapterExcerpt ?? "").trim();
  if (!excerpt) return base;
  const slice = excerpt.length > 1200 ? excerpt.slice(0, 1200) + "…" : excerpt;
  return `${base}\n\n【当前章节片段（仅供参考，勿直接复述）】\n${slice}`;
}

function sanitizeHistory(messages: LLMChatInput["messages"]): LLMChatInput["messages"] {
  const cleaned = messages
    .map((m) => ({ role: m.role, content: (m.content ?? "").trim() }))
    .filter((m) => m.content.length > 0);
  // Keep at most last 20 turns to bound tokens.
  return cleaned.slice(-20);
}

export async function runChat(input: LLMChatInput): Promise<LLMChatResponse> {
  const messageId = randomUUID();
  const startedAt = Date.now();

  if (!chatRateLimiter.check("global")) {
    return {
      messageId,
      status: "failed",
      error: "rate_limited",
      durationMs: Date.now() - startedAt,
      providerId: input.providerId ?? "",
    };
  }
  chatRateLimiter.touch("global");

  const history = sanitizeHistory(input.messages);
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return {
      messageId,
      status: "failed",
      error: "empty_user_message",
      durationMs: Date.now() - startedAt,
      providerId: input.providerId ?? "",
    };
  }

  const resolvedScene = resolveSceneBinding("chat", {
    explicitProviderId: input.providerId,
  });
  const record = resolveProviderRecord(
    resolvedScene.providerId ?? input.providerId,
  );
  if (!record) {
    return {
      messageId,
      status: "failed",
      error: "provider_not_configured",
      durationMs: Date.now() - startedAt,
      providerId: input.providerId ?? "",
    };
  }

  const apiKey = await resolveApiKey(record);
  if (!apiKey) {
    return {
      messageId,
      status: "failed",
      error: "api_key_missing",
      durationMs: Date.now() - startedAt,
      providerId: record.id,
    };
  }

  const systemPrompt = buildSystemPrompt(input.systemPrompt, input.chapterExcerpt);
  const ragQuery = [
    input.chapterExcerpt,
    history[history.length - 1]?.content,
  ]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join("\n");
  const ragBlock = buildRagBlock(input.projectId, ragQuery);
  const messages = ragBlock
    ? history.map((item, i) =>
        i === history.length - 1 && item.role === "user"
          ? { role: item.role, content: `${ragBlock}\n${item.content}` }
          : { role: item.role, content: item.content },
      )
    : history.map((item) => ({ role: item.role, content: item.content }));

  let accumulated = "";
  try {
    const stream = streamText({
      providerRecord: record,
      apiKey,
      model: input.model ?? record.defaultModel,
      systemPrompt,
      temperature: input.temperature ?? 0.6,
      maxTokens: input.maxTokens ?? 600,
      messages,
    });
    for await (const chunk of stream) {
      if (chunk.type === "delta" && chunk.textDelta) accumulated += chunk.textDelta;
      if (chunk.type === "error" && chunk.error) throw new Error(chunk.error);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("chat failed", message);
    return {
      messageId,
      status: "failed",
      error: message,
      durationMs: Date.now() - startedAt,
      providerId: record.id,
    };
  }

  return {
    messageId,
    status: "completed",
    text: accumulated.trim(),
    durationMs: Date.now() - startedAt,
    providerId: record.id,
  };
}
