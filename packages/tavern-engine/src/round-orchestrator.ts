import type {
  SkillRunUsage,
  TavernCardRecord,
  TavernMessageRecord,
  TavernMode,
  TokenBudgetState,
} from "@inkforge/shared";
import { TavernRuntimeError } from "./errors";
import type { LLMMessage } from "./context-builder";

export interface OrchestratorStreamInput {
  providerId: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt: string;
  messages: LLMMessage[];
}

export interface OrchestratorStreamChunk {
  type: "delta" | "done" | "error";
  textDelta?: string;
  error?: string;
  usage?: SkillRunUsage;
}

export interface OrchestratorStartContext {
  roundId: string;
  sessionId: string;
  mode: TavernMode;
  participants: TavernCardRecord[];
  totalRounds: number;
  topic: string;
}

export interface OrchestratorSpeakerContext {
  roundId: string;
  sessionId: string;
  roundIndex: number;
  totalRounds: number;
  turnIndex: number;
  speaker: TavernCardRecord;
  systemPrompt: string;
  messages: LLMMessage[];
  estimatedInputTokens: number;
}

export interface OrchestratorChunkEvent {
  roundId: string;
  sessionId: string;
  roundIndex: number;
  turnIndex: number;
  speaker: TavernCardRecord;
  delta: string;
  accumulatedText: string;
}

export interface OrchestratorTurnDoneEvent {
  roundId: string;
  sessionId: string;
  roundIndex: number;
  turnIndex: number;
  speaker: TavernCardRecord;
  status: "completed" | "failed" | "stopped";
  message: TavernMessageRecord | null;
  usage?: SkillRunUsage;
  error?: string;
  budgetState: TokenBudgetState;
}

export interface OrchestratorRoundDoneEvent {
  roundId: string;
  sessionId: string;
  status: "completed" | "failed" | "stopped";
  error?: string;
}

export interface OrchestratorBudgetWarning {
  roundId: string;
  sessionId: string;
  budgetState: TokenBudgetState;
  estimatedNextRoundTokens: number;
  threshold: number;
}

export interface RoundOrchestratorDeps {
  loadHistory: (sessionId: string) => Promise<TavernMessageRecord[]>;
  appendMessage: (input: {
    sessionId: string;
    characterId: string;
    role: "character";
    content: string;
    tokensIn: number;
    tokensOut: number;
    createdAt: string;
  }) => Promise<TavernMessageRecord>;
  buildContext: (input: {
    speakerCard: TavernCardRecord;
    allCards: TavernCardRecord[];
    topic: string;
    mode: TavernMode;
    history: TavernMessageRecord[];
    lastK: number;
    directorMessage?: string;
  }) => { systemPrompt: string; messages: LLMMessage[] };
  resolveSpeakerRuntime: (card: TavernCardRecord) => Promise<{
    providerId: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  }>;
  streamCompletion: (input: OrchestratorStreamInput) => AsyncIterable<OrchestratorStreamChunk>;
  estimateTokens: (input: { systemPrompt: string; messages: LLMMessage[] }) => number;
  recordUsage: (
    usage: SkillRunUsage | undefined,
    estimatedInputTokens: number,
  ) => TokenBudgetState;
  shouldCompactBeforeNextRound: (estimatedNextInputTokens: number) => boolean;
  onStart?: (event: OrchestratorStartContext) => void;
  onChunk: (event: OrchestratorChunkEvent) => void;
  onTurnDone: (event: OrchestratorTurnDoneEvent) => void;
  onRoundDone: (event: OrchestratorRoundDoneEvent) => void;
  onBudgetWarning?: (event: OrchestratorBudgetWarning) => void;
}

export interface RoundOrchestratorInput {
  roundId: string;
  sessionId: string;
  mode: TavernMode;
  participants: TavernCardRecord[];
  lastK: number;
  topic: string;
  autoRounds?: number;
  directorMessage?: string;
}

export class RoundOrchestrator {
  private readonly deps: RoundOrchestratorDeps;
  private readonly cancelled = new Set<string>();

  constructor(deps: RoundOrchestratorDeps) {
    this.deps = deps;
  }

  stop(roundId: string): void {
    this.cancelled.add(roundId);
  }

