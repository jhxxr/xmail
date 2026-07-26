# XMail API 文档

XMail 提供 REST API 与 MCP 接口，覆盖临时邮箱、验证码提取、OAuth 收信，以及 **cloudflare_temp_email 兼容路径**（便于接入基于该项目 API 格式的外部工具）。

## 认证方式总览

| 场景 | 认证方式 | 适用路径 |
| --- | --- | --- |
| 管理员 / 自动化 | `Authorization: Bearer sk_live_...` | `/api/v1/admin/*`、`/api/mcp*`、CF 兼容管理员接口 |
| 管理员（CF 风格） | `x-admin-auth: <ADMIN_PASSWORD 或 sk_live_...>` | `/admin/new_address`、`/admin/mails` 等 |
| 单邮箱（CF 风格） | `Authorization: Bearer <Address JWT>` | `/api/mails`、`/api/mail/*`、`/api/parsed_*`、`/api/otp` 等 |
| OAuth 分享 | `key` / `oauth_key` 或 `Bearer xmail_oauth_...` | `/api/v1/oauth/*` |

### 创建 API Key

1. 登录管理员面板：`https://your-xmail-domain.com/admin/login`
2. 访问 API Key 管理页面：`/admin/api-keys`
3. 输入 Key 名称（如 "GitHub Actions"）并点击创建
4. **立即复制并保存完整的 Key**（格式：`sk_live_xxxxxxxx.yyyyyyyy...`）
5. Key 只会显示一次，无法再次查看

请求时：

