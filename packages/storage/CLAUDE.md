# packages/storage — Schema & Repositories

> SQLite via better-sqlite3 (synchronous). Migrations append-only. Chapter content lives in `.md` files on disk; DB stores metadata only.

## Migrations

File: `src/migrations.ts`. Array of `{ version: number, name: string, up: (db) => void }` objects.

**Current head version: v18.**

Append new migration at end of array. Never edit existing entries.

```ts
{
  version: 19,           // next available
  name: "your_feature",
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS your_table (...);
      ALTER TABLE existing_table ADD COLUMN new_col TEXT;
    `);
    // For seed data, use prepare().run() inside migration
  },
}
```

Verify pattern: `apps/desktop/scripts/verify-migrations.cjs` validates table list + index list + version count. **Bump `EXPECTED_MAX_VERSION`** + add expected tables/indexes when adding migration.

## Critical Schemas (verbatim — DO NOT GUESS)

### `projects`

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,           -- NOT 'title'
  path TEXT NOT NULL,
  created_at TEXT NOT NULL,     -- ISO-8601 string
  daily_goal INTEGER NOT NULL DEFAULT 1000,
  last_opened TEXT
);
```

`ProjectRecord` (camelCase): `{id, name, path, createdAt, dailyGoal, lastOpened}`.

**NO `title/synopsis/genre/sub_genre/tags/summary/target_word_count` fields.** Any AI-generation feature needing these must add columns via new migration.

### `chapters`

```sql
CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id TEXT,
  title TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  word_count INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL,        -- relative path under project dir, e.g. "chapters/foo.md"
  updated_at TEXT
);
```

`ChapterRecord`: `{id, projectId, parentId, title, order, status, wordCount, filePath, updatedAt}`.

**Content NOT in DB.** Read with `readChapterFile(project.path, chapter.filePath)` from `fs-layout.ts`.

### `outline_cards`

```sql
CREATE TABLE outline_cards (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chapter_id TEXT,                -- nullable: card may be project-level
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned',
  "order" INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`OutlineCardRecord`: `{id, projectId, chapterId, title, content, status, order, createdAt, updatedAt}`.

### `providers`

```sql
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  vendor TEXT NOT NULL,                       -- 'anthropic'|'openai'|'gemini'|'openai-compat'
  base_url TEXT NOT NULL DEFAULT '',
  default_model TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',            -- JSON array
  api_key_enc TEXT, api_key_iv TEXT, api_key_tag TEXT,
  stored_in_keychain INTEGER NOT NULL DEFAULT 0
);
```

## Repository Pattern

Each repo file in `src/repositories/<entity>-repo.ts`:

```ts
import type { DB } from "../db";
import type { EntityRecord } from "@inkforge/shared";

interface Row { /* snake_case DB columns */ }
function toRecord(row: Row): EntityRecord { /* camelCase mapping */ }

export interface CreateEntityRow { /* camelCase input */ }

export function insertEntity(db: DB, input: CreateEntityRow): EntityRecord {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO ... VALUES (?, ?, ...)`).run(input.id, ...);
  return getEntity(db, input.id)!;
}

export function listEntities(db: DB, projectId: string): EntityRecord[] {
  const rows = db.prepare(`SELECT * FROM ... WHERE project_id = ?`).all(projectId) as Row[];
  return rows.map(toRecord);
}
```

Always re-export from `src/index.ts`.

## fs-layout (chapter file IO)

```ts
import { readChapterFile, writeChapterFile, nextChapterFileName } from "@inkforge/storage";

const md = readChapterFile(project.path, chapter.filePath);
writeChapterFile(project.path, "chapters/foo.md", "# Title\n\nbody");
const newPath = nextChapterFileName(project.path, "新章节");  // collision-safe
```

Snapshots, autosaves, covers also have helpers — see `fs-layout.ts` exports.

## RAG search functions (rag-repo)

Exposed:
- `ragSearchWorldEntries(db, projectId, queries: string[], limit) → WorldEntryHit[]`
- `ragSearchCharacters(db, projectId, queries, limit) → CharacterHit[]`
- `ragSearchResearchNotes(db, projectId, queries, limit) → ResearchHit[]`
- `ragSearchSampleChunks(db, projectId, queries, limit) → SampleChunkHit[]`

LIKE-based with project-id hard-filter. Caller (in `apps/desktop/src/main/services/rag-service.ts`) extracts queries from the user's prompt using sliding 2-char Chinese windows.

## Polymorphic FK Pattern (world_relationships)

`world_relationships.src_id/dst_id` are not FK (kind can be character or world_entry). Cleanup is application-layer:
```ts
import { cleanupOrphanRelationships } from "@inkforge/storage";
// in delete_character / delete_world_entry handlers:
cleanupOrphanRelationships(db, projectId, "character" | "world_entry", endpointId);
```
