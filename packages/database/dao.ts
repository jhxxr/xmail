import { drizzle, DrizzleD1Database } from "drizzle-orm/d1"
import { eq, desc, and, count, isNull, lt, isNotNull } from "drizzle-orm"
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

export async function listMailboxes(db: DB, options: { limit?: number; offset?: number; unassignedOnly?: boolean; userId?: string } = {}): Promise<schema.Mailbox[]> {
  const { limit = 50, offset = 0, unassignedOnly, userId } = options
  let query = db.select().from(schema.mailboxes).where(isNull(schema.mailboxes.deletedAt))
  if (unassignedOnly) query = query.where(isNull(schema.mailboxes.userId)) as typeof query
  if (userId) query = query.where(eq(schema.mailboxes.userId, userId)) as typeof query
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

export async function deleteEmail(db: DB, id: string): Promise<void> {
  await db.delete(schema.emails).where(eq(schema.emails.id, id))
}

export async function deleteOldEmails(db: DB, days: number): Promise<number> {
  const cutoff = now() - days * 24 * 60 * 60
  const result = await db.delete(schema.emails).where(lt(schema.emails.createdAt, cutoff))
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
export async function addServiceToMailbox(db: DB, mailboxAddress: string, templateId: string): Promise<schema.MailboxService> {
  const service: schema.InsertMailboxService = {
    id: nanoid(),
    mailboxAddress,
    templateId,
    createdAt: now(),
  }
  await db.insert(schema.mailboxServices).values(service)
  return service as schema.MailboxService
}

// 创建自定义服务（临时服务）
export async function addCustomServiceToMailbox(
  db: DB,
  mailboxAddress: string,
  data: { name: string; loginUrl: string; note?: string }
): Promise<schema.MailboxService> {
  const service: schema.InsertMailboxService = {
    id: nanoid(),
    mailboxAddress,
    templateId: null,
    customName: data.name,
    customLoginUrl: data.loginUrl,
    customNote: data.note,
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
      })
    }
  }
  return result
}

// 获取多个邮箱的服务
export async function getMailboxServicesMap(db: DB, mailboxAddresses: string[]) {
  if (mailboxAddresses.length === 0) return {}

  const result: Record<string, Awaited<ReturnType<typeof getMailboxServicesWithDetails>>> = {}
  for (const address of mailboxAddresses) {
    result[address] = await getMailboxServicesWithDetails(db, address)
  }
  return result
}

// 删除服务关联
export async function removeServiceFromMailbox(db: DB, serviceId: string): Promise<void> {
  await db.delete(schema.mailboxServices).where(eq(schema.mailboxServices.id, serviceId))
}
