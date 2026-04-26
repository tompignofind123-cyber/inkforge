<div align="center">

<img src="assets/banner.svg" alt="InkForge — 墨炉" width="100%" />

<p>
  <strong>本地优先的 AI 协作式桌面写作台 · A local-first AI writing forge for novelists</strong>
</p>

<p>
  <a href="https://github.com/your-org/inkforge/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/your-org/inkforge/ci.yml?branch=main&label=CI&logo=github" alt="CI"></a>
  <a href="https://github.com/your-org/inkforge/releases"><img src="https://img.shields.io/github/v/release/your-org/inkforge?include_prereleases&color=ff7e3d" alt="Release"></a>
  <img src="https://img.shields.io/badge/typecheck-17%2F17-3aa676" alt="typecheck">
  <img src="https://img.shields.io/badge/verify-92%20assertions-3aa676" alt="verify">
  <img src="https://img.shields.io/badge/platform-Win%20%7C%20macOS%20%7C%20Linux-8a9bb8" alt="platforms">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-3a82f6" alt="license"></a>
  <img src="https://img.shields.io/badge/electron-32-9feaf9" alt="electron">
  <img src="https://img.shields.io/badge/data-100%25%20local-22c55e" alt="local-first">
</p>

<p>
  <a href="#-为什么用-inkforge">中文</a> ·
  <a href="#-why-inkforge">English</a> ·
  <a href="docs/architecture.md">架构</a> ·
  <a href="docs/skill-authoring.md">Skill 作者指南</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

</div>

---

## 🪶 为什么用 InkForge

写作工具链里「纯文本编辑器」与「AI 聊天」长期割裂——长篇作者跨章节查时间线、要人物口吻一致、靠多角色讨论碰撞灵感，而大模型按 token 计费时上下文又最先失控。InkForge 把这些合到一个**本地工作台**：

- **心流优先**：编辑器是舞台中央，所有 AI 输出落到右侧时间线，**绝不弹窗**打断打字
- **静默陪写**：每 200 字后台分析；想看就点开，不想看就当它不存在
- **可追溯**：每条 AI 发声都标注 Provider / Model / Skill，能复现能回滚
- **多模型并用**：Claude · OpenAI · Gemini · 任意 OpenAI 兼容端点；每个 Skill / 角色卡可独立绑定
- **可编程**：Skill = prompt + 触发规则 + 模型绑定 + 模板变量，导入导出都是 JSON
- **多角色同台**：酒馆舞台支持多 AI 角色按议题讨论，自带 token 预算与摘要压缩
- **数据自治**：SQLite + Markdown 落本地工作目录，可 Git 可 Obsidian；**应用不调任何上报端点**

> 💡 InkForge 不是在线服务，没有账号系统，没有云同步，也没有遥测。它是一个把 LLM 当成"协作者"而非"对话框"的本地 IDE。

---

## ✨ 核心能力

<table>
<tr><th>模块</th><th>能力</th></tr>
<tr>
  <td><b>编辑器</b></td>
  <td>TipTap 富文本 · 字数 / 字符 / token 实时统计 · Markdown 导入导出 · DB 1.2s + 磁盘 5s 双层 autosave · 崩溃恢复横幅 · 选段工具条（润色 / 审查 / 续写 / 代入）</td>
</tr>
<tr>
  <td><b>Provider</b></td>
  <td>Anthropic · OpenAI · Gemini · 任意 OpenAI 兼容；多 Key 轮询策略：single / round-robin / weighted / sticky + cooldown</td>
</tr>
<tr>
  <td><b>Skill 引擎</b></td>
  <td>5 触发：selection / every-n-chars / on-save / on-chapter-end / manual<br/>模板变量：<code>{{selection}}</code>、<code>{{chapter.*}}</code>、<code>{{character.*}}</code>、<code>{{vars.*}}</code><br/>5 条预设开箱即用</td>
</tr>
<tr>
  <td><b>酒馆</b></td>
  <td>多 AI 角色按议题讨论 · 导演 / 自动两种模式 · <code>lastK</code> 窗口 + 摘要压缩 · token 预算条 + 警戒提示</td>
</tr>
<tr>
  <td><b>人物 / 世界观</b></td>
  <td>书中人物档案 ↔ 酒馆角色卡双向同步（two-way / snapshot / detached）+ 冲突 diff · 世界观设定库（地点 / 门派 / 物件 / 事件 / 概念 + 自定义）支持别名</td>
</tr>
<tr>
  <td><b>资料检索</b></td>
  <td>Tavily · Bing · SerpAPI · LLM 综述 四 provider 可插拔；凭证 keystore 加密</td>
