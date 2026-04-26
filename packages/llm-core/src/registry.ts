import { AnthropicProvider, type AnthropicProviderConfig } from "./providers/anthropic-provider";
import { OpenAIProvider, type OpenAIProviderConfig } from "./providers/openai-provider";
import { OpenAICompatProvider } from "./providers/openai-compat-provider";
import { GeminiProvider, type GeminiProviderConfig } from "./providers/gemini-provider";
import type { LLMProvider } from "./provider";
import type { LLMVendor } from "./types";

export interface ProviderRegistryConfig {
  id: string;
  label: string;
  vendor: LLMVendor;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  tags?: string[];
  /** Extra vendor-specific options (e.g. betaHeaders for anthropic). */
  options?: Record<string, unknown>;
}

export function createProvider(cfg: ProviderRegistryConfig): LLMProvider {
  switch (cfg.vendor) {
    case "anthropic": {
      const opts = (cfg.options ?? {}) as Partial<AnthropicProviderConfig>;
      return new AnthropicProvider({
        id: cfg.id,
        label: cfg.label,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        defaultModel: cfg.defaultModel,
        tags: cfg.tags,
        betaHeaders: opts.betaHeaders,
        claudeCodeCompat: opts.claudeCodeCompat,
      });
    }
    case "openai": {
      const opts = (cfg.options ?? {}) as Partial<OpenAIProviderConfig>;
      return new OpenAIProvider({
        id: cfg.id,
        label: cfg.label,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        defaultModel: cfg.defaultModel,
        tags: cfg.tags,
        extraHeaders: opts.extraHeaders,
        timeoutMs: opts.timeoutMs,
      });
    }
    case "openai-compat": {
      const opts = (cfg.options ?? {}) as Partial<OpenAIProviderConfig>;
      return new OpenAICompatProvider({
        id: cfg.id,
        label: cfg.label,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        defaultModel: cfg.defaultModel,
        tags: cfg.tags,
        extraHeaders: opts.extraHeaders,
        timeoutMs: opts.timeoutMs,
      });
    }
    case "gemini": {
      const opts = (cfg.options ?? {}) as Partial<GeminiProviderConfig>;
      return new GeminiProvider({
        id: cfg.id,
        label: cfg.label,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        defaultModel: cfg.defaultModel,
        tags: cfg.tags,
        timeoutMs: opts.timeoutMs,
      });
    }
    default: {
      const exhaustive: never = cfg.vendor;
      throw new Error(`Unknown provider vendor: ${String(exhaustive)}`);
    }
  }
}
