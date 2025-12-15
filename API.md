# XMail API 文档

XMail 提供完整的 REST API 和 MCP (Model Context Protocol) 接口，支持邮箱管理、验证码提取、邮件查询等功能。

## 认证方式

所有 API 请求需要在 HTTP Header 中携带 API Key：

```
Authorization: Bearer sk_live_xxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

### 创建 API Key

1. 登录管理员面板：`https://your-xmail-domain.com/admin/login`
2. 访问 API Key 管理页面：`/admin/api-keys`
3. 输入 Key 名称（如 "GitHub Actions"）并点击创建
4. **立即复制并保存完整的 Key**（格式：`sk_live_xxxxxxxx.yyyyyyyy...`）
5. Key 只会显示一次，无法再次查看

### 撤销和删除 API Key

- **撤销**：在 API Key 管理页面点击"撤销"按钮，Key 将立即失效且无法恢复
- **删除**：点击删除图标可永久移除该 Key 的记录

## 管理员 API

### 获取最新验证码

获取指定邮箱最新收到的验证码。该 API **始终返回完整的邮件内容**（text 和 html 字段），方便 AI 进行二次分析。

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
    "received_at": 1733385600
  }
}
```

**响应示例（未找到验证码）：**
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
    }
  }
}
```

**错误响应：**
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

### 使用示例

**cURL:**
```bash
curl -H "Authorization: Bearer sk_live_abc12345.xyz..." \
  "https://your-xmail-domain.com/api/v1/admin/verification-code?mailbox=test@example.com&seconds=300"
```

**Python:**
```python
import requests

api_key = "sk_live_abc12345.xyz..."
mailbox = "test@example.com"

response = requests.get(
    "https://your-xmail-domain.com/api/v1/admin/verification-code",
    headers={"Authorization": f"Bearer {api_key}"},
    params={"mailbox": mailbox, "seconds": 600}
)

data = response.json()
if data["success"] and data["data"]["code"]:
    print(f"验证码: {data['data']['code']}")
else:
    print("未找到验证码")
```

**JavaScript/Node.js:**
```javascript
const API_KEY = "sk_live_abc12345.xyz..."
const mailbox = "test@example.com"

const response = await fetch(
  `https://your-xmail-domain.com/api/v1/admin/verification-code?mailbox=${mailbox}&seconds=600`,
  {
    headers: {
      "Authorization": `Bearer ${API_KEY}`
    }
  }
)

const data = await response.json()
if (data.success && data.data.code) {
  console.log("验证码:", data.data.code)
} else {
  console.log("未找到验证码")
}
```

**AI 工具调用 (OpenAI Function Calling):**
```json
{
  "name": "get_verification_code",
  "description": "Get the latest verification code from a mailbox",
  "parameters": {
    "type": "object",
    "properties": {
      "mailbox": {
        "type": "string",
        "description": "The email address to check"
      },
      "seconds": {
        "type": "integer",
        "description": "Look back N seconds (default 600, max 86400)",
        "default": 600
      }
    },
    "required": ["mailbox"]
  }
}
```

## MCP (Model Context Protocol) API

XMail 完整支持 MCP 协议，提供 50+ 个工具供 AI 助手调用。详细使用指南请参考 [MCP.md](MCP.md)。

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
