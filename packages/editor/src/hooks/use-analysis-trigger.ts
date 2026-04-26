import { useEffect, useRef } from "react";
import { AnalysisScheduler, type AnalysisTriggerContext } from "../analysis-scheduler";

export interface UseAnalysisTriggerOptions {
  text: string;
  threshold?: number;
  debounceMs?: number;
  language?: string;
  enabled?: boolean;
  onTrigger: (ctx: AnalysisTriggerContext) => void;
}

export function useAnalysisTrigger(options: UseAnalysisTriggerOptions): {
  forceTrigger: () => void;
} {
  const {
    text,
    threshold = 200,
    debounceMs = 10000,
    language = "zh",
    enabled = true,
    onTrigger,
  } = options;

  const schedulerRef = useRef<AnalysisScheduler | null>(null);
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  if (!schedulerRef.current) {
    schedulerRef.current = new AnalysisScheduler({
      threshold,
      debounceMs,
      language,
      onTrigger: (ctx) => onTriggerRef.current(ctx),
    });
    schedulerRef.current.reset(text);
  }

  useEffect(() => {
    schedulerRef.current?.setOptions({ threshold, debounceMs, language });
  }, [threshold, debounceMs, language]);

  useEffect(() => {
    if (!enabled) return;
    schedulerRef.current?.update(text);
  }, [text, enabled]);

  useEffect(() => {
    return () => {
      schedulerRef.current?.dispose();
      schedulerRef.current = null;
    };
  }, []);

  return {
    forceTrigger: () => schedulerRef.current?.forceTrigger(),
  };
}
