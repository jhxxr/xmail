import type { APIRoute } from "astro"
import { createDB, getMailbox, getMailboxPlainPassword } from "database"
import { verifyToken } from "../../../../lib/auth"

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const db = createDB(locals.runtime.env.DB)
  const jwtSecret = locals.runtime.env.JWT_SECRET

  try {
    const body = await request.json()
    const { address } = body

    if (!address) {
      return new Response(JSON.stringify({ error: "Address required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    }

    // 验证用户Token
    const token = cookies.get("user_token")?.value
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      })
    }

    const payload = await verifyToken(token, jwtSecret)
    if (!payload || payload.type !== "user" || !payload.id) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      })
    }

    const userId = payload.id
    const mailbox = await getMailbox(db, address)

    // 检查权限
    if (!mailbox || mailbox.userId !== userId) {
      return new Response(JSON.stringify({ error: "Mailbox not found or access denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      })
    }

    // 获取密码
    const password = await getMailboxPlainPassword(db, address)

    return new Response(JSON.stringify({ password }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })

  } catch (error) {
    console.error("Password API error:", error)
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
}
