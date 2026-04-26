import type {
  ChapterCreateInput,
  ChapterDeleteInput,
  ChapterExportMdInput,
  ChapterExportMdResponse,
  ChapterAutosaveClearInput,
  ChapterAutosavePeekInput,
  ChapterAutosavePeekResponse,
  ChapterAutosaveWriteInput,
  ChapterImportMdInput,
  ChapterListInput,
  ChapterReadInput,
  ChapterReadResponse,
  ChapterReorderInput,
  ChapterUpdateInput,
  CharacterSyncApplyInput,
  CharacterSyncApplyResponse,
  CharacterSyncHistoryInput,
  CharacterSyncPreviewInput,
  CharacterSyncPreviewResponse,
  DailyProgressInput,
  DailySummaryGenerateInput,
  DailySummaryGenerateResponse,
  DailySummaryGetInput,
  DailySummaryListInput,
  FeedbackDismissInput,
  FeedbackListInput,
  FsPickFileInput,
  FsPickFileResponse,
  FsSaveFileInput,
  FsSaveFileResponse,
  IpcEventMap,
  LLMAnalyzeInput,
  LLMAnalyzeResponse,
  LLMChatInput,
  LLMChatResponse,
  LLMQuickActionInput,
  LLMQuickActionResponse,
  NovelCharacterCreateInput,
  NovelCharacterDeleteInput,
  NovelCharacterGetInput,
  NovelCharacterListInput,
  NovelCharacterUpdateInput,
  OutlineCreateInput,
  OutlineDeleteInput,
  OutlineListInput,
  OutlineUpdateInput,
  ProjectCreateInput,
  ProjectDeleteInput,
  ProjectOpenInput,
  ProjectUpdateInput,
  ProviderDeleteInput,
  ProviderKeyDeleteInput,
  ProviderKeyHealthInput,
  ProviderKeyListInput,
  ProviderKeySetDisabledInput,
  ProviderKeyUpsertInput,
  ProviderSaveInput,
  ProviderTestInput,
  ProviderTestResponse,
  ResearchDeleteInput,
  ResearchCredentialDeleteInput,
  ResearchCredentialStatus,
  ResearchCredentialStatusInput,
  ResearchCredentialUpsertInput,
  ResearchGetInput,
  ResearchListInput,
  ResearchSaveInput,
  ResearchSearchInput,
  ResearchSearchResponse,
  ResearchUpdateInput,
  ReviewCancelInput,
  ReviewCancelResponse,
  ReviewDimDeleteInput,
  ReviewDimListInput,
  ReviewDimReorderInput,
  ReviewDimUpsertInput,
  ReviewDismissFindingInput,
  ReviewDismissFindingResponse,
  ReviewExportInput,
  ReviewExportResponse,
  ReviewGetInput,
  ReviewGetResponse,
  ReviewListInput,
  ReviewRunInput,
  ReviewRunResponse,
  SettingsGetInput,
  SettingsSetInput,
  DiagSnapshotInput,
  DiagSnapshotResponse,
  DiagCrashStatusResponse,
  UpdateStatus,
  MarketFetchRegistryInput,
  MarketRegistryDTO,
  MarketInstallSkillInput,
  MarketInstallSkillResponse,
  MarketBuildPublishBundleInput,
  MarketBuildPublishBundleResponse,
  SkillCreateInput,
  SkillDeleteInput,
  SkillExportJsonInput,
  SkillExportJsonResponse,
  SkillGetInput,
  SkillImportJsonInput,
  SkillListInput,
  SkillRunInput,
  SkillRunResponse,
  SkillUpdateInput,
  TavernCardCreateInput,
  TavernCardDeleteInput,
  TavernCardGetInput,
  TavernCardListInput,
  TavernCardUpdateInput,
  TavernDirectorPostInput,
  TavernDirectorPostResponse,
  TavernMessageListInput,
  TavernRoundRunInput,
  TavernRoundRunResponse,
  TavernRoundStopInput,
  TavernRoundStopResponse,
  TavernSessionCreateInput,
  TavernSessionDeleteInput,
  TavernSessionGetInput,
  TavernSessionListInput,
  TavernSummaryCompactInput,
  TerminalDisposePayload,
  TerminalInputPayload,
  TerminalResizePayload,
  TerminalSpawnInput,
  TerminalSpawnResponse,
  WorldCreateInput,
  WorldDeleteInput,
  WorldGetInput,
  WorldListInput,
  WorldSearchInput,
  WorldUpdateInput,
} from "./ipc";
import type {
  AIFeedbackRecord,
  AppSettings,
  ChapterRecord,
  CharacterSyncLogRecord,
  CompactResult,
  DailyProgressRecord,
  DailySummaryRecord,
  NovelCharacterRecord,
  OutlineCardRecord,
  ProjectRecord,
  ProviderHealthSnapshot,
  ProviderKeyRecord,
  ProviderRecord,
  ResearchNoteRecord,
  ReviewDimensionRecord,
  ReviewReportRecord,
  SkillDefinition,
  SkillImportReport,
  TavernCardRecord,
  TavernMessageRecord,
  TavernSessionRecord,
  WorldEntryRecord,
} from "./domain";

