import type { LLMChunk, LLMRequest, LLMVendor } from "./types";

export interface LLMProvider {
  id: string;
  label: string;
  vendor: LLMVendor;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  tags: string[];

  complete(req: LLMRequest): AsyncIterable<LLMChunk>;
  estimateTokens(text: string): number;
}
