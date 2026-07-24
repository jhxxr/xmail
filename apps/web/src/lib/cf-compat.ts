/**
 * Cloudflare temp-email compatible auth helpers.
 *
 * External tools expect:
 * - Address JWT: Authorization: Bearer <jwt>  (scope: one mailbox)
 * - Admin:       x-admin-auth: <password> | API key
 * - Optional:    x-custom-auth (ignored unless configured later)
 */

import type { APIContext } from "astro"
import { createDB, getMailbox, verifyApiKey } from "database"
import type { DB, Mailbox } from "database"
import { verifyAddressToken, verifyToken } from "./auth"

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export function textResponse(text: string, status = 400): Response {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}

/** Parse limit/offset like CF temp-email (limit 1–100, offset >= 0). */
export function parseLimitOffset(
  searchParams: URLSearchParams,
  defaults: { limit?: number; offset?: number } = {}
): { limit: number; offset: number } | { error: string } {
  const limitRaw = searchParams.get("limit")
  const offsetRaw = searchParams.get("offset")
  const limit = limitRaw == null || limitRaw === ""
    ? (defaults.limit ?? 20)
    : Number.parseInt(limitRaw, 10)
  const offset = offsetRaw == null || offsetRaw === ""
    ? (defaults.offset ?? 0)
    : Number.parseInt(offsetRaw, 10)
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return { error: "Invalid limit" }
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return { error: "Invalid offset" }
  }
  return { limit, offset }
}

/**
 * Admin gate for CF-style headers.
 * Accepts (any one):
 * - x-admin-auth: ADMIN_PASSWORD
 * - x-admin-auth: sk_live_...
 * - Authorization: Bearer sk_live_...
 * - Cookie admin_token JWT
 */
export async function authenticateCfAdmin(
  context: APIContext
): Promise<{ ok: true; via: string } | { ok: false; response: Response }> {
  const env = context.locals.runtime.env
  const db = createDB(env.DB)

  // 1) x-admin-auth header (CF temp-email style)
  const adminAuth = context.request.headers.get("x-admin-auth")?.trim()
  if (adminAuth) {
    if (env.ADMIN_PASSWORD && adminAuth === env.ADMIN_PASSWORD) {
      return { ok: true, via: "admin_password" }
    }
    if (adminAuth.startsWith("sk_live_")) {
      const key = await verifyApiKey(db, adminAuth)
      if (key) return { ok: true, via: "api_key_header" }
    }
  }

  // 2) Bearer API key
  const authHeader = context.request.headers.get("Authorization")
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim()
    if (token.startsWith("sk_live_")) {
      const key = await verifyApiKey(db, token)
      if (key) return { ok: true, via: "api_key_bearer" }
    }
  }

  // 3) Admin cookie (XMail UI)
  const cookie = context.cookies.get("admin_token")?.value
  if (cookie) {
    const payload = await verifyToken(cookie, env.JWT_SECRET)
    if (payload?.type === "admin") {
      return { ok: true, via: "admin_cookie" }
    }
  }

  return {
    ok: false,
    response: textResponse("Unauthorized", 401),
  }
}

/**
 * Address-scoped JWT auth (CF temp-email /api/* style).
 */
export async function authenticateCfAddress(
  context: APIContext
): Promise<
  | { ok: true; address: string; mailbox: Mailbox; db: DB }
  | { ok: false; response: Response }
> {
  const env = context.locals.runtime.env
  const db = createDB(env.DB)

  const authHeader = context.request.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: textResponse("Unauthorized", 401) }
  }
  const token = authHeader.slice(7).trim()

  // Admin API key can act as any address when ?address= is provided (optional convenience)
  if (token.startsWith("sk_live_")) {
    const key = await verifyApiKey(db, token)
    if (!key) return { ok: false, response: textResponse("Unauthorized", 401) }
    const address = (
      new URL(context.request.url).searchParams.get("address") ||
      ""
    ).toLowerCase().trim()
    if (!address) {
      return {
        ok: false,
        response: textResponse("API key requires address query param", 400),
      }
    }
    const mailbox = await getMailbox(db, address)
    if (!mailbox || mailbox.deletedAt || !mailbox.isActive) {
      return { ok: false, response: textResponse("Address not found", 404) }
    }
    return { ok: true, address, mailbox, db }
  }

  const claims = await verifyAddressToken(token, env.JWT_SECRET)
  if (!claims) {
    return { ok: false, response: textResponse("Unauthorized", 401) }
  }
  const mailbox = await getMailbox(db, claims.address)
  if (!mailbox || mailbox.deletedAt || !mailbox.isActive) {
    return { ok: false, response: textResponse("Address not found", 404) }
  }
  return { ok: true, address: claims.address, mailbox, db }
}

/** Map XMail email row → CF-ish raw_mails-like object for list clients. */
export function toCfMailRow(email: {
  id: string
  mailboxAddress: string
  fromAddress: string
  fromName?: string | null
  subject?: string | null
  text?: string | null
  html?: string | null
  messageId?: string | null
  date?: string | null
  createdAt: number
  isRead?: boolean
  isStarred?: boolean
}, options: { includeBody?: boolean } = {}) {
  const created_at = new Date(email.createdAt * 1000).toISOString()
  const base: Record<string, unknown> = {
    id: email.id,
    message_id: email.messageId || email.id,
    source: email.fromAddress,
    address: email.mailboxAddress,
    created_at,
    // XMail extras (safe for consumers that ignore unknown fields)
    subject: email.subject ?? "",
    sender: email.fromName
      ? `${email.fromName} <${email.fromAddress}>`
      : email.fromAddress,
    is_read: email.isRead ?? false,
    is_starred: email.isStarred ?? false,
  }
  if (options.includeBody) {
    base.raw = email.text || email.html || ""
    base.text = email.text ?? ""
    base.html = email.html ?? ""
  }
  return base
}

export function toCfParsedMailRow(email: {
  id: string
  mailboxAddress: string
  fromAddress: string
  fromName?: string | null
  subject?: string | null
  text?: string | null
  html?: string | null
  messageId?: string | null
  createdAt: number
}) {
  return {
    id: email.id,
    message_id: email.messageId || email.id,
    address: email.mailboxAddress,
    source: email.fromAddress,
    created_at: new Date(email.createdAt * 1000).toISOString(),
    sender: email.fromName
      ? `${email.fromName} <${email.fromAddress}>`
      : email.fromAddress,
    subject: email.subject ?? "",
    text: email.text ?? "",
    html: email.html ?? "",
    attachments: [] as Array<{ filename: string; mimeType: string; size: number }>,
  }
}
