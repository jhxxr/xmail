import type { APIContext, APIRoute } from "astro"
import { createDB, verifyApiKey, type DB } from "database"

export const API_V1_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
} as const

export function apiV1Json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...API_V1_CORS_HEADERS,
    },
  })
}

export function apiV1Options(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...API_V1_CORS_HEADERS,
      "Access-Control-Max-Age": "86400",
    },
  })
}

export type ApiV1Auth = {
  db: DB
  apiKey: NonNullable<Awaited<ReturnType<typeof verifyApiKey>>>
}

export async function requireApiV1Key(context: APIContext): Promise<ApiV1Auth | null> {
  const authHeader = context.request.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) return null
  const token = authHeader.substring(7)
  const db = createDB(context.locals.runtime.env.DB)
  const apiKey = await verifyApiKey(db, token)
  if (!apiKey) return null
  return { db, apiKey }
}

/** Shared OPTIONS handler for v1 admin routes (CORS preflight for browser extensions). */
export const apiV1OptionsRoute: APIRoute = async () => apiV1Options()
