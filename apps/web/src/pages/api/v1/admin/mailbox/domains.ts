import type { APIRoute } from "astro"
import { createDB, getMailDomain, getMailDomains } from "database"
import { authenticateApiKey, unauthorizedResponse } from "../../../../../lib/api-auth"

export const GET: APIRoute = async (context) => {
  if (!await authenticateApiKey(context)) {
    return unauthorizedResponse()
  }

  const db = createDB(context.locals.runtime.env.DB)
  const [defaultDomain, domains] = await Promise.all([
    getMailDomain(db),
    getMailDomains(db)
  ])

  return new Response(JSON.stringify({
    success: true,
    data: {
      default_domain: defaultDomain,
      domains
    }
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })
}
