import * as path from "path";
import { randomUUID } from "crypto";
import {
  deleteBookCover as deleteBookCoverRow,
  deleteCoverFile,
  getBookCover,
  getProject,
  readCoverFile,
  upsertBookCover,
  writeCoverFile,
} from "@inkforge/storage";
import type { BookCoverRecord } from "@inkforge/shared";
import { getAppContext } from "./app-state";
import { logger } from "./logger";

const MAX_COVER_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const MIME_EXT_FALLBACK: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function pickExt(fileName: string, mime: string): string {
  const fromName = path.extname(fileName).replace(/^\./, "").toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName) && fromName.length <= 5) return fromName;
  return MIME_EXT_FALLBACK[mime] ?? "png";
}

/**
 * 上传封面：base64 → 写文件 → 写 DB 行（覆盖旧）。
 * 失败时尝试回滚文件。
 */
export function uploadCover(input: {
  projectId: string;
  fileName: string;
  base64: string;
  mime: string;
}): BookCoverRecord {
  if (!ALLOWED_MIMES.has(input.mime)) {
    throw new Error(`Unsupported cover mime: ${input.mime}`);
  }
  const buffer = Buffer.from(input.base64, "base64");
  if (buffer.byteLength === 0) {
    throw new Error("Cover file is empty");
  }
  if (buffer.byteLength > MAX_COVER_BYTES) {
    throw new Error(
      `Cover too large: ${buffer.byteLength} bytes (max ${MAX_COVER_BYTES})`,
    );
  }
  const ctx = getAppContext();
  const project = getProject(ctx.db, input.projectId);
  if (!project) throw new Error(`Project not found: ${input.projectId}`);

  const ext = pickExt(input.fileName, input.mime);
  let writtenRel: string | null = null;
  try {
    writtenRel = writeCoverFile(project.path, ext, buffer);
    return upsertBookCover(ctx.db, {
      id: randomUUID(),
      projectId: project.id,
      filePath: writtenRel,
      mime: input.mime,
    });
  } catch (error) {
    if (writtenRel) {
      try {
        deleteCoverFile(project.path, writtenRel);
      } catch {
        /* ignore */
      }
    }
    throw error;
  }
}

/** 读取封面 + 返回 base64 内容供 renderer 直接显示。 */
export function getCoverWithContent(projectId: string): {
  cover: BookCoverRecord | null;
  base64: string | null;
} {
  const ctx = getAppContext();
  const cover = getBookCover(ctx.db, projectId);
  if (!cover) return { cover: null, base64: null };
  const project = getProject(ctx.db, projectId);
  if (!project) return { cover, base64: null };
  try {
    const bytes = readCoverFile(project.path, cover.filePath);
    if (!bytes) return { cover, base64: null };
    return { cover, base64: bytes.toString("base64") };
  } catch (error) {
    logger.warn("read cover failed", error);
    return { cover, base64: null };
  }
}

export function removeCover(projectId: string): { projectId: string } {
  const ctx = getAppContext();
  const cover = getBookCover(ctx.db, projectId);
  if (!cover) return { projectId };
  const project = getProject(ctx.db, projectId);
  if (project) {
    try {
      deleteCoverFile(project.path, cover.filePath);
    } catch (error) {
      logger.warn("delete cover file failed", error);
    }
  }
  deleteBookCoverRow(ctx.db, projectId);
  return { projectId };
}
