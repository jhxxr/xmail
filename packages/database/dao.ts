import { drizzle, DrizzleD1Database } from "drizzle-orm/d1"
import { eq, desc, and, count, isNull, lt, isNotNull, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import * as schema from "./schema"

export type DB = DrizzleD1Database<typeof schema>

export function createDB(d1: D1Database): DB {
  return drizzle(d1, { schema })
}

// ============ 工具函数 ============

function now(): number {
  return Math.floor(Date.now() / 1000)
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(password + salt)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

function generateSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
}

function generateToken(): string {
  return `xmail_${nanoid(32)}`
}

function generatePassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => chars[b % chars.length]).join("")
}

// 简单的密码加密/解密（使用 Base64 + XOR）
// 注意：这不是强加密，仅用于混淆存储
function encryptPassword(password: string): string {
  // 使用 Base64 编码
  const encoded = btoa(password)
  // 简单的 XOR 混淆（使用固定密钥）
  const key = "xmail_secret_key_2024"
  let result = ""
  for (let i = 0; i < encoded.length; i++) {
    result += String.fromCharCode(encoded.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  }
  return btoa(result)
}

function decryptPassword(encrypted: string): string {
  try {
    const decoded = atob(encrypted)
    const key = "xmail_secret_key_2024"
    let result = ""
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length))
    }
    return atob(result)
  } catch {
    return ""
  }
}

async function createPasswordRecord(password: string): Promise<{ passwordHash: string; salt: string; plainPassword: string }> {
  const salt = generateSalt()
  const passwordHash = await hashPassword(password, salt)
  const plainPassword = encryptPassword(password)
  return { passwordHash, salt, plainPassword }
}

// ============ 管理员操作 ============

export async function createAdmin(db: DB, username: string, password: string): Promise<schema.Admin> {
  const salt = generateSalt()
  const admin: schema.InsertAdmin = {
    id: nanoid(),
    username,
    passwordHash: await hashPassword(password, salt),
    salt,
    createdAt: now(),
  }
  await db.insert(schema.admins).values(admin)
  return admin as schema.Admin
}

export async function verifyAdmin(db: DB, username: string, password: string): Promise<schema.Admin | null> {
  const admin = await db.select().from(schema.admins).where(eq(schema.admins.username, username)).get()
  if (!admin) return null
  const hash = await hashPassword(password, admin.salt)
  return hash === admin.passwordHash ? admin : null
}

export async function getAdminById(db: DB, id: string): Promise<schema.Admin | null> {
  return db.select().from(schema.admins).where(eq(schema.admins.id, id)).get() ?? null
}

// ============ 用户操作 ============

export async function createUser(db: DB, options: { name?: string; note?: string } = {}): Promise<schema.User> {
  const user: schema.InsertUser = {
    id: nanoid(),
    token: generateToken(),
    name: options.name,
    note: options.note,
    createdAt: now(),
    isActive: true,
  }
  await db.insert(schema.users).values(user)
  return user as schema.User
}

export async function getUserByToken(db: DB, token: string): Promise<schema.User | null> {
  return db.select().from(schema.users).where(and(eq(schema.users.token, token), eq(schema.users.isActive, true))).get() ?? null
}

export async function getUserById(db: DB, id: string): Promise<schema.User | null> {
  return db.select().from(schema.users).where(eq(schema.users.id, id)).get() ?? null
}

export async function listUsers(db: DB, options: { limit?: number; offset?: number } = {}): Promise<schema.User[]> {
  const { limit = 50, offset = 0 } = options
  return db.select().from(schema.users).orderBy(desc(schema.users.createdAt)).limit(limit).offset(offset).all()
}

export async function updateUser(db: DB, id: string, data: { name?: string; note?: string; isActive?: boolean }): Promise<void> {
  await db.update(schema.users).set(data).where(eq(schema.users.id, id))
}

export async function updateUserLastLogin(db: DB, id: string): Promise<void> {
  await db.update(schema.users).set({ lastLoginAt: now() }).where(eq(schema.users.id, id))
}

export async function deleteUser(db: DB, id: string): Promise<void> {
  await db.update(schema.mailboxes).set({ userId: null }).where(eq(schema.mailboxes.userId, id))
  await db.delete(schema.users).where(eq(schema.users.id, id))
}

export async function countUsers(db: DB): Promise<number> {
  const result = await db.select({ count: count() }).from(schema.users).get()
  return result?.count ?? 0
}

// ============ 邮箱操作 ============

export async function createMailbox(db: DB, address: string, options: { note?: string; createdBy?: string } = {}): Promise<{ mailbox: schema.Mailbox; password: string }> {
  const password = generatePassword()
  const { passwordHash, salt, plainPassword } = await createPasswordRecord(password)
  const mailbox: schema.InsertMailbox = {
    address,
    note: options.note,
    createdBy: options.createdBy,
    createdAt: now(),
    isActive: true,
    password: passwordHash,
    salt,
    plainPassword,
  }
  await db.insert(schema.mailboxes).values(mailbox)
  return { mailbox: mailbox as schema.Mailbox, password }
}

