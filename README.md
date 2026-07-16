# XMail

基于 Cloudflare Email Routing、Workers、Pages 和 D1 的轻量邮箱管理平台。XMail 可以接收并保存域名邮件，提供用户收件箱、管理员后台、验证码提取、TOTP（2FA）、REST API，以及可供 AI Agent 调用的 MCP 服务。

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://github.com/jhxxr/xmail)
[![Astro](https://img.shields.io/badge/Astro-5-BC52EE?logo=astro&logoColor=white)](https://github.com/jhxxr/xmail)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://github.com/jhxxr/xmail)
[![pnpm](https://img.shields.io/badge/pnpm-10+-F69220?logo=pnpm&logoColor=white)](https://github.com/jhxxr/xmail)
[![MCP](https://img.shields.io/badge/MCP-47_tools-5865F2)](MCP.md)

## 功能

- **邮件接收**：通过 Cloudflare Email Routing Catch-all 规则将邮件交给 Worker，解析后写入 D1。
- **邮箱管理**：批量创建、分配、共享、停用、设置有效期和密码，支持软删除与回收站恢复。
- **用户收件箱**：通过用户访问密钥或邮箱密码登录，查看、搜索、标星和删除邮件。
- **验证码提取**：从不同语言和格式的邮件中识别 4～8 位数字或字母数字验证码。
- **管理员仪表盘**：展示用户、邮箱、邮件、分配状态等统计信息，并提供邮件与操作日志清理能力。
- **2FA 管理**：导入、生成、分配和使用 TOTP；支持二维码扫描与手动输入密钥。
- **第三方账号**：管理外部邮箱服务商、账号和关联服务，并按用户授权访问。
- **API 与 MCP**：使用独立 API Key 调用 REST API，或通过 MCP 的 47 个工具完成批量自动化。
- **审计能力**：关键管理操作写入日志，可按时间范围清理。

## 技术架构

```text
Incoming email
      │
      ▼
Cloudflare Email Routing
      │ Catch-all → Worker
      ▼
apps/email-worker ──────► Cloudflare D1
                               ▲
                               │ DB binding
                               │
                        apps/web (Pages)
                         ├─ 用户收件箱
                         ├─ 管理员后台
                         ├─ REST API
                         └─ MCP endpoint
```

| 目录 | 说明 |
| --- | --- |
| `apps/email-worker` | 接收并解析邮件的 Cloudflare Email Worker |
| `apps/web` | Astro + React Web 应用、管理后台、REST API 与 MCP 服务 |
| `packages/database` | Drizzle schema、DAO 和数据库工具 |
| `API.md` | REST API 使用说明 |
| `MCP.md` | MCP 配置、工具和工作流说明 |

主要技术栈：Astro 5、React 19、Tailwind CSS 4、Drizzle ORM、Cloudflare D1、PostalMime 和 TypeScript。

## 部署前准备

- Node.js 20 或更高版本
- pnpm 10 或更高版本（也可以通过 Corepack 使用）
- Cloudflare 账号，以及已接入 Cloudflare 的域名
- 已启用 Cloudflare Email Routing
- Wrangler 登录状态：`pnpm --filter web exec wrangler login`

## 快速部署

### 1. 安装依赖

```bash
git clone https://github.com/jhxxr/xmail.git
cd xmail
corepack enable
pnpm install
```

### 2. 创建 D1 数据库

```bash
pnpm --filter web exec wrangler d1 create xmail-db
```

记下命令返回的 `database_id`，然后替换以下两个文件中的示例数据库 ID：

- `apps/web/wrangler.toml`
- `apps/email-worker/wrangler.toml`

两个应用必须绑定同一个 D1 数据库，binding 名称保持为 `DB`。

### 3. 初始化数据库

仓库不会提交 Drizzle 自动生成的 SQL。首次部署时先生成迁移：

```bash
pnpm db:generate
```

生成文件位于 `packages/database/drizzle/`。将生成的 SQL 应用到远程 D1（把文件名替换为实际生成的文件）：

```bash
pnpm --filter web exec wrangler d1 execute xmail-db --remote --file=../../packages/database/drizzle/0000_xxx.sql
```

> `packages/database/drizzle/` 已被 `.gitignore` 忽略。生产环境需要自行妥善保存迁移记录；更新 schema 后应重新生成并按顺序执行新增 SQL。

### 4. 配置 Web 应用

修改 `apps/web/wrangler.toml`：

```toml
[vars]
MAIL_DOMAIN = "mail.example.com"
```

`MAIL_DOMAIN` 是首次运行时的默认邮箱域名。部署后可在「系统设置」中添加多个域名并修改默认值。

Web 应用需要以下 Secrets：

| 名称 | 必需 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | 是 | 管理员和用户会话的 JWT 签名密钥，建议使用至少 32 字节随机值 |
| `ADMIN_PASSWORD` | 是 | 创建首个管理员时使用的初始密码 |
| `ENCRYPTION_KEY` | 使用第三方账号时 | 加密第三方账号密码；生产环境不要使用代码中的默认回退值 |

可以在 Cloudflare Dashboard 的 Pages 项目设置中添加，也可以在 Pages 项目创建后执行：

```bash
cd apps/web
pnpm exec wrangler pages secret put JWT_SECRET --project-name xmail
pnpm exec wrangler pages secret put ADMIN_PASSWORD --project-name xmail
pnpm exec wrangler pages secret put ENCRYPTION_KEY --project-name xmail
cd ../..
```

生成随机密钥的示例：

```bash
openssl rand -hex 32
```

### 5. 部署

部署 Web 应用和 Email Worker：

```bash
pnpm deploy
```

也可以分别部署：

```bash
pnpm --filter web deploy
pnpm --filter email-worker deploy
```

Windows 用户还可以运行：

```bat
deploy.bat
```

部署命令不会自动创建数据库或执行迁移。

### 6. 配置 Email Routing

在 Cloudflare Dashboard 中进入对应域名的 **Email → Email Routing → Routing rules**：

1. 启用 Email Routing。
2. 添加 Catch-all 规则。
3. 将 Action 设置为 **Send to a Worker**。
4. 选择 `xmail-email-worker`。

每个在 XMail 中启用的邮箱域名都需要配置邮件路由。Worker 只保存已创建、已启用且未过期邮箱收到的邮件。

### 7. 初始化管理员

访问：

```text
https://<你的 Pages 域名>/admin/login
```

输入任意首个管理员用户名，并使用 `ADMIN_PASSWORD` 作为密码。系统会创建首个管理员；之后使用数据库中的管理员凭据登录。

## 本地开发

先生成迁移，再初始化本地 D1：

```bash
pnpm db:generate
cd apps/web
pnpm exec wrangler d1 execute xmail-db --local --file=../../packages/database/drizzle/0000_xxx.sql
cd ../..
```

在 `apps/web/.dev.vars` 中配置本地 Secrets（不要提交此文件）：

```dotenv
JWT_SECRET=replace-with-a-random-secret
ADMIN_PASSWORD=replace-with-a-strong-password
ENCRYPTION_KEY=replace-with-a-random-secret
```

启动 Web 开发服务器：

```bash
pnpm dev
```

调试 Email Worker：

```bash
pnpm --filter email-worker dev
```

如果 Web 和 Email Worker 都使用本地 D1，请确保它们指向同一份 Wrangler 本地持久化数据；否则建议使用 `--remote` 联调测试数据库。

## 使用说明

### 管理员后台

后台入口为 `/admin`，包括：

- 概览与详细统计
- 用户、邮箱、共享邮箱和回收站管理
- 第三方邮箱与外部账号管理
- 2FA/TOTP 创建、导入和用户分配
- 服务模板与邮箱服务关联
- 全局邮件查看、搜索和清理
- 操作日志查看与按范围清理
- API Key 创建、撤销和删除
- 邮箱域名与邮件保留策略设置

邮件保留天数只定义清理范围；当前版本需要在「系统设置」中手动触发清理，或通过 MCP/API 自动化调用清理工具。

### 用户访问

用户可以通过两种方式进入收件箱：

1. 使用管理员分配的用户密钥访问 `https://your-domain/?key=xmail_user_xxx`。
2. 在首页输入邮箱地址和邮箱密码。

用户只能看到已分配给自己或与自己共享的邮箱、2FA 条目和第三方账号。

## API 与 MCP

### REST API

在 `/admin/api-keys` 创建 API Key 后，可以获取指定邮箱最近邮件中的验证码：

```bash
curl "https://your-domain/api/v1/admin/verification-code?mailbox=test@example.com&seconds=600" \
  -H "Authorization: Bearer sk_live_xxx"
```

API Key 只在创建时显示完整值，请立即保存。接口参数和返回结构见 [API.md](API.md)。

### MCP

MCP HTTP endpoint：

```text
https://your-domain/api/mcp
```

复制示例配置并替换域名和 API Key：

```bash
cp .mcp.json.example .mcp.json
```

当前源码提供 47 个 MCP 工具，覆盖验证码、用户、邮箱、共享邮箱、邮件搜索、清理、统计、日志和服务绑定等操作。完整配置与示例见 [MCP.md](MCP.md)。

## 数据模型

| 表 | 用途 |
| --- | --- |
| `admins` | 管理员账号 |
| `users` | 用户和访问密钥 |
| `mailboxes` / `user_mailboxes` | 邮箱及用户分配关系 |
| `emails` | 收到的邮件、正文、Headers、已读和标星状态 |
| `two_factor_entries` / `user_two_factor_entries` | TOTP 条目及用户分配关系 |
| `service_templates` / `mailbox_services` | 服务模板及邮箱服务关联 |
| `external_providers` / `external_accounts` | 第三方服务商与外部账号 |
| `user_external_accounts` / `external_account_services` | 外部账号授权和服务关联 |
| `api_keys` | REST API 与 MCP 的访问密钥 |
| `settings` | 域名、保留天数等全局设置 |
| `logs` | 管理操作审计日志 |

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Web 开发服务器 |
| `pnpm build` | 构建 Web 应用 |
| `pnpm deploy` | 依次部署 Web 和 Email Worker |
| `pnpm --filter email-worker dev` | 启动 Email Worker 开发模式 |
| `pnpm db:generate` | 根据当前 Drizzle schema 生成 SQL 迁移 |
| `pnpm --filter web exec wrangler d1 execute ...` | 将指定 SQL 应用到本地或远程 D1 |

## 常见问题

### 收不到邮件

确认域名的 MX 记录和 Email Routing 已启用，Catch-all 指向 `xmail-email-worker`，并确认收件地址已在 XMail 中创建、启用且未过期。

### 登录后立即返回登录页

检查 Pages 项目是否设置了 `JWT_SECRET`。修改该值会使现有会话失效，需要重新登录。

### 第三方账号无法解密

确认 Pages 项目设置了稳定的 `ENCRYPTION_KEY`。部署后更换该值会导致此前加密的数据无法正常解密。

### 页面显示的邮箱域名不正确

首次部署检查 `MAIL_DOMAIN`；运行后前往「系统设置」维护域名列表并设置默认域名。

### 修改 schema 后部署失败

应用代码前先运行 `pnpm db:generate`，检查生成的 SQL，并使用 Wrangler 将新增迁移应用到目标 D1。`pnpm deploy` 本身不会迁移数据库。

## 更多文档

- [REST API 说明](API.md)
- [MCP 使用指南](MCP.md)
