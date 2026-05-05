import {
  getProviderPersistenceRecord,
} from "@inkforge/storage";
import type {
  ProviderListRemoteModelsInput,
  ProviderListRemoteModelsResponse,
  ProviderVendor,
  RemoteModelInfo,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";

interface ResolvedCredentials {
  vendor: ProviderVendor;
  baseUrl: string;
  apiKey: string;
}

async function resolveCredentials(
  input: ProviderListRemoteModelsInput,
): Promise<ResolvedCredentials> {
  if (input.providerId) {
    const ctx = getAppContext();
    const record = getProviderPersistenceRecord(ctx.db, input.providerId);
    if (!record) throw new Error("provider_not_found");
    const apiKey = (await ctx.keystore.getKey(record.id, record.encrypted)) ?? "";
    return {
      vendor: record.vendor,
      baseUrl: record.baseUrl,
      apiKey,
    };
  }
  if (!input.vendor) throw new Error("vendor_required_for_adhoc");
  return {
    vendor: input.vendor,
    baseUrl: (input.baseUrl ?? "").trim(),
    apiKey: (input.apiKey ?? "").trim(),
  };
}

// ---------------------------------------------------------------------------
// Vendor adapters — each returns a normalized RemoteModelInfo[]
// ---------------------------------------------------------------------------

function defaultOpenAIBase(vendor: ProviderVendor): string {
  if (vendor === "openai") return "https://api.openai.com";
  return "";
}

async function fetchOpenAICompat(creds: ResolvedCredentials): Promise<RemoteModelInfo[]> {
  const base = (creds.baseUrl || defaultOpenAIBase(creds.vendor)).replace(/\/$/, "");
  if (!base) throw new Error("base_url_missing");
  if (!creds.apiKey) throw new Error("api_key_missing");
  // Most OpenAI-compat backends mount /v1/models or /models; try /v1/models first.
  const url = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? ": " + body.slice(0, 200) : ""}`);
  }
  const data = (await res.json()) as { data?: unknown };
  const list = Array.isArray(data.data) ? data.data : [];
  return list
    .filter((m): m is { id: string; owned_by?: unknown } => {
      return typeof m === "object" && m !== null && typeof (m as { id?: unknown }).id === "string";
    })
    .map<RemoteModelInfo>((m) => ({
      id: m.id,
      ownedBy: typeof m.owned_by === "string" ? m.owned_by : undefined,
    }));
}

async function fetchAnthropic(creds: ResolvedCredentials): Promise<RemoteModelInfo[]> {
  if (!creds.apiKey) throw new Error("api_key_missing");
  const base = (creds.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  const url = `${base}/v1/models`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-key": creds.apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? ": " + body.slice(0, 200) : ""}`);
  }
  const data = (await res.json()) as { data?: unknown };
  const list = Array.isArray(data.data) ? data.data : [];
  return list
    .filter((m): m is { id: string; display_name?: unknown } => {
      return typeof m === "object" && m !== null && typeof (m as { id?: unknown }).id === "string";
    })
    .map<RemoteModelInfo>((m) => ({
      id: m.id,
      displayName: typeof m.display_name === "string" ? m.display_name : undefined,
      ownedBy: "anthropic",
    }));
}

async function fetchGemini(creds: ResolvedCredentials): Promise<RemoteModelInfo[]> {
  if (!creds.apiKey) throw new Error("api_key_missing");
  const base = (creds.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const url = `${base}/v1beta/models?key=${encodeURIComponent(creds.apiKey)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? ": " + body.slice(0, 200) : ""}`);
  }
  const data = (await res.json()) as { models?: unknown };
  const list = Array.isArray(data.models) ? data.models : [];
  return list
    .filter((m): m is { name: string; displayName?: unknown; inputTokenLimit?: unknown; supportedGenerationMethods?: unknown } => {
      return typeof m === "object" && m !== null && typeof (m as { name?: unknown }).name === "string";
    })
    .filter((m) => {
      // Only show models that support generateContent (skip embedding-only / aqa endpoints)
      const methods = m.supportedGenerationMethods;
      if (!Array.isArray(methods)) return true;
      return methods.includes("generateContent");
    })
    .map<RemoteModelInfo>((m) => ({
      // Gemini's `name` is `models/gemini-2.5-pro`; trim prefix to get id usable in API calls.
      id: m.name.startsWith("models/") ? m.name.slice("models/".length) : m.name,
      displayName: typeof m.displayName === "string" ? m.displayName : undefined,
      contextLength: typeof m.inputTokenLimit === "number" ? m.inputTokenLimit : undefined,
      ownedBy: "google",
    }));
}

// ---------------------------------------------------------------------------
// Public service entry
// ---------------------------------------------------------------------------

export async function listRemoteModels(
  input: ProviderListRemoteModelsInput,
): Promise<ProviderListRemoteModelsResponse> {
  const creds = await resolveCredentials(input);
  const start = Date.now();

  let models: RemoteModelInfo[];
  switch (creds.vendor) {
    case "openai":
    case "openai-compat":
      models = await fetchOpenAICompat(creds);
      break;
    case "anthropic":
      models = await fetchAnthropic(creds);
      break;
    case "gemini":
      models = await fetchGemini(creds);
      break;
    default:
      throw new Error(`unsupported_vendor: ${String(creds.vendor)}`);
  }

  // Dedupe + sort: stable + alphabetic, but prefer chat-capable common patterns at top.
  const seen = new Set<string>();
  const dedup: RemoteModelInfo[] = [];
  for (const m of models) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    dedup.push(m);
  }
  dedup.sort((a, b) => a.id.localeCompare(b.id));

  return {
    models: dedup,
    count: dedup.length,
    durationMs: Date.now() - start,
  };
}