```
Authorization: Bearer sk_live_xxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

### 撤销和删除 API Key

- **撤销**：在 API Key 管理页面点击"撤销"按钮，Key 将立即失效且无法恢复
- **删除**：点击删除图标可永久移除该 Key 的记录

### Address JWT（CF 兼容）

通过 `POST /admin/new_address` 或 `POST /api/new_address` 创建邮箱时返回 `jwt`。之后：

```
Authorization: Bearer <jwt>
```

---

## 管理员 API（`/api/v1/admin/*`）

认证：`Authorization: Bearer sk_live_...`

所有下列接口均支持 CORS（浏览器扩展可直接调用），并响应 `OPTIONS` 预检。

### 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/admin/mailbox/domains` | 邮箱域名列表 |
| POST | `/api/v1/admin/mailbox/create` | 创建邮箱（可随机 / 指定 / 先删后建） |
| DELETE/POST | `/api/v1/admin/mailbox/delete` | 删除邮箱 |
| GET | `/api/v1/admin/mailbox/emails` | 列邮件（含验证码预提取） |
| GET | `/api/v1/admin/mailbox/emails/:id` | 邮件详情 |
| GET | `/api/v1/admin/verification-code` | 最新验证码 |
| GET/POST | `/api/v1/admin/service-templates` | 服务模板列表 / 创建 |
| GET/POST | `/api/v1/admin/temp-workbench` | 工作台聚合接口（扩展一站式） |

---

### 获取最新验证码

优先查本地 D1（先扫标题摘要，需要时再读正文）；若本地无邮件则回退到同地址 OAuth 账号（Microsoft Graph）。

**端点：** `GET /api/v1/admin/verification-code`

**查询参数：**

- `mailbox` (必需): 邮箱地址
- `seconds` (可选): 查询最近 N 秒内的邮件，默认 600 秒，范围 0-86400

**响应示例（找到验证码）：**

```json
{
  "success": true,
  "data": {
    "code": "123456",
    "subject": "Your verification code",
    "sender": "noreply@example.com",
    "sender_name": "Example Service",
    "received_at": 1733385600,
    "source": "local"
  }
}
```

**响应示例（未找到）：**

```json
{
  "success": true,
  "data": {
    "code": null,
    "message": "No verification code found in recent emails",
    "latest_email": {
      "subject": "Welcome to our service",
      "sender": "hello@example.com",
      "text_snippet": "Welcome! Here is some information...",
      "received_at": 1733385500
    },
    "source": "local"
  }
}
```

**cURL:**

```bash
curl -H "Authorization: Bearer sk_live_abc12345.xyz..." \
  "https://your-xmail-domain.com/api/v1/admin/verification-code?mailbox=test@example.com&seconds=300"
```

---

### 获取邮箱后缀（域名列表）

**端点：** `GET /api/v1/admin/mailbox/domains`

```json
{
  "success": true,
  "data": {
    "default_domain": "example.com",
    "domains": ["example.com", "example.net"]
  }
}
```

---

### 创建邮箱（返回密码）

**端点：** `POST /api/v1/admin/mailbox/create`

**请求体：**

| 字段 | 说明 |
| --- | --- |
| `address` | 完整邮箱（可选） |
| `local_part` / `domain` | 组合创建（可选） |
| `domain` only | **随机**生成本地部分（员工风格名） |
| `random: true` | 强制随机 |
| `note` | 备注 |
| `password` | 自定义密码（可选） |
| `delete_previous` | 创建前先软删除该邮箱地址（可选） |

**随机创建示例：**

```bash
curl -X POST "https://your-xmail-domain.com/api/v1/admin/mailbox/create" \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"domain":"example.com","note":"extension"}'
```

**指定创建：**

```bash
curl -X POST "https://your-xmail-domain.com/api/v1/admin/mailbox/create" \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"local_part":"user","domain":"example.com","note":"API 创建"}'
```

**响应：**

```json
{
  "success": true,
  "data": {
    "address": "john.smith42@example.com",
    "password": "AbcD12EfGh",
    "deleted_previous": null
  }
}
```

---

### 删除邮箱

**端点：**

- `DELETE /api/v1/admin/mailbox/delete?address=user@example.com`
- 或 `POST /api/v1/admin/mailbox/delete` + `{"address":"user@example.com"}`

```json
{ "success": true, "data": { "deleted": "user@example.com" } }
```

---

### 列邮件

**端点：** `GET /api/v1/admin/mailbox/emails?mailbox=user@example.com&limit=40&offset=0`

每封邮件含 `preview` 与自动提取的 `code`（无则为 null）。

```json
{
  "success": true,
  "data": {
    "mailbox": "user@example.com",
    "emails": [
      {
        "id": "...",
        "subject": "Your code is 123456",
        "fromAddress": "noreply@service.com",
        "fromName": "Service",
        "createdAt": 1733385600,
        "isRead": false,
        "isStarred": false,
        "preview": "...",
        "code": "123456"
      }
    ]
  }
}
```

---

### 邮件详情

**端点：** `GET /api/v1/admin/mailbox/emails/:id`

返回 `text` / 消毒后的 `html` / `code`。首次读取会标记已读。

---

### 服务模板

**列表：** `GET /api/v1/admin/service-templates`

```json
{
  "success": true,
  "data": {
    "templates": [
      { "id": "...", "name": "GitHub", "loginUrl": "https://github.com/login", "note": null }
    ]
  }
}
```

**创建：** `POST /api/v1/admin/service-templates`

```json
{ "name": "GitHub", "loginUrl": "https://github.com/login", "note": "可选" }
```

---

### 临时邮箱工作台（扩展 / 自动化 一站式）

与管理面板 `/admin/temp-workbench` 对齐。也可用上面的细粒度接口组合实现。

**端点：** `GET|POST /api/v1/admin/temp-workbench`

#### GET `?action=bootstrap`

域名 + 服务模板。

#### GET `?action=emails&mailbox=...&limit=40`

#### GET `?action=email&id=...`

#### POST 创建

```json
{
  "action": "create",
  "domain": "example.com",
  "previousAddress": "old@example.com",
  "nextMode": "auto_delete",
  "serviceTemplateIds": [],
  "customServices": []
}
```

- `nextMode`: `auto_delete` | `keep_with_services` | `none`
- `auto_delete`：创建前删除 `previousAddress`
- `keep_with_services`：不删上一邮箱，并为新邮箱绑定服务

**响应：**

```json
{
  "success": true,
  "data": {
    "address": "john.smith42@example.com",
    "password": "AbcD12EfGh",
    "deletedPrevious": "old@example.com",
    "boundServices": [],
    "nextMode": "auto_delete"
  }
}
```

```bash
curl -X POST "https://your-xmail-domain.com/api/v1/admin/temp-workbench" \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"action":"create","domain":"example.com","nextMode":"auto_delete"}'
```

---

## Cloudflare Temp Email 兼容 API

为方便接入基于 [cloudflare_temp_email](https://github.com/dreamhunter2333/cloudflare_temp_email) 的外部工具，XMail 提供路径与响应形状兼容层。原有 `/api/v1/*` 接口保持不变。

### 认证对照

| 场景 | Header | 说明 |
| --- | --- | --- |
| 地址 JWT | `Authorization: Bearer <jwt>` | 创建邮箱时返回，只能访问该邮箱 |
| 管理员 | `x-admin-auth: <ADMIN_PASSWORD>` | 与 CF 文档一致 |
| 管理员（XMail 扩展） | `x-admin-auth: sk_live_...` 或 `Authorization: Bearer sk_live_...` | 可用 API Key 代替明文密码 |

### 创建邮箱

```http
POST /admin/new_address
POST /api/new_address
```

```bash
curl -X POST "https://your-domain/admin/new_address" \
  -H "x-admin-auth: $ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"name":"alice","domain":"m.xinr.de"}'
```

- `name` 可省略：随机生成本地部分
- `domain` 可省略：使用系统默认域名

**响应：**

```json
{
  "jwt": "<Address JWT>",
  "address": "alice@m.xinr.de",
  "address_id": "alice@m.xinr.de",
  "password": "随机密码",
  "success": true,
  "data": {
    "address": "alice@m.xinr.de",
    "password": "随机密码",
    "jwt": "<Address JWT>"
  }
}
```

### 列邮件 / 读邮件

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/mails?limit=20&offset=0` | 列表（摘要，不含全文） |
| GET | `/api/mail/:id` | 详情（含 text/html） |
| GET | `/api/mails/:id` | 同上（别名）；DELETE 可删信 |
| GET | `/api/parsed_mails?limit=20&offset=0` | 解析后列表（subject/sender） |
| GET | `/api/parsed_mails?full=1` | 解析后列表并带正文 |
| GET | `/api/parsed_mail/:id` | 解析后详情（含正文） |

**列表响应：**

```json
{
  "results": [
    {
      "id": "xxx",
      "message_id": "xxx",
      "source": "from@example.com",
      "address": "alice@m.xinr.de",
      "created_at": "2026-07-23T12:00:00.000Z",
      "subject": "Your code is 123456",
      "sender": "Service <from@example.com>",
      "is_read": false,
      "is_starred": false
    }
  ],
  "count": 12
}
```

约定：

- `limit`：1–100（默认 20）
- `offset`：≥ 0（默认 0）
- `count`：**仅 `offset=0` 时计算**，否则为 `0`
- 列表**不返回**大字段 `html`/`text`；详情接口返回正文

```bash
curl -H "Authorization: Bearer $JWT" \
  "https://your-domain/api/mails?limit=20&offset=0"

curl -H "Authorization: Bearer $JWT" \
  "https://your-domain/api/mail/<id>"

curl -H "Authorization: Bearer $JWT" \
  "https://your-domain/api/parsed_mails?limit=20&offset=0"
```

### 验证码

```bash
# 地址 JWT
curl -H "Authorization: Bearer $JWT" \
  "https://your-domain/api/otp?seconds=600"

# 管理员 API Key（原路径）
curl -H "Authorization: Bearer sk_live_..." \
  "https://your-domain/api/v1/admin/verification-code?mailbox=alice@m.xinr.de&seconds=600"
```

`/api/otp` 响应示例：

```json
{
  "success": true,
  "code": "123456",
  "subject": "...",
  "sender": "...",
  "received_at": 1733385600,
  "mail_id": "..."
}
```

### 其它兼容端点

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/settings` | Address JWT | `{ address, send_balance: 0 }` |
| DELETE | `/api/mails/:id` | Address JWT | 删除一封邮件 |
| DELETE | `/api/clear_inbox` | Address JWT | 清空该地址全部收件 |
| DELETE | `/api/delete_address` | Address JWT | 软删除邮箱并清空邮件 |
| GET | `/admin/mails?address=&limit=&offset=` | 管理员 | 管理员列邮件 |
| DELETE | `/admin/mails/:id` | 管理员 | 管理员删邮件 |
| GET | `/admin/mails/:id` | 管理员 | 管理员读邮件详情 |

### 读信性能

1. **摘要列查询**（`listEmailSummaries`）：不读 `html`/`text`
2. 索引 `idx_emails_mailbox_created (mailbox_address, created_at)`
3. **count 仅首页**
4. 验证码：先扫 subject，需要时再拉单封正文

入库时 Email Worker 已解析 MIME，列表比「只存 raw MIME、读取时再解析」更轻。

### Python 示例（与 CF 文档同构）

```python
import requests

BASE = "https://your-domain"
ADMIN = "your-admin-password-or-sk_live_key"

r = requests.post(
    f"{BASE}/admin/new_address",
    json={"name": "test01", "domain": "m.xinr.de"},
    headers={"x-admin-auth": ADMIN, "Content-Type": "application/json"},
)
data = r.json()
jwt, address = data["jwt"], data["address"]
print(address, data.get("password"))

mails = requests.get(
    f"{BASE}/api/mails",
    params={"limit": 20, "offset": 0},
    headers={"Authorization": f"Bearer {jwt}"},
).json()
print("count=", mails.get("count"), "page=", len(mails.get("results", [])))

otp = requests.get(
    f"{BASE}/api/otp",
    params={"seconds": 600},
    headers={"Authorization": f"Bearer {jwt}"},
).json()
print("code=", otp.get("code"))
```

### 从 cloudflare_temp_email 迁移注意

| 项目 | CF temp-email | XMail |
| --- | --- | --- |
| 邮件存储 | `raw_mails` 存 raw MIME | `emails` 表存已解析 text/html |
| 列表字段 | 默认带 `raw` | 列表为摘要；详情带 text/html |
| OTP | 无独立接口，靠 `metadata` 或自解析 | 提供 `/api/otp` + 原 admin 路径 |
| 地址 ID | 数字 `address_id` | 字符串（邮箱地址本身） |
| 创建鉴权 | `x-admin-auth` 管理员密码 | 同左，并支持 `sk_live_` API Key |

字段多出来的 XMail 扩展（如 `success`/`data`/`is_read`）可安全忽略；核心 `jwt`/`address`/`results`/`count` 与常见 CF 客户端兼容。

---

## OAuth 邮箱（Microsoft Graph）

导入 Outlook/Hotmail 等微软账号后，通过 Graph **按需实时拉信**（不写入 D1）。每个账号有独立分享令牌 `xmail_oauth_…`，访问 `/?oauth_key=<token>` 即可打开收件箱。

导入行格式（与 outlookEmail 兼容）：

```text
email----password----client_id----refresh_token
email----client_id----refresh_token
```

`client_id` 与 `refresh_token` 顺序可自动识别（UUID 视为 client_id）。

### 批量导入

**端点：** `POST /api/v1/admin/oauth-accounts`  
**认证：** API Key 或管理员 Cookie  
**Body (JSON)：**

```json
{
  "text": "user@outlook.com----pass----xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx----M.C5...",
  "note": "optional"
}
```

同一邮箱再次导入会**更新** `client_id` / refresh_token 并恢复 `active`（分享令牌不变），响应字段：`added` / `updated` / `skipped` / `parse_errors`。
### 列出账号

**端点：** `GET /api/v1/admin/oauth-accounts`  
**查询参数：** `limit`（默认 50，最大 200）、`offset`  
响应不含 refresh_token，含 `services`（绑定服务）与 `total` / `limit` / `offset`。

### 删除 / 轮换分享令牌

- `DELETE /api/v1/admin/oauth-accounts/:id`
- `POST /api/v1/admin/oauth-accounts/:id` body `{"action":"regenerate-token"}`

### 实时邮件列表

**端点：** `GET /api/v1/oauth/emails`  
**认证（其一）：**

- Query `key=` / `oauth_key=`（分享令牌）
- `Authorization: Bearer xmail_oauth_…`
- `Authorization: Bearer sk_live_…` + `account=` 或 `email=`
- Cookie `oauth_token`（分享链接登录后）

**查询参数：** `folder`（`inbox`|`junkemail`|`all`）、`top`、`skip`  
`folder=all` 时并行拉收件箱+垃圾箱并按时间合并，`skip` 在合并后的结果上生效。

响应 `data` 含 `services`（该账号绑定的服务，见「绑定服务」）：

```json
{
  "success": true,
  "data": {
    "email": "user@outlook.com",
    "folder": "inbox",
    "services": [
      { "id": "...", "name": "GitHub", "loginUrl": "https://github.com/login", "note": null, "isCustom": false, "templateId": "...", "expiresAt": null }
    ],
    "emails": [ /* ... */ ]
  }
}
```

### 邮件详情

**端点：** `GET /api/v1/oauth/emails/:messageId`  
认证同上。`services` 作为 `data` 的同级字段返回（`data` 仍是邮件本身，保持兼容）。

### 绑定服务

OAuth 账号与临时邮箱一样可以绑定服务，服务列表复用全局「服务管理」模板（`service_templates`），也支持仅本账号的自定义服务，均可设置到期时间。

- 管理入口：后台「OAuth 邮箱」每个账号卡片上的「绑定服务」
- 展示位置：分享收件箱（`/?oauth_key=…`）的**邮件列表页与邮件详情页**都会显示绑定服务，过期的单独灰显
- 读接口：上面两个邮件接口的 `services` 字段；`GET /api/v1/admin/oauth-accounts` 每个账号也带 `services`

数据库迁移：

```bash
pnpm --filter web exec wrangler d1 execute xmail-db --remote --file=../../packages/database/migrations/0003_oauth_account_services.sql
```

### 附件

- `GET /api/v1/oauth/emails/:messageId/attachments` — 附件元数据列表  
- `GET /api/v1/oauth/emails/:messageId/attachments/:attachmentId` — 下载附件  

### 原始 MIME

**端点：** `GET /api/v1/oauth/emails/:messageId/raw`  
返回 `.eml`（`message/rfc822`）。

### 获取验证码（OAuth）

**端点：** `GET /api/v1/oauth/verification-code`  
**查询：** `key` / `email` / `account`、`seconds`（默认 600）、`folder`（默认 **`all`**）

现有 `GET /api/v1/admin/verification-code?mailbox=` 在本地 D1 无邮件时，会自动回退到同地址的 OAuth 账号走 Graph（默认搜收件箱+垃圾箱）。

### 测活 / 重新授权

- `POST /api/v1/admin/oauth-accounts/:id` `{"action":"probe"}` — Graph 测活  
- `POST /api/v1/admin/oauth-accounts/:id` `{"action":"reauthorize","client_id":"…","refresh_token":"…"}` — 更新凭证并测活  
- 批量导入 / 微软授权回调后会自动测活  

### refresh_token 轮换策略

微软几乎每次用 RT 换取访问令牌都会返回一个新 RT。**每次收信都落库新 RT = 高频轮换，会增加风控概率**，因此：

- 日常收信只用存量 RT 换访问令牌（AT 在内存缓存约 50 分钟），**不写回新 RT**
- 存量 RT 满 **7 天**后，下一次刷新才把新 RT 落库并重置 `refresh_token_updated_at`
- 超过 **10 天**未轮换的账号，管理后台会标黄提示
- 导入时没有轮换时间戳的老账号，首次刷新会落库一次以建立时钟

需要提前轮换时手动触发：

**端点：** `POST /api/v1/admin/oauth-accounts/:id`  
**Body：** `{"action":"rotate-rt"}`（别名 `refresh-token`）

```json
{
  "success": true,
  "data": {
    "rotated": true,
    "age_sec_before": 691200,
    "refresh_token_updated_at": 1753500000,
    "status": "active",
    "last_error": null
  }
}
```

`rotated: false` 表示凭证有效但微软未返回新 RT，此时沿用原令牌。建议 5-10 天刷新一次，不要短时间内反复调用。

### MCP 工具（OAuth）

| 工具 | 说明 |
| --- | --- |
| `import_oauth_accounts` | 批量导入 / 更新 OAuth 凭证（含测活） |
| `list_oauth_accounts` | 列表（含 share_token，不含 RT） |
| `get_oauth_verification_code` | Graph 实时取验证码（默认 folder=all） |
| `list_oauth_emails` | Graph 实时邮件列表 |
| `delete_oauth_account` | 删除账号 |
| `regenerate_oauth_share_token` | 轮换分享令牌 |
| `probe_oauth_account` | 测活（支持 `all: true`） |
| `refresh_oauth_token` | 手动强制轮换 refresh_token（建议 5-10 天一次） |

`get_verification_code` 在本地无邮件时也会自动回退到同地址 OAuth 账号。

### 网页微软授权

1. 配置 Secrets：`ENCRYPTION_KEY`、`MS_CLIENT_ID`，可选 `MS_REDIRECT_URI`
2. Azure 应用：公共客户端，委托权限 `offline_access` + `Mail.Read`，重定向 URI 与站点一致
3. 管理后台「OAuth 邮箱」→「微软授权导入」

数据库迁移：

```bash
pnpm --filter web exec wrangler d1 execute xmail-db --remote --file=../../packages/database/migrations/0002_oauth_mail_accounts.sql
```

## MCP (Model Context Protocol) API

XMail 完整支持 MCP 协议，提供 54 个工具供 AI 助手调用。详细使用指南请参考 [MCP.md](MCP.md)。

### 获取工具列表

列出所有可用的 MCP 工具。

**端点：** `GET /api/mcp/tools`

**认证：** 需要 API Key（Bearer Token）

**响应示例：**
```json
{
  "success": true,
  "tools": [
    {
      "name": "get_verification_code",
      "description": "从指定邮箱获取最新的验证码。支持4-8位数字或字母数字混合验证码，自动过滤日期、电话号码等干扰信息。无论是否提取到验证码，都会返回完整的邮件内容（包括text和html），方便AI进行二次分析。",
      "inputSchema": {
        "type": "object",
        "properties": {
          "mailbox": {
            "type": "string",
            "description": "邮箱地址，例如: test@example.com"
          },
          "seconds": {
            "type": "number",
            "description": "查询最近N秒内的邮件，默认600秒（10分钟），最大86400秒（24小时）",
            "default": 600,
            "minimum": 0,
            "maximum": 86400
          }
        },
        "required": ["mailbox"]
      }
    }
    // ... 更多工具
  ]
}
```

### 调用工具

执行指定的 MCP 工具。

**端点：** `POST /api/mcp/call`

**认证：** 需要 API Key（Bearer Token）

**请求体：**
```json
{
  "tool": "tool_name",
  "arguments": {
    // 工具参数
  }
}
```

**响应格式：**
```json
{
  "success": true,
  "result": {
    // 工具执行结果
  }
}
```

### 验证码工具详细响应

`get_verification_code` 工具是最常用的功能，其响应格式包含完整的邮件内容：

**请求示例：**
```bash
curl -X POST "https://your-xmail-domain.com/api/mcp/call" \
  -H "Authorization: Bearer sk_live_xxx..." \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "get_verification_code",
    "arguments": {
      "mailbox": "test@example.com",
      "seconds": 600
    }
  }'
