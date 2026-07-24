import type { APIRoute } from "astro"
import { createDB } from "database"
import { resolveOauthAccount, requireEncryptionKey } from "../../../../../../../lib/oauth-auth"
import { downloadAttachment, withAccountToken } from "../../../../../../../lib/ms-graph"

export const GET: APIRoute = async (context) => {
  const resolved = await resolveOauthAccount(context)
  if (!resolved.ok) return resolved.response

  const messageId = context.params.messageId
  const attachmentId = context.params.attachmentId
  if (!messageId || !attachmentId) {
    return new Response(JSON.stringify({ success: false, error: "Missing ids" }), {
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
      const file = await downloadAttachment(accessToken, messageId, attachmentId)
      if (!file.success) throw new Error(file.error)
      return file
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

  const file = result.data
  const safeName = file.name.replace(/[^\w.\-()+@ ]+/g, "_") || "attachment"
  const copy = new Uint8Array(file.contentBytes.byteLength)
  copy.set(file.contentBytes)
  return new Response(copy, {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Content-Length": String(copy.byteLength),
      "Cache-Control": "private, no-store",
    },
  })
}
