import type { APIRoute } from "astro"
import { getMailDomain, getMailDomains } from "database"
import { requireApiV1Key, apiV1Json, apiV1OptionsRoute } from "../../../../../lib/api-v1"

export const OPTIONS = apiV1OptionsRoute

/**
 * GET /api/v1/admin/mailbox/domains
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireApiV1Key(context)
  if (!auth) return apiV1Json({ success: false, error: "Unauthorized" }, 401)

  const envMailDomain = (context.locals.runtime.env.MAIL_DOMAIN || "").trim()
  let defaultDomain = await getMailDomain(auth.db)
  let domains = await getMailDomains(auth.db)
  if (!domains.length && defaultDomain) domains = [defaultDomain]
  if ((!domains.length || domains.every((d) => d === "example.com")) && envMailDomain) {
    domains = [envMailDomain, ...domains.filter((d) => d !== "example.com" && d !== envMailDomain)]
    if (!defaultDomain || defaultDomain === "example.com") defaultDomain = envMailDomain
  }

  return apiV1Json({
    success: true,
    data: {
      default_domain: defaultDomain,
      domains,
    },
  })
}
