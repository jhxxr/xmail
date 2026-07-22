import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core"

// 管理员表
export const admins = sqliteTable("admins", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  createdAt: integer("created_at").notNull(),
})

// 用户表 (token 持有者)
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(), // xmail_user_xxx
  name: text("name"), // 用户名称
  note: text("note"), // 备注
  createdAt: integer("created_at").notNull(),
  lastLoginAt: integer("last_login_at"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
})

// 邮箱表
export const mailboxes = sqliteTable("mailboxes", {
  address: text("address").primaryKey(),
  userId: text("user_id").references(() => users.id), // 分配给的用户 (null=未分配, 仅非共享邮箱使用)
  isShared: integer("is_shared", { mode: "boolean" }).notNull().default(false), // 是否为共享邮箱
  password: text("password"), // 可选密码哈希
  salt: text("salt"),
  plainPassword: text("plain_password"), // 加密后的原始密码（可解密）
  note: text("note"),
  createdBy: text("created_by").references(() => admins.id),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at"),
  lastLoginAt: integer("last_login_at"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  deletedAt: integer("deleted_at"), // 软删除时间戳
  deletedBy: text("deleted_by"), // 删除者（admin_id 或 user_id 或 "user"）
}, (t) => ({
  ownerIdx: index("idx_mailboxes_owner").on(t.userId, t.isShared, t.deletedAt),
  deletedIdx: index("idx_mailboxes_deleted_created").on(t.deletedAt, t.createdAt),
}))

// 用户与共享邮箱的分配关系表 (多对多)
export const userMailboxes = sqliteTable("user_mailboxes", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mailboxAddress: text("mailbox_address").notNull().references(() => mailboxes.address, { onDelete: "cascade" }),
  assignedAt: integer("assigned_at").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.mailboxAddress] }),
  mailboxIdx: index("idx_user_mailboxes_mailbox").on(t.mailboxAddress, t.userId),
}))

// 2FA 密钥条目
export const twoFactorEntries = sqliteTable("two_factor_entries", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  issuer: text("issuer"),
  accountName: text("account_name"),
  encryptedSecret: text("encrypted_secret").notNull(),
  digits: integer("digits").notNull().default(6),
  period: integer("period").notNull().default(30),
  algorithm: text("algorithm").notNull().default("SHA1"),
  note: text("note"),
  createdBy: text("created_by").references(() => admins.id),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

// 用户与 2FA 的分配关系表 (多对多)
export const userTwoFactorEntries = sqliteTable("user_two_factor_entries", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  twoFactorEntryId: text("two_factor_entry_id").notNull().references(() => twoFactorEntries.id, { onDelete: "cascade" }),
  assignedAt: integer("assigned_at").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.twoFactorEntryId] }),
}))

// 邮件表
export const emails = sqliteTable("emails", {
  id: text("id").primaryKey(),
  mailboxAddress: text("mailbox_address").notNull(),
  messageFrom: text("message_from").notNull(),
  messageTo: text("message_to").notNull(),
  fromAddress: text("from_address").notNull(),
  fromName: text("from_name"),
  subject: text("subject"),
  text: text("text"),
  html: text("html"),
  headers: text("headers"),
  messageId: text("message_id"),
  date: text("date"),
  isStarred: integer("is_starred", { mode: "boolean" }).notNull().default(false),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  readAt: integer("read_at"),
  createdAt: integer("created_at").notNull(),
}, (t) => ({
  mailboxCreatedIdx: index("idx_emails_mailbox_created").on(t.mailboxAddress, t.createdAt),
  starredCreatedIdx: index("idx_emails_starred_created").on(t.isStarred, t.createdAt),
  createdIdx: index("idx_emails_created").on(t.createdAt),
}))

// 操作日志表
export const logs = sqliteTable("logs", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").references(() => admins.id),
  action: text("action").notNull(),
  target: text("target"),
  details: text("details"),
  ip: text("ip"),
  createdAt: integer("created_at").notNull(),
}, (t) => ({
  createdIdx: index("idx_logs_created").on(t.createdAt),
}))

// 系统设置表
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

// 全局服务模板表
export const serviceTemplates = sqliteTable("service_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),           // 服务名称
  loginUrl: text("login_url").notNull(),  // 登录链接
  note: text("note"),                     // 备注
  createdAt: integer("created_at").notNull(),
})

