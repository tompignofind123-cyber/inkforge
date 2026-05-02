import { randomUUID } from "crypto";
import {
  deleteChapterSnapshot as deleteSnapshotRow,
  deleteSnapshotFile,
  findPrunableSnapshots,
  findRecentSnapshotByHash,
  getChapter,
  getChapterSnapshot,
  getProject,
  hashContent,
  insertChapterSnapshot,
  listChapterSnapshots,
  readChapterFile,
  readSnapshotFile,
  relSnapshotPath,
  updateChapter,
  writeChapterFile,
  writeSnapshotFile,
  type CreateSnapshotRowInput,
  type ListChapterSnapshotsOptions,
} from "@inkforge/storage";
import type {
  AutoWriterAgentRole,
  ChapterRecord,
  ChapterSnapshotKind,
  ChapterSnapshotRecord,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";
import { logger } from "./logger";

/** 自动快照保留上限。手动 + pre-restore 不计入此上限。 */
const AUTO_SNAPSHOT_RETENTION = 50;

export interface CreateSnapshotOptions {
  chapterId: string;
  projectId: string;
  kind: ChapterSnapshotKind;
  /** 当 content 不传时，会读取 chapter 当前正文。 */
  content?: string;
  label?: string | null;
  runId?: string | null;
  agentRole?: AutoWriterAgentRole | null;
  sourceMessageId?: string | null;
  /**
   * 同章同 hash 去重：默认 true。手动快照传 false（用户主动备份不该被去重）。
   */
  dedupe?: boolean;
}

export interface CreateSnapshotResult {
  snapshot: ChapterSnapshotRecord;
  /** 是否因为 dedupe 命中而复用了已有快照（未实际写文件）。 */
  reused: boolean;
}

/**
 * 创建一个章节快照。auto-writer / 手动按钮 / 每日提醒共用此函数。
 * 流程：
 *   1) 计算内容 hash；如启用 dedupe 且最近一条同 hash 命中则复用
 *   2) 生成 snapshotId 决定 file_path
 *   3) 写入快照文件
 *   4) 写入 DB 行（失败时回滚文件）
 *   5) 若是自动快照类型，prune 旧的超出保留上限的自动快照
 */
export function createSnapshot(options: CreateSnapshotOptions): CreateSnapshotResult {
  const ctx = getAppContext();
  const chapter = getChapter(ctx.db, options.chapterId);
  if (!chapter) throw new Error(`Chapter not found: ${options.chapterId}`);
  const project = getProject(ctx.db, options.projectId);
  if (!project) throw new Error(`Project not found: ${options.projectId}`);

  const content = options.content ?? readChapterFile(project.path, chapter.filePath);
  const contentHash = hashContent(content);
  const wordCount = countWords(content);

  const dedupe = options.dedupe ?? options.kind !== "manual";
  if (dedupe) {
    const recent = findRecentSnapshotByHash(ctx.db, options.chapterId, contentHash);
    // 仅当最近一条快照的 hash 与本次一致时，认为是「无变化」并复用
    if (recent) {
      const latest = listChapterSnapshots(ctx.db, options.chapterId, { limit: 1 })[0];
      if (latest && latest.id === recent.id) {
        return { snapshot: recent, reused: true };
      }
    }
  }

  const id = randomUUID();
  const filePath = relSnapshotPath(options.chapterId, id);

  let fileWritten = false;
  try {
    writeSnapshotFile(project.path, options.chapterId, id, content);
    fileWritten = true;

    const row: CreateSnapshotRowInput = {
      id,
      chapterId: options.chapterId,
      projectId: options.projectId,
      kind: options.kind,
      label: options.label ?? null,
      contentHash,
      filePath,
      wordCount,
      runId: options.runId ?? null,
      agentRole: options.agentRole ?? null,
      sourceMessageId: options.sourceMessageId ?? null,
    };
    const record = insertChapterSnapshot(ctx.db, row);

    pruneAutoSnapshots(options.chapterId, project.path).catch((err) => {
      logger.warn("snapshot prune failed", err);
    });

    return { snapshot: record, reused: false };
  } catch (error) {
    if (fileWritten) {
      try {
        deleteSnapshotFile(project.path, filePath);
      } catch {
        /* ignore */
      }
    }
    throw error;
  }
}

export function listSnapshots(
  chapterId: string,
  options?: ListChapterSnapshotsOptions,
): ChapterSnapshotRecord[] {
  const ctx = getAppContext();
  return listChapterSnapshots(ctx.db, chapterId, options);
}

export interface GetSnapshotResult {
  snapshot: ChapterSnapshotRecord;
  content: string;
}

export function getSnapshotWithContent(snapshotId: string): GetSnapshotResult {
  const ctx = getAppContext();
  const snapshot = getChapterSnapshot(ctx.db, snapshotId);
  if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);
  const project = getProject(ctx.db, snapshot.projectId);
  if (!project) throw new Error(`Project not found: ${snapshot.projectId}`);
  const content = readSnapshotFile(project.path, snapshot.filePath) ?? "";
  return { snapshot, content };
}

