import { ipcMain } from "electron";
import type {
  DiagCrashStatusResponse,
  DiagSnapshotInput,
  DiagSnapshotResponse,
} from "@inkforge/shared";
import { ipcChannels } from "@inkforge/shared";
import { buildDiagSnapshot } from "../services/diag-service";
import { getCrashMarker } from "../services/crash-marker";

export function registerDiagHandlers(): void {
  ipcMain.handle(
    ipcChannels.diagSnapshot,
    async (_event, input?: DiagSnapshotInput): Promise<DiagSnapshotResponse> =>
      buildDiagSnapshot(input),
  );
  ipcMain.handle(ipcChannels.diagCrashStatus, async (): Promise<DiagCrashStatusResponse> => {
    const marker = getCrashMarker();
    return {
      crashed: marker?.crashed ?? false,
      crashedAt: marker?.crashedAt ?? null,
      reason: marker?.crashReason ?? null,
    };
  });
  ipcMain.handle(ipcChannels.diagCrashDismiss, async (): Promise<{ ok: true }> => {
    const marker = getCrashMarker();
    if (marker) marker.crashed = false;
    // Keep the live lock in place; it will be removed on clean quit.
    return { ok: true };
  });
}
