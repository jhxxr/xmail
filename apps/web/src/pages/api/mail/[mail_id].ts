import type { APIRoute } from "astro"
import { getEmail, deleteEmail } from "database"
import {
  authenticateCfAddress,
  jsonResponse,
  toCfMailRow,
} from "../../../lib/cf-compat"

function mailIdFrom(context: Parameters<APIRoute>[0]): string | undefined {
  return context.params.mail_id || context.params.id
}

export const GET: APIRoute = async (context) => {
  const auth = await authenticateCfAddress(context)
  if (!auth.ok) return auth.response

  const mailId = mailIdFrom(context)
  if (!mailId) return jsonResponse(null)

  const email = await getEmail(auth.db, mailId)
  if (!email || email.mailboxAddress.toLowerCase() !== auth.address) {
    return jsonResponse(null)
  }

  return jsonResponse(toCfMailRow(email, { includeBody: true }))
}

export const DELETE: APIRoute = async (context) => {
  const auth = await authenticateCfAddress(context)
  if (!auth.ok) return auth.response

  const mailId = mailIdFrom(context)
  if (!mailId) return jsonResponse({ success: false })

  const email = await getEmail(auth.db, mailId)
  if (!email || email.mailboxAddress.toLowerCase() !== auth.address) {
    return jsonResponse({ success: false })
  }

  await deleteEmail(auth.db, mailId)
  return jsonResponse({ success: true })
}
