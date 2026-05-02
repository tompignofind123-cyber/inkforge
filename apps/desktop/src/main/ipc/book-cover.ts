import { ipcMain } from "electron";
import {
  ipcChannels,
  type BookCoverDeleteInput,
  type BookCoverGetInput,
  type BookCoverGetResponse,
  type BookCoverUploadInput,
  type BookCoverUploadResponse,
} from "@inkforge/shared";
import {
  getCoverWithContent,
  removeCover,
  uploadCover,
} from "../services/cover-service";

const COVER_UPLOAD: typeof ipcChannels.bookCoverUpload = "book-cover:upload";
const COVER_GET: typeof ipcChannels.bookCoverGet = "book-cover:get";
const COVER_DELETE: typeof ipcChannels.bookCoverDelete = "book-cover:delete";

export function registerBookCoverHandlers(): void {
  ipcMain.handle(
    COVER_UPLOAD,
    async (_event, input: BookCoverUploadInput): Promise<BookCoverUploadResponse> => {
      return { cover: uploadCover(input) };
    },
  );

  ipcMain.handle(
    COVER_GET,
    async (_event, input: BookCoverGetInput): Promise<BookCoverGetResponse> => {
      return getCoverWithContent(input.projectId);
    },
  );

  ipcMain.handle(
    COVER_DELETE,
    async (_event, input: BookCoverDeleteInput): Promise<{ projectId: string }> => {
      return removeCover(input.projectId);
    },
  );
}
