#!/usr/bin/env node
/**
 * M6-A 验收：provider 矩阵单元断言（无网络，mock 上游响应）
 *
 * 覆盖：
 *   - OpenAI SSE 解析（delta / done / [DONE] / finish_reason）
 *   - Gemini JSON stream 解析（candidates.content.parts / finishReason）
 *   - OpenAICompat 走 openai-compat vendor tag
 *   - registry.createProvider 按 vendor 正确路由
 *
 * 运行：pnpm --filter @inkforge/desktop run verify:provider
 * 前置：先 pnpm build 让 llm-core 产 dist。
 */
const {
  OpenAIProvider,
  OpenAICompatProvider,
  GeminiProvider,
  AnthropicProvider,
  createProvider,
} = require("@inkforge/llm-core");

let failed = 0;
let passed = 0;

function assert(condition, msg) {
  if (condition) {
    passed += 1;
    console.log(`\x1b[32m✓ ${msg}\x1b[0m`);
  } else {
    failed += 1;
    console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  }
}

function makeStreamFromChunks(strChunks) {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= strChunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(strChunks[i]));
      i += 1;
    },
  });
}

function fakeFetch(responseFactory) {
  globalThis.__lastFetchInit = null;
  globalThis.fetch = async (url, init) => {
    globalThis.__lastFetchInit = { url, init };
    return responseFactory(url, init);
  };
}

function okResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body,
    text: async () => "",
  };
}

function errResponse(status, text) {
  return {
    ok: false,
    status,
    statusText: "Err",
    body: null,
    text: async () => text,
  };
}

async function collect(stream) {
  const out = [];
  for await (const c of stream) out.push(c);
  return out;
}

async function testOpenAIDelta() {
  const chunk1 =
    'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":" world"}}]}\n\n';
  const chunk2 = 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';

  fakeFetch(() => okResponse(makeStreamFromChunks([chunk1, chunk2])));
  const p = new OpenAIProvider({
    id: "p",
    label: "P",
    baseUrl: "https://example.com",
    apiKey: "sk-x",
    defaultModel: "gpt-4o-mini",
  });
  const chunks = await collect(
    p.complete({ messages: [{ role: "user", content: "hi" }] }),
  );
  const text = chunks
    .filter((c) => c.type === "delta")
    .map((c) => c.textDelta)
    .join("");
  assert(text === "Hello world", `OpenAI SSE 拼接 delta（实际 "${text}"）`);
  assert(
    chunks.some((c) => c.type === "done"),
    "OpenAI 流产生 done 事件",
  );
  assert(
    chunks.every((c) => c.vendor === "openai"),
    "OpenAI chunks vendor = openai",
  );
}

async function testOpenAIError() {
  fakeFetch(() => errResponse(401, "Unauthorized"));
  const p = new OpenAIProvider({
    id: "p",
    label: "P",
    baseUrl: "https://example.com",
    apiKey: "sk-bad",
    defaultModel: "gpt-4o-mini",
  });
  const chunks = await collect(
    p.complete({ messages: [{ role: "user", content: "hi" }] }),
  );
  const err = chunks.find((c) => c.type === "error");
  assert(!!err, "OpenAI 401 → error chunk");
  assert(
    err && /HTTP 401/.test(err.error || ""),
    "OpenAI error 包含 HTTP 状态",
  );
}

async function testOpenAIAuthHeader() {
  fakeFetch(() => okResponse(makeStreamFromChunks(["data: [DONE]\n\n"])));
  const p = new OpenAIProvider({
    id: "p",
    label: "P",
    baseUrl: "https://example.com/v1/",
    apiKey: "sk-xyz",
    defaultModel: "gpt-4o-mini",
  });
  await collect(p.complete({ messages: [{ role: "user", content: "hi" }] }));
  const init = globalThis.__lastFetchInit;
  const auth = init?.init?.headers?.Authorization;
  assert(
    auth === "Bearer sk-xyz",
    `OpenAI Authorization header 正确（实际 "${auth}"）`,
  );
  assert(
    init.url === "https://example.com/v1/chat/completions",
    `OpenAI URL 拼接且规范化尾斜杠（实际 "${init.url}"）`,
  );
}

async function testOpenAICompat() {
  fakeFetch(() => okResponse(makeStreamFromChunks(['data: {"choices":[{"delta":{"content":"X"}}]}\n\ndata: [DONE]\n\n'])));
  const p = new OpenAICompatProvider({
    id: "p",
    label: "P",
    baseUrl: "https://deepseek.example/v1",
    apiKey: "sk-c",
    defaultModel: "deepseek-chat",
  });
  const chunks = await collect(
    p.complete({ messages: [{ role: "user", content: "hi" }] }),
  );
  assert(
    chunks.filter((c) => c.type === "delta")[0]?.vendor === "openai-compat",
    "OpenAICompat chunks vendor = openai-compat",
  );
}

async function testOpenAICompatRequiresBaseUrl() {
  let thrown = false;
  try {
    new OpenAICompatProvider({
      id: "p",
      label: "P",
      baseUrl: "",
      apiKey: "sk",
      defaultModel: "m",
    });
  } catch (err) {
    thrown = true;
    assert(
      /baseUrl/i.test(String(err && err.message)),
      "OpenAICompat 空 baseUrl 抛明确错误",
    );
  }
  assert(thrown, "OpenAICompat 拒绝空 baseUrl");
}

