import type { APIRoute } from "astro"
import { getEmail } from "database"
import {
  authenticateCfAddress,
  jsonResponse,
  toCfParsedMailRow,
} from "../../../lib/cf-compat"

/**
 * GET /api/parsed_mail/:mail_id
 */
export const GET: APIRoute = async (context) => {
  const auth = await authenticateCfAddress(context)
  if (!auth.ok) return auth.response

  const mailId = context.params.mail_id
  if (!mailId) return jsonResponse(null)

  const email = await getEmail(auth.db, mailId)
  if (!email || email.mailboxAddress.toLowerCase() !== auth.address) {
    return jsonResponse(null)
  }

  return jsonResponse(toCfParsedMailRow(email))
}
