import type { APIRoute } from "astro"
import { getEmail, markEmailAsRead } from "database"
import { requireApiV1Key, apiV1Json, apiV1OptionsRoute } from "../../../../../../lib/api-v1"
import { extractVerificationCode } from "../../../../../../lib/utils"
import { sanitizeEmailHtml } from "../../../../../../lib/email-html"

export const OPTIONS = apiV1OptionsRoute

/**
 * GET /api/v1/admin/mailbox/emails/[id]
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireApiV1Key(context)
  if (!auth) return apiV1Json({ success: false, error: "Unauthorized" }, 401)

  const id = context.params.id || ""
  if (!id) return apiV1Json({ success: false, error: "Missing id" }, 400)

  const email = await getEmail(auth.db, id)
  if (!email) return apiV1Json({ success: false, error: "Not found" }, 404)

  if (!email.isRead) {
    await markEmailAsRead(auth.db, id)
  }

  const code =
    extractVerificationCode(email.text, email.html) ||
    extractVerificationCode(email.subject, null)

  return apiV1Json({
    success: true,
    data: {
      id: email.id,
      mailboxAddress: email.mailboxAddress,
      subject: email.subject,
      fromAddress: email.fromAddress,
      fromName: email.fromName,
      createdAt: email.createdAt,
      text: email.text,
      html: email.html ? sanitizeEmailHtml(email.html) : null,
      code,
    },
  })
}
