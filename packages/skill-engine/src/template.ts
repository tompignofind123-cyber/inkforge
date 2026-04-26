import { SkillRuntimeError } from "./errors";

export interface SkillTemplateToken {
  raw: string;
  key: string;
  arg?: number;
  start: number;
  end: number;
}

export interface SkillTemplateContext {
  selection?: string;
  chapter: {
    title: string;
    text: string;
  };
  character?: {
    name?: string;
    persona?: string;
  };
  vars?: Record<string, string>;
}

export interface SkillTemplateRenderOptions {
  strict?: boolean;
  emptyOnMissing?: boolean;
}

export interface SkillTemplateRenderResult {
  text: string;
  used: string[];
  missing: string[];
}

const TOKEN_REGEX = /{{\s*([^}]+)\s*}}/g;

function clampContextSize(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const size = Math.floor(value);
  if (size < 1) return 0;
  if (size > 5000) return 5000;
  return size;
}

export function parseSkillTemplate(template: string): SkillTemplateToken[] {
  const text = String(template ?? "");
  const tokens: SkillTemplateToken[] = [];
  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    const raw = match[0];
    const inner = (match[1] ?? "").trim();
    const token: SkillTemplateToken = {
      raw,
      key: inner,
      start: match.index,
      end: match.index + raw.length,
    };
    const contextMatch = /^context_before_(\d+)$/i.exec(inner);
    if (contextMatch) {
      token.key = "context_before_N";
      token.arg = clampContextSize(Number.parseInt(contextMatch[1], 10));
    }
    tokens.push(token);
  }
  return tokens;
}

function resolveTokenValue(
  token: SkillTemplateToken,
  ctx: SkillTemplateContext,
): string | undefined {
  if (token.key === "selection") return ctx.selection ?? "";
  if (token.key === "chapter.title") return ctx.chapter.title ?? "";
  if (token.key === "chapter.text") return ctx.chapter.text ?? "";
  if (token.key === "character.name") return ctx.character?.name ?? "";
  if (token.key === "character.persona") return ctx.character?.persona ?? "";
  if (token.key === "context_before_N") {
    const n = clampContextSize(token.arg ?? 0);
    if (n <= 0) return "";
    const chapterText = ctx.chapter.text ?? "";
    if (!chapterText) return "";
    return chapterText.slice(Math.max(0, chapterText.length - n));
  }
  if (token.key.startsWith("vars.")) {
    const key = token.key.slice(5);
    return key ? ctx.vars?.[key] ?? "" : "";
  }
  return undefined;
}

export function renderSkillTemplate(
  template: string,
  ctx: SkillTemplateContext,
  options: SkillTemplateRenderOptions = {},
): SkillTemplateRenderResult {
  const text = String(template ?? "");
  const tokens = parseSkillTemplate(text);
  const used: string[] = [];
  const missing: string[] = [];
  const emptyOnMissing = options.emptyOnMissing ?? true;

  let result = text;
  for (const token of tokens) {
    const value = resolveTokenValue(token, ctx);
    if (value === undefined) {
      missing.push(token.raw);
      if (emptyOnMissing) {
        result = result.replace(token.raw, "");
      }
      continue;
    }
    used.push(token.raw);
    result = result.replace(token.raw, value);
  }

  if (options.strict && missing.length > 0) {
    throw new SkillRuntimeError(
      "template_missing_variable",
      `Missing template variables: ${missing.join(", ")}`,
    );
  }

  return {
    text: result,
    used,
    missing,
  };
}
