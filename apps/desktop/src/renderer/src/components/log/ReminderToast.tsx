import { useEffect, useState } from "react";
import { chapterLogApi } from "../../lib/api";

/**
 * 全局每日提醒 toast。在 App.tsx 顶层挂载。
 * 收到 'chapter-log:daily-reminder' 事件后显示，10 秒后自动消失或用户点 ✕。
 */
export function ReminderToast(): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  const [emittedAt, setEmittedAt] = useState<string | null>(null);

  useEffect(() => {
    const unsub = chapterLogApi.onReminder((payload) => {
      setEmittedAt(payload.emittedAt);
      setVisible(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 10_000);
    return () => clearTimeout(timer);
  }, [visible, emittedAt]);

  if (!visible) return null;

  return (
    <div className="fixed right-4 top-4 z-50 max-w-sm rounded-lg border border-amber-500/40 bg-ink-800 p-3 text-sm text-ink-100 shadow-2xl">
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-lg">
          ⏰
        </span>
        <div className="flex-1">
          <div className="font-semibold text-amber-200">每日写作提醒</div>
          <div className="mt-1 text-xs text-ink-300">
            打开「📖 书房」选一章，记一笔今天的进度或灵感吧。
          </div>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="text-ink-400 hover:text-ink-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