// 邮箱服务关联表
export const mailboxServices = sqliteTable("mailbox_services", {
  id: text("id").primaryKey(),
  mailboxAddress: text("mailbox_address").notNull().references(() => mailboxes.address, { onDelete: "cascade" }),

  // 方式1: 引用全局服务模板
  templateId: text("template_id").references(() => serviceTemplates.id, { onDelete: "cascade" }),

  // 方式2: 临时自定义服务 (templateId 为 null 时使用)
  customName: text("custom_name"),
  customLoginUrl: text("custom_login_url"),
  customNote: text("custom_note"),

  expiresAt: integer("expires_at"), // 服务到期时间（Unix 时间戳）

  createdAt: integer("created_at").notNull(),
}, (t) => ({
  mailboxIdx: index("idx_mailbox_services_mailbox").on(t.mailboxAddress),
}))

// 第三方邮箱提供商表 (如 Gmail, Outlook)
export const externalProviders = sqliteTable("external_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  loginUrl: text("login_url").notNull(),
  icon: text("icon"),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
})

// 第三方邮箱账号表
export const externalAccounts = sqliteTable("external_accounts", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull().references(() => externalProviders.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  linkedMailboxAddress: text("linked_mailbox_address").references(() => mailboxes.address, { onDelete: "set null" }),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => ({
  providerIdx: index("idx_external_accounts_provider").on(t.providerId),
}))

// 用户与第三方账号的分配关系表 (多对多)
export const userExternalAccounts = sqliteTable("user_external_accounts", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().references(() => externalAccounts.id, { onDelete: "cascade" }),
  assignedAt: integer("assigned_at").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.accountId] }),
  accountIdx: index("idx_user_external_accounts_account").on(t.accountId, t.userId),
}))

// 第三方账号服务关联表（类似 mailboxServices）
export const externalAccountServices = sqliteTable("external_account_services", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => externalAccounts.id, { onDelete: "cascade" }),

  // 方式1: 引用全局服务模板
  templateId: text("template_id").references(() => serviceTemplates.id, { onDelete: "cascade" }),

  // 方式2: 临时自定义服务 (templateId 为 null 时使用)
  customName: text("custom_name"),
  customLoginUrl: text("custom_login_url"),
  customNote: text("custom_note"),

  createdAt: integer("created_at").notNull(),
}, (t) => ({
  accountIdx: index("idx_external_account_services_account").on(t.accountId),
}))

// API 密钥表
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull().unique(),
  keyHash: text("key_hash").notNull(),
  salt: text("salt").notNull(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
  revokedAt: integer("revoked_at"),
})

// 类型导出
export type Admin = typeof admins.$inferSelect
export type InsertAdmin = typeof admins.$inferInsert
export type User = typeof users.$inferSelect
export type InsertUser = typeof users.$inferInsert
export type Mailbox = typeof mailboxes.$inferSelect
export type InsertMailbox = typeof mailboxes.$inferInsert
export type UserMailbox = typeof userMailboxes.$inferSelect
export type InsertUserMailbox = typeof userMailboxes.$inferInsert
export type TwoFactorEntry = typeof twoFactorEntries.$inferSelect
export type InsertTwoFactorEntry = typeof twoFactorEntries.$inferInsert
export type UserTwoFactorEntry = typeof userTwoFactorEntries.$inferSelect
export type InsertUserTwoFactorEntry = typeof userTwoFactorEntries.$inferInsert
export type Email = typeof emails.$inferSelect
export type InsertEmail = typeof emails.$inferInsert
export type Log = typeof logs.$inferSelect
export type InsertLog = typeof logs.$inferInsert
export type ServiceTemplate = typeof serviceTemplates.$inferSelect
export type InsertServiceTemplate = typeof serviceTemplates.$inferInsert
export type MailboxService = typeof mailboxServices.$inferSelect
export type InsertMailboxService = typeof mailboxServices.$inferInsert
export type ExternalProvider = typeof externalProviders.$inferSelect
export type InsertExternalProvider = typeof externalProviders.$inferInsert
export type ExternalAccount = typeof externalAccounts.$inferSelect
export type InsertExternalAccount = typeof externalAccounts.$inferInsert
export type UserExternalAccount = typeof userExternalAccounts.$inferSelect
export type InsertUserExternalAccount = typeof userExternalAccounts.$inferInsert
export type ExternalAccountService = typeof externalAccountServices.$inferSelect
export type InsertExternalAccountService = typeof externalAccountServices.$inferInsert
export type ApiKey = typeof apiKeys.$inferSelect
export type InsertApiKey = typeof apiKeys.$inferInsert
