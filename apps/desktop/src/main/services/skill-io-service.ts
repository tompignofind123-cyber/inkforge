import { randomUUID } from "crypto";
import {
  exportSkillPack,
  getBuiltinSkillPresets,
  importSkillPack,
} from "@inkforge/skill-engine";
import {
  createSkill,
  listSkills,
  updateSkill,
} from "@inkforge/storage";
import type {
  SkillDefinition,
  SkillExportJsonInput,
  SkillExportJsonResponse,
  SkillImportJsonInput,
  SkillImportReport,
  SkillScope,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";

function uniqueName(base: string, exists: Set<string>): string {
  const plain = base.trim() || "导入技能";
  if (!exists.has(plain)) return plain;
  let index = 2;
  let next = `${plain} (${index})`;
  while (exists.has(next)) {
    index += 1;
    next = `${plain} (${index})`;
  }
  return next;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function exportSkillJson(input: SkillExportJsonInput): SkillExportJsonResponse {
  const ctx = getAppContext();
  let skills = listSkills(ctx.db, {
    scope: input.scope,
    enabledOnly: !input.includeDisabled,
  });
  if (input.ids && input.ids.length > 0) {
    const idSet = new Set(input.ids);
    skills = skills.filter((skill) => idSet.has(skill.id));
  }
  const pack = exportSkillPack({
    skills,
    includeDisabled: input.includeDisabled,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    fileName: `skills-${stamp}.json`,
    content: JSON.stringify(pack, null, 2),
    format: pack.format,
    version: pack.version,
  };
}

function createFromImported(
  skill: SkillDefinition,
  scopeOverride?: SkillScope,
): SkillDefinition {
  const now = nowIso();
  return {
    ...skill,
    id: randomUUID(),
    scope: scopeOverride ?? skill.scope,
    createdAt: now,
    updatedAt: now,
  };
}

export function importSkillJson(input: {
  jsonText: string;
  onConflict?: SkillImportJsonInput["onConflict"];
  scopeOverride?: SkillScope;
}): SkillImportReport {
  const ctx = getAppContext();
  const parsed = importSkillPack({
    jsonText: input.jsonText,
    onConflict: input.onConflict,
    scopeOverride: input.scopeOverride,
  });
  const report: SkillImportReport = {
    format: parsed.format,
    version: parsed.version,
    total: parsed.skills.length,
    imported: 0,
    replaced: 0,
    skipped: 0,
    errors: [],
  };

  const existing = listSkills(ctx.db, {});
  const byId = new Map(existing.map((skill) => [skill.id, skill]));
  const names = new Set(existing.map((skill) => skill.name));

  for (const skill of parsed.skills) {
    try {
      const next = {
        ...skill,
        scope: parsed.scopeOverride ?? skill.scope,
      };
      const existingById = byId.get(next.id);
      if (existingById) {
        if (parsed.onConflict === "replace") {
          const updated = updateSkill(ctx.db, {
            id: existingById.id,
            name: next.name,
            prompt: next.prompt,
            variables: next.variables,
            triggers: next.triggers,
            binding: next.binding,
            output: next.output,
            enabled: next.enabled,
            scope: next.scope,
            updatedAt: nowIso(),
          });
          byId.set(updated.id, updated);
          names.add(updated.name);
          report.replaced += 1;
          continue;
        }
        if (parsed.onConflict === "rename") {
          const renamed = createFromImported(next, parsed.scopeOverride);
          const finalName = uniqueName(renamed.name, names);
          const created = createSkill(ctx.db, {
            id: renamed.id,
            name: finalName,
            prompt: renamed.prompt,
            variables: renamed.variables,
            triggers: renamed.triggers,
            binding: renamed.binding,
            output: renamed.output,
            enabled: renamed.enabled,
            scope: renamed.scope,
            createdAt: renamed.createdAt,
            updatedAt: renamed.updatedAt,
          });
          byId.set(created.id, created);
          names.add(created.name);
          report.imported += 1;
          continue;
        }
        report.skipped += 1;
        continue;
      }

      let createName = next.name;
      if (parsed.onConflict === "rename") {
        createName = uniqueName(next.name, names);
      } else if (names.has(next.name) && parsed.onConflict === "skip") {
        report.skipped += 1;
        continue;
      } else if (names.has(next.name) && parsed.onConflict === "replace") {
        const old = existing.find((item) => item.name === next.name);
        if (old) {
          const replaced = updateSkill(ctx.db, {
            id: old.id,
            name: next.name,
            prompt: next.prompt,
            variables: next.variables,
            triggers: next.triggers,
            binding: next.binding,
            output: next.output,
            enabled: next.enabled,
            scope: next.scope,
            updatedAt: nowIso(),
          });
          byId.set(replaced.id, replaced);
          names.add(replaced.name);
          report.replaced += 1;
          continue;
        }
      }

      const created = createSkill(ctx.db, {
        id: next.id,
        name: createName,
        prompt: next.prompt,
        variables: next.variables,
        triggers: next.triggers,
        binding: next.binding,
        output: next.output,
        enabled: next.enabled,
        scope: next.scope,
        createdAt: next.createdAt,
        updatedAt: next.updatedAt,
      });
      byId.set(created.id, created);
      names.add(created.name);
      report.imported += 1;
    } catch (error) {
      report.errors.push({
        skillId: skill.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}

export function seedBuiltinPresets(): number {
  const ctx = getAppContext();
  const existing = listSkills(ctx.db, {});
  if (existing.length > 0) return 0;
  const presets = getBuiltinSkillPresets();
  let inserted = 0;
  for (const preset of presets) {
    const now = nowIso();
    createSkill(ctx.db, {
      id: randomUUID(),
      name: preset.name,
      prompt: preset.prompt,
      variables: preset.variables,
      triggers: preset.triggers,
      binding: preset.binding,
      output: preset.output,
      enabled: preset.enabled,
      scope: preset.scope,
      createdAt: now,
      updatedAt: now,
    });
    inserted += 1;
  }
  return inserted;
}
