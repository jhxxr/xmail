import type { APIRoute } from "astro"
import { deleteMailbox, deleteEmailsByMailbox } from "database"
import { authenticateCfAddress, jsonResponse } from "../../lib/cf-compat"

/**
 * DELETE /api/delete_address
 * Soft-deletes the mailbox (XMail recycle bin) and clears its mails.
 */
export const DELETE: APIRoute = async (context) => {
  const auth = await authenticateCfAddress(context)
  if (!auth.ok) return auth.response

  await deleteEmailsByMailbox(auth.db, auth.address)
  await deleteMailbox(auth.db, auth.address, "cf-api")
  return jsonResponse({ success: true })
}
