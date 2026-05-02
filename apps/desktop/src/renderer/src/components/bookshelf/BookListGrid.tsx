import type { BookSummary } from "@inkforge/shared";
import { CoverUploader } from "./CoverUploader";

interface BookListGridProps {
  books: BookSummary[];
  /** 当前已经打开 tab 的 projectId 集合，用于在网格中标识。 */
  openIds: Set<string>;
  onPickBook: (projectId: string) => void;
  onClose?: () => void;
  /** 触发"新建书籍"对话框 */
  onCreateBook?: () => void;
}

function fmtNum(n: number): string {
  if (n < 10_000) return String(n);
  return `${(n / 10_000).toFixed(1)} 万`;
}

/**
 * 第一次进入书房或点 ➕ 时显示的"全部书"网格选择器。
 * 现有 OnboardingPage / WorkspacePage 不动；这里用同样的 ink 颜色风格。
 */
export function BookListGrid({
  books,
  openIds,
  onPickBook,
  onClose,
  onCreateBook,
}: BookListGridProps): JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-ink-700 px-4 py-2">
        <h2 className="text-sm font-semibold text-ink-100">📚 全部书籍</h2>
        <div className="flex items-center gap-2">
          {onCreateBook && (
            <button
              type="button"
              onClick={onCreateBook}
              className="rounded-md bg-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/40"
            >
              ➕ 新建书籍
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-1 text-xs text-ink-300 hover:bg-ink-700"
            >
              关闭
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {books.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="text-ink-400">还没有任何书籍</div>
            {onCreateBook && (
              <button
                type="button"
                onClick={onCreateBook}
                className="rounded-md bg-amber-500/30 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/40"
              >
                ➕ 创建第一本书
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {books.map((book) => {
              const opened = openIds.has(book.project.id);
              return (
                <button
                  key={book.project.id}
                  type="button"
                  onClick={() => onPickBook(book.project.id)}
                  className={`group flex flex-col items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
                    opened
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-ink-700 bg-ink-900/40 hover:border-amber-500/30 hover:bg-ink-800/60"
                  }`}
                >
                  <CoverUploader
                    projectId={book.project.id}
                    size="lg"
                    editable={false}
                    fallbackName={book.project.name}
                  />
                  <div className="w-full">
                    <div className="truncate text-sm font-medium text-ink-100">
                      {book.project.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-ink-400">
                      <span>{book.chapterCount} 章</span>
                      <span>· {fmtNum(book.totalWords)} 字</span>
                    </div>
                    <div className="mt-1 flex gap-1 text-[10px]">
                      {book.originCounts["ai-auto"] > 0 && (
                        <span className="rounded bg-violet-500/20 px-1 text-violet-200">
                          🤖 {book.originCounts["ai-auto"]}
                        </span>
                      )}
                      {book.originCounts["ai-assisted"] > 0 && (
                        <span className="rounded bg-sky-500/20 px-1 text-sky-200">
                          ✍🤖 {book.originCounts["ai-assisted"]}
                        </span>
                      )}
                      {book.originCounts.manual > 0 && (
                        <span className="rounded bg-emerald-500/20 px-1 text-emerald-200">
                          ✍ {book.originCounts.manual}
                        </span>
                      )}
                    </div>
                    {opened && (
                      <div className="mt-1 text-[10px] text-amber-300">已在 Tab 中打开</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
