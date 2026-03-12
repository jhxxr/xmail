# XMail MCP 服务器使用指南

XMail 完整支持 Model Context Protocol (MCP)，让 AI 助手可以直接调用工具进行邮箱自动化操作。

## 什么是 MCP？

Model Context Protocol (MCP) 是一个开放标准，用于让 AI 应用（如 Claude Desktop、Claude Code）与外部工具和数据源集成。通过 MCP，AI 可以：

- 自动获取邮箱验证码
- 批量创建和管理邮箱
- 查询和搜索邮件内容
- 分配用户权限
- 管理服务模板
- 执行邮件操作（标记已读、星标、删除等）

## 快速开始

### 1. 创建 API Key

首先需要在 XMail 管理后台创建一个 API Key：

1. 登录管理员面板：`https://your-xmail-domain.com/admin/login`
2. 访问 API Key 管理页面：`/admin/api-keys`
3. 点击"创建 API Key"，输入名称（如 "Claude Desktop MCP"）
4. **立即复制并保存完整的 Key**（格式：`sk_live_xxxxxxxx.yyyyyyyy...`）

**注意：** API Key 只会显示一次，请妥善保存。

### 2. 配置 MCP 服务器

XMail 支持标准 MCP 协议，可以在 Claude Code 或 Claude Desktop 中配置使用。

#### 方式一：使用项目级别配置文件 `.mcp.json`（推荐）

这是最推荐的方式，配置只在当前项目中生效，可以提交到 Git 与团队共享：

1. 在项目根目录创建 `.mcp.json` 文件
2. 打开 Claude Code，输入 `/mcp` 重新加载配置
3. Claude Code 会自动发现并提示你启用 `xmail` MCP 服务器
4. 点击"Enable"即可开始使用

`.mcp.json` 文件示例：
```json
{
  "$schema": "https://github.com/modelcontextprotocol/servers/raw/main/schema/mcp.schema.json",
  "mcpServers": {
    "xmail": {
      "type": "http",
      "url": "https://your-xmail-domain.com/api/mcp",
      "headers": {
        "Authorization": "Bearer sk_live_xxxxxxxx.yyyyyyyy..."
      },
      "metadata": {
        "description": "XMail email management and verification code automation",
        "homepage": "https://your-xmail-domain.com"
      }
    }
  }
}
```

**安全提示：** 如果要提交到 Git，建议将 API Key 移到环境变量或 `.env` 文件中，不要直接提交敏感信息。

#### 方式二：使用 Claude Code CLI（全局配置）

如果你使用 Claude Code CLI，MCP 服务器配置会保存到全局 `.claude.json` 文件中：

```bash
# 添加 XMail MCP 服务器（使用 HTTP 传输）
claude mcp add --transport http xmail https://your-xmail-domain.com/api/mcp \
  --header "Authorization: Bearer sk_live_xxxxxxxx.yyyyyyyy..."

# 查看已安装的 MCP 服务器
claude mcp list

# 查看服务器详情
claude mcp get xmail
```

配置会保存在全局 `.claude.json` 文件的 `projects.<project-path>.mcpServers` 部分。

#### 方式三：手动编辑配置文件（Claude Desktop 全局配置）

如果你使用 Claude Desktop，需要手动编辑全局配置文件：

**macOS/Linux**: `~/.claude.json`
**Windows**: `C:\Users\<username>\.claude.json`

在 `projects.<your-project-path>.mcpServers` 中添加配置：

```json
{
  "projects": {
    "/path/to/your/project": {
      "mcpServers": {
        "xmail": {
          "type": "http",
          "url": "https://your-xmail-domain.com/api/mcp",
          "headers": {
            "Authorization": "Bearer sk_live_xxxxxxxx.yyyyyyyy..."
          }
        }
      }
    }
  }
}
```

保存后，在该项目中使用 `/mcp` 命令重新加载 MCP 服务器配置。

### 3. 验证配置

