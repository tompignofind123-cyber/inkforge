import { ResearchError } from "./types";
import type {
  AdapterDeps,
  ResearchProviderAdapter,
  SearchInput,
} from "./adapter";
import type { ResearchSearchHit } from "@inkforge/shared";

const TAVILY_URL = "https://api.tavily.com/search";
const DEFAULT_TIMEOUT_MS = 15000;

export function createTavilyAdapter(deps: AdapterDeps = {}): ResearchProviderAdapter {
  const fetchFn = deps.fetchFn ?? fetch;
  return {
    id: "tavily",
    label: "Tavily（中文友好，需 key）",
    requiresApiKey: true,
    async search(input: SearchInput): Promise<ResearchSearchHit[]> {
      if (!input.apiKey) {
        throw new ResearchError(
          "missing_api_key",
          "tavily requires an API key; configure one in research credentials",
        );
      }
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      try {
        const res = await fetchFn(TAVILY_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${input.apiKey}`,
          },
          body: JSON.stringify({
            query: input.query,
            max_results: Math.min(Math.max(input.topK ?? 5, 1), 10),
            search_depth: "basic",
            include_answer: false,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new ResearchError(
            "tavily_http_error",
            `tavily responded ${res.status}: ${await safeText(res)}`,
          );
        }
        const body = (await res.json()) as {
          results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
        };
        const hits = (body.results ?? [])
          .filter((r) => typeof r?.url === "string" && typeof r?.title === "string")
          .map<ResearchSearchHit>((r) => ({
            title: r.title ?? "",
            url: r.url ?? "",
            snippet: (r.content ?? "").trim(),
            provider: "tavily",
            score: typeof r.score === "number" ? r.score : undefined,
          }));
        return hits;
      } catch (error) {
        if (error instanceof ResearchError) throw error;
        throw new ResearchError(
          "tavily_request_failed",
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}
