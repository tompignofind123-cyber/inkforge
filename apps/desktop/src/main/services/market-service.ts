import type {
  MarketFetchRegistryInput,
  MarketRegistryDTO,
  MarketInstallSkillInput,
  MarketInstallSkillResponse,
  MarketBuildPublishBundleInput,
  MarketBuildPublishBundleResponse,
} from "@inkforge/shared";
import { buildPublishBundle, fetchRegistry, fetchSkillPack } from "@inkforge/skill-engine";
import { getSkillRecord } from "./skill-service";
import { importSkillJson } from "./skill-io-service";

const DEFAULT_REGISTRY_URL =
  process.env.INKFORGE_MARKET_REGISTRY ??
  "https://raw.githubusercontent.com/anthropics/inkforge-skills/main/registry.json";

export async function fetchMarketRegistry(
  input: MarketFetchRegistryInput,
): Promise<MarketRegistryDTO> {
  const registryUrl = input.registryUrl || DEFAULT_REGISTRY_URL;
  const registry = await fetchRegistry({ registryUrl });
  return {
    format: registry.format,
    updatedAt: registry.updatedAt,
    skills: registry.skills,
  };
}

function extractSkillId(pack: unknown): string {
  const obj = pack as Record<string, unknown>;
  if (obj.skill && typeof obj.skill === "object") {
    return String((obj.skill as { id?: unknown }).id ?? "");
  }
  if (Array.isArray(obj.skills) && obj.skills.length > 0) {
    return String((obj.skills[0] as { id?: unknown }).id ?? "");
  }
  return "";
}

export async function installSkillFromMarket(
  input: MarketInstallSkillInput,
): Promise<MarketInstallSkillResponse> {
  const pack = await fetchSkillPack(input.url);
  const jsonText = JSON.stringify(pack);
  const report = importSkillJson({
    jsonText,
    onConflict: "replace",
    scopeOverride: input.scope,
  });
  const installed = report.imported + report.replaced > 0;
  return {
    installed,
    skillId: installed ? extractSkillId(pack) : "",
  };
}

export function buildMarketPublishBundle(
  input: MarketBuildPublishBundleInput,
): MarketBuildPublishBundleResponse {
  const skill = getSkillRecord({ id: input.skillId });
  if (!skill) {
    throw new Error(`skill not found: ${input.skillId}`);
  }
  return buildPublishBundle(skill);
}
