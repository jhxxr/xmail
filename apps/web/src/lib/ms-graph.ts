/**
 * Microsoft Graph / Outlook OAuth helpers (HTTP only — CF Workers compatible).
 *
 * Token refresh strategy aligned with outlookEmail-main:
 *   1) Graph (common) with scope retries including empty "original" scope
 *   2) Graph (consumers)
 *   3) IMAP (consumers) — card-key ecosystem
 *   4) Legacy login.live.com
 *
 * Probe success (outlookEmail test_refresh_token) = RT exchanges for an AT.
 * This product fetches mail via Graph only; IMAP-only tokens surface a clear warning.
 */

import type { DB, OauthMailAccount } from "database"
import { updateOauthMailAccount } from "database"
import { decryptSecret, encryptSecret } from "./crypto"

export const GRAPH_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token"
export const CONSUMERS_TOKEN_URL =
  "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
export const LIVE_TOKEN_URL = "https://login.live.com/oauth20_token.srf"
export const GRAPH_SCOPE = "https://graph.microsoft.com/Mail.Read offline_access"
export const IMAP_SCOPE = "https://outlook.office.com/IMAP.AccessAsUser.All offline_access"
export const GRAPH_BASE = "https://graph.microsoft.com/v1.0"

const LAST_SYNC_WRITE_INTERVAL_SEC = 5 * 60
const ACCESS_TOKEN_TTL_MS = 50 * 60 * 1000
const ACCESS_TOKEN_CACHE_MAX = 500
type CachedAccessToken = { accessToken: string; expiresAt: number }
const accessTokenCache = new Map<string, CachedAccessToken>()

function getCachedAccessToken(accountId: string): string | null {
  const entry = accessTokenCache.get(accountId)
  if (!entry) return null
  if (Date.now() >= entry.expiresAt) {
    accessTokenCache.delete(accountId)
    return null
  }
  return entry.accessToken
}

function setCachedAccessToken(accountId: string, accessToken: string): void {
  if (accessTokenCache.size >= ACCESS_TOKEN_CACHE_MAX) {
    const first = accessTokenCache.keys().next().value
    if (first) accessTokenCache.delete(first)
  }
  accessTokenCache.set(accountId, {
    accessToken,
    expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
  })
}

export function invalidateAccessTokenCache(accountId: string): void {
  accessTokenCache.delete(accountId)
}

function isAuthFailureMessage(message: string): boolean {
  return /401|unauthorized|invalidauthenticationtoken|invalid_grant|compacttoken|aadsts50173|aadsts70008/i.test(
    message
  )
}

function sanitizeError(message: string): string {
  return message
    .replace(/refresh_token[=:]\s*\S+/gi, "refresh_token=***")
    .replace(/access_token[=:]\s*\S+/gi, "access_token=***")
    .slice(0, 500)
}

export type GraphMessageSummary = {
  id: string
  subject: string | null
  fromAddress: string
  fromName: string | null
  receivedAt: string | null
  bodyPreview: string | null
  isRead: boolean
  hasAttachments: boolean
  folder?: string
}

export type GraphMessageDetail = GraphMessageSummary & {
  text: string | null
  html: string | null
  toAddresses: string[]
  ccAddresses: string[]
}

export type GraphAttachmentMeta = {
  id: string
  name: string
  contentType: string
  size: number
  isInline: boolean
  contentId: string | null
}

export type TokenRefreshResult =
  | {
      success: true
      accessToken: string
      refreshToken?: string
      scopeUsed?: string
      tokenKind: "graph" | "imap" | "unknown"
      attemptLabel?: string
    }
  | { success: false; error: string; authError?: boolean }

type TokenAttempt = {
  url: string
  scope: string
  label: string
  kind: "graph" | "imap" | "unknown"
}

/**
 * Align with outlookEmail-main:
 * - Graph: Mail.Read offline_access → .default → empty original scope
 * - IMAP: consumers + IMAP.AccessAsUser.All offline_access
 * - live.com fallback for old MSA tokens
 */
