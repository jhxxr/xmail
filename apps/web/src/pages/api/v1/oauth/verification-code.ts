import type { APIRoute } from "astro"
import { createDB } from "database"
import { resolveOauthAccount, requireEncryptionKey } from "../../../../lib/oauth-auth"
import { extractVerificationCode } from "../../../../lib/utils"
import { findVerificationCodeInMailbox, withAccountToken } from "../../../../lib/ms-graph"

export const GET: APIRoute = async (context) => {
  const resolved = await resolveOauthAccount(context)
  if (!resolved.ok) return resolved.response

  const encryptionKey = context.locals.runtime.env.ENCRYPTION_KEY
  const keyErr = requireEncryptionKey(encryptionKey)
  if (keyErr) return keyErr

  const url = new URL(context.request.url)
  const seconds = parseInt(url.searchParams.get("seconds") || "600", 10)
  const folder = url.searchParams.get("folder") || "all"
  const top = Math.min(parseInt(url.searchParams.get("top") || "10", 10), 20)
  const safeSeconds = Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0), 86400) : 600
  const receivedSinceMs = Date.now() - safeSeconds * 1000

  const db = createDB(context.locals.runtime.env.DB)
  const result = await withAccountToken(
    db,
    resolved.account,
    encryptionKey!,
    async (accessToken) => {
      const found = await findVerificationCodeInMailbox(accessToken, extractVerificationCode, {
        folder,
        top,
        receivedSinceMs,
        maxDetailFetches: 3,
      })
      if (!found.success) throw new Error(found.error)
      return found.data
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

  const data = result.data
  if (data.code) {
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          code: data.code,
          subject: data.subject,
          sender: data.sender,
          sender_name: data.sender_name,
          received_at: data.received_at,
          message_id: data.message_id,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        code: null,
        message: "No verification code found in recent emails",
        latest_email: data.latest_email,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
}
