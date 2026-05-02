import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import {
  ipcChannels,
  ipcEventChannels,
  type AchievementCheckInput,
  type AchievementCheckResponse,
  type AchievementListInput,
  type AchievementStatsResponse,
} from "@inkforge/shared";
import {
  checkAchievements,
  getAchievementStats,
  listAchievements,
} from "../services/achievement-service";

export function registerAchievementHandlers(
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    ipcChannels.achievementList,
    async (_event, input: AchievementListInput) => {
      return listAchievements(input.projectId);
    },
  );

  ipcMain.handle(
    ipcChannels.achievementCheck,
    async (
      _event,
      input: AchievementCheckInput,
    ): Promise<AchievementCheckResponse> => {
      const newlyUnlocked = checkAchievements(
        input.projectId,
        input.trigger ?? "manual",
      );
      // 给渲染端推 toast
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        for (const ach of newlyUnlocked) {
          try {
            win.webContents.send(ipcEventChannels.achievementUnlocked, {
              projectId: input.projectId,
              achievement: ach,
            });
          } catch {
            /* ignore */
          }
        }
      }
      return { newlyUnlocked };
    },
  );

  ipcMain.handle(
    ipcChannels.achievementStats,
    async (_event, input: { projectId: string }): Promise<AchievementStatsResponse> => {
      return getAchievementStats(input.projectId);
    },
  );
}
