import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SampleLibImportResponse,
  SampleLibRecord,
} from "@inkforge/shared";
import { fsApi, sampleLibApi } from "../lib/api";
import { useAppStore } from "../stores/app-store";

export function SampleLibPanel(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const queryClient = useQueryClient();

  const [showImport, setShowImport] = useState<"text" | "epub" | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastImport, setLastImport] = useState<string | null>(null);

  const libsQuery = useQuery({
    queryKey: ["sample-libs", projectId],
    queryFn: () => sampleLibApi.list({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const deleteMutation = useMutation({
    mutationFn: sampleLibApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sample-libs"] }),
  });

  const onImportText = async () => {
    if (!projectId || !title.trim() || !text.trim()) return;
    setBusy(true);
    try {
      const res: SampleLibImportResponse = await sampleLibApi.importText({
        projectId,
        title: title.trim(),
        author: author.trim() || undefined,
        text,
      });
      setLastImport(`✓ 导入成功：《${res.lib.title}》${res.chunkCount} 章`);
      setText("");
      setTitle("");
      setAuthor("");
      setShowImport(null);
      queryClient.invalidateQueries({ queryKey: ["sample-libs"] });
    } catch (err) {
      setLastImport(`✗ 导入失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const onImportEpub = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      const picked = await fsApi.pickFile({
        title: "选择 EPUB",
        filters: [{ name: "EPUB", extensions: ["epub"] }],
      });
      if (!picked.path) {
        setBusy(false);
        return;
      }
      const res: SampleLibImportResponse = await sampleLibApi.importEpub({
        projectId,
        filePath: picked.path,
        title: title.trim() || undefined,
        author: author.trim() || undefined,
      });
      setLastImport(`✓ EPUB 已导入：《${res.lib.title}》${res.chunkCount} 章`);
      setTitle("");
      setAuthor("");
      setShowImport(null);
      queryClient.invalidateQueries({ queryKey: ["sample-libs"] });
    } catch (err) {
      setLastImport(`✗ EPUB 导入失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (lib: SampleLibRecord) => {
    if (!confirm(`删除参考库《${lib.title}》及其 ${lib.chunkCount} 章节？`)) return;
    deleteMutation.mutate({ libId: lib.id });
  };

  if (!projectId) {
    return <p className="text-xs text-ink-500">请先打开一个项目</p>;
  }

  const libs = libsQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <button
          className="rounded-md border border-ink-600 px-3 py-1 text-ink-200 hover:bg-ink-700"
          onClick={() => setShowImport("text")}
        >
          + 粘贴 TXT
        </button>
        <button
          className="rounded-md border border-ink-600 px-3 py-1 text-ink-200 hover:bg-ink-700"
          onClick={() => setShowImport("epub")}
        >
          + 选择 EPUB 文件
        </button>
        <span className="ml-auto text-ink-500">写作时 AI 自动从中召回</span>
      </div>

      {showImport === "text" ? (
        <div className="space-y-2 rounded-md border border-ink-700 p-3">
          <input
            type="text"
            placeholder="书名（必填）"
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="text"
            placeholder="作者（可选）"
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
          <textarea
            placeholder="粘贴小说全文，自动按「第 X 章」拆章"
            className="h-32 w-full resize-y rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex gap-2 text-xs">
            <button
              className="rounded-md bg-amber-500 px-3 py-1 font-medium text-ink-900 hover:bg-amber-400 disabled:opacity-50"
              disabled={busy || !title.trim() || !text.trim()}
              onClick={onImportText}
            >
              {busy ? "导入中…" : "确认导入"}
            </button>
            <button
              className="rounded-md border border-ink-600 px-3 py-1 text-ink-300 hover:bg-ink-700"
              onClick={() => setShowImport(null)}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      {showImport === "epub" ? (
        <div className="space-y-2 rounded-md border border-ink-700 p-3">
          <input
            type="text"
            placeholder="书名（留空读 EPUB 元数据）"
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="text"
            placeholder="作者（留空读 EPUB 元数据）"
            className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
          <div className="flex gap-2 text-xs">
            <button
              className="rounded-md bg-amber-500 px-3 py-1 font-medium text-ink-900 hover:bg-amber-400 disabled:opacity-50"
              disabled={busy}
              onClick={onImportEpub}
            >
              {busy ? "导入中…" : "选择文件并导入"}
            </button>
            <button
              className="rounded-md border border-ink-600 px-3 py-1 text-ink-300 hover:bg-ink-700"
              onClick={() => setShowImport(null)}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      {lastImport ? (
        <p
          className={`text-xs ${lastImport.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}
        >
          {lastImport}
        </p>
      ) : null}

      {libs.length === 0 ? (
        <p className="text-xs text-ink-500">尚无参考库。导入小说后写作时 AI 会自动从中召回相关节选。</p>
      ) : (
        <ul className="divide-y divide-ink-700 rounded-md border border-ink-700 text-xs">
          {libs.map((lib) => (
            <li key={lib.id} className="flex items-center justify-between p-2">
              <div>
                <div className="font-medium text-ink-100">{lib.title}</div>
                <div className="text-ink-500">
                  {lib.author ? `${lib.author} · ` : ""}{lib.chunkCount} 章
                </div>
              </div>
              <button
                className="rounded-md border border-red-500/40 px-2 py-1 text-red-400 hover:bg-red-500/10"
                onClick={() => handleDelete(lib)}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