配置完成后，你可以直接问 Claude：

```
列出 XMail 中所有可用的工具
```

如果配置成功，Claude 会列出所有 50+ 个可用工具。

## 核心功能与使用场景

### 批量注册自动化 🔥 主要使用场景

这是 XMail MCP 的核心使用场景：让 AI Agent（如 Claude）帮你完成批量注册时的验证码获取。

#### 场景一：单个账号注册

```
我正在用 test123@example.com 注册 GitHub 账号，帮我获取验证码
```

Claude 会调用 `get_verification_code` 工具。该工具**始终返回完整的邮件内容**（包括 text 和 html 字段）：

- **算法成功提取**：直接返回验证码 + 完整邮件内容
- **算法提取失败**：Claude 会自动读取完整邮件内容进行智能分析，仍能找到验证码

这意味着即使遇到特殊格式的验证码邮件，Claude 也能帮你提取出来！

#### 场景二：批量注册工作流

```
我要批量注册 10 个 Discord 账号，帮我完成以下流程：

1. 创建 10 个邮箱：user1@example.com 到 user10@example.com
2. 我会手动在浏览器打开 10 个标签页开始注册
3. 等我通知你后，帮我依次获取每个邮箱的验证码
4. 把验证码整理成表格方便我复制
```

Claude 会：
1. 调用 `create_mailboxes_batch` 批量创建邮箱
2. 返回邮箱列表和密码供你使用
3. 等待你的通知
4. 依次调用 `get_verification_code` 获取所有验证码
5. 格式化输出为表格

#### 场景三：实时监控验证码到达

```
我刚刚在 5 个浏览器窗口用这些邮箱提交了注册：
- reg1@example.com
- reg2@example.com
- reg3@example.com
- reg4@example.com
- reg5@example.com

请帮我持续监控，每隔 10 秒检查一次，哪个收到验证码就马上告诉我。
最多等待 2 分钟。
```

Claude 会轮询检查这 5 个邮箱，一旦任何一个收到验证码就立即通知你。

#### 场景四：批量查询当前状态

```
我 10 分钟前用以下邮箱发起了注册：
user1@example.com, user2@example.com, user3@example.com,
user4@example.com, user5@example.com

帮我检查一下：
1. 哪些已经收到验证码了？
2. 哪些还没收到？
3. 把结果整理成表格
```

Claude 会并行检查所有邮箱，生成状态汇总表。

#### 场景五：边注册边获取

```
我现在要注册 20 个账号，我会分批操作。

第一批：先帮我创建 user1@example.com 到 user5@example.com 这 5 个邮箱
```

（你去注册前 5 个）

```
好了，我已经提交了前 5 个的注册。帮我获取这 5 个的验证码。
同时，再创建接下来 5 个邮箱：user6@example.com 到 user10@example.com
```

这样可以流水线式地完成大批量注册。

### AI Agent 的优势

相比传统脚本，使用 AI Agent（Claude + MCP）有以下优势：

1. **无需编写代码**：用自然语言描述需求即可
2. **灵活应对变化**：可以随时调整策略，比如"只获取前 3 个的验证码"
3. **智能错误处理**：AI 会自动重试、报告异常
4. **上下文记忆**：AI 记得你的邮箱列表，无需重复输入
5. **实时交互**：可以随时询问进度、调整计划

### 高级 Agent 工作流

#### 完整的自动化注册流程

```
我需要注册 100 个 Twitter 账号，帮我设计一个工作流：

1. 创建 100 个邮箱（命名规则：tw01@example.com 到 tw100@example.com）
2. 保存邮箱和密码到一个清单
3. 我会使用自动化工具批量发起注册
4. 然后分批获取验证码（每次 10 个）
5. 记录每个账号的注册状态（成功/失败/待验证）
6. 最后生成一份完整的注册报告

现在先帮我创建这 100 个邮箱。
```

Claude 会按步骤执行并维护状态追踪。

