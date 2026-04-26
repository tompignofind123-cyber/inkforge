import { createProvider } from "@inkforge/llm-core";
import type { LLMMessage, LLMProvider } from "@inkforge/llm-core";
import {
  getFirstProviderPersistenceRecord,
  getProviderPersistenceRecord,
  listProviderKeyPersistenceRecords,
  markProviderKeyFailure,
  markProviderKeySuccess,
  type ProviderKeyPersistence,
  type ProviderPersistenceRecord,
} from "@inkforge/storage";
import type {
  ProviderHealthSnapshot,
  ProviderKeyHealth,
  ProviderKeyStrategy,
  SkillRunUsage,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";

export function resolveProviderRecord(providerId?: string): ProviderPersistenceRecord | null {
  const ctx = getAppContext();
  return providerId
    ? getProviderPersistenceRecord(ctx.db, providerId)
    : getFirstProviderPersistenceRecord(ctx.db);
}

// In-memory rotation + sticky state per provider
const rotationIndex = new Map<string, number>();
const stickyKey = new Map<string, string>();

function now(): number {
  return Date.now();
}

function isCoolingDown(
  key: ProviderKeyPersistence,
  cooldownMs: number,
): boolean {
  if (!key.lastFailedAt) return false;
  const lastFailedMs = new Date(key.lastFailedAt).getTime();
  if (Number.isNaN(lastFailedMs)) return false;
  return now() - lastFailedMs < cooldownMs;
}

function pickWeighted(
  keys: ProviderKeyPersistence[],
): ProviderKeyPersistence | null {
  const totalWeight = keys.reduce((sum, k) => sum + Math.max(0, k.weight), 0);
  if (totalWeight <= 0) return keys[0] ?? null;
  let roll = Math.random() * totalWeight;
  for (const key of keys) {
    const w = Math.max(0, key.weight);
    if (roll < w) return key;
    roll -= w;
  }
  return keys[keys.length - 1] ?? null;
}

function pickRoundRobin(
  providerId: string,
  keys: ProviderKeyPersistence[],
): ProviderKeyPersistence | null {
  if (keys.length === 0) return null;
  const prev = rotationIndex.get(providerId) ?? -1;
  const nextIdx = (prev + 1) % keys.length;
  rotationIndex.set(providerId, nextIdx);
  return keys[nextIdx];
}

function pickSticky(
  providerId: string,
  keys: ProviderKeyPersistence[],
): ProviderKeyPersistence | null {
  if (keys.length === 0) return null;
  const current = stickyKey.get(providerId);
  if (current) {
    const found = keys.find((k) => k.id === current);
    if (found) return found;
  }
  const picked = keys[0];
  stickyKey.set(providerId, picked.id);
  return picked;
}

function selectByStrategy(
  providerId: string,
  strategy: ProviderKeyStrategy,
  keys: ProviderKeyPersistence[],
): ProviderKeyPersistence | null {
  if (keys.length === 0) return null;
  if (keys.length === 1) return keys[0];
  switch (strategy) {
    case "weighted":
      return pickWeighted(keys);
    case "round-robin":
      return pickRoundRobin(providerId, keys);
    case "sticky":
      return pickSticky(providerId, keys);
    case "single":
    default:
      return keys[0];
  }
}

async function readPlainKey(
  record: ProviderPersistenceRecord,
  key: ProviderKeyPersistence,
): Promise<string | null> {
  const ctx = getAppContext();
  const primary = await ctx.keystore.getKey(key.id, key.encrypted);
  if (primary) return primary;
  // Legacy fallback: migrated "primary" key retains its keytar entry under the provider id.
  if (key.id === `${record.id}-primary` || key.id === record.id) {
    const legacy = await ctx.keystore.getKey(record.id, record.encrypted);
    if (legacy) return legacy;
  }
  return null;
}

export interface PickedKey {
  keyId: string;
  apiKey: string;
}

async function tryKeys(
  record: ProviderPersistenceRecord,
  keys: ProviderKeyPersistence[],
): Promise<PickedKey | null> {
  for (const key of keys) {
    const plain = await readPlainKey(record, key);
    if (plain) return { keyId: key.id, apiKey: plain };
  }
  return null;
}

export async function pickProviderKey(
  record: ProviderPersistenceRecord,
): Promise<PickedKey | null> {
  const ctx = getAppContext();
  const allKeys = listProviderKeyPersistenceRecords(ctx.db, record.id);
  const enabled = allKeys.filter((k) => !k.disabled);
  if (enabled.length === 0) {
    // Legacy single-key fallback
    const legacy = await ctx.keystore.getKey(record.id, record.encrypted);
    return legacy ? { keyId: record.id, apiKey: legacy } : null;
  }
  const ready = enabled.filter((k) => !isCoolingDown(k, record.cooldownMs));
  const candidates = ready.length > 0 ? ready : enabled;
  const picked = selectByStrategy(record.id, record.keyStrategy, candidates);
  if (!picked) return null;
  const plain = await readPlainKey(record, picked);
  if (plain) return { keyId: picked.id, apiKey: plain };
  // Primary pick missing, fall back to any remaining key with a secret.
  const remaining = candidates.filter((k) => k.id !== picked.id);
  return tryKeys(record, remaining);
}

export async function resolveApiKey(
  record: ProviderPersistenceRecord,
): Promise<string | null> {
  const picked = await pickProviderKey(record);
  return picked?.apiKey ?? null;
}

export function reportProviderKeyResult(keyId: string, ok: boolean): void {
  const ctx = getAppContext();
  if (ok) markProviderKeySuccess(ctx.db, keyId);
  else markProviderKeyFailure(ctx.db, keyId);
}

export function getProviderHealth(providerId: string): ProviderHealthSnapshot {
  const ctx = getAppContext();
  const record = getProviderPersistenceRecord(ctx.db, providerId);
  const keys = listProviderKeyPersistenceRecords(ctx.db, providerId);
  const cooldownMs = record?.cooldownMs ?? 60000;
  return {
    providerId,
    strategy: record?.keyStrategy ?? "single",
    cooldownMs,
    keys: keys.map<ProviderKeyHealth>((key) => ({
      keyId: key.id,
      label: key.label,
      disabled: key.disabled,
      recentSuccesses: 0,
      recentFailures: key.failCount,
      cooldownUntil:
        key.lastFailedAt && isCoolingDown(key, cooldownMs)
          ? new Date(new Date(key.lastFailedAt).getTime() + cooldownMs).toISOString()
          : null,
    })),
  };
}

export function instantiateProvider(
  record: ProviderPersistenceRecord,
  apiKey: string,
): LLMProvider {
  return createProvider({
    id: record.id,
    label: record.label,
    vendor: record.vendor,
    baseUrl: record.baseUrl,
    apiKey,
    defaultModel: record.defaultModel,
    tags: record.tags,
  });
}

export interface StreamTextInput {
  providerRecord: ProviderPersistenceRecord;
  apiKey: string;
  systemPrompt?: string;
  userMessage?: string;
  messages?: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface StreamTextChunk {
  type: "delta" | "done" | "error";
  textDelta?: string;
  error?: string;
  usage?: SkillRunUsage;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractUsage(raw: unknown): SkillRunUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const data = raw as {
    usage?: Record<string, unknown>;
    message?: { usage?: Record<string, unknown> };
    usageMetadata?: Record<string, unknown>;
  };
  const usage = data.usage ?? data.message?.usage ?? data.usageMetadata;
  if (!usage) return undefined;
  const inputTokens =
    toNumber(usage.input_tokens) ??
    toNumber(usage.inputTokens) ??
    toNumber(usage.prompt_tokens) ??
    toNumber(usage.promptTokenCount);
  const outputTokens =
    toNumber(usage.output_tokens) ??
    toNumber(usage.outputTokens) ??
    toNumber(usage.completion_tokens) ??
    toNumber(usage.candidatesTokenCount);
  const totalTokens =
    toNumber(usage.total_tokens) ??
    toNumber(usage.totalTokens) ??
    toNumber(usage.totalTokenCount);
  if (inputTokens === null && outputTokens === null && totalTokens === null) return undefined;
  const inTokens = inputTokens ?? 0;
  const outTokens = outputTokens ?? 0;
  return {
    inputTokens: inTokens,
    outputTokens: outTokens,
    totalTokens: totalTokens ?? inTokens + outTokens,
  };
}

function normalizeMessages(input: StreamTextInput): LLMMessage[] {
  if (input.messages && input.messages.length > 0) {
    return input.messages;
  }
  return [{ role: "user", content: input.userMessage ?? "" }];
}

export async function* streamText(
  input: StreamTextInput,
): AsyncIterable<StreamTextChunk> {
  const provider = instantiateProvider(input.providerRecord, input.apiKey);
  const messages = normalizeMessages(input);
  const stream = provider.complete({
    model: input.model ?? input.providerRecord.defaultModel,
    systemPrompt: input.systemPrompt,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    messages,
  });

  for await (const chunk of stream) {
    if (chunk.type === "delta" && chunk.textDelta) {
      yield {
        type: "delta",
        textDelta: chunk.textDelta,
      };
      continue;
    }
    if (chunk.type === "error") {
      yield {
        type: "error",
        error: chunk.error ?? "unknown_error",
      };
      continue;
    }
    if (chunk.type === "done") {
      yield {
        type: "done",
        usage: extractUsage(chunk.raw),
      };
    }
  }
}
