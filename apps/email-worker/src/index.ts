import PostalMime from "postal-mime"
import { drizzle } from "drizzle-orm/d1"
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { eq } from "drizzle-orm"

export interface Env {
  DB: D1Database
}

// 内联 nanoid
function nanoid(size = 21): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
  let id = ""
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  for (let i = 0; i < size; i++) {
    id += alphabet[bytes[i] % alphabet.length]
  }
  return id
}

// 内联 schema
const mailboxes = sqliteTable("mailboxes", {
  address: text("address").primaryKey(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  expiresAt: integer("expires_at"),
})

const emails = sqliteTable("emails", {
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
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  readAt: integer("read_at"),
  createdAt: integer("created_at").notNull(),
})

interface ForwardableEmailMessage {
  readonly from: string
  readonly to: string
  readonly raw: ReadableStream<Uint8Array>
  readonly rawSize: number
  readonly headers: Headers
  setReject(reason: string): void
  forward(rcptTo: string, headers?: Headers): Promise<void>
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    const db = drizzle(env.DB)

    try {
      const messageFrom = message.from
      const messageTo = message.to.toLowerCase()

      // 检查邮箱是否存在且激活
      const mailbox = await db
        .select()
        .from(mailboxes)
        .where(eq(mailboxes.address, messageTo))
        .get()

      if (!mailbox) {
        console.log(`Mailbox not found: ${messageTo}`)
        return
      }
      if (!mailbox.isActive) {
        console.log(`Mailbox is inactive: ${messageTo}`)
        return
      }

      // 检查是否过期
      if (mailbox.expiresAt && mailbox.expiresAt < Math.floor(Date.now() / 1000)) {
        console.log(`Mailbox expired: ${messageTo}`)
        return
      }

      // 解析邮件
      const rawText = await new Response(message.raw).text()
      const mail = await new PostalMime().parse(rawText)

      // 构建邮件记录
      const emailRecord = {
        id: nanoid(),
        mailboxAddress: messageTo,
        messageFrom,
        messageTo,
        fromAddress: mail.from?.address || messageFrom,
        fromName: mail.from?.name || null,
        subject: mail.subject || null,
        text: mail.text || null,
        html: mail.html || null,
        headers: mail.headers ? JSON.stringify(mail.headers) : null,
        messageId: mail.messageId || null,
        date: mail.date || null,
        isRead: false,
        createdAt: Math.floor(Date.now() / 1000),
      }

      await db.insert(emails).values(emailRecord)
      console.log(`Email saved: ${emailRecord.id} -> ${messageTo}`)
    } catch (error) {
      console.error("Failed to process email:", error)
    }
  },
}
