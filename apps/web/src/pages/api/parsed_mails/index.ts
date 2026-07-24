import type { APIRoute } from "astro"
import {
  listEmailSummaries,
  countEmailsByMailbox,
  getEmail,
  getEmailsByMailbox,
} from "database"
import {
  authenticateCfAddress,
  parseLimitOffset,
  jsonResponse,
  textResponse,
  toCfParsedMailRow,
} from "../../../lib/cf-compat"

/**
 * GET /api/parsed_mails?limit=&offset=
 * Server-side parsed list (CF agent-friendly). XMail already stores text/html
 * so we avoid re-parsing MIME — list uses summaries then hydrates light fields.
 *
 * For list we return subject/sender from summary columns; text/html empty on
 * list for speed (detail endpoint returns full body). Optional ?full=1 loads bodies.
 */
export const GET: APIRoute = async (context) => {
  const auth = await authenticateCfAddress(context)
  if (!auth.ok) return auth.response

  const url = new URL(context.request.url)
  const parsed = parseLimitOffset(url.searchParams, { limit: 20, offset: 0 })
  if ("error" in parsed) return textResponse(parsed.error, 400)

  const full = url.searchParams.get("full") === "1"

  if (full) {
    // Full bodies — cap lower for D1 weight
    const limit = Math.min(parsed.limit, 20)
    const emails = await getEmailsByMailbox(auth.db, auth.address, {
      limit,
      offset: parsed.offset,
    })
    const count =
      parsed.offset === 0 ? await countEmailsByMailbox(auth.db, auth.address) : 0
    return jsonResponse({
      results: emails.map((e) => toCfParsedMailRow(e)),
      count,
    })
  }

  const summaries = await listEmailSummaries(auth.db, auth.address, {
    limit: parsed.limit,
    offset: parsed.offset,
  })
  const count =
    parsed.offset === 0 ? await countEmailsByMailbox(auth.db, auth.address) : 0

  // List without html/text for speed; clients use detail for body / OTP poll uses subject
  return jsonResponse({
    results: summaries.map((s) =>
      toCfParsedMailRow({
        ...s,
        text: null,
        html: null,
      })
    ),
    count,
  })
}
