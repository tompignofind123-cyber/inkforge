#!/usr/bin/env node
/**
 * Provider catalog verification:
 *   1) Each entry has the required fields and a stable id
 *   2) ids are unique
 *   3) baseUrl is non-empty for non-custom entries (vllm is the explicit exception)
 *   4) defaultModel ∈ knownModels (or both empty for the custom entry)
 *   5) vendor ∈ ProviderVendor union
 *   6) every catalog entry routes through `createProvider` without throwing
 *
 * 运行：pnpm --filter @inkforge/desktop run verify:catalog
 * 前置：pnpm build 让 packages/shared/dist 与 packages/llm-core/dist 就绪
 */
const { PROVIDER_CATALOG } = require("@inkforge/shared");
const { createProvider } = require("@inkforge/llm-core");

const KNOWN_VENDORS = new Set(["anthropic", "openai", "gemini", "openai-compat"]);

let pass = 0;
let fail = 0;

function ok(msg) {
  console.log("\x1b[32m✓\x1b[0m " + msg);
  pass++;
}
function bad(msg) {
  console.log("\x1b[31m✗\x1b[0m " + msg);
  fail++;
}

function main() {
  console.log(`[verify:catalog] entries: ${PROVIDER_CATALOG.length}`);

  if (PROVIDER_CATALOG.length < 15) {
    bad(`expected at least 15 catalog entries, got ${PROVIDER_CATALOG.length}`);
  } else {
    ok(`catalog has ${PROVIDER_CATALOG.length} entries`);
  }

  const seen = new Set();
  for (const entry of PROVIDER_CATALOG) {
    const tag = `[${entry.id}]`;

    if (!entry.id || typeof entry.id !== "string") {
      bad(`${tag} missing id`);
      continue;
    }
    if (seen.has(entry.id)) bad(`${tag} duplicate id`);
    else seen.add(entry.id);

    if (!entry.label) bad(`${tag} missing label`);
    if (!KNOWN_VENDORS.has(entry.vendor)) bad(`${tag} unknown vendor: ${entry.vendor}`);
    if (typeof entry.description !== "string" || entry.description.length === 0) {
      bad(`${tag} missing description`);
    }
    if (!Array.isArray(entry.knownModels)) bad(`${tag} knownModels not an array`);

    const isCustomPlaceholder = entry.id === "vllm";
    if (!isCustomPlaceholder) {
      if (!entry.baseUrl) bad(`${tag} empty baseUrl (only the custom 'vllm' entry may be blank)`);
      if (!entry.defaultModel) bad(`${tag} empty defaultModel`);
      if (entry.knownModels.length > 0 && !entry.knownModels.includes(entry.defaultModel)) {
        bad(`${tag} defaultModel '${entry.defaultModel}' not in knownModels`);
      }
    }
  }

  // Smoke-test instantiation. Use a fake key — adapters should construct
  // without making any network calls at construct time.
  for (const entry of PROVIDER_CATALOG) {
    if (entry.id === "vllm") continue; // requires user-supplied baseUrl
    try {
      const provider = createProvider({
        id: entry.id,
        label: entry.label,
        vendor: entry.vendor,
        baseUrl: entry.baseUrl,
        apiKey: "test-key-not-used",
        defaultModel: entry.defaultModel,
      });
      if (!provider) {
        bad(`[${entry.id}] createProvider returned falsy`);
      } else {
        ok(`[${entry.id}] instantiates via ${entry.vendor} adapter`);
      }
    } catch (err) {
      bad(`[${entry.id}] createProvider threw: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n共 ${pass + fail} 项断言，通过 ${pass} / 失败 ${fail}`);
  if (fail > 0) {
    console.error("\x1b[31mProvider catalog 验证失败\x1b[0m");
    process.exit(1);
  }
  console.log("\x1b[32mProvider catalog 验证通过\x1b[0m");
}

main();
