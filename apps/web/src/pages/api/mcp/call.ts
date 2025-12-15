import type { APIRoute } from "astro"
import { createDB } from "database"
import * as dao from "database/dao"
import { authenticateApiKey, unauthorizedResponse } from "../../../lib/api-auth"
import { extractVerificationCode } from "../../../lib/utils"

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

  try {
    const body = await context.request.json()
    const { tool, arguments: args } = body

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
        result = await handleGetVerificationCode(db, args)
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
        result = await dao.getEmailsByMailbox(db, args.mailbox, {
          limit: args.limit,
          offset: args.offset
        })
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
 * 改进：始终返回完整邮件内容，方便AI进行二次分析
 */
async function handleGetVerificationCode(db: any, args: any) {
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

    if (code) {
      // 找到验证码：返回提取的验证码 + 完整邮件内容
      return {
        success: true,
        code,
        confidence: 'high',
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

  // 未找到验证码：返回最新邮件的完整内容
  const latestEmail = emails[0]

  if (!latestEmail) {
    return {
      success: false,
      code: null,
      message: "No emails found in the specified time range",
      email: null
    }
  }

  return {
    success: false,
    code: null,
    confidence: 'none',
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
