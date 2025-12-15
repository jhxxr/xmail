import * as React from "react"
import { useState } from "react"
import { Badge } from "../ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog"
import { Users } from "lucide-react"

interface User {
  id: string
  name: string | null
  note: string | null
  token: string
}

interface SharedUser {
  userId: string
  userName: string
}

interface SharedMailboxManagerProps {
  address: string
  sharedUsers: SharedUser[]
  allUsers: User[]
}

export function SharedMailboxManager({ address, sharedUsers, allUsers }: SharedMailboxManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)

    const formData = new FormData(e.currentTarget)

    try {
      const res = await fetch(window.location.pathname, {
        method: "POST",
        body: formData
      })
      if (res.ok) {
        window.location.reload()
      }
    } catch (err) {
      console.error(err)
      setIsSubmitting(false)
    }
  }

  const handleCancelShared = async () => {
    if (!confirm("确定取消共享？将保留第一个用户作为所有者。")) return

    const formData = new FormData()
    formData.append("action", "set_shared")
    formData.append("address", address)
    formData.append("is_shared", "false")

    try {
      const res = await fetch(window.location.pathname, {
        method: "POST",
        body: formData
      })
      if (res.ok) {
        window.location.reload()
      }
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-700 transition-colors"
      >
        <Users className="h-3.5 w-3.5" />
        <span className="font-medium">共享</span>
        {sharedUsers.length > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
            {sharedUsers.length}
          </Badge>
        )}
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>管理共享邮箱用户</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">{address}</p>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <input type="hidden" name="action" value="assign_shared_users" />
            <input type="hidden" name="address" value={address} />
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {allUsers.map((user) => {
                const isAssigned = sharedUsers.some(u => u.userId === user.id)
                return (
                  <label key={user.id} className="flex items-center gap-3 p-3 rounded-md border hover:bg-accent transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      name="user_ids[]"
                      value={user.id}
                      defaultChecked={isAssigned}
                      className="rounded border-gray-300"
                    />
                    <div className="flex-1">
                      <span className="font-medium">{user.name || "未命名"}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {user.note || user.token.slice(0, 12) + "..."}
                      </span>
                    </div>
                  </label>
                )
              })}
            </div>
            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={handleCancelShared}
                className="text-sm text-muted-foreground hover:text-destructive transition-colors"
              >
                取消共享
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 disabled:opacity-50"
              >
                {isSubmitting ? "保存中..." : "保存"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
