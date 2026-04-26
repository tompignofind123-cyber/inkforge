import { Component, type ErrorInfo, type ReactNode } from "react";
import { t, coerceLang, type Lang } from "@inkforge/shared";

interface ErrorBoundaryProps {
  /** Human name shown in the title, e.g. "Editor" / "Review". */
  label?: string;
  /** UI language; defaults to zh. */
  lang?: Lang;
  /** Optional custom fallback renderer. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Children to guard. */
  children: ReactNode;
  /** Called when an error is caught (for local logging). */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
  showDetails: boolean;
}

/**
 * Catches render-time errors inside a subtree and shows a friendly fallback
 * with stack details + "copy diagnostic" action. Global + per-page usage is
 * the M6-D convention: never let a broken route white-screen the whole app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, showDetails: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep local logging cheap; main process handles persistence.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", this.props.label ?? "root", error, info);
    this.props.onError?.(error, info);
  }

  private reset = (): void => {
    this.setState({ error: null, showDetails: false });
  };

  private toggleDetails = (): void => {
    this.setState((s) => ({ showDetails: !s.showDetails }));
  };

  private copyDiag = async (): Promise<void> => {
    try {
      const bridge = (window as unknown as { inkforge?: { diag?: { snapshot?: (p: object) => Promise<{ text: string }> } } }).inkforge;
      const snap = await bridge?.diag?.snapshot?.({});
      const payload = [
        `Label: ${this.props.label ?? "root"}`,
        `Error: ${this.state.error?.message ?? "unknown"}`,
        "",
        "Stack:",
        this.state.error?.stack ?? "(no stack)",
        "",
        "Diag:",
        snap?.text ?? "(diag unavailable)",
      ].join("\n");
      await navigator.clipboard.writeText(payload);
    } catch {
      // best-effort; clipboard may fail in headless env.
    }
  };

  render(): ReactNode {
    const { error, showDetails } = this.state;
    const { children, fallback, label, lang } = this.props;
    if (!error) return children;

    if (fallback) return fallback(error, this.reset);

    const l = coerceLang(lang);
    const title = t("error.boundary.title", l);
    const retry = t("common.retry", l);
    const copyDiag = t("error.boundary.copyDiag", l);
    const shortDesc = `${label ? `[${label}] ` : ""}${error.message || "unknown error"}`;

    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="max-w-lg rounded-lg border border-red-900/60 bg-red-950/40 p-5 text-sm text-ink-100 shadow-lg">
          <div className="mb-2 text-base font-semibold text-red-300">{title}</div>
          <div className="mb-3 text-ink-300">{shortDesc}</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded border border-ink-600 bg-ink-800 px-3 py-1 text-xs hover:bg-ink-700"
              onClick={this.reset}
            >
              {retry}
            </button>
            <button
              type="button"
              className="rounded border border-ink-600 bg-ink-800 px-3 py-1 text-xs hover:bg-ink-700"
              onClick={this.copyDiag}
            >
              {copyDiag}
            </button>
            <button
              type="button"
              className="rounded px-2 py-1 text-xs text-ink-400 hover:text-ink-200"
              onClick={this.toggleDetails}
            >
              {showDetails ? "▾" : "▸"} stack
            </button>
          </div>
          {showDetails && (
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-ink-900/80 p-2 font-mono text-[11px] leading-relaxed text-ink-300">
              {error.stack ?? error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
