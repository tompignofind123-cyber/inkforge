import type { AutoWriterCorrectionEntry } from "@inkforge/shared";

/**
 * 用户中途追加思路 / 纠错的队列。
 * 由主进程 service 写入；engine 在每段开始 / 重写前 drain 一次。
 */
export class UserInterruptQueue {
  private items: AutoWriterCorrectionEntry[] = [];

  push(item: AutoWriterCorrectionEntry): void {
    this.items.push(item);
  }

  /** 取走所有累积消息并清空队列。返回时间戳升序。 */
  drain(): AutoWriterCorrectionEntry[] {
    const taken = [...this.items];
    this.items = [];
    return taken;
  }

  peek(): AutoWriterCorrectionEntry[] {
    return [...this.items];
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}
