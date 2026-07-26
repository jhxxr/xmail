import type { APIRoute } from "astro"
import { listServiceTemplates, createServiceTemplate, createLog } from "database"
import { requireApiV1Key, apiV1Json, apiV1OptionsRoute } from "../../../../../lib/api-v1"

export const OPTIONS = apiV1OptionsRoute

/**
 * GET /api/v1/admin/service-templates
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireApiV1Key(context)
  if (!auth) return apiV1Json({ success: false, error: "Unauthorized" }, 401)

  const templates = await listServiceTemplates(auth.db)
  return apiV1Json({
    success: true,
    data: {
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        loginUrl: t.loginUrl,
        note: t.note,
      })),
    },
  })
}

/**
 * POST /api/v1/admin/service-templates
 * Body: { name, loginUrl, note? }
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireApiV1Key(context)
  if (!auth) return apiV1Json({ success: false, error: "Unauthorized" }, 401)

  let body: any
  try {
    body = await context.request.json()
  } catch {
    return apiV1Json({ success: false, error: "Invalid JSON" }, 400)
  }

  const name = String(body?.name || "").trim()
  const loginUrl = String(body?.loginUrl || body?.login_url || "").trim()
  const note = String(body?.note || "").trim() || undefined
  if (!name || !loginUrl) {
    return apiV1Json({ success: false, error: "name and loginUrl required" }, 400)
  }

  const template = await createServiceTemplate(auth.db, { name, loginUrl, note })
  await createLog(auth.db, {
    action: "api_service_template_create",
    target: template.id,
    details: { name, via: "api_key", keyId: auth.apiKey.id },
    ip: context.request.headers.get("cf-connecting-ip") || undefined,
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
