import { ResearchError } from "./types";
import type {
  AdapterDeps,
  ResearchProviderAdapter,
  SearchInput,
} from "./adapter";
import type { ResearchSearchHit } from "@inkforge/shared";

const BING_URL = "https://api.bing.microsoft.com/v7.0/search";
const DEFAULT_TIMEOUT_MS = 15000;

export function createBingAdapter(deps: AdapterDeps = {}): ResearchProviderAdapter {
  const fetchFn = deps.fetchFn ?? fetch;
  return {
    id: "bing",
    label: "Bing Search v7（需 Ocp-Apim-Subscription-Key）",
    requiresApiKey: true,
    async search(input: SearchInput): Promise<ResearchSearchHit[]> {
      if (!input.apiKey) {
        throw new ResearchError("missing_api_key", "bing requires an API key");
      }
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      try {
        const url = new URL(BING_URL);
        url.searchParams.set("q", input.query);
        url.searchParams.set("count", String(Math.min(Math.max(input.topK ?? 5, 1), 20)));
        url.searchParams.set("safeSearch", "Moderate");
        url.searchParams.set("textDecorations", "false");
        const res = await fetchFn(url.toString(), {
          headers: {
            "Ocp-Apim-Subscription-Key": input.apiKey,
          },
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new ResearchError(
            "bing_http_error",
            `bing responded ${res.status}: ${await safeText(res)}`,
          );
        }
        const body = (await res.json()) as {
          webPages?: {
            value?: Array<{
              name?: string;
              url?: string;
              snippet?: string;
            }>;
          };
        };
        const hits = (body.webPages?.value ?? [])
          .filter((r) => typeof r?.url === "string" && typeof r?.name === "string")
          .map<ResearchSearchHit>((r) => ({
            title: r.name ?? "",
            url: r.url ?? "",
            snippet: (r.snippet ?? "").trim(),
            provider: "bing",
          }));
        return hits;
      } catch (error) {
        if (error instanceof ResearchError) throw error;
        throw new ResearchError(
          "bing_request_failed",
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
