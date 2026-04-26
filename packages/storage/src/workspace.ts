import * as fs from "fs";
import * as path from "path";
import { coerceLang, type Lang } from "@inkforge/shared";

export interface WorkspaceConfig {
  workspaceDir: string | null;
  uiLanguage: Lang;
  analysisEnabled: boolean;
  analysisThreshold: number;
}

const DEFAULT_CONFIG: WorkspaceConfig = {
  workspaceDir: null,
  uiLanguage: "zh",
  analysisEnabled: true,
  analysisThreshold: 200,
};

export function loadWorkspaceConfig(userDataDir: string): WorkspaceConfig {
  const filePath = path.join(userDataDir, "config.json");
  if (!fs.existsSync(filePath)) return { ...DEFAULT_CONFIG };
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      uiLanguage: coerceLang(raw?.uiLanguage, DEFAULT_CONFIG.uiLanguage),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveWorkspaceConfig(userDataDir: string, config: WorkspaceConfig): void {
  fs.mkdirSync(userDataDir, { recursive: true });
  const filePath = path.join(userDataDir, "config.json");
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}