export async function createMailboxBatch(db: DB, addresses: string[], createdBy?: string): Promise<Array<{ address: string; password: string }>> {
  const credentials: Array<{ address: string; password: string }> = []
  const mailboxes: schema.InsertMailbox[] = await Promise.all(
    addresses.map(async (address) => {
      const password = generatePassword()
      credentials.push({ address, password })
      const { passwordHash, salt, plainPassword } = await createPasswordRecord(password)
      return {
        address,
        createdBy,
        createdAt: now(),
        isActive: true,
        password: passwordHash,
        salt,
        plainPassword,
      }
    })
  )
  await db.insert(schema.mailboxes).values(mailboxes)
  return credentials
}

export async function getMailbox(db: DB, address: string): Promise<schema.Mailbox | null> {
  return db.select().from(schema.mailboxes).where(eq(schema.mailboxes.address, address)).get() ?? null
}

export async function listMailboxes(db: DB, options: { limit?: number; offset?: number; unassignedOnly?: boolean; userId?: string; sharedOnly?: boolean } = {}): Promise<schema.Mailbox[]> {
  const { limit = 50, offset = 0, unassignedOnly, userId, sharedOnly } = options

  // 共享邮箱单独查询
  if (sharedOnly) {
    return db.select().from(schema.mailboxes)
      .where(and(
        isNull(schema.mailboxes.deletedAt),
        eq(schema.mailboxes.isShared, true)
      ))
      .orderBy(desc(schema.mailboxes.createdAt))
      .limit(limit).offset(offset).all()
  }

  let query = db.select().from(schema.mailboxes).where(isNull(schema.mailboxes.deletedAt))

  if (unassignedOnly) {
    // 未分配：非共享且没有 userId，或共享但没有任何用户
    query = query.where(and(
      isNull(schema.mailboxes.userId),
      eq(schema.mailboxes.isShared, false)
    )) as typeof query
  }

  if (userId) {
    // 非共享邮箱：直接匹配 userId
    query = query.where(and(
      eq(schema.mailboxes.userId, userId),
      eq(schema.mailboxes.isShared, false)
    )) as typeof query
  }

  return query.orderBy(desc(schema.mailboxes.createdAt)).limit(limit).offset(offset).all() as Array<schema.Mailbox & { plainPassword: string | null }>
}

export async function assignMailboxToUser(db: DB, address: string, userId: string | null): Promise<void> {
  await db.update(schema.mailboxes).set({ userId }).where(eq(schema.mailboxes.address, address))
}

export async function assignMailboxesToUser(db: DB, addresses: string[], userId: string): Promise<void> {
  for (const address of addresses) {
    await db.update(schema.mailboxes).set({ userId }).where(eq(schema.mailboxes.address, address))
  }
}

// ============ 共享邮箱操作 ============

export async function setMailboxShared(db: DB, address: string, isShared: boolean): Promise<void> {
  const mailbox = await getMailbox(db, address)
  if (!mailbox) return

  if (isShared && !mailbox.isShared) {
    // 从非共享转为共享：将当前 userId 迁移到 userMailboxes
    if (mailbox.userId) {
      await db.insert(schema.userMailboxes).values({
        userId: mailbox.userId,
        mailboxAddress: address,
        assignedAt: now(),
      }).onConflictDoNothing()
    }
    await db.update(schema.mailboxes).set({ isShared: true, userId: null }).where(eq(schema.mailboxes.address, address))
  } else if (!isShared && mailbox.isShared) {
    // 从共享转为非共享：选择第一个用户作为所有者
    const users = await db.select().from(schema.userMailboxes).where(eq(schema.userMailboxes.mailboxAddress, address)).all()
    const firstUserId = users.length > 0 ? users[0].userId : null
    await db.delete(schema.userMailboxes).where(eq(schema.userMailboxes.mailboxAddress, address))
    await db.update(schema.mailboxes).set({ isShared: false, userId: firstUserId }).where(eq(schema.mailboxes.address, address))
  }
}

export async function assignSharedMailboxToUsers(db: DB, address: string, userIds: string[]): Promise<void> {
  // 删除现有分配
  await db.delete(schema.userMailboxes).where(eq(schema.userMailboxes.mailboxAddress, address))
  // 插入新分配
  if (userIds.length > 0) {
    await db.insert(schema.userMailboxes).values(
      userIds.map(userId => ({
        userId,
        mailboxAddress: address,
        assignedAt: now(),
      }))
    )
  }
}

