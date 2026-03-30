import { useEffect, useRef, useState } from "react"
import { Camera, Clipboard, ImageUp, QrCode, ScanLine, X } from "lucide-react"
import { parseTotpInput } from "../../lib/totp"

interface QrImportPanelProps {
  secretInputId: string
  nameInputId?: string
  issuerInputId?: string
  accountInputId?: string
  digitsInputId?: string
  periodInputId?: string
  algorithmInputId?: string
  onDecodedValue?: (rawValue: string) => void
  autoSubmitCheckboxId?: string
  submitButtonId?: string
}

type QrScannerModule = typeof import("qr-scanner")
type QrScannerCtor = QrScannerModule["default"]
type QrScannerInstance = InstanceType<QrScannerCtor>

let qrScannerModulePromise: Promise<QrScannerModule> | null = null

async function getQrScanner(): Promise<QrScannerCtor> {
  qrScannerModulePromise ??= import("qr-scanner")
  const module = await qrScannerModulePromise
  return module.default
}

function setFieldValue(fieldId: string | undefined, value: string | number | null | undefined) {
  if (!fieldId || value === undefined || value === null) return
  const field = document.getElementById(fieldId) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  if (!field) return
  field.value = String(value)
  field.dispatchEvent(new Event("input", { bubbles: true }))
  field.dispatchEvent(new Event("change", { bubbles: true }))
}

function applyDecodedValue(rawValue: string, props: QrImportPanelProps) {
  setFieldValue(props.secretInputId, rawValue)

  try {
    const parsed = parseTotpInput(rawValue)
    setFieldValue(props.nameInputId, parsed.name)
    setFieldValue(props.issuerInputId, parsed.issuer)
    setFieldValue(props.accountInputId, parsed.accountName)
    setFieldValue(props.digitsInputId, parsed.digits)
    setFieldValue(props.periodInputId, parsed.period)
    setFieldValue(props.algorithmInputId, parsed.algorithm)
  } catch {
    // 非 otpauth 时只回填密钥，不阻断流程
  }
}

function shouldAutoSubmit(props: QrImportPanelProps): boolean {
  if (!props.autoSubmitCheckboxId || !props.submitButtonId) return false
  const checkbox = document.getElementById(props.autoSubmitCheckboxId) as HTMLInputElement | null
  return Boolean(checkbox?.checked)
}

function triggerSubmit(props: QrImportPanelProps) {
  if (!shouldAutoSubmit(props)) return
  const button = document.getElementById(props.submitButtonId) as HTMLButtonElement | null
  button?.click()
}

function getScannerErrorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof DOMException) {
    if (cause.name === "NotAllowedError") {
      return "未获得摄像头权限，请允许浏览器访问摄像头后重试"
    }
    if (cause.name === "NotFoundError") {
      return "未检测到可用摄像头"
    }
    if (cause.name === "NotReadableError") {
      return "摄像头正被其他程序占用，请关闭后重试"
    }
  }

  const message =
    typeof cause === "string"
      ? cause.trim()
      : cause instanceof Error
        ? cause.message.trim()
        : ""

  if (!message) return fallback
  if (message === "No QR code found") {
    return "未识别到二维码，请换更清晰的图片再试"
  }

  return message
}

async function decodeImageFile(file: File): Promise<string> {
  const QrScanner = await getQrScanner()
  const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true })
  const rawValue = result.data.trim()
  if (!rawValue) {
    throw new Error("未识别到二维码，请换更清晰的图片再试")
  }
  return rawValue
}

