/**
 * Microsoft OAuth authorize + PKCE helpers (Graph-only scopes).
 */

export const MS_AUTHORIZE_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
export const MS_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token"
export const MS_GRAPH_SCOPES = "offline_access https://graph.microsoft.com/Mail.Read"

function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return toBase64Url(bytes)
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  )
  return toBase64Url(new Uint8Array(digest))
}

export function generateOAuthState(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(16)))
}

export function buildAuthorizeUrl(params: {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
}): string {
  const q = new URLSearchParams({
    client_id: params.clientId,
    response_type: "code",
    redirect_uri: params.redirectUri,
    scope: MS_GRAPH_SCOPES,
    response_mode: "query",
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  })
  return `${MS_AUTHORIZE_URL}?${q}`
}

export type CodeExchangeResult =
  | {
      success: true
      accessToken: string
      refreshToken: string
      email?: string
    }
  | { success: false; error: string }

export async function exchangeCodeForTokens(params: {
  clientId: string
  code: string
  redirectUri: string
  codeVerifier: string
}): Promise<CodeExchangeResult> {
  try {
    const body = new URLSearchParams({
      client_id: params.clientId,
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
      scope: MS_GRAPH_SCOPES,
    })

    const res = await fetch(MS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const desc = String(data.error_description || data.error || res.statusText)
      return { success: false, error: desc.slice(0, 500) }
    }

    const accessToken = data.access_token
    const refreshToken = data.refresh_token
    if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
      return { success: false, error: "Token response missing access_token or refresh_token" }
    }

    let email: string | undefined
    try {
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (meRes.ok) {
        const me = (await meRes.json()) as { mail?: string; userPrincipalName?: string }
        email = (me.mail || me.userPrincipalName || "").toLowerCase() || undefined
      }
    } catch {
      // email optional at exchange; admin can fix later
    }

    return { success: true, accessToken, refreshToken, email }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
