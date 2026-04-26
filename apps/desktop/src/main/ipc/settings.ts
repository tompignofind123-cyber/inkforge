import { ipcMain } from "electron";
import { getAppSettings, setAppSettings } from "@inkforge/storage";
import type { AppSettings, SettingsGetInput, SettingsSetInput, ipcChannels } from "@inkforge/shared";
import { getAppContext } from "../services/app-state";

const SETTINGS_GET: typeof ipcChannels.settingsGet = "settings:get";
const SETTINGS_SET: typeof ipcChannels.settingsSet = "settings:set";

export function registerSettingsHandlers(): void {
  ipcMain.handle(SETTINGS_GET, async (_event, _input: SettingsGetInput): Promise<AppSettings> => {
    const ctx = getAppContext();
    return getAppSettings(ctx.db);
  });
  ipcMain.handle(SETTINGS_SET, async (_event, input: SettingsSetInput): Promise<AppSettings> => {
    const ctx = getAppContext();
    return setAppSettings(ctx.db, input.updates);
  });
}
