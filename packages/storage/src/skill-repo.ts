import type { DB } from "./db";
import type { SkillDefinition, SkillScope } from "@inkforge/shared";

type SkillRow = {
  id: string;
  name: string;
  prompt: string;
  variables: string;
  triggers: string;
  binding: string;
  output: SkillDefinition["output"];
  enabled: number;
  scope: SkillScope;
  created_at: string;
  updated_at: string;
};

function parseJson<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw);
    return (parsed as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function rowToRecord(row: SkillRow): SkillDefinition {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    variables: parseJson(row.variables, []),
    triggers: parseJson(row.triggers, []),
    binding: parseJson(row.binding, {}),
    output: row.output,
    enabled: row.enabled === 1,
    scope: row.scope,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateSkillInput {
  id: string;
  name: string;
  prompt: string;
  variables: SkillDefinition["variables"];
  triggers: SkillDefinition["triggers"];
  binding: SkillDefinition["binding"];
  output: SkillDefinition["output"];
  enabled: boolean;
  scope: SkillScope;
  createdAt?: string;
  updatedAt?: string;
}

export function createSkill(db: DB, input: CreateSkillInput): SkillDefinition {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;
  db.prepare(
    `INSERT INTO skills (id, name, prompt, variables, triggers, binding, output, enabled, scope, created_at, updated_at)
     VALUES (@id, @name, @prompt, @variables, @triggers, @binding, @output, @enabled, @scope, @created_at, @updated_at)`,
  ).run({
    id: input.id,
    name: input.name,
    prompt: input.prompt,
    variables: JSON.stringify(input.variables ?? []),
    triggers: JSON.stringify(input.triggers ?? []),
    binding: JSON.stringify(input.binding ?? {}),
    output: input.output,
    enabled: input.enabled ? 1 : 0,
    scope: input.scope,
    created_at: createdAt,
    updated_at: updatedAt,
  });
  return {
    id: input.id,
    name: input.name,
    prompt: input.prompt,
    variables: input.variables ?? [],
    triggers: input.triggers ?? [],
    binding: input.binding ?? {},
    output: input.output,
    enabled: input.enabled,
    scope: input.scope,
    createdAt,
    updatedAt,
  };
}

export interface UpdateSkillInput {
  id: string;
  name?: string;
  prompt?: string;
  variables?: SkillDefinition["variables"];
  triggers?: SkillDefinition["triggers"];
  binding?: SkillDefinition["binding"];
  output?: SkillDefinition["output"];
  enabled?: boolean;
  scope?: SkillScope;
  updatedAt?: string;
}

export function getSkill(db: DB, id: string): SkillDefinition | null {
  const row = db.prepare(`SELECT * FROM skills WHERE id = ?`).get(id) as SkillRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function updateSkill(db: DB, input: UpdateSkillInput): SkillDefinition {
  const existing = getSkill(db, input.id);
  if (!existing) throw new Error(`Skill not found: ${input.id}`);
  const next: SkillDefinition = {
    ...existing,
    name: input.name ?? existing.name,
    prompt: input.prompt ?? existing.prompt,
    variables: input.variables ?? existing.variables,
    triggers: input.triggers ?? existing.triggers,
    binding: input.binding ?? existing.binding,
    output: input.output ?? existing.output,
    enabled: input.enabled ?? existing.enabled,
    scope: input.scope ?? existing.scope,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
  db.prepare(
    `UPDATE skills
     SET name = @name,
         prompt = @prompt,
         variables = @variables,
         triggers = @triggers,
         binding = @binding,
         output = @output,
         enabled = @enabled,
         scope = @scope,
         updated_at = @updated_at
     WHERE id = @id`,
  ).run({
    id: next.id,
    name: next.name,
    prompt: next.prompt,
    variables: JSON.stringify(next.variables ?? []),
    triggers: JSON.stringify(next.triggers ?? []),
    binding: JSON.stringify(next.binding ?? {}),
    output: next.output,
    enabled: next.enabled ? 1 : 0,
    scope: next.scope,
    updated_at: next.updatedAt,
  });
  return next;
}

export interface ListSkillsInput {
  scope?: SkillScope;
  enabledOnly?: boolean;
}

export function listSkills(db: DB, input: ListSkillsInput = {}): SkillDefinition[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (input.scope) {
    where.push(`scope = ?`);
    params.push(input.scope);
  }
  if (input.enabledOnly) {
    where.push(`enabled = 1`);
  }
  const sql = `
    SELECT *
    FROM skills
    ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY updated_at DESC, name ASC
  `;
  const rows = db.prepare(sql).all(...params) as SkillRow[];
  return rows.map(rowToRecord);
}

export function deleteSkill(db: DB, id: string): void {
  db.prepare(`DELETE FROM skills WHERE id = ?`).run(id);
}
