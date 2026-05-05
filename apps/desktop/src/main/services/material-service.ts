import { randomUUID } from "crypto";
import {
  deleteMaterial as deleteMaterialRow,
  getMaterial,
  insertMaterial,
  listMaterials,
  updateMaterial,
} from "@inkforge/storage";
import type {
  MaterialCreateInput,
  MaterialDeleteInput,
  MaterialDeleteResponse,
  MaterialListInput,
  MaterialListResponse,
  MaterialRecord,
  MaterialUpdateInput,
} from "@inkforge/shared";
import { getAppContext } from "./app-state";

export function listProjectMaterials(input: MaterialListInput): MaterialListResponse {
  const ctx = getAppContext();
  if (!input.projectId) throw new Error("projectId is required");
  return listMaterials(ctx.db, input.projectId, input.kind);
}

export function createMaterial(input: MaterialCreateInput): MaterialRecord {
  const ctx = getAppContext();
  if (!input.projectId) throw new Error("projectId is required");
  if (!input.title?.trim()) throw new Error("title is required");
  return insertMaterial(ctx.db, {
    id: randomUUID(),
    projectId: input.projectId,
    kind: input.kind,
    title: input.title.trim(),
    content: input.content,
    tags: input.tags,
  });
}

export function patchMaterial(input: MaterialUpdateInput): MaterialRecord {
  const ctx = getAppContext();
  return updateMaterial(ctx.db, input);
}

export function removeMaterial(input: MaterialDeleteInput): MaterialDeleteResponse {
  const ctx = getAppContext();
  const existing = getMaterial(ctx.db, input.id);
  if (!existing) throw new Error(`Material not found: ${input.id}`);
  deleteMaterialRow(ctx.db, input.id);
  return { id: input.id };
}