```

**响应示例（提取成功）：**
```json
{
  "success": true,
  "result": {
    "success": true,
    "code": "123456",
    "confidence": "high",
    "email": {
      "id": "email_abc123",
      "subject": "Your verification code",
      "sender": "noreply@example.com",
      "sender_name": "Example Service",
      "received_at": 1733385600,
      "text": "Your verification code is: 123456. Valid for 10 minutes.",
      "html": "<html><body><p>Your verification code is: <strong>123456</strong>. Valid for 10 minutes.</p></body></html>"
    }
  }
}
```

**响应示例（算法未提取到验证码）：**
```json
{
  "success": true,
  "result": {
    "success": false,
    "code": null,
    "confidence": "none",
    "message": "No verification code extracted by algorithm. Please check the full email content manually or use AI to analyze.",
    "email": {
      "id": "email_xyz789",
      "subject": "Welcome email",
      "sender": "support@example.com",
      "sender_name": "Support Team",
      "received_at": 1733385600,
      "text": "完整的邮件文本内容...",
      "html": "<html>完整的HTML邮件内容...</html>"
    }
  }
}
```

**响应字段说明：**
- `success` (boolean): 请求是否成功
- `result.success` (boolean): 算法是否成功提取验证码
- `result.code` (string|null): 提取到的验证码，未提取到则为 null
- `result.confidence` (string): 提取置信度 ("high" | "none")
- `result.email` (object): **完整的邮件内容**（始终返回）
  - `id`: 邮件ID
  - `subject`: 邮件主题
  - `sender`: 发件人地址
  - `sender_name`: 发件人名称
  - `received_at`: 接收时间戳（Unix时间，秒）
  - `text`: 纯文本内容（完整）
  - `html`: HTML内容（完整）

**重要特性：**
即使算法未能提取验证码，API 也会返回完整的邮件内容（text 和 html 字段），方便 AI 进行二次分析。这使得验证码提取成功率从 ~85% 提升至 ~95%+。

### 可用工具分类

#### 验证码相关（1个工具）
- `get_verification_code` - 获取最新验证码（始终返回完整邮件内容）

#### 用户管理（5个工具）
- `create_user` - 创建用户
- `list_users` - 列出用户
- `get_user` - 获取用户详情（支持按 ID 或 token 查询）
- `update_user` - 更新用户信息
- `delete_user` - 删除用户

#### 邮箱管理（15个工具）
- `create_mailbox` - 创建单个邮箱
- `create_mailboxes_batch` - 批量创建邮箱
- `list_mailboxes` - 列出邮箱（支持多种筛选条件）
- `get_mailbox` - 获取邮箱详情
- `delete_mailbox` - 软删除邮箱（可恢复）
- `restore_mailbox` - 恢复已删除邮箱
- `list_deleted_mailboxes` - 列出已删除邮箱
- `assign_mailbox_to_user` - 分配邮箱给用户
- `assign_mailboxes_to_user` - 批量分配邮箱
- `set_mailbox_password` - 设置邮箱密码
- `get_mailbox_password` - 获取邮箱明文密码
- `set_mailbox_shared` - 设置共享邮箱状态
- `add_user_to_shared_mailbox` - 添加用户到共享邮箱
- `remove_user_from_shared_mailbox` - 从共享邮箱移除用户
- `get_shared_mailbox_users` - 获取共享邮箱用户列表

#### 邮件查询（4个工具）
- `list_emails` - 列出指定邮箱的邮件
- `get_email` - 获取单个邮件完整内容
- `get_mailbox_stats` - 获取邮箱统计信息（总邮件数、未读数）
- `list_all_emails` - 列出所有邮箱的邮件（管理员功能）

#### 邮件搜索（2个工具）
- `search_emails` - 高级邮件搜索（支持发件人、主题、内容、时间范围、状态等多条件组合）
- `search_verification_codes` - 批量搜索多个邮箱的验证码

#### 邮件操作（5个工具）
- `mark_email_as_read` - 标记邮件为已读
- `toggle_email_star` - 切换邮件星标状态
- `list_starred_emails` - 列出所有星标邮件
- `delete_email` - 永久删除单个邮件
- `delete_old_emails` - 批量删除超过指定天数的旧邮件

#### 服务模板（4个工具）
- `create_service_template` - 创建服务模板
- `list_service_templates` - 列出所有服务模板
- `add_service_to_mailbox` - 关联服务模板到邮箱
- `get_mailbox_services` - 获取邮箱关联的服务列表

#### 统计（6个工具）
- `get_stats` - 获取系统总体统计（用户数、邮箱数、未分配数、邮件总数）
- `count_users` - 获取用户总数
- `count_mailboxes` - 获取邮箱总数（不包括已删除）
- `count_emails` - 获取邮件总数
- `count_unassigned_mailboxes` - 获取未分配邮箱数
- `count_deleted_mailboxes` - 获取已删除邮箱数

#### 日志和审计（1个工具）
- `get_logs` - 获取管理员操作日志

#### 自定义扩展（4个工具）
- `add_custom_service_to_mailbox` - 添加自定义服务（不使用模板）
- `remove_service_from_mailbox` - 移除邮箱服务
- `update_service_expiration` - 更新服务过期时间
- `batch_bind_services_to_mailboxes` - 批量为邮箱绑定服务

**总计：50+ 个工具**

### MCP 使用示例

**配置 Claude Desktop:**

编辑配置文件（`.mcp.json` 或全局配置）：

```json
{
  "mcpServers": {
    "xmail": {
      "type": "http",
      "url": "https://your-xmail-domain.com/api/mcp",
      "headers": {
        "Authorization": "Bearer sk_live_xxx..."
      }
    }
  }
}
```

**自然语言调用示例：**

```
帮我获取 test@example.com 最新的验证码
```

Claude 会自动调用 MCP 工具并返回结果。

**Python 脚本示例：**

```python
import requests

