import type { APIRoute } from "astro"
import {
  createMailbox,
  deleteMailbox,
  getMailDomain,
  getMailDomains,
  getMailbox,
  setMailboxPassword,
} from "database"
import { requireApiV1Key, apiV1Json, apiV1OptionsRoute } from "../../../../../lib/api-v1"
import { buildRandomAddress } from "../../../../../lib/random-mailbox"

export const OPTIONS = apiV1OptionsRoute

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * POST /api/v1/admin/mailbox/create
 *
 * - address | local_part+domain | domain only (random)
 * - random: true forces random local-part
 * - delete_previous: soft-delete another mailbox first
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireApiV1Key(context)
  if (!auth) return apiV1Json({ success: false, error: "Unauthorized" }, 401)

  let body: any
  try {
    body = await context.request.json()
  } catch {
    return apiV1Json({ success: false, error: "Invalid JSON body" }, 400)
  }

  const addressInput = normalizeString(body?.address)
  const localPartInput = normalizeString(body?.local_part || body?.localPart)
  const domainInput = normalizeString(body?.domain)
  const note = normalizeString(body?.note) || undefined
  const customPassword = normalizeString(body?.password)
  const wantRandom = body?.random === true || body?.random === "true" || body?.action === "random"
  const deletePrevious = normalizeString(body?.delete_previous || body?.deletePrevious).toLowerCase()

  const envMailDomain = (context.locals.runtime.env.MAIL_DOMAIN || "").trim().toLowerCase()
  const [defaultDomain, allowedDomainsRaw] = await Promise.all([
    getMailDomain(auth.db),
    getMailDomains(auth.db),
  ])
  const allowedDomains = [
    ...new Set(
      [...allowedDomainsRaw, defaultDomain, envMailDomain]
        .map((d) => d.toLowerCase().trim())
        .filter(Boolean)
    ),
  ]

  let deletedPrevious: string | null = null
  if (deletePrevious) {
    const prev = await getMailbox(auth.db, deletePrevious)
    if (prev) {
      await deleteMailbox(auth.db, deletePrevious)
      deletedPrevious = deletePrevious
    }
  }

  let address = addressInput.toLowerCase()

  if (!address) {
    const domain = (domainInput || defaultDomain || envMailDomain || "").toLowerCase()
    if (!domain) {
      return apiV1Json({ success: false, error: "Missing required parameter: domain" }, 400)
    }
    if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
      return apiV1Json({ success: false, error: "Invalid domain" }, 400)
    }

    if (localPartInput && !wantRandom) {
      address = `${localPartInput.toLowerCase()}@${domain}`
    } else {
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = buildRandomAddress(domain)
        const existing = await getMailbox(auth.db, candidate)
        if (!existing) {
          address = candidate
          break
        }
      }
      if (!address) {
        address = `tmp${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}@${domain}`
      }
    }
  }

  const parts = address.split("@")
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return apiV1Json({ success: false, error: "Invalid email address format" }, 400)
  }

  const addressDomain = parts[1]
  if (allowedDomains.length > 0 && !allowedDomains.includes(addressDomain)) {
    return apiV1Json({ success: false, error: "Invalid domain" }, 400)
  }

  try {
    const isRandom = wantRandom || (!localPartInput && !addressInput)
    const { mailbox, password } = await createMailbox(auth.db, address, {
      note: note || (isRandom ? "api-random" : undefined),
    })
    const finalPassword = customPassword
      ? await setMailboxPassword(auth.db, mailbox.address, customPassword)
      : password

    return apiV1Json({
      success: true,
      data: {
        address: mailbox.address,
        password: finalPassword,
        deleted_previous: deletedPrevious,
      },
    })
  } catch (error: any) {
    const message = error?.message || "Internal server error"
    const lowered = String(message).toLowerCase()
    if (lowered.includes("unique") || lowered.includes("constraint")) {
      return apiV1Json({ success: false, error: "Mailbox already exists" }, 409)
    }
    console.error("Create mailbox API error:", error)
    return apiV1Json({ success: false, error: "Internal server error" }, 500)
  }
}
