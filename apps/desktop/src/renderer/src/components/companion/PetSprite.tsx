import { useEffect, useState } from "react";
import type { CompanionPet, CompanionState } from "../../stores/companion-store";

interface PetSpriteProps {
  pet: CompanionPet;
  state: CompanionState;
  /** 是否被悬停（决定是否抬眼） */
  hovered?: boolean;
}

/**
 * SVG 卡通桌宠精灵，融合 LINE Friends / Notion Sticker / Apple Memoji 等可爱平面风格。
 *
 * 特性：
 *  - 描边阴影：所有形状用 `paint-order: stroke fill` + 半透明深色描边，
 *    在浅色或深色背景上都清晰可读；
 *  - 自动眨眼：idle / typing 状态下每 4-7 秒随机眨眼一次；
 *  - 眼神跟随：hovered 时瞳孔微抬；
 *  - 状态贴纸：sleepy 飘 Z；cheering 撒 ✨🎉；midnight 端 ☕；
 *  - 状态-CSS 动画：
 *      typing → 上下 bobbing
 *      cheering → 跳跃 + 形变挤压
 *      sleepy → 缓慢呼吸缩放
 *      idle/midnight → 静态，仅靠 sprite 内眨眼有变化。
 */
export function PetSprite({ pet, state, hovered }: PetSpriteProps): JSX.Element | null {
  const [blink, setBlink] = useState(false);

  // 眨眼调度：仅在 idle/typing/midnight 启用
  useEffect(() => {
    if (state === "sleepy" || state === "hidden" || state === "cheering") {
      setBlink(false);
      return;
    }
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (): void => {
      const next = 4000 + Math.random() * 3000;
      timer = setTimeout(() => {
        if (!mounted) return;
        setBlink(true);
        setTimeout(() => {
          if (!mounted) return;
          setBlink(false);
          schedule();
        }, 140);
      }, next);
    };
    schedule();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [state]);

  if (state === "hidden") return null;

  const animClass = (() => {
    switch (state) {
      case "typing":
        return "animate-[companion-bob_0.45s_ease-in-out_infinite]";
      case "cheering":
        return "animate-[companion-jump_0.7s_cubic-bezier(0.22,1,0.36,1)_infinite]";
      case "sleepy":
        return "animate-[companion-breathe_3.5s_ease-in-out_infinite]";
      case "dizzy":
        return "animate-[companion-dizzy_1.2s_linear_infinite]";
      case "petted":
        return "animate-[companion-breathe_1.2s_ease-in-out_infinite]";
      case "pomodoro-break":
        return "animate-[companion-breathe_2s_ease-in-out_infinite]";
      case "wishing":
        return "animate-[companion-breathe_2.2s_ease-in-out_infinite]";
      default:
        return "";
    }
  })();

  return (
    <div
      className={`relative h-16 w-16 ${animClass}`}
      style={{ filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.35))" }}
    >
      {/* 椭圆地面阴影（独立于精灵 drop-shadow，更柔和） */}
      <div
        aria-hidden
        className="absolute -bottom-0.5 left-1/2 h-[5px] w-12 -translate-x-1/2 rounded-full bg-black/35 blur-[3px]"
      />
      {pet === "cat" && <Cat state={state} hovered={hovered} blink={blink} />}
      {pet === "fox" && <Fox state={state} hovered={hovered} blink={blink} />}
      {pet === "owl" && <Owl state={state} hovered={hovered} blink={blink} />}
      {pet === "octopus" && (
        <Octopus state={state} hovered={hovered} blink={blink} />
      )}

      {/* 状态贴纸 */}
      {state === "sleepy" && (
        <span
          aria-hidden
          className="absolute -top-2 right-0 select-none text-sm text-indigo-300 drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)] animate-[companion-breathe_3s_ease-in-out_infinite]"
        >
          𝓏
        </span>
      )}
      {state === "cheering" && (
        <>
          <span
            aria-hidden
            className="absolute -top-2 -left-1 text-[14px] drop-shadow"
          >
            ✨
          </span>
          <span
            aria-hidden
            className="absolute -top-3 right-0 text-[14px] drop-shadow"
          >
            🎉
          </span>
        </>
      )}
      {state === "midnight" && (
        <span
          aria-hidden
          className="absolute bottom-0 -right-3 text-[18px] drop-shadow"
          title="夜深咖啡"
        >
          ☕
        </span>
      )}
      {state === "petted" && (
        <>
          <span
            aria-hidden
            className="absolute -top-2 left-0 text-base text-rose-400 animate-[companion-bubble-in_500ms_ease-out_both]"
          >
            ❤
          </span>
          <span
            aria-hidden
            className="absolute -top-1 right-0 text-sm text-rose-300 animate-[companion-bubble-in_700ms_ease-out_both]"
          >
            ❤
          </span>
        </>
      )}
      {state === "pomodoro-work" && (
        <span
          aria-hidden
          className="absolute -top-1 left-1/2 -translate-x-1/2 text-base"
          title="专注中"
        >
          🤓
        </span>
      )}
      {state === "pomodoro-break" && (
        <span
          aria-hidden
          className="absolute -top-1 -right-2 text-base"
          title="休息中"
        >
          🍵
        </span>
      )}
      {state === "dizzy" && (
        <span
          aria-hidden
          className="absolute -top-2 left-1/2 -translate-x-1/2 text-base"
          title="晕了"
        >
          💫
        </span>
      )}
      {state === "wishing" && (
        <>
          <span
            aria-hidden
            className="absolute -top-3 -left-2 text-sm animate-pulse text-amber-300"
          >
            ✨
          </span>
          <span
            aria-hidden
            className="absolute -top-2 right-0 text-base animate-pulse text-yellow-300"
          >
            🌟
          </span>
        </>
      )}
    </div>
  );
}

interface PetProps {
  state: CompanionState;
  hovered?: boolean;
  blink?: boolean;
}

/** 公共描边样式：所有 path 同时受用，提升对比度 */
const STROKE = "rgba(38,18,4,0.55)";

function Cat({ state, hovered, blink }: PetProps): JSX.Element {
  const eyesClosed = state === "sleepy" || blink;
  const lookUp = hovered;
  const eyeY = lookUp ? 26 : 28;
  return (
    <svg
      viewBox="0 0 64 64"
      className="absolute inset-0 h-full w-full"
      aria-hidden
      style={{ paintOrder: "stroke fill" } as React.CSSProperties}
    >
      <defs>
        <linearGradient id="catBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbbf6b" />
          <stop offset="1" stopColor="#e08e3e" />
        </linearGradient>
        <radialGradient id="catCheek" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fda4af" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fda4af" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 身体 */}
      <ellipse
        cx="32"
        cy="44"
        rx="16"
        ry="14"
        fill="url(#catBody)"
        stroke={STROKE}
        strokeWidth="1.2"
      />
      {/* 头 */}
      <circle
        cx="32"
        cy="28"
        r="14"
        fill="url(#catBody)"
        stroke={STROKE}
        strokeWidth="1.2"
      />
      {/* 耳朵（外+内） */}
      <polygon
        points="20,18 24,8 28,17"
        fill="url(#catBody)"
        stroke={STROKE}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <polygon
        points="44,18 40,8 36,17"
        fill="url(#catBody)"
        stroke={STROKE}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <polygon points="22,16 24,12 26,16" fill="#e76f51" />
      <polygon points="42,16 40,12 38,16" fill="#e76f51" />

      {/* 腮红 */}
      <circle cx="22" cy="32" r="3" fill="url(#catCheek)" />
      <circle cx="42" cy="32" r="3" fill="url(#catCheek)" />

      {/* 眼 */}
      {eyesClosed ? (
        <>
          <path
            d="M23 28.5 Q26 30.5 29 28.5"
            stroke={STROKE}
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M35 28.5 Q38 30.5 41 28.5"
            stroke={STROKE}
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <ellipse cx="26" cy={eyeY} rx="1.8" ry="2.4" fill="#1f2937" />
          <ellipse cx="38" cy={eyeY} rx="1.8" ry="2.4" fill="#1f2937" />
          <circle cx="26.6" cy={eyeY - 1} r="0.7" fill="#fff" />
          <circle cx="38.6" cy={eyeY - 1} r="0.7" fill="#fff" />
        </>
      )}

      {/* 鼻嘴 */}
      <path
        d="M30.6 32 L33.4 32 L32 33.6 Z"
        fill="#e76f51"
        stroke={STROKE}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <path
        d="M32 33.6 Q30 35.4 28 34.4"
        stroke={STROKE}
        strokeWidth="0.9"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M32 33.6 Q34 35.4 36 34.4"
        stroke={STROKE}
        strokeWidth="0.9"
        fill="none"
        strokeLinecap="round"
      />

      {/* 胡须 */}
      <line x1="22" y1="32" x2="16" y2="31" stroke={STROKE} strokeWidth="0.7" />
      <line x1="22" y1="34" x2="16" y2="35" stroke={STROKE} strokeWidth="0.7" />
      <line x1="42" y1="32" x2="48" y2="31" stroke={STROKE} strokeWidth="0.7" />
      <line x1="42" y1="34" x2="48" y2="35" stroke={STROKE} strokeWidth="0.7" />

      {/* 尾巴 */}
      <path
        d="M48 46 Q58 36 50 28"
        stroke="url(#catBody)"
        strokeWidth="5.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M48 46 Q58 36 50 28"
        stroke={STROKE}
        strokeWidth="0.8"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

function Fox({ state, hovered, blink }: PetProps): JSX.Element {
  const eyesClosed = state === "sleepy" || blink;
  const lookUp = hovered;
  const eyeY = lookUp ? 25 : 27;
  return (
    <svg
      viewBox="0 0 64 64"
      className="absolute inset-0 h-full w-full"
      aria-hidden
      style={{ paintOrder: "stroke fill" } as React.CSSProperties}
    >
      <defs>
        <linearGradient id="foxBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f97316" />
          <stop offset="1" stopColor="#c2410c" />
        </linearGradient>
      </defs>
      <ellipse
        cx="32"
        cy="44"
        rx="15"
        ry="13"
        fill="url(#foxBody)"
        stroke={STROKE}
        strokeWidth="1.2"
      />
      <circle
        cx="32"
        cy="28"
        r="13"
        fill="url(#foxBody)"
        stroke={STROKE}
        strokeWidth="1.2"
      />
      <polygon
        points="22,18 24,6 28,16"
        fill="url(#foxBody)"
        stroke={STROKE}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <polygon
        points="42,18 40,6 36,16"
        fill="url(#foxBody)"
        stroke={STROKE}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* 脸部白底 */}
      <path
        d="M32 22 L26 32 L38 32 Z"
        fill="#fff"
        stroke={STROKE}
        strokeWidth="0.8"
      />
      <path
        d="M32 42 L28 38 L36 38 Z"
        fill="#fff"
        stroke={STROKE}
        strokeWidth="0.8"
      />
      {eyesClosed ? (
        <>
          <path
            d="M23 27.5 Q26 29.5 29 27.5"
            stroke={STROKE}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M35 27.5 Q38 29.5 41 27.5"
            stroke={STROKE}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <ellipse cx="26" cy={eyeY} rx="1.6" ry="2.2" fill="#1f2937" />
          <ellipse cx="38" cy={eyeY} rx="1.6" ry="2.2" fill="#1f2937" />
          <circle cx="26.5" cy={eyeY - 0.8} r="0.6" fill="#fff" />
          <circle cx="38.5" cy={eyeY - 0.8} r="0.6" fill="#fff" />
        </>
      )}
      <ellipse cx="32" cy="33.5" rx="1.4" ry="1.1" fill="#1f2937" />
      <path
        d="M48 48 Q60 36 50 28"
        stroke="url(#foxBody)"
        strokeWidth="6.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* 尾尖白毛 */}
      <path
        d="M50 30 Q55 28 52 26"
        stroke="#fff"
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Owl({ state, hovered, blink }: PetProps): JSX.Element {
  const eyesClosed = state === "sleepy" || blink;
  const lookUp = hovered;
  const eyeY = lookUp ? 28 : 30;
  return (
    <svg
      viewBox="0 0 64 64"
      className="absolute inset-0 h-full w-full"
      aria-hidden
      style={{ paintOrder: "stroke fill" } as React.CSSProperties}
    >
      <defs>
        <linearGradient id="owlBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a8714a" />
          <stop offset="1" stopColor="#704218" />
        </linearGradient>
      </defs>
      <ellipse
        cx="32"
        cy="40"
        rx="16"
        ry="18"
        fill="url(#owlBody)"
        stroke={STROKE}
        strokeWidth="1.2"
      />
      {/* 肚子 */}
      <ellipse
        cx="32"
        cy="44"
        rx="9"
        ry="11"
        fill="#fde68a"
        opacity="0.55"
      />
      {/* 眼框 */}
      <circle cx="26" cy="30" r="7.5" fill="#fff" stroke={STROKE} strokeWidth="0.8" />
      <circle cx="38" cy="30" r="7.5" fill="#fff" stroke={STROKE} strokeWidth="0.8" />
      {eyesClosed ? (
        <>
          <path
            d="M21 30 Q26 33 31 30"
            stroke={STROKE}
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M33 30 Q38 33 43 30"
            stroke={STROKE}
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <circle cx="26" cy={eyeY} r="3" fill="#1f2937" />
          <circle cx="38" cy={eyeY} r="3" fill="#1f2937" />
          <circle cx="27" cy={eyeY - 1} r="0.8" fill="#fff" />
          <circle cx="39" cy={eyeY - 1} r="0.8" fill="#fff" />
        </>
      )}
      {/* 喙 */}
      <polygon
        points="32,34 30,38.5 34,38.5"
        fill="#f59e0b"
        stroke={STROKE}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      {/* 眉羽 */}
      <path d="M22 22 L26 26" stroke={STROKE} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M42 22 L38 26" stroke={STROKE} strokeWidth="1.4" strokeLinecap="round" />
      {/* 脚 */}
      <line x1="28" y1="56" x2="28" y2="60" stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="36" y1="56" x2="36" y2="60" stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function Octopus({ state, hovered, blink }: PetProps): JSX.Element {
  const eyesClosed = state === "sleepy" || blink;
  const lookUp = hovered;
  const eyeY = lookUp ? 22 : 24;
  return (
    <svg
      viewBox="0 0 64 64"
      className="absolute inset-0 h-full w-full"
      aria-hidden
      style={{ paintOrder: "stroke fill" } as React.CSSProperties}
    >
      <defs>
        <linearGradient id="octBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <ellipse
        cx="32"
        cy="26"
        rx="16"
        ry="14"
        fill="url(#octBody)"
        stroke={STROKE}
        strokeWidth="1.2"
      />
      {/* 触手 */}
      {[14, 22, 30, 38, 46, 54].map((x, i) => (
        <path
          key={x}
          d={`M${x} 38 Q${x + (i % 2 ? 4 : -4)} ${48 + (i % 2 ? 0 : 4)} ${x + (i % 2 ? -2 : 2)} ${56 + (i % 2 ? 2 : 0)}`}
          stroke="url(#octBody)"
          strokeWidth="4.5"
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {/* 触手描边 */}
      {[14, 22, 30, 38, 46, 54].map((x, i) => (
        <path
          key={`s-${x}`}
          d={`M${x} 38 Q${x + (i % 2 ? 4 : -4)} ${48 + (i % 2 ? 0 : 4)} ${x + (i % 2 ? -2 : 2)} ${56 + (i % 2 ? 2 : 0)}`}
          stroke={STROKE}
          strokeWidth="0.7"
          fill="none"
          strokeLinecap="round"
          opacity="0.5"
        />
      ))}
      {/* 腮红 */}
      <ellipse cx="22" cy="28" rx="3" ry="1.6" fill="#f472b6" opacity="0.55" />
      <ellipse cx="42" cy="28" rx="3" ry="1.6" fill="#f472b6" opacity="0.55" />
      {eyesClosed ? (
        <>
          <path
            d="M23 24 Q26 26 29 24"
            stroke={STROKE}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M35 24 Q38 26 41 24"
            stroke={STROKE}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <circle cx="26" cy={eyeY} r="2.5" fill="#1f2937" />
          <circle cx="38" cy={eyeY} r="2.5" fill="#1f2937" />
          <circle cx="27" cy={eyeY - 0.8} r="0.7" fill="#fff" />
          <circle cx="39" cy={eyeY - 0.8} r="0.7" fill="#fff" />
        </>
      )}
      <path
        d="M28 30 Q32 32 36 30"
        stroke={STROKE}
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
