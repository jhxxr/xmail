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

// 验证码提取算法 - 增强版 v2
// 参考: Apple OTP标准, Gmail, Mailosaur等成熟方案
// 改进: 更严格的过滤规则，减少误判
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
    // 中文 - 带连接词的变体
    '验证码为', '验证码是', '动态码为', '确认码是',
    '临时验证码', '邮箱验证码', '手机验证码', '登录验证码', '注册验证码',
    '短信验证码', '登录码', '注册码', '动态密码', '一次性密码', '激活码', '通行码',
    '一次性验证码', '验证码如下', '验证码为：', '验证代码', '安全代码',
    // 英文
    'verification code', 'verify code', 'confirmation code', 'security code',
    'otp', 'one-time password', 'one time password',
    'your code', 'code is', 'enter code', 'use code', 'code:',
    'verification:', 'confirm with', 'authenticate with',
    // 其他语言
    'código', 'codigo', 'kode', 'código de verificación'
  ]

  // 中等优先级关键词（需要更严格的上下文验证）
  const mediumKeywords = [
    'passcode', 'pin code', 'auth code', 'authentication code',
    'access code', 'temp code', 'temporary code'
  ]

  // 排除模式 - 避免误判（增强版）
  const excludePatterns = [
    // 日期时间格式
    /\d{4}[年\-\/]\d{1,2}[月\-\/]\d{1,2}[日]?/,  // 日期
    /\d{1,2}[:\-]\d{2}[:\-]\d{2}/,              // 时间
    /\b(19|20)\d{2}\b/,                          // 年份

    // 联系方式
    /\d{3}[\-\.\s]\d{3,4}[\-\.\s]\d{4}/,        // 电话
    /\+?\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,9}/, // 国际电话
    /\d{5,6}[\-]\d{4}/,                          // 邮编

    // 邮箱地址中的数字
    /[\w.-]+\d+[\w.-]*@[\w.-]+/,                 // 邮箱用户名包含数字
    /@[\w.-]*\d+[\w.-]*/,                        // 邮箱域名包含数字

    // 金额和数量
    /\$\s*\d+/,                                  // 金额 $
    /¥\s*\d+/,                                   // 金额 ¥
    /€\s*\d+/,                                   // 金额 €
    /\d+\s*(?:元|美元|欧元|英镑)/,              // 中文金额
    /\d+\s*(?:USD|EUR|GBP|CNY)/i,               // 货币代码
    /\d+\s*(?:件|个|条|次)/,                    // 数量单位

    // 订单和追踪号
    /order|订单|invoice|发票|tracking|快递|运单|物流/i,
    /price|价格|amount|金额|total|合计/i,
    /transaction|交易|payment|支付/i,

    // ID 和编号
    /user\s*id|用户id|账号|account/i,
    /ticket|工单|case\s*#/i,

    // 包含连字符或特殊分隔符的长串数字（很可能是ID）
    /\d{3,}-\d{3,}/,
    /\d{3,}_\d{3,}/,

    // URL 中的数字
    /https?:\/\/[\w\d./-]*\d+/i,

    // 版本号
    /v\d+\.\d+/i,
    /version\s*\d+/i
  ]

  // 辅助函数：检查是否应该排除（增强版）
  const shouldExclude = (match: string, fullContext: string, nearContext: string = ''): boolean => {
    // 1. 检查排除模式
    for (const pattern of excludePatterns) {
      if (pattern.test(fullContext)) return true
    }

    // 2. 排除连续出现的相同数字（如 111111, 000000, 123456 等顺序数字）
    if (/^(\d)\1+$/.test(match)) return true

    // 检查顺序递增/递减数字（123456, 654321）
    const isSequential = (str: string): boolean => {
      const digits = str.split('').map(Number)
      let increasing = true
      let decreasing = true
      for (let i = 1; i < digits.length; i++) {
        if (digits[i] !== digits[i-1] + 1) increasing = false
        if (digits[i] !== digits[i-1] - 1) decreasing = false
      }
      return increasing || decreasing
    }
    if (match.length >= 5 && /^\d+$/.test(match) && isSequential(match)) return true

    // 3. 检查邮箱地址上下文（更严格）
    const emailPattern = /[\w.-]+@[\w.-]+\.\w+/
    if (emailPattern.test(nearContext)) {
      // 如果数字在 @ 符号附近（前后30个字符内），很可能是邮箱的一部分
      const atSignIndex = nearContext.indexOf('@')
      const codeIndexInNear = nearContext.indexOf(match)
      if (atSignIndex !== -1 && codeIndexInNear !== -1) {
        const distance = Math.abs(atSignIndex - codeIndexInNear)
        if (distance < 30) return true
      }
    }

    // 4. 排除明显的上下文关键词
    const lowerContext = fullContext.toLowerCase()
    const excludeContextWords = [
      'date', 'time', '日期', '时间',
      'order', '订单', 'invoice', '发票',
      'transaction', '交易', 'payment', '支付',
      'phone', 'tel', '电话', '手机',
      'user id', 'user-id', 'userid', '用户id',
      'account', '账号', 'email', '邮箱',
      'price', '价格', 'amount', '金额',
      'total', '合计', 'balance', '余额',
      'reference', 'ref', '参考', '编号',
      'ticket', '工单'
    ]

    for (const word of excludeContextWords) {
      if (lowerContext.includes(word)) return true
    }

    // 5. 排除数字过短（<4位）或过长（>8位）
    if (match.length < 4 || match.length > 8) return true

    // 6. 检查是否在 URL 中
    if (/https?:\/\/[^\s]*/.test(nearContext) && nearContext.includes(match)) {
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
      // 在关键词后面查找验证码（缩小搜索范围到50个字符）
      const searchRange = content.slice(idx, idx + 50)

      // 匹配多种格式（更严格的边界检查）
      const patterns = [
        /[:：是为]\s*([A-Z0-9]{4,8})(?![A-Z0-9])/i,  // "验证码: 123456"
        /\s+([A-Z0-9]{4,8})(?![A-Z0-9@.])/i,         // "验证码 123456" (排除@和.)
      ]

      for (const pattern of patterns) {
        const match = searchRange.match(pattern)
        if (match && match[1] && /\d/.test(match[1])) {
          const code = match[1].toUpperCase()
          // 提供更大的上下文和近距离上下文
          const fullContext = content.slice(Math.max(0, idx - 100), idx + 150)
          const nearContext = content.slice(Math.max(0, idx - 30), idx + 80)

          if (!shouldExclude(code, fullContext, nearContext)) return code
        }
      }
    }
  }

  // 策略 2: HTML 突出显示的内容（需要验证相关关键词）
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

          // 必须有验证码相关关键词
          const hasKeyword = strictKeywords.concat(mediumKeywords).some(kw =>
            new RegExp(kw, 'i').test(surroundingText)
          )

          if (hasKeyword && !shouldExclude(code, surroundingText, surroundingText)) return code
        }
      }
    }
  }

  // 策略 3: 中等关键词 + 附近数字（要求更近的距离）
  for (const keyword of mediumKeywords) {
    const idx = content.toLowerCase().indexOf(keyword.toLowerCase())
    if (idx !== -1) {
      const afterKeyword = content.slice(idx, idx + 40)  // 缩短到40字符

      // 只匹配 5-8 位纯数字（提高门槛）
      const numMatch = afterKeyword.match(/\b([0-9]{5,8})\b/)
      if (numMatch) {
        const code = numMatch[1]
        const fullContext = content.slice(Math.max(0, idx - 80), idx + 100)
        const nearContext = content.slice(Math.max(0, idx - 20), idx + 60)

        if (!shouldExclude(code, fullContext, nearContext)) return code
      }
    }
  }

  // 策略 4: 独立行的验证码（必须有关键词）
  const standaloneMatches = content.matchAll(/[\r\n]{2,}([A-Z0-9]{5,7})[\r\n]{2,}/gi)
  for (const match of standaloneMatches) {
    if (match[1] && /\d/.test(match[1])) {
      const code = match[1].toUpperCase()
      const contextStart = Math.max(0, match.index! - 150)
      const contextEnd = Math.min(content.length, match.index! + match[0].length + 50)
      const fullContext = content.slice(contextStart, contextEnd)
      const nearContext = content.slice(contextStart, contextEnd)

      // 检查附近是否有验证码相关关键词（必须）
      const hasKeyword = strictKeywords.some(kw =>
        new RegExp(kw, 'i').test(fullContext)
      )

      if (hasKeyword && !shouldExclude(code, fullContext, nearContext)) return code
    }
  }

  // 策略 5 已移除: 不再进行纯数字模式匹配，太容易误判

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
