/**
 * Shared auth resolver for OAuth mail APIs and pages.
 */
import type { APIContext } from "astro"
import {
  createDB,
  getAdminById,
  getOauthMailAccount,
  getOauthMailAccountByEmail,
  getOauthMailAccountByShareToken,
  type OauthMailAccount,
} from "database"
import { authenticateApiKey } from "./api-auth"
import { verifyToken } from "./auth"

export type ResolveOauthResult =
  | { ok: true; account: OauthMailAccount; via: "share" | "api_key" | "session" | "admin" }
  | { ok: false; response: Response }

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export async function resolveOauthAccount(
  context: APIContext,
  options: { requireAccountHint?: boolean } = {}
): Promise<ResolveOauthResult> {
  const db = createDB(context.locals.runtime.env.DB)
  const url = new URL(context.request.url)
  const key = url.searchParams.get("key") || url.searchParams.get("oauth_key") || ""
  const accountId = url.searchParams.get("account") || url.searchParams.get("id") || ""
  const email = url.searchParams.get("email") || url.searchParams.get("mailbox") || ""

  if (key) {
    const account = await getOauthMailAccountByShareToken(db, key)
    if (!account) return { ok: false, response: jsonError("Invalid share token", 401) }
    if (account.status === "disabled") {
      return { ok: false, response: jsonError("Account disabled", 403) }
    }
    return { ok: true, account, via: "share" }
  }

  const authHeader = context.request.headers.get("Authorization")
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7)
    if (token.startsWith("xmail_oauth_")) {
      const account = await getOauthMailAccountByShareToken(db, token)
      if (!account) return { ok: false, response: jsonError("Invalid share token", 401) }
      if (account.status === "disabled") {
        return { ok: false, response: jsonError("Account disabled", 403) }
      }
      return { ok: true, account, via: "share" }
    }
    if (await authenticateApiKey(context)) {
      if (accountId) {
        const account = await getOauthMailAccount(db, accountId)
        if (account) return { ok: true, account, via: "api_key" }
      }
      if (email) {
        const account = await getOauthMailAccountByEmail(db, email)
        if (account) return { ok: true, account, via: "api_key" }
      }
      return {
        ok: false,
        response: jsonError("API key requires account or email param", 400),
      }
    }
  }

  const jwtSecret = context.locals.runtime.env.JWT_SECRET
  const session = context.cookies.get("oauth_token")?.value
  if (session) {
    const payload = await verifyToken(session, jwtSecret)
    if (payload?.type === "oauth_account" && payload.id) {
      const account = await getOauthMailAccount(db, payload.id)
      if (account) {
        if (account.status === "disabled") {
          return { ok: false, response: jsonError("Account disabled", 403) }
        }
        return { ok: true, account, via: "session" }
      }
    }
  }

  const adminToken = context.cookies.get("admin_token")?.value
  if (adminToken) {
    const payload = await verifyToken(adminToken, jwtSecret)
    if (payload?.type === "admin") {
      const admin = await getAdminById(db, payload.id)
      if (admin) {
        if (accountId) {
          const account = await getOauthMailAccount(db, accountId)
          if (account) return { ok: true, account, via: "admin" }
        }
        if (email) {
          const account = await getOauthMailAccountByEmail(db, email)
          if (account) return { ok: true, account, via: "admin" }
        }
        if (options.requireAccountHint !== false) {
          return {
            ok: false,
            response: jsonError("Admin access requires account or email param", 400),
          }
        }
      }
    }
  }

  return { ok: false, response: jsonError("Unauthorized", 401) }
}

export function requireEncryptionKey(encryptionKey: string | undefined): Response | null {
  if (!encryptionKey || encryptionKey === "default-key-please-change") {
    return jsonError("ENCRYPTION_KEY not configured", 500)
  }
  return null
}
