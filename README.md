# 观自在 Guanzizai

观自在是一个面向经文与古籍阅读的 Next.js 应用，包含原文优先的对照阅读、检索、引用式问答、内容审核、账户与后台管理等功能。

本仓库是经过脱敏的源码公开版本，只附带少量原创虚构文本用于演示功能。它不包含生产站点的藏经阁书籍、真实译文、预生成回答、数据库、用户数据、支付信息或密钥。

## 许可方式

本项目是 **source-available（源码可见）** 项目，不是 OSI 定义的开源软件。

- 非商业使用适用 [PolyForm Noncommercial License 1.0.0](LICENSE)。
- 商业使用、商业部署、收费服务、企业内部商业用途或其他预期商业应用，必须事先取得版权所有者的明确书面许可。
- 商业授权咨询：`admin@guanzizai.org`。发送邮件或收到回复不等于已经授权，只有明确写明授权范围的书面许可才有效。
- 复制、修改或分发时，必须同时保留许可证和 [NOTICE](NOTICE) 中以 `Required Notice:` 开头的归属声明，包括原仓库链接。

完整边界见 [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)、[CONTENT-LICENSE.md](CONTENT-LICENSE.md) 和 [TRADEMARKS.md](TRADEMARKS.md)。

## 内容边界

仓库中的演示文本是为测试功能而写的虚构内容，不代表生产站点藏书。

自行部署时，你只能导入以下内容：

- 自己拥有版权的内容；
- 已取得明确授权的内容；
- 经当地法律确认属于公有领域或可依法使用的内容。

软件许可不授予任何未随仓库发布的书籍、经文版本、译文、生产数据或用户数据的权利。不得因为本项目能够导入或展示文本，就推定某个文本可以被复制、公开或商用。

## 技术结构

- `apps/web`：当前主线，Next.js / React / TypeScript。
- `scripts`：内容导入、审核、迁移和工程辅助脚本。
- `postgres`、`migrations`：数据库结构与迁移。
- `test`：自动化测试。

生产环境校验脚本 `scripts/verify-production-env.mjs` 是部署安全闸门，不应删除或绕过。

## 本地运行

需要 Node.js、pnpm 9 和 PostgreSQL（仅数据库功能需要）。

```bash
pnpm install
pnpm run dev:next
```

默认开发地址由 Next.js 输出，通常为 `http://localhost:3000`。

验证：

```bash
pnpm run typecheck
pnpm test
pnpm run build:next
```

复制 `.env.example` 中需要的变量到未提交的本地环境文件。不要把真实密钥、数据库地址或生产数据提交到仓库。

## 贡献与安全

提交代码前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要在公开 Issue 中披露凭据或可利用细节。

## 第三方材料

第三方依赖继续适用各自许可证。字体 `guanzizai-cjk-ext-fallback.woff2` 及其修改说明适用随附的 `apps/web/public/fonts/ARPHICPL.txt` 和 `apps/web/public/fonts/NOTICE-Guanzizai-CJK-Extension-Fallback.txt`，该第三方字体许可优先于本仓库的软件许可。

Required Notice: Copyright 2026 AmigaMeow. Guanzizai source repository: https://github.com/AmigaMeow/guanzizai
