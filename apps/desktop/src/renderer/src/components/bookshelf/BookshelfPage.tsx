import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChapterOrigin, ChapterRecord } from "@inkforge/shared";
import { bookshelfApi, chapterApi, originTagApi } from "../../lib/api";
import { useBookshelfStore } from "../../stores/bookshelf-store";
import { BookHeader } from "./BookHeader";
import { BookListGrid } from "./BookListGrid";
import { BookTabsBar } from "./BookTabsBar";
import { ChapterListItem } from "./ChapterListItem";
import { ChapterOriginTabs } from "./ChapterOriginTabs";
import { NewBookDialog } from "./NewBookDialog";

export function BookshelfPage(): JSX.Element {
  const tabs = useBookshelfStore((s) => s.tabs);
  const activeProjectId = useBookshelfStore((s) => s.activeProjectId);
  const openBookTab = useBookshelfStore((s) => s.openBookTab);
  const setOriginFilter = useBookshelfStore((s) => s.setOriginFilter);
  const [showPicker, setShowPicker] = useState(false);
  const [showNewBook, setShowNewBook] = useState(false);

  const booksQuery = useQuery({
    queryKey: ["bookshelf-books"],
    queryFn: () => bookshelfApi.listBooks(),
    staleTime: 5_000,
  });

  const books = booksQuery.data ?? [];
  const activeBook = useMemo(
    () => books.find((b) => b.project.id === activeProjectId) ?? null,
    [books, activeProjectId],
  );

  const activeTab = tabs.find((t) => t.projectId === activeProjectId);
  const originFilter = activeTab?.originFilter ?? null;

  const chaptersQuery = useQuery({
    queryKey: ["chapters", activeProjectId],
    queryFn: () =>
      activeProjectId
        ? chapterApi.list({ projectId: activeProjectId })
        : Promise.resolve([] as ChapterRecord[]),
    enabled: !!activeProjectId,
  });

  const filteredIdsQuery = useQuery({
    queryKey: ["origin-filter", activeProjectId, originFilter],
    queryFn: async () => {
      if (!activeProjectId) return null;
      if (!originFilter) return null;
      const res = await originTagApi.listByOrigin({
        projectId: activeProjectId,
        origin: originFilter,
        includeUntagged: true,
      });
      return new Set(res.chapterIds);
    },
    enabled: !!activeProjectId && !!originFilter,
  });

  const filteredChapters = useMemo(() => {
    const all = chaptersQuery.data ?? [];
    if (!originFilter) return all;
    const filterSet = filteredIdsQuery.data;
    if (!filterSet) return all;
    return all.filter((c) => filterSet.has(c.id));
  }, [chaptersQuery.data, originFilter, filteredIdsQuery.data]);

  const showEmptyState = tabs.length === 0 || !activeProjectId || showPicker;

  if (booksQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-ink-400">
        正在加载书架…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <BookTabsBar
        books={books}
        onOpenNewBook={() => setShowPicker(true)}
        onCreateBook={() => setShowNewBook(true)}
      />
      <div className="flex min-h-0 flex-1">
        {showEmptyState ? (
          <BookListGrid
            books={books}
            openIds={new Set(tabs.map((t) => t.projectId))}
            onPickBook={(id) => {
              openBookTab(id);
              setShowPicker(false);
            }}
            onCreateBook={() => setShowNewBook(true)}
            onClose={
              tabs.length > 0 && activeProjectId
                ? () => setShowPicker(false)
                : undefined
            }
          />
        ) : activeBook ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <BookHeader book={activeBook} />
            <ChapterOriginTabs
              active={originFilter}
              counts={activeBook.originCounts}
              onChange={(f) => setOriginFilter(activeBook.project.id, f)}
            />
            <ul className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              {chaptersQuery.isLoading && (
                <li className="p-4 text-center text-xs text-ink-500">加载章节…</li>
              )}
              {chaptersQuery.isSuccess && filteredChapters.length === 0 && (
                <li className="p-4 text-center text-xs text-ink-500">
                  此分类下暂无章节
                </li>
              )}
              {filteredChapters.map((chapter) => (
                <ChapterListItem
                  key={chapter.id}
                  chapter={chapter}
                  projectId={activeBook.project.id}
                />
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-ink-500">
            选择一本书开始
          </div>
        )}
      </div>
      <NewBookDialog
        open={showNewBook}
        onClose={() => setShowNewBook(false)}
        onCreated={(projectId) => {
          openBookTab(projectId);
          setShowPicker(false);
        }}
      />
    </div>
  );
}
