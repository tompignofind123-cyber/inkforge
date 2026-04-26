import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

export type DB = Database.Database;

export interface OpenDatabaseOptions {
  workspaceDir: string;
  fileName?: string;
}

export function openDatabase(options: OpenDatabaseOptions): DB {
  const { workspaceDir, fileName = "inkforge.db" } = options;
  fs.mkdirSync(workspaceDir, { recursive: true });
  const dbPath = path.join(workspaceDir, fileName);
  const db = new Database(dbPath);
  // WAL + NORMAL sync: crash-safe and fast for single-writer apps.
  // WAL on NAS is unreliable, so detect and fall back if the mode flip fails.
  try {
    db.pragma("journal_mode = WAL");
  } catch {
    db.pragma("journal_mode = DELETE");
  }
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  // Checkpoint on open: truncate WAL if the previous session exited cleanly.
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // non-fatal; WAL might be disabled.
  }
  return db;
}

/** Run a VACUUM. Safe to call periodically; caller must hold no open iterator. */
export function vacuum(db: DB): void {
  db.exec("VACUUM");
}
