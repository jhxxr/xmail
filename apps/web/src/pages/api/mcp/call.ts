import type { APIRoute } from "astro"
import { createDB } from "database"
import * as dao from "database/dao"
import { authenticateApiKey, unauthorizedResponse } from "../../../lib/api-auth"
import { extractVerificationCode } from "../../../lib/utils"
import { encryptSecret, isEncryptionKeyConfigured } from "../../../lib/crypto"
import { parseOutlookImportLines } from "../../../lib/oauth-import"
import {
  findVerificationCodeInMailbox,
  invalidateAccessTokenCache,
  listMessages,
  probeStoredAccount,
  probeStoredAccountsBatch,
  withAccountToken,
} from "../../../lib/ms-graph"

/**
 * MCP工具调用端点
 * POST /api/mcp/call
 *
 * 请求体格式:
 * {
 *   "tool": "tool_name",
 *   "arguments": { ... }
 * }
 */
export const POST: APIRoute = async (context) => {
  // 验证API Key
  if (!await authenticateApiKey(context)) {
    return unauthorizedResponse()
  }

  const db = createDB(context.locals.runtime.env.DB)
  const encryptionKey = context.locals.runtime.env.ENCRYPTION_KEY

  try {
    const body = (await context.request.json()) as {
      tool?: string
      arguments?: Record<string, any>
    }
    const tool = body.tool
    const args = body.arguments || {}

    if (!tool) {
      return new Response(JSON.stringify({
        success: false,
        error: "Missing required field: tool"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    }

    // 路由到对应的工具处理函数
    let result: any

    switch (tool) {
      // ========== 验证码相关 ==========
      case "get_verification_code":
        result = await handleGetVerificationCode(db, args, encryptionKey)
        break

      // ========== 用户管理 ==========
      case "create_user":
        result = await dao.createUser(db, args)
        break
      case "list_users":
        result = await dao.listUsers(db, args)
        break
      case "get_user":
        if (args.token) {
          result = await dao.getUserByToken(db, args.token)
        } else if (args.id) {
          result = await dao.getUserById(db, args.id)
        } else {
          throw new Error("Either 'id' or 'token' is required")
        }
        break
      case "update_user":
        await dao.updateUser(db, args.id, {
          name: args.name,
          note: args.note,
          isActive: args.isActive
        })
        result = { success: true }
        break
      case "delete_user":
        await dao.deleteUser(db, args.id)
        result = { success: true }
        break

      // ========== 邮箱管理 ==========
      case "create_mailbox":
        result = await dao.createMailbox(db, args.address, {
          note: args.note
        })
        break
      case "create_mailboxes_batch":
        result = await dao.createMailboxBatch(db, args.addresses)
        break
      case "list_mailboxes":
        result = await dao.listMailboxes(db, {
          limit: args.limit,
          offset: args.offset,
          unassignedOnly: args.unassignedOnly,
          userId: args.userId,
          sharedOnly: args.sharedOnly
        })
        break
      case "get_mailbox":
        result = await dao.getMailbox(db, args.address)
        break
      case "delete_mailbox":
        await dao.deleteMailbox(db, args.address)
        result = { success: true }
        break
      case "restore_mailbox":
        await dao.restoreMailbox(db, args.address)
        result = { success: true }
        break
      case "list_deleted_mailboxes":
        result = await dao.listDeletedMailboxes(db, {
          limit: args.limit,
          offset: args.offset
        })
        break
      case "assign_mailbox_to_user":
        await dao.assignMailboxToUser(db, args.address, args.userId)
        result = { success: true }
        break
      case "assign_mailboxes_to_user":
        await dao.assignMailboxesToUser(db, args.addresses, args.userId)
        result = { success: true }
        break
      case "set_mailbox_password":
        const password = await dao.setMailboxPassword(db, args.address, args.password)
        result = { password }
        break
      case "get_mailbox_password":
        const plainPassword = await dao.getMailboxPlainPassword(db, args.address)
        result = { password: plainPassword }
        break
      case "set_mailbox_shared":
        await dao.setMailboxShared(db, args.address, args.isShared)
        result = { success: true }
        break
      case "add_user_to_shared_mailbox":
        await dao.addUserToSharedMailbox(db, args.address, args.userId)
        result = { success: true }
        break
      case "remove_user_from_shared_mailbox":
        await dao.removeUserFromSharedMailbox(db, args.address, args.userId)
        result = { success: true }
        break
      case "get_shared_mailbox_users":
        result = await dao.getSharedMailboxUsers(db, args.address)
        break

      // ========== 邮件查询 ==========
      case "list_emails":
        // Prefer lightweight summaries unless full body requested
        if (args.full) {
          result = await dao.getEmailsByMailbox(db, args.mailbox, {
            limit: args.limit,
            offset: args.offset
          })
        } else {
          result = await dao.listEmailSummaries(db, args.mailbox, {
            limit: args.limit ?? 20,
            offset: args.offset ?? 0
          })
        }
        break
      case "get_email":
        result = await dao.getEmail(db, args.id)
        break
      case "get_mailbox_stats":
        result = await dao.getMailboxStats(db, args.mailbox)
        break
      case "list_all_emails":
        result = await dao.listAllEmails(db, {
          limit: args.limit,
          offset: args.offset
        })
        break
      case "search_emails":
        result = await handleSearchEmails(db, args)
        break
      case "search_verification_codes":
        result = await handleSearchVerificationCodes(db, args)
        break

      // ========== 邮件操作 ==========
      case "mark_email_as_read":
        await dao.markEmailAsRead(db, args.id)
        result = { success: true }
        break
      case "toggle_email_star":
        await dao.toggleEmailStar(db, args.id, args.isStarred)
        result = { success: true }
        break
      case "list_starred_emails":
        result = await dao.listStarredEmails(db, args.mailbox)
        break
      case "delete_email":
        await dao.deleteEmail(db, args.id)
        result = { success: true }
        break
      case "delete_old_emails":
        const deletedCount = await dao.deleteOldEmails(db, args.days)
        result = { deletedCount }
        break

      // ========== 服务模板管理 ==========
      case "create_service_template":
        result = await dao.createServiceTemplate(db, {
          name: args.name,
          loginUrl: args.loginUrl,
          note: args.note
        })
        break
      case "list_service_templates":
        result = await dao.listServiceTemplates(db)
        break
      case "add_service_to_mailbox":
        result = await dao.addServiceToMailbox(db, args.mailbox, args.templateId, args.expiresAt)
        break
      case "get_mailbox_services":
        result = await dao.getMailboxServicesWithDetails(db, args.mailbox)
        break

      // ========== 统计 ==========
      case "get_stats":
        result = await dao.getStats(db)
        break
      case "count_users":
        result = { count: await dao.countUsers(db) }
        break
      case "count_mailboxes":
        result = { count: await dao.countMailboxes(db) }
        break
      case "count_emails":
        result = { count: await dao.countEmails(db) }
        break
      case "count_unassigned_mailboxes":
        result = { count: await dao.countUnassignedMailboxes(db) }
        break
      case "count_deleted_mailboxes":
        result = { count: await dao.countDeletedMailboxes(db) }
        break

      // ========== 日志和审计 ==========
      case "get_logs":
        result = await dao.getLogs(db, {
          limit: args.limit,
          offset: args.offset
        })
        break

      // ========== 自定义扩展 ==========
      case "add_custom_service_to_mailbox":
        result = await dao.addCustomServiceToMailbox(db, args.mailbox, {
          name: args.name,
          loginUrl: args.loginUrl,
          note: args.note,
          expiresAt: args.expiresAt
        })
        break
      case "remove_service_from_mailbox":
        await dao.removeServiceFromMailbox(db, args.serviceId)
        result = { success: true }
        break
      case "update_service_expiration":
        await dao.updateServiceExpiration(db, args.serviceId, args.expiresAt)
        result = { success: true }
        break
      case "batch_bind_services_to_mailboxes":
        result = await dao.batchBindServicesToMailboxes(db, args.mailboxes, args.templateIds || [], args.customServices || [])
        break

      // ========== OAuth 邮箱 ==========
      case "import_oauth_accounts":
        result = await handleImportOauthAccounts(db, args, encryptionKey)
        break
      case "list_oauth_accounts":
        result = await handleListOauthAccounts(db)
        break
      case "get_oauth_verification_code":
        result = await handleGetOauthVerificationCode(db, args, encryptionKey)
        break
      case "list_oauth_emails":
        result = await handleListOauthEmails(db, args, encryptionKey)
        break
      case "delete_oauth_account":
        result = await handleDeleteOauthAccount(db, args)
        break
      case "regenerate_oauth_share_token":
        result = await handleRegenerateOauthShareToken(db, args)
        break
      case "probe_oauth_account":
        result = await handleProbeOauthAccount(db, args, encryptionKey)
        break

      default:
        return new Response(JSON.stringify({
          success: false,
          error: `Unknown tool: ${tool}`
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        })
    }

    return new Response(JSON.stringify({
      success: true,
      result
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    })

  } catch (error: any) {
    console.error("MCP tool call error:", error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "Internal server error"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
}

/**
 * 处理验证码获取
 * 本地 D1 无结果时回退到 OAuth Graph 账号
 */
async function handleGetVerificationCode(db: any, args: any, encryptionKey?: string) {
  const { mailbox, seconds = 600 } = args

  if (!mailbox) {
    throw new Error("Missing required parameter: mailbox")
  }

  if (seconds < 0 || seconds > 86400) {
    throw new Error("Invalid seconds parameter (must be 0-86400)")
  }

  const sinceTimestamp = Math.floor(Date.now() / 1000) - seconds
  const emails = await dao.getEmailsByMailbox(db, mailbox, { limit: 10 })

  // 尝试从每封邮件中提取验证码
  for (const email of emails) {
    if (email.createdAt < sinceTimestamp) break

    const code = extractVerificationCode(email.text, email.html)
      || extractVerificationCode(email.subject, null)

    if (code) {
      return {
        success: true,
        code,
        confidence: 'high',
        source: 'local',
        email: {
          id: email.id,
          subject: email.subject,
          sender: email.fromAddress,
          sender_name: email.fromName,
          received_at: email.createdAt,
          text: email.text,
          html: email.html
        }
      }
    }
  }

  const latestEmail = emails[0]
  if (latestEmail) {
    return {
      success: false,
      code: null,
      confidence: 'none',
      source: 'local',
      message: "No verification code extracted by algorithm. Please check the full email content manually or use AI to analyze.",
      email: {
        id: latestEmail.id,
        subject: latestEmail.subject,
        sender: latestEmail.fromAddress,
        sender_name: latestEmail.fromName,
        received_at: latestEmail.createdAt,
        text: latestEmail.text,
        html: latestEmail.html
      }
    }
  }

  // 本地无邮件：尝试 OAuth 账号
  const oauthAccount = await dao.getOauthMailAccountByEmail(db, mailbox)
  if (!oauthAccount) {
    return {
      success: false,
      code: null,
      message: "No emails found in the specified time range",
      email: null
    }
  }

  if (!isEncryptionKeyConfigured(encryptionKey)) {
    throw new Error("ENCRYPTION_KEY not configured for OAuth accounts")
  }

  return handleGetOauthVerificationCode(db, {
    email: mailbox,
    seconds,
    folder: "all",
  }, encryptionKey)
}

function publicOauthAccount(account: {
  id: string
  email: string
  provider: string
  clientId: string
  shareToken: string
  note: string | null
  status: string
  lastError: string | null
  lastSyncAt: number | null
  createdAt: number
  updatedAt: number
}) {
  return {
    id: account.id,
    email: account.email,
    provider: account.provider,
    client_id: account.clientId,
    share_token: account.shareToken,
    note: account.note,
    status: account.status,
    last_error: account.lastError,
    last_sync_at: account.lastSyncAt,
    created_at: account.createdAt,
    updated_at: account.updatedAt,
  }
}

async function resolveOauthAccountFromArgs(db: any, args: any) {
  if (args.account_id || args.id) {
    const account = await dao.getOauthMailAccount(db, args.account_id || args.id)
    if (account) return account
  }
  if (args.share_token || args.key) {
    const account = await dao.getOauthMailAccountByShareToken(db, args.share_token || args.key)
    if (account) return account
  }
  if (args.email || args.mailbox) {
    const account = await dao.getOauthMailAccountByEmail(db, args.email || args.mailbox)
    if (account) return account
  }
  return null
}

async function handleImportOauthAccounts(db: any, args: any, encryptionKey?: string) {
  if (!isEncryptionKeyConfigured(encryptionKey)) {
    throw new Error("ENCRYPTION_KEY not configured")
  }
  const text = args.text || args.account_string
  if (!text || typeof text !== "string") {
    throw new Error("Missing required parameter: text")
  }

  const parsed = parseOutlookImportLines(text)
  if (parsed.accounts.length === 0) {
    return {
      success: false,
      message: "No valid accounts to import",
      parse_errors: parsed.errors,
      added: [],
      updated: [],
      skipped: [],
    }
  }

  const rows = []
  for (const account of parsed.accounts) {
    rows.push({
      email: account.email,
      clientId: account.clientId,
      encryptedRefreshToken: await encryptSecret(account.refreshToken, encryptionKey!),
      encryptedPassword: account.password
        ? await encryptSecret(account.password, encryptionKey!)
        : null,
      note: args.note || null,
      provider: "outlook",
    })
  }

  const result = await dao.createOauthMailAccountsBulk(db, rows)
  for (const id of result.credentialChangedIds) {
    invalidateAccessTokenCache(id)
  }

  // 导入不测活，避免批量打微软 token 接口 / 触发 Worker 限制
  return {
    success: true,
    added: result.added.map(publicOauthAccount),
    updated: result.updated.map(publicOauthAccount),
    skipped: result.skipped,
    parse_errors: parsed.errors,
  }
}

async function handleListOauthAccounts(db: any) {
  const accounts = await dao.listOauthMailAccounts(db)
  return {
    success: true,
    count: accounts.length,
    accounts: accounts.map(publicOauthAccount),
  }
}

async function handleGetOauthVerificationCode(db: any, args: any, encryptionKey?: string) {
  if (!isEncryptionKeyConfigured(encryptionKey)) {
    throw new Error("ENCRYPTION_KEY not configured")
  }

  const account = await resolveOauthAccountFromArgs(db, args)
  if (!account) {
    throw new Error("OAuth account not found (provide email, share_token, or account_id)")
  }

  const seconds = typeof args.seconds === "number" ? args.seconds : 600
  if (seconds < 0 || seconds > 86400) {
    throw new Error("Invalid seconds parameter (must be 0-86400)")
  }
  const folder = args.folder || "all"
  const receivedSinceMs = Date.now() - seconds * 1000

  const result = await withAccountToken(db, account, encryptionKey!, async (accessToken) => {
    const found = await findVerificationCodeInMailbox(accessToken, extractVerificationCode, {
      folder,
      top: 10,
      receivedSinceMs,
      maxDetailFetches: 3,
    })
    if (!found.success) throw new Error(found.error)
    return found.data
  })

  if (!result.success) {
    return {
      success: false,
      code: null,
      error: result.error,
      auth_error: result.authError || false,
      source: "oauth",
      account_email: account.email,
    }
  }

  const data = result.data
  if (data.code) {
    return {
      success: true,
      code: data.code,
      confidence: "high",
      source: "oauth",
      account_email: account.email,
      subject: data.subject,
      sender: data.sender,
      sender_name: data.sender_name,
      received_at: data.received_at,
      message_id: data.message_id,
    }
  }

  return {
    success: false,
    code: null,
    confidence: "none",
    source: "oauth",
    account_email: account.email,
    message: "No verification code found in recent emails",
    latest_email: data.latest_email,
  }
}

async function handleListOauthEmails(db: any, args: any, encryptionKey?: string) {
  if (!isEncryptionKeyConfigured(encryptionKey)) {
    throw new Error("ENCRYPTION_KEY not configured")
  }

  const account = await resolveOauthAccountFromArgs(db, args)
  if (!account) {
    throw new Error("OAuth account not found (provide email, share_token, or account_id)")
  }

  const folder = args.folder || "inbox"
  const top = Math.min(Math.max(Number(args.top) || 20, 1), 50)

  const result = await withAccountToken(db, account, encryptionKey!, async (accessToken) => {
    const listed = await listMessages(accessToken, { folder, top, skip: 0 })
    if (!listed.success) throw new Error(listed.error)
    return listed.emails
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      auth_error: result.authError || false,
      account_email: account.email,
    }
  }

  return {
    success: true,
    account_email: account.email,
    folder,
    emails: result.data,
  }
}

async function handleDeleteOauthAccount(db: any, args: any) {
  let id = args.id || args.account_id
  if (!id && (args.email || args.mailbox)) {
    const account = await dao.getOauthMailAccountByEmail(db, args.email || args.mailbox)
    id = account?.id
  }
  if (!id) throw new Error("Missing id or email")

  const account = await dao.getOauthMailAccount(db, id)
  if (!account) throw new Error("OAuth account not found")

  await dao.deleteOauthMailAccount(db, id)
  invalidateAccessTokenCache(id)
  return { success: true, deleted: account.email }
}

async function handleRegenerateOauthShareToken(db: any, args: any) {
  let id = args.id || args.account_id
  if (!id && (args.email || args.mailbox)) {
    const account = await dao.getOauthMailAccountByEmail(db, args.email || args.mailbox)
    id = account?.id
  }
  if (!id) throw new Error("Missing id or email")

  const shareToken = await dao.regenerateOauthShareToken(db, id)
  if (!shareToken) throw new Error("OAuth account not found")
  return { success: true, id, share_token: shareToken }
}

async function handleProbeOauthAccount(db: any, args: any, encryptionKey?: string) {
  if (!isEncryptionKeyConfigured(encryptionKey)) {
    throw new Error("ENCRYPTION_KEY not configured")
  }
  if (args.all) {
    const accounts = await dao.listOauthMailAccounts(db)
    const probe = await probeStoredAccountsBatch(db, accounts, encryptionKey!, 3)
    return { success: true, ...probe }
  }
  const account = await resolveOauthAccountFromArgs(db, args)
  if (!account) throw new Error("OAuth account not found")
  const probe = await probeStoredAccount(db, account, encryptionKey!)
  const fresh = await dao.getOauthMailAccount(db, account.id)
  return {
    success: probe.ok,
    error: probe.error,
    account: fresh ? publicOauthAccount(fresh) : null,
  }
}

/**
 * 高级邮件搜索
 */
async function handleSearchEmails(db: any, args: any) {
  const {
    mailbox,
    from,
    subject,
    content,
    startTime,
    endTime,
    isRead,
    isStarred,
    limit = 50,
    offset = 0
  } = args

  // 获取邮件列表
  let emails = mailbox
    ? await dao.getEmailsByMailbox(db, mailbox, { limit: 1000 })
    : await dao.listAllEmails(db, { limit: 1000 })

  // 应用过滤条件
  let filtered = emails

  // 发件人过滤
  if (from) {
    const fromLower = from.toLowerCase()
    filtered = filtered.filter((email: any) =>
      email.fromAddress?.toLowerCase().includes(fromLower) ||
      email.fromName?.toLowerCase().includes(fromLower)
    )
  }

  // 主题过滤
  if (subject) {
    const subjectLower = subject.toLowerCase()
    filtered = filtered.filter((email: any) =>
      email.subject?.toLowerCase().includes(subjectLower)
    )
  }

  // 内容过滤
  if (content) {
    const contentLower = content.toLowerCase()
    filtered = filtered.filter((email: any) =>
      email.text?.toLowerCase().includes(contentLower) ||
      email.html?.toLowerCase().includes(contentLower)
    )
  }

  // 时间范围过滤
  if (startTime !== undefined) {
    filtered = filtered.filter((email: any) => email.createdAt >= startTime)
  }
  if (endTime !== undefined) {
    filtered = filtered.filter((email: any) => email.createdAt <= endTime)
  }

  // 已读状态过滤
  if (isRead !== undefined) {
    filtered = filtered.filter((email: any) => email.isRead === isRead)
  }

  // 星标状态过滤
  if (isStarred !== undefined) {
    filtered = filtered.filter((email: any) => email.isStarred === isStarred)
  }

  // 应用分页
  const total = filtered.length
  const paginatedEmails = filtered.slice(offset, offset + limit)

  return {
    emails: paginatedEmails,
    total,
    limit,
    offset,
    hasMore: offset + limit < total
  }
}

/**
 * 批量搜索验证码
 */
async function handleSearchVerificationCodes(db: any, args: any) {
  const { mailboxes, from, subject, seconds = 600 } = args

  if (!mailboxes || !Array.isArray(mailboxes) || mailboxes.length === 0) {
    throw new Error("mailboxes must be a non-empty array")
  }

  const sinceTimestamp = Math.floor(Date.now() / 1000) - seconds
  const results = []

  for (const mailbox of mailboxes) {
    try {
      // 获取该邮箱的邮件
      let emails = await dao.getEmailsByMailbox(db, mailbox, { limit: 20 })

      // 只看时间范围内的邮件
      emails = emails.filter((email: any) => email.createdAt >= sinceTimestamp)

      // 应用发件人过滤
      if (from) {
        const fromLower = from.toLowerCase()
        emails = emails.filter((email: any) =>
          email.fromAddress?.toLowerCase().includes(fromLower) ||
          email.fromName?.toLowerCase().includes(fromLower)
        )
      }

      // 应用主题过滤
      if (subject) {
        const subjectLower = subject.toLowerCase()
        emails = emails.filter((email: any) =>
          email.subject?.toLowerCase().includes(subjectLower)
        )
      }

      // 尝试提取验证码
      let code = null
      let matchedEmail = null

      for (const email of emails) {
        const extractedCode = extractVerificationCode(email.text, email.html)
          || extractVerificationCode(email.subject, null)
        if (extractedCode) {
          code = extractedCode
          matchedEmail = email
          break
        }
      }

      results.push({
        mailbox,
        code,
        email: matchedEmail ? {
          id: matchedEmail.id,
          subject: matchedEmail.subject,
          sender: matchedEmail.fromAddress,
          sender_name: matchedEmail.fromName,
          received_at: matchedEmail.createdAt
        } : null,
        total_emails_checked: emails.length
      })
    } catch (error: any) {
      results.push({
        mailbox,
        code: null,
        email: null,
        error: error.message
      })
    }
  }

  // 统计
  const successCount = results.filter(r => r.code).length
  const failureCount = results.filter(r => !r.code).length

  return {
    results,
    summary: {
      total: mailboxes.length,
      found: successCount,
      not_found: failureCount
    }
  }
}

// CORS预检请求支持
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  })
}
