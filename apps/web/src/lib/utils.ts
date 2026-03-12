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

// 验证码提取算法 - 增强版 v3
// 参考: Apple OTP标准, Gmail, Mailosaur等成熟方案
// 改进: 关键词策略 + 结构化候选评分兜底，提升多语言场景召回率
export function extractVerificationCode(text: string | null, html: string | null): string | null {
  const content = text || (
    html
      ? html
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
      : ''
  )
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

  const fallbackAuthHints = /\b(otp|passcode|pin|verification|verify|auth|authentication|security|login|signin|sign-in|one[-\s]?time|temporary|valid|expire|expires|token|code|codigo|código|codice|kode|kod|vérification|verificacion|verificación|verifizierung|sicherheitscode|bestätigungscode|bestatigungscode|authentification|connexion|anmeldung|einmalcode|einmalpasswort)\b/i
  const fallbackActionVerbs = /\b(use|enter|input|paste|copy|submit|utilisez|utilise|saisissez|entrez|ingresa|ingrese|introduce|introduzca|utilice|usa|utiliza|verwenden|verwende|benutzen|eingeben|fortfahren|continue|continuer|continuar|proceed)\b/i
  const fallbackNoiseHints = /\b(order|invoice|tracking|shipment|delivery|payment|transaction|amount|price|total|balance|phone|tel|reference|ref|ticket|case|coupon|discount|promo|promotion|order id|tracking number|user id|account id|uid)\b/i

  const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const findAllIndexes = (source: string, keyword: string): number[] => {
    const indexes: number[] = []
    let start = 0

    while (start < source.length) {
      const idx = source.indexOf(keyword, start)
      if (idx === -1) break
      indexes.push(idx)
      start = idx + Math.max(keyword.length, 1)
    }

    return indexes
  }

  // 辅助函数：检查是否应该排除（增强版）
  const shouldExclude = (match: string, fullContext: string, nearContext: string = ''): boolean => {
    // 1. 排除数字过短（<4位）或过长（>8位）
    if (match.length < 4 || match.length > 8) return true

    // 2. 排除连续出现的相同数字（如 111111, 000000）
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

    // 3. 如果命中邮箱地址的一部分，排除
    const emails = nearContext.match(/[\w.-]+@[\w.-]+\.\w+/g) || []
    if (emails.some(email => email.includes(match))) return true

    // 4. 如果命中 URL 的一部分，排除
    const urls = nearContext.match(/https?:\/\/[^\s)>\"']+/gi) || []
    if (urls.some(url => url.includes(match))) return true

    // 5. 仅在数字紧跟明显的非验证码标签时排除
    const escapedMatch = escapeRegExp(match)
    const explicitNoisePattern = new RegExp(
      `(?:order|订单|invoice|发票|tracking|快递|运单|物流|transaction|交易|payment|支付|ticket|工单|user\\s*id|用户id|account|账号|reference|ref|phone|tel|电话|price|价格|amount|金额|total|合计|balance|余额)\\s*[:#-]?\\s*${escapedMatch}\\b`,
      'i'
    )
    if (explicitNoisePattern.test(nearContext)) return true

    // 6. 货币金额上下文
    const moneyPattern = new RegExp(
      `(?:[$¥€]\\s*${escapedMatch}\\b|\\b${escapedMatch}\\s*(?:USD|EUR|GBP|CNY|元|美元|欧元|英镑)\\b)`,
      'i'
    )
    if (moneyPattern.test(nearContext)) return true

    // 7. 数量上下文
    const quantityPattern = new RegExp(`\\b${escapedMatch}\\s*(?:件|个|条|次|pcs?)\\b`, 'i')
    if (quantityPattern.test(nearContext)) return true

    // 6. 4位年份（版权/年份语境）不作为验证码
    if (/^\d{4}$/.test(match) && /(copyright|©|年份|year)/i.test(fullContext)) return true

    // 8. 明显日期语境中的年份
    if (/^\d{4}$/.test(match)) {
      const yearInDatePattern = new RegExp(`\\b${escapedMatch}\\s*(?:年|[-\\/.])\\s*\\d{1,2}\\b`, 'i')
      if (yearInDatePattern.test(nearContext)) return true
    }

    // 9. URL/链接短码样式（如 URL3243）不是验证码
    if (/^(?:url|http|https|www)[a-z0-9]*\d+[a-z0-9]*$/i.test(match)) return true

    return false
  }

  const emphasisCodeSet = new Set<string>()
  if (html) {
    const emphasisMatches = html.matchAll(
      /<(?:strong|b|em|mark|h[1-6]|span|div)\b[^>]*>\s*([A-Z0-9]{4,8})\s*<\/(?:strong|b|em|mark|h[1-6]|span|div)>/gi
    )
    for (const match of emphasisMatches) {
      if (match[1] && /\d/.test(match[1])) {
        emphasisCodeSet.add(match[1].toUpperCase())
      }
    }
  }

  // 策略 1: 严格关键词匹配（最高优先级）
  const contentLower = content.toLowerCase()
  for (const keyword of strictKeywords) {
    const keywordLower = keyword.toLowerCase()
    const keywordIndexes = findAllIndexes(contentLower, keywordLower)

    for (const idx of keywordIndexes) {
      // 在关键词后面查找验证码（扩大到 120 字符，提升复杂模板兼容性）
      const searchRange = content.slice(idx, idx + 120)

      const patterns = [
        /(?:[:：是为]|\bis\b)\s*([A-Z0-9]{4,8})(?![A-Z0-9])/i, // "verification code is 123456"
        /\b([A-Z0-9]{4,8})\b/i,                                 // 关键词后首个 4-8 位 token
      ]

      for (const pattern of patterns) {
        const match = searchRange.match(pattern)
        if (!match || !match[1] || !/\d/.test(match[1])) continue

        const code = match[1].toUpperCase()
        const relativeMatchIndex = match.index ?? 0
        const codePosInRange = searchRange.indexOf(code, relativeMatchIndex)
        const absoluteCodeIndex = idx + (codePosInRange === -1 ? relativeMatchIndex : codePosInRange)

        const fullContext = content.slice(
          Math.max(0, absoluteCodeIndex - 120),
          absoluteCodeIndex + code.length + 120
        )
        const nearContext = content.slice(
          Math.max(0, absoluteCodeIndex - 60),
          absoluteCodeIndex + code.length + 60
        )

        if (!shouldExclude(code, fullContext, nearContext)) return code
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
    const keywordIndexes = findAllIndexes(contentLower, keyword.toLowerCase())
    for (const idx of keywordIndexes) {
      const afterKeyword = content.slice(idx, idx + 60)
      const numMatch = afterKeyword.match(/\b([0-9]{4,8})\b/)
      if (!numMatch || !numMatch[1]) continue

      const code = numMatch[1]
      const relativeMatchIndex = numMatch.index ?? 0
      const codePosInRange = afterKeyword.indexOf(code, relativeMatchIndex)
      const absoluteCodeIndex = idx + (codePosInRange === -1 ? relativeMatchIndex : codePosInRange)

      const fullContext = content.slice(
        Math.max(0, absoluteCodeIndex - 100),
        absoluteCodeIndex + code.length + 100
      )
      const nearContext = content.slice(
        Math.max(0, absoluteCodeIndex - 50),
        absoluteCodeIndex + code.length + 50
      )

      if (!shouldExclude(code, fullContext, nearContext)) return code
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

  // 策略 5: 多语言/弱关键词兜底（结构化候选评分）
  type Candidate = { code: string; index: number }
  const candidates: Candidate[] = []
  // 兜底候选仅保留纯数字，避免误判 URL3243 / promo code 等字母数字串
  const candidatePattern = /\b([0-9]{4,8})\b/g
  for (const match of content.matchAll(candidatePattern)) {
    if (!match[1]) continue
    const index = match.index ?? -1
    if (index < 0) continue
    candidates.push({ code: match[1], index })
  }

  if (candidates.length > 0) {
    const counts = new Map<string, number>()
    for (const candidate of candidates) {
      counts.set(candidate.code, (counts.get(candidate.code) ?? 0) + 1)
    }

    let bestCandidate: { code: string; score: number; index: number } | null = null

    for (const candidate of candidates) {
      const { code, index } = candidate
      const escapedCode = escapeRegExp(code)
      const fullContext = content.slice(Math.max(0, index - 140), Math.min(content.length, index + code.length + 140))
      const nearContext = content.slice(Math.max(0, index - 80), Math.min(content.length, index + code.length + 80))
      const nearContextLower = nearContext.toLowerCase()

      if (shouldExclude(code, fullContext, nearContext)) continue

      let score = 0

      if ((counts.get(code) ?? 0) >= 2) score += 4
      if (emphasisCodeSet.has(code)) score += 4
      if (fallbackAuthHints.test(nearContextLower)) score += 5
      if (fallbackActionVerbs.test(nearContextLower)) score += 2
      if (fallbackNoiseHints.test(nearContextLower)) score -= 3

      const connectorPattern = new RegExp(`(?:[:：#]|\\bis\\b|\\best\\b|\\bist\\b|\\bes\\b|\\blautet\\b|\\b为\\b|\\b是\\b)\\s*${escapedCode}\\b`, 'i')
      if (connectorPattern.test(nearContext)) score += 2

      const leadingActionPattern = new RegExp(`(?:use|enter|input|utilisez|saisissez|entrez|ingresa|ingrese|introduce|introduzca|utilice|usa|utiliza|verwenden|benutzen|eingeben)\\s+${escapedCode}\\b`, 'i')
      if (leadingActionPattern.test(nearContextLower)) score += 4

      const trailingActionPattern = new RegExp(`${escapedCode}\\s+(?:to|pour|para|um|zum)?\\s*(?:continue|continuer|continuar|proceed|login|sign\\s*-?in|anmelden|verify|verifier|verifizieren)\\b`, 'i')
      if (trailingActionPattern.test(nearContextLower)) score += 3

      const standalonePattern = new RegExp(`(?:^|[\\r\\n])\\s*${escapedCode}\\s*(?:$|[\\r\\n])`)
      if (standalonePattern.test(fullContext)) score += 4

      if (/^20\d{2}$/.test(code)) score -= 2

      if (score >= 5) {
        if (!bestCandidate || score > bestCandidate.score || (score === bestCandidate.score && index < bestCandidate.index)) {
          bestCandidate = { code, score, index }
        }
      }
    }

    if (bestCandidate) return bestCandidate.code
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