</tr>
<tr>
  <td><b>全文审查</b></td>
  <td>5 builtin 维度：人物一致 / 时间线 / 伏笔 / 世界观 / 语言风格<br/>+ Skill 维度可挂载 · Markdown 导出</td>
</tr>
<tr>
  <td><b>每日总结</b></td>
  <td>当天字数 + 最近章节 → 4 段 Markdown 日报</td>
</tr>
<tr>
  <td><b>CLI 终端</b></td>
  <td>内嵌 xterm.js + node-pty，可停靠（继承用户权限）</td>
</tr>
<tr>
  <td><b>Skill 市场</b></td>
  <td>拉取 registry · 一键安装 · 发布向导（skill.json + PR 说明）</td>
</tr>
</table>

---

## 📦 下载安装

到 [Releases](https://github.com/your-org/inkforge/releases) 下载对应平台的安装包：

| 平台 | 文件 | 备注 |
|---|---|---|
| Windows | `InkForge-x.y.z-x64-setup.exe` | NSIS 安装器，未签名时首次运行可能提示 |
| macOS | `InkForge-x.y.z-x64.dmg` / `-arm64.dmg` | 未公证时需在「系统设置 > 隐私与安全性」放行 |
| Linux | `InkForge-x.y.z.AppImage` / `.deb` | AppImage 加可执行权限即可运行 |

> 0.1.x 阶段所有构建均 **未签名**，运行时系统可能弹安全警告——这是正常现象。正式签名留待 0.2 稳定版。

---

## 🚀 从源码运行（开发者）

前置：**Node 20+**, **pnpm 9+**, 系统具备 C++ 工具链（用于 better-sqlite3 / node-pty 原生模块）。

```bash
git clone https://github.com/your-org/inkforge.git
cd inkforge

pnpm install
pnpm typecheck                 # turbo 全包检查 (17/17)
pnpm icons                     # 从 SVG 重新生成 .ico / .png 图标
pnpm --filter @inkforge/desktop dev          # 开发模式
pnpm --filter @inkforge/desktop run dist:win # 打包 Windows .exe 到 apps/desktop/release/
```

首次启动：

1. 选工作目录（Markdown + SQLite 会落到这里）
2. 添加 Provider，填 API Key（本地加密保存）
3. 新建项目 → 写 200 字 → 看右侧 Timeline 冒出第一条 AI 分析

详细架构与扩展点：[docs/architecture.md](docs/architecture.md)。
写自己的 Skill：[docs/skill-authoring.md](docs/skill-authoring.md)。

---

## 🗂 仓库结构

```
inkforge/
├─ apps/desktop/          Electron 壳：主进程 / preload / renderer / e2e
├─ packages/
│  ├─ shared/             IPC 契约 + domain types（被全包依赖）
│  ├─ storage/            better-sqlite3 + 12 版迁移 + keystore + 文件布局
│  ├─ llm-core/           LLMProvider 抽象 + 4 适配器 + token 估算
│  ├─ editor/             TipTap 扩展 + 200 字静默分析 hook
│  ├─ skill-engine/       Skill 解析 / 触发调度 / 模板渲染 / 市场拉取
│  ├─ tavern-engine/      多角色 ContextBuilder + Budget + Summary + Round
│  ├─ research-core/      资料检索 provider 抽象 + Tavily/Bing/Serp/LLM 4 adapter
│  └─ review-engine/      5 builtin 维度 + findings 解析 + 导出
├─ assets/                Logo / Banner / 图标资源
├─ docs/                  架构 / Skill 作者指南 / release notes 模板
├─ examples/sample-novel/ 上手示例项目
└─ scripts/               build-icons.cjs 等工具脚本
```

---

## 🔒 数据去哪了？

本应用**不连接任何错误收集 / 使用统计 / 内容上传端点**。诊断摘要需用户主动复制粘贴，API Key 已脱敏。

| 类别 | 路径 |
|---|---|
| 正文 | `<workspace>/projects/<name>/chapters/*.md`（纯文本，可任意编辑器打开） |
| 元数据 | `<workspace>/inkforge.db`（SQLite，可备份、可迁移） |
| 自动备份 | `<project>/.inkforge/autosave/<chapterId>.md`（5s 旁挂；恢复横幅出现时被引用） |
| API Key | 优先 OS Keychain（`keytar`），回退 AES-256-GCM 加密文件 `<workspace>/keystore.*` |
| 日志 | `<userData>/logs/main.log` · `renderer.log`（仅本地） |

---

## 🧪 验收脚本

```bash
pnpm --filter @inkforge/desktop run verify:all
# verify:migrations    迁移幂等性 + 20 表 + 21 索引（5 项）
# verify:engine        token 估算 + 预算 + 上下文拼接（15 项）
# verify:review-engine builtin + parse 容错 + summary + excerpt 定位（40 项）
# verify:provider      多 Key 轮询策略与 cooldown（26 项）
# verify:i18n          三语翻译 + 占位符一致 + coerceLang（25 项）

pnpm --filter @inkforge/desktop run bench:storage
# 默认 5×500×5：seed/list/get/update/feedback/vacuum 基线，回归对照用
# 调节：BENCH_PROJECTS / BENCH_CHAPTERS / BENCH_FEEDBACKS
```

参考基线（开发机 win32，2500 chapters / 12.5k feedbacks / 9.4 MiB DB）：

| 操作 | 耗时 |
|---|---|
| seed (transactional) | 241 ms |
| list_chapters × 5 projects | 4.75 ms |
| get_chapter_by_id × 2500 | 35 ms (~14 μs/op) |
| update_chapter × 1000 (tx) | 31 ms |
| VACUUM | 80 ms (9.39 → 9.18 MiB) |

---

## 🤝 贡献

欢迎以下类型的 PR：

- **新 Skill**：在 `inkforge-skills` registry 仓库提交 PR，或在本仓库 `packages/skill-engine/presets/*.json` 加预设
- **Provider 适配器**：`packages/llm-core` 加一个 `LLMProvider` 实现 + `instantiateProvider` switch 分支
- **Review 维度**：扩展 `packages/review-engine/src/index.ts` 的 `BUILTIN_DIMENSION_SPECS`
- **资料检索 Adapter**：`packages/research-core` 加 `<name>-adapter.ts`
- **Bug 复现**：开 Issue，附「复制诊断摘要」（开发者模式）粘贴的输出

提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)；安全相关请走 [SECURITY.md](SECURITY.md) 而不是公开 Issue。