  async run(input: RoundOrchestratorInput): Promise<void> {
    const { roundId, sessionId, mode, participants, lastK, topic } = input;
    if (participants.length === 0) {
      throw new TavernRuntimeError("no_participants", "participants is empty");
    }
    const totalRounds = Math.max(1, input.autoRounds ?? 1);
    this.deps.onStart?.({
      roundId,
      sessionId,
      mode,
      participants,
      totalRounds,
      topic,
    });

    try {
      for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
        if (this.cancelled.has(roundId)) break;
        for (let turnIndex = 0; turnIndex < participants.length; turnIndex += 1) {
          if (this.cancelled.has(roundId)) break;
          const speaker = participants[turnIndex];
          const history = await this.deps.loadHistory(sessionId);
          const { systemPrompt, messages } = this.deps.buildContext({
            speakerCard: speaker,
            allCards: participants,
            topic,
            mode,
            history,
            lastK,
            directorMessage: roundIndex === 0 && turnIndex === 0 ? input.directorMessage : undefined,
          });
          const estimatedInput = this.deps.estimateTokens({ systemPrompt, messages });
          const runtime = await this.deps.resolveSpeakerRuntime(speaker);

          const turnContext: OrchestratorSpeakerContext = {
            roundId,
            sessionId,
            roundIndex,
            turnIndex,
            totalRounds,
            speaker,
            systemPrompt,
            messages,
            estimatedInputTokens: estimatedInput,
          };

          const turnResult = await this.runTurn(turnContext, runtime);
          if (turnResult.status === "stopped") break;
          if (turnResult.status === "failed") {
            this.deps.onRoundDone({
              roundId,
              sessionId,
              status: "failed",
              error: turnResult.error,
            });
            return;
          }
        }
        if (this.cancelled.has(roundId)) break;
        const nextEstimate = Math.max(200, Math.round((totalRounds - roundIndex - 1) > 0 ? 1200 : 0));
        if (nextEstimate > 0 && this.deps.shouldCompactBeforeNextRound(nextEstimate)) {
          this.deps.onBudgetWarning?.({
            roundId,
            sessionId,
            budgetState: this.deps.recordUsage(undefined, 0),
            estimatedNextRoundTokens: nextEstimate,
            threshold: 0,
          });
        }
      }
      this.deps.onRoundDone({
        roundId,
        sessionId,
        status: this.cancelled.has(roundId) ? "stopped" : "completed",
      });
    } finally {
      this.cancelled.delete(roundId);
    }
  }

  private async runTurn(
    ctx: OrchestratorSpeakerContext,
    runtime: {
      providerId: string;
      model: string;
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<OrchestratorTurnDoneEvent> {
    const { roundId, sessionId, roundIndex, turnIndex, speaker, systemPrompt, messages } = ctx;
    let accumulated = "";
    let usage: SkillRunUsage | undefined;

    try {
      const stream = this.deps.streamCompletion({
        providerId: runtime.providerId,
        model: runtime.model,
        temperature: runtime.temperature,
        maxTokens: runtime.maxTokens,
        systemPrompt,
        messages,
      });
      for await (const chunk of stream) {
        if (this.cancelled.has(roundId)) {
          const stoppedBudget = this.deps.recordUsage(usage, ctx.estimatedInputTokens);
          const event: OrchestratorTurnDoneEvent = {
            roundId,
            sessionId,
            roundIndex,
            turnIndex,
            speaker,
            status: "stopped",
            message: null,
            usage,
            budgetState: stoppedBudget,
          };
          this.deps.onTurnDone(event);
          return event;
        }
        if (chunk.type === "delta" && chunk.textDelta) {
          accumulated += chunk.textDelta;
          this.deps.onChunk({
            roundId,
            sessionId,
            roundIndex,
            turnIndex,
            speaker,
            delta: chunk.textDelta,
            accumulatedText: accumulated,
          });
          continue;
        }
        if (chunk.type === "done") {
          usage = chunk.usage;
          continue;
        }
        if (chunk.type === "error") {
          throw new TavernRuntimeError(
            "tavern_stream_error",
            chunk.error ?? "unknown_stream_error",
          );
        }
      }

      const trimmed = accumulated.trim();
      const tokensIn = usage?.inputTokens ?? ctx.estimatedInputTokens;
      const tokensOut = usage?.outputTokens ?? 0;
      let message: TavernMessageRecord | null = null;
      if (trimmed.length > 0) {
        message = await this.deps.appendMessage({
          sessionId,
          characterId: speaker.id,
          role: "character",
          content: trimmed,
          tokensIn,
          tokensOut,
          createdAt: new Date().toISOString(),
        });
      }
      const budgetState = this.deps.recordUsage(usage, ctx.estimatedInputTokens);
      const event: OrchestratorTurnDoneEvent = {
        roundId,
        sessionId,
        roundIndex,
        turnIndex,
        speaker,
        status: "completed",
        message,
        usage,
        budgetState,
      };
      this.deps.onTurnDone(event);
      return event;
    } catch (error) {
      const budgetState = this.deps.recordUsage(usage, ctx.estimatedInputTokens);
      const event: OrchestratorTurnDoneEvent = {
        roundId,
        sessionId,
        roundIndex,
        turnIndex,
        speaker,
        status: "failed",
        message: null,
        usage,
        error: error instanceof Error ? error.message : String(error),
        budgetState,
      };
      this.deps.onTurnDone(event);
      return event;
    }
  }
}
