/// <reference types="astro/client" />

type XMailEnv = {
  DB: D1Database
  JWT_SECRET: string
  ADMIN_PASSWORD: string
  MAIL_DOMAIN: string
  ENCRYPTION_KEY?: string
  MS_CLIENT_ID?: string
  MS_REDIRECT_URI?: string
}

declare namespace App {
  interface Locals {
    runtime: {
      env: XMailEnv
      cf: CfProperties
      ctx: ExecutionContext
    }
  }
}
