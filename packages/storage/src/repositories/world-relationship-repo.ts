import { randomUUID } from "node:crypto";
import type { DB } from "../db";
import type {
  WorldGraphEndpointKind,
  WorldRelationshipRecord,
} from "@inkforge/shared";

interface Row {
  id: string;
  project_id: string;
  src_kind: string;
  src_id: string;
  dst_kind: string;
  dst_id: string;
  label: string | null;
  weight: number;
  created_at: string;
  updated_at: string;
}

function toRecord(row: Row): WorldRelationshipRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    srcKind: row.src_kind as WorldGraphEndpointKind,
    srcId: row.src_id,
    dstKind: row.dst_kind as WorldGraphEndpointKind,
    dstId: row.dst_id,
    label: row.label,
    weight: row.weight,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SaveWorldRelationshipInput {
  id?: string;
  projectId: string;
  srcKind: WorldGraphEndpointKind;
  srcId: string;
  dstKind: WorldGraphEndpointKind;
  dstId: string;
  label?: string | null;
  weight?: number;
}

function endpointExists(
  db: DB,
  projectId: string,
  kind: WorldGraphEndpointKind,
  id: string,
): boolean {
  if (kind === "character") {
    const row = db
      .prepare(`SELECT id FROM characters WHERE id = ? AND project_id = ?`)
      .get(id, projectId);
    return Boolean(row);
  }
  const row = db
    .prepare(`SELECT id FROM world_entries WHERE id = ? AND project_id = ?`)
    .get(id, projectId);
  return Boolean(row);
}

export function listWorldRelationships(
  db: DB,
  projectId: string,
): WorldRelationshipRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM world_relationships WHERE project_id = ? ORDER BY updated_at DESC`,
    )
    .all(projectId) as Row[];
  return rows.map(toRecord);
}

export function getWorldRelationship(
  db: DB,
  id: string,
): WorldRelationshipRecord | null {
  const row = db
    .prepare(`SELECT * FROM world_relationships WHERE id = ?`)
    .get(id) as Row | undefined;
  return row ? toRecord(row) : null;
}

export function saveWorldRelationship(
  db: DB,
  input: SaveWorldRelationshipInput,
): WorldRelationshipRecord {
  const weight = Math.max(1, Math.min(10, input.weight ?? 5));
  const label = (input.label ?? "")?.trim() || null;
  const now = new Date().toISOString();

  // Self-link guard
  if (input.srcKind === input.dstKind && input.srcId === input.dstId) {
    throw new Error("world-relationship: self-link not allowed");
  }
  // Endpoint existence + project_id consistency
  if (!endpointExists(db, input.projectId, input.srcKind, input.srcId)) {
    throw new Error(`world-relationship: src endpoint missing or cross-project: ${input.srcKind}:${input.srcId}`);
  }
  if (!endpointExists(db, input.projectId, input.dstKind, input.dstId)) {
    throw new Error(`world-relationship: dst endpoint missing or cross-project: ${input.dstKind}:${input.dstId}`);
  }

  if (input.id) {
    db.prepare(
      `UPDATE world_relationships
       SET label = ?, weight = ?, updated_at = ?
       WHERE id = ?`,
    ).run(label, weight, now, input.id);
    const updated = getWorldRelationship(db, input.id);
    if (!updated) throw new Error("world-relationship update: row missing after update");
    return updated;
  }

  const id = randomUUID();
  try {
    db.prepare(
      `INSERT INTO world_relationships
       (id, project_id, src_kind, src_id, dst_kind, dst_id, label, weight, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.projectId,
      input.srcKind,
      input.srcId,
      input.dstKind,
      input.dstId,
      label,
      weight,
      now,
      now,
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      throw new Error("world-relationship: duplicate (same src→dst already exists)");
    }
    throw err;
  }
  const created = getWorldRelationship(db, id);
  if (!created) throw new Error("world-relationship insert failed");
  return created;
}

export function deleteWorldRelationship(db: DB, id: string): void {
  db.prepare(`DELETE FROM world_relationships WHERE id = ?`).run(id);
}

/**
 * Cleanup orphan relationships when a polymorphic endpoint is deleted.
 * Caller: delete_character / delete_world_entry handlers must invoke this.
 */
export function cleanupOrphanRelationships(
  db: DB,
  projectId: string,
  kind: WorldGraphEndpointKind,
  endpointId: string,
): number {
  const result = db
    .prepare(
      `DELETE FROM world_relationships
       WHERE project_id = ?
         AND ((src_kind = ? AND src_id = ?) OR (dst_kind = ? AND dst_id = ?))`,
    )
    .run(projectId, kind, endpointId, kind, endpointId);
  return result.changes;
}
