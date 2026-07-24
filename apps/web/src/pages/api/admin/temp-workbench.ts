import type { APIRoute } from "astro"
import {
  createDB,
  getAdminById,
  getMailDomain,
  getMailDomains,
  getMailbox,
  createMailbox,
  deleteMailbox,
  getMailboxPlainPassword,
  getEmailsByMailbox,
  getEmail,
  listServiceTemplates,
  createServiceTemplate,
  addServiceToMailbox,
  addCustomServiceToMailbox,
  createLog,
  markEmailAsRead,
} from "database"
import { verifyToken } from "../../../lib/auth"
import { buildRandomAddress } from "../../../lib/random-mailbox"
import { extractVerificationCode, extractPreview } from "../../../lib/utils"
import { sanitizeEmailHtml } from "../../../lib/email-html"

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function requireAdmin(context: Parameters<APIRoute>[0]) {
  const jwtSecret = context.locals.runtime.env.JWT_SECRET
  const token = context.cookies.get("admin_token")?.value
  if (!token) return null
  const payload = await verifyToken(token, jwtSecret)
  if (!payload || payload.type !== "admin") return null
  const db = createDB(context.locals.runtime.env.DB)
  const admin = await getAdminById(db, payload.id)
  if (!admin) return null
  return { db, admin }
}

export const GET: APIRoute = async (context) => {
  const auth = await requireAdmin(context)
  if (!auth) return json({ success: false, error: "Unauthorized" }, 401)

  const url = new URL(context.request.url)
  const action = url.searchParams.get("action") || "bootstrap"

  if (action === "bootstrap") {
    const envMailDomain = (context.locals.runtime.env.MAIL_DOMAIN || "").trim()
    let defaultDomain = await getMailDomain(auth.db)
    let domains = await getMailDomains(auth.db)
    if (!domains.length && defaultDomain) domains = [defaultDomain]
    if ((!domains.length || domains.every((d) => d === "example.com")) && envMailDomain) {
      domains = [envMailDomain, ...domains.filter((d) => d !== "example.com" && d !== envMailDomain)]
      if (!defaultDomain || defaultDomain === "example.com") defaultDomain = envMailDomain
    }
    const templates = await listServiceTemplates(auth.db)
    return json({
      success: true,
      data: {
        defaultDomain,
        domains,
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          loginUrl: t.loginUrl,
          note: t.note,
        })),
      },
    })
  }

  if (action === "emails") {
    const mailbox = (url.searchParams.get("mailbox") || "").toLowerCase().trim()
    if (!mailbox) return json({ success: false, error: "Missing mailbox" }, 400)
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "30", 10), 1), 100)
    const emails = await getEmailsByMailbox(auth.db, mailbox, { limit })
    return json({
      success: true,
      data: {
        mailbox,
        emails: emails.map((email) => {
          const code =
            extractVerificationCode(email.text, email.html) ||
            extractVerificationCode(email.subject, null)
          return {
            id: email.id,
            subject: email.subject,
            fromAddress: email.fromAddress,
            fromName: email.fromName,
            createdAt: email.createdAt,
            isRead: email.isRead,
            isStarred: email.isStarred,
            preview: extractPreview(email.text, email.html),
            code,
          }
        }),
      },
    })
  }

  if (action === "email") {
    const id = url.searchParams.get("id") || ""
    if (!id) return json({ success: false, error: "Missing id" }, 400)
    const email = await getEmail(auth.db, id)
    if (!email) return json({ success: false, error: "Not found" }, 404)
    if (!email.isRead) {
      await markEmailAsRead(auth.db, id)
    }
    const code =
      extractVerificationCode(email.text, email.html) ||
      extractVerificationCode(email.subject, null)
    return json({
      success: true,
      data: {
        id: email.id,
        mailboxAddress: email.mailboxAddress,
        subject: email.subject,
        fromAddress: email.fromAddress,
        fromName: email.fromName,
        createdAt: email.createdAt,
        text: email.text,
        html: email.html ? sanitizeEmailHtml(email.html) : null,
        code,
      },
    })
  }

  return json({ success: false, error: "Unknown action" }, 400)
}

type CreateBody = {
  action?: string
  domain?: string
  previousAddress?: string | null
  nextMode?: "auto_delete" | "keep_with_services" | "none"
  serviceTemplateIds?: string[]
  customServices?: Array<{ name?: string; loginUrl?: string; note?: string; saveAsTemplate?: boolean }>
  note?: string
}

