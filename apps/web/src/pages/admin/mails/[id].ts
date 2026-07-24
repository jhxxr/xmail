import type { APIRoute } from "astro"
import { createDB, getEmail, deleteEmail } from "database"
import {
  authenticateCfAdmin,
  jsonResponse,
  toCfMailRow,
} from "../../../lib/cf-compat"

export const DELETE: APIRoute = async (context) => {
  const auth = await authenticateCfAdmin(context)
  if (!auth.ok) return auth.response

  const id = context.params.id
  if (!id) return jsonResponse({ success: false })

  const db = createDB(context.locals.runtime.env.DB)
  const email = await getEmail(db, id)
  if (!email) return jsonResponse({ success: false })

  await deleteEmail(db, id)
  return jsonResponse({ success: true })
}

export const GET: APIRoute = async (context) => {
  const auth = await authenticateCfAdmin(context)
  if (!auth.ok) return auth.response
  const id = context.params.id
  if (!id) return jsonResponse(null)
  const db = createDB(context.locals.runtime.env.DB)
  const email = await getEmail(db, id)
  if (!email) return jsonResponse(null)
  return jsonResponse(toCfMailRow(email, { includeBody: true }))
}
