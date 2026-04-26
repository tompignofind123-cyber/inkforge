import type { SkillDefinition } from "../types";

export function getBuiltinSkillPresets(): Omit<
  SkillDefinition,
  "id" | "createdAt" | "updatedAt"
>[] {
  return [
    {
      name: "润色·温柔",
      prompt:
        "请在不改变剧情与信息的前提下，温柔润色以下选中文本，保持原意和长度接近，只输出改写结果：\n{{selection}}",
      variables: [],
      triggers: [{ type: "selection", enabled: true }],
      binding: {
        temperature: 0.55,
      },
      output: "replace-selection",
      enabled: true,
      scope: "global",
    },
    {
      name: "人物一致性审查",
      prompt:
        "请审查本章人物行为与人设一致性，给出 1-3 条简短可执行建议（不重写原文）：\n标题：{{chapter.title}}\n正文：{{chapter.text}}",
      variables: [],
      triggers: [{ type: "on-save", enabled: true }],
      binding: {
        temperature: 0.4,
      },
      output: "ai-feedback",
      enabled: true,
      scope: "global",
    },
    {
      name: "视角切换",
      prompt:
        "请基于以下选中文本给出三种视角切换建议（第一人称/第三人称/旁观视角），每条不超过 50 字：\n{{selection}}",
      variables: [],
      triggers: [{ type: "selection", enabled: true }],
      binding: {
        temperature: 0.7,
      },
      output: "ai-feedback",
      enabled: true,
      scope: "global",
    },
    {
      name: "伏笔提醒",
      prompt:
        "请根据本章内容指出可补强的伏笔点，按“伏笔点 + 落位建议”输出 2 条：\n标题：{{chapter.title}}\n正文：{{chapter.text}}",
      variables: [],
      triggers: [{ type: "on-chapter-end", enabled: true }],
      binding: {
        temperature: 0.55,
      },
      output: "ai-feedback",
      enabled: true,
      scope: "global",
    },
    {
      name: "节奏建议",
      prompt:
        "请根据最近文本给出一条节奏建议（推进/留白/转折），并说明原因（不超过 80 字）：\n{{context_before_800}}",
      variables: [],
      triggers: [
        {
          type: "every-n-chars",
          enabled: true,
          everyNChars: 200,
          debounceMs: 10_000,
          cooldownMs: 30_000,
        },
      ],
      binding: {
        temperature: 0.5,
      },
      output: "ai-feedback",
      enabled: false,
      scope: "global",
    },
  ];
}
