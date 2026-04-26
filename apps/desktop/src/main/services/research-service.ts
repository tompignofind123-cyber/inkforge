import { randomUUID } from "crypto";
import {
  createBingAdapter,
  createLlmFallbackAdapter,
  createSerpapiAdapter,
  createTavilyAdapter,
  type ResearchProviderAdapter,
} from "@inkforge/research-core";
import {
  deleteResearchNote,
  getResearchNoteById,
  insertResearchNote,
  listResearchNotes,
  updateResearchNote,
} from "@inkforge/storage";
import type {
  ResearchCredentialDeleteInput,
  ResearchCredentialStatus,
  ResearchCredentialStatusInput,
  ResearchCredentialUpsertInput,
  ResearchDeleteInput,
  ResearchGetInput,
  ResearchListInput,
  ResearchNoteRecord,
  ResearchProvider,
  ResearchSaveInput,
  ResearchSearchHit,
  ResearchSearchInput,
  ResearchSearchResponse,
  ResearchUpdateInput,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";
import { logger } from "./logger";
import {
  resolveApiKey,
  resolveProviderRecord,
  streamText,
} from "./llm-runtime";

const CREDENTIAL_PROVIDERS: ResearchProvider[] = ["tavily", "bing", "serpapi"];

function credentialAccount(provider: ResearchProvider): string {
  return `research:${provider}`;
}

async function readCredential(provider: ResearchProvider): Promise<string | null> {
  if (!CREDENTIAL_PROVIDERS.includes(provider)) return null;
  const ctx = getAppContext();
  return ctx.keystore.getKey(credentialAccount(provider), null);
}

async function writeCredential(
  provider: ResearchProvider,
  apiKey: string,
): Promise<void> {
  if (!CREDENTIAL_PROVIDERS.includes(provider)) {
    throw new Error(`credentials not supported for provider: ${provider}`);
  }
  const ctx = getAppContext();
  await ctx.keystore.setKey(credentialAccount(provider), apiKey);
}

async function removeCredential(provider: ResearchProvider): Promise<void> {
  const ctx = getAppContext();
  await ctx.keystore.deleteKey(credentialAccount(provider));
}

async function buildLlmFallbackHits(options: {
  query: string;
  topK: number;
}): Promise<ResearchSearchHit[]> {
  const record = resolveProviderRecord();
  if (!record) {
    throw new Error("llm_fallback_requires_provider");
  }
  const apiKey = await resolveApiKey(record);
  if (!apiKey) {
    throw new Error("llm_fallback_api_key_missing");
  }
  const system = [
    "你是资料综述助手，当前无网络检索 API 可用。",
    "请基于自身训练数据对用户查询给出 3~5 条最有用的综述条目。",
    "每条必须包含：title（≤20 字）/ url（可留空字符串）/ snippet（60~180 字，指明来源类型）。",
    "严格输出 JSON 数组，不要任何注释或 Markdown 围栏。",
  ].join("\n");
  const user = `查询：${options.query}\n期望条目数：${options.topK}`;
  let accumulated = "";
  const stream = streamText({
    providerRecord: record,
    apiKey,
    model: record.defaultModel,
    systemPrompt: system,
    userMessage: user,
    temperature: 0.2,
    maxTokens: 900,
  });
  for await (const chunk of stream) {
    if (chunk.type === "delta" && chunk.textDelta) {
      accumulated += chunk.textDelta;
    }
    if (chunk.type === "error") {
      throw new Error(chunk.error ?? "llm_fallback_stream_error");
    }
  }
  const parsed = tryParseJsonArray(accumulated);
  if (!parsed) {
    throw new Error("llm_fallback_invalid_json");
  }
  return parsed
    .filter(
      (item): item is { title: string; url?: string; snippet?: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { title?: unknown }).title === "string",
    )
    .slice(0, options.topK)
    .map<ResearchSearchHit>((item) => ({
      title: item.title,
      url: typeof item.url === "string" ? item.url : "",
      snippet: typeof item.snippet === "string" ? item.snippet : "",
      provider: "llm-fallback",
    }));
}

function tryParseJsonArray(text: string): unknown[] | null {
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket === -1 || lastBracket <= firstBracket) return null;
  const jsonSlice = text.slice(firstBracket, lastBracket + 1);
  try {
    const parsed = JSON.parse(jsonSlice);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

let llmFallbackAdapterInstance: ResearchProviderAdapter | null = null;
function getLlmFallbackAdapter(): ResearchProviderAdapter {
  if (!llmFallbackAdapterInstance) {
    llmFallbackAdapterInstance = createLlmFallbackAdapter(buildLlmFallbackHits);
  }
  return llmFallbackAdapterInstance;
}

function adapterFor(provider: ResearchProvider): ResearchProviderAdapter {
  switch (provider) {
    case "tavily":
      return createTavilyAdapter();
    case "bing":
      return createBingAdapter();
    case "serpapi":
      return createSerpapiAdapter();
    case "llm-fallback":
    case "manual":
    default:
      return getLlmFallbackAdapter();
  }
}

export async function searchResearch(
  input: ResearchSearchInput,
): Promise<ResearchSearchResponse> {
  const query = input.query.trim();
  if (!query) {
    return {
      hits: [],
      usedProvider: "llm-fallback",
      error: "empty_query",
    };
  }
  const preferred: ResearchProvider = input.provider ?? "llm-fallback";
  const topK = input.topK ?? 5;

  const attempts: ResearchProvider[] = [preferred];
  if (preferred !== "llm-fallback") attempts.push("llm-fallback");

  let lastError: string | undefined;
  for (const providerId of attempts) {
    const adapter = adapterFor(providerId);
    try {
      const apiKey =
        adapter.requiresApiKey && !input.apiKey
          ? (await readCredential(providerId)) ?? undefined
          : input.apiKey;
      if (adapter.requiresApiKey && !apiKey) {
        lastError = `${providerId}_api_key_missing`;
        continue;
      }
      const hits = await adapter.search({ query, topK, apiKey });
      return {
        hits,
        usedProvider: providerId,
        fellBackToLlm: providerId === "llm-fallback" && preferred !== "llm-fallback",
        error: hits.length === 0 ? "no_hits" : undefined,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.warn(`research adapter ${providerId} failed`, lastError);
    }
  }

  return {
    hits: [],
    usedProvider: "llm-fallback",
    fellBackToLlm: true,
    error: lastError ?? "all_providers_failed",
  };
}

export function saveResearchNote(input: ResearchSaveInput): ResearchNoteRecord {
  const ctx = getAppContext();
  return insertResearchNote(ctx.db, {
    id: randomUUID(),
    projectId: input.projectId,
    topic: input.topic,
    sourceUrl: input.sourceUrl ?? null,
    sourceTitle: input.sourceTitle ?? null,
    sourceProvider: input.sourceProvider,
    excerpt: input.excerpt,
    note: input.note ?? "",
    tags: input.tags ?? [],
  });
}

export function listResearchNoteRecords(
  input: ResearchListInput,
): ResearchNoteRecord[] {
  const ctx = getAppContext();
  return listResearchNotes(ctx.db, {
    projectId: input.projectId,
    topic: input.topic,
    limit: input.limit,
  });
}

export function getResearchNote(input: ResearchGetInput): ResearchNoteRecord | null {
  const ctx = getAppContext();
  return getResearchNoteById(ctx.db, input.id);
}

export function updateResearchNoteRecord(
  input: ResearchUpdateInput,
): ResearchNoteRecord {
  const ctx = getAppContext();
  return updateResearchNote(ctx.db, {
    id: input.id,
    topic: input.topic,
    note: input.note,
    tags: input.tags,
  });
}

export function deleteResearchNoteRecord(
  input: ResearchDeleteInput,
): { id: string } {
  const ctx = getAppContext();
  deleteResearchNote(ctx.db, input.id);
  return { id: input.id };
}

export async function getResearchCredentialStatuses(
  input: ResearchCredentialStatusInput,
): Promise<ResearchCredentialStatus[]> {
  const providers =
    input.providers && input.providers.length > 0
      ? input.providers.filter((p) => CREDENTIAL_PROVIDERS.includes(p))
      : CREDENTIAL_PROVIDERS;
  const results: ResearchCredentialStatus[] = [];
  for (const provider of providers) {
    const key = await readCredential(provider);
    results.push({ provider, configured: !!key });
  }
  return results;
}

export async function upsertResearchCredential(
  input: ResearchCredentialUpsertInput,
): Promise<ResearchCredentialStatus> {
  const trimmed = input.apiKey?.trim() ?? "";
  if (trimmed.length === 0) {
    throw new Error("apiKey cannot be empty");
  }
  await writeCredential(input.provider, trimmed);
  return { provider: input.provider, configured: true };
}

export async function deleteResearchCredential(
  input: ResearchCredentialDeleteInput,
): Promise<ResearchCredentialStatus> {
  await removeCredential(input.provider);
  return { provider: input.provider, configured: false };
}