export interface RestoreSnapshotResult {
  restored: ChapterSnapshotRecord;
  preRestoreSnapshot: ChapterSnapshotRecord;
  chapterContent: string;
  chapter: ChapterRecord;
}

/**
 * 还原到指定快照。
 * 1) 先给当前章节打一个 'pre-restore' 快照（让还原本身可撤销）
 * 2) 再用快照内容覆盖章节文件 + DB 行
 *
 * 不与 chapter:autosave 冲突：autosave 走旁路文件 `.history/.autosave-<chap>.md`，
 * 我们走 chapters/*.md 主路径。
 */
export function restoreSnapshot(snapshotId: string): RestoreSnapshotResult {
  const ctx = getAppContext();
  const target = getChapterSnapshot(ctx.db, snapshotId);
  if (!target) throw new Error(`Snapshot not found: ${snapshotId}`);
  const chapter = getChapter(ctx.db, target.chapterId);
  if (!chapter) throw new Error(`Chapter not found: ${target.chapterId}`);
  const project = getProject(ctx.db, target.projectId);
  if (!project) throw new Error(`Project not found: ${target.projectId}`);

  const targetContent = readSnapshotFile(project.path, target.filePath);
  if (targetContent === null) {
    throw new Error(`Snapshot file missing on disk: ${target.filePath}`);
  }

  // Step 1: 当前内容打 pre-restore 快照（dedupe=false 确保哪怕重复点也会留痕迹）
  const preResult = createSnapshot({
    chapterId: chapter.id,
    projectId: project.id,
    kind: "pre-restore",
    label: `pre-restore: ${target.id.slice(0, 8)}`,
    dedupe: false,
  });

  // Step 2: 覆盖章节
  writeChapterFile(project.path, chapter.filePath, targetContent);
  const newWordCount = countWords(targetContent);
  const updatedChapter = updateChapter(ctx.db, {
    id: chapter.id,
    wordCount: newWordCount,
  });

  return {
    restored: target,
    preRestoreSnapshot: preResult.snapshot,
    chapterContent: targetContent,
    chapter: updatedChapter,
  };
}

export function deleteSnapshot(snapshotId: string): { snapshotId: string } {
  const ctx = getAppContext();
  const existing = getChapterSnapshot(ctx.db, snapshotId);
  if (!existing) return { snapshotId };
  const project = getProject(ctx.db, existing.projectId);
  if (project) {
    try {
      deleteSnapshotFile(project.path, existing.filePath);
    } catch (error) {
      logger.warn("snapshot file delete failed", error);
    }
  }
  deleteSnapshotRow(ctx.db, snapshotId);
  return { snapshotId };
}

// ---------- helpers ----------

function countWords(content: string): number {
  // 与现有章节字数统计一致：去除空白后按字符计（CJK 语境合理近似）
  return content.replace(/\s+/g, "").length;
}

async function pruneAutoSnapshots(chapterId: string, projectPath: string): Promise<void> {
  const ctx = getAppContext();
  const removable = findPrunableSnapshots(ctx.db, chapterId, AUTO_SNAPSHOT_RETENTION);
  if (removable.length === 0) return;
  for (const row of removable) {
    try {
      deleteSnapshotFile(projectPath, row.filePath);
    } catch {
      /* ignore */
    }
    try {
      deleteSnapshotRow(ctx.db, row.id);
    } catch (error) {
      logger.warn("snapshot prune row failed", error);
    }
  }
}
