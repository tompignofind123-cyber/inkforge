<!-- 谢谢提交 PR！请在合并前确认下面几点 -->

## 改动摘要 / Summary

<!-- 1-3 句话说明这个 PR 解决了什么、动机是什么。"为什么"比"什么"重要。 -->

## 关联 Issue / Linked issues

<!-- 关闭某 Issue：Closes #123 / Fixes #456 -->

## 改动类型 / Type

- [ ] 🐛 Bug fix
- [ ] ✨ 新功能 / New feature
- [ ] 🔨 重构 / Refactor（不改外部行为）
- [ ] 📝 文档 / Docs
- [ ] 🧪 测试 / Tests
- [ ] 🔧 构建 / CI / 工具
- [ ] 💔 破坏性变更 / Breaking change（请在下方说明迁移路径）

## 测试 / Test plan

<!-- 怎么确认这个改动是对的？最好是可机器验证的命令；UI 改动请贴截图或录屏。 -->

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm --filter @inkforge/desktop run verify:all` 通过
- [ ] 涉及 schema/IPC 改动时，相关 verify 脚本与文档已同步

## 截图 / Screenshots（UI 改动时）

<!-- 拖图过来即可 -->

## 自检清单 / Checklist

- [ ] 我读过 [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] commit message 遵循 Conventional Commits
- [ ] 没有把 `.env`、API Key、`apps/desktop/release/` 产物或大件二进制提进版本库
- [ ] 没有在源码里写死个人路径或测试 token
- [ ] 没有引入新的网络上报端点（破坏 InkForge 零遥测承诺）
