import { useEffect, useMemo, useState } from "react"
import { Check, Copy, KeyRound, ShieldCheck } from "lucide-react"
import { generateTotpCode, getTotpRemainingSeconds, parseTotpInput } from "../../lib/totp"
import QrImportPanel from "./QrImportPanel"

export default function ManualTotpGenerator() {
  const [input, setInput] = useState("")
  const [code, setCode] = useState("------")
  const [remaining, setRemaining] = useState(30)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  const parsedResult = useMemo(() => {
    if (!input.trim()) {
      return { parsed: null, error: "" }
    }

    try {
      return { parsed: parseTotpInput(input), error: "" }
    } catch (cause: any) {
      return { parsed: null, error: cause?.message || "无法识别 2FA 密钥" }
    }
  }, [input])

  const parsed = parsedResult.parsed

  useEffect(() => {
    setError(parsedResult.error)
  }, [parsedResult.error])

  useEffect(() => {
    let cancelled = false

    const updateCode = async () => {
        if (!parsed) {
          if (!cancelled) {
            setCode("------")
            setRemaining(30)
            if (!input.trim()) {
              setError("")
            }
          }
          return
        }

      const now = Date.now()
      try {
        const nextCode = await generateTotpCode(parsed, now)
        if (!cancelled) {
          setCode(nextCode)
          setRemaining(getTotpRemainingSeconds(parsed.period, now))
        }
      } catch (cause: any) {
        if (!cancelled) {
          setError(cause?.message || "生成验证码失败")
          setCode("------")
        }
      }
    }

    void updateCode()
    const timer = window.setInterval(() => {
      void updateCode()
    }, 1000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [input, parsed])

  const handleCopy = async () => {
    if (!parsed) return

    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch (cause) {
      console.error("复制失败", cause)
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold">临时 2FA 生成器</h2>
          <p className="text-sm text-muted-foreground">支持 Base32 密钥和 `otpauth://` 链接</p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">2FA 密钥 / otpauth 链接</label>
          <textarea
            id="manual-totp-secret-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="输入 Base32 密钥，或直接粘贴 otpauth://totp/... 链接"
            className="min-h-[110px] w-full rounded-xl border bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
        </div>

        <QrImportPanel secretInputId="manual-totp-secret-input" onDecodedValue={setInput} />

        {parsed && (
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {parsed.issuer && <span>{parsed.issuer}</span>}
              {parsed.accountName && <span className="font-mono">{parsed.accountName}</span>}
              <span>{parsed.algorithm}</span>
              <span>{parsed.digits} 位</span>
              <span>{parsed.period}s</span>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1 rounded-xl border bg-background px-4 py-3">
                <div className="font-mono text-3xl font-bold tracking-[0.3em] text-primary">
                  {code}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border transition-colors ${
                  copied ? "border-green-600 bg-green-600 text-white" : "hover:bg-accent"
                }`}
                title="复制验证码"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <KeyRound className="h-3.5 w-3.5" />
                {parsed.name}
              </span>
              <span>{remaining}s 后刷新</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(0, Math.min(100, remaining / parsed.period * 100))}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