const TOKEN_ATTEMPTS: TokenAttempt[] = [
  {
    url: GRAPH_TOKEN_URL,
    scope: "https://graph.microsoft.com/Mail.Read offline_access",
    label: "graph/common/Mail.Read",
    kind: "graph",
  },
  {
    url: GRAPH_TOKEN_URL,
    scope:
      "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access",
    label: "graph/common/Mail.Read+User.Read",
    kind: "graph",
  },
  {
    url: GRAPH_TOKEN_URL,
    scope: "https://graph.microsoft.com/Mail.ReadWrite offline_access",
    label: "graph/common/Mail.ReadWrite",
    kind: "graph",
  },
  {
    url: GRAPH_TOKEN_URL,
    scope: "https://graph.microsoft.com/.default",
    label: "graph/common/.default",
    kind: "graph",
  },
  // empty scope = original grant (critical for public clients / card keys)
  { url: GRAPH_TOKEN_URL, scope: "", label: "graph/common/(original)", kind: "graph" },
  {
    url: CONSUMERS_TOKEN_URL,
    scope: "https://graph.microsoft.com/Mail.Read offline_access",
    label: "graph/consumers/Mail.Read",
    kind: "graph",
  },
  {
    url: CONSUMERS_TOKEN_URL,
    scope: "https://graph.microsoft.com/.default",
    label: "graph/consumers/.default",
    kind: "graph",
  },
  { url: CONSUMERS_TOKEN_URL, scope: "", label: "graph/consumers/(original)", kind: "graph" },
  // IMAP (outlookEmail request_imap_token_response)
  {
    url: CONSUMERS_TOKEN_URL,
    scope: IMAP_SCOPE,
    label: "imap/consumers",
    kind: "imap",
  },
  {
    url: GRAPH_TOKEN_URL,
    scope: IMAP_SCOPE,
    label: "imap/common",
    kind: "imap",
  },
  { url: LIVE_TOKEN_URL, scope: "", label: "live.com/(original)", kind: "unknown" },
  {
    url: LIVE_TOKEN_URL,
    scope: IMAP_SCOPE,
    label: "live.com/imap",
    kind: "imap",
  },
]

/** outlookEmail is_graph_token_scope_retryable_response */
function isScopeRetryable(errCode: string, desc: string): boolean {
  const code = errCode.toLowerCase()
  const text = `${errCode} ${desc}`.toLowerCase()
  if (["invalid_scope", "consent_required", "interaction_required"].includes(code)) {
    return true
  }
  return /aadsts90023|aadsts70000|aadsts70011|no applicable permissions|requested are unauthorized or expired|consent|invalid scope|unauthorized or expired/i.test(
    text
  )
}

/** Only abort when RT is truly dead — never for AADSTS70000 scope mismatch. */
function isHardTokenDeath(errCode: string, desc: string): boolean {
  if (isScopeRetryable(errCode, desc)) return false
  const text = `${errCode} ${desc}`.toLowerCase()
  if (/aadsts50076|aadsts50079|aadsts50173/i.test(text)) return true
  if (/user account is found to be in service abuse|account is disabled/i.test(text)) return true
  if (/invalid_grant/i.test(text)) {
    return /refresh.?token.*(expired|revoked)|token has been revoked|no longer valid|aadsts70008|aadsts700082|aadsts700084|does not exist/i.test(
      text
    )
  }
  return false
}

/**
 * Decode Microsoft access_token JWT payload (no verify — just inspect aud/scp/roles).
 * Card-key tokens often refresh with empty scope and return an IMAP-audience AT;
 * we must not treat those as Graph-capable just because the token URL was /common.
 */
function inspectAccessToken(accessToken: string): {
  kind: "graph" | "imap" | "unknown"
  audience: string
  scopes: string
} {
  try {
    const parts = accessToken.split(".")
    if (parts.length < 2) {
      return { kind: "unknown", audience: "", scopes: "" }
    }
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4))
    const json = atob(b64 + pad)
    const payload = JSON.parse(json) as Record<string, unknown>
    const aud = String(payload.aud || "")
    const scp = String(payload.scp || payload.scope || "")
    const roles = Array.isArray(payload.roles) ? payload.roles.join(" ") : ""
    const combined = `${aud} ${scp} ${roles}`.toLowerCase()

    if (
      /outlook\.office\.com|office365|imap\.accessasuser|ews\.accessasuser|mapi/i.test(combined)
    ) {
      return { kind: "imap", audience: aud, scopes: scp || roles }
    }
    if (/graph\.microsoft\.com/i.test(combined)) {
      // Graph audience but may lack Mail.Read
      return { kind: "graph", audience: aud, scopes: scp || roles }
    }
    return { kind: "unknown", audience: aud, scopes: scp || roles }
  } catch {
    return { kind: "unknown", audience: "", scopes: "" }
  }
}

function hasGraphMailScope(scopes: string): boolean {
  const s = scopes.toLowerCase()
  // delegated scp or app roles
  return (
    /mail\.read|mail\.readwrite|mail\.readbasic|\.default/i.test(s) ||
    s.includes("mail.read") ||
    s.includes("mail.readwrite")
  )
}

