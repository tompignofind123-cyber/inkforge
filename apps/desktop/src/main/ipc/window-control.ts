import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { ipcChannels, ipcEventChannels } from "@inkforge/shared";

/**
 * 自定义无边框 titlebar 的窗口控制 IPC。
 *
 * - minimize / toggle-maximize / close：渲染端按钮触发
 * - is-maximized：用于按钮 icon 的显示态（[ ] / [❐]）
 * - 主进程监听 window 的 maximize/unmaximize 事件，向渲染端广播
 *   `window:maximized-changed`，让 UI 即时刷新最大化按钮图标。
 */
export function registerWindowControlHandlers(
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    ipcChannels.windowMinimize,
    async (): Promise<{ ok: true }> => {
      const win = getWindow();
      if (win && !win.isDestroyed()) win.minimize();
      return { ok: true };
    },
  );

  ipcMain.handle(
    ipcChannels.windowToggleMaximize,
    async (): Promise<{ isMaximized: boolean }> => {
      const win = getWindow();
      if (!win || win.isDestroyed()) return { isMaximized: false };
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
      return { isMaximized: win.isMaximized() };
    },
  );

  ipcMain.handle(ipcChannels.windowClose, async (): Promise<{ ok: true }> => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.close();
    return { ok: true };
  });

  ipcMain.handle(
    ipcChannels.windowIsMaximized,
    async (): Promise<{ isMaximized: boolean }> => {
      const win = getWindow();
      return { isMaximized: win?.isMaximized() ?? false };
    },
  );

  // 监听窗口状态变化并广播
  const win = getWindow();
  if (win) {
    const broadcast = (isMaximized: boolean): void => {
      try {
        win.webContents.send(ipcEventChannels.windowMaximizedChanged, {
          isMaximized,
        });
      } catch {
        // ignore
      }
    };
    win.on("maximize", () => broadcast(true));
    win.on("unmaximize", () => broadcast(false));
    win.on("enter-full-screen", () => broadcast(true));
    win.on("leave-full-screen", () => broadcast(false));
  }
}
