/**
 * Parse bulk Outlook OAuth account import lines (card-key / outlookEmail style).
 *
 * Auto-detects common layouts:
 *   email----password----client_id----refresh_token   ← 卡密兑换标准格式
 *   email----password----refresh_token----client_id   ← client_id / RT 顺序对调
 *   email----client_id----refresh_token
 *   email----refresh_token----client_id
 *
 * Also tolerates:
 *   - BOM / fullwidth dashes / mixed separators
 *   - Trailing junk after 4th field
 *   - Extra whitespace around fields
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Loose UUID (some dumps omit version/variant nibble constraints). */
const UUID_LOOSE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ParsedOauthAccount = {
  email: string
  password: string
  clientId: string
  refreshToken: string
  line: number
  format: string
}

export type ParseOauthImportResult = {
  accounts: ParsedOauthAccount[]
  errors: Array<{ line: number; message: string; raw: string }>
}

function isUuid(value: string): boolean {
  const v = value.trim()
  return UUID_RE.test(v) || UUID_LOOSE_RE.test(v)
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/** Microsoft consumer refresh tokens often start with M. or EW. */
function looksLikeRefreshToken(value: string): boolean {
  const v = value.trim()
  if (v.length < 40) return false
  if (isUuid(v)) return false
  // Typical MSA / Graph refresh token prefixes
  if (/^(M\.|EW|0\.|1\.|OA)/i.test(v)) return true
  // Long opaque base64-ish / artifact strings
  if (v.length >= 80 && /[A-Za-z0-9._*!$=-]{40,}/.test(v)) return true
  return v.length >= 100
}

function looksLikePassword(value: string): boolean {
  const v = value.trim()
  if (!v) return true // empty password allowed
  if (isUuid(v)) return false
  if (looksLikeRefreshToken(v)) return false
  // Short-ish credential field
  return v.length <= 128
}

/**
 * Resolve client_id vs refresh_token order when both are present.
 */
export function resolveClientIdAndRefreshToken(
  a: string,
  b: string
): { clientId: string; refreshToken: string } | null {
  const left = a.trim()
  const right = b.trim()
  if (!left || !right) return null

  if (isUuid(left) && !isUuid(right)) {
    return { clientId: left, refreshToken: right }
  }
  if (isUuid(right) && !isUuid(left)) {
    return { clientId: right, refreshToken: left }
  }
  if (looksLikeRefreshToken(left) && !looksLikeRefreshToken(right)) {
    return { clientId: right, refreshToken: left }
  }
  if (looksLikeRefreshToken(right) && !looksLikeRefreshToken(left)) {
    return { clientId: left, refreshToken: right }
  }
  // Prefer longer string as refresh token when ambiguous
  if (left.length >= right.length) {
    return { clientId: right, refreshToken: left }
  }
  return { clientId: left, refreshToken: right }
}

/** Normalize separators: fullwidth dash, en/em dash, multi-hyphen runs. */
function normalizeLine(raw: string): string {
  return raw
    .replace(/^﻿/, "") // BOM
    .replace(/[－—–]/g, "-")
    .replace(/-{3,}/g, "----") // --- or more → ----
    .trim()
}

function splitFields(line: string): string[] {
  // Prefer exact "----" after normalize; also accept " | " dumps rarely
  if (line.includes("----")) {
    return line.split("----").map((p) => p.trim())
  }
  if (line.includes("\t")) {
    return line.split("\t").map((p) => p.trim()).filter(Boolean)
  }
  return line.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean)
}

/**
 * Auto-detect field roles for 3+ segments after email.
 * Standard card format: email | password | client_id | refresh_token
 */
