import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChapterOrigin, ChapterRecord } from "@inkforge/shared";
import { originTagApi } from "../../lib/api";
import { AutoWriterPanel } from "../auto-writer/AutoWriterPanel";
import { ChapterLogDrawer } from "../log/ChapterLogDrawer";
import { SnapshotMenu } from "../snapshot/SnapshotMenu";

const ORIGIN_BADGE: Record<ChapterOrigin, { label: string; cls: string }> = {
  "ai-auto": { label: "🤖 自动", cls: "bg-violet-500/20 text-violet-200" },
  "ai-assisted": { label: "✍🤖 陪写", cls: "bg-sky-500/20 text-sky-200" },
  manual: { label: "✍ 手写", cls: "bg-emerald-500/20 text-emerald-200" },
};

interface ChapterListItemProps {
  chapter: ChapterRecord;
  projectId: string;
  /** 点击章节标题：交给上层（PR-7 跳转编辑器或 AutoWriter 面板）。 */
  onOpen?: (chapter: ChapterRecord) => void;
}

export function ChapterListItem({
  chapter,
  projectId,
  onOpen,
}: ChapterListItemProps): JSX.Element {
  const queryClient = useQueryClient();
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [autoWriterOpen, setAutoWriterOpen] = useState(false);

  const tagQuery = useQuery({
    queryKey: ["chapterOrigin", chapter.id],
    queryFn: () => originTagApi.get({ chapterId: chapter.id }),
    staleTime: 60_000,
  });

  const setTagMut = useMutation({
    mutationFn: (origin: ChapterOrigin) =>
      originTagApi.set({ chapterId: chapter.id, origin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapterOrigin", chapter.id] });
      queryClient.invalidateQueries({ queryKey: ["bookshelf-books"] });
    },
  });

  const origin: ChapterOrigin = tagQuery.data?.origin ?? "manual";
  const badge = ORIGIN_BADGE[origin];

  return (
    <li className="relative flex flex-col gap-1 border-b border-ink-700/50 px-3 py-2 hover:bg-ink-800/40">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpen?.(chapter)}
          className="flex-1 truncate text-left text-sm text-ink-100 hover:text-amber-200"
          title={chapter.title}
        >
          {chapter.title || "（未命名）"}
        </button>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-ink-500">
        <span>{chapter.wordCount} 字</span>
        {chapter.updatedAt && (
          <span>· {new Date(chapter.updatedAt).toLocaleDateString()}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <select
            value={origin}
            onChange={(e) => setTagMut.mutate(e.target.value as ChapterOrigin)}
            className="rounded border border-ink-700 bg-ink-900 px-1 py-0.5 text-[10px] text-ink-300"
            title="设置章节来源"
          >
            <option value="ai-auto">🤖 AI 全自动</option>
            <option value="ai-assisted">✍🤖 AI 陪写</option>
            <option value="manual">✍ 我手写</option>
          </select>
          <button
            type="button"
            onClick={() => setAutoWriterOpen(true)}
            className="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-amber-500/30"
            title="AI 自动写作"
          >
            🤖 AI 写
          </button>
          <button
            type="button"
            onClick={() => setLogOpen(true)}
            className="rounded bg-ink-700 px-2 py-0.5 text-[11px] text-ink-300 hover:bg-ink-600"
            title="章节日志"
          >
            📓 日志
          </button>
          <button
            type="button"
            onClick={() => setSnapshotOpen((v) => !v)}
            className="rounded bg-ink-700 px-2 py-0.5 text-[11px] text-ink-300 hover:bg-ink-600"
            title="章节快照"
          >
            ↶ 快照
          </button>
        </div>
      </div>
      {snapshotOpen && (
        <div className="absolute right-2 top-full z-30 mt-1">
          <SnapshotMenu
            chapterId={chapter.id}
            projectId={projectId}
            onClose={() => setSnapshotOpen(false)}
          />
        </div>
      )}
      {logOpen && (
        <ChapterLogDrawer
          chapterId={chapter.id}
          projectId={projectId}
          chapterTitle={chapter.title}
          onClose={() => setLogOpen(false)}
        />
      )}
      {autoWriterOpen && (
        <AutoWriterPanel
          chapterId={chapter.id}
          projectId={projectId}
          chapterTitle={chapter.title}
          onClose={() => setAutoWriterOpen(false)}
        />
      )}
    </li>
  );
}