API_KEY = "sk_live_xxx..."
BASE_URL = "https://your-xmail-domain.com/api/mcp"

def call_mcp_tool(tool, args):
    """调用 MCP 工具"""
    response = requests.post(
        f"{BASE_URL}/call",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={"tool": tool, "arguments": args}
    )
    return response.json()["result"]

# 创建用户
user = call_mcp_tool("create_user", {
    "name": "测试用户",
    "note": "由API创建"
})
print(f"创建的用户ID: {user['id']}")
print(f"用户Token: {user['token']}")

# 创建邮箱
mailbox = call_mcp_tool("create_mailbox", {
    "address": "test@example.com",
    "note": "测试邮箱"
})
print(f"邮箱密码: {mailbox['password']}")

# 分配邮箱
call_mcp_tool("assign_mailbox_to_user", {
    "address": "test@example.com",
    "userId": user['id']
})

# 获取验证码
result = call_mcp_tool("get_verification_code", {
    "mailbox": "test@example.com",
    "seconds": 600
})

if result["success"] and result["code"]:
    print(f"验证码: {result['code']}")
else:
    # 即使算法未提取到，也可以分析完整邮件内容
    print(f"邮件内容: {result['email']['text'][:200]}...")
```

**Node.js 脚本示例：**

```javascript
const API_KEY = "sk_live_xxx..."
const BASE_URL = "https://your-xmail-domain.com/api/mcp"

