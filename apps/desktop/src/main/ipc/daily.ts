import { ipcMain } from "electron";
import { getDailyProgress, getProject, todayKey } from "@inkforge/storage";
import type { DailyProgressInput, DailyProgressRecord, ipcChannels } from "@inkforge/shared";
import { getAppContext } from "../services/app-state";

const DAILY_PROGRESS: typeof ipcChannels.dailyProgress = "daily:progress";

export function registerDailyHandlers(): void {
  ipcMain.handle(DAILY_PROGRESS, async (_event, input: DailyProgressInput): Promise<DailyProgressRecord> => {
    const ctx = getAppContext();
    const project = getProject(ctx.db, input.projectId);
    const goal = project?.dailyGoal ?? 1000;
    return getDailyProgress(ctx.db, input.projectId, goal, input.date ?? todayKey());
  });
}
