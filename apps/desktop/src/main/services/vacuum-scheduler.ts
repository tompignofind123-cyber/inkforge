import * as fs from "fs";
import * as path from "path";
import { vacuum, type DB } from "@inkforge/storage";
import { logger } from "./logger";

/**
 * Run SQLite VACUUM at most once per week per workspace. State is persisted
 * in `<workspaceDir>/maintenance.json` so the cadence survives restarts and
 * is per-workspace (each project DB tracked independently).
 *
 * VACUUM rewrites the entire DB file and holds an exclusive lock; do NOT call
 * while iterating queries or during heavy write bursts. We schedule it shortly
 * after boot when the app is idle, then arm a 24h interval to re-check.
 */

const MAINTENANCE_FILE = "maintenance.json";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 30_000;
const RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface MaintenanceState {
  lastVacuumAt: number | null;
}

let initialTimer: NodeJS.Timeout | null = null;
let recheckTimer: NodeJS.Timeout | null = null;
let activeDb: DB | null = null;
let activeWorkspaceDir: string | null = null;

function maintenancePath(workspaceDir: string): string {
  return path.join(workspaceDir, MAINTENANCE_FILE);
}

function readState(workspaceDir: string): MaintenanceState {
  const file = maintenancePath(workspaceDir);
  if (!fs.existsSync(file)) return { lastVacuumAt: null };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    const ts = typeof raw?.lastVacuumAt === "number" ? raw.lastVacuumAt : null;
    return { lastVacuumAt: ts };
  } catch {
    return { lastVacuumAt: null };
  }
}

function writeState(workspaceDir: string, state: MaintenanceState): void {
  try {
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(maintenancePath(workspaceDir), JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    logger.warn("Failed to persist maintenance state", error);
  }
}

function maybeRunVacuum(): void {
  if (!activeDb || !activeWorkspaceDir) return;
  const state = readState(activeWorkspaceDir);
  const now = Date.now();
  if (state.lastVacuumAt !== null && now - state.lastVacuumAt < ONE_WEEK_MS) return;
  const started = now;
  try {
    vacuum(activeDb);
    const elapsed = Date.now() - started;
    logger.info(`VACUUM completed in ${elapsed}ms`);
    writeState(activeWorkspaceDir, { lastVacuumAt: Date.now() });
  } catch (error) {
    // Don't update lastVacuumAt — we'll retry next cycle.
    logger.warn("VACUUM failed", error);
  }
}

export function initVacuumScheduler(db: DB, workspaceDir: string): void {
  disposeVacuumScheduler();
  activeDb = db;
  activeWorkspaceDir = workspaceDir;
  initialTimer = setTimeout(maybeRunVacuum, INITIAL_DELAY_MS);
  recheckTimer = setInterval(maybeRunVacuum, RECHECK_INTERVAL_MS);
}

export function disposeVacuumScheduler(): void {
  if (initialTimer) {
    clearTimeout(initialTimer);
    initialTimer = null;
  }
  if (recheckTimer) {
    clearInterval(recheckTimer);
    recheckTimer = null;
  }
  activeDb = null;
  activeWorkspaceDir = null;
}
