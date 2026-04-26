import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";

/**
 * Detect unclean shutdowns by writing a marker on boot and removing it on
 * clean quit. If the marker is still there on the next boot, the previous
 * session crashed — surface a recovery hint to the renderer.
 */

const MARKER_NAME = "session.lock";

export interface CrashMarker {
  /** Absolute path of the marker file. */
  markerPath: string;
  /** true on this boot iff the previous session exited uncleanly. */
  crashed: boolean;
  /** Unix ms timestamp written to the marker, or null when no prior marker. */
  crashedAt: number | null;
  /** Optional reason captured from the prior session's uncaughtException. */
  crashReason: string | null;
}

let current: CrashMarker | null = null;

export function initCrashMarker(userDataDir: string): CrashMarker {
  const markerPath = path.join(userDataDir, MARKER_NAME);
  let crashed = false;
  let crashedAt: number | null = null;
  let crashReason: string | null = null;
  try {
    if (fs.existsSync(markerPath)) {
      crashed = true;
      try {
        const raw = fs.readFileSync(markerPath, "utf8");
        const parsed = JSON.parse(raw) as { ts?: number; reason?: string };
        if (typeof parsed.ts === "number") crashedAt = parsed.ts;
        if (typeof parsed.reason === "string") crashReason = parsed.reason;
      } catch {
        // Marker unreadable but present — still counts as crash signal.
      }
      logger.warn(`Detected unclean shutdown marker at ${markerPath}`);
    }
    fs.writeFileSync(
      markerPath,
      JSON.stringify({ ts: Date.now(), pid: process.pid }),
      "utf8",
    );
  } catch (error) {
    logger.error("Failed to write crash marker", error);
  }
  current = { markerPath, crashed, crashedAt, crashReason };
  return current;
}

export function getCrashMarker(): CrashMarker | null {
  return current;
}

/**
 * Append a crash reason to the live lock so the next boot can surface it.
 * Safe to call from uncaughtException handlers — uses synchronous I/O and
 * swallows all errors to avoid shadowing the original crash.
 */
export function recordCrashReason(reason: string): void {
  if (!current) return;
  try {
    fs.writeFileSync(
      current.markerPath,
      JSON.stringify({ ts: Date.now(), pid: process.pid, reason }),
      "utf8",
    );
  } catch {
    // intentionally swallowed
  }
}

export function clearCrashMarker(): void {
  if (!current) return;
  try {
    fs.rmSync(current.markerPath, { force: true });
  } catch (error) {
    logger.warn("Failed to remove crash marker", error);
  }
  current = null;
}
