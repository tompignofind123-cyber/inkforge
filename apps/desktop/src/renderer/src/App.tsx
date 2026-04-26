import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { providerApi, projectApi, settingsApi } from "./lib/api";
import { useAppStore } from "./stores/app-store";
import { OnboardingPage } from "./pages/OnboardingPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { SkillPage } from "./pages/SkillPage";
import { CharacterPage } from "./pages/CharacterPage";
import { TavernPage } from "./pages/TavernPage";
import { WorldPage } from "./pages/WorldPage";
import { ResearchPage } from "./pages/ResearchPage";
import { ReviewPage } from "./pages/ReviewPage";
import { ActivityBar } from "./components/ActivityBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CrashRecoveryBanner } from "./components/CrashRecoveryBanner";

export function App(): JSX.Element {
  const setSettings = useAppStore((s) => s.setSettings);
  const settings = useAppStore((s) => s.settings);
  const settingsLoaded = useAppStore((s) => s.settingsLoaded);
  const mainView = useAppStore((s) => s.mainView);
  const lang = settings.uiLanguage;

  const settingsQuery = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => settingsApi.get({}),
  });

  useEffect(() => {
    if (settingsQuery.data) setSettings(settingsQuery.data);
  }, [settingsQuery.data, setSettings]);

  useEffect(() => {
    const theme = settings.theme === "light" ? "theme-light" : "theme-dark";
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add(theme);
  }, [settings.theme]);

  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () => providerApi.list(),
    enabled: settingsQuery.isSuccess,
  });
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectApi.list(),
    enabled: providersQuery.isSuccess,
  });

  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    if (settings.onboardingCompleted) {
      setOnboarded(true);
    } else if (providersQuery.data && projectsQuery.data) {
      if (providersQuery.data.length > 0 && projectsQuery.data.length > 0) {
        setOnboarded(true);
      }
    }
  }, [providersQuery.data, projectsQuery.data, settings.onboardingCompleted]);

  const loading =    !settingsLoaded ||
    providersQuery.isLoading ||
    projectsQuery.isLoading ||
    settingsQuery.isLoading;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-ink-300">
        <div className="animate-pulse">正在打开 InkForge…</div>
      </div>
    );
  }

  if (!onboarded) {
    return (
      <ErrorBoundary label="Onboarding" lang={lang}>
        <OnboardingPage onFinish={() => setOnboarded(true)} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary label="InkForge" lang={lang}>
      <div className="flex h-full w-full flex-col">
        <CrashRecoveryBanner />
        <div className="flex min-h-0 flex-1">
          <ErrorBoundary label="ActivityBar" lang={lang}>
            <ActivityBar />
          </ErrorBoundary>
          <div className="flex min-w-0 flex-1 flex-col">
            <ErrorBoundary label={mainView} lang={lang}>
              {mainView === "writing" && <WorkspacePage />}
              {mainView === "skill" && <SkillPage />}
              {mainView === "character" && <CharacterPage />}
              {mainView === "tavern" && <TavernPage />}
              {mainView === "world" && <WorldPage />}
              {mainView === "research" && <ResearchPage />}
              {mainView === "review" && <ReviewPage />}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