export async function addUserToSharedMailbox(db: DB, address: string, userId: string): Promise<void> {
  await db.insert(schema.userMailboxes).values({
    userId,
    mailboxAddress: address,
    assignedAt: now(),
  }).onConflictDoNothing()
}

export async function removeUserFromSharedMailbox(db: DB, address: string, userId: string): Promise<void> {
  await db.delete(schema.userMailboxes).where(
    and(
      eq(schema.userMailboxes.mailboxAddress, address),
      eq(schema.userMailboxes.userId, userId)
    )
  )
}

export async function getSharedMailboxUsers(db: DB, address: string): Promise<Array<{ userId: string; assignedAt: number }>> {
  return db.select().from(schema.userMailboxes).where(eq(schema.userMailboxes.mailboxAddress, address)).all()
}

export async function listSharedMailboxes(db: DB, userId: string): Promise<schema.Mailbox[]> {
  const assignments = await db.select().from(schema.userMailboxes).where(eq(schema.userMailboxes.userId, userId)).all()
  if (assignments.length === 0) return []

  const addresses = assignments.map(a => a.mailboxAddress)
  return db.select().from(schema.mailboxes)
    .where(and(
      inArray(schema.mailboxes.address, addresses),
      isNull(schema.mailboxes.deletedAt)
    ))
    .orderBy(desc(schema.mailboxes.createdAt))
    .all()
}

export async function setMailboxPassword(db: DB, address: string, password: string): Promise<string> {
  const { passwordHash, salt, plainPassword } = await createPasswordRecord(password)
  await db.update(schema.mailboxes).set({ password: passwordHash, salt, plainPassword }).where(eq(schema.mailboxes.address, address))
  return password
}

export async function verifyMailboxPassword(db: DB, address: string, password: string): Promise<boolean> {
  const mailbox = await getMailbox(db, address)
  if (!mailbox?.password || !mailbox.salt) return false
  const hash = await hashPassword(password, mailbox.salt)
  return hash === mailbox.password
}

export async function getMailboxPlainPassword(db: DB, address: string): Promise<string | null> {
  const mailbox = await getMailbox(db, address)
  if (!mailbox?.plainPassword) return null
  return decryptPassword(mailbox.plainPassword)
}

/**
 * Check if a user has access to a mailbox (either as owner or through shared access)
 */
export async function checkUserHasAccessToMailbox(db: DB, userId: string, address: string): Promise<boolean> {
  const mailbox = await getMailbox(db, address)
  if (!mailbox) return false

  // Check if user is the direct owner
  if (mailbox.userId === userId) return true

  // Check if mailbox is shared and user has access
  if (mailbox.isShared) {
    const sharedUsers = await db.select()
      .from(schema.userMailboxes)
      .where(and(
        eq(schema.userMailboxes.mailboxAddress, address),
        eq(schema.userMailboxes.userId, userId)
      ))
      .all()
    return sharedUsers.length > 0
  }

  return false
}

export async function updateMailboxLastLogin(db: DB, address: string): Promise<void> {
  await db.update(schema.mailboxes).set({ lastLoginAt: now() }).where(eq(schema.mailboxes.address, address))
}

export async function setMailboxActive(db: DB, address: string, isActive: boolean): Promise<void> {
  await db.update(schema.mailboxes).set({ isActive }).where(eq(schema.mailboxes.address, address))
}

export async function deleteMailbox(db: DB, address: string, deletedBy?: string): Promise<void> {
  // 软删除：设置 deletedAt 和 deletedBy
  await db.update(schema.mailboxes).set({ deletedAt: now(), deletedBy }).where(eq(schema.mailboxes.address, address))
}

export async function deleteMailboxPermanently(db: DB, address: string): Promise<void> {
  // 硬删除：永久删除邮箱和相关邮件
  await db.delete(schema.emails).where(eq(schema.emails.mailboxAddress, address))
  await db.delete(schema.mailboxes).where(eq(schema.mailboxes.address, address))
}

export async function deleteMailboxesBatch(db: DB, addresses: string[], deletedBy?: string): Promise<void> {
  // 批量软删除
  for (const address of addresses) {
    await db.update(schema.mailboxes).set({ deletedAt: now(), deletedBy }).where(eq(schema.mailboxes.address, address))
  }
}

export async function restoreMailbox(db: DB, address: string): Promise<void> {
  // 恢复邮箱
  await db.update(schema.mailboxes).set({ deletedAt: null, deletedBy: null }).where(eq(schema.mailboxes.address, address))
}

export async function listDeletedMailboxes(db: DB, options: { limit?: number; offset?: number } = {}): Promise<schema.Mailbox[]> {
  const { limit = 50, offset = 0 } = options
  return db.select().from(schema.mailboxes).where(isNotNull(schema.mailboxes.deletedAt)).orderBy(desc(schema.mailboxes.deletedAt)).limit(limit).offset(offset).all()
}

