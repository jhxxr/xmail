import type { APIRoute } from "astro"
import { createDB, getAdminById } from "database"
import { verifyToken } from "../../../../lib/auth"
import {
  buildAuthorizeUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
} from "../../../../lib/ms-oauth"

export const GET: APIRoute = async ({ locals, cookies, redirect, url }) => {
  const jwtSecret = locals.runtime.env.JWT_SECRET
  const token = cookies.get("admin_token")?.value
  if (!token) return redirect("/admin/login")
  const payload = await verifyToken(token, jwtSecret)
  if (!payload || payload.type !== "admin") return redirect("/admin/login")

  const db = createDB(locals.runtime.env.DB)
  const admin = await getAdminById(db, payload.id)
  if (!admin) return redirect("/admin/login")

  const clientId = locals.runtime.env.MS_CLIENT_ID
  if (!clientId) {
    return redirect("/admin/oauth-accounts?error=" + encodeURIComponent("未配置 MS_CLIENT_ID"))
  }

  const redirectUri =
    locals.runtime.env.MS_REDIRECT_URI ||
    `${url.origin}/api/oauth/microsoft/callback`

  const state = generateOAuthState()
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  const cookieOpts = {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 15,
  }
  cookies.set("ms_oauth_state", state, cookieOpts)
  cookies.set("ms_oauth_verifier", codeVerifier, cookieOpts)

  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge,
  })

  return redirect(authorizeUrl)
}