export async function refreshAccessToken(
  clientId: string,
  refreshToken: string
): Promise<TokenRefreshResult> {
  let lastError = "Token refresh failed"
  let lastAuthError = false
  const trimmedClient = clientId.trim()
  const trimmedRt = refreshToken.trim()

  if (!trimmedClient || !trimmedRt) {
    return { success: false, error: "client_id 或 refresh_token 为空", authError: true }
  }

  try {
    for (const attempt of TOKEN_ATTEMPTS) {
      const body = new URLSearchParams({
        client_id: trimmedClient,
        grant_type: "refresh_token",
        refresh_token: trimmedRt,
      })
      if (attempt.scope) body.set("scope", attempt.scope)

      let res: Response
      try {
        res = await fetch(attempt.url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        })
      } catch (netErr) {
        lastError = sanitizeError(
          `[${attempt.label}] network: ${
            netErr instanceof Error ? netErr.message : String(netErr)
          }`
        )
        continue
      }

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (res.ok) {
        const accessToken = data.access_token
        if (typeof accessToken !== "string" || !accessToken) {
          lastError = `[${attempt.label}] missing access_token`
          continue
        }

        // Prefer claims over attempt label (empty-scope AT may be IMAP)
        const inspected = inspectAccessToken(accessToken)
        let tokenKind = inspected.kind
        if (tokenKind === "unknown") tokenKind = attempt.kind

        return {
          success: true,
          accessToken,
          refreshToken:
            typeof data.refresh_token === "string" ? data.refresh_token : undefined,
          scopeUsed: attempt.scope || inspected.scopes || "(original)",
          tokenKind,
          attemptLabel: attempt.label,
        }
      }

      const errCode = String(data.error || "")
      const desc = String(data.error_description || data.error || res.statusText)
      lastError = sanitizeError(`[${attempt.label}] ${desc || errCode || res.status}`)
      lastAuthError =
        res.status === 400 ||
        res.status === 401 ||
        /invalid_grant|expired|revoked|disabled/i.test(errCode + desc)

      if (isHardTokenDeath(errCode, desc)) {
        return { success: false, error: lastError, authError: true }
      }
    }

    return { success: false, error: lastError, authError: lastAuthError }
  } catch (e) {
    return {
      success: false,
      error: sanitizeError(e instanceof Error ? e.message : String(e)),
    }
  }
}

/**
 * Align with outlookEmail test_refresh_token for "is RT alive",
 * then verify Graph mail capability for this product.
 *
 * For card keys: RT often only yields IMAP ATs. We try all refresh combinations;
 * if any AT can list Graph mail, success. If only IMAP ATs work, clear IMAP warning.
 */
export async function probeGraphCredentials(
  clientId: string,
  refreshToken: string
): Promise<
  | {
      success: true
      accessToken: string
      refreshToken?: string
      emailHint?: string
      tokenKind: "graph" | "imap" | "unknown"
      graphMailOk: boolean
      warning?: string
      attemptLabel?: string
    }
  | { success: false; error: string; authError?: boolean }
