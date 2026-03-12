import * as React from "react"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog"
import { Input } from "../ui/input"
import { UserPlus, Users } from "lucide-react"

interface User {
  id: string
  name: string | null
  note: string | null
  token: string
}

interface AssignUserManagerProps {
  address: string
  allUsers: User[]
  currentUserName?: string | null
  currentUserId?: string | null
}

export function AssignUserManager({ address, allUsers, currentUserName, currentUserId }: AssignUserManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const filteredUsers = allUsers.filter(user => {
    const term = searchTerm.toLowerCase()
    return (
      (user.name?.toLowerCase().includes(term)) ||
      (user.note?.toLowerCase().includes(term)) ||
      user.token.toLowerCase().includes(term)
    )
  })

  const handleAssignUser = async (userId: string) => {
    setIsSubmitting(true)
    const formData = new FormData()
    formData.append("action", "assign_single")
    formData.append("address", address)
    formData.append("user_id", userId)

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

  const handleSetShared = async () => {
    setIsSubmitting(true)
    const formData = new FormData()
    formData.append("action", "set_shared")
    formData.append("address", address)
    formData.append("is_shared", "true")

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

  const handleUnassign = async () => {
    if (!confirm("确定取消分配？")) return
    setIsSubmitting(true)
    const formData = new FormData()
    formData.append("action", "unassign")
    formData.append("address", address)

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

  // 已分配给用户
  if (currentUserId) {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="text-primary hover:underline font-medium"
        >
          {currentUserName}
        </button>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>管理邮箱分配</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">{address}</p>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted/50 rounded-md">
                <p className="text-sm">
                  当前分配给：<span className="font-medium">{currentUserName}</span>
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleUnassign}
                  disabled={isSubmitting}
                  className="flex-1 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 disabled:opacity-50"
                >
                  取消分配
                </button>
                <button
                  type="button"
                  onClick={handleSetShared}
                  disabled={isSubmitting}
                  className="flex-1 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-purple-600 text-white hover:bg-purple-700 h-10 px-4 disabled:opacity-50"
                >
                  <Users className="h-4 w-4 mr-2" />
                  转为共享
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">或重新分配</span>
                </div>
              </div>

              <Input
                type="text"
                placeholder="搜索用户名..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="max-h-[200px] overflow-y-auto space-y-2">
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleAssignUser(user.id)}
                    disabled={isSubmitting || user.id === currentUserId}
                    className="w-full flex items-center justify-between p-3 rounded-md border hover:border-primary hover:bg-accent transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="font-medium">{user.name || "未命名"}</span>
                    <span className="text-xs text-muted-foreground">
                      {user.note || user.token.slice(0, 12) + "..."}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // 未分配
  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors border-b border-dashed border-gray-400 hover:border-primary"
      >
        <UserPlus className="h-3 w-3" />
        <span>未分配</span>
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>绑定邮箱到用户</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">{address}</p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 设为共享邮箱选项 */}
            <button
              type="button"
              onClick={handleSetShared}
              disabled={isSubmitting}
              className="w-full p-3 rounded-md border-2 border-dashed border-purple-200 hover:border-purple-400 transition-colors bg-purple-50/50 disabled:opacity-50"
            >
              <div className="flex items-center gap-3 text-left">
                <div className="p-2 bg-purple-100 rounded-md text-purple-600">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <span className="font-medium text-purple-700">设为共享邮箱</span>
                  <p className="text-xs text-purple-600/70">可分配给多个用户</p>
                </div>
              </div>
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">或分配给单个用户</span>
              </div>
            </div>

            <Input
              type="text"
              placeholder="搜索用户名..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="max-h-[200px] overflow-y-auto space-y-2">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleAssignUser(user.id)}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-between p-3 rounded-md border hover:border-primary hover:bg-accent transition-colors text-left disabled:opacity-50"
                >
                  <span className="font-medium">{user.name || "未命名"}</span>
                  <span className="text-xs text-muted-foreground">
                    {user.note || user.token.slice(0, 12) + "..."}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
