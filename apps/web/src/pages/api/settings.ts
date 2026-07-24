import type { APIRoute } from "astro"
import {
  authenticateCfAddress,
  jsonResponse,
  textResponse,
} from "../../lib/cf-compat"

/**
 * GET /api/settings — CF temp-email address settings.
 */
export const GET: APIRoute = async (context) => {
  const auth = await authenticateCfAddress(context)
  if (!auth.ok) return auth.response

  return jsonResponse({
    address: auth.address,
    send_balance: 0,
  })
}