> {
  // Collect every successful refresh (different scopes may yield different ATs)
  type Hit = {
    accessToken: string
    refreshToken?: string
    tokenKind: "graph" | "imap" | "unknown"
    attemptLabel?: string
    scopeUsed?: string
  }
  const hits: Hit[] = []
  let lastError = "Token refresh failed"
  let lastAuthError = false
  const trimmedClient = clientId.trim()
  const trimmedRt = refreshToken.trim()

  if (!trimmedClient || !trimmedRt) {
    return { success: false, error: "client_id 或 refresh_token 为空", authError: true }
  }

  for (const attempt of TOKEN_ATTEMPTS) {
    const body = new URLSearchParams({
      client_id: trimmedClient,
      grant_type: "refresh_token",
      refresh_token: trimmedRt,
    })
    if (attempt.scope) body.set("scope", attempt.scope)

    let res: Response
    try {
      res = await fetch(attempt.url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      })
    } catch (netErr) {
      lastError = sanitizeError(
        `[${attempt.label}] network: ${
          netErr instanceof Error ? netErr.message : String(netErr)
        }`
      )
      continue
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.ok && typeof data.access_token === "string") {
      const inspected = inspectAccessToken(data.access_token)
      let tokenKind = inspected.kind
      if (tokenKind === "unknown") tokenKind = attempt.kind
      hits.push({
        accessToken: data.access_token,
        refreshToken:
          typeof data.refresh_token === "string" ? data.refresh_token : undefined,
        tokenKind,
        attemptLabel: attempt.label,
        scopeUsed: attempt.scope || inspected.scopes || "(original)",
      })
      // Prefer first Graph-kind hit for subsequent mail check, but keep collecting
      // a few more is wasteful — if graph-kind, try Graph list immediately
      if (tokenKind === "graph" || attempt.kind === "graph") {
        const listed = await listMessages(data.access_token, {
          folder: "inbox",
          top: 1,
          skip: 0,
        })
        if (listed.success) {
          let emailHint: string | undefined
          try {
            const meRes = await fetch(`${GRAPH_BASE}/me?$select=mail,userPrincipalName`, {
              headers: { Authorization: `Bearer ${data.access_token}` },
            })
            if (meRes.ok) {
              const me = (await meRes.json()) as {
                mail?: string
                userPrincipalName?: string
              }
              emailHint =
                (me.mail || me.userPrincipalName || "").toLowerCase() || undefined
            }
          } catch {
            // optional
          }
          return {
            success: true,
            accessToken: data.access_token,
            refreshToken:
              typeof data.refresh_token === "string" ? data.refresh_token : undefined,
            emailHint,
            tokenKind: "graph",
            graphMailOk: true,
            attemptLabel: attempt.label,
          }
        }
        // Graph AT but list 401 — keep trying other scopes/endpoints
        lastError = sanitizeError(
          `[${attempt.label}] Graph 401/列信失败（令牌 audience/scp 可能不含 Mail.Read）: ${listed.error}`
        )
        continue
      }
      // IMAP hit — record but keep trying for Graph
      continue
    }

    const errCode = String(data.error || "")
    const desc = String(data.error_description || data.error || res.statusText)
    lastError = sanitizeError(`[${attempt.label}] ${desc || errCode || res.status}`)
    lastAuthError =
      res.status === 400 ||
      res.status === 401 ||
      /invalid_grant|expired|revoked|disabled/i.test(errCode + desc)
    if (isHardTokenDeath(errCode, desc)) {
      return { success: false, error: lastError, authError: true }
    }
  }

  // No Graph mail success. If any IMAP/unknown AT was obtained, token is alive.
  const imapHit = hits.find((h) => h.tokenKind === "imap")
  const anyHit = hits[0]
  if (imapHit || anyHit) {
    const hit = imapHit || anyHit
    const inspected = inspectAccessToken(hit.accessToken)
    const scpInfo = inspected.scopes
      ? `scp/roles=${inspected.scopes.slice(0, 120)}`
      : "无 Mail.Read"
    const audInfo = inspected.audience ? `aud=${inspected.audience}` : ""
    return {
      success: true,
      accessToken: hit.accessToken,
      refreshToken: hit.refreshToken,
      tokenKind: hit.tokenKind,
      graphMailOk: false,
      attemptLabel: hit.attemptLabel,
      warning:
        hit.tokenKind === "imap"
          ? `令牌有效（IMAP 权限，卡密常见）。本站只能用 Graph 读信，无法取邮件。${audInfo} ${scpInfo}。请换 Graph/Mail.Read 的 refresh_token 或网页 Graph 授权导入。`
          : `令牌可刷新，但无法用 Graph 读信（401）。${audInfo} ${scpInfo}。卡密多为 IMAP 授权；本站需要 Graph Mail.Read。`,
    }
  }

  return { success: false, error: lastError, authError: lastAuthError }
}

export async function applyProbeToAccount(
  db: DB,
  account: OauthMailAccount,
  encryptionKey: string,
  probe: Awaited<ReturnType<typeof probeGraphCredentials>>
): Promise<void> {
  invalidateAccessTokenCache(account.id)
  if (!probe.success) {
    await updateOauthMailAccount(db, account.id, {
      status: probe.authError ? "auth_error" : account.status,
      lastError: probe.error,
    })
    return
  }

  await updateOauthMailAccount(db, account.id, {
    status: "active",
    lastError: probe.warning || null,
    lastSyncAt: Math.floor(Date.now() / 1000),
    ...(probe.refreshToken
      ? {
          encryptedRefreshToken: await encryptSecret(probe.refreshToken, encryptionKey),
          refreshTokenUpdatedAt: Math.floor(Date.now() / 1000),
        }
      : {}),
  })
  if (probe.graphMailOk || probe.tokenKind === "graph") {
    setCachedAccessToken(account.id, probe.accessToken)
  }
}

