#!/usr/bin/env node
/**
 * M7 验收脚本：auto-writer-engine 纯逻辑验证
 * 无 Electron / LLM 调用，仅对纯函数做断言：
 *   - findings parse 容错
 *   - shouldRewriteFromFindings 阈值
 *   - summarizeFindings 计数
 *   - makeRoleResolver fallback
 *   - context-merger prompt 拼装
 *
 * 运行：pnpm --filter @inkforge/desktop run verify:auto-writer
 * 前置：先 build @inkforge/auto-writer-engine 让 dist 就绪。
 */
const {
  parseFindings,
  shouldRewriteFromFindings,
  summarizeFindings,
  findingsToMarkdown,
  makeRoleResolver,
  buildPlannerUser,
  buildWriterUser,
  buildCriticUser,
} = require("@inkforge/auto-writer-engine");

let failed = 0;
let total = 0;

function assert(condition, msg) {
  total += 1;
  if (condition) {
    console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
  } else {
    console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
    failed += 1;
  }
}

function testParseFindings() {
  // 标准 JSON
  const a = parseFindings(
    '[{"severity":"error","excerpt":"主角不抽烟","suggestion":"删除抽烟动作"}]',
  );
  assert(a.length === 1 && a[0].severity === "error", "parse 标准 JSON 数组");

  // 包裹在 markdown 代码块里
  const b = parseFindings("```json\n[{\"severity\":\"warn\",\"excerpt\":\"x\",\"suggestion\":\"y\"}]\n```");
  assert(b.length === 1 && b[0].severity === "warn", "parse 含 markdown 代码块");

  // 前后有杂乱文字
  const c = parseFindings(
    "好的，以下是结果：\n[{\"severity\":\"info\",\"excerpt\":\"\",\"suggestion\":\"\"}]\n谢谢",
  );
  assert(c.length === 1 && c[0].severity === "info", "parse 容忍前后杂乱文字");

  // 空 / 无效输入
  assert(parseFindings("").length === 0, "空字符串返回 []");
  assert(parseFindings("not json").length === 0, "无效 JSON 返回 []");
  assert(parseFindings("[]").length === 0, "[] 返回 []");

  // severity 兜底
  const d = parseFindings('[{"severity":"unknown","excerpt":"a","suggestion":"b"}]');
  assert(d.length === 1 && d[0].severity === "warn", "未知 severity 兜底为 warn");

  // 单个对象（非数组）
  const e = parseFindings('{"severity":"error","excerpt":"x","suggestion":"y"}');
  assert(e.length === 1 && e[0].severity === "error", "单对象自动包成数组");
}

function testShouldRewrite() {
  assert(
    shouldRewriteFromFindings([{ severity: "error", excerpt: "", suggestion: "" }]),
    "1 条 error 触发重写",
  );
  assert(
    !shouldRewriteFromFindings([{ severity: "info", excerpt: "", suggestion: "" }]),
    "info 不触发重写",
  );
  assert(
    !shouldRewriteFromFindings([{ severity: "warn", excerpt: "", suggestion: "" }]),
    "1 条 warn 不触发（默认阈值 2）",
  );
  assert(
    shouldRewriteFromFindings([
      { severity: "warn", excerpt: "", suggestion: "" },
      { severity: "warn", excerpt: "", suggestion: "" },
    ]),
    "2 条 warn 触发重写",
  );
  assert(
    shouldRewriteFromFindings(
      [{ severity: "warn", excerpt: "", suggestion: "" }],
      { warnThreshold: 1 },
    ),
    "warnThreshold=1 时 1 条 warn 也触发",
  );
  assert(!shouldRewriteFromFindings([]), "空 findings 不触发");
}

function testSummarize() {
  const s = summarizeFindings([
    { severity: "error", excerpt: "", suggestion: "" },
    { severity: "error", excerpt: "", suggestion: "" },
    { severity: "warn", excerpt: "", suggestion: "" },
    { severity: "info", excerpt: "", suggestion: "" },
    { severity: "info", excerpt: "", suggestion: "" },
    { severity: "info", excerpt: "", suggestion: "" },
  ]);
  assert(s.errorCount === 2, `error 计数 = 2（实际 ${s.errorCount}）`);
  assert(s.warnCount === 1, `warn 计数 = 1（实际 ${s.warnCount}）`);
  assert(s.infoCount === 3, `info 计数 = 3（实际 ${s.infoCount}）`);
}

