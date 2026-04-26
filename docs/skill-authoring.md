# Skill 作者指南

> 读者：想写自己的 Skill、或把现成 Prompt 变成可重用工具的用户 / 贡献者
> 版本：对应 `@inkforge/skill-engine`（M3-B/M4 版本）

Skill = Prompt 模板 + 触发规则 + 模型绑定 + 输出目标。InkForge 把它们打包成一个 JSON，可导入导出，也可通过"市场"分发（M5-E 规划）。

---

## 1. Schema（TypeScript）

定义在 `packages/shared/src/domain.ts`：

```ts
export interface SkillDefinition {
  id: string;                          // UUID；导入时会冲突检测
  name: string;                        // 显示名（建议 ≤ 12 字）
  prompt: string;                      // 模板；支持 {{...}} 占位
  variables: SkillVariableDef[];
  triggers: SkillTriggerDef[];
  binding: SkillBinding;
  output: SkillOutputTarget;
  enabled: boolean;
  scope: "global" | "project" | "community";
  createdAt: string;
  updatedAt: string;
}
```

### 1.1 变量

```ts
export interface SkillVariableDef {
  key: string;          // 对应模板里 {{vars.<key>}}
  label: string;        // UI 显示
  required: boolean;
  defaultValue?: string;
  description?: string;
}
```

### 1.2 触发器

```ts
export interface SkillTriggerDef {
  type: "selection" | "every-n-chars" | "on-save" | "on-chapter-end" | "manual";
  enabled: boolean;
  everyNChars?: number;   // 仅 every-n-chars 有意义
  debounceMs?: number;    // 默认 10000
  cooldownMs?: number;    // 默认 30000
}
```

### 1.3 模型绑定

```ts
export interface SkillBinding {
  providerId?: string;    // 空则走当前 active provider
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
```

### 1.4 输出目标

- `ai-feedback`：写到时间线，不改正文（默认、最安全）
- `replace-selection`：替换选中文本（仅选段触发）
- `insert-after-selection`：在选区后追加
- `append-chapter`：追加到章节末（谨慎）

---

## 2. 模板变量

| 占位符 | 来源 | 说明 |
|--------|------|------|
| `{{selection}}` | 当前选段文本 | 非选段触发时为空 |
| `{{chapter.title}}` | 当前章节标题 | |
| `{{chapter.text}}` | 当前章节正文 | 大章节会被 LLM 上下文窗口裁剪 |
| `{{context_before_N}}` | 选段前 N 字 | N 取 50~3000，字符计 |
| `{{character.name}}` | 当前人物（若已激活）| |
| `{{character.persona}}` | 人物 persona | |
| `{{vars.<key>}}` | Skill variables 定义的变量 | 运行时从 UI 或 manualVariables 填入 |

**严格模式**：`renderSkillTemplate({ strict: true })` 时缺失变量抛错；默认 `strict: false, emptyOnMissing: true` 替换为空字符串。

---

## 3. 5 条预设解析

`packages/skill-engine/src/presets/index.ts` 定义了 5 条 seed Skill，首次启动自动导入为 `scope: "global"`。

### 3.1 润色·温柔
```json
{
  "name": "润色·温柔",
  "prompt": "请在不改变剧情与信息的前提下，温柔润色以下选中文本，保持原意和长度接近，只输出改写结果：\n{{selection}}",
  "triggers": [{ "type": "selection", "enabled": true }],
  "binding": { "temperature": 0.55 },
  "output": "replace-selection"
}
```
**何时用**：选段太口语化，要提升文学调性但不改情节。
**注意**：`replace-selection` 会直接改正文，先选对范围。

### 3.2 人物一致性审查
`on-save` 触发，输出到时间线；不改正文。适合作为"背景审查员"在章节保存时自动跑一遍。

### 3.3 视角切换
选段触发，输出三种视角改写到时间线；`output: ai-feedback` 所以不动正文，用户复制即可。

### 3.4 伏笔提醒
`on-chapter-end` 触发，按"伏笔点 + 落位建议"两条输出。

