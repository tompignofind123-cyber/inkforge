import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import {
  ipcChannels,
  type LetterDeleteInput,
  type LetterDismissInput,
  type LetterGenerateInput,
  type LetterListInput,
  type LetterMarkReadInput,
  type LetterPinInput,
} from "@inkforge/shared";
import {
  deleteLetter,
  dismissLetter,
  generateLetter,
  listLetters,
  markLetterRead,
  pinLetter,
} from "../services/letter-service";

export function registerLetterHandlers(
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    ipcChannels.letterList,
    async (_event, input: LetterListInput) => {
      return listLetters(input.projectId, {
        includeDismissed: input.includeDismissed,
        characterId: input.characterId,
        limit: input.limit,
      });
    },
  );

  ipcMain.handle(
    ipcChannels.letterGenerate,
    async (_event, input: LetterGenerateInput) => {
      return generateLetter(input, getWindow());
    },
  );

  ipcMain.handle(
    ipcChannels.letterMarkRead,
    async (_event, input: LetterMarkReadInput) => {
      return markLetterRead(input.letterId, input.read);
    },
  );

  ipcMain.handle(
    ipcChannels.letterPin,
    async (_event, input: LetterPinInput) => {
      return pinLetter(input.letterId, input.pinned);
    },
  );

  ipcMain.handle(
    ipcChannels.letterDismiss,
    async (_event, input: LetterDismissInput) => {
      return dismissLetter(input.letterId);
    },
  );

  ipcMain.handle(
    ipcChannels.letterDelete,
    async (_event, input: LetterDeleteInput) => {
      return deleteLetter(input.letterId);
    },
  );
}
