import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import {
  ipcChannels,
  type AutoWriterCorrectInput,
  type AutoWriterCorrectResponse,
  type AutoWriterGetRunInput,
  type AutoWriterInjectIdeaInput,
  type AutoWriterListRunsInput,
  type AutoWriterPauseInput,
  type AutoWriterResumeInput,
  type AutoWriterRunRecord,
  type AutoWriterStartInput,
  type AutoWriterStartResponse,
  type AutoWriterStopInput,
  type AutoWriterStopResponse,
} from "@inkforge/shared";
import {
  correctSegment,
  getAutoWriterRunRecord,
  injectIdea,
  listAutoWriterRuns,
  pauseAutoWriter,
  resumeAutoWriter,
  startAutoWriter,
  stopAutoWriter,
} from "../services/auto-writer-service";

const AW_START: typeof ipcChannels.autoWriterStart = "auto-writer:start";
const AW_STOP: typeof ipcChannels.autoWriterStop = "auto-writer:stop";
const AW_PAUSE: typeof ipcChannels.autoWriterPause = "auto-writer:pause";
const AW_RESUME: typeof ipcChannels.autoWriterResume = "auto-writer:resume";
const AW_GET: typeof ipcChannels.autoWriterGetRun = "auto-writer:get-run";
const AW_LIST: typeof ipcChannels.autoWriterListRuns = "auto-writer:list-runs";
const AW_INJECT: typeof ipcChannels.autoWriterInjectIdea = "auto-writer:inject-idea";
const AW_CORRECT: typeof ipcChannels.autoWriterCorrect = "auto-writer:correct";

export function registerAutoWriterHandlers(
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    AW_START,
    async (_event, input: AutoWriterStartInput): Promise<AutoWriterStartResponse> => {
      const { runId } = await startAutoWriter(input, getWindow);
      return { runId, status: "started" };
    },
  );

  ipcMain.handle(
    AW_STOP,
    async (_event, input: AutoWriterStopInput): Promise<AutoWriterStopResponse> => {
      stopAutoWriter(input.runId);
      return { runId: input.runId, stopped: true };
    },
  );

  ipcMain.handle(
    AW_PAUSE,
    async (_event, input: AutoWriterPauseInput): Promise<AutoWriterRunRecord> => {
      return pauseAutoWriter(input.runId);
    },
  );

  ipcMain.handle(
    AW_RESUME,
    async (_event, input: AutoWriterResumeInput): Promise<AutoWriterRunRecord> => {
      return resumeAutoWriter(input.runId);
    },
  );

  ipcMain.handle(
    AW_GET,
    async (_event, input: AutoWriterGetRunInput): Promise<AutoWriterRunRecord | null> => {
      return getAutoWriterRunRecord(input.runId);
    },
  );

  ipcMain.handle(
    AW_LIST,
    async (_event, input: AutoWriterListRunsInput): Promise<AutoWriterRunRecord[]> => {
      return listAutoWriterRuns(input);
    },
  );

  ipcMain.handle(
    AW_INJECT,
    async (_event, input: AutoWriterInjectIdeaInput): Promise<AutoWriterRunRecord> => {
      return injectIdea(input);
    },
  );

  ipcMain.handle(
    AW_CORRECT,
    async (_event, input: AutoWriterCorrectInput): Promise<AutoWriterCorrectResponse> => {
      const { run, correction } = correctSegment(input);
      return { runId: input.runId, correction, run };
    },
  );
}
