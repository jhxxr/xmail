import type { APIRoute } from "astro"
import { createDB } from "database"
import { resolveOauthAccount, requireEncryptionKey } from "../../../../../lib/oauth-auth"
import { listMessages, withAccountToken } from "../../../../../lib/ms-graph"

export const GET: APIRoute = async (context) => {
  const resolved = await resolveOauthAccount(context)
  if (!resolved.ok) return resolved.response

  const encryptionKey = context.locals.runtime.env.ENCRYPTION_KEY
  const keyErr = requireEncryptionKey(encryptionKey)
  if (keyErr) return keyErr

  const url = new URL(context.request.url)
  const folder = url.searchParams.get("folder") || "inbox"
  const top = parseInt(url.searchParams.get("top") || "20", 10)
  const skip = parseInt(url.searchParams.get("skip") || "0", 10)
  const db = createDB(context.locals.runtime.env.DB)

  const result = await withAccountToken(
    db,
    resolved.account,
    encryptionKey!,
    async (accessToken) => {
      const listed = await listMessages(accessToken, { folder, top, skip })
      if (!listed.success) throw new Error(listed.error)
      return listed.emails
    }
  )

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
      data: {
        email: resolved.account.email,
        folder,
        emails: result.data,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
}
