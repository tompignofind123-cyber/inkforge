import { ipcMain } from "electron";
import {
  getAppSettings,
  listSceneBindings,
  resetSceneBinding,
  setAppSettings,
  upsertSceneBinding,
} from "@inkforge/storage";
import type {
  SceneBindingListResponse,
  SceneBindingRecord,
  SceneBindingResetInput,
  SceneBindingSetModeInput,
  SceneBindingUpsertInput,
  SceneRoutingMode,
} from "@inkforge/shared";
import { getAppContext } from "../services/app-state";

const SCENE_BINDING_LIST = "scene-binding:list";
const SCENE_BINDING_UPSERT = "scene-binding:upsert";
const SCENE_BINDING_RESET = "scene-binding:reset";
const SCENE_BINDING_GET_MODE = "scene-binding:get-mode";
const SCENE_BINDING_SET_MODE = "scene-binding:set-mode";

export function registerSceneBindingHandlers(): void {
  ipcMain.handle(
    SCENE_BINDING_LIST,
    async (): Promise<SceneBindingListResponse> => {
      const ctx = getAppContext();
      const mode = getAppSettings(ctx.db).sceneRoutingMode;
      return {
        mode,
        basic: listSceneBindings(ctx.db, "basic"),
        advanced: listSceneBindings(ctx.db, "advanced"),
      };
    },
  );

  ipcMain.handle(
    SCENE_BINDING_UPSERT,
    async (
      _event,
      input: SceneBindingUpsertInput,
    ): Promise<SceneBindingRecord> => {
      const ctx = getAppContext();
      return upsertSceneBinding(ctx.db, {
        mode: input.mode,
        sceneKey: input.sceneKey,
        providerId: input.providerId,
        model: input.model,
      });
    },
  );

  ipcMain.handle(
    SCENE_BINDING_RESET,
    async (
      _event,
      input: SceneBindingResetInput,
    ): Promise<{ sceneKey: SceneBindingResetInput["sceneKey"] }> => {
      const ctx = getAppContext();
      resetSceneBinding(ctx.db, input.mode, input.sceneKey);
      return { sceneKey: input.sceneKey };
    },
  );

  ipcMain.handle(
    SCENE_BINDING_GET_MODE,
    async (): Promise<{ mode: SceneRoutingMode }> => {
      const ctx = getAppContext();
      return { mode: getAppSettings(ctx.db).sceneRoutingMode };
    },
  );

  ipcMain.handle(
    SCENE_BINDING_SET_MODE,
    async (
      _event,
      input: SceneBindingSetModeInput,
    ): Promise<{ mode: SceneRoutingMode }> => {
      const ctx = getAppContext();
      setAppSettings(ctx.db, { sceneRoutingMode: input.mode });
      return { mode: input.mode };
    },
  );
}
