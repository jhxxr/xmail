import type { APIRoute } from "astro"
import {
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
import { requireApiV1Key, apiV1Json, apiV1OptionsRoute } from "../../../../lib/api-v1"
import { buildRandomAddress } from "../../../../lib/random-mailbox"
import { extractVerificationCode, extractPreview } from "../../../../lib/utils"
import { sanitizeEmailHtml } from "../../../../lib/email-html"

export const OPTIONS = apiV1OptionsRoute

export const GET: APIRoute = async (context) => {
  const auth = await requireApiV1Key(context)
  if (!auth) return apiV1Json({ success: false, error: "Unauthorized" }, 401)

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
    return apiV1Json({
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
    if (!mailbox) return apiV1Json({ success: false, error: "Missing mailbox" }, 400)
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "30", 10), 1), 100)
    const emails = await getEmailsByMailbox(auth.db, mailbox, { limit })
    return apiV1Json({
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
    if (!id) return apiV1Json({ success: false, error: "Missing id" }, 400)
    const email = await getEmail(auth.db, id)
    if (!email) return apiV1Json({ success: false, error: "Not found" }, 404)
    if (!email.isRead) {
      await markEmailAsRead(auth.db, id)
    }
    const code =
      extractVerificationCode(email.text, email.html) ||
      extractVerificationCode(email.subject, null)
    return apiV1Json({
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

  return apiV1Json({ success: false, error: "Unknown action" }, 400)
}

type CreateBody = {
  action?: string
  domain?: string
  previousAddress?: string | null
  nextMode?: "auto_delete" | "keep_with_services" | "none"
  serviceTemplateIds?: string[]
  customServices?: Array<{ name?: string; loginUrl?: string; note?: string; saveAsTemplate?: boolean }>
  note?: string
  name?: string
  loginUrl?: string
  address?: string
}

export const POST: APIRoute = async (context) => {
  const auth = await requireApiV1Key(context)
  if (!auth) return apiV1Json({ success: false, error: "Unauthorized" }, 401)

  let body: CreateBody = {}
  try {
    body = (await context.request.json()) as CreateBody
  } catch {
    return apiV1Json({ success: false, error: "Invalid JSON" }, 400)
  }

  const action = body.action || "create"

  if (action === "create_template") {
    const name = body.name?.toString()?.trim()
    const loginUrl = body.loginUrl?.toString()?.trim()
    const note = body.note?.toString()?.trim()
    if (!name || !loginUrl) {
      return apiV1Json({ success: false, error: "name and loginUrl required" }, 400)
    }
    const template = await createServiceTemplate(auth.db, {
      name,
      loginUrl,
      note: note || undefined,
    })
    return apiV1Json({
      success: true,
      data: {
        id: template.id,
        name: template.name,
        loginUrl: template.loginUrl,
        note: template.note,
      },
    })
  }

  if (action === "delete") {
    const address = (body.previousAddress || body.address || "").toString().toLowerCase().trim()
    if (!address) return apiV1Json({ success: false, error: "Missing address" }, 400)
    const existing = await getMailbox(auth.db, address)
    if (!existing) return apiV1Json({ success: false, error: "Not found" }, 404)
    await deleteMailbox(auth.db, address)
    await createLog(auth.db, {
      action: "temp_workbench_delete",
      target: address,
      details: { via: "api_key", keyId: auth.apiKey.id },
      ip: context.request.headers.get("cf-connecting-ip") || undefined,
    })
    return apiV1Json({ success: true, data: { deleted: address } })
  }

  if (action !== "create") {
    return apiV1Json({ success: false, error: "Unknown action" }, 400)
  }

  const envMailDomain = (context.locals.runtime.env.MAIL_DOMAIN || "").trim().toLowerCase()
  const [defaultDomain, allowedFromDb] = await Promise.all([
    getMailDomain(auth.db),
    getMailDomains(auth.db),
  ])
  const allowedDomains = [...allowedFromDb, defaultDomain, envMailDomain]
    .map((d) => d.toLowerCase().trim())
    .filter(Boolean)
  const uniqueAllowed = [...new Set(allowedDomains)]
  const domain = (body.domain || defaultDomain || envMailDomain || "").toLowerCase().trim()
  if (!domain) return apiV1Json({ success: false, error: "Missing domain" }, 400)
  if (uniqueAllowed.length > 0 && !uniqueAllowed.includes(domain)) {
    return apiV1Json({ success: false, error: "Invalid domain" }, 400)
  }

  const nextMode = body.nextMode || "none"
  const previousAddress = (body.previousAddress || "").toLowerCase().trim() || null

  let deletedPrevious: string | null = null
  if (nextMode === "auto_delete" && previousAddress) {
    const prev = await getMailbox(auth.db, previousAddress)
    if (prev) {
      await deleteMailbox(auth.db, previousAddress)
      deletedPrevious = previousAddress
    }
  }

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
      note: body.note || "temp-workbench-extension",
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
      action: "temp_workbench_create",
      target: mailbox.address,
      details: {
        nextMode,
        deletedPrevious,
        boundServices: boundServices.length,
        via: "api_key",
        keyId: auth.apiKey.id,
      },
      ip: context.request.headers.get("cf-connecting-ip") || undefined,
    })

    const plain = password || (await getMailboxPlainPassword(auth.db, mailbox.address)) || ""

    return apiV1Json({
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
      return apiV1Json({ success: false, error: "Mailbox already exists, retry" }, 409)
    }
    console.error("temp workbench API create error:", error)
    return apiV1Json({ success: false, error: "Internal server error" }, 500)
  }
}
