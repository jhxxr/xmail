import type { APIRoute } from "astro"
import { createDB, getOauthAccountServicesWithDetails } from "database"
import { resolveOauthAccount, requireEncryptionKey } from "../../../../../lib/oauth-auth"
import { getMessage, withAccountToken } from "../../../../../lib/ms-graph"

export const GET: APIRoute = async (context) => {
  const resolved = await resolveOauthAccount(context)
  if (!resolved.ok) return resolved.response

  const messageId = context.params.messageId
  if (!messageId) {
    return new Response(JSON.stringify({ success: false, error: "Missing messageId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const encryptionKey = context.locals.runtime.env.ENCRYPTION_KEY
  const keyErr = requireEncryptionKey(encryptionKey)
  if (keyErr) return keyErr

  const db = createDB(context.locals.runtime.env.DB)
  const [result, services] = await Promise.all([
    withAccountToken(
      db,
      resolved.account,
      encryptionKey!,
      async (accessToken) => {
        const detail = await getMessage(accessToken, messageId)
        if (!detail.success) throw new Error(detail.error)
        return detail.email
      }
    ),
    getOauthAccountServicesWithDetails(db, resolved.account.id).catch(() => []),
  ])

  if (!result.success) {
    return new Response(
      JSON.stringify({
        success: false,
        error: result.error,
        auth_error: result.authError || false,
      }),
      {
        status: result.authError ? 401 : 502,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: result.data,
      services,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
}
