import {
  ragSearchCharacters,
  ragSearchResearchNotes,
  ragSearchSampleChunks,
  ragSearchWorldEntries,
  type CharacterHit,
  type ResearchHit,
  type SampleChunkHit,
  type WorldEntryHit,
} from "@inkforge/storage";
import { getAppContext } from "./app-state";

const MAX_PER_ENTRY = 800;
const MAX_TOTAL_CHARS = 2400;
const MAX_HITS_PER_SOURCE = 5;

export interface BuildRagBlockOptions {
  /** Toggle each source individually; defaults: all true. */
  worldEntries?: boolean;
  characters?: boolean;
  researchNotes?: boolean;
  sampleChunks?: boolean;
  /** Override caps. */
  maxPerEntry?: number;
  maxTotalChars?: number;
  maxHitsPerSource?: number;
}

function clip(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trimEnd() + "…";
}

/**
 * Extract 2-4 keyword phrases from the query for LIKE matching.
 *
 * Heuristic: take the last N chars (most recent context), strip punctuation,
 * tokenize on Chinese 2-char + ASCII word boundaries, dedupe, cap to 8 tokens.
 * Falls back to first chars if last is punctuation-heavy.
 */
function extractQueries(query: string): string[] {
  if (!query) return [];
  const tail = query.slice(-300);
  const cleaned = tail.replace(/[\s\p{P}]+/gu, " ").trim();
  if (!cleaned) return [];
  const tokens = new Set<string>();
  // Sliding 2-char Chinese windows
  const chinese = cleaned.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
  for (const seg of chinese) {
    for (let i = 0; i + 2 <= seg.length && tokens.size < 8; i += 1) {
      tokens.add(seg.slice(i, i + 2));
    }
  }
  // ASCII words >= 3 chars
  const ascii = cleaned.match(/[a-zA-Z]{3,}/g) ?? [];
  for (const w of ascii) {
    if (tokens.size >= 8) break;
    tokens.add(w.toLowerCase());
  }
  return [...tokens];
}

interface RenderedSection {
  header: string;
  lines: string[];
}

function renderWorld(hits: WorldEntryHit[], maxPer: number): RenderedSection {
  return {
    header: "=== 世界观 ===",
    lines: hits.map(
      (h) => `${h.title} (${h.category})：${clip(h.content || "(无描述)", maxPer)}`,
    ),
  };
}

function renderCharacters(hits: CharacterHit[], maxPer: number): RenderedSection {
  return {
    header: "=== 人物 ===",
    lines: hits.map((h) => {
      const parts: string[] = [];
      if (h.persona) parts.push(`性格：${clip(h.persona, 200)}`);
      if (h.backstory) parts.push(`背景：${clip(h.backstory, maxPer - 200)}`);
      const summary = parts.length ? parts.join("；") : "(无资料)";
      return `${h.name}：${summary}`;
    }),
  };
}

function renderResearch(hits: ResearchHit[], maxPer: number): RenderedSection {
  return {
    header: "=== 网搜资料 ===",
    lines: hits.map((h) => {
      const body = h.note || h.excerpt || "";
      return `${h.topic}：${clip(body || "(无内容)", maxPer)}`;
    }),
  };
}

function renderSamples(hits: SampleChunkHit[], maxPer: number): RenderedSection {
  return {
    header: "=== 参考节选 ===",
    lines: hits.map((h) => {
      const tag = `[from 《${h.libTitle}》${h.libAuthor ? `· ${h.libAuthor}` : ""}${h.chapterTitle ? ` · ${h.chapterTitle}` : ""}]`;
      return `${tag} ${clip(h.text, maxPer)}`;
    }),
  };
}

/**
 * Build a 【参考资料】 block to be prepended to user prompt.
 * Returns "" when no hits in any enabled source (avoid noise).
 */
export function buildRagBlock(
  projectId: string | undefined,
  query: string,
  opts: BuildRagBlockOptions = {},
): string {
  if (!projectId || !query) return "";

  const enableWorld = opts.worldEntries !== false;
  const enableChar = opts.characters !== false;
  const enableResearch = opts.researchNotes !== false;
  const enableSamples = opts.sampleChunks !== false;
  const maxPer = opts.maxPerEntry ?? MAX_PER_ENTRY;
  const maxTotal = opts.maxTotalChars ?? MAX_TOTAL_CHARS;
  const maxHits = opts.maxHitsPerSource ?? MAX_HITS_PER_SOURCE;

  const queries = extractQueries(query);
  if (queries.length === 0) return "";

  const ctx = getAppContext();
  const sections: RenderedSection[] = [];

  if (enableWorld) {
    const hits = ragSearchWorldEntries(ctx.db, projectId, queries, maxHits);
    if (hits.length) sections.push(renderWorld(hits, maxPer));
  }
  if (enableChar) {
    const hits = ragSearchCharacters(ctx.db, projectId, queries, maxHits);
    if (hits.length) sections.push(renderCharacters(hits, maxPer));
  }
  if (enableResearch) {
    const hits = ragSearchResearchNotes(ctx.db, projectId, queries, maxHits);
    if (hits.length) sections.push(renderResearch(hits, maxPer));
  }
  if (enableSamples) {
    const hits = ragSearchSampleChunks(ctx.db, projectId, queries, maxHits);
    if (hits.length) sections.push(renderSamples(hits, maxPer));
  }

  if (sections.length === 0) return "";

  // Render with global cap
  const out: string[] = ["【参考资料 · 仅供参考，不要复制原文】"];
  let total = 0;
  for (const sec of sections) {
    const headerLine = sec.header;
    if (total + headerLine.length > maxTotal) break;
    out.push("");
    out.push(headerLine);
    total += headerLine.length;
    for (const line of sec.lines) {
      const remaining = maxTotal - total;
      if (remaining <= 0) break;
      const truncated = line.length > remaining ? line.slice(0, remaining) + "…" : line;
      out.push(truncated);
      total += truncated.length;
    }
  }
  out.push("");
  return out.join("\n");
}
