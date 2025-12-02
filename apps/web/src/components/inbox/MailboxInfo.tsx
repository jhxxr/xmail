import * as React from "react"
import { Copy, Eye, EyeOff, Check, Loader2, AlertCircle } from "lucide-react"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { cn } from "../../lib/utils"

interface MailboxInfoProps {
  address: string
  stats: { total: number; unread: number }
  className?: string
}

export function MailboxInfo({ address, stats, className }: MailboxInfoProps) {
  const [password, setPassword] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [copiedEmail, setCopiedEmail] = React.useState(false)
  const [copiedPass, setCopiedPass] = React.useState(false)
  const [showPass, setShowPass] = React.useState(false)

  const copyToClipboard = async (text: string, isEmail: boolean) => {
    try {
      await navigator.clipboard.writeText(text)
      if (isEmail) {
        setCopiedEmail(true)
        setTimeout(() => setCopiedEmail(false), 2000)
      } else {
        setCopiedPass(true)
        setTimeout(() => setCopiedPass(false), 2000)
      }
    } catch (err) {
      console.error("复制失败", err)
    }
  }

  const togglePassword = async () => {
    if (showPass) {
      setShowPass(false)
      return
    }

    if (password) {
      setShowPass(true)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/v1/mailbox/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "获取密码失败")
      }

      if (data.password) {
        setPassword(data.password)
        setShowPass(true)
      } else {
        setError("密码未设置或无法恢复")
      }
    } catch (err: any) {
      console.error("获取密码失败", err)
      setError(err.message || "获取密码失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* 邮箱地址卡片 */}
      <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            当前邮箱
          </span>
          <div className="flex gap-2">
            {stats.unread > 0 && (
              <Badge variant="default" className="animate-pulse">
                {stats.unread} 未读
              </Badge>
            )}
            <Badge variant="secondary">{stats.total} 封</Badge>
          </div>
        </div>

        <div className="group relative">
          <div className="text-sm sm:text-base font-bold truncate font-mono tracking-tight text-primary pr-10">
            {address}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => copyToClipboard(address, true)}
          >
            {copiedEmail ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            className="flex-1 bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
            variant="outline"
            onClick={() => copyToClipboard(address, true)}
          >
            {copiedEmail ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                已复制邮箱
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                复制邮箱
              </>
            )}
          </Button>

          <Button
            className="flex-1"
            variant="secondary"
            onClick={togglePassword}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载中
              </>
            ) : showPass ? (
              <>
                <EyeOff className="mr-2 h-4 w-4" />
                隐藏
              </>
            ) : (
              <>
                <Eye className="mr-2 h-4 w-4" />
                查看密码
              </>
            )}
          </Button>
        </div>

        {/* 密码显示区域 */}
        {showPass && password && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg border flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200">
            <code className="font-mono text-sm select-all flex-1 break-all pr-2">
              {password}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={() => copyToClipboard(password, false)}
            >
              {copiedPass ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="mt-3 p-3 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}