function detectFields(
  parts: string[]
): { password: string; clientId: string; refreshToken: string; format: string } | null {
  // parts[0] is email; rest are credentials
  const rest = parts.slice(1).filter((p) => p !== undefined)

  if (rest.length < 2) return null

  // --- 3 fields total: email + 2 ---
  if (rest.length === 2) {
    const resolved = resolveClientIdAndRefreshToken(rest[0], rest[1])
    if (!resolved) return null
    return {
      password: "",
      clientId: resolved.clientId,
      refreshToken: resolved.refreshToken,
      format: "email----client_id----refresh_token",
    }
  }

  // --- 4+ fields: email + password + client_id + refresh_token ---
  // Case A (卡密标准): password, uuid client_id, long RT
  if (isUuid(rest[1]) && looksLikeRefreshToken(rest[2])) {
    return {
      password: rest[0],
      clientId: rest[1],
      refreshToken: rest[2],
      format: "email----password----client_id----refresh_token",
    }
  }

  // Case B: password, long RT, uuid client_id (swapped tail)
  if (looksLikeRefreshToken(rest[1]) && isUuid(rest[2])) {
    return {
      password: rest[0],
      clientId: rest[2],
      refreshToken: rest[1],
      format: "email----password----refresh_token----client_id",
    }
  }

  // Case C: field1 is actually client_id (no password): uuid, RT, ...
  if (isUuid(rest[0]) && looksLikeRefreshToken(rest[1])) {
    return {
      password: "",
      clientId: rest[0],
      refreshToken: rest[1],
      format: "email----client_id----refresh_token",
    }
  }

  // Case D: field1 is RT, field2 is client_id
  if (looksLikeRefreshToken(rest[0]) && isUuid(rest[1])) {
    return {
      password: "",
      clientId: rest[1],
      refreshToken: rest[0],
      format: "email----refresh_token----client_id",
    }
  }

  // Case E: password-like + two opaque fields — resolve last two as id/token
  if (looksLikePassword(rest[0]) || rest[0].length < 64) {
    const resolved = resolveClientIdAndRefreshToken(rest[1], rest[2])
    if (resolved && looksLikeRefreshToken(resolved.refreshToken)) {
      return {
        password: rest[0],
        clientId: resolved.clientId,
        refreshToken: resolved.refreshToken,
        format: "email----password----client_id----refresh_token(auto)",
      }
    }
  }

  // Fallback: treat [password][a][b] with auto resolve of a/b
  const resolved = resolveClientIdAndRefreshToken(rest[1], rest[2])
  if (!resolved) return null
  return {
    password: rest[0],
    clientId: resolved.clientId,
    refreshToken: resolved.refreshToken,
    format: "email----password----?(auto)",
  }
}

export function parseOutlookImportLines(text: string): ParseOauthImportResult {
  const accounts: ParsedOauthAccount[] = []
  const errors: ParseOauthImportResult["errors"] = []
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const raw = lines[i].trim()
    if (!raw || raw.startsWith("#") || raw.startsWith("//")) continue

    const normalized = normalizeLine(raw)
    const parts = splitFields(normalized)

    if (parts.length < 3) {
      errors.push({
        line: lineNo,
        message:
          "字段不足。卡密格式: email----password----client_id----refresh_token",
        raw,
      })
      continue
    }

    const email = parts[0]
    if (!looksLikeEmail(email)) {
      errors.push({ line: lineNo, message: "无效的邮箱地址（第一段应为 email）", raw })
      continue
    }

    const detected = detectFields(parts)
    if (!detected) {
      errors.push({
        line: lineNo,
        message: "无法识别 client_id / refresh_token，请确认卡密格式",
        raw,
      })
      continue
    }

    const { password, clientId, refreshToken, format } = detected

    if (!clientId || !refreshToken) {
      errors.push({ line: lineNo, message: "client_id 或 refresh_token 为空", raw })
      continue
    }

    if (!isUuid(clientId) && !looksLikeRefreshToken(refreshToken)) {
      // soft warn via error only if RT also bad
      if (refreshToken.length < 20) {
        errors.push({ line: lineNo, message: "refresh_token 过短，可能无效", raw })
        continue
      }
    }

    if (refreshToken.length < 20) {
      errors.push({ line: lineNo, message: "refresh_token 过短，可能无效", raw })
      continue
    }

    accounts.push({
      email: email.toLowerCase(),
      password,
      clientId,
      refreshToken,
      line: lineNo,
      format,
    })
  }

  return { accounts, errors }
}
