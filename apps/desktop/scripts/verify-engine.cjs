#!/usr/bin/env node
/**
 * M3-E 验收脚本：tavern-engine 纯逻辑验证
 * 无 Electron，仅对 BudgetTracker / ContextBuilder 做自断言。
 *
 * 运行：pnpm --filter @inkforge/desktop run verify:engine
 * 前置：先跑 pnpm build 确保 packages/tavern-engine/dist 就绪。
 */
const {
  BudgetTracker,
  ContextBuilder,
  estimateTokensFromText,
} = require("@inkforge/tavern-engine");

let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
  } else {
    console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
    failed += 1;
  }
}

function testEstimate() {
  const cjk = estimateTokensFromText("林晚望向远处");
  const ascii = estimateTokensFromText("Hello world!");
  assert(cjk > 0 && ascii > 0, "estimateTokensFromText 对中英文都返回正数");
  assert(cjk >= 6, `中文 6 字估算不低于 6 tokens（实际 ${cjk}）`);
  assert(ascii <= 6, `英文短句估算不超过 6 tokens（实际 ${ascii}）`);
  assert(estimateTokensFromText("") === 0, "空串返回 0");
}

function testBudget() {
  const t = new BudgetTracker({ sessionId: "s1", budgetTokens: 1000 });
  assert(t.getState().remainingTokens === 1000, "初始 remaining = budget");
  t.recordUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
  const s1 = t.getState();
  assert(s1.usedTokens === 150, `usage 累加正确（${s1.usedTokens}）`);
  assert(!s1.shouldWarn, "80%+ 剩余时不发警告");

  t.recordUsage({ inputTokens: 500, outputTokens: 200, totalTokens: 700 });
  const s2 = t.getState();
  assert(s2.shouldWarn, "剩余 15% 时发出警告");

  assert(
    t.shouldCompactBeforeNextRound(1200),
    "剩余 150 token 且预计下一轮 1200 时应压缩",
  );

  const fresh = new BudgetTracker({ sessionId: "s2", budgetTokens: 10_000 });
  fresh.seed(200);
  assert(fresh.getState().usedTokens === 200, "seed 可预设已用量");
  assert(
    !fresh.shouldCompactBeforeNextRound(100),
    "余量充足时不触发压缩",
  );
}

function testContextBuilder() {
  const builder = new ContextBuilder();
  const speaker = {
    id: "card-a",
    name: "林晚",
    persona: "温和内敛，剑法精湛",
    avatarPath: null,
    providerId: "p1",
    model: "m1",
    temperature: 0.8,
    linkedNovelCharacterId: null,
    syncMode: "two-way",
    createdAt: "",
    updatedAt: "",
  };
  const other = { ...speaker, id: "card-b", name: "陆九" };
  const history = [
    {
      id: "msg-1",
      sessionId: "s1",
      characterId: null,
      role: "summary",
      content: "已发生：林晚抗命；陆九施压。",
      tokensIn: 0,
      tokensOut: 0,
      createdAt: "2026-04-20T10:00:00Z",
    },
    {
      id: "msg-2",
      sessionId: "s1",
      characterId: "card-a",
      role: "character",
      content: "我不会接这趟任务。",
      tokensIn: 50,
      tokensOut: 20,
      createdAt: "2026-04-20T10:05:00Z",
    },
    {
      id: "msg-3",
      sessionId: "s1",
      characterId: "card-b",
      role: "character",
      content: "江湖风波将起，此刻你我别无选择。",
      tokensIn: 60,
      tokensOut: 25,
      createdAt: "2026-04-20T10:06:00Z",
    },
  ];

  const built = builder.build({
    speakerCard: speaker,
    allCards: [speaker, other],
    topic: "师门任务",
    mode: "director",
    history,
    lastK: 6,
    directorMessage: "请林晚解释自己的理由",
  });

  assert(
    built.systemPrompt.includes("林晚") && built.systemPrompt.includes("温和内敛"),
    "system 包含说话者名与 persona",
  );
  assert(
    built.systemPrompt.includes("陆九"),
    "system 提到同场角色",
  );
  assert(
    built.messages.some((m) => m.role === "user" && m.content.includes("历史摘要")) ||
      built.messages.some((m) => m.role === "user" && m.content.includes("此前对话的摘要")),
    "摘要被并入 user 段",
  );
  const selfAssistant = built.messages.find(
    (m) => m.role === "assistant" && m.content.includes("我不会接这趟任务"),
  );
  assert(!!selfAssistant, "说话者过往发言标 assistant");
  const otherAsUser = built.messages.find(
    (m) => m.role === "user" && m.content.includes("陆九") && m.content.includes("江湖风波"),
  );
  assert(!!otherAsUser, "其他角色发言以 [名字] 前缀的 user 段呈现");
  const directorInjected = built.messages.find(
    (m) => m.role === "user" && m.content.startsWith("[导演]"),
  );
  assert(!!directorInjected, "director 模式将 directorMessage 注入末尾 user 段");

  const truncated = builder.build({
    speakerCard: speaker,
    allCards: [speaker, other],
    topic: "师门任务",
    mode: "auto",
    history: [
      ...history,
      {
        id: "msg-4",
        sessionId: "s1",
        characterId: "card-a",
        role: "character",
        content: "尾句",
        tokensIn: 0,
        tokensOut: 0,
        createdAt: "2026-04-20T10:07:00Z",
      },
    ],
    lastK: 1,
  });
  const nonSummaryUser = truncated.messages.filter(
    (m) => !(m.role === "user" && m.content.includes("此前对话的摘要")),
  );
  assert(
    nonSummaryUser.length <= 2,
    `lastK=1 时只保留 1 条对话 + 可能的摘要段（实际 ${nonSummaryUser.length}）`,
  );
}

function main() {
  console.log("\n[verify-engine] BudgetTracker estimate");
  testEstimate();
  console.log("\n[verify-engine] BudgetTracker record/warn/compact");
  testBudget();
  console.log("\n[verify-engine] ContextBuilder build");
  testContextBuilder();

  if (failed > 0) {
    console.error(`\n\x1b[31m${failed} 项断言失败\x1b[0m`);
    process.exit(1);
  }
  console.log("\n\x1b[32mtavern-engine 纯逻辑验证通过\x1b[0m");
}

main();
