import type { APIRoute } from "astro"
import { createDB, getEmail, getEmailsByMailbox } from "database"
import { extractVerificationCode } from "../../lib/utils"
import {
  authenticateCfAddress,
  jsonResponse,
  textResponse,
} from "../../lib/cf-compat"

/**
 * GET /api/otp?seconds=600
 * Convenience OTP endpoint (not in CF temp-email, but useful for agents).
 * Also: if client only has CF paths, they can use /api/parsed_mails and scan subject/text.
 */
export const GET: APIRoute = async (context) => {
  const auth = await authenticateCfAddress(context)
  if (!auth.ok) return auth.response

  const url = new URL(context.request.url)
  const seconds = Math.min(
    Math.max(Number.parseInt(url.searchParams.get("seconds") || "600", 10) || 600, 0),
    86400
  )
  const since = Math.floor(Date.now() / 1000) - seconds
  const emails = await getEmailsByMailbox(auth.db, auth.address, { limit: 10 })

  for (const email of emails) {
    if (email.createdAt < since) break
    const code =
      extractVerificationCode(email.text, email.html) ||
      extractVerificationCode(email.subject, null)
    if (code) {
      return jsonResponse({
        success: true,
        code,
        subject: email.subject,
        sender: email.fromAddress,
        received_at: email.createdAt,
        mail_id: email.id,
      })
    }
  }

  return jsonResponse({
    success: true,
    code: null,
    message: "No verification code found",
  })
}
