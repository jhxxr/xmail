import type { APIRoute } from "astro"
import {
  listEmailSummaries,
  countEmailsByMailbox,
  getEmail,
  deleteEmail,
  deleteEmailsByMailbox,
  deleteMailbox,
} from "database"
import {
  authenticateCfAddress,
  parseLimitOffset,
  jsonResponse,
  textResponse,
  toCfMailRow,
} from "../../../lib/cf-compat"

/**
 * GET /api/mails?limit=&offset=
 * CF temp-email compatible list (scoped by address JWT).
 * Uses lightweight columns for performance (no full html/text on list).
 */
export const GET: APIRoute = async (context) => {
  const auth = await authenticateCfAddress(context)
  if (!auth.ok) return auth.response

  const url = new URL(context.request.url)
  const parsed = parseLimitOffset(url.searchParams, { limit: 20, offset: 0 })
  if ("error" in parsed) return textResponse(parsed.error, 400)

  const results = await listEmailSummaries(auth.db, auth.address, {
    limit: parsed.limit,
    offset: parsed.offset,
  })

  // CF: count only when offset == 0
  const count =
    parsed.offset === 0
      ? await countEmailsByMailbox(auth.db, auth.address)
      : 0

  return jsonResponse({
    results: results.map((row) => toCfMailRow(row, { includeBody: false })),
    count,
  })
}

/**
 * DELETE /api/mails/:id — optional body-less delete via path under sibling route.
 * This file only handles collection GET. See [id].ts for delete/get mail.
 */
export const DELETE: APIRoute = async (context) => {
  // clear_inbox style is separate; reject collection delete without id
  return textResponse("Use /api/mails/:id or /api/clear_inbox", 400)
}
