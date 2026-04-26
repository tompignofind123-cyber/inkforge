#!/usr/bin/env node
/**
 * M4-H 验收脚本：review-engine 纯逻辑
 * 无 Electron，仅断言 builtin prompt / parseFindingsFromLlm / computeReportSummary / findExcerptRange。
 *
 * 运行：pnpm --filter @inkforge/desktop run verify:review-engine
 * 前置：先跑 pnpm build 确保 packages/review-engine/dist 就绪。
 */
const {
  BUILTIN_DIMENSION_SPECS,
  computeReportSummary,
  findExcerptRange,
  getBuiltinPromptSpec,
  parseFindingsFromLlm,
} = require("@inkforge/review-engine");

let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
  } else {
    console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
    failed += 1;
  }
}

function testBuiltinSpecs() {
  const ids = BUILTIN_DIMENSION_SPECS.map((s) => s.id).sort().join(",");
  assert(
    ids ===
      "consistency-character,consistency-timeline,foreshadowing,style,worldbuilding",
    `builtin spec 恰好 5 条（${ids}）`,
  );
  for (const spec of BUILTIN_DIMENSION_SPECS) {
    const lookup = getBuiltinPromptSpec(spec.id);
    assert(lookup === spec, `getBuiltinPromptSpec(${spec.id}) 与注册表一致`);
    const system = spec.systemPrompt({ characters: [], worldEntries: [] });
    assert(typeof system === "string" && system.length > 50, `${spec.id} system 非空`);
    assert(
      system.includes("severity") && system.includes("excerpt"),
      `${spec.id} system 说明 JSON 字段`,
    );
    const user = spec.userPrompt({
      chapterTitle: "第 1 章",
      chapterText: "这是一段测试正文。".repeat(10),
    });
    assert(user.includes("第 1 章"), `${spec.id} user 包含章节标题`);
  }

  const characterSpec = getBuiltinPromptSpec("consistency-character");
  const withRoster = characterSpec.systemPrompt({
    characters: [
      {
        name: "林晚",
        persona: "温和内敛",
        traits: ["剑法", "家国"],
        backstory: "自幼修道",
      },
    ],
  });
  assert(
    withRoster.includes("林晚") && withRoster.includes("温和内敛"),
    "人物一致性 dim 把 roster 注入 system",
  );

  const worldSpec = getBuiltinPromptSpec("worldbuilding");
  const withCanon = worldSpec.systemPrompt({
    worldEntries: [{ title: "青松门", aliases: ["松谷"], content: "剑宗大派" }],
  });
  assert(
    withCanon.includes("青松门") && withCanon.includes("松谷"),
    "世界观 dim 把条目 title + alias 注入 system",
  );
}

function testParseFindings() {
  const raw = [
    "模型有时会加一些说明，不应干扰解析。",
    "[",
    '  {"severity":"warn","excerpt":"林晚说了一句口语化的话","suggestion":"改回古雅语气"},',
    '  {"severity":"unknown","excerpt":"","suggestion":""},',
    '  {"severity":"error","excerpt":"时间线矛盾：前章明明是深秋","suggestion":"统一为冬日"}',
    "]",
    "以上是 JSON。",
  ].join("\n");
  const drafts = parseFindingsFromLlm(raw, "warn");
  assert(drafts.length === 2, `仅保留非空 draft（${drafts.length}）`);
  assert(drafts[0].severity === "warn", "draft[0] severity warn");
  assert(drafts[1].severity === "error", "draft[1] severity error");

  const fallbackDrafts = parseFindingsFromLlm(
    '[{"severity":"bogus","excerpt":"abc","suggestion":"fix it"}]',
    "info",
  );
  assert(
    fallbackDrafts.length === 1 && fallbackDrafts[0].severity === "info",
    "非法 severity 用 fallback",
  );

  assert(parseFindingsFromLlm("no json here", "warn").length === 0, "无 JSON 返回空");
  assert(parseFindingsFromLlm("", "warn").length === 0, "空串返回空");

  const longExcerpt = "a".repeat(500);
  const clamped = parseFindingsFromLlm(
    `[{"severity":"info","excerpt":"${longExcerpt}","suggestion":"ok"}]`,
    "warn",
  );
  assert(
    clamped.length === 1 && clamped[0].excerpt.length <= 400,
    "excerpt 超长被截断到 400",
  );
}

function testComputeSummary() {
  const findings = [
    { severity: "warn", dimensionId: "d1", chapterId: "c1" },
    { severity: "warn", dimensionId: "d1", chapterId: "c1" },
    { severity: "error", dimensionId: "d2", chapterId: "c2" },
    { severity: "info", dimensionId: "d2", chapterId: null },
  ];
  const summary = computeReportSummary(findings);
  assert(summary.totals.warn === 2, `warn 合计 2（${summary.totals.warn}）`);
  assert(summary.totals.error === 1, `error 合计 1（${summary.totals.error}）`);
  assert(summary.totals.info === 1, `info 合计 1（${summary.totals.info}）`);
  const d1 = summary.perDimension.find((x) => x.dimensionId === "d1");
  assert(d1 && d1.count === 2, "d1 维度命中 2");
  const c1 = summary.perChapter.find((x) => x.chapterId === "c1");
  assert(c1 && c1.count === 2, "c1 章节命中 2");
  assert(
    !summary.perChapter.some((x) => x.chapterId === null),
    "null chapterId 不在 perChapter",
  );

  const empty = computeReportSummary([]);
  assert(
    empty.totals.warn === 0 && empty.perDimension.length === 0,
    "空数组返回 0 计数",
  );
}

function testFindExcerptRange() {
  const text = "林晚望向远处的山脊，心中默念着师尊的话。";
  const range = findExcerptRange(text, "望向远处的山脊");
  assert(
    range && range.start > 0 && range.end === range.start + "望向远处的山脊".length,
    `正常匹配 (${range?.start}, ${range?.end})`,
  );
  assert(findExcerptRange(text, "不存在的片段") === null, "找不到返回 null");
  assert(findExcerptRange(text, "") === null, "空 needle 返回 null");
  assert(findExcerptRange(text, "   ") === null, "纯空白 needle 返回 null");
}

function main() {
  console.log("\n[verify-review-engine] builtin specs + prompt composition");
  testBuiltinSpecs();
  console.log("\n[verify-review-engine] parseFindingsFromLlm tolerance");
  testParseFindings();
  console.log("\n[verify-review-engine] computeReportSummary roll-up");
  testComputeSummary();
  console.log("\n[verify-review-engine] findExcerptRange location");
  testFindExcerptRange();

  if (failed > 0) {
    console.error(`\n\x1b[31m${failed} 项断言失败\x1b[0m`);
    process.exit(1);
  }
  console.log("\n\x1b[32mreview-engine 纯逻辑验证通过\x1b[0m");
}

main();
