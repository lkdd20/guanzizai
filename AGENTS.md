# AGENTS.md

本仓库只用于观自在经文阅读项目。

## 主线

- 当前应用位于 `apps/web`，使用 Next.js / React / TypeScript。
- 新页面、新交互、新后台和 Agent 功能优先修改 `apps/web`。

## 公开仓库约束

- 不得加入藏经阁书籍、真实译文、预生成回答、生产数据、用户数据、支付信息或密钥。
- 测试和演示内容只能使用原创虚构文本。
- 原文始终优先，AI 白话只作辅助并明确标识。
- 不得移除或绕过 `scripts/verify-production-env.mjs`。
- 修改后至少运行 `pnpm run typecheck` 和 `pnpm test`；涉及生产构建风险时运行 `pnpm run build:next`。
- 新页面和交互同时检查 390px、768px 和桌面宽度，不得横向溢出或遮挡主内容。
- 提交前核对 Git 身份为 `AmigaMeow <AmigaMeow@users.noreply.github.com>`。

许可和内容边界见 `LICENSE`、`NOTICE`、`CONTENT-LICENSE.md` 和 `PUBLIC_RELEASE_MANIFEST.md`。
