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
