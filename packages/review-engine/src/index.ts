import type {
  ReviewBuiltinId,
  ReviewFindingRecord,
  ReviewReportSummary,
  ReviewSeverity,
} from "@inkforge/shared";

export type { ReviewBuiltinId, ReviewFindingRecord, ReviewReportSummary, ReviewSeverity };

export interface BuiltinPromptContext {
  /**
   * Optional character roster for consistency checks. Each entry describes
   * the canonical persona, traits, and backstory.
   */
  characters?: Array<{ name: string; persona?: string; traits?: string[]; backstory?: string }>;
  /**
   * Optional world entries for worldbuilding dimension. Title + aliases + content
   * let the model compare chapter text against the canon.
   */
  worldEntries?: Array<{ title: string; aliases?: string[]; content?: string }>;
}

export interface BuiltinPromptSpec {
  id: ReviewBuiltinId;
  displayName: string;
  /** Default severity when the finding omits one. */
  defaultSeverity: ReviewSeverity;
  systemPrompt: (ctx: BuiltinPromptContext) => string;
  userPrompt: (input: { chapterTitle: string; chapterText: string }) => string;
}

const SHARED_OUTPUT_RULE =
  [
    "输出要求：",
    "只允许输出一个 JSON 数组，不要包裹在 Markdown 代码块中，不要添加注释或说明。",
    "每个元素形如：",
    '{"severity":"info|warn|error","excerpt":"<原文最关键的一句，≤80 字>","suggestion":"<具体可执行的修改建议，≤150 字>"}',
    "如果本章没有发现值得报告的问题，请输出 `[]`。",
  ].join("\n");

const CHARACTER_PROMPT: BuiltinPromptSpec = {
  id: "consistency-character",
  displayName: "人物一致性",
  defaultSeverity: "warn",
  systemPrompt: (ctx) => {
    const roster =
      ctx.characters && ctx.characters.length > 0
        ? ctx.characters
            .map(
              (c, idx) =>
                `${idx + 1}. ${c.name}${c.persona ? ` — ${c.persona}` : ""}${
                  c.traits && c.traits.length > 0 ? `（特征：${c.traits.join("、")}）` : ""
                }${c.backstory ? `（背景：${c.backstory.slice(0, 60)}…）` : ""}`,
            )
            .join("\n")
        : "（无预设人物档案，可跳过严格比对）";
    return [
      "你是小说审查助手，专注于「人物一致性」维度。",
      "检查本章中角色的说话方式、性格、能力、动机是否与以下预设档案一致。",
      "角色档案：",
      roster,
      "忽略仅因情节变化带来的合理心理转变；专注于「设定硬矛盾」。",
      SHARED_OUTPUT_RULE,
    ].join("\n");
  },
  userPrompt: ({ chapterTitle, chapterText }) =>
    `章节《${chapterTitle}》全文：\n${chapterText.trim().slice(0, 20000)}`,
};

const TIMELINE_PROMPT: BuiltinPromptSpec = {
  id: "consistency-timeline",
  displayName: "时间线连续性",
  defaultSeverity: "warn",
  systemPrompt: () =>
    [
      "你是小说审查助手，专注于「时间线连续性」维度。",
      "聚焦本章内以及与前文的显式时间标记（年份、月份、节气、角色年龄、事件前后）。",
      "检测与上文冲突、时序颠倒、同一事件前后时间矛盾等问题。",
      SHARED_OUTPUT_RULE,
    ].join("\n"),
  userPrompt: ({ chapterTitle, chapterText }) =>
    `章节《${chapterTitle}》正文：\n${chapterText.trim().slice(0, 20000)}`,
};

const FORESHADOWING_PROMPT: BuiltinPromptSpec = {
  id: "foreshadowing",
  displayName: "伏笔与回收",
  defaultSeverity: "warn",
  systemPrompt: () =>
    [
      "你是小说审查助手，专注于「伏笔与回收」维度。",
      "识别本章出现但未解释的线索（悬念、道具、预言、誓言、动机），",
      "并标记：若本章显示了回收点，应提示是否明确；若埋下了新伏笔，应提示是否可能被遗忘。",
      "对于明显属于纯风景/过场描写的不必警告。",
      SHARED_OUTPUT_RULE,
    ].join("\n"),
  userPrompt: ({ chapterTitle, chapterText }) =>
    `章节《${chapterTitle}》正文：\n${chapterText.trim().slice(0, 20000)}`,
};

