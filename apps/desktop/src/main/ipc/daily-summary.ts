import { ipcMain, type BrowserWindow } from "electron";
import type {
  DailySummaryGenerateInput,
  DailySummaryGenerateResponse,
  DailySummaryGetInput,
  DailySummaryListInput,
  DailySummaryRecord,
  ipcChannels,
} from "@inkforge/shared";
import {
  getDailySummaryRecord,
  listDailySummaryRecords,
  startDailySummary,
} from "../services/daily-summary-service";

const DAILY_SUMMARY_GENERATE: typeof ipcChannels.dailySummaryGenerate = "daily:summary-generate";
const DAILY_SUMMARY_GET: typeof ipcChannels.dailySummaryGet = "daily:summary-get";
const DAILY_SUMMARY_LIST: typeof ipcChannels.dailySummaryList = "daily:summary-list";

export function registerDailySummaryHandlers(
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    DAILY_SUMMARY_GENERATE,
    async (_event, input: DailySummaryGenerateInput): Promise<DailySummaryGenerateResponse> =>
      startDailySummary(input, getWindow()),
  );
  ipcMain.handle(
    DAILY_SUMMARY_GET,
    async (_event, input: DailySummaryGetInput): Promise<DailySummaryRecord | null> =>
      getDailySummaryRecord(input),
  );
  ipcMain.handle(
    DAILY_SUMMARY_LIST,
    async (_event, input: DailySummaryListInput): Promise<DailySummaryRecord[]> =>
      listDailySummaryRecords(input),
  );
}
