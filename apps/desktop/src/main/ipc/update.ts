import { ipcMain } from "electron";
import type { UpdateStatus } from "@inkforge/shared";
import { ipcChannels } from "@inkforge/shared";
import {
  checkForUpdatesManual,
  downloadUpdate,
  getLatestUpdateStatus,
  initAutoUpdater,
  openDownloadPage,
  quitAndInstall,
} from "../services/auto-update-service";

export function registerUpdateHandlers(feedUrl?: string): void {
  initAutoUpdater({ feedUrl });

  ipcMain.handle(
    ipcChannels.updateCheck,
    async (): Promise<UpdateStatus> => checkForUpdatesManual(),
  );
  ipcMain.handle(ipcChannels.updateDownload, async (): Promise<{ ok: true }> => {
    await downloadUpdate();
    return { ok: true };
  });
  ipcMain.handle(ipcChannels.updateInstall, async (): Promise<{ ok: true }> => {
    quitAndInstall();
    return { ok: true };
  });
  ipcMain.handle(
    ipcChannels.updateStatus,
    async (): Promise<UpdateStatus> => getLatestUpdateStatus(),
  );
  ipcMain.handle(
    ipcChannels.updateOpenDownloadPage,
    async (): Promise<{ ok: true }> => {
      await openDownloadPage();
      return { ok: true };
    },
  );
}