---

## 📋 路线图

- ✅ M0 Scaffold · M1 能写 · M2 AI 陪写
- ✅ M3 Skill + 酒馆 + 人物双向同步（A/B/C/D/E）
- ✅ M4 体系化（审查 / 资料 / 世界观 / 每日总结 / 多 Key 轮询，60 断言）
- ✅ M5 打磨发布（开发者模式 / 欢迎向导 / 自动更新 / 打包矩阵 / Skill 市场 / 文档 / E2E）
- ✅ M6-D 持久化加固（双层 autosave + 崩溃标记 + 每周 VACUUM + 性能基线）
- 🚧 M7 体验打磨与社区生态

---

## 📄 协议

[MIT License](LICENSE) © 2026 InkForge contributors

Skill 模板 / 角色卡 / 示例小说遵循各自原作者协议；冲突时以仓库 `LICENSE` 为准。

---

<div id="-why-inkforge"></div>

## 🌍 Why InkForge (English)

Most writing toolchains keep "plain-text editor" and "AI chat" in separate worlds. Long-form authors need to track timelines across chapters, keep character voices consistent, brainstorm via multi-agent discussion — and LLM context windows quietly collapse first when billed by the token.

**InkForge** unifies these into a single **local-first** workstation:

- **Flow first** — the editor is center stage; every AI output lands in a right-side Timeline. No popups, ever.
- **Silent companion** — analysis fires every 200 characters in the background. Open it when you want, ignore it when you don't.
- **Auditable** — every AI emission is tagged with Provider / Model / Skill. Reproducible, reversible.
- **Multi-model native** — Claude · OpenAI · Gemini · any OpenAI-compatible endpoint. Each Skill or character card can bind its own.
- **Programmable** — a Skill is a JSON bundle of `prompt + triggers + model binding + template variables`. Import/export by file.
- **Multi-agent stage** — the *Tavern* lets multiple AI personas debate a topic, with token budgets and rolling summarization built-in.
- **Data sovereignty** — SQLite + Markdown in your chosen workspace. Git-friendly, Obsidian-friendly. **No telemetry endpoints, anywhere.**

> InkForge is not a hosted service. No accounts, no cloud sync, no analytics. It treats the LLM as a *collaborator*, not a chatbox.

See [docs/architecture.md](docs/architecture.md) for the design, and [docs/skill-authoring.md](docs/skill-authoring.md) to write your own Skills.

---

<div align="center">
  <sub>Built with TipTap · Electron · better-sqlite3 · React · TypeScript · ❤️ for novelists.</sub>
</div>
