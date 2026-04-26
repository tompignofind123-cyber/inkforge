import type { SkillRunUsage, TokenBudgetState } from "@inkforge/shared";

export interface BudgetTrackerOptions {
  sessionId: string;
  budgetTokens: number;
  warnRemainingRatio?: number;
  compactRemainingRatio?: number;
  safetyPaddingTokens?: number;
}

export interface EstimateInput {
  systemPrompt?: string;
  messages: Array<{ role: string; content: string }>;
}

const DEFAULT_WARN_RATIO = 0.3;
const DEFAULT_COMPACT_RATIO = 0.1;
const DEFAULT_SAFETY_PADDING = 500;

function clampPositive(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  let asciiChars = 0;
  let cjkChars = 0;
  let otherChars = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x7f) asciiChars += 1;
    else if (code >= 0x3000 && code <= 0x9fff) cjkChars += 1;
    else otherChars += 1;
  }
  const ascii = Math.ceil(asciiChars / 4);
  const cjk = Math.ceil(cjkChars * 1.5);
  const other = Math.ceil(otherChars * 1.2);
  return ascii + cjk + other;
}

export class BudgetTracker {
  readonly sessionId: string;
  readonly budgetTokens: number;
  private readonly warnRatio: number;
  private readonly compactRatio: number;
  private readonly safetyPadding: number;
  private usedTokens: number;

  constructor(options: BudgetTrackerOptions) {
    if (!options.sessionId) throw new Error("sessionId required");
    if (!Number.isFinite(options.budgetTokens) || options.budgetTokens <= 0) {
      throw new Error("budgetTokens must be a positive finite number");
    }
    this.sessionId = options.sessionId;
    this.budgetTokens = options.budgetTokens;
    this.warnRatio = options.warnRemainingRatio ?? DEFAULT_WARN_RATIO;
    this.compactRatio = options.compactRemainingRatio ?? DEFAULT_COMPACT_RATIO;
    this.safetyPadding = options.safetyPaddingTokens ?? DEFAULT_SAFETY_PADDING;
    this.usedTokens = 0;
  }

  estimateTokens(input: EstimateInput): number {
    const parts: string[] = [];
    if (input.systemPrompt) parts.push(input.systemPrompt);
    for (const msg of input.messages) parts.push(msg.content ?? "");
    return parts.reduce((sum, txt) => sum + estimateTokensFromText(txt), 0);
  }

  getState(): TokenBudgetState {
    const remaining = Math.max(0, this.budgetTokens - this.usedTokens);
    const remainingRatio = remaining / Math.max(1, this.budgetTokens);
    return {
      sessionId: this.sessionId,
      budgetTokens: this.budgetTokens,
      usedTokens: this.usedTokens,
      remainingTokens: remaining,
      shouldWarn: remainingRatio <= this.warnRatio,
      warnAt: remainingRatio <= this.warnRatio ? new Date().toISOString() : null,
    };
  }

  seed(usedTokens: number): void {
    this.usedTokens = clampPositive(usedTokens);
  }

  recordUsage(usage: SkillRunUsage | undefined, estimatedInputTokens?: number): TokenBudgetState {
    const actualInput = clampPositive(usage?.inputTokens ?? estimatedInputTokens ?? 0);
    const actualOutput = clampPositive(usage?.outputTokens ?? 0);
    const totalFromUsage = usage?.totalTokens;
    const increment =
      Number.isFinite(totalFromUsage) && (totalFromUsage ?? 0) > 0
        ? clampPositive(totalFromUsage ?? 0)
        : actualInput + actualOutput;
    this.usedTokens += increment;
    return this.getState();
  }

  shouldCompactBeforeNextRound(estimatedNextInputTokens: number): boolean {
    const remaining = Math.max(0, this.budgetTokens - this.usedTokens);
    const projected = remaining - clampPositive(estimatedNextInputTokens) - this.safetyPadding;
    if (projected <= 0) return true;
    const remainingRatio = remaining / Math.max(1, this.budgetTokens);
    return remainingRatio <= this.compactRatio;
  }

  get warnThreshold(): number {
    return Math.round(this.budgetTokens * this.warnRatio);
  }
}
