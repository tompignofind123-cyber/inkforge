import type { CompanionPet } from "../../stores/companion-store";

/**
 * 不同桌宠的"第一人称"代词映射 + 称呼后缀。
 * 用法：将气泡 / 聊天文本中的占位符 {self} 替换为对应代词。
 */
export const PET_PRONOUN: Record<CompanionPet, string> = {
  cat: "本喵",
  fox: "本狐",
  owl: "本鸮",
  octopus: "本喵八腿", // 章鱼自称"喵八腿"，反差萌
};

export const PET_SOUND: Record<CompanionPet, string> = {
  cat: "喵",
  fox: "嗷呜",
  owl: "咕～",
  octopus: "啵啵",
};

/** 默认名字（未起名时备用） */
export const PET_DEFAULT_NAME: Record<CompanionPet, string> = {
  cat: "团子",
  fox: "小白",
  owl: "夜书",
  octopus: "墨墨",
};

/**
 * 把模板里的 {self} {sound} {name} 占位符替换成对应代词/音效/名字。
 * 没起名 → 用代词代替名字；外部传入 name 优先。
 */
export function applyPersona(
  template: string,
  pet: CompanionPet,
  customName: string,
): string {
  const self = PET_PRONOUN[pet];
  const sound = PET_SOUND[pet];
  const name = customName || PET_DEFAULT_NAME[pet];
  return template
    .replaceAll("{self}", self)
    .replaceAll("{sound}", sound)
    .replaceAll("{name}", name);
}