async function callMcpTool(tool, args) {
  const response = await fetch(`${BASE_URL}/call`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ tool, arguments: args })
  })

  const data = await response.json()
  return data.result
}

// 批量创建邮箱
const result = await callMcpTool("create_mailboxes_batch", {
  addresses: [
    "user1@example.com",
    "user2@example.com",
    "user3@example.com"
  ]
})

console.log(`创建了 ${result.length} 个邮箱`)
result.forEach(mailbox => {
  console.log(`${mailbox.address}: ${mailbox.password}`)
})
```

更多详细用法和场景示例请参考 [MCP.md](MCP.md) 文档。

## 验证码提取算法

XMail 使用增强的验证码提取算法，支持：

### 支持的格式
- 4-8 位纯数字或字母数字混合验证码
- 多语言关键词识别（中文、英文、西班牙语、法语、德语、日语等）
- HTML 强调标签识别（`<strong>`, `<b>`, `<em>`, `<span>` 等）
- Apple OTP 标准格式（`@domain.com #123456`）

### 智能过滤
算法会自动排除以下干扰信息：
- 日期和时间（2024-12-14、14:30:45）
- 电话号码
- 订单号和追踪号
- 邮箱地址中的数字
- URL 中的数字
- 交易 ID、发票号
- 版本号、用户 ID
- 顺序数字（123456、654321）
- 重复数字（111111）

