import type { APIRoute } from "astro"
import {
  createDB,
  getEmail,
  getOauthMailAccountByEmail,
  listEmailSummaries,
} from "database"
import { authenticateApiKey, unauthorizedResponse } from "../../../../lib/api-auth"
import { extractVerificationCode } from "../../../../lib/utils"
import { isEncryptionKeyConfigured } from "../../../../lib/crypto"
import { findVerificationCodeInMailbox, withAccountToken } from "../../../../lib/ms-graph"

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
    // 1) Lightweight list first (no html/text) — CF-style read performance
    const summaries = await listEmailSummaries(db, mailbox, { limit: 10 })

    if (summaries.length > 0) {
      for (const summary of summaries) {
        if (summary.createdAt < sinceTimestamp) break

        let code = extractVerificationCode(summary.subject, null)
        let full = null as Awaited<ReturnType<typeof getEmail>>
        if (!code) {
          full = await getEmail(db, summary.id)
          if (full) {
            code =
              extractVerificationCode(full.text, full.html) ||
              extractVerificationCode(full.subject, null)
          }
        }

        if (code) {
          return new Response(JSON.stringify({
            success: true,
            data: {
              code,
              subject: summary.subject,
              sender: summary.fromAddress,
              sender_name: summary.fromName,
              received_at: summary.createdAt,
              source: "local",
            }
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        }
      }

      const latest = summaries[0]
      const latestFull = await getEmail(db, latest.id)
      return new Response(JSON.stringify({
        success: true,
        data: {
          code: null,
          message: "No verification code found in recent emails",
          latest_email: {
            subject: latest.subject,
            sender: latest.fromAddress,
            text_snippet: latestFull?.text?.slice(0, 200)
              || latestFull?.html?.replace(/<[^>]*>/g, "").slice(0, 200)
              || null,
            received_at: latest.createdAt,
          },
          source: "local",
        }
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    }

    // 2) Fallback: OAuth mail account (live Graph, filtered by time window)
    const oauthAccount = await getOauthMailAccountByEmail(db, mailbox)
    if (!oauthAccount) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          code: null,
          message: "No emails found for mailbox",
          latest_email: null,
        }
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    }

    const encryptionKey = context.locals.runtime.env.ENCRYPTION_KEY
    if (!isEncryptionKeyConfigured(encryptionKey)) {
      return new Response(JSON.stringify({
        success: false,
        error: "ENCRYPTION_KEY not configured for OAuth accounts"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
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
      return new Response(JSON.stringify({
        success: false,
        error: result.error,
        auth_error: result.authError || false,
      }), {
        status: result.authError ? 401 : 502,
        headers: { "Content-Type": "application/json" }
      })
    }

    const data = result.data
    if (data.code) {
      return new Response(JSON.stringify({
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
        }
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    }

    return new Response(JSON.stringify({
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
