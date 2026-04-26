# Changelog

All notable changes to InkForge (墨炉) will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), adhering to [SemVer](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0-beta.0] — 2026-04-21

First public beta. Core writing flow + AI collaboration + release infra complete.

### 🎯 本次重点

从 "本地 Markdown 编辑器" 升级到 "可 Beta 发布的 AI 协作写作台"：编辑器 + 5 触发 Skill + 多 AI 酒馆 + 5 维度全文审查 + 4 provider 资料检索 + 每日总结 + 多 Key 轮询 + 欢迎向导 + 诊断摘要 + 自动更新 + Skill 市场 MVP。

### 🚀 新功能

- **M0–M2**：Electron + TipTap + 200 字静默分析 + 多 provider（Claude/OpenAI/Gemini/OpenAI 兼容）+ 每日进度
- **M3-A Outline / Skill schema**
- **M3-B Skill 引擎**：5 种触发（selection / every-n-chars / on-save / on-chapter-end / manual）+ 模板变量 + 5 条预设
- **M3-C 人物档案 + 酒馆角色卡 + 双向同步**
- **M3-D 酒馆**：多 AI 角色按议题讨论 + token 预算 + 摘要压缩
- **M4-B 全文审查**：5 builtin 维度 + Markdown 导出
- **M4-C 世界观设定库**
- **M4-D 资料检索**：Tavily / Bing / SerpAPI / LLM 综述 4 provider
- **M4-E 每日总结**：基于字数和最近章节生成 Markdown 日报
- **M4-F Provider 多 Key 轮询**：single / round-robin / weighted / sticky + cooldown
- **M5-A 开发者模式 + 诊断摘要**：菜单 / StatusBar 入口；API Key 自动脱敏
- **M5-B 欢迎向导**：五步 stepper（欢迎 / 工作目录 / Provider / 示例 / 完成）
- **M5-C 自动更新**：electron-updater + generic provider；未签名时降级为"访问下载页"
- **M5-D 打包矩阵**：win/mac/linux 三平台，GitHub Actions release workflow
- **M5-E Skill 市场**：拉取 registry + 一键安装 + 发布向导（skill.json + PR 说明）
- **M5-F 文档**：README + architecture.md + skill-authoring.md + release notes 模板 + 示例项目
- **M5-G E2E 冒烟**：Playwright + Electron driver，6 条骨架

### 🔐 安全

- 零上报：本应用不连接任何错误收集 / 使用数据端点；诊断摘要需用户主动复制，API Key 已脱敏
- API Key 本地存储：优先 OS Keychain（keytar），不可用时回退 AES-GCM 加密文件

### ✅ 验收

- `pnpm typecheck` 全绿（17/17）
- `pnpm --filter @inkforge/desktop run verify:all` 60 项自动断言全过
  - verify:migrations（5 项）
  - verify:engine（15 项）
  - verify:review-engine（40 项）

### 📦 下载

Win/Mac/Linux 未签名构建来自 GitHub Actions，运行时可能触发系统安全警告，请用户酌情允许。正式签名留待 0.1.0 稳定版。

---

## 模板（下次写这里）

## [Unreleased]

### 新功能
- **M6-D 持久化加固**
  - 编辑器双层落盘：DB 1.2s 防抖写之外新增 5s `<project>/.inkforge/autosave/<chapterId>.md` 旁挂；切换章节时 `chapter:autosave-peek` 检测残留并提供「恢复 / 丢弃」横幅
  - 主进程崩溃标记：`<userData>/session.lock` 启动写入、`before-quit` 清除；`uncaughtException` / `unhandledRejection` 写回 reason 供下次启动展示
  - 每周 VACUUM 调度器：状态持久化于 `<workspaceDir>/maintenance.json`，启动 30s 后判定 + 每 24h 重检；不到一周直接跳过
  - 性能基准脚本 `pnpm --filter @inkforge/desktop run bench:storage`：可调规模（默认 5×500×5），覆盖 list/get/update/feedback/vacuum

### 改进
### 修复
### 安全
### 破坏性变更

### Improvements
- Wired the curated provider catalog into onboarding and provider settings.
- Added preset-driven autofill for vendor/base URL/default model and model suggestions via datalist.
- Added validation for openai-compat providers to require a non-empty base URL before saving.

### Fixes
- Updated provider connection testing to instantiate providers via the runtime registry (`createProvider`) instead of forcing Anthropic.
- Provider test now supports vendor-aware checks and allows keyless openai-compat tests for local endpoints.
