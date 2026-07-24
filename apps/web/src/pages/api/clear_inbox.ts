import type { APIRoute } from "astro"
import { deleteEmailsByMailbox } from "database"
import { authenticateCfAddress, jsonResponse } from "../../lib/cf-compat"

/**
 * DELETE /api/clear_inbox
 */
export const DELETE: APIRoute = async (context) => {
  const auth = await authenticateCfAddress(context)
  if (!auth.ok) return auth.response

  await deleteEmailsByMailbox(auth.db, auth.address)
  return jsonResponse({ success: true })
}