#### 多平台并行注册

```
我要同时在 3 个平台注册账号：
- GitHub: gh1@example.com 到 gh10@example.com
- GitLab: gl1@example.com 到 gl10@example.com
- Bitbucket: bb1@example.com 到 bb10@example.com

帮我：
1. 创建这 30 个邮箱
2. 我会同时打开 3 个浏览器各自批量注册
3. 你帮我分平台追踪验证码到达情况
4. 每个平台的验证码到齐后通知我
```

Claude 会智能分组管理不同平台的邮箱。

#### 失败重试策略

```
我有 20 个邮箱在注册，但有些可能失败。帮我：

1. 先检查所有邮箱的验证码状态
2. 对于 10 分钟内没收到验证码的邮箱，标记为"可能失败"
3. 对于已收到的，整理出验证码列表
4. 对于失败的，帮我准备重试用的新邮箱
```

Claude 会自动分析并提供优化建议。

### AI Agent 使用技巧

#### 1. 清晰的指令

**好的示例：**
```
我要注册 10 个 GitHub 账号：
1. 邮箱命名：gh001@example.com 到 gh010@example.com
2. 先创建邮箱，给我邮箱和密码列表
3. 我开始注册后通知你
4. 你每 10 秒检查一次，收到验证码立即告诉我
5. 最多等待 2 分钟
6. 最后生成一个表格，包含邮箱、验证码、状态
```

**避免模糊指令：**
```
帮我注册一些账号
```

#### 2. 分批处理大量任务

对于 100+ 邮箱的大批量操作：
```
我要注册 200 个账号，我们分 10 批，每批 20 个。

第一批：先创建 user001@example.com 到 user020@example.com
```

（完成第一批后）

```
第一批完成，继续第二批：user021@example.com 到 user040@example.com
```

这样可以避免操作超时，更容易追踪进度。

#### 3. 状态追踪

让 Claude 维护一个进度表：
```
帮我创建一个进度追踪表，包含以下字段：
- 邮箱地址
- 密码
- 验证码
- 注册状态（待注册/已提交/已验证/失败）
- 备注

然后创建前 20 个邮箱并填入表格
```

#### 4. 灵活调整策略

在执行过程中可以随时修改：
```
停止！前 5 个的验证码已经够了，后面的先不要获取。

现在帮我：
1. 检查这 5 个账号是否注册成功
2. 如果有失败的，准备新邮箱重试
```

#### 5. 并行任务管理

```
我同时在做 3 件事：
1. 注册 GitHub（10个邮箱）
2. 注册 GitLab（10个邮箱）
3. 注册 Bitbucket（10个邮箱）

帮我分别追踪这 3 个任务的进度，一个平台的验证码到齐就通知我
```

Claude 会智能地管理多个并行任务。

### 邮件搜索和过滤 🔍

#### 高级搜索示例

```
搜索所有来自 GitHub 的邮件，主题包含"verification"，时间在最近24小时内
```

Claude 会调用 `search_emails` 工具，自动组合多个搜索条件。

#### 批量验证码搜索

这是批量注册场景的增强功能：

```
我有 20 个邮箱同时注册了 GitHub：
gh01@example.com 到 gh20@example.com

帮我一次性检查所有邮箱，只看来自 noreply@github.com 的邮件，
提取所有验证码并整理成表格
```

Claude 会调用 `search_verification_codes` 工具，一次性返回所有邮箱的验证码状态：

| 邮箱 | 验证码 | 发件人 | 时间 | 状态 |
|------|--------|--------|------|------|
| gh01@example.com | 123456 | noreply@github.com | 10:30 | ✅ |
| gh02@example.com | 789012 | noreply@github.com | 10:31 | ✅ |
| gh03@example.com | - | - | - | ❌ 未收到 |

#### 复杂搜索场景

```
帮我找出：
1. 所有未读的验证码邮件
2. 来自 Discord、GitHub 或 Twitter 的
3. 最近 6 小时内收到的
4. 按时间倒序排列
```

