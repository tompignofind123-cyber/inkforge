import type { SkillDefinition, SkillTriggerType } from "./types";

export interface SkillRunContext {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
  chapterText: string;
  selection?: string;
  character?: {
    id?: string;
    name?: string;
    persona?: string;
  };
  manualVariables?: Record<string, string>;
}

export type SkillEditorEvent =
  | {
      type: "selection";
      projectId: string;
      chapterId: string;
      chapterTitle: string;
      chapterText: string;
      selection: string;
      at: string;
    }
  | {
      type: "text-change";
      projectId: string;
      chapterId: string;
      chapterTitle: string;
      chapterText: string;
      at: string;
    }
  | {
      type: "save";
      projectId: string;
      chapterId: string;
      chapterTitle: string;
      chapterText: string;
      at: string;
    }
  | {
      type: "chapter-end";
      projectId: string;
      chapterId: string;
      chapterTitle: string;
      chapterText: string;
      at: string;
    }
  | {
      type: "manual";
      projectId: string;
      chapterId: string;
      chapterTitle: string;
      chapterText: string;
      skillId?: string;
      manualVariables?: Record<string, string>;
      selection?: string;
      at: string;
    };

export interface TriggerDispatch {
  runId: string;
  skillId: string;
  triggerType: SkillTriggerType;
  skill: SkillDefinition;
  context: SkillRunContext;
}

export interface TriggerSchedulerOptions {
  getEnabledSkills: (projectId: string) => Promise<SkillDefinition[]>;
  onDispatch: (dispatch: TriggerDispatch) => Promise<void> | void;
  defaultDebounceMs?: number;
  defaultCooldownMs?: number;
}

interface PendingState {
  timer: ReturnType<typeof setTimeout>;
  event: Extract<SkillEditorEvent, { type: "text-change" }>;
  skill: SkillDefinition;
  triggerType: "every-n-chars";
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function chapterKey(projectId: string, chapterId: string): string {
  return `${projectId}:${chapterId}`;
}

function skillTriggerKey(
  projectId: string,
  chapterId: string,
  skillId: string,
  triggerType: string,
): string {
  return `${projectId}:${chapterId}:${skillId}:${triggerType}`;
}

export class TriggerScheduler {
  private readonly options: TriggerSchedulerOptions;
  private readonly pending = new Map<string, PendingState>();
  private readonly lastTriggeredChars = new Map<string, number>();
  private readonly lastTriggeredAt = new Map<string, number>();
  private readonly chapterQueue = new Map<string, Promise<void>>();
  private disposed = false;

  constructor(options: TriggerSchedulerOptions) {
    this.options = options;
  }

  async ingest(event: SkillEditorEvent): Promise<void> {
    if (this.disposed) return;
    const skills = await this.options.getEnabledSkills(event.projectId);
    if (skills.length === 0) return;

    if (event.type === "selection") {
      await this.dispatchImmediate(event, skills, "selection");
      return;
    }
    if (event.type === "manual") {
      const filtered = event.skillId
        ? skills.filter((skill) => skill.id === event.skillId)
        : skills;
      await this.dispatchImmediate(event, filtered, "manual");
      return;
    }
    if (event.type === "save") {
      await this.dispatchImmediate(event, skills, "on-save");
      return;
    }
    if (event.type === "chapter-end") {
      await this.dispatchImmediate(event, skills, "on-chapter-end");
      return;
    }
    if (event.type === "text-change") {
      await this.scheduleCharBased(event, skills);
    }
  }

  async flush(projectId: string, chapterId: string): Promise<void> {
    if (this.disposed) return;
    const keys = [...this.pending.keys()].filter((key) =>
      key.startsWith(`${projectId}:${chapterId}:`),
    );
    const tasks: Promise<void>[] = [];
    for (const key of keys) {
      const pending = this.pending.get(key);
      if (!pending) continue;
      clearTimeout(pending.timer);
      this.pending.delete(key);
      tasks.push(this.dispatchEveryNChars(pending.event, pending.skill));
    }
    await Promise.all(tasks);
  }

