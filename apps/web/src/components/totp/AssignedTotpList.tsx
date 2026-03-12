import { useEffect, useMemo, useState } from "react"
import { Check, Copy, TimerReset } from "lucide-react"
import { generateTotpCode, getTotpRemainingSeconds } from "../../lib/totp"

interface TotpEntry {
  id: string
  name: string
  issuer: string | null
  accountName: string | null
  secret: string
  digits: number
  period: number
  algorithm: string
  note: string | null
}

interface AssignedTotpListProps {
  entries: TotpEntry[]
}

export default function AssignedTotpList({ entries }: AssignedTotpListProps) {
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

      try {
        const values = await Promise.all(
          entries.map(async (entry) => [entry.id, await generateTotpCode(entry, now)] as const)
        )
        if (cancelled) return

        setCodes(Object.fromEntries(values))
        setRemainingSeconds(nextRemaining)
      } catch (error) {
        if (!cancelled) {
          console.error("生成 TOTP 失败", error)
        }
      }
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

  const progressMap = useMemo(() => {
    return Object.fromEntries(
      entries.map((entry) => {
        const remaining = remainingSeconds[entry.id] ?? entry.period
        return [entry.id, Math.max(0, Math.min(100, remaining / entry.period * 100))]
      })
    )
  }, [entries, remainingSeconds])

  const handleCopy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedId(id)
      window.setTimeout(() => {
        setCopiedId((current) => current === id ? null : current)
      }, 1500)
    } catch (error) {
      console.error("复制失败", error)
    }
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
        暂未分配 2FA，可先在上方临时输入密钥生成验证码。
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {entries.map((entry) => {
        const code = codes[entry.id] ?? "------"
        const remaining = remainingSeconds[entry.id] ?? entry.period
        const copied = copiedId === entry.id

        return (
          <div key={entry.id} className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold">{entry.name}</h3>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {entry.issuer && <span>{entry.issuer}</span>}
                  {entry.accountName && <span className="font-mono">{entry.accountName}</span>}
                  <span>{entry.algorithm}</span>
                  <span>{entry.digits} 位</span>
                </div>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                <TimerReset className="h-3.5 w-3.5" />
                {remaining}s
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <div className="flex-1 rounded-xl border bg-muted/40 px-4 py-3">
                <div className="font-mono text-3xl font-bold tracking-[0.3em] text-primary">
                  {code}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy(entry.id, code)}
                className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border transition-colors ${
                  copied ? "border-green-600 bg-green-600 text-white" : "hover:bg-accent"
                }`}
                title="复制验证码"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressMap[entry.id] ?? 0}%` }}
              />
            </div>

            {entry.note && (
              <p className="mt-3 text-sm text-muted-foreground">{entry.note}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