Claude 会组合使用 `search_emails` 的多个参数完成搜索。

#### 搜索支持的条件

- **发件人**：模糊匹配邮箱地址或名称
- **主题**：关键词搜索
- **内容**：在邮件正文中搜索
- **时间范围**：指定开始和结束时间
- **已读/未读**：过滤邮件状态
- **星标**：只看重要邮件
- **邮箱**：指定或全局搜索

### 其他常用操作

#### 获取验证码

```
帮我获取 test@example.com 最新的验证码
```

Claude 会自动调用 `get_verification_code` 工具并返回验证码。

#### 批量创建邮箱

```
帮我创建 10 个邮箱，格式为 user1@example.com 到 user10@example.com
```

Claude 会调用 `create_mailboxes_batch` 工具并返回创建的邮箱和密码列表。

#### 查询邮箱统计

```
test@example.com 有多少封未读邮件？
```

Claude 会调用 `get_mailbox_stats` 工具返回统计信息。

#### 邮件管理

```
标记 test@example.com 收到的最新5封邮件为已读
```

Claude 会调用 `list_emails` 和 `mark_email_as_read` 完成操作。

#### 清理旧邮件

```
删除所有超过30天的旧邮件
```

Claude 会调用 `delete_old_emails` 工具并返回删除的邮件数量。

#### 批量操作

```
为 user1@example.com, user2@example.com, user3@example.com 这三个邮箱批量添加 GitHub 和 Notion 服务模板
```

Claude 会调用 `batch_bind_services_to_mailboxes` 完成批量操作。

#### 查看操作日志

```
显示最近50条管理员操作日志
```

Claude 会调用 `get_logs` 返回操作审计记录。

#### 用户管理

```
创建一个名为"测试用户"的用户，并分配 test1@example.com 和 test2@example.com 给他
```

Claude 会依次调用：
1. `create_user` - 创建用户
2. `assign_mailboxes_to_user` - 分配邮箱

## 可用工具列表

### 验证码相关（1个工具）
- `get_verification_code` - 获取最新验证码（始终返回完整邮件内容供 AI 分析）

### 用户管理（5个工具）
- `create_user` - 创建用户
- `list_users` - 列出用户
- `get_user` - 获取用户详情
- `update_user` - 更新用户
- `delete_user` - 删除用户

### 邮箱管理（15个工具）
- `create_mailbox` - 创建邮箱
- `create_mailboxes_batch` - 批量创建邮箱
- `list_mailboxes` - 列出邮箱（支持多种筛选）
- `get_mailbox` - 获取邮箱详情
- `delete_mailbox` - 删除邮箱
- `restore_mailbox` - 恢复已删除邮箱
- `list_deleted_mailboxes` - 列出已删除邮箱
- `assign_mailbox_to_user` - 分配邮箱给用户
- `assign_mailboxes_to_user` - 批量分配邮箱
- `set_mailbox_password` - 设置邮箱密码
- `get_mailbox_password` - 获取邮箱密码
- `set_mailbox_shared` - 设置共享邮箱
- `add_user_to_shared_mailbox` - 添加用户到共享邮箱
- `remove_user_from_shared_mailbox` - 从共享邮箱移除用户
- `get_shared_mailbox_users` - 获取共享邮箱用户列表

### 邮件查询（4个工具）
- `list_emails` - 列出邮件
- `get_email` - 获取邮件详情
- `get_mailbox_stats` - 获取邮箱统计
- `list_all_emails` - 列出所有邮件（管理员）

### 邮件搜索（2个工具）
- `search_emails` - 高级邮件搜索（支持多条件组合）
- `search_verification_codes` - 批量搜索验证码

### 邮件操作（5个工具）
- `mark_email_as_read` - 标记邮件为已读
- `toggle_email_star` - 切换邮件星标状态
- `list_starred_emails` - 列出星标邮件
- `delete_email` - 删除单个邮件
- `delete_old_emails` - 批量删除旧邮件