export async function countMailboxes(db: DB): Promise<number> {
  const result = await db.select({ count: count() }).from(schema.mailboxes).where(isNull(schema.mailboxes.deletedAt)).get()
  return result?.count ?? 0
}

export async function countUnassignedMailboxes(db: DB): Promise<number> {
  const result = await db.select({ count: count() }).from(schema.mailboxes).where(and(isNull(schema.mailboxes.userId), isNull(schema.mailboxes.deletedAt))).get()
  return result?.count ?? 0
}

export async function countDeletedMailboxes(db: DB): Promise<number> {
  const result = await db.select({ count: count() }).from(schema.mailboxes).where(isNotNull(schema.mailboxes.deletedAt)).get()
  return result?.count ?? 0
}

// ============ 邮件操作 ============

export async function insertEmail(db: DB, email: schema.InsertEmail): Promise<void> {
  await db.insert(schema.emails).values(email)
}

export async function getEmail(db: DB, id: string): Promise<schema.Email | null> {
  return db.select().from(schema.emails).where(eq(schema.emails.id, id)).get() ?? null
}

export async function getEmailsByMailbox(db: DB, mailboxAddress: string, options: { limit?: number; offset?: number } = {}): Promise<schema.Email[]> {
  const { limit = 50, offset = 0 } = options
  return db.select().from(schema.emails).where(eq(schema.emails.mailboxAddress, mailboxAddress)).orderBy(desc(schema.emails.createdAt)).limit(limit).offset(offset).all()
}

export async function listAllEmails(db: DB, options: { limit?: number; offset?: number } = {}): Promise<schema.Email[]> {
  const { limit = 50, offset = 0 } = options
  return db.select().from(schema.emails).orderBy(desc(schema.emails.createdAt)).limit(limit).offset(offset).all()
}

export async function markEmailAsRead(db: DB, id: string): Promise<void> {
  await db.update(schema.emails).set({ isRead: true, readAt: now() }).where(eq(schema.emails.id, id))
}

export async function toggleEmailStar(db: DB, emailId: string, isStarred: boolean): Promise<void> {
  await db.update(schema.emails).set({ isStarred }).where(eq(schema.emails.id, emailId))
}

export async function listStarredEmails(db: DB, mailboxAddress?: string): Promise<schema.Email[]> {
  const condition = mailboxAddress
    ? and(eq(schema.emails.isStarred, true), eq(schema.emails.mailboxAddress, mailboxAddress))
    : eq(schema.emails.isStarred, true)
  return db.select().from(schema.emails).where(condition).orderBy(desc(schema.emails.createdAt)).all()
}

export async function deleteEmail(db: DB, id: string): Promise<void> {
  await db.delete(schema.emails).where(eq(schema.emails.id, id))
}

export async function deleteOldEmails(db: DB, days: number): Promise<number> {
  const cutoff = now() - days * 24 * 60 * 60
  const result = await db.delete(schema.emails).where(and(lt(schema.emails.createdAt, cutoff), eq(schema.emails.isStarred, false)))
  return result.rowsAffected ?? 0
}

export async function countEmails(db: DB): Promise<number> {
  const result = await db.select({ count: count() }).from(schema.emails).get()
  return result?.count ?? 0
}

export async function getMailboxStats(db: DB, mailboxAddress: string): Promise<{ total: number; unread: number }> {
  const [total, unread] = await Promise.all([
    db.select({ count: count() }).from(schema.emails).where(eq(schema.emails.mailboxAddress, mailboxAddress)).get(),
    db.select({ count: count() }).from(schema.emails).where(and(eq(schema.emails.mailboxAddress, mailboxAddress), eq(schema.emails.isRead, false))).get(),
  ])
  return { total: total?.count ?? 0, unread: unread?.count ?? 0 }
}

// ============ 日志操作 ============

export async function createLog(db: DB, log: { adminId?: string; action: string; target?: string; details?: object; ip?: string }): Promise<void> {
  await db.insert(schema.logs).values({
    id: nanoid(),
    adminId: log.adminId,
    action: log.action,
    target: log.target,
    details: log.details ? JSON.stringify(log.details) : null,
    ip: log.ip,
    createdAt: now(),
  })
}

export async function getLogs(db: DB, options: { limit?: number; offset?: number } = {}): Promise<schema.Log[]> {
  const { limit = 100, offset = 0 } = options
  return db.select().from(schema.logs).orderBy(desc(schema.logs.createdAt)).limit(limit).offset(offset).all()
}

// ============ 设置操作 ============

export async function getSetting(db: DB, key: string): Promise<string | null> {
  const result = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()
  return result?.value ?? null
}

export async function setSetting(db: DB, key: string, value: string): Promise<void> {
  await db.insert(schema.settings).values({ key, value, updatedAt: now() }).onConflictDoUpdate({
    target: schema.settings.key,
    set: { value, updatedAt: now() },
  })
}

