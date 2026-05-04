import {
  getAppSettings,
  getSceneBinding,
  setAppSettings,
} from "@inkforge/storage";
import type {
  LLMQuickActionKind,
  SceneKey,
  SceneKeyAdvanced,
  SceneKeyBasic,
  SceneRoutingMode,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";

const ADVANCED_TO_BASIC: Record<SceneKeyAdvanced, SceneKeyBasic> = {
  analyze: "extract",
  quick: "inline",
  chat: "inline",
  skill: "inline",
  tavern: "main_generation",
  "auto-writer": "main_generation",
  review: "extract",
  "daily-summary": "summarize",
  letter: "extract",
};

function resolveQuickKindToBasic(kind: LLMQuickActionKind): SceneKeyBasic {
  switch (kind) {
    case "polish":
    case "rephrase":
      return "inline";
    case "continue":
    case "inspire":
      return "main_generation";
    case "critique":
      return "extract";
    default:
      return "inline";
  }
}

export type SceneResolveSource =
  | "explicit"
  | "scene-binding"
  | "first-provider";

export interface ResolvedScene {
  providerId: string | null;
  model: string | null;
  source: SceneResolveSource;
}

export interface ResolveSceneOptions {
  /** Explicit overrides (e.g. user passed providerId via IPC, Skill.binding, TavernCard.providerId). */
  explicitProviderId?: string | null;
  explicitModel?: string | null;
  /** Only used when sceneKey === 'quick'; kind drives the basic-mode mapping. */
  quickKind?: LLMQuickActionKind;
}

/**
 * Resolve which provider/model to use for a given scene.
 *
 * Precedence:
 *   1. explicit (caller-provided providerId)
 *   2. scene binding for active mode
 *   3. fallback to first provider (caller layer handles via resolveProviderRecord)
 */
export function resolveSceneBinding(
  sceneKeyAdvanced: SceneKeyAdvanced,
  options: ResolveSceneOptions = {},
): ResolvedScene {
  if (options.explicitProviderId) {
    return {
      providerId: options.explicitProviderId,
      model: options.explicitModel ?? null,
      source: "explicit",
    };
  }

  const ctx = getAppContext();
  const mode = getAppSettings(ctx.db).sceneRoutingMode;

  let lookupKey: SceneKey;
  if (mode === "basic") {
    if (sceneKeyAdvanced === "quick" && options.quickKind) {
      lookupKey = resolveQuickKindToBasic(options.quickKind);
    } else {
      lookupKey = ADVANCED_TO_BASIC[sceneKeyAdvanced];
    }
  } else {
    lookupKey = sceneKeyAdvanced;
  }

  const binding = getSceneBinding(ctx.db, mode, lookupKey);
  if (binding?.providerId) {
    return {
      providerId: binding.providerId,
      model: binding.model,
      source: "scene-binding",
    };
  }

  return { providerId: null, model: null, source: "first-provider" };
}

export function getSceneRoutingMode(): SceneRoutingMode {
  return getAppSettings(getAppContext().db).sceneRoutingMode;
}

export function setSceneRoutingMode(mode: SceneRoutingMode): SceneRoutingMode {
  const ctx = getAppContext();
  return setAppSettings(ctx.db, { sceneRoutingMode: mode }).sceneRoutingMode;
}
