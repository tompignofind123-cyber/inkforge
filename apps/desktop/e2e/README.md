# M5-G · E2E 冒烟测试

> 用 Playwright + Electron driver。默认 6 条骨架测试，运行需先 `pnpm build`。

## 跑法

```bash
pnpm --filter @inkforge/desktop run e2e:install   # 首次：装 Chromium
pnpm --filter @inkforge/desktop run e2e           # 跑测试
```

## 覆盖路径

1. 启动到主窗口：body 出现 "InkForge" 字样
2. 欢迎向导可完成（点"下一步" 5 次）
3. 新建项目 + 章节 + 写 200 字触发 Timeline
4. Skill 页能打开并列出预设
5. 审查页 ▶ 一键审查（走 INKFORGE_MOCK_LLM）出至少一条 finding
6. 诊断摘要按钮能把 "诊断摘要" 复制到剪贴板

## TODO

- 在关键 UI 节点加 `data-testid`（`onboarding-next` / `activity-skill` / `activity-review` /
  `open-settings` / `diag-copy`）
- 实装 `INKFORGE_MOCK_LLM=1` 时在 main 进程替换 LLMProvider（回一个 deterministic 流）
- 在 CI 中加 `e2e` job（需要额外安装 Chromium，CI 上用 `xvfb-run`）