const WORLDBUILDING_PROMPT: BuiltinPromptSpec = {
  id: "worldbuilding",
  displayName: "世界观一致性",
  defaultSeverity: "warn",
  systemPrompt: (ctx) => {
    const canon =
      ctx.worldEntries && ctx.worldEntries.length > 0
        ? ctx.worldEntries
            .map(
              (entry, idx) =>
                `${idx + 1}. 【${entry.title}${
                  entry.aliases && entry.aliases.length > 0
                    ? " / " + entry.aliases.join(" / ")
                    : ""
                }】${entry.content ? entry.content.slice(0, 200) : ""}`,
            )
            .join("\n")
        : "（无预设世界观条目，可跳过严格比对）";
    return [
      "你是小说审查助手，专注于「世界观一致性」维度。",
      "与以下设定条目逐一对比：是否出现与条目冲突的描述（地点、门派、物件、概念）？",
      "设定条目：",
      canon,
      "对未登记的新名词不必报警。",
      SHARED_OUTPUT_RULE,
    ].join("\n");
  },
  userPrompt: ({ chapterTitle, chapterText }) =>
    `章节《${chapterTitle}》正文：\n${chapterText.trim().slice(0, 20000)}`,
};

const STYLE_PROMPT: BuiltinPromptSpec = {
  id: "style",
  displayName: "语言风格一致性",
  defaultSeverity: "info",
  systemPrompt: () =>
    [
      "你是小说审查助手，专注于「语言风格一致性」维度。",
      "检查：人称是否统一（第一/第三）、时态/语气是否忽然切换、出现与作品整体风格明显不符的段落（如过度口语化、过度堆砌形容词）。",
      "单句轻微变化不必报警。",
      SHARED_OUTPUT_RULE,
    ].join("\n"),
  userPrompt: ({ chapterTitle, chapterText }) =>
    `章节《${chapterTitle}》正文：\n${chapterText.trim().slice(0, 20000)}`,
};

const REGISTRY: Record<ReviewBuiltinId, BuiltinPromptSpec> = {
  "consistency-character": CHARACTER_PROMPT,
  "consistency-timeline": TIMELINE_PROMPT,
  foreshadowing: FORESHADOWING_PROMPT,
  worldbuilding: WORLDBUILDING_PROMPT,
  style: STYLE_PROMPT,
};

export function getBuiltinPromptSpec(id: ReviewBuiltinId): BuiltinPromptSpec {
  return REGISTRY[id];
}

export const BUILTIN_DIMENSION_SPECS: BuiltinPromptSpec[] = Object.values(REGISTRY);

export interface ParsedFindingDraft {
  severity: ReviewSeverity;
  excerpt: string;
  suggestion: string;
}

function normalizeSeverity(value: unknown, fallback: ReviewSeverity): ReviewSeverity {
  if (value === "info" || value === "warn" || value === "error") return value;
  return fallback;
}

/**
 * Forgiving parser: extracts the first top-level JSON array from an LLM
 * response and coerces each element into a ReviewFinding draft. Silently
 * drops malformed elements.
 */
export function parseFindingsFromLlm(
  text: string,
  fallbackSeverity: ReviewSeverity,
): ParsedFindingDraft[] {
  if (!text) return [];
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  const slice = text.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const drafts: ParsedFindingDraft[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const obj = item as {
      severity?: unknown;
      excerpt?: unknown;
      suggestion?: unknown;
    };
    const excerpt = typeof obj.excerpt === "string" ? obj.excerpt.trim() : "";
    const suggestion =
      typeof obj.suggestion === "string" ? obj.suggestion.trim() : "";
    if (!excerpt && !suggestion) continue;
    drafts.push({
      severity: normalizeSeverity(obj.severity, fallbackSeverity),
      excerpt: excerpt.slice(0, 400),
      suggestion: suggestion.slice(0, 1000),
    });
  }
  return drafts;
}

export function computeReportSummary(
  findings: ReviewFindingRecord[],
): ReviewReportSummary {
  const totals: Record<ReviewSeverity, number> = { info: 0, warn: 0, error: 0 };
  const perDimensionMap = new Map<string, number>();
  const perChapterMap = new Map<string, number>();
  for (const f of findings) {
    totals[f.severity] += 1;
    perDimensionMap.set(f.dimensionId, (perDimensionMap.get(f.dimensionId) ?? 0) + 1);
    if (f.chapterId) {
      perChapterMap.set(f.chapterId, (perChapterMap.get(f.chapterId) ?? 0) + 1);
    }
  }
  return {
    totals,
    perDimension: [...perDimensionMap.entries()].map(([dimensionId, count]) => ({
      dimensionId,
      count,
    })),
    perChapter: [...perChapterMap.entries()].map(([chapterId, count]) => ({
      chapterId,
      count,
    })),
  };
}

export function findExcerptRange(
  chapterText: string,
  excerpt: string,
): { start: number; end: number } | null {
  const needle = excerpt.trim();
  if (!needle) return null;
  const idx = chapterText.indexOf(needle);
  if (idx < 0) return null;
  return { start: idx, end: idx + needle.length };
}
