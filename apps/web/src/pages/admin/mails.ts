import type { APIRoute } from "astro"
import {
  createDB,
  listAllEmailSummaries,
  countAllEmails,
} from "database"
import {
  authenticateCfAdmin,
  parseLimitOffset,
  jsonResponse,
  textResponse,
  toCfMailRow,
} from "../../lib/cf-compat"

export const GET: APIRoute = async (context) => {
  const auth = await authenticateCfAdmin(context)
  if (!auth.ok) return auth.response

  const url = new URL(context.request.url)
  const parsed = parseLimitOffset(url.searchParams, { limit: 20, offset: 0 })
  if ("error" in parsed) return textResponse(parsed.error, 400)

  const address = (url.searchParams.get("address") || "").toLowerCase().trim() || undefined
  const db = createDB(context.locals.runtime.env.DB)
  const results = await listAllEmailSummaries(db, {
    limit: parsed.limit,
    offset: parsed.offset,
    mailboxAddress: address,
  })
  const count = parsed.offset === 0 ? await countAllEmails(db, address) : 0

  return jsonResponse({
    results: results.map((r) => toCfMailRow(r, { includeBody: false })),
    count,
  })
}
