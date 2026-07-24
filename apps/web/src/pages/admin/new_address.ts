import type { APIRoute } from "astro"
import {
  createDB,
  createMailbox,
  getMailDomain,
  getMailDomains,
  getMailbox,
  createLog,
} from "database"
import { generateAddressToken } from "../../lib/auth"
import { authenticateCfAdmin, jsonResponse, textResponse } from "../../lib/cf-compat"
import { buildRandomAddress, generateEmployeeLocalPart } from "../../lib/random-mailbox"

/**
 * CF temp-email compatible: POST /admin/new_address
 * Also mounted conceptually as POST /api/new_address (same handler file via route)
 *
 * Headers: x-admin-auth | Authorization: Bearer sk_live_... | admin cookie
 * Body: { name?, domain?, enablePrefix? }
 * Response: { jwt, address, address_id, password }
 */
export const POST: APIRoute = async (context) => {
  const auth = await authenticateCfAdmin(context)
  if (!auth.ok) return auth.response

  const env = context.locals.runtime.env
  const db = createDB(env.DB)

  let body: {
    name?: string
    domain?: string
    enablePrefix?: boolean
    enableRandomSubdomain?: boolean
  } = {}
  try {
    body = (await context.request.json()) as typeof body
  } catch {
    // empty body allowed for fully random
  }

  const [defaultDomain, allowedDomains] = await Promise.all([
    getMailDomain(db),
    getMailDomains(db),
  ])
  const envDomain = (env.MAIL_DOMAIN || "").trim().toLowerCase()
  const domains = [
    ...new Set(
      [...allowedDomains, defaultDomain, envDomain]
        .map((d) => d.toLowerCase().trim())
        .filter(Boolean)
    ),
  ]

  let domain = (body.domain || defaultDomain || envDomain || "").toLowerCase().trim()
  if (!domain) {
    return textResponse("Missing domain", 400)
  }
  if (domains.length > 0 && !domains.includes(domain)) {
    return textResponse(`Invalid domain: ${domain}`, 400)
  }

  // Random name if not provided
  let local = (body.name || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "")
  if (!local) {
    local = generateEmployeeLocalPart() || `u${Date.now().toString(36)}`
  }
  if (local.length < 1 || local.length > 64) {
    return textResponse("Invalid name length", 400)
  }

  let address = `${local}@${domain}`
  // Resolve conflicts with random suffix
  for (let i = 0; i < 8; i++) {
    const existing = await getMailbox(db, address)
    if (!existing) break
    if (body.name) {
      return textResponse(`Address already exists: ${address}`, 400)
    }
    address = buildRandomAddress(domain)
  }

  try {
    const { mailbox, password } = await createMailbox(db, address, {
      note: "cf-compat",
      createdBy: undefined,
    })

    const jwt = await generateAddressToken(mailbox.address, env.JWT_SECRET)

    try {
      await createLog(db, {
        action: "cf_new_address",
        target: mailbox.address,
        details: { via: auth.via },
        ip: context.request.headers.get("cf-connecting-ip") || undefined,
      })
    } catch {
      // non-fatal
    }

    // CF temp-email shape (keep extra fields for XMail clients)
    return jsonResponse({
      jwt,
      address: mailbox.address,
      address_id: mailbox.address,
      password,
      // XMail aliases
      success: true,
      data: {
        address: mailbox.address,
        password,
        jwt,
      },
    })
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("constraint")) {
      return textResponse("Address already exists", 400)
    }
    console.error("cf new_address error", e)
    return textResponse("Failed to create address", 500)
  }
}