export async function probeStoredAccount(
  db: DB,
  account: OauthMailAccount,
  encryptionKey: string
): Promise<{
  ok: boolean
  error?: string
  warning?: string
  tokenKind?: string
  graphMailOk?: boolean
  attemptLabel?: string
}> {
  if (!account.clientId?.trim()) {
    return { ok: false, error: "client_id 为空" }
  }
  let refreshToken: string
  try {
    refreshToken = await decryptSecret(account.encryptedRefreshToken, encryptionKey)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    await updateOauthMailAccount(db, account.id, {
      status: "auth_error",
      lastError: `无法解密 refresh_token（检查 ENCRYPTION_KEY）: ${detail}`,
    })
    return { ok: false, error: `无法解密 refresh_token: ${detail}` }
  }
  if (!refreshToken?.trim()) {
    return { ok: false, error: "解密后 refresh_token 为空" }
  }

  const probe = await probeGraphCredentials(account.clientId, refreshToken)
  await applyProbeToAccount(db, account, encryptionKey, probe)

  if (!probe.success) {
    return { ok: false, error: probe.error }
  }

  // Product needs Graph mail; IMAP-only = operator-visible failure with clear reason
  if (probe.tokenKind === "imap" || (!probe.graphMailOk && probe.warning)) {
    return {
      ok: false,
      error: probe.warning || "令牌有效但无法 Graph 读信",
      warning: probe.warning,
      tokenKind: probe.tokenKind,
      graphMailOk: false,
      attemptLabel: probe.attemptLabel,
    }
  }

  return {
    ok: true,
    tokenKind: probe.tokenKind,
    graphMailOk: probe.graphMailOk,
    attemptLabel: probe.attemptLabel,
    warning: probe.warning,
  }
}

export async function probeStoredAccountsBatch(
  db: DB,
  accounts: OauthMailAccount[],
  encryptionKey: string,
  concurrency = 1
): Promise<{ ok: number; failed: number; errors: Array<{ email: string; error: string }> }> {
  let ok = 0
  let failed = 0
  const errors: Array<{ email: string; error: string }> = []
  let index = 0

  async function worker() {
    while (index < accounts.length) {
      const current = accounts[index++]
      const result = await probeStoredAccount(db, current, encryptionKey)
      if (result.ok) ok++
      else {
        failed++
        errors.push({ email: current.email, error: result.error || "probe failed" })
      }
    }
  }

  const n = Math.min(Math.max(concurrency, 1), Math.max(accounts.length, 1))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return { ok, failed, errors }
}

// ---- mail helpers continue below (mapFolder, listMessages, ...) ----

function mapFolder(folder: string): string {
  const key = (folder || "inbox").toLowerCase()
  if (key === "junk" || key === "junkemail" || key === "spam") return "junkemail"
  if (key === "deleted" || key === "deleteditems" || key === "trash") return "deleteditems"
  return "inbox"
}

function mapSummary(msg: Record<string, unknown>, folder?: string): GraphMessageSummary {
  const from = msg.from as { emailAddress?: { address?: string; name?: string } } | undefined
  return {
    id: String(msg.id || ""),
    subject: (msg.subject as string) ?? null,
    fromAddress: from?.emailAddress?.address || "unknown",
    fromName: from?.emailAddress?.name || null,
    receivedAt: (msg.receivedDateTime as string) || null,
    bodyPreview: (msg.bodyPreview as string) || null,
    isRead: Boolean(msg.isRead),
    hasAttachments: Boolean(msg.hasAttachments),
    folder,
  }
}

function toGraphIso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z")
}

function recipientAddresses(
  list: Array<{ emailAddress?: { address?: string } }> | undefined
): string[] {
  return (list || [])
    .map((r) => r.emailAddress?.address)
    .filter((a): a is string => Boolean(a))
}

export type ListMessagesOptions = {
  folder?: string
  top?: number
  skip?: number
  /** Only messages received at or after this unix ms (Graph $filter). */
  receivedSinceMs?: number
}

