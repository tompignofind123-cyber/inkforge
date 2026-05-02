import type { FestivalKey } from "./companion-festivals";

interface FestiveOverlayProps {
  festival: FestivalKey;
  /** 是否解锁了 Konami code 彩虹皮肤（覆盖节日） */
  rainbow?: boolean;
}

/**
 * 节日装饰覆盖在桌宠 sprite 上层（绝对定位）。
 * 仅渲染 SVG / emoji 装饰，不修改桌宠本体。
 *
 * 优先级：rainbow > festival
 */
export function CompanionFestiveOverlay({
  festival,
  rainbow,
}: FestiveOverlayProps): JSX.Element | null {
  if (rainbow) {
    // 彩虹皮肤：头顶一道小彩虹弧
    return (
      <svg
        viewBox="0 0 64 24"
        className="pointer-events-none absolute -top-4 left-0 h-6 w-16"
        aria-hidden
      >
        <defs>
          <linearGradient id="rainbow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="20%" stopColor="#f97316" />
            <stop offset="40%" stopColor="#facc15" />
            <stop offset="60%" stopColor="#22c55e" />
            <stop offset="80%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <path
          d="M6 22 Q32 -2 58 22"
          fill="none"
          stroke="url(#rainbow)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (!festival) return null;

  switch (festival) {
    case "spring-festival":
      return (
        <>
          {/* 红色头巾/帽 */}
          <svg
            viewBox="0 0 64 24"
            className="pointer-events-none absolute -top-3 left-0 h-6 w-16"
            aria-hidden
          >
            <path
              d="M14 18 L32 4 L50 18 Z"
              fill="#dc2626"
              stroke="#7f1d1d"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <circle cx="32" cy="4" r="2" fill="#fbbf24" />
          </svg>
          <span
            aria-hidden
            className="absolute -right-5 top-2 text-base"
            title="春节红包"
          >
            🧧
          </span>
        </>
      );
    case "christmas":
      return (
        <>
          {/* 圣诞帽 */}
          <svg
            viewBox="0 0 64 24"
            className="pointer-events-none absolute -top-4 left-0 h-7 w-16"
            aria-hidden
          >
            <path
              d="M16 22 L40 22 L34 4 Z"
              fill="#dc2626"
              stroke="#7f1d1d"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <ellipse cx="28" cy="22" rx="14" ry="2" fill="#fff" />
            <circle cx="34" cy="4" r="2.5" fill="#fff" />
          </svg>
          <span
            aria-hidden
            className="absolute -right-5 -top-2 text-sm"
            title="圣诞礼物"
          >
            🎁
          </span>
        </>
      );
    case "halloween":
      return (
        <span
          aria-hidden
          className="absolute -top-3 left-1/2 -translate-x-1/2 text-2xl drop-shadow"
          title="万圣节"
        >
          🎃
        </span>
      );
    case "valentine":
      return (
        <>
          <span
            aria-hidden
            className="absolute -top-1 -left-3 text-base drop-shadow"
          >
            💝
          </span>
          <span
            aria-hidden
            className="absolute -top-1 -right-3 text-base drop-shadow"
          >
            💕
          </span>
        </>
      );
    case "user-birthday":
      return (
        <>
          {/* 生日尖帽 */}
          <svg
            viewBox="0 0 64 24"
            className="pointer-events-none absolute -top-4 left-0 h-6 w-16"
            aria-hidden
          >
            <path
              d="M28 22 L36 22 L32 4 Z"
              fill="#a855f7"
              stroke="#6b21a8"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <circle cx="32" cy="4" r="2" fill="#fbbf24" />
            <circle cx="30" cy="14" r="1.2" fill="#fbbf24" />
            <circle cx="34" cy="18" r="1.2" fill="#22d3ee" />
          </svg>
          <span
            aria-hidden
            className="absolute -right-4 top-3 text-base"
            title="生日蛋糕"
          >
            🎂
          </span>
        </>
      );
    case "midautumn":
      return (
        <span
          aria-hidden
          className="absolute -top-2 -right-3 text-base drop-shadow"
          title="月饼"
        >
          🥮
        </span>
      );
    case "newyear":
      return (
        <span
          aria-hidden
          className="absolute -top-2 left-1/2 -translate-x-1/2 text-base drop-shadow"
          title="新年烟花"
        >
          🎆
        </span>
      );
    default:
      return null;
  }
}
