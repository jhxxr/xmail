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
