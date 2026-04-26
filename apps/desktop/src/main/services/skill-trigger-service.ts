import type { BrowserWindow } from "electron";
import {
  TriggerScheduler,
  type SkillEditorEvent,
} from "@inkforge/skill-engine";
import { listSkillRecords, runSkill } from "./skill-service";

let scheduler: TriggerScheduler | null = null;
let getWindowRef: (() => BrowserWindow | null) | null = null;

function ensureScheduler(): TriggerScheduler {
  if (scheduler) return scheduler;
  scheduler = new TriggerScheduler({
    getEnabledSkills: async () => {
      return listSkillRecords({ enabledOnly: true });
    },
    onDispatch: async (dispatch) => {
      const getWindow = getWindowRef;
      await runSkill({
        input: {
          skillId: dispatch.skillId,
          projectId: dispatch.context.projectId,
          chapterId: dispatch.context.chapterId,
          chapterTitle: dispatch.context.chapterTitle,
          chapterText: dispatch.context.chapterText,
          selection: dispatch.context.selection,
          character: dispatch.context.character,
          manualVariables: dispatch.context.manualVariables,
          triggerType: dispatch.triggerType,
          runId: dispatch.runId,
        },
        window: getWindow ? getWindow() : null,
      });
    },
  });
  return scheduler;
}

export function initializeSkillTriggerService(
  getWindow: () => BrowserWindow | null,
): void {
  getWindowRef = getWindow;
  ensureScheduler();
}

export async function ingestSkillTriggerEvent(event: SkillEditorEvent): Promise<void> {
  const active = ensureScheduler();
  await active.ingest(event);
}

export async function flushOnSave(input: {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterText: string;
}): Promise<void> {
  const active = ensureScheduler();
  await active.ingest({
    type: "save",
    projectId: input.projectId,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    chapterText: input.chapterText,
    at: new Date().toISOString(),
  });
  await active.flush(input.projectId, input.chapterId);
}

export async function flushOnChapterEnd(input: {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterText: string;
}): Promise<void> {
  const active = ensureScheduler();
  await active.ingest({
    type: "chapter-end",
    projectId: input.projectId,
    chapterId: input.chapterId,
    chapterTitle: input.chapterTitle,
    chapterText: input.chapterText,
    at: new Date().toISOString(),
  });
  await active.flush(input.projectId, input.chapterId);
}

export function disposeSkillTriggerService(): void {
  scheduler?.dispose();
  scheduler = null;
  getWindowRef = null;
}
