import { useEffect } from "react";
import type { MainView } from "../stores/app-store";

export interface ShortcutHandlers {
  onNewChapter?: () => void;
  onOpenSettings?: () => void;
  onOpenProviders?: () => void;
  onForceAnalyze?: () => void;
  onToggleTerminal?: () => void;
  onSwitchMainView?: (view: MainView) => void;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}

const VIEW_BY_DIGIT: Record<string, MainView> = {
  "1": "writing",
  "2": "skill",
  "3": "character",
  "4": "tavern",
  "5": "world",
  "6": "research",
  "7": "review",
};

export function useAppShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;
      const key = e.key.toLowerCase();

      const mappedView = VIEW_BY_DIGIT[key];
      if (mappedView && !e.shiftKey && !e.altKey) {
        if (isEditable(e.target)) return;
        e.preventDefault();
        handlers.onSwitchMainView?.(mappedView);
        return;
      }

      if (key === "n" && !e.shiftKey) {
        if (isEditable(e.target)) return;
        e.preventDefault();
        handlers.onNewChapter?.();
        return;
      }
      if (key === ",") {
        e.preventDefault();
        if (e.shiftKey) handlers.onOpenProviders?.();
        else handlers.onOpenSettings?.();
        return;
      }
      if (key === "enter") {
        e.preventDefault();
        handlers.onForceAnalyze?.();
        return;
      }
      if (key === "`" || key === "~") {
        e.preventDefault();
        handlers.onToggleTerminal?.();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}