export async function getMailDomain(db: DB): Promise<string> {
  const defaultDomain = await getSetting(db, "default_mail_domain")
  if (defaultDomain) return defaultDomain
  const domains = await getSetting(db, "mail_domains")
  if (domains) {
    const list = domains.split(",").map((d) => d.trim()).filter(Boolean)
    return list[0] || "example.com"
  }
  return "example.com"
}

export async function getMailDomains(db: DB): Promise<string[]> {
  const domains = await getSetting(db, "mail_domains")
  if (!domains) return []
  return domains.split(",").map((d) => d.trim()).filter(Boolean)
}

// ============ 统计 ============

export async function getStats(db: DB): Promise<{
  totalUsers: number
  totalMailboxes: number
  unassignedMailboxes: number
  totalEmails: number
}> {
  const [users, mailboxes, unassigned, emails] = await Promise.all([
    db.select({ count: count() }).from(schema.users).get(),
    db.select({ count: count() }).from(schema.mailboxes).get(),
    db.select({ count: count() }).from(schema.mailboxes).where(isNull(schema.mailboxes.userId)).get(),
    db.select({ count: count() }).from(schema.emails).get(),
  ])
  return {
    totalUsers: users?.count ?? 0,
    totalMailboxes: mailboxes?.count ?? 0,
    unassignedMailboxes: unassigned?.count ?? 0,
    totalEmails: emails?.count ?? 0,
  }
}

// ============ 服务模板操作 ============

export async function createServiceTemplate(db: DB, data: { name: string; loginUrl: string; note?: string }): Promise<schema.ServiceTemplate> {
  const template: schema.InsertServiceTemplate = {
    id: nanoid(),
    name: data.name,
    loginUrl: data.loginUrl,
    note: data.note,
    createdAt: now(),
  }
  await db.insert(schema.serviceTemplates).values(template)
  return template as schema.ServiceTemplate
}

export async function listServiceTemplates(db: DB): Promise<schema.ServiceTemplate[]> {
  return db.select().from(schema.serviceTemplates).orderBy(desc(schema.serviceTemplates.createdAt)).all()
}

export async function getServiceTemplate(db: DB, id: string): Promise<schema.ServiceTemplate | null> {
  return db.select().from(schema.serviceTemplates).where(eq(schema.serviceTemplates.id, id)).get() ?? null
}

export async function updateServiceTemplate(db: DB, id: string, data: { name?: string; loginUrl?: string; note?: string }): Promise<void> {
  await db.update(schema.serviceTemplates).set(data).where(eq(schema.serviceTemplates.id, id))
}

export async function deleteServiceTemplate(db: DB, id: string): Promise<void> {
  await db.delete(schema.serviceTemplates).where(eq(schema.serviceTemplates.id, id))
}

// ============ 邮箱服务关联操作 ============

// 创建服务关联（引用全局模板）
export async function addServiceToMailbox(db: DB, mailboxAddress: string, templateId: string, expiresAt?: number | null): Promise<schema.MailboxService> {
  const service: schema.InsertMailboxService = {
    id: nanoid(),
    mailboxAddress,
    templateId,
    expiresAt: expiresAt ?? null,
    createdAt: now(),
  }
  await db.insert(schema.mailboxServices).values(service)
  return service as schema.MailboxService
}

// 创建自定义服务（临时服务）
export async function addCustomServiceToMailbox(
  db: DB,
  mailboxAddress: string,
  data: { name: string; loginUrl: string; note?: string; expiresAt?: number | null }
): Promise<schema.MailboxService> {
  const service: schema.InsertMailboxService = {
    id: nanoid(),
    mailboxAddress,
    templateId: null,
    customName: data.name,
    customLoginUrl: data.loginUrl,
    customNote: data.note,
    expiresAt: data.expiresAt ?? null,
    createdAt: now(),
  }
  await db.insert(schema.mailboxServices).values(service)
  return service as schema.MailboxService
}

// 获取邮箱的所有服务（包含完整信息）
export async function getMailboxServicesWithDetails(db: DB, mailboxAddress: string) {
  const services = await db.select().from(schema.mailboxServices).where(eq(schema.mailboxServices.mailboxAddress, mailboxAddress)).all()

  const result = []
  for (const service of services) {
    if (service.templateId) {
      // 引用全局模板的服务
      const template = await getServiceTemplate(db, service.templateId)
      if (template) {
        result.push({
          id: service.id,
          name: template.name,
          loginUrl: template.loginUrl,
          note: template.note,
          isCustom: false,
          templateId: template.id,
          expiresAt: service.expiresAt,
        })
      }
    } else {
      // 自定义临时服务
      result.push({
        id: service.id,
        name: service.customName || "",
        loginUrl: service.customLoginUrl || "",
        note: service.customNote,
        isCustom: true,
        templateId: null,
        expiresAt: service.expiresAt,
      })
    }
  }
  return result
}

