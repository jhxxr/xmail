import * as React from "react"
import { useState } from "react"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog"
import { Input } from "../ui/input"
import { Plus, X, Loader2 } from "lucide-react"
import { cn } from "../../lib/utils"

export interface Service {
  id: string
  templateId: string | null
  isCustom: boolean
  name: string
  loginUrl: string | null
  note: string | null
}

export interface ServiceTemplate {
  id: string
  name: string
  loginUrl: string
  note: string | null
}

interface ServiceManagerProps {
  mailbox: string
  initialServices: Service[]
  templates: ServiceTemplate[]
}

export function ServiceManager({ mailbox, initialServices, templates }: ServiceManagerProps) {
  const [services, setServices] = useState<Service[]>(initialServices)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"template" | "custom">("template")

  // Delete service with confirmation
  const handleDelete = async (serviceId: string) => {
    if (!confirm("确定删除该服务？")) return

    const previousServices = [...services]
    setServices(services.filter(s => s.id !== serviceId)) // Optimistic update

    try {
      const formData = new FormData()
      formData.append("action", "delete_service")
      formData.append("service_id", serviceId)

      const res = await fetch(window.location.pathname, {
        method: "POST",
        body: formData
      })

      if (!res.ok) throw new Error("Failed to delete")
    } catch (e) {
      console.error(e)
      setServices(previousServices) // Revert on error
      alert("删除失败")
    }
  }

  // Add service (Template)
  const handleAddTemplate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    const formData = new FormData(e.currentTarget)
    formData.append("action", "add_template_service")
    formData.append("address", mailbox)

    try {
      const res = await fetch(window.location.pathname, {
        method: "POST",
        body: formData
      })

      if (!res.ok) {
        // Try to parse as HTML and reload page if server returns HTML
        const text = await res.text()
        if (text.includes("<!DOCTYPE") || text.includes("<html")) {
          window.location.reload()
        } else {
          throw new Error("添加失败")
        }
      } else {
        // Reload page on success
        window.location.reload()
      }
    } catch (e) {
      console.error(e)
      alert("添加失败")
      setIsLoading(false)
    }
  }

  // Add service (Custom)
  const handleAddCustom = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    const formData = new FormData(e.currentTarget)
    formData.append("action", "add_custom_service")
    formData.append("address", mailbox)

    try {
      const res = await fetch(window.location.pathname, {
        method: "POST",
        body: formData
      })

      if (!res.ok) {
        // Try to parse as HTML and reload page if server returns HTML
        const text = await res.text()
        if (text.includes("<!DOCTYPE") || text.includes("<html")) {
          window.location.reload()
        } else {
          throw new Error("添加失败")
        }
      } else {
        // Reload page on success
        window.location.reload()
      }
    } catch (e) {
      console.error(e)
      alert("添加失败")
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 items-center min-h-[28px]">
        {services.length > 0 ? (
          services.map(service => (
            <div key={service.id} className="group relative inline-flex">
                <Badge
                  variant={service.isCustom ? "secondary" : "outline"}
                  className={cn(
                    "pr-1.5 pl-2.5 py-0.5 text-xs flex items-center gap-1 transition-all hover:pr-6 relative overflow-hidden cursor-default",
                    service.isCustom ? "bg-secondary/50 hover:bg-secondary" : "bg-background hover:bg-accent"
                  )}
                >
                   <span className="truncate max-w-[100px]">{service.name}</span>

                   {/* Hover delete button */}
                   <div className="absolute right-0 top-0 bottom-0 flex items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity bg-inherit px-1">
                     <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(service.id);
                        }}
                        className="h-4 w-4 rounded-full hover:bg-destructive hover:text-destructive-foreground inline-flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                        title="删除服务"
                        aria-label="删除服务"
                     >
                       <X className="h-2.5 w-2.5" />
                     </button>
                   </div>
                </Badge>
            </div>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">未关联服务</span>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 rounded-full border border-dashed hover:border-solid hover:bg-accent text-muted-foreground"
          onClick={() => setIsModalOpen(true)}
          title="添加服务"
          aria-label="添加服务"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>添加关联服务 - {mailbox}</DialogTitle>
            </DialogHeader>

            <div className="flex gap-2 mb-4 p-1 bg-muted/50 rounded-lg">
               <button
                 type="button"
                 onClick={() => setActiveTab("template")}
                 className={cn(
                   "flex-1 text-sm font-medium py-1.5 rounded-md transition-all",
                   activeTab === "template" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                 )}
               >
                 选择模板
               </button>
               <button
                 type="button"
                 onClick={() => setActiveTab("custom")}
                 className={cn(
                   "flex-1 text-sm font-medium py-1.5 rounded-md transition-all",
                   activeTab === "custom" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                 )}
               >
                 自定义
               </button>
            </div>

            {activeTab === "template" ? (
               <form onSubmit={handleAddTemplate} className="space-y-4">
                 <div className="space-y-2">
                   <label className="text-sm font-medium text-muted-foreground">选择服务</label>
                   <select name="template_id" required className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
                     <option value="">-- 请选择 --</option>
                     {templates.map((tpl) => (
                       <option key={tpl.id} value={tpl.id}>{tpl.name} ({tpl.loginUrl})</option>
                     ))}
                   </select>
                   {templates.length === 0 && (
                     <p className="text-xs text-yellow-600">暂无模板，请先在服务管理中添加。</p>
                   )}
                 </div>
                 <div className="flex justify-end gap-2 pt-2">
                   <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>取消</Button>
                   <Button type="submit" disabled={isLoading || templates.length === 0}>
                     {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                     关联服务
                   </Button>
                 </div>
               </form>
            ) : (
               <form onSubmit={handleAddCustom} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">服务名称 *</label>
                    <Input type="text" name="service_name" required placeholder="如: Twitter" className="h-9" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">登录链接 *</label>
                    <Input type="url" name="service_login_url" required placeholder="https://twitter.com/login" className="h-9" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">备注</label>
                    <Input type="text" name="service_note" placeholder="可选" className="h-9" />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>取消</Button>
                    <Button type="submit" disabled={isLoading}>
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      创建并关联
                    </Button>
                  </div>
               </form>
            )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