export default function QrImportPanel(props: QrImportPanelProps) {
  const [result, setResult] = useState("")
  const [error, setError] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [hasCamera, setHasCamera] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scannerRef = useRef<QrScannerInstance | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const stopCamera = () => {
    const scanner = scannerRef.current
    scannerRef.current = null
    if (scanner) {
      scanner.stop()
      scanner.destroy()
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsScanning(false)
  }

  useEffect(() => {
    let disposed = false

    void (async () => {
      try {
        const QrScanner = await getQrScanner()
        const supported = await QrScanner.hasCamera()
        if (!disposed) {
          setHasCamera(supported)
        }
      } catch {
        if (!disposed) {
          setHasCamera(false)
        }
      }
    })()

    return () => {
      disposed = true
      stopCamera()
    }
  }, [])

  const handleDecodedValue = (rawValue: string) => {
    setResult(rawValue)
    setError("")
    applyDecodedValue(rawValue, props)
    props.onDecodedValue?.(rawValue)
    window.setTimeout(() => {
      triggerSubmit(props)
    }, 0)
  }

  const handleFile = async (file: File) => {
    setIsBusy(true)
    try {
      const rawValue = await decodeImageFile(file)
      handleDecodedValue(rawValue)
    } catch (cause) {
      setError(getScannerErrorMessage(cause, "二维码解析失败"))
    } finally {
      setIsBusy(false)
    }
  }

  const handlePaste = async () => {
    if (!navigator.clipboard?.read) {
      setError("当前浏览器不支持直接读取剪贴板，请聚焦面板后按 Ctrl+V，或改用图片上传")
      return
    }

    try {
      const items = await navigator.clipboard.read()
      const imageItem = items.find((item) => item.types.some((type) => type.startsWith("image/")))
      if (!imageItem) {
        throw new Error("剪贴板里没有图片，请先复制二维码截图")
      }

      const imageType = imageItem.types.find((type) => type.startsWith("image/"))
      if (!imageType) {
        throw new Error("剪贴板图片类型不支持")
      }

      const blob = await imageItem.getType(imageType)
      await handleFile(new File([blob], "clipboard-image", { type: imageType }))
    } catch (cause) {
      setError(getScannerErrorMessage(cause, "读取剪贴板失败，请改用图片上传"))
    }
  }

  const startCamera = async () => {
    if (!videoRef.current) return
    if (scannerRef.current) return

    setIsBusy(true)
    try {
      setError("")
      const QrScanner = await getQrScanner()
      const scanner = new QrScanner(
        videoRef.current,
        (scanResult) => {
          handleDecodedValue(scanResult.data)
          stopCamera()
        },
        {
          onDecodeError: () => {},
          preferredCamera: "environment",
          maxScansPerSecond: 12,
          returnDetailedScanResult: true,
        }
      )

      scanner.setInversionMode("both")
      scannerRef.current = scanner
      await scanner.start()
      setIsScanning(true)
    } catch (cause) {
      setError(getScannerErrorMessage(cause, "无法打开摄像头"))
      stopCamera()
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div
      tabIndex={0}
      onPaste={(event) => {
        const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"))
        const file =
          imageItem?.getAsFile() ??
          Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/")) ??
          null

        if (file) {
          event.preventDefault()
          void handleFile(file)
        }
      }}
      className="rounded-xl border bg-muted/20 p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
    >
      <div className="flex items-center gap-2">
        <QrCode className="h-4 w-4 text-primary" />
        <div>
          <div className="text-sm font-medium">二维码导入</div>
          <div className="text-xs text-muted-foreground">
            图片只在当前浏览器本地解析，不会上传到服务器；支持直接上传图片、点击读取剪贴板，或聚焦后按 Ctrl+V 粘贴截图
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          <ImageUp className="h-4 w-4" />
          选择二维码图片
        </button>
        <button
          type="button"
          onClick={() => void handlePaste()}
          disabled={isBusy}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          <Clipboard className="h-4 w-4" />
          读取剪贴板
        </button>
        {hasCamera && (
          <button
            type="button"
            onClick={() => void (isScanning ? stopCamera() : startCamera())}
            disabled={isBusy}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            {isScanning ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            {isScanning ? "停止扫码" : "摄像头扫码"}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void handleFile(file)
          }
          event.currentTarget.value = ""
        }}
      />

      {isScanning && (
        <div className="mt-4 overflow-hidden rounded-xl border bg-black">
          <video ref={videoRef} className="aspect-video w-full object-cover" playsInline muted />
          <div className="flex items-center justify-center gap-2 border-t bg-background px-3 py-2 text-xs text-muted-foreground">
            <ScanLine className="h-3.5 w-3.5" />
            将二维码放到画面中间，识别成功后会自动回填
          </div>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-lg border bg-background px-3 py-2">
          <div className="text-xs text-muted-foreground">最近识别结果</div>
          <div className="mt-1 break-all font-mono text-xs">{result}</div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}
