import * as fs from "fs";
import * as path from "path";

export interface ProjectLayout {
  root: string;
  chapters: string;
  characters: string;
  world: string;
  history: string;
  bookJson: string;
}

export function resolveProjectLayout(projectPath: string): ProjectLayout {
  return {
    root: projectPath,
    chapters: path.join(projectPath, "chapters"),
    characters: path.join(projectPath, "characters"),
    world: path.join(projectPath, "world"),
    history: path.join(projectPath, ".history"),
    bookJson: path.join(projectPath, "book.json"),
  };
}

export function ensureProjectLayout(projectPath: string, projectName: string): ProjectLayout {
  const layout = resolveProjectLayout(projectPath);
  fs.mkdirSync(layout.root, { recursive: true });
  fs.mkdirSync(layout.chapters, { recursive: true });
  fs.mkdirSync(layout.characters, { recursive: true });
  fs.mkdirSync(layout.world, { recursive: true });
  fs.mkdirSync(layout.history, { recursive: true });
  if (!fs.existsSync(layout.bookJson)) {
    fs.writeFileSync(
      layout.bookJson,
      JSON.stringify({ name: projectName, createdAt: new Date().toISOString() }, null, 2),
      "utf-8",
    );
  }
  return layout;
}

export function sanitizeProjectName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "untitled";
}

export function sanitizeFileSegment(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "untitled";
}

export function writeChapterFile(projectPath: string, relFilePath: string, content: string): string {
  const target = path.join(projectPath, relFilePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
  return target;
}

export function readChapterFile(projectPath: string, relFilePath: string): string {
  const target = path.join(projectPath, relFilePath);
  if (!fs.existsSync(target)) return "";
  return fs.readFileSync(target, "utf-8");
}

export function deleteChapterFile(projectPath: string, relFilePath: string): void {
  const target = path.join(projectPath, relFilePath);
  if (fs.existsSync(target)) fs.unlinkSync(target);
}

export function nextChapterFileName(projectPath: string, baseTitle: string): string {
  const layout = resolveProjectLayout(projectPath);
  fs.mkdirSync(layout.chapters, { recursive: true });
  const safe = sanitizeFileSegment(baseTitle);
  let candidate = `chapters/${safe}.md`;
  let counter = 2;
  while (fs.existsSync(path.join(projectPath, candidate))) {
    candidate = `chapters/${safe}-${counter}.md`;
    counter += 1;
  }
  return candidate;
}

export function removeProjectTree(projectPath: string): void {
  if (!projectPath) return;
  if (!fs.existsSync(projectPath)) return;
  fs.rmSync(projectPath, { recursive: true, force: true });
}

/**
 * Disk-level recovery buffer used by the editor's 5s autosave.
 * Layout: `<project>/.history/.autosave-<chapterId>.md`.
 * Distinct from the DB-backed save path so a crash mid-debounce can be
 * recovered on next open.
 */
function autosavePath(projectPath: string, chapterId: string): string {
  const layout = resolveProjectLayout(projectPath);
  fs.mkdirSync(layout.history, { recursive: true });
  const safeId = chapterId.replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(layout.history, `.autosave-${safeId}.md`);
}

export function writeAutosave(
  projectPath: string,
  chapterId: string,
  content: string,
): number {
  const target = autosavePath(projectPath, chapterId);
  fs.writeFileSync(target, content, "utf-8");
  return fs.statSync(target).mtimeMs;
}

export function readAutosave(
  projectPath: string,
  chapterId: string,
): { content: string; savedAt: number } | null {
  const target = autosavePath(projectPath, chapterId);
  if (!fs.existsSync(target)) return null;
  const stat = fs.statSync(target);
  return { content: fs.readFileSync(target, "utf-8"), savedAt: stat.mtimeMs };
}

export function clearAutosave(projectPath: string, chapterId: string): void {
  const target = autosavePath(projectPath, chapterId);
  fs.rmSync(target, { force: true });
}