function testFindingsToMarkdown() {
  const empty = findingsToMarkdown([]);
  assert(empty.includes("通过"), "空 findings 渲染为「通过」提示");

  const md = findingsToMarkdown([
    { severity: "error", excerpt: "主角说不抽烟", suggestion: "删除该句" },
    { severity: "warn", excerpt: "节奏稍快", suggestion: "加一段景物" },
  ]);
  assert(md.includes("🔴"), "包含 error 标记");
  assert(md.includes("🟡"), "包含 warn 标记");
  assert(md.includes("主角说不抽烟"), "包含 excerpt");
  assert(md.includes("删除该句"), "包含 suggestion");
}

function testRoleResolver() {
  // 单 binding（统一模型）：所有角色都返回同一个 binding（role 字段被替换）
  const r1 = makeRoleResolver([
    { role: "writer", providerId: "p1", model: "m1" },
  ]);
  assert(r1("planner").providerId === "p1", "统一模型：planner 复用 writer 的 binding");
  assert(r1("critic").model === "m1", "统一模型：critic 复用 model");
  assert(r1("reflector").role === "reflector", "fallback 时 role 字段被改写");

  // 4 binding（分别绑定）
  const r2 = makeRoleResolver([
    { role: "planner", providerId: "p-plan", model: "m-plan" },
    { role: "writer", providerId: "p-write", model: "m-write" },
    { role: "critic", providerId: "p-crit", model: "m-crit" },
    { role: "reflector", providerId: "p-ref", model: "m-ref" },
  ]);
  assert(r2("planner").providerId === "p-plan", "分别绑定 planner");
  assert(r2("writer").providerId === "p-write", "分别绑定 writer");
  assert(r2("critic").providerId === "p-crit", "分别绑定 critic");
  assert(r2("reflector").providerId === "p-ref", "分别绑定 reflector");

  // 空数组：抛错
  const r3 = makeRoleResolver([]);
  let threw = false;
  try {
    r3("writer");
  } catch {
    threw = true;
  }
  assert(threw, "空 agents 数组调用 resolve 抛错");
}

function testPromptBuilders() {
  const plannerUser = buildPlannerUser({
    userIdeas: "主角发现身世",
    chapterTitle: "第一章",
    existingChapterText: "",
    characters: [{ id: "c1", projectId: "p", name: "林晚", persona: "沉默寡言", traits: {}, backstory: "", relations: [], linkedTavernCardId: null, createdAt: "", updatedAt: "" }],
    worldEntries: [],
    maxSegments: 8,
    recentCorrections: [],
  });
  assert(plannerUser.includes("主角发现身世"), "Planner user prompt 含用户思路");
  assert(plannerUser.includes("林晚"), "Planner user prompt 含人物档案");
  assert(plannerUser.includes("8"), "Planner user prompt 含段数上限");

  const writerUser = buildWriterUser({
    beat: "主角在密林遭遇刺客",
    segmentIndex: 0,
    targetLength: 400,
    characters: [],
    worldEntries: [],
    chapterSoFar: "前情：林晚踏入云岭…",
    lastCriticFindingsText: "🔴 上段主角说话太冷漠",
    reflectorMemo: "下一段加些环境描写",
    userInterrupts: [{ at: "2026-01-01T00:00:00Z", content: "对话再含蓄一点" }],
    rewriteOf: null,
  });
  assert(writerUser.includes("主角在密林遭遇刺客"), "Writer user prompt 含 beat");
  assert(writerUser.includes("林晚踏入云岭"), "Writer user prompt 含 chapterSoFar");
  assert(writerUser.includes("对话再含蓄一点"), "Writer user prompt 含用户介入");
  assert(writerUser.includes("上段主角说话太冷漠"), "Writer user prompt 含上段 critic");
  assert(writerUser.includes("400"), "Writer user prompt 含 targetLength");

  const criticUser = buildCriticUser({
    segmentText: "测试段落",
    segmentIndex: 0,
    beat: "测试 beat",
    userIdeas: "测试思路",
    characters: [],
    worldEntries: [],
    recentCorrections: [],
  });
  assert(criticUser.includes("测试段落"), "Critic user prompt 含被审段落");
  assert(criticUser.includes("测试 beat"), "Critic user prompt 含 beat");
  assert(criticUser.includes("测试思路"), "Critic user prompt 含用户思路");
}

function main() {
  console.log("=== M7 verify:auto-writer ===");
  testParseFindings();
  testShouldRewrite();
  testSummarize();
  testFindingsToMarkdown();
  testRoleResolver();
  testPromptBuilders();
  console.log(`\n共 ${total} 项断言，通过 ${total - failed} / 失败 ${failed}`);
  if (failed > 0) {
    console.error("\x1b[31mauto-writer-engine 验证失败\x1b[0m");
    process.exit(1);
  } else {
    console.log("\x1b[32mauto-writer-engine 验证通过\x1b[0m");
  }
}

main();
