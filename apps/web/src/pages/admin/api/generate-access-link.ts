import type { APIRoute } from "astro"
import { verifyToken, generateMailboxAccessToken } from "../../../lib/auth"
import { createDB, getAdminById } from "database"

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const db = createDB(locals.runtime.env.DB)
  const jwtSecret = locals.runtime.env.JWT_SECRET

  // 验证管理员登录
  const token = cookies.get("admin_token")?.value
  if (!token) {
    return new Response(JSON.stringify({ error: "未授权" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    })
  }

  const payload = await verifyToken(token, jwtSecret)
  if (!payload || payload.type !== "admin") {
    return new Response(JSON.stringify({ error: "未授权" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    })
  }

  const admin = await getAdminById(db, payload.id)
  if (!admin) {
    return new Response(JSON.stringify({ error: "未授权" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    })
  }

  try {
    const { mailbox } = await request.json()

    if (!mailbox) {
      return new Response(JSON.stringify({ error: "邮箱地址不能为空" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    }

    // 生成快捷访问token（7天有效）
    const accessToken = await generateMailboxAccessToken(mailbox, jwtSecret, "7d")

    // 生成完整的访问链接
    const baseUrl = new URL(request.url).origin
    const accessLink = `${baseUrl}/?access_token=${accessToken}`

    return new Response(JSON.stringify({ accessLink }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  } catch (error: any) {
    console.error("生成访问链接失败:", error)
    return new Response(JSON.stringify({ error: error.message || "生成链接失败" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
}
