# InkForge — Architecture Map

> Local-first AI novel-writing app. Electron 32 + React 18 + TipTap + better-sqlite3.
> All data stays local — no telemetry, no cloud sync.

## Monorepo Layout

```
inkforge-src/
├── apps/desktop/                 Electron shell (main + preload + renderer)
├── packages/shared/              types + IPC schema (depends on: nothing)
├── packages/storage/             better-sqlite3 + migrations + repos
├── packages/llm-core/            provider abstractions (anthropic/openai/gemini/openai-compat)
├── packages/skill-engine/        programmable Skills runtime
├── packages/tavern-engine/       multi-agent character chat
├── packages/auto-writer-engine/  4-Agent novel writing pipeline
├── packages/research-core/       web research
├── packages/review-engine/       chapter review dimensions
└── packages/editor/              TipTap extensions
```

Build deps: `shared → storage → others → desktop`. Always rebuild shared+storage before desktop typecheck.

## Data Flow

```
Renderer (React)
  ↓ window.inkforge.<ns>.<method>(input)        — preload-injected API
Preload (apps/desktop/src/preload/index.ts)
  ↓ ipcRenderer.invoke(channel, input)
Main IPC handler (apps/desktop/src/main/ipc/<name>.ts)
  ↓ calls service
Service (apps/desktop/src/main/services/<name>-service.ts)
  ↓ calls repo or llm-runtime
Storage repo (packages/storage/src/repositories/<name>-repo.ts)
  ↓ better-sqlite3 prepared stmt
SQLite (.inkforge.db) + chapter .md files in project dir
```

## Critical Pitfalls (read before editing)

1. **`ProjectRecord` is bare-bones**: `{id, name, path, createdAt, dailyGoal, lastOpened}`. **NO** `title/synopsis/genre/summary/tags`. Any feature needing these MUST add them via new migration. (The ainovel port assumed these existed — caused verify-script bugs.)
2. **Chapter content lives in .md files on disk**, not in SQLite. `ChapterRecord.filePath` is relative. Use `readChapterFile/writeChapterFile/nextChapterFileName` from `packages/storage/src/fs-layout.ts`.
3. **shared/preload/storage build dist/ before downstream typecheck** — they're consumed via workspace pkg dist, not src.
4. **`@xyflow/react` and `@dagrejs/dagre`** are added (Module 3, World graph). React-flow style import needed.
5. **better-sqlite3 native binding ABI mismatch**:
   - Verify scripts use system Node (ABI 127 for Node 22)
   - Electron 32 uses ABI 128
   - Same prebuilt cannot serve both — need to swap via `prebuild-install --runtime=electron|node`.
6. **Migrations are append-only**: current at v18. Never rewrite earlier versions; add new migration object to `packages/storage/src/migrations.ts` array.

## Key Conventions

- **IPC channels**: kebab-case `domain:action`, declared in `packages/shared/src/ipc.ts` `ipcChannels`. Add typed req/res in `IpcRequestMap` (uses TypeScript declaration merging — multiple `interface IpcRequestMap {...}` in same file is intentional).
- **Service layer**: thin wrapper, throws on invalid input, returns serializable JSON. Long-running ops use `streamText` async iterator + `BrowserWindow.webContents.send` for chunks.
- **Renderer state**: zustand `useAppStore` (`apps/desktop/src/renderer/src/stores/app-store.ts`). React-Query for server state.
- **i18n**: `packages/shared/src/i18n.ts` (zh / en / ja).

## Module Map (where stuff lives)

| Domain | shared types | storage repo | main service | main IPC | renderer |
|---|---|---|---|---|---|
| Project | `ProjectRecord` | `project-repo` | `project-service` (in ipc/project.ts) | `project.ts` | `pages/WorkspacePage.tsx` |
| Chapter | `ChapterRecord` | `chapter-repo` + `fs-layout` | inline in ipc/chapter.ts | `chapter.ts` | `ChapterTree`, `EditorPane` |
| Outline | `OutlineCardRecord` | `outline-repo` | inline in ipc/outline.ts | `outline.ts` | (no dedicated page yet) |
| Provider/LLM | `ProviderRecord` | `provider-repo` + `provider-key-repo` | `llm-runtime`, `chat`, `quick-action`, `analysis` | `llm.ts` | `ProviderSettingsPanel` |
| Auto-Writer | `AutoWriterRunRecord` | `auto-writer-run-repo` | `auto-writer-service` | `auto-writer.ts` | `auto-writer/AutoWriterPanel.tsx` |
| World | `WorldEntryRecord`, `WorldRelationshipRecord` | `world-entry-repo`, `world-relationship-repo` | `world-service` | `world.ts`, `world-relationship.ts` | `pages/WorldPage.tsx` + `world/WorldGraph.tsx` |
| Scene Bindings | `SceneBindingRecord`, `SceneRoutingMode` | `scene-binding-repo` | `scene-binding-service` | `scene-binding.ts` | `SceneRoutingPanel.tsx` (in SettingsDialog) |
| RAG / Sample Lib | `SampleLibRecord`, `SampleChunkRecord` | `sample-lib-repo`, `rag-repo` | `rag-service`, `sample-lib-service` | `sample-lib.ts` | `SampleLibPanel.tsx` (in SettingsDialog) |
| Export/Import | (in ipc.ts) | (uses fs-layout) | `export-service`, `chapter-import-service`, `zip-writer` | `project-export.ts` | `ExportDialog.tsx` |

## Per-Package CLAUDE.md

- [packages/shared/CLAUDE.md](packages/shared/CLAUDE.md) — types + IPC declaration merging
- [packages/storage/CLAUDE.md](packages/storage/CLAUDE.md) — migrations + repos + exact schemas
- [apps/desktop/CLAUDE.md](apps/desktop/CLAUDE.md) — main IPC + service patterns + LLM streaming
- [packages/auto-writer-engine/CLAUDE.md](packages/auto-writer-engine/CLAUDE.md) — 4-Agent pipeline