### 3.5 每 200 字节奏建议
`every-n-chars=200 + debounceMs=10000 + cooldownMs=30000`。**与系统内建 analysis-service 功能重叠**，预设默认启用；若不需要可在 SkillPage 关掉此条或关掉全局 analysis。

---

## 4. 调试

### 4.1 UI 内测试运行

SkillEditor 底部有"测试运行"按钮，**不**走 `ai_feedbacks` 表（`persist: false`），仅流式显示结果。适合调 Prompt。

### 4.2 查看 feedback 内落地

```sql
SELECT id, type, trigger, payload, created_at
FROM ai_feedbacks
WHERE trigger LIKE 'skill:%'
ORDER BY created_at DESC
LIMIT 10;
```

`payload.missingTokens` 记录模板中没被解析的占位符名，有助于发现笔误。

### 4.3 触发不工作的常见坑

- **every-n-chars 没有跑**：检查 `debounceMs` + `cooldownMs`。每章并发 1，且同 Skill 30 秒内不会重复触发。
- **on-save 静默**：确认 `chapter:update` 确实带 `content` 字段（仅内容变动才触发）
- **selection 里的 Skill 看不到**：SelectionToolbar 只显示 `triggers: [{type:"selection", enabled:true}]` 的 Skill

---

## 5. 导入导出

### 5.1 SkillPack v1

```json
{
  "format": "inkforge.skill-pack",
  "version": "1.0.0",
  "exportedAt": "2026-04-21T10:00:00Z",
  "source": "inkforge-desktop",
  "skills": [ /* SkillDefinition[] */ ]
}
```

### 5.2 冲突策略

导入时 `onConflict: "replace" | "skip" | "rename"`：
- `replace`：同 id 覆盖
- `skip`：保留原有
- `rename`：导入为新 id，name 后缀 `(2)`

---

## 6. 发布到市场（M5-E 规划）

UI 内的"📤 发布到市场"将：

1. 生成 branch 名 `skill/<slug>-<ts>`
2. 写好 PR body 模板（名称 / 简介 / 适用场景 / 变量说明 / 推荐触发）
3. 复制 Skill JSON 到剪贴板
4. 打开 `https://github.com/<org>/inkforge-skills/compare/main...user:branch?expand=1`

**零服务端**：`inkforge-skills` 仓库就是市场；CI 会跑 schema 校验，PR merge 后应用内刷新 `registry.json` 即可。

---

## 7. 常见模式

### 7.1 多人设切换的"批注员"

```json
{
  "name": "硬核评审",
  "prompt": "以下是小说片段。请以一位挑剔的资深编辑身份，指出 3 处最值得修改的问题，每条 ≤ 30 字：\n\n{{selection}}",
  "triggers": [{ "type": "selection", "enabled": true }],
  "binding": { "temperature": 0.3, "maxTokens": 220 },
  "output": "ai-feedback"
}
```

### 7.2 每章节奏检查

```json
{
  "name": "节奏曲线",
  "prompt": "请评估本章节奏：先给 1-5 分，再指出最拖沓和最紧张的段落各 1 处。\n{{chapter.text}}",
  "triggers": [{ "type": "on-chapter-end", "enabled": true }],
  "output": "ai-feedback"
}
```

### 7.3 以人物视角续写 200 字

```json
{
  "name": "林晚续写",
  "prompt": "你是「林晚」：{{character.persona}}。请以林晚第一人称续写 200 字，风格克制内敛：\n\n前文：\n{{context_before_600}}",
  "triggers": [{ "type": "manual", "enabled": true }],
  "binding": { "temperature": 0.75 },
  "output": "insert-after-selection"
}
```

---

## 8. 安全

- Skill JSON 可从任意来源导入，但**不会执行代码**，只是 Prompt 字符串
- 导入 SkillPack 时 `validateSkillDefinition` 会拒绝 missing 必填字段 / 非法触发类型 / 非法 output 目标
- Skill 不能访问本地文件或网络；所有 AI 调用经主进程统一走 Provider + 你自己的 Key
