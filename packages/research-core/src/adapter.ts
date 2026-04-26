import type { ResearchProvider, ResearchSearchHit } from "@inkforge/shared";

export interface SearchInput {
  query: string;
  topK?: number;
  timeoutMs?: number;
  apiKey?: string;
}

export interface ResearchProviderAdapter {
  id: ResearchProvider;
  label: string;
  requiresApiKey: boolean;
  search(input: SearchInput): Promise<ResearchSearchHit[]>;
}

export type LlmSummarizeCallback = (options: {
  query: string;
  topK: number;
}) => Promise<ResearchSearchHit[]>;

export interface AdapterDeps {
  fetchFn?: typeof fetch;
}
