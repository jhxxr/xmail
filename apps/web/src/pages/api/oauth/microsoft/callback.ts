import type { APIRoute } from "astro"
import {
  createDB,
  createOauthMailAccount,
  getAdminById,
  getOauthMailAccountByEmail,
  updateOauthMailAccount,
  createLog,
} from "database"
import { verifyToken } from "../../../../lib/auth"
import { encryptSecret, isEncryptionKeyConfigured } from "../../../../lib/crypto"
import { exchangeCodeForTokens } from "../../../../lib/ms-oauth"
import { invalidateAccessTokenCache } from "../../../../lib/ms-graph"

export const GET: APIRoute = async ({ locals, cookies, redirect, url }) => {
  const jwtSecret = locals.runtime.env.JWT_SECRET
  const adminToken = cookies.get("admin_token")?.value
  if (!adminToken) return redirect("/admin/login")
  const payload = await verifyToken(adminToken, jwtSecret)
  if (!payload || payload.type !== "admin") return redirect("/admin/login")

  const db = createDB(locals.runtime.env.DB)
  const admin = await getAdminById(db, payload.id)
  if (!admin) return redirect("/admin/login")

  const errorParam = url.searchParams.get("error")
  if (errorParam) {
    const desc = url.searchParams.get("error_description") || errorParam
    return redirect("/admin/oauth-accounts?error=" + encodeURIComponent(desc.slice(0, 200)))
  }

  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const savedState = cookies.get("ms_oauth_state")?.value
  const codeVerifier = cookies.get("ms_oauth_verifier")?.value

  cookies.delete("ms_oauth_state", { path: "/" })
  cookies.delete("ms_oauth_verifier", { path: "/" })

  if (!code || !state || !savedState || state !== savedState || !codeVerifier) {
    return redirect(
      "/admin/oauth-accounts?error=" + encodeURIComponent("OAuth state 校验失败，请重试")
    )
  }

  const clientId = locals.runtime.env.MS_CLIENT_ID
  const encryptionKey = locals.runtime.env.ENCRYPTION_KEY
  if (!clientId) {
    return redirect("/admin/oauth-accounts?error=" + encodeURIComponent("未配置 MS_CLIENT_ID"))
  }
  if (!isEncryptionKeyConfigured(encryptionKey)) {
    return redirect(
      "/admin/oauth-accounts?error=" + encodeURIComponent("未配置 ENCRYPTION_KEY")
    )
  }

  const redirectUri =
    locals.runtime.env.MS_REDIRECT_URI ||
    `${url.origin}/api/oauth/microsoft/callback`

  const tokenResult = await exchangeCodeForTokens({
    clientId,
    code,
    redirectUri,
    codeVerifier,
  })

  if (!tokenResult.success) {
    return redirect(
      "/admin/oauth-accounts?error=" + encodeURIComponent(tokenResult.error)
    )
  }

  const email = tokenResult.email
  if (!email) {
    return redirect(
      "/admin/oauth-accounts?error=" +
        encodeURIComponent("已获取 token 但无法读取邮箱地址，请改用批量导入")
    )
  }

  const encryptedRefreshToken = await encryptSecret(tokenResult.refreshToken, encryptionKey!)
  const existing = await getOauthMailAccountByEmail(db, email)

  if (existing) {
    await updateOauthMailAccount(db, existing.id, {
      clientId,
      encryptedRefreshToken,
      refreshTokenUpdatedAt: Math.floor(Date.now() / 1000),
      status: "active",
      lastError: null,
    })
    invalidateAccessTokenCache(existing.id)
    await createLog(db, {
      adminId: admin.id,
      action: "oauth_reauthorize",
      target: email,
    })
    return redirect(
      "/admin/oauth-accounts?message=" + encodeURIComponent(`已更新授权: ${email}（未测活）`)
    )
  }

  const created = await createOauthMailAccount(db, {
    email,
    clientId,
    encryptedRefreshToken,
    createdBy: admin.id,
    note: "via Microsoft OAuth",
  })
  invalidateAccessTokenCache(created.id)

  await createLog(db, {
    adminId: admin.id,
    action: "oauth_authorize_import",
    target: email,
  })

  return redirect(
    "/admin/oauth-accounts?message=" + encodeURIComponent(`导入成功: ${email}（未测活）`)
  )
}
