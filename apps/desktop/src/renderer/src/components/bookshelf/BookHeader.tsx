import type { BookSummary } from "@inkforge/shared";
import { CoverUploader } from "./CoverUploader";

interface BookHeaderProps {
  book: BookSummary;
}

function fmtNum(n: number): string {
  if (n < 10_000) return String(n);
  return `${(n / 10_000).toFixed(1)} 万`;
}

export function BookHeader({ book }: BookHeaderProps): JSX.Element {
  const { project, chapterCount, totalWords, todayWords, originCounts, lastChapterUpdatedAt } =
    book;
  return (
    <div className="flex shrink-0 gap-4 border-b border-ink-700 bg-ink-900/40 p-4">
      <CoverUploader
        projectId={project.id}
        size="lg"
        editable={true}
        fallbackName={project.name}
      />
      <div className="flex flex-1 flex-col gap-2 min-w-0">
        <div className="flex items-baseline gap-2">
          <h1 className="truncate text-xl font-semibold text-ink-100">{project.name}</h1>
          <span className="text-xs text-ink-500">日均目标 {project.dailyGoal} 字</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-300">
          <Stat label="总字数" value={fmtNum(totalWords)} />
          <Stat label="今日新增" value={fmtNum(todayWords)} accent={todayWords > 0} />
          <Stat label="章节" value={String(chapterCount)} />
          <Stat label="🤖 自动" value={String(originCounts["ai-auto"])} />
          <Stat label="✍🤖 陪写" value={String(originCounts["ai-assisted"])} />
          <Stat label="✍ 手写" value={String(originCounts.manual)} />
        </div>
        {lastChapterUpdatedAt && (
          <div className="text-xs text-ink-500">
            最近编辑：{new Date(lastChapterUpdatedAt).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-xs text-ink-500">{label}</span>
      <span className={accent ? "text-emerald-300" : "text-ink-100"}>{value}</span>
    </div>
  );
}