async function testGeminiParse() {
  const chunk1 =
    'data: {"candidates":[{"content":{"parts":[{"text":"你好"}]}}]}\n\n' +
    'data: {"candidates":[{"content":{"parts":[{"text":"，世界"}]},"finishReason":"STOP"}]}\n\n';
  fakeFetch(() => okResponse(makeStreamFromChunks([chunk1])));
  const p = new GeminiProvider({
    id: "p",
    label: "P",
    baseUrl: "https://gemini.example/v1beta",
    apiKey: "AIzaSy",
    defaultModel: "gemini-1.5-pro",
  });
  const chunks = await collect(
    p.complete({ messages: [{ role: "user", content: "hi" }] }),
  );
  const text = chunks
    .filter((c) => c.type === "delta")
    .map((c) => c.textDelta)
    .join("");
  assert(text === "你好，世界", `Gemini JSON 流 delta 拼接（实际 "${text}"）`);
  assert(
    chunks.find((c) => c.type === "done"),
    "Gemini 产生 done 事件",
  );
  assert(
    chunks.every((c) => c.vendor === "gemini"),
    "Gemini chunks vendor = gemini",
  );
}

async function testGeminiSystemInstruction() {
  fakeFetch(() => okResponse(makeStreamFromChunks(["data: {}\n\n"])));
  const p = new GeminiProvider({
    id: "p",
    label: "P",
    baseUrl: "https://gemini.example/v1beta",
    apiKey: "AIzaSy",
    defaultModel: "gemini-1.5-pro",
  });
  await collect(
    p.complete({
      systemPrompt: "你是小说编辑",
      messages: [{ role: "user", content: "帮我润色" }],
    }),
  );
  const init = globalThis.__lastFetchInit;
  const body = JSON.parse(init.init.body);
  assert(
    body.systemInstruction?.parts?.[0]?.text === "你是小说编辑",
    "Gemini systemPrompt → systemInstruction",
  );
  assert(
    body.contents?.[0]?.role === "user" && body.contents?.[0]?.parts?.[0]?.text === "帮我润色",
    "Gemini user message → contents[0]",
  );
  assert(
    init.url.includes("alt=sse") && init.url.includes("key=AIzaSy"),
    "Gemini URL 含 alt=sse 与 key",
  );
}

function testRegistryRouting() {
  const a = createProvider({
    id: "a",
    label: "A",
    vendor: "anthropic",
    baseUrl: "",
    apiKey: "k",
    defaultModel: "claude-opus",
  });
  assert(a instanceof AnthropicProvider, "registry.anthropic → AnthropicProvider");

  const o = createProvider({
    id: "o",
    label: "O",
    vendor: "openai",
    baseUrl: "",
    apiKey: "k",
    defaultModel: "gpt-4o-mini",
  });
  assert(
    o instanceof OpenAIProvider && !(o instanceof OpenAICompatProvider),
    "registry.openai → OpenAIProvider（非 compat）",
  );
  assert(o.vendor === "openai", "registry.openai 实例 vendor = openai");

  const c = createProvider({
    id: "c",
    label: "C",
    vendor: "openai-compat",
    baseUrl: "https://x.example/v1",
    apiKey: "k",
    defaultModel: "local",
  });
  assert(c instanceof OpenAICompatProvider, "registry.openai-compat → OpenAICompatProvider");
  assert(c.vendor === "openai-compat", "compat 实例 vendor = openai-compat");

  const g = createProvider({
    id: "g",
    label: "G",
    vendor: "gemini",
    baseUrl: "",
    apiKey: "k",
    defaultModel: "gemini-1.5-pro",
  });
  assert(g instanceof GeminiProvider, "registry.gemini → GeminiProvider");

  let thrown = false;
  try {
    createProvider({
      id: "x",
      label: "X",
      vendor: "unknown",
      baseUrl: "",
      apiKey: "",
      defaultModel: "",
    });
  } catch {
    thrown = true;
  }
  assert(thrown, "registry 拒绝未知 vendor");
}

function testTokenEstimate() {
  const p = new OpenAIProvider({
    id: "p",
    label: "P",
    baseUrl: "",
    apiKey: "k",
    defaultModel: "gpt-4o-mini",
  });
  assert(p.estimateTokens("") === 0, "estimate 空串 = 0");
  assert(p.estimateTokens("abcd") === 1, "estimate 4 字符 = 1 token");
  const g = new GeminiProvider({
    id: "g",
    label: "G",
    baseUrl: "",
    apiKey: "k",
    defaultModel: "gemini-1.5-pro",
  });
  assert(g.estimateTokens("abcd") === 1, "Gemini estimate 4 字符 = 1 token");
}

(async () => {
  console.log("=== M6-A verify:provider ===\n");
  try {
    testRegistryRouting();
    testTokenEstimate();
    await testOpenAIDelta();
    await testOpenAIError();
    await testOpenAIAuthHeader();
    await testOpenAICompat();
    await testOpenAICompatRequiresBaseUrl();
    await testGeminiParse();
    await testGeminiSystemInstruction();
  } catch (err) {
    failed += 1;
    console.error(`\x1b[31m✗ unexpected error: ${err.stack || err.message || err}\x1b[0m`);
  }

  const total = passed + failed;
  console.log(`\n共 ${total} 项断言，通过 ${passed} / 失败 ${failed}`);
  if (failed > 0) process.exit(1);
})();
