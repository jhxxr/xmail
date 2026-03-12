export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512"

export interface TotpEntryInput {
  secret: string
  digits?: number | null
  period?: number | null
  algorithm?: string | null
  issuer?: string | null
  accountName?: string | null
  name?: string | null
  note?: string | null
}

export interface ParsedTotpInput {
  secret: string
  digits: number
  period: number
  algorithm: TotpAlgorithm
  issuer: string | null
  accountName: string | null
  name: string
  note: string | null
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const DEFAULT_DIGITS = 6
const DEFAULT_PERIOD = 30
const DEFAULT_ALGORITHM: TotpAlgorithm = "SHA1"

function normalizeSecret(secret: string): string {
  const normalized = secret.toUpperCase().replace(/[\s-]+/g, "")
  if (!normalized) {
    throw new Error("请输入 2FA 密钥")
  }
  if (!/^[A-Z2-7]+=*$/.test(normalized)) {
    throw new Error("2FA 密钥格式无效，请输入 Base32 密钥或 otpauth 链接")
  }
  return normalized.replace(/=+$/g, "")
}

function normalizeDigits(value?: number | string | null): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_DIGITS
  return Math.max(4, Math.min(10, Math.floor(parsed)))
}

function normalizePeriod(value?: number | string | null): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_PERIOD
  return Math.max(5, Math.min(300, Math.floor(parsed)))
}

function normalizeAlgorithm(value?: string | null): TotpAlgorithm {
  const normalized = value?.toUpperCase()
  if (normalized === "SHA256" || normalized === "SHA512") return normalized
  return DEFAULT_ALGORITHM
}

function buildDisplayName(issuer?: string | null, accountName?: string | null, fallback?: string | null): string {
  if (fallback?.trim()) return fallback.trim()
  if (issuer?.trim() && accountName?.trim()) return `${issuer.trim()} (${accountName.trim()})`
  if (issuer?.trim()) return issuer.trim()
  if (accountName?.trim()) return accountName.trim()
  return "未命名 2FA"
}

function parseOtpAuthUrl(input: string): Partial<ParsedTotpInput> {
  const url = new URL(input)
  if (url.protocol !== "otpauth:") {
    throw new Error("不支持的 otpauth 协议")
  }

  const secret = url.searchParams.get("secret")
  if (!secret) {
    throw new Error("otpauth 链接缺少 secret 参数")
  }

  const rawLabel = decodeURIComponent(url.pathname.replace(/^\/+/, ""))
  const labelParts = rawLabel.split(":")
  const labelIssuer = labelParts.length > 1 ? labelParts[0]?.trim() : null
  const labelAccountName = labelParts.length > 1 ? labelParts.slice(1).join(":").trim() : rawLabel.trim() || null
  const issuer = url.searchParams.get("issuer")?.trim() || labelIssuer || null
  const accountName = labelAccountName || null

  return {
    secret: normalizeSecret(secret),
    issuer,
    accountName,
    digits: normalizeDigits(url.searchParams.get("digits")),
    period: normalizePeriod(url.searchParams.get("period")),
    algorithm: normalizeAlgorithm(url.searchParams.get("algorithm")),
  }
}

export function parseTotpInput(input: string, overrides: Partial<TotpEntryInput> = {}): ParsedTotpInput {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error("请输入 2FA 密钥或 otpauth 链接")
  }

  const parsedFromInput = trimmed.toLowerCase().startsWith("otpauth://")
    ? parseOtpAuthUrl(trimmed)
    : { secret: normalizeSecret(trimmed) }

  const secret = normalizeSecret(overrides.secret ?? parsedFromInput.secret ?? "")
  const issuer = overrides.issuer?.trim() || parsedFromInput.issuer || null
  const accountName = overrides.accountName?.trim() || parsedFromInput.accountName || null
  const digits = normalizeDigits(overrides.digits ?? parsedFromInput.digits)
  const period = normalizePeriod(overrides.period ?? parsedFromInput.period)
  const algorithm = normalizeAlgorithm(overrides.algorithm ?? parsedFromInput.algorithm)
  const note = overrides.note?.trim() || null
  const name = buildDisplayName(issuer, accountName, overrides.name)

  return {
    secret,
    issuer,
    accountName,
    digits,
    period,
    algorithm,
    note,
    name,
  }
}

function decodeBase32(secret: string): Uint8Array {
  const clean = normalizeSecret(secret)
  let bits = 0
  let value = 0
  const bytes: number[] = []

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) {
      throw new Error("2FA 密钥不是有效的 Base32 内容")
    }
    value = (value << 5) | index
    bits += 5

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  return new Uint8Array(bytes)
}

function toBigEndianCounter(counter: number): ArrayBuffer {
  const buffer = new ArrayBuffer(8)
  const view = new DataView(buffer)
  const high = Math.floor(counter / 0x100000000)
  const low = counter >>> 0
  view.setUint32(0, high)
  view.setUint32(4, low)
  return buffer
}

function toWebCryptoHash(algorithm: TotpAlgorithm): "SHA-1" | "SHA-256" | "SHA-512" {
  if (algorithm === "SHA256") return "SHA-256"
  if (algorithm === "SHA512") return "SHA-512"
  return "SHA-1"
}

export function getTotpRemainingSeconds(period = DEFAULT_PERIOD, nowMs = Date.now()): number {
  const remaining = period - Math.floor(nowMs / 1000) % period
  return remaining === 0 ? period : remaining
}

export async function generateTotpCode(entry: TotpEntryInput, nowMs = Date.now()): Promise<string> {
  const secret = decodeBase32(entry.secret)
  const digits = normalizeDigits(entry.digits)
  const period = normalizePeriod(entry.period)
  const algorithm = normalizeAlgorithm(entry.algorithm)
  const counter = Math.floor(nowMs / 1000 / period)
  const counterBuffer = toBigEndianCounter(counter)

  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: toWebCryptoHash(algorithm) },
    false,
    ["sign"]
  )
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBuffer))
  const offset = signature[signature.length - 1] & 0x0f
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff)

  return (binary % 10 ** digits).toString().padStart(digits, "0")
}
