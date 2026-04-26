import type { SkillDefinition, SkillScope } from "@inkforge/shared";

export interface MarketSkillMeta {
  id: string;
  title: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
  scope: SkillScope;
  url: string;
  license?: string;
  homepage?: string;
}

export interface MarketRegistry {
  format: "inkforge-market.v1";
  updatedAt: string;
  skills: MarketSkillMeta[];
}

export interface MarketFetchOptions {
  registryUrl: string;
  abort?: AbortSignal;
}

export async function fetchRegistry(opts: MarketFetchOptions): Promise<MarketRegistry> {
  const res = await fetch(opts.registryUrl, { signal: opts.abort });
  if (!res.ok) throw new Error(`registry ${res.status}`);
  const body = (await res.json()) as MarketRegistry;
  if (body.format !== "inkforge-market.v1") {
    throw new Error(`unsupported format: ${body.format}`);
  }
  return body;
}

export async function fetchSkillPack(
  url: string,
  abort?: AbortSignal,
): Promise<unknown> {
  const res = await fetch(url, { signal: abort });
  if (!res.ok) throw new Error(`skill ${res.status}`);
  return res.json();
}

export function buildPublishBundle(skill: SkillDefinition): {
  skillJson: string;
  prInstructions: string;
} {
  const bundle = {
    format: "inkforge-skill-pack.v1",
    skills: [skill],
    exportedAt: new Date().toISOString(),
  };
  const skillJson = JSON.stringify(bundle, null, 2);
  const prInstructions = [
    "# 发布到 InkForge Skill 市场",
    "",
    "1. Fork https://github.com/anthropics/inkforge-skills",
    `2. 新增文件 \`skills/${skill.id}.json\` 并粘贴下面内容`,
    "3. 在 `registry.json` 的 `skills[]` 数组追加一条元信息：",
    "```json",
    JSON.stringify(
      {
        id: skill.id,
        title: skill.name,
        description: "",
        author: "YOUR-GITHUB-USERNAME",
        version: "1.0.0",
        tags: [],
        scope: skill.scope,
        url: `https://raw.githubusercontent.com/anthropics/inkforge-skills/main/skills/${skill.id}.json`,
      },
      null,
      2,
    ),
    "```",
    "4. 发 PR；合并后即可在『Skill 市场』中被搜索到",
  ].join("\n");

  return { skillJson, prInstructions };
}