### 提取策略
1. **关键词匹配**：在验证码关键词附近查找数字
2. **HTML 强调**：识别 HTML 标签中的强调内容
3. **独立行检测**：检测单独成行的验证码
4. **上下文分析**：排除邮箱地址、订单号等干扰信息

### 完整邮件内容返回
即使算法未能提取验证码，API 也会返回完整的邮件内容（text 和 html 字段），让 AI 可以进行二次分析，大幅提高成功率。

算法实现详见：[apps/web/src/lib/utils.ts:extractVerificationCode()](apps/web/src/lib/utils.ts)

## 批量注册自动化脚本

如果你需要编写脚本而不是使用 AI Agent，可以参考以下完整示例。

### Python 脚本：批量注册自动化

```python
import requests
import time

API_KEY = "sk_live_xxx..."
BASE_URL = "https://your-xmail-domain.com/api/mcp"

def call_mcp_tool(tool, args):
    """调用 MCP 工具"""
    response = requests.post(
        f"{BASE_URL}/call",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={"tool": tool, "arguments": args}
    )
    return response.json()["result"]

def get_verification_code(mailbox, timeout=120, interval=10):
    """
    轮询获取验证码
    :param mailbox: 邮箱地址
    :param timeout: 超时时间（秒）
    :param interval: 检查间隔（秒）
    """
    start_time = time.time()

    while time.time() - start_time < timeout:
        result = call_mcp_tool("get_verification_code", {
            "mailbox": mailbox,
            "seconds": 600
        })

        if result["code"]:
            return result["code"]

        print(f"[{mailbox}] 等待验证码... ({int(time.time() - start_time)}秒)")
        time.sleep(interval)

    return None

# 批量注册示例
def batch_register_accounts(count):
    """批量注册账号"""

    # 1. 创建邮箱
    mailboxes = [f"user{i}@example.com" for i in range(1, count + 1)]
    result = call_mcp_tool("create_mailboxes_batch", {
        "addresses": mailboxes
    })

    print(f"✅ 创建了 {len(result)} 个邮箱")

    # 2. 开始注册流程（这里需要你的注册逻辑）
    for mailbox in mailboxes:
        print(f"\n开始注册 {mailbox}...")

        # TODO: 调用你的注册API
        # register_account(mailbox)

        # 3. 等待并获取验证码
        print(f"等待 {mailbox} 的验证码...")
        code = get_verification_code(mailbox, timeout=120, interval=10)

        if code:
            print(f"✅ {mailbox} 验证码: {code}")

            # TODO: 提交验证码
            # submit_verification(mailbox, code)
        else:
            print(f"❌ {mailbox} 未收到验证码")

# 运行
batch_register_accounts(10)
```