// 获取多个邮箱的服务（优化版：批量查询）
export async function getMailboxServicesMap(db: DB, mailboxAddresses: string[]) {
  if (mailboxAddresses.length === 0) return {}

  // 1. 批量获取所有邮箱的服务关联
  const allServices = await db
    .select()
    .from(schema.mailboxServices)
    .where(inArray(schema.mailboxServices.mailboxAddress, mailboxAddresses))
    .all()

  // 2. 收集所有需要的 templateId
  const templateIds = allServices
    .filter((s) => s.templateId)
    .map((s) => s.templateId as string)
  const uniqueTemplateIds = [...new Set(templateIds)]

  // 3. 批量获取所有模板
  const templates =
    uniqueTemplateIds.length > 0
      ? await db
          .select()
          .from(schema.serviceTemplates)
          .where(inArray(schema.serviceTemplates.id, uniqueTemplateIds))
          .all()
      : []

  // 4. 构建模板映射
  const templateMap = new Map(templates.map((t) => [t.id, t]))

  // 5. 按邮箱地址分组并构建结果
  const result: Record<string, Array<{
    id: string
    name: string
    loginUrl: string
    note: string | null
    isCustom: boolean
    templateId: string | null
    expiresAt: number | null
  }>> = {}

  // 初始化所有邮箱的结果数组
  for (const address of mailboxAddresses) {
    result[address] = []
  }

  // 填充服务信息
  for (const service of allServices) {
    if (service.templateId) {
      const template = templateMap.get(service.templateId)
      if (template) {
        result[service.mailboxAddress].push({
          id: service.id,
          name: template.name,
          loginUrl: template.loginUrl,
          note: template.note,
          isCustom: false,
          templateId: template.id,
          expiresAt: service.expiresAt,
        })
      } else {
        // 模板已被删除，显示占位符
        result[service.mailboxAddress].push({
          id: service.id,
          name: "未知服务",
          loginUrl: "",
          note: "该服务模板已被删除",
          isCustom: false,
          templateId: service.templateId,
          expiresAt: service.expiresAt,
        })
      }
    } else {
      // 自定义服务
      result[service.mailboxAddress].push({
        id: service.id,
        name: service.customName || "未命名服务",
        loginUrl: service.customLoginUrl || "",
        note: service.customNote,
        isCustom: true,
        templateId: null,
        expiresAt: service.expiresAt,
      })
    }
  }

  return result
}

// 删除服务关联
export async function removeServiceFromMailbox(db: DB, serviceId: string): Promise<void> {
  await db.delete(schema.mailboxServices).where(eq(schema.mailboxServices.id, serviceId))
}

// 更新服务到期时间
export async function updateServiceExpiration(db: DB, serviceId: string, expiresAt: number | null): Promise<void> {
  await db.update(schema.mailboxServices).set({ expiresAt }).where(eq(schema.mailboxServices.id, serviceId))
}

// 批量绑定服务
export async function batchBindServicesToMailboxes(
  db: DB,
  mailboxAddresses: string[],
  templateIds: string[],
  customServices: Array<{ name: string; loginUrl: string; note?: string }>
): Promise<{
  successCount: number
  skippedCount: number
  details: Array<{ address: string; serviceName: string; status: 'success' | 'skipped' }>
}> {
  if (mailboxAddresses.length === 0) {
    return { successCount: 0, skippedCount: 0, details: [] }
  }

  // 获取所有邮箱现有的服务
  const servicesMap = await getMailboxServicesMap(db, mailboxAddresses)

  let successCount = 0
  let skippedCount = 0
  const details: Array<{ address: string; serviceName: string; status: 'success' | 'skipped' }> = []

  // 处理模板服务
  for (const templateId of templateIds) {
    const template = await getServiceTemplate(db, templateId)
    if (!template) continue

    for (const address of mailboxAddresses) {
      const existingServices = servicesMap[address] || []

      // 检查是否已经绑定了该模板服务
      const alreadyBound = existingServices.some(s => s.templateId === templateId)

      if (alreadyBound) {
        skippedCount++
        details.push({ address, serviceName: template.name, status: 'skipped' })
      } else {
        await addServiceToMailbox(db, address, templateId)
        successCount++
        details.push({ address, serviceName: template.name, status: 'success' })
      }
    }
  }

  // 处理自定义服务
  for (const customService of customServices) {
    for (const address of mailboxAddresses) {
      const existingServices = servicesMap[address] || []

      // 检查是否已经存在同名的自定义服务
      const alreadyBound = existingServices.some(
        s => s.isCustom && s.name === customService.name
      )

      if (alreadyBound) {
        skippedCount++
        details.push({ address, serviceName: customService.name, status: 'skipped' })
      } else {
        await addCustomServiceToMailbox(db, address, customService)
        successCount++
        details.push({ address, serviceName: customService.name, status: 'success' })
      }
    }
  }

  return { successCount, skippedCount, details }
}

