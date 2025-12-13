  # XMail API 文档

## 管理员 API

### 认证方式

所有 API 请求需要在 HTTP Header 中携带 API Key：

```
Authorization: Bearer sk_live_xxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

### 获取最新验证码

获取指定邮箱最新收到的验证码。

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
  "https://xmail-epp.pages.dev/api/v1/admin/verification-code?mailbox=test@example.com&seconds=300"
```

**Python:**
```python
import requests

api_key = "sk_live_abc12345.xyz..."
mailbox = "test@example.com"


response = requests.get(
    "https://xxx.pages.dev/api/v1/admin/verification-code",
    headers={"Authorization": f"Bearer {api_key}"},
    params={"mailbox": mailbox, "seconds": 600}
)

data = response.json()
if data["success"] and data["data"]["code"]:
    print(f"验证码: {data['data']['code']}")
else:
    print("未找到验证码")
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

## API Key 管理

### 创建 API Key

1. 登录管理员面板：`https://xmail-epp.pages.dev/admin/login`
2. 访问 API Key 管理页面：`https://xmail-epp.pages.dev/admin/api-keys`
3. 输入 Key 名称（如 "GitHub Actions"）并点击创建
4. **立即复制并保存完整的 Key**（格式：`sk_live_xxxxxxxx.yyyyyyyy...`）
5. Key 只会显示一次，无法再次查看

### 撤销 API Key

在 API Key 管理页面点击"撤销"按钮。撤销后的 Key 将立即失效，无法恢复。

### 删除 API Key

在 API Key 管理页面点击删除图标。删除操作会永久移除该 Key 的记录。

## 安全说明

- API Key 使用 SHA-256 + 盐值哈希存储，数据库中不保存明文
- Key 格式：`sk_live_<8位前缀>.<32位密钥>`
- 每次使用会更新 `last_used_at` 时间戳
- 建议定期轮换 API Key
- 不要在公开代码仓库中提交 API Key
- 使用环境变量或密钥管理服务存储 Key

## 验证码提取算法

系统使用增强的验证码提取算法，支持：
- 4-8 位纯数字或字母数字混合
- 多语言关键词识别（中文、英文、西班牙语等）
- HTML 强调标签识别（`<strong>`, `<b>`, `<em>` 等）
- Apple OTP 标准格式
- 智能排除日期、电话号码、订单号等干扰信息

详见 `apps/web/src/lib/utils.ts:extractVerificationCode()`

---

## MCP (Model Context Protocol) API

XMail 支持 MCP 协议，让 AI 助手可以直接调用工具进行自动化操作。完整文档请参考 `MCP.md`。

### 获取工具列表

列出所有可用的 MCP 工具。

**端点：** `GET /api/mcp/tools`

**认证：** 需要 API Key

**响应示例：**
```json
{
  "success": true,
  "tools": [
    {
      "name": "get_verification_code",
      "description": "从指定邮箱获取最新的验证码...",
      "inputSchema": {
        "type": "object",
        "properties": {
          "mailbox": {
            "type": "string",
            "description": "邮箱地址，例如: test@example.com"
          },
          "seconds": {
            "type": "number",
            "description": "查询最近N秒内的邮件...",
            "default": 600
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

**认证：** 需要 API Key

**请求体：**
```json
{
  "tool": "tool_name",
  "arguments": {
    // 工具参数
  }
}
```

**响应示例：**
```json
{
  "success": true,
  "result": {
    // 工具执行结果
  }
}
```

### 可用工具分类

#### 验证码
- `get_verification_code` - 获取最新验证码

#### 用户管理
- `create_user` - 创建用户
- `list_users` - 列出用户
- `get_user` - 获取用户详情
- `update_user` - 更新用户
- `delete_user` - 删除用户

#### 邮箱管理（15个工具）
- `create_mailbox` - 创建邮箱
- `create_mailboxes_batch` - 批量创建邮箱
- `list_mailboxes` - 列出邮箱
- `get_mailbox` - 获取邮箱详情
- `delete_mailbox` - 删除邮箱
- `restore_mailbox` - 恢复邮箱
- `list_deleted_mailboxes` - 列出已删除邮箱
- `assign_mailbox_to_user` - 分配邮箱
- `assign_mailboxes_to_user` - 批量分配
- `set_mailbox_password` - 设置密码
- `get_mailbox_password` - 获取密码
- `set_mailbox_shared` - 设置共享状态
- `add_user_to_shared_mailbox` - 添加用户到共享邮箱
- `remove_user_from_shared_mailbox` - 移除用户
- `get_shared_mailbox_users` - 获取共享邮箱用户

#### 邮件查询
- `list_emails` - 列出邮件
- `get_email` - 获取邮件详情
- `get_mailbox_stats` - 获取邮箱统计
- `list_all_emails` - 列出所有邮件

#### 邮件搜索 ⭐ 新增
- `search_emails` - 高级搜索（支持发件人、主题、内容、时间、状态等多条件）
- `search_verification_codes` - 批量搜索多个邮箱的验证码

#### 邮件操作 ⭐ 新增
- `mark_email_as_read` - 标记为已读
- `toggle_email_star` - 切换星标
- `list_starred_emails` - 列出星标邮件
- `delete_email` - 删除邮件
- `delete_old_emails` - 批量删除旧邮件

#### 服务模板
- `create_service_template` - 创建服务模板
- `list_service_templates` - 列出模板
- `add_service_to_mailbox` - 添加服务
- `get_mailbox_services` - 获取邮箱服务

#### 统计 ⭐ 增强
- `get_stats` - 系统统计
- `count_users` - 用户总数
- `count_mailboxes` - 邮箱总数
- `count_emails` - 邮件总数
- `count_unassigned_mailboxes` - 未分配邮箱数 ⭐ 新增
- `count_deleted_mailboxes` - 已删除邮箱数 ⭐ 新增

#### 日志和审计 ⭐ 新增
- `get_logs` - 获取操作日志

#### 自定义扩展 ⭐ 新增
- `add_custom_service_to_mailbox` - 添加自定义服务
- `remove_service_from_mailbox` - 移除服务
- `update_service_expiration` - 更新服务过期时间
- `batch_bind_services_to_mailboxes` - 批量绑定服务

### MCP 使用示例

**配置 Claude Desktop:**

编辑配置文件（`claude_desktop_config.json`）：

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

**使用示例：**

```
帮我获取 test@example.com 最新的验证码
```

Claude 会自动调用 MCP 工具并返回结果。

**Python 脚本示例：**

```python
import requests

API_KEY = "sk_live_xxx..."
BASE_URL = "https://your-xmail-domain.com/api/mcp"

# 调用工具
response = requests.post(
    f"{BASE_URL}/call",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "tool": "create_user",
        "arguments": {
            "name": "测试用户",
            "note": "由API创建"
        }
    }
)

result = response.json()
print(f"创建的用户ID: {result['result']['id']}")
print(f"用户Token: {result['result']['token']}")
```

更多详情和高级用法请参考 `MCP.md` 文档。

---

## MCP 脚本自动化示例

如果你需要编写脚本而不是使用 AI Agent，可以参考以下代码。

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

1. **轮询参数**
   - 验证码邮件通常在 5-30 秒内到达
   - 建议轮询间隔：10 秒
   - 建议超时时间：120 秒（2 分钟）

2. **批量优化**
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


