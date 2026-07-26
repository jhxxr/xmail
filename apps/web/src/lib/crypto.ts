/**
 * AES-GCM secret encryption for OAuth refresh tokens and similar secrets.
 * Format: v1.<iv_base64url>.<ciphertext_base64url>
 *
 * ENCRYPTION_KEY may be any non-empty string (hex preferred). The raw key is
 * derived via SHA-256 so length/format is flexible.
 */

const VERSION = "v1"

function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// 每个 isolate 内 ENCRYPTION_KEY 不变，缓存派生结果。
// 批量导入时每个账号要加密 2 个字段，重复派生会白烧 Worker CPU。
const derivedKeyCache = new Map<string, Promise<CryptoKey>>()

async function deriveAesKey(encryptionKey: string): Promise<CryptoKey> {
  if (!encryptionKey || encryptionKey === "default-key-please-change") {
    throw new Error("ENCRYPTION_KEY is required for OAuth secrets")
  }
  const cached = derivedKeyCache.get(encryptionKey)
  if (cached) return cached

  const pending = (async () => {
    const material = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(encryptionKey)
    )
    return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ])
  })()

  derivedKeyCache.set(encryptionKey, pending)
  try {
    return await pending
  } catch (e) {
    derivedKeyCache.delete(encryptionKey)
    throw e
  }
}

export async function encryptSecret(plaintext: string, encryptionKey: string): Promise<string> {
  const key = await deriveAesKey(encryptionKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  )
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`
}

export async function decryptSecret(payload: string, encryptionKey: string): Promise<string> {
  const parts = payload.split(".")
  if (parts.length !== 3 || parts[0] !== VERSION) {
    throw new Error("Invalid encrypted secret format")
  }
  const [, ivB64, ctB64] = parts
  const key = await deriveAesKey(encryptionKey)
  const iv = fromBase64Url(ivB64)
  const ciphertext = fromBase64Url(ctB64)
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  )
  return new TextDecoder().decode(plainBuf)
}

export function isEncryptionKeyConfigured(encryptionKey: string | undefined | null): boolean {
  return Boolean(encryptionKey && encryptionKey !== "default-key-please-change")
}