  dispose(): void {
    if (this.disposed) return;
    for (const value of this.pending.values()) {
      clearTimeout(value.timer);
    }
    this.pending.clear();
    this.lastTriggeredAt.clear();
    this.lastTriggeredChars.clear();
    this.chapterQueue.clear();
    this.disposed = true;
  }

  private async dispatchImmediate(
    event:
      | Extract<SkillEditorEvent, { type: "selection" }>
      | Extract<SkillEditorEvent, { type: "manual" }>
      | Extract<SkillEditorEvent, { type: "save" }>
      | Extract<SkillEditorEvent, { type: "chapter-end" }>,
    skills: SkillDefinition[],
    triggerType: SkillTriggerType,
  ): Promise<void> {
    const targetSkills = skills.filter((skill) =>
      skill.triggers.some((trigger) => trigger.type === triggerType && trigger.enabled),
    );
    const key = chapterKey(event.projectId, event.chapterId);
    const queue = this.chapterQueue.get(key) ?? Promise.resolve();
    const next = queue.then(async () => {
      for (const skill of targetSkills) {
        await this.options.onDispatch({
          runId: createId(),
          skillId: skill.id,
          skill,
          triggerType,
          context: {
            projectId: event.projectId,
            chapterId: event.chapterId,
            chapterTitle: event.chapterTitle,
            chapterText: event.chapterText,
            selection:
              event.type === "selection" || event.type === "manual"
                ? event.selection
                : undefined,
            manualVariables: event.type === "manual" ? event.manualVariables : undefined,
          },
        });
      }
    });
    this.chapterQueue.set(key, next.catch(() => {}));
    await next;
  }

  private async scheduleCharBased(
    event: Extract<SkillEditorEvent, { type: "text-change" }>,
    skills: SkillDefinition[],
  ): Promise<void> {
    const now = Date.now();
    for (const skill of skills) {
      const trigger = skill.triggers.find(
        (item) => item.type === "every-n-chars" && item.enabled,
      );
      if (!trigger) continue;
      const marker = skillTriggerKey(
        event.projectId,
        event.chapterId,
        skill.id,
        "every-n-chars",
      );
      const count = event.chapterText.length;
      const everyNChars = Math.max(1, trigger.everyNChars ?? 200);
      const lastCount = this.lastTriggeredChars.get(marker) ?? 0;
      if (count - lastCount < everyNChars) continue;
      const cooldownMs = trigger.cooldownMs ?? this.options.defaultCooldownMs ?? 30_000;
      const lastAt = this.lastTriggeredAt.get(marker) ?? 0;
      if (now - lastAt < cooldownMs) continue;
      if (this.pending.has(marker)) continue;
      const debounceMs = trigger.debounceMs ?? this.options.defaultDebounceMs ?? 10_000;
      const timer = setTimeout(() => {
        const pending = this.pending.get(marker);
        if (!pending || this.disposed) return;
        this.pending.delete(marker);
        void this.dispatchEveryNChars(pending.event, pending.skill);
      }, Math.max(0, debounceMs));
      this.pending.set(marker, {
        timer,
        event,
        skill,
        triggerType: "every-n-chars",
      });
    }
  }

  private async dispatchEveryNChars(
    event: Extract<SkillEditorEvent, { type: "text-change" }>,
    skill: SkillDefinition,
  ): Promise<void> {
    const marker = skillTriggerKey(
      event.projectId,
      event.chapterId,
      skill.id,
      "every-n-chars",
    );
    const key = chapterKey(event.projectId, event.chapterId);
    const queue = this.chapterQueue.get(key) ?? Promise.resolve();
    const next = queue.then(async () => {
      await this.options.onDispatch({
        runId: createId(),
        skillId: skill.id,
        skill,
        triggerType: "every-n-chars",
        context: {
          projectId: event.projectId,
          chapterId: event.chapterId,
          chapterTitle: event.chapterTitle,
          chapterText: event.chapterText,
        },
      });
      this.lastTriggeredChars.set(marker, event.chapterText.length);
      this.lastTriggeredAt.set(marker, Date.now());
    });
    this.chapterQueue.set(key, next.catch(() => {}));
    await next;
  }
}