async function listMessagesSingleFolder(
  accessToken: string,
  folder: string,
  options: ListMessagesOptions
): Promise<{ success: true; emails: GraphMessageSummary[] } | { success: false; error: string }> {
  const top = Math.min(Math.max(options.top ?? 20, 1), 50)
  const skip = Math.max(options.skip ?? 0, 0)

  const params = new URLSearchParams({
    $top: String(top),
    $skip: String(skip),
    $select: "id,subject,from,toRecipients,receivedDateTime,isRead,hasAttachments,bodyPreview",
    $orderby: "receivedDateTime desc",
  })

  if (options.receivedSinceMs && Number.isFinite(options.receivedSinceMs)) {
    params.set("$filter", `receivedDateTime ge ${toGraphIso(options.receivedSinceMs)}`)
  }

  const url = `${GRAPH_BASE}/me/mailFolders/${folder}/messages?${params}`
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.body-content-type="text"',
      },
    })
    if (!res.ok) {
      if (options.receivedSinceMs && res.status === 400) {
        return listMessagesSingleFolder(accessToken, folder, {
          ...options,
          receivedSinceMs: undefined,
        })
      }
      const text = await res.text().catch(() => "")
      return {
        success: false,
        error: sanitizeError(`Graph list failed (${res.status}): ${text}`),
      }
    }
    const data = (await res.json()) as { value?: Record<string, unknown>[] }
    const emails = (data.value || [])
      .map((m) => mapSummary(m, folder))
      .filter((m) => m.id)
    return { success: true, emails }
  } catch (e) {
    return {
      success: false,
      error: sanitizeError(e instanceof Error ? e.message : String(e)),
    }
  }
}

export async function listMessages(
  accessToken: string,
  options: ListMessagesOptions = {}
): Promise<{ success: true; emails: GraphMessageSummary[] } | { success: false; error: string }> {
  const folderKey = (options.folder || "inbox").toLowerCase()

  // folder=all → inbox + junkemail in parallel, merge by receivedAt
  if (folderKey === "all" || folderKey === "inbox+junk" || folderKey === "both") {
    const perFolderTop = Math.min(Math.max(options.top ?? 20, 1), 50)
    const [inbox, junk] = await Promise.all([
      listMessagesSingleFolder(accessToken, "inbox", { ...options, top: perFolderTop, skip: 0 }),
      listMessagesSingleFolder(accessToken, "junkemail", {
        ...options,
        top: perFolderTop,
        skip: 0,
      }),
    ])
    if (!inbox.success && !junk.success) {
      return { success: false, error: inbox.error || junk.error }
    }
    const merged = [
      ...(inbox.success ? inbox.emails : []),
      ...(junk.success ? junk.emails : []),
    ]
    // dedupe by id
    const byId = new Map<string, GraphMessageSummary>()
    for (const email of merged) {
      if (!byId.has(email.id)) byId.set(email.id, email)
    }
    const emails = [...byId.values()].sort((a, b) => {
      const ta = a.receivedAt ? Date.parse(a.receivedAt) : 0
      const tb = b.receivedAt ? Date.parse(b.receivedAt) : 0
      return tb - ta
    })
    return { success: true, emails: emails.slice(0, perFolderTop) }
  }

  return listMessagesSingleFolder(accessToken, mapFolder(folderKey), options)
}

export async function getMessage(
  accessToken: string,
  messageId: string,
  options: { preferHtml?: boolean } = {}
): Promise<{ success: true; email: GraphMessageDetail } | { success: false; error: string }> {
  const select =
    "id,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,hasAttachments,bodyPreview,body"
  const url = `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}?$select=${select}`
  const prefer = options.preferHtml
    ? 'outlook.body-content-type="html"'
    : 'outlook.body-content-type="text"'

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: prefer,
      },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return { success: false, error: sanitizeError(`Graph get failed (${res.status}): ${text}`) }
    }
    const msg = (await res.json()) as Record<string, unknown>
    const summary = mapSummary(msg)
    const body = msg.body as { contentType?: string; content?: string } | undefined
    let text: string | null = null
    let html: string | null = null
    if (body?.content) {
      if ((body.contentType || "").toLowerCase() === "html") {
        html = body.content
      } else {
        text = body.content
      }
    }

    return {
      success: true,
      email: {
        ...summary,
        text,
        html,
        toAddresses: recipientAddresses(
          msg.toRecipients as Array<{ emailAddress?: { address?: string } }>
        ),
        ccAddresses: recipientAddresses(
          msg.ccRecipients as Array<{ emailAddress?: { address?: string } }>
        ),
      },
    }
  } catch (e) {
    return {
      success: false,
      error: sanitizeError(e instanceof Error ? e.message : String(e)),
    }
  }
}

/**
 * Fetch message preferring HTML for inbox UI. Single Graph request.
 */
export async function getMessageForDisplay(
  accessToken: string,
  messageId: string
): Promise<{ success: true; email: GraphMessageDetail } | { success: false; error: string }> {
  return getMessage(accessToken, messageId, { preferHtml: true })
}

