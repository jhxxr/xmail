# XMail - Cloudflare Workers 驱动的轻量邮箱中台

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](#)
[![Astro](https://img.shields.io/badge/Astro-5.14-BC52EE?logo=astro&logoColor=white)](#)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](#)
[![PNPM](https://img.shields.io/badge/pnpm-10+-F69220?logo=pnpm&logoColor=white)](#)
[![MCP](https://img.shields.io/badge/MCP-Enabled-5865F2?logo=anthropic&logoColor=white)](#)
[![API](https://img.shields.io/badge/API-50%2B%20Tools-00ADD8?logo=fastapi&logoColor=white)](#)

> XMail 将 Cloudflare Email Routing、Workers、Pages 与 D1 组合成一套「无服务器」邮箱收取与派发平台，提供带权限控制的管理员后台与 API-Key 访问方式，轻量却可扩展。支持 **MCP 协议**，可与 AI 助手（Claude Desktop/Code）无缝集成，实现批量注册验证码自动获取等智能工作流。

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
- [API 与自动化](#api-与自动化)
- [常见问题](#常见问题)
- [脚本速查](#脚本速查)

## 特性亮点
- **端到端边缘化**：邮件接收、API、前端全部托管在 Cloudflare 网络，无需自建服务器或持久进程。
- **功能完善的管理员工作台**：支持用户管理、批量生成邮箱、密码/有效期/状态管理、邮箱分配、服务模板、操作日志、回收站等完整运营能力。
- **用户体验优化**：用户可直接携带 `API Key`（`/?key=xmail_xxx`）免登录访问，也可使用绑定邮箱密码。内置验证码提取算法与邮件预览，适合收取验证码类邮件。
- **安全防护**：JWT 基于 `JWT_SECRET` 签名，管理员初次登录由 `ADMIN_PASSWORD` 初始化；支持邮箱密码、停用/过期、操作审计，避免被滥用。
- **可扩展的数据模型**：使用 Drizzle ORM 定义多表 schema，并以 DAO 方式复用在 Worker 与 Web 之间。可轻松扩展新的实体或联表查询。
- **AI Agent 自动化（MCP 协议）**：完整支持 Model Context Protocol，提供 **50+ 个工具**，可与 Claude Desktop/Code 等 AI 助手无缝集成，实现批量注册、验证码自动获取、邮件管理等自动化工作流。

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

8. **（可选）配置 MCP 进行 AI 自动化**
   - 访问 `/admin/api-keys` 创建 API Key
   - 复制 `.mcp.json.example` 为 `.mcp.json`，填入 API Key 和域名
   - 在 Claude Code 中运行 `/mcp` 重新加载配置
   - 即可通过自然语言操作邮箱（详见 [MCP.md](MCP.md)）

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

## API 与自动化

XMail 提供完整的 REST API 和 MCP 协议支持，适用于批量注册、验证码自动获取、AI Agent 自动化等场景。

### REST API

**获取验证码（核心 API）：**
```bash
GET /api/v1/admin/verification-code?mailbox=test@example.com&seconds=600
Authorization: Bearer sk_live_xxx...
```

**适用场景：**
- 已有自动化脚本，需要集成验证码获取功能
- 定制化需求，需要精确控制每个步骤
- 跨语言集成（Python、Node.js、Go 等）

详见 [API.md](API.md)。

### MCP 协议（AI Agent 自动化）⭐ 推荐

XMail 完整支持 Model Context Protocol (MCP)，提供 **50+ 个工具**，可与 Claude Desktop/Code 等 AI 助手无缝集成。

**核心优势：**
- **自然语言操作**：直接用中文描述需求，无需编写代码
- **智能工作流**：AI 自动组合多个工具完成复杂任务
- **实时交互**：灵活调整策略、追踪进度
- **批量操作**：轻松处理 100+ 邮箱的批量注册场景

**使用示例：**

```
我要批量注册 10 个 GitHub 账号：

1. 创建邮箱：gh01@example.com 到 gh10@example.com
2. 我手动提交注册表单后通知你
3. 你每 10 秒检查一次，收到验证码立即告诉我
4. 最后生成表格：邮箱、验证码、状态
```

Claude 会自动调用 `create_mailboxes_batch`、`get_verification_code` 等工具完成任务。

**配置方法：**

1. 在管理后台创建 API Key（`/admin/api-keys`）
2. 复制 `.mcp.json.example` 为 `.mcp.json`，填入 API Key
3. 在 Claude Code 中运行 `/mcp` 重新加载配置

**可用工具分类（50+ 个工具）：**
- **验证码**（1 个）：获取验证码（支持 4-8 位数字/字母数字混合）
- **用户管理**（5 个）：创建、列出、更新、删除用户
- **邮箱管理**（15 个）：批量创建、分配、密码管理、共享邮箱、回收站
- **邮件查询**（4 个）：列出邮件、统计、全局搜索
- **邮件搜索**（2 个）⭐ 新增：高级搜索（多条件组合）、批量验证码搜索
- **邮件操作**（5 个）⭐ 新增：标记已读、星标、删除、批量清理旧邮件
- **服务模板**（4 个）：管理快捷登录链接
- **统计**（6 个）⭐ 增强：系统统计、未分配邮箱数、已删除邮箱数
- **日志与审计**（1 个）⭐ 新增：查看操作日志（审计追踪）
- **自定义扩展**（4 个）⭐ 新增：批量绑定服务、自定义服务、更新过期时间

**详细文档：**
- **MCP 使用指南**：参见 [MCP.md](MCP.md)（包含 AI Agent 工作流示例）
- **API 参考**：参见 [API.md](API.md)（包含传统脚本示例）

**典型场景对比：**

| 场景 | 传统脚本方式 | MCP + AI Agent 方式 ✨ |
|------|------------|---------------------|
| 批量注册 10 个账号 | 编写 Python 脚本，处理轮询逻辑 | "创建 10 个邮箱，帮我获取验证码" |
| 处理注册失败重试 | 修改脚本逻辑，重新运行 | "前 3 个失败了，用新邮箱重试" |
| 多平台并行注册 | 编写复杂的并发控制代码 | "同时注册 GitHub 和 GitLab，分别追踪" |
| 清理 30 天旧邮件 | 查 API 文档，写删除脚本 | "删除所有 30 天前的邮件" |
| 生成运营报告 | 多次 API 调用，手动汇总 | "生成今日邮箱使用报告" |
| 搜索特定邮件 | 组合多个 API 参数 | "找出所有来自 GitHub 的未读验证码邮件" |

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

## 更多文档

- **[API.md](API.md)** - REST API 完整参考（验证码 API、MCP API、安全说明、脚本示例）
- **[MCP.md](MCP.md)** - MCP 协议使用指南（AI Agent 工作流、批量注册自动化、高级用法）
- **[CLAUDE.md](CLAUDE.md)** - 开发者指南（架构详解、开发命令、技术细节）

如需更多改造（例如加入 Webhook、批量导出、GraphQL API 等），可直接在 `packages/database` 扩展 schema，并在 Worker/Web 中复用同一套 DAO。