// ==================== 第三方邮箱管理 ====================

// 创建第三方提供商
export async function createExternalProvider(db: DB, provider: schema.InsertExternalProvider) {
  await db.insert(schema.externalProviders).values(provider)
  return provider as schema.ExternalProvider
}

// 获取所有提供商
export async function listExternalProviders(db: DB) {
  return db.select().from(schema.externalProviders).orderBy(schema.externalProviders.name).all()
}

// 获取单个提供商
export async function getExternalProvider(db: DB, id: string) {
  return db.select().from(schema.externalProviders).where(eq(schema.externalProviders.id, id)).get()
}

// 更新提供商
export async function updateExternalProvider(db: DB, id: string, data: Partial<schema.ExternalProvider>) {
  await db.update(schema.externalProviders).set(data).where(eq(schema.externalProviders.id, id))
}

// 删除提供商
export async function deleteExternalProvider(db: DB, id: string) {
  await db.delete(schema.externalProviders).where(eq(schema.externalProviders.id, id))
}

// 创建第三方账号
export async function createExternalAccount(db: DB, account: schema.InsertExternalAccount) {
  await db.insert(schema.externalAccounts).values(account)
  return account as schema.ExternalAccount
}

// 获取提供商的所有账号
export async function listExternalAccounts(db: DB, providerId?: string) {
  if (providerId) {
    return db.select().from(schema.externalAccounts).where(eq(schema.externalAccounts.providerId, providerId)).all()
  }
  return db.select().from(schema.externalAccounts).all()
}

// 获取单个账号
export async function getExternalAccount(db: DB, id: string) {
  return db.select().from(schema.externalAccounts).where(eq(schema.externalAccounts.id, id)).get()
}

// 更新账号
export async function updateExternalAccount(db: DB, id: string, data: Partial<schema.ExternalAccount>) {
  await db.update(schema.externalAccounts).set({ ...data, updatedAt: now() }).where(eq(schema.externalAccounts.id, id))
}

// 删除账号
export async function deleteExternalAccount(db: DB, id: string) {
  await db.delete(schema.externalAccounts).where(eq(schema.externalAccounts.id, id))
}

// 分配账号给用户
export async function assignExternalAccountToUser(db: DB, userId: string, accountId: string) {
  await db.insert(schema.userExternalAccounts).values({ userId, accountId, assignedAt: now() })
}

// 取消分配
export async function unassignExternalAccountFromUser(db: DB, userId: string, accountId: string) {
  await db.delete(schema.userExternalAccounts).where(and(eq(schema.userExternalAccounts.userId, userId), eq(schema.userExternalAccounts.accountId, accountId)))
}

// 获取用户的所有第三方账号
export async function getUserExternalAccounts(db: DB, userId: string) {
  const assignments = await db.select().from(schema.userExternalAccounts).where(eq(schema.userExternalAccounts.userId, userId)).all()
  const accountIds = assignments.map(a => a.accountId)
  if (accountIds.length === 0) return []
  return db.select().from(schema.externalAccounts).where(inArray(schema.externalAccounts.id, accountIds)).all()
}

// 获取账号分配的用户列表
export async function getExternalAccountUsers(db: DB, accountId: string) {
  const assignments = await db.select().from(schema.userExternalAccounts).where(eq(schema.userExternalAccounts.accountId, accountId)).all()
  const userIds = assignments.map(a => a.userId)
  if (userIds.length === 0) return []
  return db.select().from(schema.users).where(inArray(schema.users.id, userIds)).all()
}

// ==================== 第三方账号服务绑定 ====================

// 为第三方账号添加服务
export async function addServiceToExternalAccount(db: DB, service: schema.InsertExternalAccountService) {
  await db.insert(schema.externalAccountServices).values(service)
  return service as schema.ExternalAccountService
}

// 获取第三方账号的所有服务（包含完整信息）
export async function getExternalAccountServicesWithDetails(db: DB, accountId: string) {
  const services = await db.select().from(schema.externalAccountServices).where(eq(schema.externalAccountServices.accountId, accountId)).all()

  const result = []
  for (const service of services) {
    if (service.templateId) {
      const template = await getServiceTemplate(db, service.templateId)
      if (template) {
        result.push({
          id: service.id,
          name: template.name,
          loginUrl: template.loginUrl,
          note: template.note,
          isCustom: false,
          templateId: template.id,
        })
      } else {
        result.push({
          id: service.id,
          name: "未知服务",
          loginUrl: "",
          note: "该服务模板已被删除",
          isCustom: false,
          templateId: service.templateId,
        })
      }
    } else {
      result.push({
        id: service.id,
        name: service.customName || "未命名服务",
        loginUrl: service.customLoginUrl || "",
        note: service.customNote,
        isCustom: true,
        templateId: null,
      })
    }
  }
  return result
}

