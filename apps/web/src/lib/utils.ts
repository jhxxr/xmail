import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 格式化时间
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // 1分钟内
  if (diff < 60 * 1000) {
    return "刚刚"
  }
  // 1小时内
  if (diff < 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 1000))} 分钟前`
  }
  // 24小时内
  if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`
  }
  // 7天内
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前`
  }
  // 超过7天显示日期
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

// 截断文本
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.slice(0, length) + "..."
}

// 提取邮件预览
export function extractPreview(text: string | null, html: string | null): string {
  if (text) {
    return truncate(text.replace(/\s+/g, " ").trim(), 100)
  }
  if (html) {
    const stripped = html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
    return truncate(stripped, 100)
  }
  return "(无内容)"
}

// 生成随机邮箱地址
export function generateRandomAddress(domain: string): string {
  const adjectives = ["happy", "swift", "bright", "calm", "cool", "fresh", "kind", "neat", "warm", "wise"]
  const nouns = ["cat", "dog", "bird", "fish", "fox", "bear", "deer", "owl", "wolf", "duck"]
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const num = Math.floor(Math.random() * 1000)
  return `${adj}${noun}${num}@${domain}`
}

// 验证码提取算法 - 增强版
// 参考: Apple OTP标准, Gmail, Mailosaur等成熟方案
export function extractVerificationCode(text: string | null, html: string | null): string | null {
  const content = text || (html ? html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ') : '')
  if (!content) return null

  // 策略 0: Apple OTP 标准格式（最高优先级）
  // 格式: "Your code is 123456" 或 "@domain.com #123456"
  const otpMatch = content.match(/@[\w.-]+\s+#(\d{4,8})\b/)
  if (otpMatch) return otpMatch[1]

  // 高优先级关键词（必须紧邻验证码，距离 < 25 字符）
  const strictKeywords = [
    // 中文 - 高频核心词
    '验证码', '校验码', '动态码', '确认码', '安全码', '认证码',
    // 中文 - 带连接词的变体（包含"代码"的特定组合）
    '验证码为', '验证码是', '代码为', '代码是', '动态码为', '确认码是',
    '临时验证码', '临时代码', '邮箱验证码', '手机验证码', '登录验证码', '注册验证码',
    '短信验证码', '登录码', '注册码', '动态密码', '一次性密码', '激活码', '通行码',
    '一次性验证码', '一次性验证码为', '验证码如下', '验证码为：',
    'chatgpt 代码', 'openai 代码', '验证代码', '安全代码',
    // 英文
    'verification code', 'verify code', 'confirmation code', 'security code',
    'otp', 'one-time password', 'one time password',
    'your code', 'code is', 'enter code', 'use code', 'code:', 'is:',
    'verification:', 'confirm with', 'authenticate with',
    // 其他语言
    'código', 'codigo', 'kode', 'código de verificación', 'verification'
  ]

  // 中等优先级关键词
  const mediumKeywords = [
    'passcode', 'pin code', 'pin', 'auth code', 'authentication code',
    'access code', 'temp code', 'temporary code',
    '代码',
  ]

  // 排除模式 - 避免误判
  const excludePatterns = [
    /\d{4}[年\-\/]\d{1,2}[月\-\/]\d{1,2}[日]?/,  // 日期
    /\d{1,2}[:\-]\d{2}[:\-]\d{2}/,              // 时间
    /\d{3}[\-\.\s]\d{3,4}[\-\.\s]\d{4}/,        // 电话
    /\d{5,6}[\-]\d{4}/,                          // 邮编
    /\b(19|20)\d{2}\b/,                          // 年份
    /\$\s*\d+/,                                  // 金额
    /order|订单|invoice|发票|tracking|快递|运单/i, // 订单号
    /price|价格|amount|金额/i,                   // 金额相关
  ]

  // 辅助函数：检查是否应该排除
  const shouldExclude = (match: string, fullContext: string): boolean => {
    // 检查排除模式
    for (const pattern of excludePatterns) {
      if (pattern.test(fullContext)) return true
    }

    // 排除连续出现的相同数字（如 111111, 000000）
    if (/^(\d)\1+$/.test(match)) return true

    // 排除明显的日期时间、订单号上下文
    const lowerContext = fullContext.toLowerCase()
    if (lowerContext.includes('date') || lowerContext.includes('time') ||
        lowerContext.includes('日期') || lowerContext.includes('时间') ||
        lowerContext.includes('order') || lowerContext.includes('订单')) {
      return true
    }

    return false
  }

  // 策略 1: 严格关键词匹配（最高优先级）
  for (const keyword of strictKeywords) {
    const keywordLower = keyword.toLowerCase()
    const contentLower = content.toLowerCase()
    const idx = contentLower.indexOf(keywordLower)

    if (idx !== -1) {
      // 在关键词后面查找验证码
      const searchRange = content.slice(idx, idx + 100)

      // 匹配多种格式
      const patterns = [
        /[:：是为\s]\s*([A-Z0-9]{4,8})(?![A-Z0-9])/i,  // "验证码: 123456"
        /[^\w]\s*([A-Z0-9]{4,8})(?![A-Z0-9])/i,        // "验证码 123456"
        /^[^\w]*([A-Z0-9]{4,8})(?![A-Z0-9])/i,         // 开头直接是验证码
      ]

      for (const pattern of patterns) {
        const match = searchRange.match(pattern)
        if (match && match[1] && /\d/.test(match[1])) {
          const code = match[1].toUpperCase()
          const context = content.slice(Math.max(0, idx - 50), idx + (match.index || 0) + 100)

          if (!shouldExclude(code, context)) return code
        }
      }
    }
  }

  // 策略 2: HTML 突出显示的内容（高优先级）
  if (html) {
    // 匹配被强调标签包裹的 4-8 位数字/字母
    const emphasisPatterns = [
      /<(?:strong|b|em|mark)\s*[^>]*>\s*([A-Z0-9]{4,8})\s*<\/(?:strong|b|em|mark)>/gi,
      /<span[^>]*(?:font-size:\s*(?:[2-9]|[1-9]\d)|font-weight:\s*(?:bold|[6-9]00))[^>]*>\s*([A-Z0-9]{4,8})\s*<\/span>/gi,
      /<(?:h[1-6]|p)\s*[^>]*>\s*([A-Z0-9]{5,8})\s*<\/(?:h[1-6]|p)>/gi,
      /<div[^>]*>\s*([A-Z0-9]{6})\s*<\/div>/gi, // 单独div包裹的6位验证码
    ]

    for (const pattern of emphasisPatterns) {
      const matches = html.matchAll(pattern)
      for (const match of matches) {
        if (match[1] && /\d/.test(match[1])) {
          const code = match[1].toUpperCase()
          const surroundingText = html.slice(Math.max(0, match.index! - 300), match.index! + 300)
          const hasKeyword = strictKeywords.concat(mediumKeywords).some(kw =>
            new RegExp(kw, 'i').test(surroundingText)
          )

          if (hasKeyword && !shouldExclude(code, surroundingText)) return code
        }
      }
    }
  }

  // 策略 3: 中等关键词 + 附近数字
  for (const keyword of mediumKeywords) {
    const idx = content.toLowerCase().indexOf(keyword.toLowerCase())
    if (idx !== -1) {
      const afterKeyword = content.slice(idx, idx + 100)

      // 匹配 4-8 位纯数字
      const numMatch = afterKeyword.match(/\b([0-9]{4,8})\b/)
      if (numMatch && !shouldExclude(numMatch[1], afterKeyword)) return numMatch[1]

      // 匹配 4-8 位字母数字混合
      const alphaNumMatch = afterKeyword.match(/\b([A-Z0-9]{4,8})\b/i)
      if (alphaNumMatch && /\d/.test(alphaNumMatch[1]) && /[A-Z]/i.test(alphaNumMatch[1])) {
        if (!shouldExclude(alphaNumMatch[1], afterKeyword)) return alphaNumMatch[1].toUpperCase()
      }
    }
  }

  // 策略 4: 独立行的验证码（高优先级，在严格关键词匹配后）
  // 匹配单独一行、前后有空行或换行的 4-8 位验证码
  const standaloneMatches = content.matchAll(/[\r\n\s]{2,}([A-Z0-9]{4,8})[\r\n\s]{2,}/gi)
  for (const match of standaloneMatches) {
    if (match[1] && /\d/.test(match[1]) && /[A-Z]/i.test(match[1])) {
      const code = match[1].toUpperCase()
      const contextStart = Math.max(0, match.index! - 150)
      const contextEnd = Math.min(content.length, match.index! + match[0].length + 50)
      const context = content.slice(contextStart, contextEnd)

      // 检查附近是否有验证码相关关键词
      const hasKeyword = strictKeywords.concat(mediumKeywords).some(kw =>
        new RegExp(kw, 'i').test(context)
      )

      if (hasKeyword && !shouldExclude(code, context)) return code
    }
  }

  // 策略 5: 数字模式匹配（5-8位纯数字，需要强验证相关上下文）
  const digitMatches = content.matchAll(/\b(\d{5,8})\b/g)
  for (const match of digitMatches) {
    const code = match[1]
    const contextStart = Math.max(0, match.index! - 120)
    const contextEnd = Math.min(content.length, match.index! + match[0].length + 120)
    const context = content.slice(contextStart, contextEnd)

    // 必须在附近有强验证相关的词汇
    const hasStrongContext = strictKeywords.some(kw =>
      new RegExp(kw, 'i').test(context)
    )

    if (hasStrongContext && !shouldExclude(code, context)) return code
  }

  return null
}

// 简单的 XOR 加密/解密（用于第三方邮箱密码）
// 注意：这不是强加密，仅用于防止数据库中的明文存储
export function encryptPassword(password: string, key: string): string {
  const keyBytes = new TextEncoder().encode(key)
  const passwordBytes = new TextEncoder().encode(password)
  const encrypted = new Uint8Array(passwordBytes.length)

  for (let i = 0; i < passwordBytes.length; i++) {
    encrypted[i] = passwordBytes[i] ^ keyBytes[i % keyBytes.length]
  }

  return btoa(String.fromCharCode(...encrypted))
}

export function decryptPassword(encrypted: string, key: string): string {
  const keyBytes = new TextEncoder().encode(key)
  const encryptedBytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
  const decrypted = new Uint8Array(encryptedBytes.length)

  for (let i = 0; i < encryptedBytes.length; i++) {
    decrypted[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length]
  }

  return new TextDecoder().decode(decrypted)
}
