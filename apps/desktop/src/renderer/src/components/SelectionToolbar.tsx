import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Editor } from "@tiptap/react";
import type {
  LLMQuickActionInput,
  LLMQuickActionKind,
  LLMQuickActionResponse,
  SkillDefinition,
} from "@inkforge/shared";
import { llmApi, skillApi } from "../lib/api";

const CONTEXT_WINDOW = 400;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ActionDef {
  kind: LLMQuickActionKind;
  label: string;
  tip: string;
  placement: "inline-replace" | "insert-after" | "timeline" | "options";
}

const ACTIONS: ActionDef[] = [
  { kind: "polish", label: "润色", tip: "优化遣词节奏，不改情节", placement: "inline-replace" },
  { kind: "critique", label: "审查", tip: "送到 AI 时间线，指出问题", placement: "timeline" },
  { kind: "continue", label: "续写", tip: "接在选区之后自然延展", placement: "insert-after" },
  { kind: "rephrase", label: "代入", tip: "换语气改写，给出 3 种", placement: "options" },
];

interface SelectionToolbarProps {
  editor: Editor | null;
  projectId?: string;
  chapterId?: string;
  chapterTitle?: string;
  providerId?: string | null;
  onPushFeedback?: (text: string, kind: string) => void;
  onAfterApply?: () => void;
}

interface QuickResult {
  kind: LLMQuickActionKind;
  action: ActionDef;
  from: number;
  to: number;
  response?: LLMQuickActionResponse;
  error?: string;
  loading: boolean;
}

