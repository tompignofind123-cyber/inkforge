import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { AppSettings, Lang } from "@inkforge/shared";
import { getAnalysisThreshold } from "@inkforge/shared";
import { settingsApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { useT } from "../lib/i18n";

export function SettingsDialog(): JSX.Element | null {
  const open = useAppStore((s) => s.settingsPanelOpen);
  const setOpen = useAppStore((s) => s.openSettings);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const t = useT();

  const [threshold, setThreshold] = useState<number>(settings.analysisThreshold);

  useEffect(() => {
    setThreshold(settings.analysisThreshold);
  }, [settings.analysisThreshold]);

  const settingsMutation = useMutation({
    mutationFn: (updates: Partial<AppSettings>) => settingsApi.set({ updates }),
    onSuccess: (next) => setSettings(next),
  });

  const handleLanguageChange = (lang: Lang) => {
    // Auto-retune threshold to the language default unless the user has
    // customised it recently (detected by non-default numeric value).
    const nextDefault = getAnalysisThreshold(lang);
    const currentIsDefault =
      settings.analysisThreshold === getAnalysisThreshold(settings.uiLanguage);
    const updates: Partial<AppSettings> = { uiLanguage: lang };
    if (currentIsDefault && settings.analysisThreshold !== nextDefault) {
      updates.analysisThreshold = nextDefault;
    }
    settingsMutation.mutate(updates);
  };

  const handleCopyDiag = async () => {
    try {
      const res = await window.inkforge.diag.snapshot({});
      await navigator.clipboard.writeText(res.text);
      alert(t("common.copy") + " ✓");
    } catch (err) {
      alert(t("error.generic") + ": " + String(err));
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-8" role="dialog">
      <div className="w-full max-w-xl rounded-2xl border border-ink-600 bg-ink-800 p-6 text-ink-100 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("settings.title")}</h2>
          <button
            className="rounded px-2 py-1 text-sm text-ink-300 hover:bg-ink-700"
            onClick={() => setOpen(false)}
            title={t("common.close")}
          >
            ✕
          </button>
        </div>

        <div className="space-y-6 text-sm">
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase text-ink-400">
              {t("settings.section.writing")}
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={settings.analysisEnabled}
                  onChange={(e) => settingsMutation.mutate({ analysisEnabled: e.target.checked })}
                />
                <span>{t("settings.analysisEnabled")}</span>
              </label>
              <label className="flex items-center gap-3">
                <span className="text-ink-300">{t("settings.analysisThreshold")}</span>
                <input
                  type="number"
                  min={50}
                  step={50}
                  className="w-24 rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value) || settings.analysisThreshold)}
                  onBlur={() => {
                    if (threshold !== settings.analysisThreshold) {
                      settingsMutation.mutate({ analysisThreshold: threshold });
                    }
                  }}
                />
                <span className="text-xs text-ink-500">
                  {t("settings.analysisThresholdHint", { n: threshold })}
                </span>
              </label>
              <label className="flex items-center gap-3">
                <span className="text-ink-300">{t("settings.uiLanguage")}</span>
                <select
                  className="rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-sm focus:border-amber-500 focus:outline-none"
                  value={settings.uiLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value as Lang)}
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                  <option value="ja">日本語</option>
                </select>
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase text-ink-400">
              {t("settings.section.appearance")}
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-ink-300">{t("settings.theme")}</span>
              <div className="flex overflow-hidden rounded-md border border-ink-600">
                <button
                  className={`px-3 py-1 text-xs ${
                    settings.theme === "dark" ? "bg-amber-500 text-ink-900" : "text-ink-300 hover:bg-ink-700"
                  }`}
                  onClick={() => settingsMutation.mutate({ theme: "dark" })}
                >
                  {t("settings.theme.dark")}
                </button>
                <button
                  className={`px-3 py-1 text-xs ${
                    settings.theme === "light" ? "bg-amber-500 text-ink-900" : "text-ink-300 hover:bg-ink-700"
                  }`}
                  onClick={() => settingsMutation.mutate({ theme: "light" })}
                >
                  {t("settings.theme.light")}
                </button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase text-ink-400">
              {t("settings.section.advanced")}
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={settings.devModeEnabled}
                  onChange={(e) => settingsMutation.mutate({ devModeEnabled: e.target.checked })}
                />
                <div>
                  <div className="font-medium">{t("settings.devMode")}</div>
                  <div className="text-xs text-ink-400">{t("settings.devModeHint")}</div>
                </div>
              </label>
              <div className="pt-2">
                <button
                  className="rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 text-xs text-ink-300 hover:bg-ink-700 hover:text-ink-100"
                  onClick={handleCopyDiag}
                >
                  {t("error.boundary.copyDiag")}
                </button>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
