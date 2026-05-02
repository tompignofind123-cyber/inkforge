import type { OocFinding } from "./types";

/**
 * 解析 LLM 输出的 findings JSON。容错：
 * - 接受字符串里裹着 markdown 代码块
 * - 接受非数组（包成数组）
 * - 字段缺失时按 'warn' / 空字符串兜底
 * - 解析失败返回 [] 而非抛错（不阻塞流程）
 */
export function parseFindings(raw: string): OocFinding[] {
  if (!raw || !raw.trim()) return [];
  let text = raw.trim();

  // 去掉 ```json ... ``` 包裹
  const codeBlock = text.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/);
  if (codeBlock) text = codeBlock[1].trim();

  // 找到第一个 [ 与最后一个 ]，截取数组
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    if (parsed && typeof parsed === "object") {
      parsed = [parsed];
    } else {
      return [];
    }
  }

  const findings: OocFinding[] = [];
  for (const item of parsed as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const severityRaw = String(obj.severity ?? "warn").toLowerCase();
    const severity: OocFinding["severity"] =
      severityRaw === "error" || severityRaw === "info" ? severityRaw : "warn";
    findings.push({
      severity,
      excerpt: String(obj.excerpt ?? "").slice(0, 200),
      suggestion: String(obj.suggestion ?? "").slice(0, 400),
    });
  }
  return findings;
}

/** 把 findings 渲染成中文 markdown 喂回 Writer / Reflector。 */
export function findingsToMarkdown(findings: OocFinding[]): string {
  if (findings.length === 0) return "（通过，无需修改）";
  return findings
    .map((f, idx) => {
      const tag =
        f.severity === "error" ? "🔴 错误" : f.severity === "warn" ? "🟡 警告" : "🔵 提示";
      return `${idx + 1}. ${tag}\n   原文：${f.excerpt}\n   建议：${f.suggestion}`;
    })
    .join("\n");
}

/** 决定是否需要回炉重写：error 任何一条，或 warn 数量 >= 阈值。 */
export function shouldRewriteFromFindings(
  findings: OocFinding[],
  options: { warnThreshold?: number } = {},
): boolean {
  const warnThreshold = options.warnThreshold ?? 2;
  let warns = 0;
  for (const f of findings) {
    if (f.severity === "error") return true;
    if (f.severity === "warn") warns += 1;
  }
  return warns >= warnThreshold;
}

/** Critic findings 的简短计数摘要，给 UI 用。 */
export function summarizeFindings(findings: OocFinding[]): {
  errorCount: number;
  warnCount: number;
  infoCount: number;
} {
  const out = { errorCount: 0, warnCount: 0, infoCount: 0 };
  for (const f of findings) {
    if (f.severity === "error") out.errorCount += 1;
    else if (f.severity === "warn") out.warnCount += 1;
    else out.infoCount += 1;
  }
  return out;
}
