import { useEffect, useState } from "react"
import { Check, Copy, Pencil, TimerReset, Trash2 } from "lucide-react"
import { generateTotpCode, getTotpRemainingSeconds } from "../../lib/totp"
import { TwoFactorAssignmentManager } from "./TwoFactorAssignmentManager"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"

interface User {
  id: string
  name: string | null
  note: string | null
  token: string
}

interface AssignedUser {
  userId: string
  userName: string
}

interface TwoFactorTableEntry {
  id: string
  name: string
  issuer: string | null
  accountName: string | null
  secret: string
  digits: number
  period: number
  algorithm: string
  note: string | null
  updatedAtLabel: string
  assignedUsers: AssignedUser[]
}

interface AdminTwoFactorTableProps {
  entries: TwoFactorTableEntry[]
  allUsers: User[]
}

function isDefaultTotpConfig(entry: { digits: number; period: number; algorithm: string }): boolean {
  return entry.digits === 6 && entry.period === 30 && entry.algorithm === "SHA1"
}

export function AdminTwoFactorTable({ entries, allUsers }: AdminTwoFactorTableProps) {
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [remainingSeconds, setRemainingSeconds] = useState<Record<string, number>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const updateCodes = async () => {
      const now = Date.now()
      const nextRemaining = Object.fromEntries(
        entries.map((entry) => [entry.id, getTotpRemainingSeconds(entry.period, now)])
      )

      const values = await Promise.all(
        entries.map(async (entry) => {
          try {
            return [entry.id, await generateTotpCode(entry, now)] as const
          } catch (error) {
            console.error(`生成 ${entry.name} 的 TOTP 失败`, error)
            return [entry.id, "------"] as const
          }
        })
      )

      if (cancelled) return

      setCodes(Object.fromEntries(values))
      setRemainingSeconds(nextRemaining)
    }

    void updateCodes()
    const timer = window.setInterval(() => {
      void updateCodes()
    }, 1000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [entries])

  const handleCopy = async (id: string, value: string) => {
    if (!value || value === "------") return

    try {
      await navigator.clipboard.writeText(value)
      setCopiedId(id)
      window.setTimeout(() => {
        setCopiedId((current) => current === id ? null : current)
      }, 1500)
    } catch (error) {
      console.error("复制动态密码失败", error)
    }
  }

  return (
    <div className="relative w-full overflow-auto">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b">
          <tr className="border-b transition-colors hover:bg-muted/50">
            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">名称</th>
            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">识别结果</th>
            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">当前动态密码</th>
            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">分配</th>
            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">更新时间</th>
            <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">操作</th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {entries.length === 0 ? (
            <tr>
              <td colSpan={6} className="p-8 text-center text-muted-foreground">
                暂无 2FA 条目
              </td>
            </tr>
          ) : (
            entries.map((entry) => {
              const hasCustomConfig = !isDefaultTotpConfig(entry)
              const code = codes[entry.id] ?? "------"
              const remaining = remainingSeconds[entry.id] ?? entry.period
              const progress = Math.max(0, Math.min(100, remaining / entry.period * 100))
              const copied = copiedId === entry.id

              return (
                <tr key={entry.id} className="border-b transition-colors hover:bg-muted/50">
                  <td className="p-4 align-middle">
                    <div className="font-medium">{entry.name}</div>
                    {entry.note && <div className="mt-1 text-xs text-muted-foreground">{entry.note}</div>}
                  </td>
                  <td className="p-4 align-middle">
                    <div className="space-y-1">
                      <div>{entry.issuer || "未识别服务名"}</div>
                      <div className="font-mono text-xs text-muted-foreground">{entry.accountName || "未识别账号"}</div>
                      {hasCustomConfig && (
                        <div className="text-xs text-muted-foreground">
                          自定义参数：{entry.algorithm} / {entry.digits} 位 / {entry.period}s
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4 align-middle">
                    <div className="min-w-[240px] space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1 rounded-lg border bg-muted/40 px-3 py-2">
                          <div className="font-mono text-xl font-bold tracking-[0.3em] text-primary">
                            {code}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopy(entry.id, code)}
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
                            copied ? "border-green-600 bg-green-600 text-white" : "hover:bg-accent"
                          }`}
                          title="复制当前动态密码"
                        >
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <TimerReset className="h-3.5 w-3.5" />
                        <span>{remaining}s 后刷新</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="p-4 align-middle">
                    <div className="space-y-2">
                      <TwoFactorAssignmentManager
                        entryId={entry.id}
                        entryName={entry.name}
                        allUsers={allUsers}
                        assignedUsers={entry.assignedUsers}
                      />
                      {entry.assignedUsers.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {entry.assignedUsers.slice(0, 3).map((user) => (
                            <Badge key={user.userId} variant="outline" className="text-[10px]">
                              {user.userName}
                            </Badge>
                          ))}
                          {entry.assignedUsers.length > 3 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{entry.assignedUsers.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4 align-middle text-muted-foreground">{entry.updatedAtLabel}</td>
                  <td className="p-4 align-middle">
                    <div className="flex gap-2">
                      <a
                        href={`/admin/two-factor?action=edit&id=${entry.id}`}
                        title="编辑"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </a>
                      <form
                        method="POST"
                        className="inline"
                        onSubmit={(event) => {
                          if (!window.confirm("确定删除这个 2FA 条目吗？")) {
                            event.preventDefault()
                          }
                        }}
                      >
                        <input type="hidden" name="action" value="delete" />
                        <input type="hidden" name="id" value={entry.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
