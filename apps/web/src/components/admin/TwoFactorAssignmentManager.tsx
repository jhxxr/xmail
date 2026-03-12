import { type FormEvent, useState } from "react"
import { Badge } from "../ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog"
import { Users } from "lucide-react"

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

interface TwoFactorAssignmentManagerProps {
  entryId: string
  entryName: string
  allUsers: User[]
  assignedUsers: AssignedUser[]
}

export function TwoFactorAssignmentManager({ entryId, entryName, allUsers, assignedUsers }: TwoFactorAssignmentManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    try {
      const response = await fetch(window.location.pathname, {
        method: "POST",
        body: formData,
      })
      if (response.ok) {
        window.location.reload()
      } else {
        setIsSubmitting(false)
      }
    } catch (error) {
      console.error(error)
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
      >
        <Users className="h-3.5 w-3.5" />
        <span className="font-medium">分配用户</span>
        <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[10px]">
          {assignedUsers.length}
        </Badge>
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>分配 2FA 给用户</DialogTitle>
            <p className="mt-1 text-sm text-muted-foreground">{entryName}</p>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <input type="hidden" name="action" value="assign_users" />
            <input type="hidden" name="id" value={entryId} />

            <div className="max-h-[320px] space-y-2 overflow-y-auto">
              {allUsers.map((user) => {
                const isAssigned = assignedUsers.some((assignedUser) => assignedUser.userId === user.id)

                return (
                  <label
                    key={user.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      name="user_ids[]"
                      value={user.id}
                      defaultChecked={isAssigned}
                      className="rounded border-gray-300"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{user.name || "未命名"}</div>
                      <div className="text-xs text-muted-foreground">
                        {user.note || `${user.token.slice(0, 12)}...`}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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
