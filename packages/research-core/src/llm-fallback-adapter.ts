import { ResearchError } from "./types";
import type {
  LlmSummarizeCallback,
  ResearchProviderAdapter,
  SearchInput,
} from "./adapter";
import type { ResearchSearchHit } from "@inkforge/shared";

/**
 * When no network provider is configured, fall back to letting the current
 * LLM provider produce a "based on training data" overview. Marked so the UI
 * can show "non-realtime" hint.
 */
export function createLlmFallbackAdapter(
  summarize: LlmSummarizeCallback,
): ResearchProviderAdapter {
  return {
    id: "llm-fallback",
    label: "LLM 综述（无需 key，非实时）",
    requiresApiKey: false,
    async search(input: SearchInput): Promise<ResearchSearchHit[]> {
      const topK = Math.min(Math.max(input.topK ?? 3, 1), 5);
      try {
        const hits = await summarize({ query: input.query, topK });
        return hits.map<ResearchSearchHit>((hit) => ({
          ...hit,
          provider: "llm-fallback",
        }));
      } catch (error) {
        throw new ResearchError(
          "llm_fallback_failed",
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  };
}
