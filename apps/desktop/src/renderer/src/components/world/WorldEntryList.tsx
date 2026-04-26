import type { WorldEntryRecord } from "@inkforge/shared";

interface WorldEntryListProps {
  entries: WorldEntryRecord[];
  activeId: string | null;
  searchQuery: string;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function WorldEntryList({
  entries,
  activeId,
  searchQuery,
  onQueryChange,
  onSelect,
  onCreate,
}: WorldEntryListProps): JSX.Element {
  return (
    <div className="flex h-full flex-col border-l border-ink-700 bg-ink-800/30">
      <div className="flex items-center gap-2 border-b border-ink-700 p-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="🔍 搜索标题 / 别名 / 标签 / 正文"
          className="flex-1 rounded border border-ink-700 bg-ink-900 px-2 py-1 text-sm text-ink-100 placeholder:text-ink-500"
        />
        <button
          type="button"
          onClick={onCreate}
          className="rounded bg-amber-500/20 px-2 py-1 text-xs text-amber-300 hover:bg-amber-500/30"
          title="新建条目"
        >
          + 新建
        </button>
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin">
        {entries.length === 0 && (
          <div className="p-8 text-center text-xs text-ink-500">
            {searchQuery ? "未命中任何条目" : "当前分类暂无条目，点击「新建」开始。"}
          </div>
        )}
        {entries.map((entry) => {
          const active = entry.id === activeId;
          const alias = entry.aliases.slice(0, 2).join("、");
          return (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(entry.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(entry.id);
              }}
              className={`cursor-pointer border-b border-ink-700/50 px-3 py-2 transition ${
                active ? "bg-ink-700/60" : "hover:bg-ink-700/20"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="truncate text-sm text-ink-100">{entry.title}</span>
                <span className="shrink-0 rounded-sm bg-ink-900/60 px-1.5 py-[1px] text-[10px] text-ink-400">
                  {entry.category}
                </span>
              </div>
              {alias && (
                <div className="mt-0.5 truncate text-[11px] text-ink-500">
                  别名：{alias}
                  {entry.aliases.length > 2 ? " …" : ""}
                </div>
              )}
              {entry.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {entry.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-ink-700/40 px-1.5 py-[1px] text-[10px] text-ink-300"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
