import type { APIRoute } from "astro"
import {
  createDB,
  createOauthMailAccountsBulk,
  getAdminById,
  listOauthMailAccounts,
  createLog,
} from "database"
import { authenticateApiKey, unauthorizedResponse } from "../../../../../lib/api-auth"
import { verifyToken } from "../../../../../lib/auth"
import { encryptSecret, isEncryptionKeyConfigured } from "../../../../../lib/crypto"
import { parseOutlookImportLines } from "../../../../../lib/oauth-import"
import { invalidateAccessTokenCache } from "../../../../../lib/ms-graph"

async function requireAdminOrApiKey(context: Parameters<APIRoute>[0]): Promise<
  | { ok: true; adminId: string | null }
  | { ok: false; response: Response }
> {
  if (await authenticateApiKey(context)) {
    return { ok: true, adminId: null }
  }

  const jwtSecret = context.locals.runtime.env.JWT_SECRET
  const token = context.cookies.get("admin_token")?.value
  if (!token) return { ok: false, response: unauthorizedResponse() }
  const payload = await verifyToken(token, jwtSecret)
  if (!payload || payload.type !== "admin") {
    return { ok: false, response: unauthorizedResponse() }
  }
  const db = createDB(context.locals.runtime.env.DB)
  const admin = await getAdminById(db, payload.id)
  if (!admin) return { ok: false, response: unauthorizedResponse() }
  return { ok: true, adminId: admin.id }
}

function publicAccount(account: {
  id: string
  email: string
  provider: string
  clientId: string
  shareToken: string
  note: string | null
  status: string
  lastError: string | null
  lastSyncAt: number | null
  createdAt: number
  updatedAt: number
}) {
  return {
    id: account.id,
    email: account.email,
    provider: account.provider,
    clientId: account.clientId,
    shareToken: account.shareToken,
    note: account.note,
    status: account.status,
    lastError: account.lastError,
    lastSyncAt: account.lastSyncAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }
}

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminOrApiKey(context)
  if (!auth.ok) return auth.response

  const db = createDB(context.locals.runtime.env.DB)
  const accounts = await listOauthMailAccounts(db)
  return new Response(
    JSON.stringify({
      success: true,
      data: accounts.map(publicAccount),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
}

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminOrApiKey(context)
  if (!auth.ok) return auth.response

  const encryptionKey = context.locals.runtime.env.ENCRYPTION_KEY
  if (!isEncryptionKeyConfigured(encryptionKey)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "ENCRYPTION_KEY is not configured",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }

  let text = ""
  let note: string | null = null
  const contentType = context.request.headers.get("content-type") || ""

  try {
    if (contentType.includes("application/json")) {
      const body = (await context.request.json()) as {
        text?: string
        account_string?: string
        note?: string
      }
      text = String(body.text || body.account_string || "")
      note = body.note ? String(body.note) : null
    } else {
      const form = await context.request.formData()
      text = form.get("text")?.toString() || form.get("account_string")?.toString() || ""
      note = form.get("note")?.toString() || null
    }
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }

  const parsed = parseOutlookImportLines(text)
  if (parsed.accounts.length === 0) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "No valid accounts to import",
        parse_errors: parsed.errors,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }

  const db = createDB(context.locals.runtime.env.DB)
  const rows = []
  for (const account of parsed.accounts) {
    const encryptedRefreshToken = await encryptSecret(account.refreshToken, encryptionKey!)
    const encryptedPassword = account.password
      ? await encryptSecret(account.password, encryptionKey!)
      : null
    rows.push({
      email: account.email,
      clientId: account.clientId,
      encryptedRefreshToken,
      encryptedPassword,
      note,
      provider: "outlook",
    })
  }

  const result = await createOauthMailAccountsBulk(db, rows, auth.adminId)
  for (const id of result.credentialChangedIds) {
    invalidateAccessTokenCache(id)
  }

  // 导入不做测活：批量会打微软 token 接口并占满 Worker 子请求限额。
  // 需要时用管理页「测活」/ API action=probe / MCP probe_oauth_account 手动测。
  if (auth.adminId) {
    await createLog(db, {
      adminId: auth.adminId,
      action: "oauth_import",
      target: "oauth_mail_accounts",
      details: {
        added: result.added.length,
        updated: result.updated.length,
        skipped: result.skipped.length,
        parse_errors: parsed.errors.length,
      },
      ip: context.request.headers.get("cf-connecting-ip") || undefined,
    })
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        added: result.added.map(publicAccount),
        updated: result.updated.map(publicAccount),
        skipped: result.skipped,
        parse_errors: parsed.errors,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
}