### Node.js 脚本：批量注册自动化

```javascript
const API_KEY = "sk_live_xxx..."
const BASE_URL = "https://your-xmail-domain.com/api/mcp"

async function callMcpTool(tool, args) {
  const response = await fetch(`${BASE_URL}/call`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ tool, arguments: args })
  })

  const data = await response.json()
  return data.result
}

async function getVerificationCode(mailbox, timeout = 120000, interval = 10000) {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const result = await callMcpTool("get_verification_code", {
      mailbox,
      seconds: 600
    })

    if (result.code) {
      return result.code
    }

    console.log(`[${mailbox}] 等待验证码... (${Math.floor((Date.now() - startTime) / 1000)}秒)`)
    await new Promise(resolve => setTimeout(resolve, interval))
  }

  return null
}

async function batchRegister(count) {
  // 1. 创建邮箱
  const mailboxes = Array.from({ length: count }, (_, i) => `user${i + 1}@example.com`)

  const result = await callMcpTool("create_mailboxes_batch", {
    addresses: mailboxes
  })

  console.log(`✅ 创建了 ${result.length} 个邮箱`)

  // 2. 批量注册
  for (const mailbox of mailboxes) {
    console.log(`\n开始注册 ${mailbox}...`)

    // TODO: 调用你的注册API
    // await registerAccount(mailbox)

    // 3. 获取验证码
    console.log(`等待 ${mailbox} 的验证码...`)
    const code = await getVerificationCode(mailbox)

    if (code) {
      console.log(`✅ ${mailbox} 验证码: ${code}`)
      // TODO: 提交验证码
      // await submitVerification(mailbox, code)
    } else {
      console.log(`❌ ${mailbox} 未收到验证码`)
    }
  }
}

// 运行
batchRegister(10)
```

