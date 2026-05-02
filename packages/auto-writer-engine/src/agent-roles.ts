import type {
  AutoWriterAgentRole,
  NovelCharacterRecord,
  WorldEntryRecord,
} from "@inkforge/shared";

/**
 * 4 个内置 Agent 的默认 system prompt 模板。
 * 用户后续可以通过 Skill 预设覆盖。
 */
export const AGENT_SYSTEM_PROMPTS: Record<AutoWriterAgentRole, string> = {
  planner: [
    "你是「提纲师」。基于用户提供的章节意图、已写正文摘要、人物档案和世界观，",
    "输出本章后续 6-12 段的 beat sheet。",
    "",
    "输出要求：仅输出一个 JSON 数组，每个元素形如：",
    '{"index": 1, "beat": "<这一段要发生什么、谁的视角、情绪基调>"}',
    "禁止 Markdown 代码块、禁止注释、禁止说明性文字。",
  ].join("\n"),

  writer: [
    "你是「执笔者」。按照本段 beat、人物口吻、已写正文风格，写 {{TARGET_LENGTH}} 字左右的小说正文。",
    "",
    "原则：",
    "- 严格保持人物一致：参考下方人物档案中的口吻、性格、习惯",
    "- 严格遵守世界观：参考下方设定库",
    "- 只输出本段正文文本，不要旁白标记，不要 Markdown 代码块",
    "- 与上文自然衔接，不要复述前情",
    "- 如果上一段 Critic 提到了具体的修改点，本次必须吸纳",
  ].join("\n"),

  critic: [
    "你是「审稿人」。检查刚写完的本段相对人物档案、世界观、用户思路、上文一致性。",
    "",
    "输出要求：仅输出一个 JSON 数组，不要 Markdown 代码块。",
    "每个元素形如：",
    '{"severity":"info|warn|error","excerpt":"<原文最关键的一句，≤80 字>","suggestion":"<具体可执行的修改建议，≤150 字>"}',
    "如果本段没有问题，输出 `[]`。",
    "判定规则：",
    "- error：直接 OOC（人物说了不可能说的话/做了违背设定的事）/ 时间线矛盾 / 严重背离用户思路",
    "- warn：风格漂移 / 节奏异常 / 伏笔遗漏",
    "- info：可优化但不必须",
  ].join("\n"),

  reflector: [
    "你是「反思者」。基于本段正文 + Critic 的 findings + 用户最新介入思路，",
    "给下一段 Writer 写一份 ≤ 200 字的中文备忘，包含：",
    "1. 本段做对了什么（保持）",
    "2. 下一段必须避免什么",
    "3. 下一段应该聚焦什么",
    "",
    "只输出备忘正文，不要标号、不要 Markdown。",
  ].join("\n"),
};

export function rosterToText(characters: NovelCharacterRecord[]): string {
  if (characters.length === 0) return "（无人物档案）";
  return characters
    .map((c, idx) => {
      const traits =
        c.traits && typeof c.traits === "object"
          ? Object.entries(c.traits as Record<string, unknown>)
              .map(([k, v]) => `${k}=${String(v)}`)
              .join("; ")
          : "";
      const back = c.backstory ? `背景：${c.backstory.slice(0, 200)}` : "";
      const persona = c.persona ? `性格：${c.persona.slice(0, 200)}` : "";
      return [`【人物 ${idx + 1}】${c.name}`, persona, traits && `特征：${traits}`, back]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export function worldToText(entries: WorldEntryRecord[]): string {
  if (entries.length === 0) return "（无世界观条目）";
  return entries
    .slice(0, 20)
    .map((e) => {
      const aliases = e.aliases && e.aliases.length > 0 ? `（别名：${e.aliases.join("、")}）` : "";
      return `[${e.category}] ${e.title}${aliases}\n${e.content?.slice(0, 200) ?? ""}`;
    })
    .join("\n\n");
}