### 服务模板（4个工具）
- `create_service_template` - 创建服务模板
- `list_service_templates` - 列出服务模板
- `add_service_to_mailbox` - 添加服务到邮箱
- `get_mailbox_services` - 获取邮箱的服务列表

### 统计（6个工具）
- `get_stats` - 获取系统统计
- `count_users` - 用户总数
- `count_mailboxes` - 邮箱总数
- `count_emails` - 邮件总数
- `count_unassigned_mailboxes` - 未分配邮箱数
- `count_deleted_mailboxes` - 已删除邮箱数

### 日志和审计（1个工具）
- `get_logs` - 获取管理员操作日志

### 自定义扩展（4个工具）
- `add_custom_service_to_mailbox` - 添加自定义服务（不使用模板）
- `remove_service_from_mailbox` - 移除邮箱服务
- `update_service_expiration` - 更新服务过期时间
- `batch_bind_services_to_mailboxes` - 批量绑定服务到邮箱

**总计：50+ 个工具**

## API 端点

MCP 服务器提供两个核心端点：

### 获取工具列表

```bash
GET /api/mcp/tools
Authorization: Bearer sk_live_xxx...

# 响应
{
  "success": true,
  "tools": [
    {
      "name": "get_verification_code",
      "description": "...",
      "inputSchema": { ... }
    },
    ...
  ]
}
```

### 调用工具

```bash
POST /api/mcp/call
Authorization: Bearer sk_live_xxx...
Content-Type: application/json

{
  "tool": "get_verification_code",
  "arguments": {
    "mailbox": "test@example.com",
    "seconds": 600
  }
}

# 响应（提取成功）
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

# 响应（算法未提取到验证码，但返回完整内容供 AI 分析）
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

## MCP 服务器管理

### 使用 Claude Code CLI 管理

```bash
# 添加 MCP 服务器（HTTP 传输）
claude mcp add --transport http <name> <url> --header "Authorization: Bearer <key>"

# 列出所有 MCP 服务器
claude mcp list

# 查看 MCP 服务器详情
claude mcp get <name>

# 移除 MCP 服务器
claude mcp remove <name>
```

### 更新 API Key

如果你需要更换 API Key：

```bash
# 使用 CLI
claude mcp remove xmail
claude mcp add --transport http xmail https://your-xmail-domain.com/api/mcp \
  --header "Authorization: Bearer <new_key>"

# 或手动编辑配置文件
# 找到 xmail 配置，更新 Authorization header
```

## 在其他 MCP 客户端中使用

除了 Claude Code 和 Claude Desktop，XMail MCP 服务器也可以在其他支持 MCP 的客户端中使用：

### 自定义应用（Python）

```python
import requests

API_KEY = "sk_live_xxx..."
BASE_URL = "https://your-xmail-domain.com/api/mcp"

# 获取工具列表
response = requests.get(
    f"{BASE_URL}/tools",
    headers={"Authorization": f"Bearer {API_KEY}"}
)
tools = response.json()["tools"]

# 调用工具
response = requests.post(
    f"{BASE_URL}/call",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "tool": "get_verification_code",
        "arguments": {
            "mailbox": "test@example.com",
            "seconds": 600
        }
    }
)
result = response.json()["result"]

# 处理结果
if result["success"] and result["code"]:
    print(f"验证码: {result['code']}")
else:
    # 即使算法未提取到，也可以让 AI 分析完整邮件内容
    print(f"需要分析邮件内容: {result['email']['text'][:100]}...")
```

### Node.js 示例

```javascript
const API_KEY = "sk_live_xxx..."
const BASE_URL = "https://your-xmail-domain.com/api/mcp"

