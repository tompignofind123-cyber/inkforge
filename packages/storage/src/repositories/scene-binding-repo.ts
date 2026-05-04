import type { DB } from "../db";
import type {
  SceneBindingRecord,
  SceneKey,
  SceneRoutingMode,
} from "@inkforge/shared";

type Row = {
  scene_key: string;
  provider_id: string | null;
  model: string | null;
  updated_at: string;
};

function rowToRecord(row: Row): SceneBindingRecord {
  return {
    sceneKey: row.scene_key as SceneKey,
    providerId: row.provider_id,
    model: row.model,
    updatedAt: row.updated_at,
  };
}

function tableFor(mode: SceneRoutingMode): string {
  return mode === "basic" ? "scene_bindings_basic" : "scene_bindings_advanced";
}

export function listSceneBindings(
  db: DB,
  mode: SceneRoutingMode,
): SceneBindingRecord[] {
  const rows = db
    .prepare(`SELECT scene_key, provider_id, model, updated_at FROM ${tableFor(mode)} ORDER BY scene_key`)
    .all() as Row[];
  return rows.map(rowToRecord);
}

export function getSceneBinding(
  db: DB,
  mode: SceneRoutingMode,
  sceneKey: SceneKey,
): SceneBindingRecord | null {
  const row = db
    .prepare(
      `SELECT scene_key, provider_id, model, updated_at FROM ${tableFor(mode)} WHERE scene_key = ?`,
    )
    .get(sceneKey) as Row | undefined;
  return row ? rowToRecord(row) : null;
}

export interface UpsertSceneBindingInput {
  mode: SceneRoutingMode;
  sceneKey: SceneKey;
  providerId: string | null;
  model: string | null;
}

export function upsertSceneBinding(
  db: DB,
  input: UpsertSceneBindingInput,
): SceneBindingRecord {
  const updatedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO ${tableFor(input.mode)} (scene_key, provider_id, model, updated_at)
     VALUES (@scene_key, @provider_id, @model, @updated_at)
     ON CONFLICT(scene_key) DO UPDATE SET
       provider_id = excluded.provider_id,
       model = excluded.model,
       updated_at = excluded.updated_at`,
  ).run({
    scene_key: input.sceneKey,
    provider_id: input.providerId,
    model: input.model,
    updated_at: updatedAt,
  });
  return getSceneBinding(db, input.mode, input.sceneKey)!;
}

export function resetSceneBinding(
  db: DB,
  mode: SceneRoutingMode,
  sceneKey: SceneKey,
): void {
  const updatedAt = new Date().toISOString();
  db.prepare(
    `UPDATE ${tableFor(mode)} SET provider_id = NULL, model = NULL, updated_at = ? WHERE scene_key = ?`,
  ).run(updatedAt, sceneKey);
}
