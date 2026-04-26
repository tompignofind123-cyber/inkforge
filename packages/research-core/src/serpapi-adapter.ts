import { ResearchError } from "./types";
import type {
  AdapterDeps,
  ResearchProviderAdapter,
  SearchInput,
} from "./adapter";
import type { ResearchSearchHit } from "@inkforge/shared";

const SERPAPI_URL = "https://serpapi.com/search.json";
const DEFAULT_TIMEOUT_MS = 15000;

export function createSerpapiAdapter(deps: AdapterDeps = {}): ResearchProviderAdapter {
  const fetchFn = deps.fetchFn ?? fetch;
  return {
    id: "serpapi",
    label: "SerpAPI（Google 结构化结果，需 key）",
    requiresApiKey: true,
    async search(input: SearchInput): Promise<ResearchSearchHit[]> {
      if (!input.apiKey) {
        throw new ResearchError("missing_api_key", "serpapi requires an API key");
      }
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      try {
        const url = new URL(SERPAPI_URL);
        url.searchParams.set("engine", "google");
        url.searchParams.set("q", input.query);
        url.searchParams.set("num", String(Math.min(Math.max(input.topK ?? 5, 1), 10)));
        url.searchParams.set("api_key", input.apiKey);
        const res = await fetchFn(url.toString(), {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new ResearchError(
            "serpapi_http_error",
            `serpapi responded ${res.status}: ${await safeText(res)}`,
          );
        }
        const body = (await res.json()) as {
          organic_results?: Array<{
            title?: string;
            link?: string;
            snippet?: string;
            position?: number;
          }>;
        };
        const hits = (body.organic_results ?? [])
          .filter((r) => typeof r?.link === "string" && typeof r?.title === "string")
          .map<ResearchSearchHit>((r) => ({
            title: r.title ?? "",
            url: r.link ?? "",
            snippet: (r.snippet ?? "").trim(),
            provider: "serpapi",
            score:
              typeof r.position === "number" && r.position > 0
                ? 1 / r.position
                : undefined,
          }));
        return hits;
      } catch (error) {
        if (error instanceof ResearchError) throw error;
        throw new ResearchError(
          "serpapi_request_failed",
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
