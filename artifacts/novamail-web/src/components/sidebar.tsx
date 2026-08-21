import React from "react";
import { Link, useLocation } from "wouter";
import {
  Inbox,
  Send,
  Clock,
  Star,
  Trash2,
  FileText,
  Plus,
  Archive,
  AlertOctagon,
  Sparkles,
  ListTodo,
  CalendarDays,
  BarChart3,
  FileSignature,
  Settings,
  Folder as FolderIcon,
} from "lucide-react";
import { useGetInboxStats, useListFolders } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { UserMenu } from "./user-menu";

interface SidebarProps {
  currentFolder?: string;
  onSelectFolder?: (folder: string) => void;
  onOpenCompose?: () => void;
  onCompose?: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentFolder = "inbox",
  onSelectFolder,
  onOpenCompose,
  onCompose,
  className,
}) => {
  const { t } = useI18n();
  const [location, setLocation] = useLocation();
  const { data: stats } = useGetInboxStats();
  const { data: foldersData } = useListFolders();
  const compose = onOpenCompose ?? onCompose ?? (() => undefined);

  const navItems = [
    { id: "inbox", route: "/", label: "الوارد", icon: Inbox, badge: stats?.inboxUnread },
    { id: "starred", route: "/folder/starred", label: "المميزة بنجمة", icon: Star, badge: stats?.starredCount },
    { id: "snoozed", route: "/folder/snoozed", label: "المؤجلة", icon: Clock },
    { id: "sent", route: "/folder/sent", label: "المرسلة", icon: Send },
    { id: "drafts", route: "/folder/drafts", label: "المسودات", icon: FileText, badge: stats?.draftsCount },
    { id: "archive", route: "/folder/archive", label: "الأرشيف", icon: Archive },
    { id: "trash", route: "/folder/trash", label: "المهملات", icon: Trash2 },
    { id: "spam", route: "/folder/spam", label: "غير مرغوب فيها", icon: AlertOctagon, badge: stats?.spamCount },
    { id: "ai", route: "/ai", label: "مساعد الذكاء الاصطناعي", icon: Sparkles },
    { id: "tasks", route: "/tasks", label: "المهام", icon: ListTodo },
    { id: "calendar", route: "/calendar", label: "التقويم", icon: CalendarDays },
    { id: "analytics", route: "/analytics", label: "التحليلات", icon: BarChart3 },
    { id: "templates", route: "/templates", label: "القوالب والردود الجاهزة", icon: FileSignature },
  ];

  const goTo = (id: string, route: string) => {
    onSelectFolder?.(id);
    setLocation(route);
  };

  return (
    <aside
      dir="rtl"
      className={cn(
        "w-64 bg-slate-900 text-slate-300 h-full min-h-screen flex flex-col p-4 border-r border-slate-800 select-none",
        className,
      )}
    >
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="text-xl font-bold text-white mb-4 tracking-wide flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          aria-label="Zephyx Mail"
        >
          <span className="w-3 h-3 rounded-full bg-indigo-500 inline-block" />
          <span>Zephyx Mail</span>
        </button>
        <button
          type="button"
          onClick={compose}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/30 transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        >
          <Plus className="w-5 h-5" />
          <span>إنشاء رسالة</span>
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="التنقل الرئيسي">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.route || (item.id === currentFolder && location.startsWith("/folder/"));
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => goTo(item.id, item.route)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                isActive
                  ? "bg-slate-800 text-white shadow-sm"
                  : "hover:bg-slate-800/50 text-slate-400 hover:text-slate-200",
              )}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon className={cn("w-4 h-4 shrink-0", isActive && "text-indigo-400")} />
                <span className="truncate">{item.label}</span>
              </span>
              {!!item.badge && item.badge > 0 ? (
                <span className="bg-indigo-500/20 text-indigo-400 text-xs px-2 py-0.5 rounded-full font-semibold">
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}

        {(foldersData || []).length > 0 && (
          <div className="mt-6 border-t border-slate-800 pt-4">
            <h2 className="px-3.5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">مجلداتي</h2>
            {(foldersData || []).map((folder) => {
              const isActive = currentFolder === folder.id;
              const unread = stats?.folderCounts?.find((item) => item.folderId === folder.id)?.unread || 0;
              return (
                <button
                  type="button"
                  key={folder.id}
                  onClick={() => goTo(folder.id, `/f/${folder.id}`)}
                  className={cn(
                    "w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3"><FolderIcon className="h-4 w-4 shrink-0" style={{ color: folder.color || "currentColor" }} /><span className="truncate">{folder.name}</span></span>
                  {unread > 0 && <span className="text-xs text-indigo-400">{unread}</span>}
                </button>
              );
            })}
          </div>
        )}
      </nav>

      <div className="mt-4 border-t border-slate-800 pt-4 space-y-2">
        <Link href="/settings" className="flex items-center gap-3 rounded-md px-3.5 py-2 text-sm text-slate-400 hover:bg-slate-800/50 hover:text-slate-200">
          <Settings className="h-4 w-4" />
          <span>{t("settings.title")}</span>
        </Link>
        <button
          type="button"
          onClick={() => { if (typeof Notification !== "undefined") void Notification.requestPermission(); }}
          className="flex w-full items-center gap-3 rounded-md px-3.5 py-2 text-start text-sm text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
        >
          <span className="h-2 w-2 rounded-full bg-indigo-500" />
          <span>إشعارات سطح المكتب</span>
        </button>
        <UserMenu />
      </div>
    </aside>
  );
};

export default Sidebar;
