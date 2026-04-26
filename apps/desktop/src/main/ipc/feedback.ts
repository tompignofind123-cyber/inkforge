import { ipcMain } from "electron";
import { listFeedbacksByChapter, setFeedbackDismissed } from "@inkforge/storage";
import type {
  AIFeedbackRecord,
  FeedbackDismissInput,
  FeedbackListInput,
  ipcChannels,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";

const FEEDBACK_LIST: typeof ipcChannels.feedbackList = "feedback:list";
const FEEDBACK_DISMISS: typeof ipcChannels.feedbackDismiss = "feedback:dismiss";

export function registerFeedbackHandlers(): void {
  ipcMain.handle(FEEDBACK_LIST, async (_event, input: FeedbackListInput): Promise<AIFeedbackRecord[]> => {
    const ctx = getAppContext();
    return listFeedbacksByChapter(ctx.db, input.chapterId, input.limit ?? 50);
  });
  ipcMain.handle(
    FEEDBACK_DISMISS,
    async (_event, input: FeedbackDismissInput): Promise<{ id: string; dismissed: boolean }> => {
      const ctx = getAppContext();
      const dismissed = input.dismissed ?? true;
      setFeedbackDismissed(ctx.db, input.id, dismissed);
      return { id: input.id, dismissed };
    },
  );
}
