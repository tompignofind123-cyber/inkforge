import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChapterOrigin } from "@inkforge/shared";

const MAX_TABS = 5;

export interface BookTab {
  projectId: string;
  /** 进入该 tab 时记住的章节 origin 过滤；null = 全部 */
  originFilter: ChapterOrigin | null;
}

export interface BookshelfStoreState {
  /** 已打开的多本书 Tab。最近一次激活的放在第一位。 */
  tabs: BookTab[];
  activeProjectId: string | null;

  openBookTab: (projectId: string) => void;
  closeBookTab: (projectId: string) => void;
  setActiveBookTab: (projectId: string | null) => void;
  setOriginFilter: (projectId: string, filter: ChapterOrigin | null) => void;
}

export const useBookshelfStore = create<BookshelfStoreState>()(
  persist(
    (set) => ({
      tabs: [],
      activeProjectId: null,

      openBookTab: (projectId) =>
        set((state) => {
          const existing = state.tabs.find((t) => t.projectId === projectId);
          if (existing) {
            return { activeProjectId: projectId };
          }
          let next: BookTab[] = [
            { projectId, originFilter: null },
            ...state.tabs,
          ];
          if (next.length > MAX_TABS) next = next.slice(0, MAX_TABS);
          return { tabs: next, activeProjectId: projectId };
        }),

      closeBookTab: (projectId) =>
        set((state) => {
          const next = state.tabs.filter((t) => t.projectId !== projectId);
          const stillActive =
            state.activeProjectId === projectId
              ? next[0]?.projectId ?? null
              : state.activeProjectId;
          return { tabs: next, activeProjectId: stillActive };
        }),

      setActiveBookTab: (projectId) => set({ activeProjectId: projectId }),

      setOriginFilter: (projectId, filter) =>
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.projectId === projectId ? { ...t, originFilter: filter } : t,
          ),
        })),
    }),
    {
      name: "inkforge-bookshelf-tabs",
      // 只持久化 Tab 列表，不持久化 activeProjectId（重启时让用户重新选）
      partialize: (state) => ({ tabs: state.tabs }),
    },
  ),
);
