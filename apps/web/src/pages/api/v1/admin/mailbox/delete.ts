import type { APIRoute } from "astro"
import { getMailbox, deleteMailbox, createLog } from "database"
import { requireApiV1Key, apiV1Json, apiV1OptionsRoute } from "../../../../../lib/api-v1"

export const OPTIONS = apiV1OptionsRoute

function normalizeAddress(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().trim() : ""
}

/**
 * DELETE /api/v1/admin/mailbox/delete
 * Body or query: address / mailbox
 */
export const DELETE: APIRoute = async (context) => {
  const auth = await requireApiV1Key(context)
  if (!auth) return apiV1Json({ success: false, error: "Unauthorized" }, 401)

  const url = new URL(context.request.url)
  let address = normalizeAddress(url.searchParams.get("address") || url.searchParams.get("mailbox"))

  if (!address) {
    try {
      const body = (await context.request.json()) as { address?: string; mailbox?: string }
      address = normalizeAddress(body?.address || body?.mailbox)
    } catch {
      // ignore
    }
  }

  if (!address) return apiV1Json({ success: false, error: "Missing address" }, 400)

  const existing = await getMailbox(auth.db, address)
  if (!existing) return apiV1Json({ success: false, error: "Not found" }, 404)

  await deleteMailbox(auth.db, address)
  await createLog(auth.db, {
    action: "api_mailbox_delete",
    target: address,
    details: { via: "api_key", keyId: auth.apiKey.id },
    ip: context.request.headers.get("cf-connecting-ip") || undefined,
  })

  return apiV1Json({ success: true, data: { deleted: address } })
}

/** POST alias for clients that cannot send DELETE */
export const POST: APIRoute = async (context) => {
  const auth = await requireApiV1Key(context)
  if (!auth) return apiV1Json({ success: false, error: "Unauthorized" }, 401)

  let address = ""
  try {
    const body = (await context.request.json()) as { address?: string; mailbox?: string }
    address = normalizeAddress(body?.address || body?.mailbox)
  } catch {
    return apiV1Json({ success: false, error: "Invalid JSON" }, 400)
  }
  if (!address) return apiV1Json({ success: false, error: "Missing address" }, 400)

  const existing = await getMailbox(auth.db, address)
  if (!existing) return apiV1Json({ success: false, error: "Not found" }, 404)

  await deleteMailbox(auth.db, address)
  await createLog(auth.db, {
    action: "api_mailbox_delete",
    target: address,
    details: { via: "api_key", keyId: auth.apiKey.id },
    ip: context.request.headers.get("cf-connecting-ip") || undefined,
  })

  return apiV1Json({ success: true, data: { deleted: address } })
}