async function callTool(tool, args) {
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

// 使用示例
const result = await callTool("get_verification_code", {
  mailbox: "test@example.com",
  seconds: 600
})

if (result.success && result.code) {
  console.log("验证码:", result.code)
} else {
  // 完整邮件内容始终可用
  console.log("邮件内容:", result.email.text)
}
```

## 安全注意事项

1. **妥善保管 API Key**：API Key 拥有管理员权限，可以执行所有操作。切勿泄露或提交到代码仓库。

2. **定期轮换密钥**：建议定期撤销旧密钥并创建新密钥。

3. **最小权限原则**：只为必要的应用创建 API Key，避免过度授权。

4. **审计日志**：所有通过 MCP 的操作都会记录到操作日志中，方便追溯。

5. **网络安全**：确保你的 XMail 部署使用 HTTPS，避免 API Key 在传输过程中被截获。

## 故障排查

### Claude Desktop 未显示工具

1. 检查配置文件格式是否正确（JSON 格式）
2. 确认 API Key 有效且未被撤销
3. 查看 Claude Desktop 的开发者工具（View > Developer > Developer Tools）
4. 重启 Claude Desktop

### 工具调用失败

1. 检查 API Key 权限
2. 查看 Cloudflare Pages 的日志（Dashboard > Pages > xmail > Logs）
3. 确认参数格式正确
4. 检查网络连接

### 验证码提取不准确

验证码提取使用启发式算法，可能会有误判。如果经常提取不到：

1. 查看邮件原文，确认验证码格式
2. 调整 `seconds` 参数，增加搜索范围
3. 利用完整邮件内容（text/html 字段）让 AI 进行二次分析
4. 考虑修改 `apps/web/src/lib/utils.ts:extractVerificationCode()` 算法

## 高级用法

### 邮件管理自动化

你可以让 Claude 执行复杂的邮件管理任务：

```
帮我执行以下邮件清理任务：
1. 标记所有邮件为已读
2. 将包含"重要"关键词的邮件加星标
3. 删除30天前的旧邮件
4. 生成清理报告
```

Claude 会自动调用多个邮件操作工具完成任务。

### 审计和监控

```
生成今日系统活动报告：
1. 新增用户数和邮箱数
2. 今日接收邮件数
3. 最近的管理员操作记录
4. 未分配邮箱数量
```

Claude 会调用统计和日志工具生成完整报告。

### 自定义服务批量配置

```
为所有属于"VIP客户"的邮箱添加以下自定义服务：
- 内部CRM系统: https://crm.company.com
- 客服系统: https://support.company.com
- 订单系统: https://orders.company.com
```

Claude 会使用 `batch_bind_services_to_mailboxes` 和自定义服务功能完成配置。

### 批量自动化脚本

结合 MCP 工具，你可以创建强大的自动化脚本：

**示例：每日邮箱报告**

```
帮我生成一份今日邮箱使用报告：
1. 总用户数和邮箱数
2. 未分配邮箱数量
3. 每个用户收到的邮件数量
4. 找出收到验证码最多的邮箱
```

Claude 会自动调用多个工具并生成报告。

### 工作流集成

你可以让 Claude 执行复杂的工作流：

```
帮我执行以下操作：
1. 创建用户"新客户A"
2. 创建 5 个邮箱：customerA-1@example.com 到 customerA-5@example.com
3. 将这 5 个邮箱分配给"新客户A"
4. 为每个邮箱添加"GitHub"和"Notion"服务模板
5. 生成一份包含所有邮箱和密码的清单
```

Claude 会按顺序执行这些操作并返回完整结果。

## 反馈与支持

如果你发现 MCP 功能有问题或有改进建议：

1. 查看项目 GitHub Issues
2. 提交详细的错误报告（包括工具名称、参数、错误信息）
3. 贡献代码改进 MCP 实现

## 完整工具文档

每个工具的详细参数说明请参考：
- [mcp-tools.ts](apps/web/src/lib/mcp-tools.ts) - 工具定义
- [API.md](API.md) - 完整 API 文档
