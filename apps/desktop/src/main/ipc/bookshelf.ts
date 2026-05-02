import { ipcMain } from "electron";
import {
  ipcChannels,
  type BookshelfListBooksResponse,
} from "@inkforge/shared";
import { listBooks } from "../services/bookshelf-service";

const BOOKSHELF_LIST_BOOKS: typeof ipcChannels.bookshelfListBooks =
  "bookshelf:list-books";

export function registerBookshelfHandlers(): void {
  ipcMain.handle(
    BOOKSHELF_LIST_BOOKS,
    async (): Promise<BookshelfListBooksResponse> => {
      return listBooks();
    },
  );
}