/** Raw RFC822 MIME via Graph /$value */
export async function getMessageRawMime(
  accessToken: string,
  messageId: string
): Promise<{ success: true; mime: ArrayBuffer; contentType: string } | { success: false; error: string }> {
  const url = `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/$value`
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return { success: false, error: sanitizeError(`Graph raw failed (${res.status}): ${text}`) }
    }
    return {
      success: true,
      mime: await res.arrayBuffer(),
      contentType: res.headers.get("content-type") || "message/rfc822",
    }
  } catch (e) {
    return {
      success: false,
      error: sanitizeError(e instanceof Error ? e.message : String(e)),
    }
  }
}

export async function listAttachments(
  accessToken: string,
  messageId: string
): Promise<{ success: true; attachments: GraphAttachmentMeta[] } | { success: false; error: string }> {
  const params = new URLSearchParams({
    $select: "id,name,contentType,size,isInline,contentId",
  })
  const url = `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/attachments?${params}`
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        success: false,
        error: sanitizeError(`Graph attachments failed (${res.status}): ${text}`),
      }
    }
    const data = (await res.json()) as { value?: Record<string, unknown>[] }
    const attachments: GraphAttachmentMeta[] = (data.value || []).map((item, index) => ({
      id: String(item.id || ""),
      name: String(item.name || `attachment-${index + 1}`),
      contentType: String(item.contentType || "application/octet-stream"),
      size: Number(item.size || 0),
      isInline: Boolean(item.isInline),
      contentId: item.contentId ? String(item.contentId).replace(/^<|>$/g, "") : null,
    })).filter((a) => a.id)
    return { success: true, attachments }
  } catch (e) {
    return {
      success: false,
      error: sanitizeError(e instanceof Error ? e.message : String(e)),
    }
  }
}

export async function downloadAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<
  | {
      success: true
      name: string
      contentType: string
      size: number
      contentBytes: Uint8Array
    }
  | { success: false; error: string }
