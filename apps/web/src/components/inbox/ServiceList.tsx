import * as React from "react"
import { Globe, ChevronDown, ExternalLink } from "lucide-react"
import { cn } from "../../lib/utils"

interface Service {
  id: string
  name: string | null
  loginUrl: string | null
  note: string | null
}

interface ServiceListProps {
  services: Service[]
  isMobile?: boolean
}

export function ServiceList({ services, isMobile = false }: ServiceListProps) {
  const [isExpanded, setIsExpanded] = React.useState(false)

  if (services.length === 0) return null

  const formatUrl = (url: string | null) => {
    if (!url) return ""
    try {
      return new URL(url).hostname.replace(/^www\./, "")
    } catch {
      return "链接"
    }
  }

  if (isMobile) {
    // 移动端：折叠式列表
    return (
      <div className="space-y-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">关联服务</span>
            <span className="text-xs text-muted-foreground">({services.length}个)</span>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              isExpanded && "rotate-180"
            )}
          />
        </button>

        {isExpanded && (
          <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
            {services.map((s, i) => (
              <a
                key={i}
                href={s.loginUrl || "#"}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between p-3 rounded-lg border bg-background hover:border-primary/50 hover:bg-primary/5 transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors flex-shrink-0">
                    <Globe className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">
                      {s.name || "未命名服务"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.note || formatUrl(s.loginUrl)}
                    </div>
                  </div>
                </div>
                <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2" />
              </a>
            ))}
          </div>
        )}
      </div>
    )
  }

  // 桌面端：垂直列表（始终展开）
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          关联服务
        </h3>
        <span className="text-xs text-muted-foreground">({services.length})</span>
      </div>
      <div className="space-y-2">
        {services.map((s, i) => (
          <a
            key={i}
            href={s.loginUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center justify-between p-3 rounded-lg border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors flex-shrink-0">
                <Globe className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">
                  {s.name || "未命名服务"}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {formatUrl(s.loginUrl)}
                </div>
              </div>
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </a>
        ))}
      </div>
    </div>
  )
}