### 脚本使用建议

1. **轮询参数优化**
   - 验证码邮件通常在 5-30 秒内到达
   - 建议轮询间隔：10 秒
   - 建议超时时间：120 秒（2 分钟）

2. **批量操作优化**
   - 使用 `create_mailboxes_batch` 而不是循环调用 `create_mailbox`
   - 可以并行发起注册请求，但建议串行获取验证码避免频繁轮询

3. **错误处理**
   - 如果验证码未到达，检查邮箱是否创建成功
   - 检查邮件是否被垃圾邮件过滤
   - 增加重试逻辑

4. **安全建议**
   - 不要在代码中硬编码 API Key
   - 使用环境变量或配置文件存储密钥
   - 定期轮换 API Key

## 安全说明

### API Key 安全

- API Key 使用 SHA-256 + 盐值哈希存储，数据库中不保存明文
- Key 格式：`sk_live_<8位前缀>.<32位密钥>`
- 每次使用会更新 `last_used_at` 时间戳
- 建议定期轮换 API Key
- 不要在公开代码仓库中提交 API Key
- 使用环境变量或密钥管理服务存储 Key

### 权限控制

- API Key 拥有管理员权限，可以执行所有操作
- 避免在客户端代码中暴露 API Key
- 只为必要的应用创建 API Key

### 审计追踪

- 所有 API 操作都会记录到操作日志中
- 可以通过 `get_logs` 工具查看操作历史
- 日志包含操作类型、时间戳、相关资源等信息

### 网络安全

- 确保 XMail 部署使用 HTTPS
- 避免 API Key 在传输过程中被截获
- 定期检查 API Key 使用情况，及时撤销异常 Key

## 错误处理

### 常见错误码

**401 Unauthorized**
- 原因：API Key 无效、已撤销或格式错误
- 解决：检查 API Key 是否正确，确认未被撤销

**400 Bad Request**
- 原因：请求参数缺失或格式错误
- 解决：检查请求体是否符合 API 规范

**404 Not Found**
- 原因：请求的资源不存在
- 解决：确认资源 ID 或地址正确

**500 Internal Server Error**
- 原因：服务器内部错误
- 解决：查看 Cloudflare Pages 日志，联系管理员

### 错误响应格式

```json
{
  "success": false,
  "error": "错误信息描述"
}
```

## 速率限制

目前 XMail API 没有严格的速率限制，但建议：

- 验证码查询：每个邮箱不超过 1 次/秒
- 邮箱创建：不超过 100 个/分钟
- 其他操作：不超过 60 次/分钟

过于频繁的请求可能导致 Cloudflare Workers 限流。

## 完整文档

- [MCP.md](MCP.md) - MCP 服务器完整使用指南
- [mcp-tools.ts](apps/web/src/lib/mcp-tools.ts) - 所有工具的详细定义
- [utils.ts](apps/web/src/lib/utils.ts) - 验证码提取算法实现