export type Unsubscribe = () => void;

export interface InkforgeApi {
  project: {
    create(input: ProjectCreateInput): Promise<ProjectRecord>;
    list(): Promise<ProjectRecord[]>;
    update(input: ProjectUpdateInput): Promise<ProjectRecord>;
    delete(input: ProjectDeleteInput): Promise<{ id: string }>;
    open(input: ProjectOpenInput): Promise<ProjectRecord>;
  };
  chapter: {
    create(input: ChapterCreateInput): Promise<ChapterRecord>;
    update(input: ChapterUpdateInput): Promise<ChapterRecord>;
    list(input: ChapterListInput): Promise<ChapterRecord[]>;
    read(input: ChapterReadInput): Promise<ChapterReadResponse>;
    delete(input: ChapterDeleteInput): Promise<{ id: string }>;
    reorder(input: ChapterReorderInput): Promise<ChapterRecord[]>;
    importMd(input: ChapterImportMdInput): Promise<ChapterRecord>;
    exportMd(input: ChapterExportMdInput): Promise<ChapterExportMdResponse>;
    autosaveWrite(input: ChapterAutosaveWriteInput): Promise<{ savedAt: number }>;
    autosavePeek(input: ChapterAutosavePeekInput): Promise<ChapterAutosavePeekResponse>;
    autosaveClear(input: ChapterAutosaveClearInput): Promise<{ ok: true }>;
  };
  provider: {
    save(input: ProviderSaveInput): Promise<ProviderRecord>;
    list(): Promise<ProviderRecord[]>;
    delete(input: ProviderDeleteInput): Promise<{ id: string }>;
    test(input: ProviderTestInput): Promise<ProviderTestResponse>;
  };
  llm: {
    analyze(input: LLMAnalyzeInput): Promise<LLMAnalyzeResponse>;
    quick(input: LLMQuickActionInput): Promise<LLMQuickActionResponse>;
    chat(input: LLMChatInput): Promise<LLMChatResponse>;
    onChunk(listener: (payload: IpcEventMap["llm:chunk"]) => void): Unsubscribe;
    onDone(listener: (payload: IpcEventMap["llm:done"]) => void): Unsubscribe;
  };
  feedback: {
    list(input: FeedbackListInput): Promise<AIFeedbackRecord[]>;
    dismiss(input: FeedbackDismissInput): Promise<{ id: string; dismissed: boolean }>;
  };
  outline: {
    create(input: OutlineCreateInput): Promise<OutlineCardRecord>;
    update(input: OutlineUpdateInput): Promise<OutlineCardRecord>;
    delete(input: OutlineDeleteInput): Promise<{ id: string }>;
    list(input: OutlineListInput): Promise<OutlineCardRecord[]>;
  };
  daily: {
    progress(input: DailyProgressInput): Promise<DailyProgressRecord>;
  };
  settings: {
    get(input: SettingsGetInput): Promise<AppSettings>;
    set(input: SettingsSetInput): Promise<AppSettings>;
  };
  diag: {
    snapshot(input?: DiagSnapshotInput): Promise<DiagSnapshotResponse>;
    crashStatus(): Promise<DiagCrashStatusResponse>;
    crashDismiss(): Promise<{ ok: true }>;
  };
  update: {
    check(): Promise<UpdateStatus>;
    download(): Promise<{ ok: true }>;
    install(): Promise<{ ok: true }>;
    status(): Promise<UpdateStatus>;
    openDownloadPage(): Promise<{ ok: true }>;
    onStatus(listener: (status: UpdateStatus) => void): () => void;
  };
  market: {
    fetchRegistry(input?: MarketFetchRegistryInput): Promise<MarketRegistryDTO>;
    installSkill(input: MarketInstallSkillInput): Promise<MarketInstallSkillResponse>;
    buildPublishBundle(
      input: MarketBuildPublishBundleInput,
    ): Promise<MarketBuildPublishBundleResponse>;
  };
  fs: {
    pickFile(input: FsPickFileInput): Promise<FsPickFileResponse>;
    saveFile(input: FsSaveFileInput): Promise<FsSaveFileResponse>;
  };
  terminal: {
    spawn(input: TerminalSpawnInput): Promise<TerminalSpawnResponse>;
    input(payload: TerminalInputPayload): Promise<{ ok: true }>;
    resize(payload: TerminalResizePayload): Promise<{ ok: true }>;
    dispose(payload: TerminalDisposePayload): Promise<{ ok: true }>;
    onData(listener: (payload: IpcEventMap["terminal:data"]) => void): Unsubscribe;
    onExit(listener: (payload: IpcEventMap["terminal:exit"]) => void): Unsubscribe;
  };
  skill: {
    create(input: SkillCreateInput): Promise<SkillDefinition>;
    update(input: SkillUpdateInput): Promise<SkillDefinition>;
    get(input: SkillGetInput): Promise<SkillDefinition | null>;
    list(input?: SkillListInput): Promise<SkillDefinition[]>;
    delete(input: SkillDeleteInput): Promise<{ id: string }>;
    run(input: SkillRunInput): Promise<SkillRunResponse>;
    importJson(input: SkillImportJsonInput): Promise<SkillImportReport>;
    exportJson(input: SkillExportJsonInput): Promise<SkillExportJsonResponse>;
    onChunk(listener: (payload: IpcEventMap["skill:chunk"]) => void): Unsubscribe;
    onDone(listener: (payload: IpcEventMap["skill:done"]) => void): Unsubscribe;
  };
  tavernCard: {
    create(input: TavernCardCreateInput): Promise<TavernCardRecord>;
    update(input: TavernCardUpdateInput): Promise<TavernCardRecord>;
    get(input: TavernCardGetInput): Promise<TavernCardRecord | null>;
    list(input?: TavernCardListInput): Promise<TavernCardRecord[]>;
    delete(input: TavernCardDeleteInput): Promise<{ id: string }>;
  };
  novelCharacter: {
    create(input: NovelCharacterCreateInput): Promise<NovelCharacterRecord>;
    update(input: NovelCharacterUpdateInput): Promise<NovelCharacterRecord>;
    get(input: NovelCharacterGetInput): Promise<NovelCharacterRecord | null>;
    list(input: NovelCharacterListInput): Promise<NovelCharacterRecord[]>;
    delete(input: NovelCharacterDeleteInput): Promise<{ id: string }>;
  };
  characterSync: {
    preview(input: CharacterSyncPreviewInput): Promise<CharacterSyncPreviewResponse>;
    apply(input: CharacterSyncApplyInput): Promise<CharacterSyncApplyResponse>;
    history(input?: CharacterSyncHistoryInput): Promise<CharacterSyncLogRecord[]>;
  };
  tavernSession: {
    create(input: TavernSessionCreateInput): Promise<TavernSessionRecord>;
    get(input: TavernSessionGetInput): Promise<TavernSessionRecord | null>;
    list(input: TavernSessionListInput): Promise<TavernSessionRecord[]>;
    delete(input: TavernSessionDeleteInput): Promise<{ sessionId: string }>;
  };
  tavernMessage: {
    list(input: TavernMessageListInput): Promise<TavernMessageRecord[]>;
  };
  tavernRound: {
    run(input: TavernRoundRunInput): Promise<TavernRoundRunResponse>;
    stop(input: TavernRoundStopInput): Promise<TavernRoundStopResponse>;
    directorPost(input: TavernDirectorPostInput): Promise<TavernDirectorPostResponse>;
    onChunk(listener: (payload: IpcEventMap["tavern:chunk"]) => void): Unsubscribe;
    onDone(listener: (payload: IpcEventMap["tavern:done"]) => void): Unsubscribe;
    onBudgetWarning(listener: (payload: IpcEventMap["tavern:budget-warning"]) => void): Unsubscribe;
  };
  tavernSummary: {
    compact(input: TavernSummaryCompactInput): Promise<CompactResult>;
  };
  world: {
    list(input: WorldListInput): Promise<WorldEntryRecord[]>;
    get(input: WorldGetInput): Promise<WorldEntryRecord | null>;
    create(input: WorldCreateInput): Promise<WorldEntryRecord>;
    update(input: WorldUpdateInput): Promise<WorldEntryRecord>;
    delete(input: WorldDeleteInput): Promise<{ id: string }>;
    search(input: WorldSearchInput): Promise<WorldEntryRecord[]>;
  };
  research: {
    search(input: ResearchSearchInput): Promise<ResearchSearchResponse>;
    list(input: ResearchListInput): Promise<ResearchNoteRecord[]>;
    get(input: ResearchGetInput): Promise<ResearchNoteRecord | null>;
    save(input: ResearchSaveInput): Promise<ResearchNoteRecord>;
    update(input: ResearchUpdateInput): Promise<ResearchNoteRecord>;
    delete(input: ResearchDeleteInput): Promise<{ id: string }>;
    credentialStatus(
      input: ResearchCredentialStatusInput,
    ): Promise<ResearchCredentialStatus[]>;
    credentialUpsert(
      input: ResearchCredentialUpsertInput,
    ): Promise<ResearchCredentialStatus>;
    credentialDelete(
      input: ResearchCredentialDeleteInput,
    ): Promise<ResearchCredentialStatus>;
  };
  reviewDim: {
    list(input: ReviewDimListInput): Promise<ReviewDimensionRecord[]>;
    upsert(input: ReviewDimUpsertInput): Promise<ReviewDimensionRecord>;
    delete(input: ReviewDimDeleteInput): Promise<{ id: string }>;
    reorder(input: ReviewDimReorderInput): Promise<ReviewDimensionRecord[]>;
  };
  review: {
    run(input: ReviewRunInput): Promise<ReviewRunResponse>;
    cancel(input: ReviewCancelInput): Promise<ReviewCancelResponse>;
    list(input: ReviewListInput): Promise<ReviewReportRecord[]>;
    get(input: ReviewGetInput): Promise<ReviewGetResponse | null>;
    dismissFinding(input: ReviewDismissFindingInput): Promise<ReviewDismissFindingResponse>;
    export(input: ReviewExportInput): Promise<ReviewExportResponse>;
    onProgress(listener: (payload: IpcEventMap["review:progress"]) => void): Unsubscribe;
    onDone(listener: (payload: IpcEventMap["review:done"]) => void): Unsubscribe;
  };
  dailySummary: {
    generate(input: DailySummaryGenerateInput): Promise<DailySummaryGenerateResponse>;
    get(input: DailySummaryGetInput): Promise<DailySummaryRecord | null>;
    list(input: DailySummaryListInput): Promise<DailySummaryRecord[]>;
    onChunk(listener: (payload: IpcEventMap["daily:summary-chunk"]) => void): Unsubscribe;
    onDone(listener: (payload: IpcEventMap["daily:summary-done"]) => void): Unsubscribe;
  };
  providerKey: {
    list(input: ProviderKeyListInput): Promise<ProviderKeyRecord[]>;
    upsert(input: ProviderKeyUpsertInput): Promise<ProviderKeyRecord>;
    delete(input: ProviderKeyDeleteInput): Promise<{ id: string }>;
    setDisabled(input: ProviderKeySetDisabledInput): Promise<ProviderKeyRecord>;
    health(input: ProviderKeyHealthInput): Promise<ProviderHealthSnapshot>;
  };
}
