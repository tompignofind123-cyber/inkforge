import { SkillRuntimeError } from "./errors";
import { assertSkillDefinition } from "./validate";
import type { SkillDefinition, SkillImportReport, SkillPackV1, SkillScope } from "./types";

export interface ExportSkillPackInput {
  skills: SkillDefinition[];
  includeDisabled?: boolean;
}

export interface ImportSkillPackInput {
  jsonText: string;
  onConflict?: "replace" | "skip" | "rename";
  scopeOverride?: SkillScope;
}

export interface ImportSkillPackResult {
  format: string;
  version: string;
  skills: SkillDefinition[];
  onConflict: "replace" | "skip" | "rename";
  scopeOverride?: SkillScope;
}

export function exportSkillPack(input: ExportSkillPackInput): SkillPackV1 {
  const includeDisabled = input.includeDisabled ?? false;
  return {
    format: "inkforge.skill-pack",
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    source: "inkforge-desktop",
    skills: includeDisabled
      ? input.skills
      : input.skills.filter((skill) => skill.enabled),
  };
}

function asStringOr(
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function importSkillPack(input: ImportSkillPackInput): ImportSkillPackResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.jsonText);
  } catch (error) {
    throw new SkillRuntimeError(
      "invalid_json",
      error instanceof Error ? error.message : "invalid json",
      error,
    );
  }

  const data =
    parsed && typeof parsed === "object"
      ? (parsed as { format?: unknown; version?: unknown; skills?: unknown })
      : null;
  if (!data || !Array.isArray(data.skills)) {
    throw new SkillRuntimeError(
      "invalid_pack",
      "json must contain { skills: SkillDefinition[] }",
    );
  }

  const format = asStringOr(data.format, "inkforge.skill-pack");
  const version = asStringOr(data.version, "1.0.0");
  const onConflict = input.onConflict ?? "skip";

  const skills = data.skills.map((item, idx) => {
    try {
      return assertSkillDefinition(item);
    } catch (error) {
      throw new SkillRuntimeError(
        "invalid_skill",
        `invalid skill at index ${idx}: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  });

  return {
    format,
    version,
    skills,
    onConflict,
    scopeOverride: input.scopeOverride,
  };
}

export function emptyImportReport(
  format = "inkforge.skill-pack",
  version = "1.0.0",
): SkillImportReport {
  return {
    format,
    version,
    total: 0,
    imported: 0,
    replaced: 0,
    skipped: 0,
    errors: [],
  };
}
