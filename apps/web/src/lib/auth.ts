import * as jose from "jose"

const ALGORITHM = "HS256"

function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

// 生成 JWT Token
export async function generateToken(
  payload: { type: "admin" | "user"; id: string; mailbox?: string },
  secret: string,
  expiresIn: string = "7d"
): Promise<string> {
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(encodeSecret(secret))
}

// 验证 JWT Token
export async function verifyToken(
  token: string,
  secret: string
): Promise<{ type: "admin" | "user"; id: string; mailbox?: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, encodeSecret(secret))
    return payload as { type: "admin" | "user"; id: string; mailbox?: string }
  } catch {
    return null
  }
}

// 生成管理员 Token
export async function generateAdminToken(adminId: string, secret: string): Promise<string> {
  return generateToken({ type: "admin", id: adminId }, secret, "24h")
}

// 生成用户 Token (基于 API Key)
export async function generateUserToken(
  apiKeyId: string,
  mailbox: string,
  secret: string
): Promise<string> {
  return generateToken({ type: "user", id: apiKeyId, mailbox }, secret, "30d")
}

// 生成邮箱快捷访问 Token (临时访问，7天有效)
export async function generateMailboxAccessToken(
  mailboxAddress: string,
  secret: string,
  expiresIn: string = "7d"
): Promise<string> {
  return generateToken({ type: "user", id: "quick_access", mailbox: mailboxAddress }, secret, expiresIn)
}
