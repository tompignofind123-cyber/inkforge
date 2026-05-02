/**
 * 桌宠对话气泡内容池。
 * 每种状态 / 时段对应若干随机句子，避免单调。
 *
 * 文本中的占位符：
 *   {self} → 「本喵 / 本狐 / 本鸮 / 本喵八腿」
 *   {name} → 用户起的名字（未起 → 默认名）
 *   {sound}→ 「喵 / 嗷呜 / 咕～ / 啵啵」
 */

const IDLE_LINES = [
  "今天想写什么？{sound}",
  "笔尖上有点尘，要不要试试？",
  "上一段是不是还差一句结尾？",
  "{self}帮你看着进度条。",
  "{self}相信你今天写得动。",
  "你今天好像还没动笔，{name}担心了。",
];

const TYPING_LINES = [
  "嗯嗯，这个表达挺有意思 {sound}",
  "你今天的形容词比昨天更有创意了。",
  "节奏不错，再来三百字。",
  "嗯…这个反派挺帅。",
  "继续继续，{self}在听呢。",
  "{name}爱看你打字时的样子。",
];

const SLEEPY_LINES = [
  "Zzz… 你也歇会儿？",
  "{self}打个盹，你叫{self}。",
  "走神中…",
  "怎么静悄悄的呀？",
  "脑子空空，先休息一下吧。",
];

const CHEERING_LINES = [
  "🎉 今日目标达成！晚上加个鸡腿！",
  "厉害厉害，主角今天被你养成了。",
  "✨ 又一天的字数胜利！",
  "这才几点，目标已成？卷王是吧。",
  "{self}骄傲！🎊",
];

const MIDNIGHT_LINES = [
  "☕ 给你递杯咖啡——别熬太晚啊。",
  "已经凌晨了哎，写完这段就睡？",
  "夜里灵感最好但身体最差，平衡一下。",
  "听见键盘声以为只有{self}还醒着…",
  "夜深了，{name}陪你。",
];

const PETTED_LINES = [
  "❤ 再多摸一下！",
  "{sound}~ 好舒服～",
  "再来再来，{self}还要！",
  "你今天的手心暖暖的。",
  "{name}最喜欢你了。",
];

const POMODORO_WORK_LINES = [
  "🍅 专注模式！{self}帮你看时间。",
  "25 分钟搞定一段——加油！",
  "心无旁骛，写就完事儿了。",
];

const POMODORO_BREAK_LINES = [
  "休息 5 分钟，让脖子转一转。",
  "{self}也来伸个懒腰～",
  "喝口水，看看远方。",
  "5 分钟很短，别又开始改稿了。",
];

const DIZZY_LINES = [
  "晕…晕了…@_@",
  "你戳得{self}头都要转飞了！",
  "饶命饶命{sound}…",
];

const WISHING_LINES = [
  "🌟 11:11 到啦！快许个愿——",
  "✨ {self}帮你许愿：「下一章顺利！」",
  "星星都看着呢，认真许一个。",
];

export type BubbleKind =
  | "idle"
  | "typing"
  | "sleepy"
  | "cheering"
  | "midnight"
  | "petted"
  | "pomodoro-work"
  | "pomodoro-break"
  | "dizzy"
  | "wishing"
  | "festival";

const POOLS: Record<BubbleKind, string[]> = {
  idle: IDLE_LINES,
  typing: TYPING_LINES,
  sleepy: SLEEPY_LINES,
  cheering: CHEERING_LINES,
  midnight: MIDNIGHT_LINES,
  petted: PETTED_LINES,
  "pomodoro-work": POMODORO_WORK_LINES,
  "pomodoro-break": POMODORO_BREAK_LINES,
  dizzy: DIZZY_LINES,
  wishing: WISHING_LINES,
  festival: ["今天是特别的一天 {sound}！"],
};

export function pickLine(kind: BubbleKind): string {
  const pool = POOLS[kind] ?? POOLS.idle;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 节日专用气泡 */
export const FESTIVAL_LINES: Record<string, string[]> = {
  "spring-festival": [
    "🧧 新年快乐！{self}给你拜年了！",
    "今年也要好好写小说哟～",
    "红包给{self}！",
  ],
  valentine: [
    "💝 你是{self}的命中作者～",
    "今天的字都要写得更甜一点。",
  ],
  halloween: ["🎃 不给糖就捣乱！", "{self}今天是小南瓜～"],
  christmas: ["🎄 圣诞快乐！", "{self}帮圣诞老人偷偷给你送礼物。"],
  newyear: ["🎆 新的一年，新的字数目标！", "去年的伏笔，今年要收吗？"],
  midautumn: ["🥮 月饼分你一半～", "今天的月亮和你的稿子都很圆。"],
  "user-birthday": [
    "🎂 生日快乐！这是{self}的小蛋糕。",
    "今天什么都不用写，就好好过生日吧。",
  ],
};

export function pickFestivalLine(festival: string): string | null {
  const pool = FESTIVAL_LINES[festival];
  if (!pool) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
