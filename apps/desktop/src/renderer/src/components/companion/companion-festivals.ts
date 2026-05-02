/**
 * 节日 / 季节 检测：根据当前日期返回当前生效的"装饰主题"。
 * 不接入农历库，因此春节按 2026-2030 年公历对应日期 hardcoded。
 */

export type FestivalKey =
  | "spring-festival"
  | "valentine"
  | "halloween"
  | "christmas"
  | "newyear"
  | "midautumn"
  | "user-birthday"
  | null;

export type SeasonKey = "spring" | "summer" | "autumn" | "winter";

/** 春节公历日期（农历正月初一）2026-2030 */
const SPRING_FESTIVAL_DATES: Record<number, [number, number]> = {
  2026: [2, 17],
  2027: [2, 6],
  2028: [1, 26],
  2029: [2, 13],
  2030: [2, 3],
};

/** 中秋（农历八月十五）2026-2030 */
const MIDAUTUMN_DATES: Record<number, [number, number]> = {
  2026: [9, 25],
  2027: [9, 15],
  2028: [10, 3],
  2029: [9, 22],
  2030: [9, 11],
};

export function detectFestival(
  now: Date,
  userBirthdayMmdd: string | null,
): FestivalKey {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const y = now.getFullYear();
  const mmdd = `${pad(m)}-${pad(d)}`;

  // 用户生日优先
  if (userBirthdayMmdd && userBirthdayMmdd === mmdd) return "user-birthday";

  // 春节窗口：当天 + 后 2 天
  const sf = SPRING_FESTIVAL_DATES[y];
  if (sf && withinWindow(m, d, sf[0], sf[1], 0, 2)) return "spring-festival";

  // 中秋
  const ma = MIDAUTUMN_DATES[y];
  if (ma && withinWindow(m, d, ma[0], ma[1], -1, 1)) return "midautumn";

  // 情人节
  if (m === 2 && d === 14) return "valentine";

  // 万圣节窗口（10/30 - 10/31）
  if (m === 10 && (d === 30 || d === 31)) return "halloween";

  // 圣诞窗口（12/24 - 12/26）
  if (m === 12 && d >= 24 && d <= 26) return "christmas";

  // 新年（12/31 - 1/1）
  if ((m === 12 && d === 31) || (m === 1 && d === 1)) return "newyear";

  return null;
}

export function detectSeason(now: Date): SeasonKey {
  const m = now.getMonth() + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

function withinWindow(
  m: number,
  d: number,
  tm: number,
  td: number,
  before: number,
  after: number,
): boolean {
  const cur = m * 100 + d;
  const tgt = tm * 100 + td;
  return cur >= tgt + before && cur <= tgt + after;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 把节日 key 翻成中文用于气泡 / UI 提示 */
export const FESTIVAL_LABEL: Record<NonNullable<FestivalKey>, string> = {
  "spring-festival": "🧧 春节",
  valentine: "💝 情人节",
  halloween: "🎃 万圣节",
  christmas: "🎄 圣诞",
  newyear: "🎆 元旦",
  midautumn: "🥮 中秋",
  "user-birthday": "🎂 你的生日",
};
