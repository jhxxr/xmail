import type { APIRoute } from "astro"
import { createDB, getEmailsByMailbox } from "database"
import { authenticateApiKey, unauthorizedResponse } from "../../../../lib/api-auth"
import { extractVerificationCode } from "../../../../lib/utils"

export const GET: APIRoute = async (context) => {
  if (!await authenticateApiKey(context)) {
    return unauthorizedResponse()
  }

  const { searchParams } = new URL(context.request.url)
  const mailbox = searchParams.get("mailbox")
  const secondsParam = searchParams.get("seconds") || "600"
  const seconds = parseInt(secondsParam)

  if (!mailbox) {
    return new Response(JSON.stringify({
      success: false,
      error: "Missing required parameter: mailbox"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })
  }

  if (isNaN(seconds) || seconds < 0 || seconds > 86400) {
    return new Response(JSON.stringify({
      success: false,
      error: "Invalid seconds parameter (must be 0-86400)"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })
  }

  const db = createDB(context.locals.runtime.env.DB)
  const sinceTimestamp = Math.floor(Date.now() / 1000) - seconds

  try {
    const emails = await getEmailsByMailbox(db, mailbox, { limit: 10 })

    for (const email of emails) {
      if (email.createdAt < sinceTimestamp) break

      console.log("检查邮件:", email.subject, "发件人:", email.fromAddress)
      const code = extractVerificationCode(email.text, email.html)
      console.log("提取结果:", code)

      if (code) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            code,
            subject: email.subject,
            sender: email.fromAddress,
            sender_name: email.fromName,
            received_at: email.createdAt
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      }
    }

    const latestEmail = emails[0]
    return new Response(JSON.stringify({
      success: true,
      data: {
        code: null,
        message: "No verification code found in recent emails",
        latest_email: latestEmail ? {
          subject: latestEmail.subject,
          sender: latestEmail.fromAddress,
          text_snippet: latestEmail.text?.slice(0, 200) || latestEmail.html?.replace(/<[^>]*>/g, '').slice(0, 200),
          received_at: latestEmail.createdAt
        } : null
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })

  } catch (error) {
    console.error("Verification code API error:", error)
    return new Response(JSON.stringify({
      success: false,
      error: "Internal server error"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
}
