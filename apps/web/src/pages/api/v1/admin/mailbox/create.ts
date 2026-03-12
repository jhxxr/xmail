import type { APIRoute } from "astro"
import { createDB, createMailbox, getMailDomain, getMailDomains, setMailboxPassword } from "database"
import { authenticateApiKey, unauthorizedResponse } from "../../../../../lib/api-auth"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export const POST: APIRoute = async (context) => {
  if (!await authenticateApiKey(context)) {
    return unauthorizedResponse()
  }

  const db = createDB(context.locals.runtime.env.DB)

  let body: any
  try {
    body = await context.request.json()
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400)
  }

  const addressInput = normalizeString(body?.address)
  const localPartInput = normalizeString(body?.local_part || body?.localPart)
  const domainInput = normalizeString(body?.domain)
  const note = normalizeString(body?.note) || undefined
  const customPassword = normalizeString(body?.password)

  const [defaultDomain, allowedDomains] = await Promise.all([
    getMailDomain(db),
    getMailDomains(db)
  ])

  let address = addressInput.toLowerCase()

  if (!address) {
    if (!localPartInput) {
      return jsonResponse({ success: false, error: "Missing required parameter: address or local_part" }, 400)
    }

    const localPart = localPartInput.toLowerCase()
    const domain = (domainInput || defaultDomain || "").toLowerCase()

    if (!domain) {
      return jsonResponse({ success: false, error: "Missing required parameter: domain" }, 400)
    }

    if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
      return jsonResponse({ success: false, error: "Invalid domain" }, 400)
    }

    address = `${localPart}@${domain}`
  }

  const parts = address.split("@")
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return jsonResponse({ success: false, error: "Invalid email address format" }, 400)
  }

  const addressDomain = parts[1]
  if (allowedDomains.length > 0 && !allowedDomains.includes(addressDomain)) {
    return jsonResponse({ success: false, error: "Invalid domain" }, 400)
  }

  try {
    const { mailbox, password } = await createMailbox(db, address, { note })
    const finalPassword = customPassword
      ? await setMailboxPassword(db, mailbox.address, customPassword)
      : password

    return jsonResponse({
      success: true,
      data: {
        address: mailbox.address,
        password: finalPassword
      }
    })
  } catch (error: any) {
    const message = error?.message || "Internal server error"
    const lowered = String(message).toLowerCase()
    if (lowered.includes("unique") || lowered.includes("constraint")) {
      return jsonResponse({ success: false, error: "Mailbox already exists" }, 409)
    }
    console.error("Create mailbox API error:", error)
    return jsonResponse({ success: false, error: "Internal server error" }, 500)
  }
}
