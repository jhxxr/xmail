import type { APIRoute } from "astro"
import { getEmailsByMailbox } from "database"
import { requireApiV1Key, apiV1Json, apiV1OptionsRoute } from "../../../../../lib/api-v1"
import { extractVerificationCode, extractPreview } from "../../../../../lib/utils"

export const OPTIONS = apiV1OptionsRoute

/**
 * GET /api/v1/admin/mailbox/emails?mailbox=a@b.com&limit=40&offset=0
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireApiV1Key(context)
  if (!auth) return apiV1Json({ success: false, error: "Unauthorized" }, 401)

  const url = new URL(context.request.url)
  const mailbox = (url.searchParams.get("mailbox") || url.searchParams.get("address") || "")
    .toLowerCase()
    .trim()
  if (!mailbox) return apiV1Json({ success: false, error: "Missing mailbox" }, 400)

  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "30", 10) || 30, 1), 100)
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0)

  const emails = await getEmailsByMailbox(auth.db, mailbox, { limit, offset })

  return apiV1Json({
    success: true,
    data: {
      mailbox,
      emails: emails.map((email) => {
        const code =
          extractVerificationCode(email.text, email.html) ||
          extractVerificationCode(email.subject, null)
        return {
          id: email.id,
          subject: email.subject,
          fromAddress: email.fromAddress,
          fromName: email.fromName,
          createdAt: email.createdAt,
          isRead: email.isRead,
          isStarred: email.isStarred,
          preview: extractPreview(email.text, email.html),
          code,
        }
      }),
    },
  })
}
