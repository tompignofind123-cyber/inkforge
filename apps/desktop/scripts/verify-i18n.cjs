#!/usr/bin/env node
/**
 * M6-B 验收：i18n 资源一致性
 *
 * 断言：
 *   - 每个 key 都有 zh/en/ja 三语
 *   - 翻译值非空
 *   - 占位符 {{var}} 在三语中数量与命名一致
 *   - t() 回退到 zh，未知 key 返回 key 本身
 *   - coerceLang 拒绝非法 Lang
 *
 * 运行：pnpm --filter @inkforge/desktop run verify:i18n
 * 前置：先 pnpm --filter @inkforge/shared build 让 dist 就绪。
 */
const { i18nResources, listI18nKeys, t, coerceLang, SUPPORTED_LANGS, getAnalysisThreshold, countUnits, computeWordStats } =
  require("@inkforge/shared");

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
  } else {
    failed += 1;
    console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  }
}

function extractVars(s) {
  const out = new Set();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(s)) !== null) out.add(m[1]);
  return out;
}

function testResourceCoverage() {
  const keys = listI18nKeys();
  assert(keys.length >= 40, `资源键 ≥ 40（实际 ${keys.length}）`);
  let missingCount = 0;
  let emptyCount = 0;
  for (const key of keys) {
    const entry = i18nResources[key];
    for (const lang of SUPPORTED_LANGS) {
      if (typeof entry[lang] !== "string") missingCount += 1;
      else if (!entry[lang].trim()) emptyCount += 1;
    }
  }
  assert(missingCount === 0, `所有 key 三语齐全（缺失 ${missingCount}）`);
  assert(emptyCount === 0, `三语翻译非空（空值 ${emptyCount}）`);
}

function testPlaceholderConsistency() {
  let mismatches = 0;
  for (const [key, entry] of Object.entries(i18nResources)) {
    const zhVars = extractVars(entry.zh);
    for (const lang of SUPPORTED_LANGS) {
      if (lang === "zh") continue;
      const langVars = extractVars(entry[lang]);
      if (zhVars.size !== langVars.size) {
        mismatches += 1;
        console.error(`  [${key}] zh 占位符数 ${zhVars.size} vs ${lang} ${langVars.size}`);
        continue;
      }
      for (const v of zhVars) {
        if (!langVars.has(v)) {
          mismatches += 1;
          console.error(`  [${key}] ${lang} 缺占位符 {{${v}}}`);
        }
      }
    }
  }
  assert(mismatches === 0, `占位符命名在三语一致（差异 ${mismatches}）`);
}

function testTFallback() {
  assert(t("common.save", "zh") === "保存", "t(common.save, zh) = 保存");
  assert(t("common.save", "en") === "Save", "t(common.save, en) = Save");
  assert(t("common.save", "ja") === "保存", "t(common.save, ja) = 保存");
  assert(t("nonexistent.key", "en") === "nonexistent.key", "未知 key 回退为 key 本身");
}

function testPlaceholder() {
  const s = t("settings.analysisThresholdHint", "zh", { n: 300 });
  assert(s.includes("300") && !s.includes("{{n}}"), `{{n}} 被替换（${s}）`);
  const s2 = t("settings.analysisThresholdHint", "en", { n: 400 });
  assert(s2.includes("400") && !s2.includes("{{n}}"), `英文占位符替换正常（${s2}）`);
}

function testLangCoerce() {
  assert(coerceLang("zh") === "zh", "coerceLang(zh) = zh");
  assert(coerceLang("ja") === "ja", "coerceLang(ja) = ja");
  assert(coerceLang("en") === "en", "coerceLang(en) = en");
  assert(coerceLang("fr") === "zh", "coerceLang(fr) 回退为 zh");
  assert(coerceLang(undefined) === "zh", "coerceLang(undefined) 回退为 zh");
  assert(coerceLang(null, "en") === "en", "coerceLang 自定义 fallback");
}

function testAnalysisThreshold() {
  assert(getAnalysisThreshold("zh") === 200, "中文阈值 200");
  assert(getAnalysisThreshold("en") === 400, "英文阈值 400");
  assert(getAnalysisThreshold("ja") === 500, "日文阈值 500");
}

function testCountUnits() {
  assert(countUnits("Hello world foo bar", "en") === 4, "英文按词计数 = 4");
  assert(countUnits("", "zh") === 0, "空串计数 = 0");
  const n = countUnits("林晚望向远处", "zh");
  assert(n === 6, `中文按字计数 = 6（实际 ${n}）`);
}

function testWordStats() {
  const s = computeWordStats("林晚说：Hello world");
  assert(s.cjk === 3, `CJK 字数 = 3（实际 ${s.cjk}）`);
  assert(s.en === 2, `英文词数 = 2（实际 ${s.en}）`);
  assert(s.tokens > 0, "token 估算 > 0");
}

console.log("=== M6-B verify:i18n ===\n");
testResourceCoverage();
testPlaceholderConsistency();
testTFallback();
testPlaceholder();
testLangCoerce();
testAnalysisThreshold();
testCountUnits();
testWordStats();

const total = passed + failed;
console.log(`\n共 ${total} 项断言，通过 ${passed} / 失败 ${failed}`);
if (failed > 0) process.exit(1);
