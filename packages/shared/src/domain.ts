export type ProviderVendor = "anthropic" | "openai" | "gemini" | "openai-compat";

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  dailyGoal: number;
  lastOpened: string | null;
}

export interface ChapterRecord {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  order: number;
  status: string;
  wordCount: number;
  filePath: string;
  /** ISO-8601 of last DB write. May be null on rows created before migration v13. */
  updatedAt: string | null;
}

export interface ProviderRecord {
  id: string;
  label: string;
  vendor: ProviderVendor;
  baseUrl: string;
  defaultModel: string;
  tags: string[];
}

export interface AIFeedbackRecord {
  id: string;
  projectId: string;
  chapterId: string;
  type: string;
  payload: Record<string, unknown>;
  trigger: string;
  createdAt: string;
  dismissed: boolean;
}

export interface OutlineCardRecord {
  id: string;
  projectId: string;
  chapterId: string | null;
  title: string;
  content: string;
  status: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface DailyProgressRecord {
  date: string;
  projectId: string;
  wordsAdded: number;
  goal: number;
  goalHit: boolean;
}

export type AppSettingKey =
  | "theme"
  | "activeProviderId"
  | "analysisEnabled"
  | "analysisThreshold"
  | "uiLanguage"
  | "devModeEnabled"
  | "onboardingCompleted";

export interface AppSettings {
  theme: "dark" | "light";
  activeProviderId: string | null;
  analysisEnabled: boolean;
  analysisThreshold: number;
  uiLanguage: "zh" | "en" | "ja";
  devModeEnabled: boolean;
  onboardingCompleted: boolean;
}

export type SkillScope = "global" | "project" | "community";

export type SkillTriggerType =
  | "selection"
  | "every-n-chars"
  | "on-save"
  | "on-chapter-end"
  | "manual";

export type SkillOutputTarget =
  | "ai-feedback"
  | "replace-selection"
  | "insert-after-selection"
  | "append-chapter";

export interface SkillVariableDef {
  key: string;
  label: string;
  required: boolean;
  defaultValue?: string;
  description?: string;
}

export interface SkillTriggerDef {
  type: SkillTriggerType;
  enabled: boolean;
  everyNChars?: number;
  debounceMs?: number;
  cooldownMs?: number;
}

export interface SkillBinding {
  providerId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  summaryProviderId?: string;
  summaryModel?: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  prompt: string;
  variables: SkillVariableDef[];
  triggers: SkillTriggerDef[];
  binding: SkillBinding;
  output: SkillOutputTarget;
  enabled: boolean;
  scope: SkillScope;
  createdAt: string;
  updatedAt: string;
}

export type TavernMode = "director" | "auto";

export type TavernRole = "director" | "character" | "summary";

export type SyncMode = "two-way" | "snapshot" | "detached";

export interface TavernCardRecord {
  id: string;
  name: string;
  persona: string;
  avatarPath: string | null;
  providerId: string;
  model: string;
  temperature: number;
  linkedNovelCharacterId: string | null;
  syncMode: SyncMode;
  createdAt: string;
  updatedAt: string;
}

export interface NovelCharacterRecord {
  id: string;
  projectId: string;
  name: string;
  persona: string | null;
  traits: Record<string, unknown>;
  backstory: string;
  relations: Array<{ otherId: string; label: string }>;
  linkedTavernCardId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CharacterSyncField = "persona" | "backstory" | "traits";

export type CharacterSyncDirection =
  | "novel_to_card"
  | "card_to_novel"
  | "manual_merge";

export interface CharacterSyncLogRecord {
  id: string;
  novelCharId: string;
  tavernCardId: string | null;
  field: CharacterSyncField;
  oldValue: string;
  newValue: string;
  direction: CharacterSyncDirection;
  at: string;
}

export interface TavernSessionRecord {
  id: string;
  projectId: string;
  title: string;
  topic: string;
  mode: TavernMode;
  budgetTokens: number;
  summaryProviderId: string | null;
  summaryModel: string | null;
  lastK: number;
  createdAt: string;
}

export interface TavernMessageRecord {
  id: string;
  sessionId: string;
  characterId: string | null;
  role: TavernRole;
  content: string;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
}

export interface SkillRunUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedInputTokens?: number;
}

export interface SkillPackV1 {
  format: "inkforge.skill-pack";
  version: "1.0.0";
  exportedAt: string;
  source: "inkforge-desktop";
  skills: SkillDefinition[];
}

export interface SkillImportReport {
  format: string;
  version: string;
  total: number;
  imported: number;
  replaced: number;
  skipped: number;
  errors: Array<{ skillId?: string; reason: string }>;
}

export interface SyncDiffRow {
  field: CharacterSyncField;
  novelValue: unknown;
  cardValue: unknown;
  winner: "novel" | "card" | null;
  conflict: boolean;
}

export interface TokenBudgetState {
  sessionId: string;
  budgetTokens: number;
  usedTokens: number;
  remainingTokens: number;
  shouldWarn: boolean;
  warnAt: string | null;
}

export interface CompactResult {
  summaryMessageId: string;
  replacedMessageCount: number;
  usage: SkillRunUsage;
}

// ---------- M4 · World ----------

export type WorldEntryCategory = string;

export interface WorldEntryRecord {
  id: string;
  projectId: string;
  category: string;
  title: string;
  content: string;
  aliases: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ---------- M4 · Research ----------

export type ResearchProvider =
  | "tavily"
  | "bing"
  | "serpapi"
  | "llm-fallback"
  | "manual";

export interface ResearchNoteRecord {
  id: string;
  projectId: string;
  topic: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceProvider: ResearchProvider;
  excerpt: string;
  note: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ResearchSearchHit {
  title: string;
  url: string;
  snippet: string;
  provider: ResearchProvider;
  score?: number;
}

// ---------- M4 · Review ----------

export type ReviewBuiltinId =
  | "consistency-character"
  | "consistency-timeline"
  | "foreshadowing"
  | "worldbuilding"
  | "style";

export type ReviewDimensionKind = "builtin" | "skill";

export type ReviewScope = "book" | "chapter" | "selection";

export type ReviewSeverity = "info" | "warn" | "error";

export type ReviewReportStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface ReviewDimensionRecord {
  id: string;
  projectId: string | null;
  name: string;
  kind: ReviewDimensionKind;
  builtinId: ReviewBuiltinId | null;
  skillId: string | null;
  scope: ReviewScope;
  severity: ReviewSeverity;
  enabled: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewReportSummary {
  totals: Record<ReviewSeverity, number>;
  perDimension: Array<{ dimensionId: string; count: number }>;
  perChapter: Array<{ chapterId: string; count: number }>;
  usage?: SkillRunUsage;
}

export interface ReviewReportRecord {
  id: string;
  projectId: string;
  rangeKind: "book" | "chapter" | "range";
  rangeIds: string[];
  startedAt: string;
  finishedAt: string | null;
  status: ReviewReportStatus;
  summary: ReviewReportSummary;
  error: string | null;
}

export interface ReviewFindingRecord {
  id: string;
  reportId: string;
  dimensionId: string;
  chapterId: string | null;
  excerpt: string;
  excerptStart: number | null;
  excerptEnd: number | null;
  severity: ReviewSeverity;
  suggestion: string;
  dismissed: boolean;
  createdAt: string;
}

// ---------- M4 · Daily Summary ----------

export interface DailySummaryRecord {
  date: string;
  projectId: string;
  wordsAdded: number;
  goal: number;
  goalHit: boolean;
  summary: string | null;
  summaryProviderId: string | null;
  summaryModel: string | null;
  generatedAt: string | null;
}

// ---------- M4 · Provider Multi-Key ----------

export type ProviderKeyStrategy =
  | "single"
  | "round-robin"
  | "weighted"
  | "sticky";

export interface ProviderKeyRecord {
  id: string;
  providerId: string;
  label: string;
  weight: number;
  disabled: boolean;
  storedInKeychain: boolean;
  lastFailedAt: string | null;
  failCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderKeyHealth {
  keyId: string;
  label: string;
  disabled: boolean;
  recentSuccesses: number;
  recentFailures: number;
  cooldownUntil: string | null;
}

export interface ProviderHealthSnapshot {
  providerId: string;
  strategy: ProviderKeyStrategy;
  cooldownMs: number;
  keys: ProviderKeyHealth[];
}
