import type { APIContext, APIRoute } from "astro"
import { getEmail, getOauthMailAccountByEmail, listEmailSummaries, type DB } from "database"
import { requireApiV1Key, apiV1Json, apiV1OptionsRoute } from "../../../../lib/api-v1"
import { extractVerificationCode } from "../../../../lib/utils"
import { isEncryptionKeyConfigured } from "../../../../lib/crypto"
import { findVerificationCodeInMailbox, withAccountToken } from "../../../../lib/ms-graph"

export const OPTIONS = apiV1OptionsRoute

export const GET: APIRoute = async (context) => {
  const auth = await requireApiV1Key(context)
  if (!auth) return apiV1Json({ success: false, error: "Unauthorized" }, 401)

  const { searchParams } = new URL(context.request.url)
  const mailbox = searchParams.get("mailbox")
  const secondsParam = searchParams.get("seconds") || "600"
  const seconds = parseInt(secondsParam)

  if (!mailbox) {
    return apiV1Json({ success: false, error: "Missing required parameter: mailbox" }, 400)
  }

  if (isNaN(seconds) || seconds < 0 || seconds > 86400) {
    return apiV1Json({ success: false, error: "Invalid seconds parameter (must be 0-86400)" }, 400)
  }

  const sinceTimestamp = Math.floor(Date.now() / 1000) - seconds

  try {
    // 1) Lightweight list first (no html/text) — CF-style read performance
    const summaries = await listEmailSummaries(auth.db, mailbox, { limit: 10 })

    if (summaries.length === 0) {
      // 2) Fallback: OAuth mail account (live Graph, filtered by time window)
      return handleOauthFallback(context, auth.db, mailbox, sinceTimestamp)
    }

    for (const summary of summaries) {
      if (summary.createdAt < sinceTimestamp) break

      let code = extractVerificationCode(summary.subject, null)
      let full = null as Awaited<ReturnType<typeof getEmail>>
      if (!code) {
        full = await getEmail(auth.db, summary.id)
        if (full) {
          code =
            extractVerificationCode(full.text, full.html) ||
            extractVerificationCode(full.subject, null)
        }
      }

      if (code) {
        return apiV1Json({
          success: true,
          data: {
            code,
            subject: summary.subject,
            sender: summary.fromAddress,
            sender_name: summary.fromName,
            received_at: summary.createdAt,
            source: "local",
          },
        })
      }
    }

    const latest = summaries[0]
    const latestFull = await getEmail(auth.db, latest.id)
    return apiV1Json({
      success: true,
      data: {
        code: null,
        message: "No verification code found in recent emails",
        latest_email: {
          subject: latest.subject,
          sender: latest.fromAddress,
          text_snippet:
            latestFull?.text?.slice(0, 200) ||
            latestFull?.html?.replace(/<[^>]*>/g, "").slice(0, 200) ||
            null,
          received_at: latest.createdAt,
        },
        source: "local",
      },
    })
  } catch (error) {
    console.error("Verification code API error:", error)
    return apiV1Json({ success: false, error: "Internal server error" }, 500)
  }
}

// 本地 D1 无邮件时回退到同地址 OAuth 账号（Microsoft Graph 实时拉信）
async function handleOauthFallback(
  context: APIContext,
  db: DB,
  mailbox: string,
  sinceTimestamp: number
): Promise<Response> {
  const oauthAccount = await getOauthMailAccountByEmail(db, mailbox)
  if (!oauthAccount) {
    return apiV1Json({
      success: true,
      data: {
        code: null,
        message: "No emails found for mailbox",
        latest_email: null,
      },
    })
  }

  const encryptionKey = context.locals.runtime.env.ENCRYPTION_KEY
  if (!isEncryptionKeyConfigured(encryptionKey)) {
    return apiV1Json({ success: false, error: "ENCRYPTION_KEY not configured for OAuth accounts" }, 500)
  }

  const result = await withAccountToken(db, oauthAccount, encryptionKey!, async (accessToken) => {
    const found = await findVerificationCodeInMailbox(accessToken, extractVerificationCode, {
      folder: "all",
      top: 10,
      receivedSinceMs: sinceTimestamp * 1000,
      maxDetailFetches: 3,
    })
    if (!found.success) throw new Error(found.error)
    return found.data
  })

  if (!result.success) {
    return apiV1Json(
      {
        success: false,
        error: result.error,
        auth_error: result.authError || false,
      },
      result.authError ? 401 : 502
    )
  }

  const data = result.data
  if (data.code) {
    return apiV1Json({
      success: true,
      data: {
        code: data.code,
        subject: data.subject,
        sender: data.sender,
        sender_name: data.sender_name,
        received_at: data.received_at
          ? Math.floor(Date.parse(data.received_at) / 1000)
          : null,
        source: "oauth",
      },
    })
  }

  return apiV1Json({
    success: true,
    data: {
      code: null,
      message: "No verification code found in recent emails",
      latest_email: data.latest_email
        ? {
            ...data.latest_email,
            received_at: data.latest_email.received_at
              ? Math.floor(Date.parse(data.latest_email.received_at) / 1000)
              : null,
          }
        : null,
      source: "oauth",
    },
  })
}
