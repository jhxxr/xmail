import * as jose from "jose"

const ALGORITHM = "HS256"

export type AuthTokenType = "admin" | "user" | "oauth_account" | "address"

export type AuthTokenPayload = {
  type: AuthTokenType
  id: string
  mailbox?: string
  /** CF temp-email compatibility: full mailbox address */
  address?: string
  address_id?: string
}

function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

// 生成 JWT Token
export async function generateToken(
  payload: AuthTokenPayload,
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
): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, encodeSecret(secret))
    return payload as AuthTokenPayload
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

// OAuth 收信账号会话（分享令牌登录后签发，30 天）
export async function generateOauthAccountToken(
  accountId: string,
  secret: string,
  expiresIn: string = "30d"
): Promise<string> {
  return generateToken({ type: "oauth_account", id: accountId }, secret, expiresIn)
}

/**
 * CF temp-email compatible address JWT.
 * Payload includes both our type and their { address, address_id } claims.
 */
export async function generateAddressToken(
  mailboxAddress: string,
  secret: string,
  expiresIn: string = "10y"
): Promise<string> {
  const address = mailboxAddress.toLowerCase()
  return generateToken(
    {
      type: "address",
      id: address,
      address,
      mailbox: address,
      address_id: address,
    },
    secret,
    expiresIn
  )
}

export async function verifyAddressToken(
  token: string,
  secret: string
): Promise<{ address: string; address_id: string } | null> {
  const payload = await verifyToken(token, secret)
  if (!payload) return null
  const address = (payload.address || payload.mailbox || "").toLowerCase()
  if (!address) return null
  if (payload.type === "admin" || payload.type === "oauth_account") return null
  if (payload.type === "user" && payload.id !== "quick_access" && !payload.mailbox) return null
  return {
    address,
    address_id: String(payload.address_id || address),
  }
}
