# 搭建与部署

本文从零开始说明如何运行公开版演示，以及如何接入数据库、登录、模型和生产部署。公开仓库不附带生产藏书或数据。

## 环境要求

- Node.js 20.9 或更高版本；
- pnpm 9；
- Git；
- PostgreSQL 14 或更高版本（仅完整数据、账户和后台功能需要）；
- `psql` 命令行工具（仅初始化 PostgreSQL 时需要）。

## 零配置启动

不配置数据库或密钥也可以运行原创演示内容：

```bash
git clone https://github.com/AmigaMeow/guanzizai.git
cd guanzizai
corepack enable
pnpm install --frozen-lockfile
pnpm run dev:next
```

浏览器打开 `http://localhost:3000`。此模式可以查看页面、原创阅读样例和本地降级问答，但账户、后台、模型生成和生产内容库不会完整启用。

提交改动前运行：

```bash
pnpm run typecheck
pnpm test
pnpm run build:next
```

## 本地环境变量

需要启用可选功能时，将示例文件复制到 Next.js 应用目录：

```bash
cp .env.example apps/web/.env.local
```

不要提交 `apps/web/.env.local`。主要变量如下：

| 功能 | 变量 | 说明 |
| --- | --- | --- |
| PostgreSQL | `DATABASE_URL` | 应用运行时连接；托管平台通常使用连接池地址 |
| 数据库维护 | `DATABASE_DIRECT_URL` | 初始化、迁移和批量导入使用的直连地址 |
| 发布内容库 | `CONTENT_DATABASE_ENABLED` | 数据库完成初始化和核验后才设置为 `true` |
| 用户会话 | `AUTH_SESSION_SECRET` | Cookie 签名密钥，必须使用长随机值 |
| 管理后台 | `ADMIN_ACCESS_TOKEN` | 管理员登录令牌，必须与会话密钥不同 |
| 管理后台 | `ADMIN_USERNAME`、`ADMIN_ENTRY_PATH` | 可选管理员名称和自定义入口 |
| OAuth | `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` | 可选 GitHub 登录 |
| OAuth | `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | 可选 Google 登录 |
| 邮箱登录 | `SMTP_*` | 可选 SMTP 登录邮件配置 |
| AI 功能 | `NEWAPI_API_KEY`、`NEWAPI_BASE_URL`、`NEWAPI_MODEL` | 可选 OpenAI 兼容网关 |
| 对象存储 | `R2_*`、`ASSET_BASE_URL` | 可选私有内容对象和资源域名 |

可以用本机工具生成彼此独立的随机密钥，例如：

```bash
openssl rand -base64 48
openssl rand -hex 32
```

OAuth 回调地址分别为：

```text
https://你的域名/auth/github/callback
https://你的域名/auth/google/callback
```

## 初始化 PostgreSQL

全新数据库先执行完整结构文件。下面的环境变量只存在于当前终端，不要把真实连接串写进仓库：

```bash
export DATABASE_DIRECT_URL='postgresql://db.example.invalid/guanzizai'
psql "$DATABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -f postgres/schema.sql
```

请把 `example.invalid` 示例替换为数据库服务商提供的完整直连地址。

`postgres/schema.sql` 是新数据库的完整基线。已有旧数据库升级时使用：

```bash
pnpm run migrate:reader-platform
```

迁移脚本读取 `DATABASE_DIRECT_URL`，并兼容部分托管平台提供的 `DATABASE_URL_UNPOOLED` 或 `DATABASE_POSTGRES_URL_NON_POOLING`。执行任何内容导入前，应先在测试数据库检查来源、许可和发布状态。

## Vercel 部署

1. 在 Vercel 导入 GitHub 仓库。
2. 将项目 Root Directory 设置为 `apps/web`，Framework Preset 选择 Next.js。
3. 在首次生产部署前创建 PostgreSQL，并执行 `postgres/schema.sql`。
4. 在 Vercel Production 环境至少设置：
   - `DATABASE_URL`；
   - `DATABASE_DIRECT_URL`；
   - `CONTENT_DATABASE_ENABLED=true`；
   - `AUTH_SESSION_SECRET`；
   - `ADMIN_ACCESS_TOKEN`。
5. 按需添加 OAuth、SMTP、模型网关和 R2 变量。
6. 部署后检查首页、`/sutras`、`/read/sample-work/1`、`/ask`、`/api/daily` 以及你的管理入口。

生产构建保留了 `scripts/verify-production-env.mjs` 闸门。Vercel Production 缺少数据库、会话或管理员配置时，构建会主动失败，避免残缺版本覆盖正常站点。不要删除或绕过该闸门。

## Cloudflare Workers

仓库保留了 OpenNext for Cloudflare 配置。部署前先修改 `apps/web/wrangler.toml` 中的 Worker 名称和所需绑定，再通过 Wrangler secrets 配置敏感值，最后运行：

```bash
pnpm run deploy:next
```

Cloudflare 与 Vercel 的环境变量和数据库网络条件不同。正式使用前应在 Preview 环境验证 PostgreSQL、R2、登录回调和动态 API，不要直接把未验证配置推到生产环境。

## 上线前检查

- 仓库和构建日志中没有密钥、数据库地址或用户数据；
- `CONTENT_DATABASE_ENABLED=true` 前已确认数据库结构和公开内容；
- 只导入有权使用或依法属于公有领域的文本；
- OAuth 回调域名、SMTP 发信地址和管理员入口正确；
- 公开版不包含收款、赞助、募捐或支付功能；
- 390px、768px 和桌面宽度均无横向溢出或遮挡；
- `pnpm run typecheck`、`pnpm test` 和 `pnpm run build:next` 全部通过。

遇到安全问题请按 [SECURITY.md](../SECURITY.md) 私下报告。