export function SelectionToolbar(props: SelectionToolbarProps): JSX.Element | null {
  const { editor, projectId, chapterId, chapterTitle, providerId, onPushFeedback, onAfterApply } = props;
  const [rect, setRect] = useState<Rect | null>(null);
  const [selectionText, setSelectionText] = useState<string>("");
  const [result, setResult] = useState<QuickResult | null>(null);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [skillStatus, setSkillStatus] = useState<string | null>(null);
  const skillMenuRef = useRef<HTMLDivElement | null>(null);
  const activeSkillRunRef = useRef<{ runId: string; skillName: string } | null>(null);

  const selectionSkillsQuery = useQuery({
    queryKey: ["skills", "selection", projectId ?? null],
    queryFn: () => skillApi.list({ enabledOnly: true }),
  });
  const selectionSkills = useMemo<SkillDefinition[]>(() => {
    return (selectionSkillsQuery.data ?? []).filter((skill) =>
      skill.triggers.some((t) => t.type === "selection" && t.enabled),
    );
  }, [selectionSkillsQuery.data]);

  const updatePosition = useCallback(() => {
    if (!editor) {
      setRect(null);
      setSelectionText("");
      return;
    }
    const { state, view } = editor;
    const { from, to, empty } = state.selection;
    if (empty || from === to) {
      setRect(null);
      setSelectionText("");
      return;
    }
    const text = state.doc.textBetween(from, to, "\n", "\n").trim();
    if (!text) {
      setRect(null);
      setSelectionText("");
      return;
    }
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);
    const top = Math.min(start.top, end.top);
    const left = Math.min(start.left, end.left);
    const right = Math.max(start.right, end.right);
    const bottom = Math.max(start.bottom, end.bottom);
    setRect({
      top,
      left,
      width: Math.max(80, right - left),
      height: Math.max(16, bottom - top),
    });
    setSelectionText(text);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => updatePosition();
    editor.on("selectionUpdate", handleUpdate);
    editor.on("blur", () => {
      // Delay so clicking toolbar doesn't kill it
      window.setTimeout(() => {
        if (!editor.isFocused && !document.activeElement?.closest("[data-selection-toolbar]")) {
          setRect(null);
        }
      }, 150);
    });
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      editor.off("selectionUpdate", handleUpdate);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [editor, updatePosition]);

  const contextBefore = useMemo(() => {
    if (!editor) return "";
    const { from } = editor.state.selection;
    const start = Math.max(0, from - CONTEXT_WINDOW);
    return editor.state.doc.textBetween(start, from, "\n", "\n");
  }, [editor, rect]);

  const contextAfter = useMemo(() => {
    if (!editor) return "";
    const { to } = editor.state.selection;
    const end = Math.min(editor.state.doc.content.size, to + CONTEXT_WINDOW);
    return editor.state.doc.textBetween(to, end, "\n", "\n");
  }, [editor, rect]);

  const runAction = async (action: ActionDef) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    setResult({ kind: action.kind, action, from, to, loading: true });
    const input: LLMQuickActionInput = {
      kind: action.kind,
      selectedText: selectionText,
      contextBefore,
      contextAfter,
      providerId: providerId ?? undefined,
      projectId,
      chapterId,
    };
    try {
      const response = await llmApi.quick(input);
      setResult({ kind: action.kind, action, from, to, response, loading: false });
      if (response.status === "completed" && action.placement === "timeline") {
        onPushFeedback?.(response.text ?? "", "critique");
      }
    } catch (err) {
      setResult({
        kind: action.kind,
        action,
        from,
        to,
        error: err instanceof Error ? err.message : String(err),
        loading: false,
      });
    }
  };

  const apply = (text: string) => {
    if (!editor || !result) return;
    const { from, to, action } = result;
    if (action.placement === "inline-replace" || action.placement === "options") {
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .insertContent(text)
        .run();
    } else if (action.placement === "insert-after") {
      editor
        .chain()
        .focus()
        .setTextSelection(to)
        .insertContent((text.startsWith("\n") ? "" : "\n") + text)
        .run();
    }
    onAfterApply?.();
    setResult(null);
  };

  useEffect(() => {
    if (!skillMenuOpen) return;
    const handler = (event: MouseEvent) => {
      if (!skillMenuRef.current) return;
      if (!skillMenuRef.current.contains(event.target as Node)) {
        setSkillMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [skillMenuOpen]);

  useEffect(() => {
    const offDone = skillApi.onDone((payload) => {
      const active = activeSkillRunRef.current;
      if (!active || payload.runId !== active.runId) return;
      if (payload.status === "completed") {
        setSkillStatus(`「${active.skillName}」已写入时间线`);
        onPushFeedback?.("", "skill");
      } else if (payload.status === "failed") {
        setSkillStatus(`「${active.skillName}」失败：${payload.error ?? "unknown"}`);
      } else if (payload.status === "cancelled") {
        setSkillStatus(`「${active.skillName}」已取消`);
      }
      activeSkillRunRef.current = null;
      window.setTimeout(() => setSkillStatus(null), 3500);
    });
    return () => offDone();
  }, [onPushFeedback]);

  const runSelectionSkill = async (skill: SkillDefinition) => {
    if (!editor || !projectId || !chapterId) return;
    setSkillMenuOpen(false);
    setSkillStatus(`「${skill.name}」运行中…`);
    const chapterText = editor.state.doc.textBetween(
      0,
      editor.state.doc.content.size,
      "\n",
      "\n",
    );
    try {
      const response = await skillApi.run({
        skillId: skill.id,
        projectId,
        chapterId,
        chapterTitle: chapterTitle ?? "",
        chapterText,
        selection: selectionText,
        triggerType: "selection",
      });
      activeSkillRunRef.current = { runId: response.runId, skillName: skill.name };
    } catch (err) {
      setSkillStatus(
        `「${skill.name}」启动失败：${err instanceof Error ? err.message : String(err)}`,
      );
      window.setTimeout(() => setSkillStatus(null), 3500);
    }
  };

  if (!rect && !result && !skillStatus) return null;

  return (
    <>
      {rect && (
        <div
          data-selection-toolbar
          className="fixed z-40 flex -translate-x-1/2 gap-1 rounded-lg border border-ink-600 bg-ink-800/95 px-1.5 py-1 text-xs text-ink-100 shadow-xl backdrop-blur"
          style={{
            top: Math.max(8, rect.top - 42),
            left: rect.left + rect.width / 2,
          }}
        >
          {ACTIONS.map((action) => (
            <button
              key={action.kind}
              title={action.tip}
              className="rounded px-2 py-1 hover:bg-ink-700 disabled:opacity-60"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runAction(action)}
              disabled={!!result?.loading}
            >
              {action.label}
            </button>
          ))}
          {selectionSkills.length > 0 && (
            <div ref={skillMenuRef} className="relative">
              <button
                title="运行一个选中文本类 Skill"
                className="flex items-center gap-0.5 rounded px-2 py-1 hover:bg-ink-700 disabled:opacity-60"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setSkillMenuOpen((v) => !v)}
                disabled={!!result?.loading}
              >
                Skill
                <span className="text-[10px] opacity-70">▾</span>
              </button>
              {skillMenuOpen && (
                <div className="absolute left-1/2 top-full z-50 mt-1 w-56 -translate-x-1/2 rounded-md border border-ink-600 bg-ink-800/95 py-1 text-xs shadow-xl backdrop-blur">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-ink-500">
                    选中文本触发
                  </div>
                  {selectionSkills.map((skill) => (
                    <button
                      key={skill.id}
                      className="block w-full truncate px-3 py-1.5 text-left hover:bg-ink-700"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void runSelectionSkill(skill)}
                      title={skill.prompt.slice(0, 120)}
                    >
                      {skill.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <span className="px-1 text-ink-500">|</span>
          <span className="px-1 text-ink-400">{selectionText.length}字</span>
        </div>
      )}
      {skillStatus && !rect && (
        <div
          data-selection-toolbar
          className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-ink-600 bg-ink-800/95 px-3 py-1.5 text-xs text-ink-200 shadow-xl backdrop-blur"
        >
          {skillStatus}
        </div>
      )}
      {result && (
        <ResultPopover result={result} onApply={apply} onClose={() => setResult(null)} />
      )}
    </>
  );
}

interface ResultPopoverProps {
  result: QuickResult;
  onApply: (text: string) => void;
  onClose: () => void;
}

function ResultPopover({ result, onApply, onClose }: ResultPopoverProps): JSX.Element {
  const { action, response, error, loading } = result;
  const title =
    action.kind === "polish"
      ? "润色结果"
      : action.kind === "critique"
        ? "审查意见"
        : action.kind === "continue"
          ? "续写草稿"
          : "代入改写";
  const options = response?.options ?? (response?.text ? [response.text] : []);

  return (
    <div
      data-selection-toolbar
      role="dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-xl border border-ink-600 bg-ink-800 p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
          <button
            className="rounded px-2 py-1 text-xs text-ink-300 hover:bg-ink-700"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        {loading && (
          <div className="py-6 text-center text-sm text-ink-400">Claude 正在生成，请稍候…</div>
        )}
        {!loading && error && <div className="text-sm text-red-400">失败：{error}</div>}
        {!loading && response?.status === "failed" && (
          <div className="text-sm text-red-400">失败：{response.error}</div>
        )}
        {!loading && response?.status === "completed" && options.length > 0 && (
          <ul className="space-y-3">
            {options.map((text, idx) => (
              <li
                key={idx}
                className="rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-2 text-[13px] leading-6 text-ink-100"
              >
                <div className="whitespace-pre-wrap">{text}</div>
                <div className="mt-2 flex items-center justify-between text-xs text-ink-400">
                  <span>
                    {options.length > 1 ? `方案 ${idx + 1}` : ""}
                    {response.durationMs > 0 && ` · ${(response.durationMs / 1000).toFixed(1)}s`}
                  </span>
                  <div className="flex gap-2">
                    <button
                      className="rounded border border-ink-600 px-2 py-1 hover:bg-ink-700"
                      onClick={() => navigator.clipboard.writeText(text)}
                    >
                      复制
                    </button>
                    {action.placement !== "timeline" && (
                      <button
                        className="rounded bg-amber-500 px-2 py-1 font-medium text-ink-900 hover:bg-amber-400"
                        onClick={() => onApply(text)}
                      >
                        {action.placement === "insert-after" ? "追加" : "替换"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
