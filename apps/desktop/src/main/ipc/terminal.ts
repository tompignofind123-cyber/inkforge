import { ipcMain, type BrowserWindow } from "electron";
import type {
  TerminalDisposePayload,
  TerminalInputPayload,
  TerminalResizePayload,
  TerminalSpawnInput,
  TerminalSpawnResponse,
  ipcChannels,
} from "@inkforge/shared";
import { dispose, resize, spawnSession, writeInput } from "../services/terminal-service";

const TERMINAL_SPAWN: typeof ipcChannels.terminalSpawn = "terminal:spawn";
const TERMINAL_INPUT: typeof ipcChannels.terminalInput = "terminal:input";
const TERMINAL_RESIZE: typeof ipcChannels.terminalResize = "terminal:resize";
const TERMINAL_DISPOSE: typeof ipcChannels.terminalDispose = "terminal:dispose";

export function registerTerminalHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    TERMINAL_SPAWN,
    async (_event, input: TerminalSpawnInput): Promise<TerminalSpawnResponse> => {
      return spawnSession(input ?? {}, getWindow);
    },
  );
  ipcMain.handle(
    TERMINAL_INPUT,
    async (_event, payload: TerminalInputPayload): Promise<{ ok: true }> => {
      writeInput(payload.id, payload.data);
      return { ok: true };
    },
  );
  ipcMain.handle(
    TERMINAL_RESIZE,
    async (_event, payload: TerminalResizePayload): Promise<{ ok: true }> => {
      resize(payload.id, payload.cols, payload.rows);
      return { ok: true };
    },
  );
  ipcMain.handle(
    TERMINAL_DISPOSE,
    async (_event, payload: TerminalDisposePayload): Promise<{ ok: true }> => {
      dispose(payload.id);
      return { ok: true };
    },
  );
}
