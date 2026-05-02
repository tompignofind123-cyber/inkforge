import { useMemo } from "react";
import { detectSeason } from "./companion-festivals";

interface CompanionParticlesProps {
  /** 中心点屏幕坐标（精灵中心） */
  centerX: number;
  centerY: number;
  /** 关闭可调整数量为 0 */
  enabled: boolean;
}

type ParticleKind = "cherry" | "firefly" | "leaf" | "snow" | "star" | "sun";

/**
 * 桌宠周围环境粒子。
 * 6 颗粒子，按当前季节 + 时段自动选择类型：
 *   春樱 / 夏萤火 / 秋枫叶 / 冬雪 / 凌晨星星
 * 每颗粒子有独立的随机轨迹（CSS 动画 + delay）。
 */
export function CompanionParticles({
  centerX,
  centerY,
  enabled,
}: CompanionParticlesProps): JSX.Element | null {
  const kind = useMemo(() => pickKind(new Date()), []);
  const particles = useMemo(() => buildParticles(kind, 6), [kind]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[35]"
      style={{
        left: centerX,
        top: centerY,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className="relative h-32 w-32">
        {particles.map((p, i) => (
          <ParticleDot key={i} {...p} />
        ))}
      </div>
    </div>
  );
}

interface ParticleConfig {
  kind: ParticleKind;
  startX: number; // -50 ~ 50
  startY: number; // -50 ~ 50
  delay: number;
  duration: number;
}

function ParticleDot({
  kind,
  startX,
  startY,
  delay,
  duration,
}: ParticleConfig): JSX.Element {
  const visual = VISUAL[kind];
  return (
    <span
      className="absolute"
      style={{
        left: `calc(50% + ${startX}px)`,
        top: `calc(50% + ${startY}px)`,
        animation: `companion-particle-float ${duration}s ease-in-out ${delay}s infinite`,
        fontSize: visual.size,
        color: visual.color,
        filter: visual.glow ?? undefined,
      }}
    >
      {visual.glyph}
    </span>
  );
}

function pickKind(now: Date): ParticleKind {
  const hour = now.getHours();
  // 凌晨星星
  if (hour >= 0 && hour < 5) return "star";
  // 正午阳光
  if (hour >= 11 && hour < 14) return "sun";
  // 季节
  const s = detectSeason(now);
  if (s === "spring") return "cherry";
  if (s === "summer") return "firefly";
  if (s === "autumn") return "leaf";
  return "snow";
}

function buildParticles(kind: ParticleKind, n: number): ParticleConfig[] {
  const out: ParticleConfig[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      kind,
      startX: rand(-55, 55),
      startY: rand(-30, 50),
      delay: rand(0, 5),
      duration: rand(6, 11),
    });
  }
  return out;
}

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

const VISUAL: Record<
  ParticleKind,
  { glyph: string; size: number; color: string; glow?: string }
> = {
  cherry: { glyph: "🌸", size: 14, color: "transparent" },
  firefly: {
    glyph: "•",
    size: 9,
    color: "#facc15",
    glow: "drop-shadow(0 0 4px rgba(250,204,21,0.9))",
  },
  leaf: { glyph: "🍂", size: 14, color: "transparent" },
  snow: { glyph: "❄", size: 13, color: "rgba(226,232,240,0.85)" },
  star: {
    glyph: "✦",
    size: 11,
    color: "#fde68a",
    glow: "drop-shadow(0 0 4px rgba(253,230,138,0.85))",
  },
  sun: { glyph: "✺", size: 12, color: "rgba(251,191,36,0.7)" },
};