export const POST: APIRoute = async (context) => {
  const auth = await requireAdmin(context)
  if (!auth) return json({ success: false, error: "Unauthorized" }, 401)

  let body: CreateBody = {}
  try {
    body = (await context.request.json()) as CreateBody
  } catch {
    return json({ success: false, error: "Invalid JSON" }, 400)
  }

  const action = body.action || "create"

  if (action === "create_template") {
    const name = (body as any).name?.toString()?.trim()
    const loginUrl = (body as any).loginUrl?.toString()?.trim()
    const note = (body as any).note?.toString()?.trim()
    if (!name || !loginUrl) {
      return json({ success: false, error: "name and loginUrl required" }, 400)
    }
    const template = await createServiceTemplate(auth.db, {
      name,
      loginUrl,
      note: note || undefined,
    })
    return json({
      success: true,
      data: {
        id: template.id,
        name: template.name,
        loginUrl: template.loginUrl,
        note: template.note,
      },
    })
  }

  if (action !== "create") {
    return json({ success: false, error: "Unknown action" }, 400)
  }

  const envMailDomain = (context.locals.runtime.env.MAIL_DOMAIN || "").trim().toLowerCase()
  const [defaultDomain, allowedFromDb] = await Promise.all([
    getMailDomain(auth.db),
    getMailDomains(auth.db),
  ])
  const allowedDomains = [
    ...allowedFromDb,
    defaultDomain,
    envMailDomain,
  ]
    .map((d) => d.toLowerCase().trim())
    .filter(Boolean)
  const uniqueAllowed = [...new Set(allowedDomains)]
  const domain = (body.domain || defaultDomain || envMailDomain || "").toLowerCase().trim()
  if (!domain) return json({ success: false, error: "Missing domain" }, 400)
  if (uniqueAllowed.length > 0 && !uniqueAllowed.includes(domain)) {
    return json({ success: false, error: "Invalid domain" }, 400)
  }

  const nextMode = body.nextMode || "none"
  const previousAddress = (body.previousAddress || "").toLowerCase().trim() || null

  // Mutually exclusive post-use modes applied when creating the next mailbox
  let deletedPrevious: string | null = null
  if (nextMode === "auto_delete" && previousAddress) {
    const prev = await getMailbox(auth.db, previousAddress)
    if (prev) {
      await deleteMailbox(auth.db, previousAddress, auth.admin.id)
      deletedPrevious = previousAddress
    }
  }

  // Create unique random address
  let address = ""
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

  try {
    const { mailbox, password } = await createMailbox(auth.db, address, {
      note: body.note || "temp-workbench",
      createdBy: auth.admin.id,
    })

    const boundServices: Array<{ name: string; loginUrl: string; kind: string }> = []

    if (nextMode === "keep_with_services") {
      const templateIds = Array.isArray(body.serviceTemplateIds)
        ? body.serviceTemplateIds.map(String).filter(Boolean)
        : []
      for (const templateId of templateIds) {
        try {
          await addServiceToMailbox(auth.db, mailbox.address, templateId)
          const templates = await listServiceTemplates(auth.db)
          const t = templates.find((x) => x.id === templateId)
          if (t) boundServices.push({ name: t.name, loginUrl: t.loginUrl, kind: "template" })
        } catch {
          // skip invalid template
        }
      }

      const customs = Array.isArray(body.customServices) ? body.customServices : []
      for (const custom of customs) {
        const name = (custom.name || "").trim()
        const loginUrl = (custom.loginUrl || "").trim()
        if (!name || !loginUrl) continue
        if (custom.saveAsTemplate) {
          const template = await createServiceTemplate(auth.db, {
            name,
            loginUrl,
            note: custom.note || undefined,
          })
          await addServiceToMailbox(auth.db, mailbox.address, template.id)
          boundServices.push({ name: template.name, loginUrl: template.loginUrl, kind: "template" })
        } else {
          await addCustomServiceToMailbox(auth.db, mailbox.address, {
            name,
            loginUrl,
            note: custom.note || undefined,
          })
          boundServices.push({ name, loginUrl, kind: "custom" })
        }
      }
    }

    await createLog(auth.db, {
      adminId: auth.admin.id,
      action: "temp_workbench_create",
      target: mailbox.address,
      details: {
        nextMode,
        deletedPrevious,
        boundServices: boundServices.length,
      },
      ip: context.request.headers.get("cf-connecting-ip") || undefined,
    })

    // Prefer returned password; also verify plain password readable
    const plain = password || (await getMailboxPlainPassword(auth.db, mailbox.address)) || ""

    return json({
      success: true,
      data: {
        address: mailbox.address,
        password: plain,
        deletedPrevious,
        boundServices,
        nextMode,
      },
    })
  } catch (error: any) {
    const message = error?.message || "Create failed"
    const lowered = String(message).toLowerCase()
    if (lowered.includes("unique") || lowered.includes("constraint")) {
      return json({ success: false, error: "Mailbox already exists, retry" }, 409)
    }
    console.error("temp workbench create error:", error)
    return json({ success: false, error: "Internal server error" }, 500)
  }
}
