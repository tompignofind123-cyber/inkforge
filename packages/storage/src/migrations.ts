import type { DB } from "./db";

export interface Migration {
  version: number;
  name: string;
  up: (db: DB) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: "init_core_tables",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          created_at TEXT NOT NULL,
          daily_goal INTEGER NOT NULL DEFAULT 1000,
          last_opened TEXT
        );

        CREATE TABLE IF NOT EXISTS chapters (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          parent_id TEXT,
          title TEXT NOT NULL,
          "order" INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'draft',
          word_count INTEGER NOT NULL DEFAULT 0,
          file_path TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id);

        CREATE TABLE IF NOT EXISTS providers (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          vendor TEXT NOT NULL,
          base_url TEXT NOT NULL DEFAULT '',
          default_model TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          api_key_enc TEXT,
          api_key_iv TEXT,
          api_key_tag TEXT,
          stored_in_keychain INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS ai_feedbacks (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          chapter_id TEXT NOT NULL,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          trigger TEXT NOT NULL,
          created_at TEXT NOT NULL,
          dismissed INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_feedbacks_chapter ON ai_feedbacks(chapter_id);
        CREATE INDEX IF NOT EXISTS idx_feedbacks_project ON ai_feedbacks(project_id);
      `);
    },
  },
  {
    version: 2,
    name: "m1_outline_daily_settings",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS outline_cards (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          chapter_id TEXT,
          title TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'draft',
          "order" INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_outline_project ON outline_cards(project_id);
        CREATE INDEX IF NOT EXISTS idx_outline_chapter ON outline_cards(chapter_id);

        CREATE TABLE IF NOT EXISTS daily_logs (
          date TEXT NOT NULL,
          project_id TEXT NOT NULL,
          words_added INTEGER NOT NULL DEFAULT 0,
          goal_hit INTEGER NOT NULL DEFAULT 0,
          summary TEXT,
          PRIMARY KEY(date, project_id),
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_daily_project ON daily_logs(project_id);

        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 3,
    name: "m3_skills",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS skills (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          prompt TEXT NOT NULL,
          variables TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(variables)),
          triggers TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(triggers)),
          binding TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(binding)),
          output TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
          scope TEXT NOT NULL CHECK(scope IN ('global', 'project', 'community')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 4,
    name: "m3_tavern_cards_and_characters",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tavern_cards (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          persona TEXT NOT NULL,
          avatar_path TEXT,
          provider_id TEXT NOT NULL,
          model TEXT NOT NULL,
          temperature REAL NOT NULL DEFAULT 0.7,
          linked_novel_character_id TEXT,
          sync_mode TEXT NOT NULL DEFAULT 'two-way'
            CHECK(sync_mode IN ('two-way', 'snapshot', 'detached')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_tavern_cards_name ON tavern_cards(name);
        CREATE INDEX IF NOT EXISTS idx_tavern_cards_provider ON tavern_cards(provider_id);

        CREATE TABLE IF NOT EXISTS characters (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          persona TEXT,
          traits TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(traits)),
          backstory TEXT NOT NULL DEFAULT '',
          relations TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(relations)),
          linked_tavern_card_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_characters_project_name ON characters(project_id, name);
      `);
    },
  },
  {
    version: 5,
    name: "m3_character_sync_log",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS character_sync_log (
          id TEXT PRIMARY KEY,
          novel_char_id TEXT NOT NULL,
          tavern_card_id TEXT,
          field TEXT NOT NULL CHECK(field IN ('persona', 'backstory', 'traits')),
          old_value TEXT NOT NULL,
          new_value TEXT NOT NULL,
          direction TEXT NOT NULL CHECK(direction IN ('novel_to_card', 'card_to_novel', 'manual_merge')),
          at TEXT NOT NULL,
          FOREIGN KEY(novel_char_id) REFERENCES characters(id) ON DELETE CASCADE,
          FOREIGN KEY(tavern_card_id) REFERENCES tavern_cards(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_character_sync_log_novel_at
          ON character_sync_log(novel_char_id, at DESC);
        CREATE INDEX IF NOT EXISTS idx_character_sync_log_tavern_at
          ON character_sync_log(tavern_card_id, at DESC);
      `);
    },
  },
  {
    version: 6,
    name: "m3_tavern_sessions_messages",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tavern_sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          title TEXT NOT NULL,
          topic TEXT NOT NULL,
          mode TEXT NOT NULL CHECK(mode IN ('director', 'auto')),
          budget_tokens INTEGER NOT NULL CHECK(budget_tokens > 0),
          summary_provider_id TEXT,
          summary_model TEXT,
          last_k INTEGER NOT NULL DEFAULT 6 CHECK(last_k > 0),
          created_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY(summary_provider_id) REFERENCES providers(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tavern_sessions_project_created
          ON tavern_sessions(project_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS tavern_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          character_id TEXT,
          role TEXT NOT NULL CHECK(role IN ('director', 'character', 'summary')),
          content TEXT NOT NULL,
          tokens_in INTEGER NOT NULL DEFAULT 0 CHECK(tokens_in >= 0),
          tokens_out INTEGER NOT NULL DEFAULT 0 CHECK(tokens_out >= 0),
          created_at TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES tavern_sessions(id) ON DELETE CASCADE,
          FOREIGN KEY(character_id) REFERENCES tavern_cards(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tavern_messages_session_created
          ON tavern_messages(session_id, created_at ASC);
      `);
    },
  },
  {
    version: 7,
    name: "m3_indexes_and_unique_partials",
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_skills_scope_enabled ON skills(scope, enabled);
        CREATE INDEX IF NOT EXISTS idx_skills_updated ON skills(updated_at DESC);

        CREATE UNIQUE INDEX IF NOT EXISTS uidx_tavern_cards_linked_novel_character
          ON tavern_cards(linked_novel_character_id)
          WHERE linked_novel_character_id IS NOT NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS uidx_characters_linked_tavern_card
          ON characters(linked_tavern_card_id)
          WHERE linked_tavern_card_id IS NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_tavern_messages_session_role_created
          ON tavern_messages(session_id, role, created_at ASC);
      `);
    },
  },
  {
    version: 8,
    name: "m4_world_entries",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS world_entries (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          aliases TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(aliases)),
          tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_world_project ON world_entries(project_id, category, title);
        CREATE INDEX IF NOT EXISTS idx_world_updated ON world_entries(updated_at DESC);
      `);
    },
  },
  {
    version: 9,
    name: "m4_research_notes",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS research_notes (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          topic TEXT NOT NULL,
          source_url TEXT,
          source_title TEXT,
          source_provider TEXT NOT NULL DEFAULT 'manual',
          excerpt TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_research_project_created
          ON research_notes(project_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_research_topic
          ON research_notes(project_id, topic);
      `);
    },
  },
  {
    version: 10,
    name: "m4_review_tables",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS review_dimensions (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          name TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('builtin','skill')),
          builtin_id TEXT,
          skill_id TEXT,
          scope TEXT NOT NULL DEFAULT 'book' CHECK(scope IN ('book','chapter','selection')),
          severity TEXT NOT NULL DEFAULT 'warn' CHECK(severity IN ('info','warn','error')),
          enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
          "order" INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY(skill_id) REFERENCES skills(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_review_dim_project
          ON review_dimensions(project_id, "order");

        CREATE TABLE IF NOT EXISTS review_reports (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          range_kind TEXT NOT NULL CHECK(range_kind IN ('book','chapter','range')),
          range_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(range_ids)),
          started_at TEXT NOT NULL,
          finished_at TEXT,
          status TEXT NOT NULL CHECK(status IN ('pending','running','completed','failed','cancelled')),
          summary TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(summary)),
          error TEXT,
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_review_reports_project_started
          ON review_reports(project_id, started_at DESC);

        CREATE TABLE IF NOT EXISTS review_findings (
          id TEXT PRIMARY KEY,
          report_id TEXT NOT NULL,
          dimension_id TEXT NOT NULL,
          chapter_id TEXT,
          excerpt TEXT NOT NULL DEFAULT '',
          excerpt_start INTEGER,
          excerpt_end INTEGER,
          severity TEXT NOT NULL CHECK(severity IN ('info','warn','error')),
          suggestion TEXT NOT NULL DEFAULT '',
          dismissed INTEGER NOT NULL DEFAULT 0 CHECK(dismissed IN (0,1)),
          created_at TEXT NOT NULL,
          FOREIGN KEY(report_id) REFERENCES review_reports(id) ON DELETE CASCADE,
          FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_findings_report_severity
          ON review_findings(report_id, severity);
        CREATE INDEX IF NOT EXISTS idx_findings_chapter
          ON review_findings(chapter_id);
      `);
    },
  },
  {
    version: 11,
    name: "m4_daily_summary_columns",
    up: (db) => {
      const existingColumns = db
        .prepare(`PRAGMA table_info(daily_logs)`)
        .all()
        .map((row) => (row as { name: string }).name);
      if (!existingColumns.includes("summary")) {
        db.exec(`ALTER TABLE daily_logs ADD COLUMN summary TEXT`);
      }
      if (!existingColumns.includes("summary_provider_id")) {
        db.exec(`ALTER TABLE daily_logs ADD COLUMN summary_provider_id TEXT`);
      }
      if (!existingColumns.includes("summary_model")) {
        db.exec(`ALTER TABLE daily_logs ADD COLUMN summary_model TEXT`);
      }
      if (!existingColumns.includes("generated_at")) {
        db.exec(`ALTER TABLE daily_logs ADD COLUMN generated_at TEXT`);
      }
    },
  },
  {
    version: 12,
    name: "m4_provider_keys_and_strategy",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS provider_keys (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          label TEXT NOT NULL,
          api_key_enc TEXT,
          api_key_iv TEXT,
          api_key_tag TEXT,
          stored_in_keychain INTEGER NOT NULL DEFAULT 0 CHECK(stored_in_keychain IN (0,1)),
          weight INTEGER NOT NULL DEFAULT 1 CHECK(weight >= 0),
          disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)),
          last_failed_at TEXT,
          fail_count INTEGER NOT NULL DEFAULT 0 CHECK(fail_count >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_provider_keys_provider
          ON provider_keys(provider_id, disabled);
      `);

      const providerCols = db
        .prepare(`PRAGMA table_info(providers)`)
        .all()
        .map((row) => (row as { name: string }).name);
      if (!providerCols.includes("key_strategy")) {
        db.exec(
          `ALTER TABLE providers ADD COLUMN key_strategy TEXT NOT NULL DEFAULT 'single'`,
        );
      }
      if (!providerCols.includes("cooldown_ms")) {
        db.exec(
          `ALTER TABLE providers ADD COLUMN cooldown_ms INTEGER NOT NULL DEFAULT 60000`,
        );
      }

      // Data migration: copy provider.api_key_* to provider_keys as the first key.
      const providerRows = db
        .prepare(
          `SELECT id, api_key_enc, api_key_iv, api_key_tag, stored_in_keychain
           FROM providers`,
        )
        .all() as Array<{
        id: string;
        api_key_enc: string | null;
        api_key_iv: string | null;
        api_key_tag: string | null;
        stored_in_keychain: number;
      }>;
      const now = new Date().toISOString();
      const insertKey = db.prepare(
        `INSERT OR IGNORE INTO provider_keys
           (id, provider_id, label, api_key_enc, api_key_iv, api_key_tag,
            stored_in_keychain, weight, disabled, fail_count, created_at, updated_at)
         VALUES (@id, @provider_id, @label, @api_key_enc, @api_key_iv, @api_key_tag,
                 @stored_in_keychain, 1, 0, 0, @created_at, @updated_at)`,
      );
      for (const row of providerRows) {
        const hasSecret = !!(
          row.api_key_enc &&
          row.api_key_iv &&
          row.api_key_tag
        );
        if (!hasSecret && row.stored_in_keychain !== 1) continue;
        insertKey.run({
          id: `${row.id}-primary`,
          provider_id: row.id,
          label: "主 Key",
          api_key_enc: row.api_key_enc,
          api_key_iv: row.api_key_iv,
          api_key_tag: row.api_key_tag,
          stored_in_keychain: row.stored_in_keychain ?? 0,
          created_at: now,
          updated_at: now,
        });
      }
    },
  },
  {
    version: 13,
    name: "m6d_chapters_updated_at",
    up: (db) => {
      const cols = db
        .prepare(`PRAGMA table_info(chapters)`)
        .all()
        .map((row) => (row as { name: string }).name);
      if (!cols.includes("updated_at")) {
        // Two-step add: SQLite forbids adding a NOT NULL column without a
        // constant default. CURRENT_TIMESTAMP is non-constant, so we add
        // nullable, backfill, then upgrade implicitly via app code.
        db.exec(`ALTER TABLE chapters ADD COLUMN updated_at TEXT`);
        const now = new Date().toISOString();
        db.prepare(`UPDATE chapters SET updated_at = ? WHERE updated_at IS NULL`).run(now);
      }
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_chapters_project_updated
           ON chapters(project_id, updated_at DESC)`,
      );
    },
  },
];

export function runMigrations(db: DB): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare(`SELECT version FROM schema_migrations`)
      .all()
      .map((row) => (row as { version: number }).version),
  );

  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  let appliedCount = 0;

  const insertStmt = db.prepare(
    `INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`,
  );

  for (const migration of sorted) {
    if (applied.has(migration.version)) continue;
    const tx = db.transaction(() => {
      migration.up(db);
      insertStmt.run(migration.version, migration.name, new Date().toISOString());
    });
    tx();
    appliedCount += 1;
  }

  return appliedCount;
}
