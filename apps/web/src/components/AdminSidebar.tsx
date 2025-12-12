import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Mail,
  FileText,
  Settings,
  LogOut,
  Menu,
  Globe,
  Trash2,
  X,
  ExternalLink,
  Key
} from 'lucide-react';
import { cn } from '../lib/utils';

interface SidebarProps {
  currentPath: string;
}

const menuItems = [
  { href: '/admin', icon: LayoutDashboard, label: '概览', exact: true },
  { href: '/admin/users', icon: Users, label: '用户管理' },
  { href: '/admin/mailboxes', icon: Mail, label: '邮箱管理' },
  { href: '/admin/external', icon: ExternalLink, label: '第三方邮箱' },
  { href: '/admin/services', icon: Globe, label: '服务管理' },
  { href: '/admin/trash', icon: Trash2, label: '回收站' },
  { href: '/admin/emails', icon: FileText, label: '邮件查看' },
  { href: '/admin/logs', icon: FileText, label: '操作日志' },
  { href: '/admin/api-keys', icon: Key, label: 'API Key 管理' },
  { href: '/admin/settings', icon: Settings, label: '系统设置' },
];

export function AdminSidebar({ currentPath }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const SidebarContent = () => (
    <>
      <div className="p-4 md:p-6 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-xl">
            X
          </div>
          <span className="text-xl font-bold text-foreground">XMail Admin</span>
        </div>
        <button
          className="md:hidden p-2 hover:bg-accent rounded-md"
          onClick={() => setIsOpen(false)}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = item.exact
            ? currentPath === item.href
            : currentPath.startsWith(item.href);

          return (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
              onClick={() => setIsOpen(false)}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </a>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <a
          href="/admin/logout"
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          退出登录
        </a>
      </div>
    </>
  );

  return (
    <>
      {/* 移动端顶部导航栏 */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border h-14 flex items-center px-4 justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold">
            X
          </div>
          <span className="font-bold text-foreground">XMail Admin</span>
        </div>
        <button
          className="p-2 hover:bg-accent rounded-md"
          onClick={() => setIsOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* 移动端遮罩层 */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* 移动端侧边栏 */}
      <aside
        className={cn(
          "md:hidden fixed top-0 left-0 h-full w-64 bg-card z-50 flex flex-col transform transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent />
      </aside>

      {/* 桌面端侧边栏 */}
      <aside className="hidden md:flex w-64 bg-card border-r border-border flex-col h-screen sticky top-0">
        <SidebarContent />
      </aside>
    </>
  );
}
