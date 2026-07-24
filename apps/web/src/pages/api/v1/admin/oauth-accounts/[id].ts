import type { APIRoute } from "astro"
import {
  createDB,
  createLog,
  deleteOauthMailAccount,
  getAdminById,
  getOauthMailAccount,
  regenerateOauthShareToken,
  updateOauthMailAccount,
} from "database"
import { authenticateApiKey, unauthorizedResponse } from "../../../../../lib/api-auth"
import { verifyToken } from "../../../../../lib/auth"
import {
  invalidateAccessTokenCache,
  probeStoredAccount,
} from "../../../../../lib/ms-graph"
import { encryptSecret, isEncryptionKeyConfigured } from "../../../../../lib/crypto"

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

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminOrApiKey(context)
  if (!auth.ok) return auth.response

  const id = context.params.id
  if (!id) {
    return new Response(JSON.stringify({ success: false, error: "Missing id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const db = createDB(context.locals.runtime.env.DB)
  const account = await getOauthMailAccount(db, id)
  if (!account) {
    return new Response(JSON.stringify({ success: false, error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  await deleteOauthMailAccount(db, id)
  invalidateAccessTokenCache(id)
  if (auth.adminId) {
    await createLog(db, {
      adminId: auth.adminId,
      action: "oauth_delete",
      target: account.email,
      ip: context.request.headers.get("cf-connecting-ip") || undefined,
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

export const PATCH: APIRoute = async (context) => {
  const auth = await requireAdminOrApiKey(context)
  if (!auth.ok) return auth.response

  const id = context.params.id
  if (!id) {
    return new Response(JSON.stringify({ success: false, error: "Missing id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const db = createDB(context.locals.runtime.env.DB)
  const account = await getOauthMailAccount(db, id)
  if (!account) {
    return new Response(JSON.stringify({ success: false, error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  let body: { note?: string; status?: string } = {}
  try {
    body = await context.request.json()
  } catch {
    body = {}
  }

  const updates: { note?: string | null; status?: string } = {}
  if (typeof body.note === "string") updates.note = body.note
  if (typeof body.status === "string" && ["active", "disabled", "auth_error"].includes(body.status)) {
    updates.status = body.status
  }

  if (Object.keys(updates).length > 0) {
    await updateOauthMailAccount(db, id, updates)
  }

  const updated = await getOauthMailAccount(db, id)
  return new Response(
    JSON.stringify({
      success: true,
      data: updated
        ? {
            id: updated.id,
            email: updated.email,
            shareToken: updated.shareToken,
            note: updated.note,
            status: updated.status,
          }
        : null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
}

export const POST: APIRoute = async (context) => {
  // regenerate share token: POST with ?action=regenerate-token or body {action}
  const auth = await requireAdminOrApiKey(context)
  if (!auth.ok) return auth.response

  const id = context.params.id
  if (!id) {
    return new Response(JSON.stringify({ success: false, error: "Missing id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const url = new URL(context.request.url)
  let action = url.searchParams.get("action") || "regenerate-token"
  let body: {
    action?: string
    client_id?: string
    clientId?: string
    refresh_token?: string
    refreshToken?: string
  } = {}
  try {
    body = (await context.request.clone().json()) as typeof body
    if (body?.action) action = String(body.action)
  } catch {
    // ignore
  }

  const db = createDB(context.locals.runtime.env.DB)
  const account = await getOauthMailAccount(db, id)
  if (!account) {
    return new Response(JSON.stringify({ success: false, error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (action === "regenerate-token") {
    const shareToken = await regenerateOauthShareToken(db, id)
    if (!shareToken) {
      return new Response(JSON.stringify({ success: false, error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }
    if (auth.adminId) {
      await createLog(db, {
        adminId: auth.adminId,
        action: "oauth_regenerate_token",
        target: account.email,
        ip: context.request.headers.get("cf-connecting-ip") || undefined,
      })
    }
    return new Response(JSON.stringify({ success: true, data: { shareToken } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (action === "probe") {
    const encryptionKey = context.locals.runtime.env.ENCRYPTION_KEY
    if (!isEncryptionKeyConfigured(encryptionKey)) {
      return new Response(
        JSON.stringify({ success: false, error: "ENCRYPTION_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }
    const probe = await probeStoredAccount(db, account, encryptionKey!)
    const fresh = await getOauthMailAccount(db, id)
    return new Response(
      JSON.stringify({
        success: probe.ok,
        error: probe.error,
        data: fresh
          ? {
              id: fresh.id,
              email: fresh.email,
              status: fresh.status,
              lastError: fresh.lastError,
            }
          : null,
      }),
      { status: probe.ok ? 200 : 502, headers: { "Content-Type": "application/json" } }
    )
  }

  if (action === "reauthorize") {
    const encryptionKey = context.locals.runtime.env.ENCRYPTION_KEY
    if (!isEncryptionKeyConfigured(encryptionKey)) {
      return new Response(
        JSON.stringify({ success: false, error: "ENCRYPTION_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }
    const clientId = (body.client_id || body.clientId || account.clientId || "").trim()
    const refreshToken = (body.refresh_token || body.refreshToken || "").trim()
    if (!clientId || !refreshToken) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "client_id and refresh_token are required for reauthorize",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }
    const encryptedRefreshToken = await encryptSecret(refreshToken, encryptionKey!)
    await updateOauthMailAccount(db, id, {
      clientId,
      encryptedRefreshToken,
      refreshTokenUpdatedAt: Math.floor(Date.now() / 1000),
      status: "active",
      lastError: null,
    })
    invalidateAccessTokenCache(id)
    // reauthorize 只写凭证，不自动测活（避免多余 Graph 调用）
    if (auth.adminId) {
      await createLog(db, {
        adminId: auth.adminId,
        action: "oauth_reauthorize",
        target: account.email,
        ip: context.request.headers.get("cf-connecting-ip") || undefined,
      })
    }
    const after = await getOauthMailAccount(db, id)
    return new Response(
      JSON.stringify({
        success: true,
        data: after
          ? {
              id: after.id,
              email: after.email,
              status: after.status,
              lastError: after.lastError,
              shareToken: after.shareToken,
            }
          : null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }

  return new Response(JSON.stringify({ success: false, error: "Unknown action" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  })
}
