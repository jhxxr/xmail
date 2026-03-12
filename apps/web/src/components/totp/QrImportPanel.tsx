import { useEffect, useMemo, useRef, useState } from "react"
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

type DetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => DetectorLike
  }
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

async function decodeFromImage(source: CanvasImageSource): Promise<string> {
  if (!window.BarcodeDetector) {
    throw new Error("当前浏览器不支持本地二维码识别，建议使用最新版 Chrome 或 Edge")
  }

  const detector = new window.BarcodeDetector({ formats: ["qr_code"] })
  const results = await detector.detect(source)
  const value = results.find((result) => result.rawValue?.trim())?.rawValue?.trim()
  if (!value) {
    throw new Error("未识别到二维码，请换更清晰的图片再试")
  }
  return value
}

function readImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error("图片读取失败"))
      image.src = String(reader.result)
    }
    reader.onerror = () => reject(new Error("图片读取失败"))
    reader.readAsDataURL(file)
  })
}

export default function QrImportPanel(props: QrImportPanelProps) {
  const [result, setResult] = useState("")
  const [error, setError] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [hasCamera, setHasCamera] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const barcodeSupported = useMemo(() => typeof window !== "undefined" && Boolean(window.BarcodeDetector), [])

  const stopCamera = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setIsScanning(false)
  }

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) return
    setHasCamera(true)
    return () => stopCamera()
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
      const image = await readImageFile(file)
      const rawValue = await decodeFromImage(image)
      handleDecodedValue(rawValue)
    } catch (cause: any) {
      setError(cause?.message || "二维码解析失败")
    } finally {
      setIsBusy(false)
    }
  }

  const handlePaste = async () => {
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
    } catch (cause: any) {
      setError(cause?.message || "读取剪贴板失败，请改用上传图片")
    }
  }

  const scanVideoFrame = async () => {
    if (!videoRef.current) return
    try {
      const rawValue = await decodeFromImage(videoRef.current)
      handleDecodedValue(rawValue)
      stopCamera()
      return
    } catch {
      rafRef.current = requestAnimationFrame(() => {
        void scanVideoFrame()
      })
    }
  }

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("当前浏览器不支持摄像头扫码")
      return
    }

    try {
      setError("")
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      })
      streamRef.current = stream
      setIsScanning(true)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      void scanVideoFrame()
    } catch (cause: any) {
      setError(cause?.message || "无法打开摄像头")
      stopCamera()
    }
  }

  return (
    <div
      tabIndex={0}
      onPaste={(event) => {
        const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"))
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
          <div className="text-xs text-muted-foreground">图片只在当前浏览器本地解析，不会上传到服务器；支持 Ctrl+V 粘贴截图</div>
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
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent"
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

      {!barcodeSupported && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          当前浏览器不支持本地二维码解析，建议使用最新版 Chrome / Edge。
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
