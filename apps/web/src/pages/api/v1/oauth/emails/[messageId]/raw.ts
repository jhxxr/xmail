import type { APIRoute } from "astro"
import { createDB } from "database"
import { resolveOauthAccount, requireEncryptionKey } from "../../../../../../lib/oauth-auth"
import { getMessageRawMime, withAccountToken } from "../../../../../../lib/ms-graph"

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
  const result = await withAccountToken(
    db,
    resolved.account,
    encryptionKey!,
    async (accessToken) => {
      const raw = await getMessageRawMime(accessToken, messageId)
      if (!raw.success) throw new Error(raw.error)
      return raw
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

  return new Response(result.data.mime, {
    status: 200,
    headers: {
      "Content-Type": result.data.contentType,
      "Content-Disposition": `attachment; filename="message-${messageId.slice(0, 12)}.eml"`,
      "Cache-Control": "private, no-store",
    },
  })
}
