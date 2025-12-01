# XMail - Cloudflare Workers 驱动的轻量邮箱中台

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](#)
[![Astro](https://img.shields.io/badge/Astro-5.14-BC52EE?logo=astro&logoColor=white)](#)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](#)
[![PNPM](https://img.shields.io/badge/pnpm-10+-F69220?logo=pnpm&logoColor=white)](#)

> XMail 将 Cloudflare Email Routing、Workers、Pages 与 D1 组合成一套「无服务器」邮箱收取与派发平台，提供带权限控制的管理员后台与 API-Key 访问方式，轻量却可扩展。

## 目录
- [特性亮点](#特性亮点)
- [架构概览](#架构概览)
- [项目结构](#项目结构)
- [前置条件](#前置条件)
- [快速上手](#快速上手)
- [环境变量与 Secrets](#环境变量与-secrets)
- [本地开发](#本地开发)
- [数据库与迁移](#数据库与迁移)
- [使用说明](#使用说明)
- [常见问题](#常见问题)
- [脚本速查](#脚本速查)

## 特性亮点
- **端到端边缘化**：邮件接收、API、前端全部托管在 Cloudflare 网络，无需自建服务器或持久进程。
- **功能完善的管理员工作台**：支持用户管理、批量生成邮箱、密码/有效期/状态管理、邮箱分配、服务模板、操作日志、回收站等完整运营能力。
- **用户体验优化**：用户可直接携带 `API Key`（`/?key=xmail_xxx`）免登录访问，也可使用绑定邮箱密码。内置验证码提取算法与邮件预览，适合收取验证码类邮件。
- **安全防护**：JWT 基于 `JWT_SECRET` 签名，管理员初次登录由 `ADMIN_PASSWORD` 初始化；支持邮箱密码、停用/过期、操作审计，避免被滥用。
- **可扩展的数据模型**：使用 Drizzle ORM 定义多表 schema，并以 DAO 方式复用在 Worker 与 Web 之间。可轻松扩展新的实体或联表查询。

## 架构概览
XMail 由三个 Cloudflare 组件构成：
1. **Email Worker (`apps/email-worker/`)**：通过 Email Routing 收到邮件后解析并持久化到 D1。
2. **Web/Edge App (`apps/web/`)**：Astro + React 构建的 UI，同时暴露管理员面板、用户邮箱视图及 API。
3. **共享数据库层 (`packages/database/`)**：集中定义 schema、DAO、工具函数，供 Worker 与 Web 直接导入使用。

```text
                          ┌────────────────────┐
Incoming Email ───────▶   │ Cloudflare Email   │
                          │ Routing (Catch-all)│
                          └────────┬───────────┘
                                   │
                                   ▼
                          ┌────────────────────┐
                          │ Email Worker       │
                          │ (apps/email-worker)│
                          └────────┬───────────┘
                                   │ D1 binding (DB)
                                   ▼
                          ┌────────────────────┐
                          │ Cloudflare D1      │
                          └────────┬───────────┘
                                   │
                                   ▼
                          ┌────────────────────┐
                          │ Web App / API      │
                          │ (apps/web on Pages)│
                          └────────────────────┘
```

## 项目结构
```
xmail/
├── apps/
│   ├── web/            # Astro + React 应用，提供用户/管理员界面及 API
│   └── email-worker/   # 邮件接收 Worker，解析邮件并写入 D1
├── packages/
│   └── database/       # Drizzle schema、DAO、工具函数、迁移脚本
├── migration-*.sql     # 历史迁移备份（可选）
├── package.json        # 根 scripts（dev/build/deploy/db::*）
└── pnpm-workspace.yaml # Monorepo workspace 配置
```

## 前置条件
- Cloudflare 账号 & 已接入域名（启用 Email Routing）。
- 已安装 `pnpm >= 10`、`Node.js >= 20`、`wrangler >= 4.18`。
- 本地具备 `git`、`openssl`（用于生成随机密钥）等基础工具。
- 建议准备一个供测试用的子域，例如 `mail.example.com`。

## 快速上手
1. **克隆仓库并安装依赖**
   ```bash
   git clone https://github.com/your-org/xmail.git
   cd xmail
   pnpm install
   ```
2. **创建 D1 数据库**
   ```bash
   wrangler d1 create xmail-db
   # 记录 CLI 返回的 database_id，稍后写入两个 wrangler.toml
   ```
3. **执行数据库迁移**
   ```bash
   wrangler d1 execute xmail-db --file=packages/database/drizzle/0001_init.sql
   ```
4. **配置运行时变量**
   - 在 Cloudflare Dashboard > Workers > `xmail` > Settings > Variables 中设置：
     - `JWT_SECRET`：32+ 位随机字符串，可用 `openssl rand -hex 32` 生成。
     - `ADMIN_PASSWORD`：管理员首次登录时的初始化密码。
   - 编辑 `apps/web/wrangler.toml` 中 `[vars]`：
     ```toml
     MAIL_DOMAIN = "your-domain.com"
     ```
   - 两个 `wrangler.toml` 的 `[[d1_databases]]` 段中 `database_id` 替换为步骤 2 的值。
5. **部署 Email Worker**
   ```bash
   cd apps/email-worker
   pnpm deploy
   ```
6. **配置 Cloudflare Email Routing**
   进入 Cloudflare Dashboard → 域名 → Email → Email Routing：
   1. 启用 Email Routing；
   2. 添加 Catch-all 规则并将目标设置为 Worker → `xmail-email-worker`。
7. **部署 Web 应用（Cloudflare Pages）**
   ```bash
   cd apps/web
   pnpm deploy  # Astro build + wrangler pages deploy dist
   ```
   完成后即可访问 `https://<pages-project>.pages.dev/`（或自定义域名）。

## 环境变量与 Secrets
| 作用域 | 键名 | 类型 | 说明 |
| --- | --- | --- | --- |
| Worker & Web | `DB` | D1 binding | 由 wrangler 自动注入，指向同一个 D1 实例 |
| Worker & Web | `JWT_SECRET` | Secret | JWT 签名密钥，所有 token 验证依赖此值 |
| Worker & Web | `ADMIN_PASSWORD` | Secret | 首位管理员初始化密码，创建成功后可在后台修改 |
| Web | `MAIL_DOMAIN` | 普通变量 | 用于 UI 显示与邮箱生成的默认域名 |

> Secrets 需在 Dashboard 或 `wrangler secret put` 中设置，避免直接写入仓库。

## 本地开发
```bash
# 1. 安装依赖
pnpm install

# 2. 启动 Web 端开发服务器（默认指向远程 D1，可借助 wrangler dev --remote）
pnpm dev

# 3. 如需调试 Email Worker，可在 apps/email-worker 下运行
pnpm --filter email-worker dev --remote
```

- 默认 `pnpm dev` 会运行 `pnpm --filter web dev`，可在 Astro Dev Server 中体验 UI。
- 若想连接本地 D1，需先 `wrangler d1 execute ... --local` 并在 `wrangler.toml` 中开启 `preview_database_id`。
- `pnpm build` / `pnpm deploy` 会按顺序构建/部署 Web 和 Worker，方便持续交付。

## 数据库与迁移
- Schema 与 DAO 位于 `packages/database/`，复用 Drizzle ORM。
- 自动生成的迁移文件默认存放在 `packages/database/drizzle/`。
- 常用命令：
  ```bash
  pnpm db:generate   # 基于 Drizzle schema 生成 SQL 迁移
  pnpm db:migrate    # 将迁移推送到目标 D1
  ```
- 表结构概览：
  - `admins` / `users`：管理员账户与 API Key 持有者。
  - `mailboxes`：邮箱实例，包含密码、状态、有效期、归属、删除信息。
  - `emails`：邮件正文记录，含 headers、HTML/TXT、只读状态。
  - `logs`：管理员操作日志，追踪敏感变更。
  - `settings`：全局配置（如默认域名）。
  - `service_templates`、`mailbox_services`：服务模板以及邮箱与服务间的关联。

## 使用说明
### 管理员面板
1. 访问 `/admin/login`，使用 `ADMIN_PASSWORD` 初始化管理员账号。
2. 仪表盘提供总览数据以及常用入口（创建用户、批量生成邮箱、分配邮箱、查看邮件）。
3. 主要能力：
   - **用户管理**：生成 `xmail_user_xxx` token，为每位用户分配邮箱。
   - **邮箱管理**：批量生成、导入邮箱，配置密码、备注、有效期、停用/恢复、软删除。
   - **服务模板**：预先录入常用业务的登录链接，快速挂载到邮箱。
   - **邮件审阅**：查看任意邮箱的收件列表、标记已读、删除敏感邮件。
   - **回收站**：误删邮箱可在 `Trash` 页面恢复。
   - **操作日志**：所有关键操作均写入 `logs`，可回溯责任人。

### 最终用户
- **方式一（推荐）**：访问 `https://your-xmail-site/?key=xmail_xxx`，系统会自动设置 `user_token` Cookie 并重定向到收件箱。
- **方式二**：为某个邮箱设置密码后，可在首页输入邮箱地址 + 密码登录。
- Web 端支持：
  - 邮件列表、搜索、未读统计；
  - 邮件详情页 `/mail/<id>`，可复制正文、查看 headers；
  - 自动提取验证码（4~8 位，带上下文校验）并突出显示；
  - 将邮箱关联的服务列表展示为快捷链接，便于回到业务系统。

## 常见问题
- **邮件收不到 / Worker 没触发**：确认 Email Routing Catch-all 规则指向 `xmail-email-worker`，并确保域名的 MX 记录由 Cloudflare 自动托管。
- **管理员登录后立即跳转回登录页**：检查 `JWT_SECRET` 是否在 Worker 与 Pages 两端一致；如果曾更新密钥，需要重新登录。
- **显示的域名不是预期值**：前端的默认域由 `MAIL_DOMAIN` 控制，修改 `wrangler.toml` 后重新部署。
- **D1 超时或配额不足**：可开启 Workers Paid Plan 或考虑读多写少的场景中使用 R2/kv 做缓存。

## 脚本速查
| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Web (Astro) 开发服务器 |
| `pnpm build` | 构建 Web 应用（`apps/web`） |
| `pnpm deploy` | 依次部署 Web (Pages) 与 Email Worker |
| `pnpm --filter email-worker dev` | 本地调试 Email Worker |
| `pnpm db:generate` | 根据最新 schema 生成 Drizzle 迁移 |
| `pnpm db:migrate` | 将迁移应用到绑定的 D1 |

如需更多改造（例如加入 Webhook、批量导出、GraphQL API 等），可直接在 `packages/database` 扩展 schema，并在 Worker/Web 中复用同一套 DAO。
