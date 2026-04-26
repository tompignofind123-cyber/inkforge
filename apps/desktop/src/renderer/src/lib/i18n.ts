import { useMemo, useCallback } from "react";
import { t as engineT, coerceLang, type Lang } from "@inkforge/shared";
import { useAppStore } from "../stores/app-store";

/**
 * React hook for translating keys against the current UI language from AppStore.
 * The returned function is stable against re-renders unless the language changes.
 */
export function useT(): (key: string, params?: Record<string, string | number>) => string {
  const lang = useAppStore((s) => coerceLang(s.settings.uiLanguage));
  return useCallback(
    (key: string, params?: Record<string, string | number>) => engineT(key, lang, params),
    [lang],
  );
}

/** Read the current UI language (typed) without subscribing to every settings change. */
export function useLang(): Lang {
  return useAppStore((s) => coerceLang(s.settings.uiLanguage));
}

/** Memoised bundle if you need to access several keys at once. */
export function useTranslations(keys: readonly string[]): Record<string, string> {
  const t = useT();
  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const key of keys) out[key] = t(key);
    return out;
  }, [t, keys]);
}
