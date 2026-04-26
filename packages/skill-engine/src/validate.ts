import { SkillValidationError } from "./errors";
import type {
  SkillBinding,
  SkillDefinition,
  SkillOutputTarget,
  SkillScope,
  SkillTriggerDef,
  SkillTriggerType,
  SkillVariableDef,
} from "./types";

export interface SkillValidationIssue {
  path: string;
  code: "required" | "invalid_type" | "invalid_value";
  message: string;
}

export interface SkillValidationResult {
  ok: boolean;
  value?: SkillDefinition;
  issues: SkillValidationIssue[];
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === "object" && !Array.isArray(input);
}

const VALID_SCOPE = new Set<SkillScope>(["global", "project", "community"]);
const VALID_TRIGGER = new Set<SkillTriggerType>([
  "selection",
  "every-n-chars",
  "on-save",
  "on-chapter-end",
  "manual",
]);
const VALID_OUTPUT = new Set<SkillOutputTarget>([
  "ai-feedback",
  "replace-selection",
  "insert-after-selection",
  "append-chapter",
]);

function parseVariables(
  input: unknown,
  issues: SkillValidationIssue[],
): SkillVariableDef[] {
  if (!Array.isArray(input)) {
    issues.push({
      path: "variables",
      code: "invalid_type",
      message: "variables must be an array",
    });
    return [];
  }
  const result: SkillVariableDef[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const raw = input[i];
    if (!isRecord(raw)) {
      issues.push({
        path: `variables[${i}]`,
        code: "invalid_type",
        message: "variable must be an object",
      });
      continue;
    }
    const key = typeof raw.key === "string" ? raw.key.trim() : "";
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    const required = typeof raw.required === "boolean" ? raw.required : false;
    if (!key) {
      issues.push({
        path: `variables[${i}].key`,
        code: "required",
        message: "key is required",
      });
    }
    if (!label) {
      issues.push({
        path: `variables[${i}].label`,
        code: "required",
        message: "label is required",
      });
    }
    const next: SkillVariableDef = {
      key,
      label,
      required,
      defaultValue:
        typeof raw.defaultValue === "string" ? raw.defaultValue : undefined,
      description:
        typeof raw.description === "string" ? raw.description : undefined,
    };
    result.push(next);
  }
  return result;
}

function parseTriggers(
  input: unknown,
  issues: SkillValidationIssue[],
): SkillTriggerDef[] {
  if (!Array.isArray(input)) {
    issues.push({
      path: "triggers",
      code: "invalid_type",
      message: "triggers must be an array",
    });
    return [];
  }
  const result: SkillTriggerDef[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const raw = input[i];
    if (!isRecord(raw)) {
      issues.push({
        path: `triggers[${i}]`,
        code: "invalid_type",
        message: "trigger must be an object",
      });
      continue;
    }
    const type = typeof raw.type === "string" ? (raw.type as SkillTriggerType) : null;
    if (!type || !VALID_TRIGGER.has(type)) {
      issues.push({
        path: `triggers[${i}].type`,
        code: "invalid_value",
        message: "invalid trigger type",
      });
      continue;
    }
    const enabled = typeof raw.enabled === "boolean" ? raw.enabled : true;
    const everyNChars =
      typeof raw.everyNChars === "number" && Number.isFinite(raw.everyNChars)
        ? Math.floor(raw.everyNChars)
        : undefined;
    const debounceMs =
      typeof raw.debounceMs === "number" && Number.isFinite(raw.debounceMs)
        ? Math.floor(raw.debounceMs)
        : undefined;
    const cooldownMs =
      typeof raw.cooldownMs === "number" && Number.isFinite(raw.cooldownMs)
        ? Math.floor(raw.cooldownMs)
        : undefined;
    if (type === "every-n-chars" && (!everyNChars || everyNChars <= 0)) {
      issues.push({
        path: `triggers[${i}].everyNChars`,
        code: "invalid_value",
        message: "everyNChars must be > 0 for every-n-chars trigger",
      });
    }
    if (debounceMs !== undefined && debounceMs < 0) {
      issues.push({
        path: `triggers[${i}].debounceMs`,
        code: "invalid_value",
        message: "debounceMs must be >= 0",
      });
    }
    if (cooldownMs !== undefined && cooldownMs < 0) {
      issues.push({
        path: `triggers[${i}].cooldownMs`,
        code: "invalid_value",
        message: "cooldownMs must be >= 0",
      });
    }
    result.push({
      type,
      enabled,
      everyNChars,
      debounceMs,
      cooldownMs,
    });
  }
  return result;
}

function parseBinding(
  input: unknown,
  issues: SkillValidationIssue[],
): SkillBinding {
  if (!isRecord(input)) {
    issues.push({
      path: "binding",
      code: "invalid_type",
      message: "binding must be an object",
    });
    return {};
  }
  const binding: SkillBinding = {};
  if (typeof input.providerId === "string") binding.providerId = input.providerId;
  if (typeof input.model === "string") binding.model = input.model;
  if (typeof input.summaryProviderId === "string") {
    binding.summaryProviderId = input.summaryProviderId;
  }
  if (typeof input.summaryModel === "string") binding.summaryModel = input.summaryModel;
  if (typeof input.temperature === "number" && Number.isFinite(input.temperature)) {
    binding.temperature = input.temperature;
  }
  if (typeof input.maxTokens === "number" && Number.isFinite(input.maxTokens)) {
    binding.maxTokens = Math.floor(input.maxTokens);
  }
  return binding;
}

export function validateSkillDefinition(input: unknown): SkillValidationResult {
  const issues: SkillValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        {
          path: "$",
          code: "invalid_type",
          message: "skill definition must be an object",
        },
      ],
    };
  }

  const id = typeof input.id === "string" ? input.id.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const output =
    typeof input.output === "string" ? (input.output as SkillOutputTarget) : null;
  const scope = typeof input.scope === "string" ? (input.scope as SkillScope) : null;
  const enabled = typeof input.enabled === "boolean" ? input.enabled : true;
  const createdAt =
    typeof input.createdAt === "string" && input.createdAt
      ? input.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof input.updatedAt === "string" && input.updatedAt
      ? input.updatedAt
      : new Date().toISOString();

  if (!id) issues.push({ path: "id", code: "required", message: "id is required" });
  if (!name) issues.push({ path: "name", code: "required", message: "name is required" });
  if (!prompt) {
    issues.push({ path: "prompt", code: "required", message: "prompt is required" });
  }
  if (!output || !VALID_OUTPUT.has(output)) {
    issues.push({
      path: "output",
      code: "invalid_value",
      message: "invalid output target",
    });
  }
  if (!scope || !VALID_SCOPE.has(scope)) {
    issues.push({
      path: "scope",
      code: "invalid_value",
      message: "invalid scope",
    });
  }

  const variables = parseVariables(input.variables, issues);
  const triggers = parseTriggers(input.triggers, issues);
  const binding = parseBinding(input.binding, issues);

  if (issues.length > 0 || !output || !scope) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    issues: [],
    value: {
      id,
      name,
      prompt,
      variables,
      triggers,
      binding,
      output,
      enabled,
      scope,
      createdAt,
      updatedAt,
    },
  };
}

export function assertSkillDefinition(input: unknown): SkillDefinition {
  const result = validateSkillDefinition(input);
  if (!result.ok || !result.value) {
    throw new SkillValidationError("Invalid skill definition", result.issues);
  }
  return result.value;
}
