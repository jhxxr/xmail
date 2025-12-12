import type { APIContext } from "astro"
import { createDB, verifyApiKey } from "database"

export async function authenticateApiKey(context: APIContext): Promise<boolean> {
  const authHeader = context.request.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return false
  }

  const token = authHeader.substring(7)
  const db = createDB(context.locals.runtime.env.DB)
  const apiKey = await verifyApiKey(db, token)

  return apiKey !== null
}

export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({
    success: false,
    error: "Unauthorized"
  }), {
    status: 401,
    headers: { "Content-Type": "application/json" }
  })
}
