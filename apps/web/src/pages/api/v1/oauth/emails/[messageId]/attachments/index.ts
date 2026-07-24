import type { APIRoute } from "astro"
import { createDB } from "database"
import { resolveOauthAccount, requireEncryptionKey } from "../../../../../../../lib/oauth-auth"
import { listAttachments, withAccountToken } from "../../../../../../../lib/ms-graph"

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
      const listed = await listAttachments(accessToken, messageId)
      if (!listed.success) throw new Error(listed.error)
      return listed.attachments
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
    JSON.stringify({ success: true, data: { attachments: result.data } }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
}
