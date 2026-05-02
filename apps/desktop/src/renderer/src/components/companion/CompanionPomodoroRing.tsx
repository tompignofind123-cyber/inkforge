import { useEffect, useState } from "react";
import { useCompanionStore } from "../../stores/companion-store";

/**
 * 番茄钟控制器：监听 store.pomodoro，每秒 tick 一次。
 * 时间到了自动 advancePomodoro（work → break → work …）。
 *
 * UI：在桌宠 sprite 周围画一个 SVG 倒计时圆环 + 中心剩余分钟。
 */
export function CompanionPomodoroRing(): JSX.Element | null {
  const pomodoro = useCompanionStore((s) => s.pomodoro);
  const advance = useCompanionStore((s) => s.advancePomodoro);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (pomodoro.mode === "idle") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pomodoro.mode]);

  useEffect(() => {
    if (pomodoro.mode === "idle") return;
    const elapsed = (now - pomodoro.startedAt) / 1000;
    if (elapsed >= pomodoro.durationSec) {
      advance();
    }
  }, [now, pomodoro, advance]);

  if (pomodoro.mode === "idle") return null;

  const elapsed = Math.min(
    pomodoro.durationSec,
    Math.max(0, (now - pomodoro.startedAt) / 1000),
  );
  const remaining = Math.max(0, pomodoro.durationSec - elapsed);
  const progress = elapsed / pomodoro.durationSec;
  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60);

  // 圆环参数
  const r = 40;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - progress);
  const stroke = pomodoro.mode === "work" ? "#f97316" : "#10b981";

  return (
    <svg
      viewBox="0 0 100 100"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ transform: "scale(1.55)", transformOrigin: "center" }}
      aria-hidden
    >
      {/* 背景圈 */}
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="3"
      />
      {/* 进度圈 */}
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={dashOffset}
        transform="rotate(-90 50 50)"
        style={{
          filter: `drop-shadow(0 0 4px ${stroke}66)`,
          transition: "stroke-dashoffset 0.9s linear",
        }}
      />
      {/* 中心倒计时（位于精灵上方） */}
      <text
        x="50"
        y="14"
        fontSize="10"
        fontWeight="600"
        fill={stroke}
        textAnchor="middle"
        style={{ paintOrder: "stroke fill" } as React.CSSProperties}
        stroke="rgba(0,0,0,0.5)"
        strokeWidth="0.4"
      >
        {pad(minutes)}:{pad(seconds)}
      </text>
    </svg>
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
