import { randomUUID } from "node:crypto";
import {
  deleteOutline,
  getAppSettings,
  getProject,
  getSceneBinding,
  insertOutline,
  listOutlines,
  updateOutline,
  updateProjectMeta,
} from "@inkforge/storage";
import type {
  OutlineCardRecord,
  OutlineGenerateChaptersInput,
  OutlineGenerateChaptersResponse,
  OutlineGenerateMasterInput,
  OutlineGenerateMasterResponse,
  OutlineRefineInput,
  OutlineRefineResponse,
  OutlineUndoRefineInput,
  OutlineUndoRefineResponse,
  ProjectRecord,
  ProjectUpdateMetaInput,
  SceneKeyBasic,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";
import {
  resolveApiKey,
  resolveProviderRecord,
  streamText,
} from "./llm-runtime";

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

interface MasterPromptArgs {
  name: string;
  synopsis: string;
  genre: string;
  subGenre: string;
  tags: string[];
}

function buildMasterOutlinePrompt(args: MasterPromptArgs): { system: string; user: string } {
  const tagLine = args.tags.length ? `标签：${args.tags.join("、")}` : "";
  const sub = args.subGenre ? `子类：${args.subGenre}` : "";
  const tail = [args.genre && `主类：${args.genre}`, sub, tagLine].filter(Boolean).join(" · ");
  return {
    system: [
      "你是一位中文小说总编，擅长根据梗概和定位反推故事的主线骨架。",
      "输出一份**总大纲**，结构如下，用纯文本（无 Markdown 标题），每一段一行起：",
      "  1. 一句话核心冲突（不超过 60 字）",
      "  2. 三段式骨架：开端 / 发展（含转折点 1-2 个） / 高潮收束",
      "  3. 主要人物简介（3-5 人，每人一行：姓名 · 定位 · 一句话动机）",
      "  4. 主题与基调（一段，不超过 80 字）",
      "  5. 节奏建议（按章数粗略分配：开端约 X 章 / 发展 Y 章 / 高潮 Z 章）",
      "整体不超过 800 字。不要分析、不要询问、不要使用 Markdown 列表符号——直接给大纲。",
    ].join("\n"),
    user: [
      `作品名：${args.name}`,
      tail,
      "",
      "梗概：",
      args.synopsis || "（用户尚未填写。请基于上述类型与标签自由发挥，给一个具典型性的中等长度故事框架。）",
    ].join("\n"),
  };
}

function buildChapterOutlinesPrompt(
  project: ProjectRecord,
  targetCount: number,
): { system: string; user: string } {
  return {
    system: [
      "你是一位中文小说编辑，根据总大纲将故事拆分为章节大纲卡。",
      `输出严格的 JSON 数组（**不要**加 \`\`\`json 围栏，**不要**输出其他文字），共 ${targetCount} 项，按时间顺序：`,
      `  [{"title":"第一章 · 章节标题","content":"本章 80-150 字纲要：发生什么 / 谁的视角 / 起点状态 → 终点状态 / 关键场景或道具"}, ...]`,
      "title 格式：「第N章 · 简短副标题」。content 必须是单行字符串（用 \\n 表示换行）。",
      "禁止输出标题以外的任何内容。",
    ].join("\n"),
    user: [
      `作品：${project.name}`,
      project.genre ? `类型：${project.genre}${project.subGenre ? " / " + project.subGenre : ""}` : "",
      project.tags.length ? `标签：${project.tags.join("、")}` : "",
      "",
      "总大纲：",
      project.masterOutline.trim() || "（无）",
      "",
      `请输出 ${targetCount} 章的大纲卡 JSON 数组。`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function buildRefineMasterPrompt(
  project: ProjectRecord,
  intent: string,
): { system: string; user: string } {
  return {
    system: [
      "你是一位中文小说总编，根据用户的修改意图调整总大纲。",
      "保持原大纲的整体结构（核心冲突 / 三段式 / 人物 / 主题 / 节奏），只在用户指出的方向上修改。",
      "输出仅大纲文本本身，不要附加解释。",
    ].join("\n"),
    user: [
      `作品：${project.name}`,
      "",
      "原总大纲：",
      project.masterOutline.trim() || "（空）",
      "",
      `修改意图：${intent.trim()}`,
      "",
      "请输出修改后的总大纲：",
    ].join("\n"),
  };
}

function buildRefineCardPrompt(
  card: OutlineCardRecord,
  intent: string,
): { system: string; user: string } {
  return {
    system: [
      "你是一位中文小说编辑，根据用户的修改意图优化某一章的大纲卡。",
      "保持原章的位置与角色，仅按用户意图调整内容。",
      "输出仅大纲卡正文本身（不带 title），单段或多段均可，不要附加解释。",
    ].join("\n"),
    user: [
      `章节标题：${card.title}`,
      "",
      "原章纲：",
      card.content.trim() || "（空）",
      "",
      `修改意图：${intent.trim()}`,
      "",
      "请输出修改后的章纲：",
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function streamCollect(args: {
  providerRecord: ReturnType<typeof resolveProviderRecord>;
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ text: string; durationMs: number }> {
  if (!args.providerRecord) throw new Error("provider_not_configured");
  const start = Date.now();
  const stream = streamText({
    providerRecord: args.providerRecord,
    apiKey: args.apiKey,
    model: args.model ?? args.providerRecord.defaultModel,
    systemPrompt: args.systemPrompt,
    userMessage: args.userMessage,
    temperature: args.temperature ?? 0.7,
    maxTokens: args.maxTokens ?? 1500,
  });
  let acc = "";
  for await (const chunk of stream) {
    if (chunk.type === "delta" && chunk.textDelta) acc += chunk.textDelta;
    if (chunk.type === "error" && chunk.error) throw new Error(chunk.error);
  }
  return { text: acc.trim(), durationMs: Date.now() - start };
}

async function resolveProviderForScene(
  basicKey: SceneKeyBasic,
  explicit: { providerId?: string; model?: string },
): Promise<{
  providerRecord: NonNullable<ReturnType<typeof resolveProviderRecord>>;
  apiKey: string;
  model: string | undefined;
}> {
  // Direct basic-mode lookup — outline_generation / main_generation are basic keys
  // that don't exist in the advanced enum, so we bypass scene-binding-service
  // and read scene_bindings_basic directly.
  const ctx = getAppContext();
  let providerId = explicit.providerId;
  let model = explicit.model;
  if (!providerId) {
    const mode = getAppSettings(ctx.db).sceneRoutingMode;
    if (mode === "basic") {
      const binding = getSceneBinding(ctx.db, "basic", basicKey);
      if (binding?.providerId) {
        providerId = binding.providerId;
        model = model ?? binding.model ?? undefined;
      }
    }
    // Advanced mode falls through to first-provider via resolveProviderRecord(undefined).
  }
  const providerRecord = resolveProviderRecord(providerId);
  if (!providerRecord) throw new Error("provider_not_configured");
  const apiKey = await resolveApiKey(providerRecord);
  if (!apiKey) throw new Error("api_key_missing");
  return {
    providerRecord,
    apiKey,
    model: model ?? undefined,
  };
}

function parseOutlineCardsJson(raw: string): Array<{ title: string; content: string }> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  // Try to find a JSON array start if the model leaked a sentence before it.
  let candidate = cleaned;
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start >= 0 && end > start) candidate = cleaned.slice(start, end + 1);
  let arr: unknown;
  try {
    arr = JSON.parse(candidate);
  } catch {
    throw new Error("LLM output not valid JSON for chapter outlines");
  }
  if (!Array.isArray(arr)) throw new Error("LLM output not an array");
  return arr
    .map((item) => {
      const obj = item as Record<string, unknown>;
      const title = typeof obj.title === "string" ? obj.title.trim() : "";
      const content = typeof obj.content === "string" ? obj.content.trim() : "";
      return { title, content };
    })
    .filter((c) => c.title || c.content);
}

// ---------------------------------------------------------------------------
// Service exports
// ---------------------------------------------------------------------------

export function updateProjectCreativeMeta(input: ProjectUpdateMetaInput): ProjectRecord {
  const ctx = getAppContext();
  return updateProjectMeta(ctx.db, {
    id: input.projectId,
    synopsis: input.synopsis,
    genre: input.genre,
    subGenre: input.subGenre,
    tags: input.tags,
  });
}

export async function generateMasterOutline(
  input: OutlineGenerateMasterInput,
): Promise<OutlineGenerateMasterResponse> {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error("project_not_found");

  const synopsis = input.synopsis ?? project.synopsis;
  const genre = input.genre ?? project.genre;
  const subGenre = input.subGenre ?? project.subGenre;
  const tags = input.tags ?? project.tags;

  if (!synopsis.trim() && !genre.trim() && tags.length === 0) {
    throw new Error("metadata_empty: please fill synopsis or genre or tags first");
  }

  const { providerRecord, apiKey, model } = await resolveProviderForScene("outline_generation", {
    providerId: input.providerId,
    model: input.model,
  });

  const { system, user } = buildMasterOutlinePrompt({
    name: project.name,
    synopsis,
    genre,
    subGenre,
    tags,
  });

  const { text, durationMs } = await streamCollect({
    providerRecord,
    apiKey,
    model,
    systemPrompt: system,
    userMessage: user,
    temperature: 0.7,
    maxTokens: 1500,
  });

  // Persist (also write back the metadata if user changed via input)
  updateProjectMeta(ctx.db, {
    id: project.id,
    synopsis,
    genre,
    subGenre,
    tags,
    masterOutline: text,
    // Reset undo snapshot on fresh generate
    preRefineMasterOutline: null,
  });

  return { projectId: project.id, masterOutline: text, durationMs };
}

export async function generateChapterOutlines(
  input: OutlineGenerateChaptersInput,
): Promise<OutlineGenerateChaptersResponse> {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error("project_not_found");
  if (!project.masterOutline.trim()) {
    throw new Error("master_outline_empty: generate master outline first");
  }

  const targetCount = Math.max(3, Math.min(50, input.targetCount ?? 12));

  const { providerRecord, apiKey, model } = await resolveProviderForScene("outline_generation", {
    providerId: input.providerId,
    model: input.model,
  });
  const { system, user } = buildChapterOutlinesPrompt(project, targetCount);

  const { text, durationMs } = await streamCollect({
    providerRecord,
    apiKey,
    model,
    systemPrompt: system,
    userMessage: user,
    temperature: 0.7,
    maxTokens: 4000,
  });

  const cards = parseOutlineCardsJson(text);
  if (cards.length === 0) throw new Error("LLM returned zero outline cards");

  // Optionally clear existing project-level outline cards (chapterId IS NULL)
  if (input.replaceExisting) {
    const existing = listOutlines(ctx.db, project.id).filter((c) => c.chapterId === null);
    for (const c of existing) deleteOutline(ctx.db, c.id);
  }

  const existingProjectCards = listOutlines(ctx.db, project.id).filter((c) => c.chapterId === null);
  let order = existingProjectCards.length;
  const created: OutlineCardRecord[] = [];
  for (const c of cards) {
    const record = insertOutline(ctx.db, {
      id: randomUUID(),
      projectId: project.id,
      chapterId: null,
      title: c.title || `第${order + 1}章`,
      content: c.content,
      status: "planned",
      order,
    });
    created.push(record);
    order += 1;
  }

  return {
    projectId: project.id,
    cardIds: created.map((c) => c.id),
    durationMs,
  };
}

export async function refineOutline(
  input: OutlineRefineInput,
): Promise<OutlineRefineResponse> {
  const ctx = getAppContext();
  const intent = input.intent.trim().slice(0, 500);
  if (!intent) throw new Error("intent_empty");

  const { providerRecord, apiKey, model } = await resolveProviderForScene("outline_generation", {
    providerId: input.providerId,
    model: input.model,
  });

  if (input.target.kind === "master") {
    const project = getProject(ctx.db, input.target.projectId);
    if (!project) throw new Error("project_not_found");
    if (!project.masterOutline.trim()) throw new Error("master_outline_empty");

    const { system, user } = buildRefineMasterPrompt(project, intent);
    const { text, durationMs } = await streamCollect({
      providerRecord,
      apiKey,
      model,
      systemPrompt: system,
      userMessage: user,
      temperature: 0.7,
      maxTokens: 1500,
    });

    // Save snapshot for undo BEFORE writing new outline
    updateProjectMeta(ctx.db, {
      id: project.id,
      preRefineMasterOutline: project.masterOutline,
      masterOutline: text,
    });
    return { text, hasUndo: true, durationMs };
  }

  // card
  const row = ctx.db
    .prepare(
      `SELECT id, project_id, chapter_id, title, content, status, "order", created_at, updated_at
       FROM outline_cards WHERE id = ?`,
    )
    .get(input.target.cardId) as
    | {
        id: string;
        project_id: string;
        chapter_id: string | null;
        title: string;
        content: string;
        status: string;
        order: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!row) throw new Error("card_not_found");
  const card: OutlineCardRecord = {
    id: row.id,
    projectId: row.project_id,
    chapterId: row.chapter_id,
    title: row.title,
    content: row.content,
    status: row.status,
    order: row.order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  const { system, user } = buildRefineCardPrompt(card, intent);
  const { text, durationMs } = await streamCollect({
    providerRecord,
    apiKey,
    model,
    systemPrompt: system,
    userMessage: user,
    temperature: 0.7,
    maxTokens: 1200,
  });

  updateOutline(ctx.db, { id: card.id, content: text });
  // Card-level undo handled by frontend (save previous content client-side); simpler.
  return { text, hasUndo: false, durationMs };
}

export function undoRefineMaster(input: OutlineUndoRefineInput): OutlineUndoRefineResponse {
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error("project_not_found");
  if (!project.preRefineMasterOutline) {
    return { projectId: project.id, masterOutline: project.masterOutline, restored: false };
  }
  const restored = project.preRefineMasterOutline;
  updateProjectMeta(ctx.db, {
    id: project.id,
    masterOutline: restored,
    preRefineMasterOutline: null,
  });
  return { projectId: project.id, masterOutline: restored, restored: true };
}
