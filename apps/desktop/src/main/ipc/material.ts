import { ipcMain } from "electron";
import {
  ipcChannels,
  type MaterialCreateInput,
  type MaterialDeleteInput,
  type MaterialDeleteResponse,
  type MaterialListInput,
  type MaterialListResponse,
  type MaterialRecord,
  type MaterialUpdateInput,
} from "@inkforge/shared";
import {
  createMaterial,
  listProjectMaterials,
  patchMaterial,
  removeMaterial,
} from "../services/material-service";

const MAT_LIST: typeof ipcChannels.materialList = "material:list";
const MAT_CREATE: typeof ipcChannels.materialCreate = "material:create";
const MAT_UPDATE: typeof ipcChannels.materialUpdate = "material:update";
const MAT_DELETE: typeof ipcChannels.materialDelete = "material:delete";

export function registerMaterialHandlers(): void {
  ipcMain.handle(
    MAT_LIST,
    async (_e, input: MaterialListInput): Promise<MaterialListResponse> =>
      listProjectMaterials(input),
  );
  ipcMain.handle(
    MAT_CREATE,
    async (_e, input: MaterialCreateInput): Promise<MaterialRecord> =>
      createMaterial(input),
  );
  ipcMain.handle(
    MAT_UPDATE,
    async (_e, input: MaterialUpdateInput): Promise<MaterialRecord> =>
      patchMaterial(input),
  );
  ipcMain.handle(
    MAT_DELETE,
    async (_e, input: MaterialDeleteInput): Promise<MaterialDeleteResponse> =>
      removeMaterial(input),
  );
}