// 获取多个第三方账号的服务（批量查询）
export async function getExternalAccountServicesMap(db: DB, accountIds: string[]) {
  if (accountIds.length === 0) return {}

  // 1. 批量获取所有账号���服务关联
  const allServices = await db
    .select()
    .from(schema.externalAccountServices)
    .where(inArray(schema.externalAccountServices.accountId, accountIds))
    .all()

  // 2. 收集所有需要的 templateId
  const templateIds = allServices
    .filter((s) => s.templateId)
    .map((s) => s.templateId as string)
  const uniqueTemplateIds = [...new Set(templateIds)]

  // 3. 批量获取所有模板
  const templates =
    uniqueTemplateIds.length > 0
      ? await db
          .select()
          .from(schema.serviceTemplates)
          .where(inArray(schema.serviceTemplates.id, uniqueTemplateIds))
          .all()
      : []

  // 4. 构建模板映射
  const templateMap = new Map(templates.map((t) => [t.id, t]))

  // 5. 按账号ID分组并构建结果
  const result: Record<string, Array<{
    id: string
    name: string
    loginUrl: string
    note: string | null
    isCustom: boolean
    templateId: string | null
  }>> = {}

  // 初始化所有账号的结果数组
  for (const id of accountIds) {
    result[id] = []
  }

  // 填充服务信息
  for (const service of allServices) {
    if (service.templateId) {
      const template = templateMap.get(service.templateId)
      if (template) {
        result[service.accountId].push({
          id: service.id,
          name: template.name,
          loginUrl: template.loginUrl,
          note: template.note,
          isCustom: false,
          templateId: template.id,
        })
      } else {
        // 模板已被删除，显示占位符
        result[service.accountId].push({
          id: service.id,
          name: "未知服务",
          loginUrl: "",
          note: "该服务模板已被删除",
          isCustom: false,
          templateId: service.templateId,
        })
      }
    } else {
      // 自定义服务
      result[service.accountId].push({
        id: service.id,
        name: service.customName || "未命名服务",
        loginUrl: service.customLoginUrl || "",
        note: service.customNote,
        isCustom: true,
        templateId: null,
      })
    }
  }

  return result
}

// 删除第三方账号的服务关联
export async function removeServiceFromExternalAccount(db: DB, serviceId: string): Promise<void> {
  await db.delete(schema.externalAccountServices).where(eq(schema.externalAccountServices.id, serviceId))
}

// ============ API Key 操作 ============

function generateApiKey(): { fullKey: string; prefix: string; secret: string } {
  const prefix = nanoid(8)
  const secret = nanoid(32)
  const fullKey = `sk_live_${prefix}.${secret}`
  return { fullKey, prefix, secret }
}

export async function createApiKey(db: DB, name: string): Promise<{ apiKey: schema.ApiKey; fullKey: string }> {
  const { fullKey, prefix, secret } = generateApiKey()
  const salt = generateSalt()
  const keyHash = await hashPassword(secret, salt)

  const apiKey: schema.InsertApiKey = {
    id: nanoid(),
    name,
    keyPrefix: prefix,
    keyHash,
    salt,
    createdAt: now(),
  }

  await db.insert(schema.apiKeys).values(apiKey)
  return { apiKey: apiKey as schema.ApiKey, fullKey }
}

export async function verifyApiKey(db: DB, fullKey: string): Promise<schema.ApiKey | null> {
  if (!fullKey.startsWith("sk_live_")) return null

  const parts = fullKey.replace("sk_live_", "").split(".")
  if (parts.length !== 2) return null

  const [prefix, secret] = parts
  const apiKey = await db.select().from(schema.apiKeys)
    .where(and(
      eq(schema.apiKeys.keyPrefix, prefix),
      isNull(schema.apiKeys.revokedAt)
    ))
    .get()

  if (!apiKey) return null

  const hash = await hashPassword(secret, apiKey.salt)
  if (hash !== apiKey.keyHash) return null

  await db.update(schema.apiKeys).set({ lastUsedAt: now() }).where(eq(schema.apiKeys.id, apiKey.id))
  return apiKey
}

export async function listApiKeys(db: DB): Promise<schema.ApiKey[]> {
  return db.select().from(schema.apiKeys).orderBy(desc(schema.apiKeys.createdAt)).all()
}

export async function revokeApiKey(db: DB, id: string): Promise<void> {
  await db.update(schema.apiKeys).set({ revokedAt: now() }).where(eq(schema.apiKeys.id, id))
}

export async function deleteApiKey(db: DB, id: string): Promise<void> {
  await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, id))
}
