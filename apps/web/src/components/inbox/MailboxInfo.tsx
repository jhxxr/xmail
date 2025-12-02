import * as React from "react"
import { Copy, Eye, EyeOff, Check, Loader2, AlertCircle, ChevronDown, Users, Mail } from "lucide-react"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { cn } from "../../lib/utils"

interface MailboxInfoProps {
  address: string
  stats: { total: number; unread: number }
  className?: string
  mailboxes?: any[]
}

export function MailboxInfo({ address, stats, className, mailboxes = [] }: MailboxInfoProps) {
  const [password, setPassword] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [copiedEmail, setCopiedEmail] = React.useState(false)
  const [copiedPass, setCopiedPass] = React.useState(false)
  const [showPass, setShowPass] = React.useState(false)
  const [showDropdown, setShowDropdown] = React.useState(false)

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

  const hasMultiple = mailboxes && mailboxes.length > 1

  return (
    <div className={cn("space-y-4", className)}>
      {/* 邮箱地址卡片 */}
      <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4 relative overflow-visible">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            {hasMultiple ? <Users className="h-3 w-3" /> : null}
            {hasMultiple ? "切换账号" : "当前邮箱"}
          </span>
          <div className="flex gap-2">
            {stats.unread > 0 && (
              <Badge variant="default" className="animate-pulse px-1.5 h-5 text-[10px]">
                {stats.unread}
              </Badge>
            )}
            <Badge variant="secondary" className="px-1.5 h-5 text-[10px]">{stats.total}</Badge>
          </div>
        </div>

        <div className="group relative py-1">
          {hasMultiple ? (
            <div className="relative">
              <button
                className="w-full flex items-center justify-between gap-2 rounded-md -ml-2 px-2 py-1 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setShowDropdown(!showDropdown)}
              >
                <div className="text-sm font-bold break-all font-mono tracking-tight text-primary leading-tight text-left">
                  {address}
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform",
                  showDropdown && "rotate-180"
                )} />
              </button>

              {/* 下拉菜单 */}
              {showDropdown && (
                <>
                  {/* 遮罩层 */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowDropdown(false)}
                  />

                  {/* 菜单内容 */}
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-background border rounded-lg shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    {mailboxes.map((m) => (
                      <button
                        key={m.address}
                        className={cn(
                          "w-full px-2.5 py-2 text-left text-xs font-mono hover:bg-muted/50 transition-colors flex items-center gap-1.5",
                          m.address === address && "bg-primary/10 text-primary font-semibold"
                        )}
                        onClick={() => {
                          if (m.address !== address) {
                            window.location.href = '/?mailbox=' + m.address
                          }
                          setShowDropdown(false)
                        }}
                      >
                        <Mail className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
                        <span className="flex-1 break-all leading-relaxed">{m.address}</span>
                        {m.address === address && (
                          <Check className="h-3.5 w-3.5 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-sm font-bold break-all font-mono tracking-tight text-primary leading-tight">
              {address}
            </div>
          )}
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