> {
  const url = `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        success: false,
        error: sanitizeError(`Graph attachment download failed (${res.status}): ${text}`),
      }
    }
    const data = (await res.json()) as Record<string, unknown>
    const b64 = data.contentBytes
    if (typeof b64 !== "string" || !b64) {
      // fileAttachment might use @odata.mediaContentType without contentBytes for large files
      return { success: false, error: "Attachment has no contentBytes (possibly too large)" }
    }
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return {
      success: true,
      name: String(data.name || "attachment"),
      contentType: String(data.contentType || "application/octet-stream"),
      size: Number(data.size || bytes.length),
      contentBytes: bytes,
    }
  } catch (e) {
    return {
      success: false,
      error: sanitizeError(e instanceof Error ? e.message : String(e)),
    }
  }
}

/**
 * Probe credentials.
 * Success = refresh_token can obtain an access_token (any valid endpoint/scope).
 * Graph inbox list is best-effort: card-key IMAP tokens often refresh but cannot call Graph.
 */
export type FindCodeResult = {
  code: string | null
  subject: string | null
  sender: string
  sender_name: string | null
  received_at: string | null
  message_id: string | null
  latest_email: {
    subject: string | null
    sender: string
    text_snippet: string | null
    received_at: string | null
  } | null
}

/**
 * Scan recent Graph messages for a verification code.
 * Uses subject/bodyPreview first; only fetches full body when needed (max maxDetailFetches).
 */
export async function findVerificationCodeInMailbox(
  accessToken: string,
  extract: (text: string | null, html: string | null) => string | null,
  options: {
    folder?: string
    top?: number
    receivedSinceMs?: number
    maxDetailFetches?: number
  } = {}
): Promise<{ success: true; data: FindCodeResult } | { success: false; error: string }> {
  const top = Math.min(options.top ?? 10, 20)
  const maxDetailFetches = options.maxDetailFetches ?? 3

  const listed = await listMessages(accessToken, {
    folder: options.folder || "inbox",
    top,
    skip: 0,
    receivedSinceMs: options.receivedSinceMs,
  })
  if (!listed.success) return listed

  let detailFetches = 0
  for (const summary of listed.emails) {
    let code =
      extract(summary.bodyPreview, null) ||
      extract(summary.subject, null)

    if (!code && detailFetches < maxDetailFetches) {
      detailFetches++
      const detail = await getMessage(accessToken, summary.id, { preferHtml: false })
      if (detail.success) {
        code =
          extract(detail.email.text, detail.email.html) ||
          extract(detail.email.subject, null)
      }
    }

    if (code) {
      return {
        success: true,
        data: {
          code,
          subject: summary.subject,
          sender: summary.fromAddress,
          sender_name: summary.fromName,
          received_at: summary.receivedAt,
          message_id: summary.id,
          latest_email: null,
        },
      }
    }
  }

  const latest = listed.emails[0]
  return {
    success: true,
    data: {
      code: null,
      subject: null,
      sender: "",
      sender_name: null,
      received_at: null,
      message_id: null,
      latest_email: latest
        ? {
            subject: latest.subject,
            sender: latest.fromAddress,
            text_snippet: latest.bodyPreview?.slice(0, 200) || null,
            received_at: latest.receivedAt,
          }
        : null,
    },
  }
}

async function touchAccountMeta(
  db: DB,
  account: OauthMailAccount,
  extra: Parameters<typeof updateOauthMailAccount>[2] = {}
): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000)
  const patches: Parameters<typeof updateOauthMailAccount>[2] = { ...extra }

  if (account.status === "auth_error") {
    patches.status = "active"
    patches.lastError = null
  }

  const lastSync = account.lastSyncAt ?? 0
  if (nowSec - lastSync >= LAST_SYNC_WRITE_INTERVAL_SEC) {
    patches.lastSyncAt = nowSec
    if (account.lastError && patches.lastError === undefined) {
      patches.lastError = null
    }
    if (account.status !== "active" && patches.status === undefined) {
      patches.status = "active"
    }
  }

  if (Object.keys(patches).length > 0) {
    await updateOauthMailAccount(db, account.id, patches)
  }
}

/**
 * Decrypt RT (or reuse cached access_token), refresh when needed, run Graph callback.
 * - Access tokens cached ~50m per isolate (no refresh_token in memory cache)
 * - lastSyncAt writes throttled to cut D1 usage
 * - On Graph 401, cache is invalidated and token is refreshed once
 */
export async function withAccountToken<T>(
  db: DB,
  account: OauthMailAccount,
  encryptionKey: string,
  fn: (accessToken: string) => Promise<T>
): Promise<{ success: true; data: T } | { success: false; error: string; authError?: boolean }> {
  if (account.status === "disabled") {
    return { success: false, error: "账号已停用" }
  }

  const runWithToken = async (accessToken: string, fromCache: boolean): Promise<
    | { success: true; data: T }
    | { success: false; error: string; authError?: boolean; retryWithRefresh?: boolean }
  > => {
    try {
      const data = await fn(accessToken)
      if (!fromCache) {
        // Meta already updated on refresh path; still throttle success touch for cache hits
      } else {
        await touchAccountMeta(db, account)
      }
      return { success: true, data }
    } catch (e) {
      const message = sanitizeError(e instanceof Error ? e.message : String(e))
      if (fromCache && isAuthFailureMessage(message)) {
        invalidateAccessTokenCache(account.id)
        return { success: false, error: message, retryWithRefresh: true }
      }
      await updateOauthMailAccount(db, account.id, { lastError: message })
      return { success: false, error: message, authError: isAuthFailureMessage(message) }
    }
  }

  // Fast path: cached access_token
  const cached = getCachedAccessToken(account.id)
  if (cached) {
    const cachedResult = await runWithToken(cached, true)
    if (cachedResult.success) return cachedResult
    if (!("retryWithRefresh" in cachedResult) || !cachedResult.retryWithRefresh) {
      return {
        success: false,
        error: cachedResult.error,
        authError: cachedResult.authError,
      }
    }
    // fall through to refresh
  }

  let refreshToken: string
  try {
    refreshToken = await decryptSecret(account.encryptedRefreshToken, encryptionKey)
  } catch {
    return { success: false, error: "无法解密 refresh_token，请检查 ENCRYPTION_KEY", authError: true }
  }

  const tokenResult = await refreshAccessToken(account.clientId, refreshToken)
  if (!tokenResult.success) {
    invalidateAccessTokenCache(account.id)
    await updateOauthMailAccount(db, account.id, {
      status: tokenResult.authError ? "auth_error" : account.status,
      lastError: tokenResult.error,
    })
    return {
      success: false,
      error: tokenResult.error,
      authError: tokenResult.authError,
    }
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const patches: Parameters<typeof updateOauthMailAccount>[2] = {}

  if (tokenResult.refreshToken && tokenResult.refreshToken !== refreshToken) {
    patches.encryptedRefreshToken = await encryptSecret(tokenResult.refreshToken, encryptionKey)
    patches.refreshTokenUpdatedAt = nowSec
  }

  await touchAccountMeta(db, account, patches)
  setCachedAccessToken(account.id, tokenResult.accessToken)

  const liveResult = await runWithToken(tokenResult.accessToken, false)
  if (liveResult.success) return liveResult
  return {
    success: false,
    error: liveResult.error,
    authError: liveResult.authError,
  }
}

