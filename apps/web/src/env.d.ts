/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    runtime: import("@astrojs/cloudflare").Runtime<{
      DB: D1Database
      JWT_SECRET: string
      ADMIN_PASSWORD: string // 管理员初始密码
      MAIL_DOMAIN: string // 邮箱域名
    }>
  }
}
