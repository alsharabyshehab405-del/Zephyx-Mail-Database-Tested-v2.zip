import React, { useState } from "react";
import { Link } from "wouter";
import { useI18n } from "@/hooks/use-i18n";
import { getIntlLocale } from "@/lib/i18n-config";
import {
  useAdminGetStats,
  useAdminListUsers,
  useAdminUpdateUser,
  AdminUser,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Users,
  Mail,
  Activity,
  TrendingUp,
  ShieldAlert,
  MoreVertical,
  Check,
  X,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { getAdminListUsersQueryKey } from "@workspace/api-client-react";

export default function Admin() {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: stats } = useAdminGetStats();
  const { data: usersData, isLoading: usersLoading } = useAdminListUsers({ search: searchQuery, page: 1, limit: 100 });
  const updateUserMutation = useAdminUpdateUser();

  const formatDate = (value: string | Date) =>
    new Date(value).toLocaleDateString(getIntlLocale(locale), {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const handleToggleStatus = (user: AdminUser) => {
    updateUserMutation.mutate(
      {
        id: user.id,
        data: { isActive: !user.isActive },
      },
      {
        onSuccess: () => {
          toast({ title: user.isActive ? t("admin.userDeactivated") : t("admin.userActivated") });
          queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
        },
      },
    );
  };

  const handleToggleRole = (user: AdminUser) => {
    updateUserMutation.mutate(
      {
        id: user.id,
        data: { role: user.role === "admin" ? "user" : "admin" },
      },
      {
        onSuccess: () => {
          toast({ title: user.role === "admin" ? t("admin.roleUser") : t("admin.roleAdmin") });
          queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
        },
      },
    );
  };

  const UserActionMenu = ({ user }: { user: AdminUser }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="novamail-admin-action h-9 w-9 shrink-0"
          aria-label={`${t("admin.colUser")}: ${user.firstName} ${user.lastName}`}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="novamail-admin-menu min-w-52">
        <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
          {user.isActive ? (
            <>
              <X className="me-2 h-4 w-4" /> {t("admin.deactivateUser")}
            </>
          ) : (
            <>
              <Check className="me-2 h-4 w-4" /> {t("admin.activateUser")}
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleToggleRole(user)}>
          <ShieldAlert className="me-2 h-4 w-4" />
          {user.role === "admin" ? t("admin.makeUser") : t("admin.makeAdmin")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const statCards = [
    {
      key: "users",
      label: t("admin.totalUsers"),
      value: stats?.totalUsers || 0,
      icon: Users,
    },
    {
      key: "active",
      label: t("admin.activeUsers"),
      value: stats?.activeUsers || 0,
      icon: Activity,
    },
    {
      key: "emails",
      label: t("admin.totalEmails"),
      value: stats?.totalEmails || 0,
      icon: Mail,
    },
    {
      key: "new",
      label: t("admin.newThisWeek"),
      value: stats?.newUsersThisWeek || 0,
      icon: TrendingUp,
    },
  ] as const;

  return (
    <div className="novamail-admin-page min-h-screen bg-background text-foreground pb-20 md:pb-12">
      <header className="novamail-admin-header sticky top-0 z-40 border-b">
        <div className="novamail-admin-header-inner mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="novamail-admin-brand-icon" aria-hidden="true">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{t("admin.title")}</h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{t("admin.stats")}</p>
            </div>
          </div>

          <Button variant="ghost" size="sm" asChild className="novamail-admin-back shrink-0">
            <Link href="/">
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              <span className="hidden sm:inline">{t("admin.backToApp")}</span>
            </Link>
          </Button>
        </div>
      </header>

      <main className="novamail-admin-main mx-auto max-w-7xl space-y-7 px-4 pt-6 sm:px-6 sm:pt-8">
        <section className="novamail-admin-overview" aria-labelledby="admin-overview-title">
          <div className="novamail-admin-section-heading">
            <div>
              <h2 id="admin-overview-title" className="text-lg font-semibold tracking-tight sm:text-xl">
                {t("admin.stats")}
              </h2>
            </div>
            <div className="novamail-admin-live-dot" aria-hidden="true">
              <span />
            </div>
          </div>

          <div className="novamail-admin-stats-grid grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {statCards.map(({ key, label, value, icon: Icon }) => (
              <Card key={key} className="novamail-admin-stat-card" data-stat={key}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-4 pb-2 sm:p-5 sm:pb-2">
                  <CardTitle className="min-w-0 text-xs font-medium text-muted-foreground sm:text-sm">
                    {label}
                  </CardTitle>
                  <div className="novamail-admin-stat-icon shrink-0" aria-hidden="true">
                    <Icon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
                  <div className="novamail-admin-stat-value tabular-nums">{value}</div>
                  <div className="novamail-admin-stat-rail" aria-hidden="true">
                    <span />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="novamail-admin-users" aria-labelledby="admin-users-title">
          <div className="novamail-admin-users-toolbar">
            <div className="min-w-0">
              <h2 id="admin-users-title" className="text-lg font-semibold tracking-tight sm:text-xl">
                {t("admin.users")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                {stats?.totalUsers || usersData?.users.length || 0} {t("admin.totalUsers")}
              </p>
            </div>

            <div className="novamail-admin-search relative w-full sm:w-80">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("admin.searchUsers")}
                className="h-11 ps-10 pe-4"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <Card className="novamail-admin-table-card hidden overflow-hidden md:block">
            <Table>
              <TableHeader className="novamail-admin-table-head">
                <TableRow>
                  <TableHead>{t("admin.colUser")}</TableHead>
                  <TableHead>{t("admin.colRole")}</TableHead>
                  <TableHead>{t("admin.colStatus")}</TableHead>
                  <TableHead>{t("admin.colEmails")}</TableHead>
                  <TableHead>{t("admin.colJoined")}</TableHead>
                  <TableHead className="w-[54px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      {t("admin.loadingUsers")}
                    </TableCell>
                  </TableRow>
                ) : usersData?.users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      {t("admin.noUsers")}
                    </TableCell>
                  </TableRow>
                ) : (
                  usersData?.users.map((user) => (
                    <TableRow key={user.id} className="novamail-admin-user-row">
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="novamail-admin-avatar shrink-0" aria-hidden="true">
                            {(user.firstName?.[0] || user.email?.[0] || "U").toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.role === "admin" ? "default" : "secondary"}
                          className="novamail-admin-role-badge"
                        >
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.isActive ? "outline" : "destructive"}
                          className={`novamail-admin-status-badge ${user.isActive ? "is-active" : "is-inactive"}`}
                        >
                          <span className="novamail-admin-status-dot" aria-hidden="true" />
                          {user.isActive ? t("admin.statusActive") : t("admin.statusInactive")}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold tabular-nums">{user.emailCount}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </TableCell>
                      <TableCell>
                        <UserActionMenu user={user} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          <div className="novamail-admin-mobile-list space-y-3 md:hidden">
            {usersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="novamail-admin-mobile-card">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 animate-pulse rounded-xl bg-muted" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                          <div className="h-3 w-48 max-w-full animate-pulse rounded bg-muted/70" />
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="h-10 animate-pulse rounded-xl bg-muted/60" />
                        <div className="h-10 animate-pulse rounded-xl bg-muted/60" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : usersData?.users.length === 0 ? (
              <Card className="novamail-admin-mobile-card">
                <CardContent className="py-10 text-center text-muted-foreground">{t("admin.noUsers")}</CardContent>
              </Card>
            ) : (
              usersData?.users.map((user) => (
                <Card key={user.id} className="novamail-admin-mobile-card overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="novamail-admin-avatar shrink-0" aria-hidden="true">
                        {(user.firstName?.[0] || user.email?.[0] || "U").toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
                          </div>
                          <UserActionMenu user={user} />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge
                            variant={user.role === "admin" ? "default" : "secondary"}
                            className="novamail-admin-role-badge"
                          >
                            {user.role}
                          </Badge>
                          <Badge
                            variant={user.isActive ? "outline" : "destructive"}
                            className={`novamail-admin-status-badge ${user.isActive ? "is-active" : "is-inactive"}`}
                          >
                            <span className="novamail-admin-status-dot" aria-hidden="true" />
                            {user.isActive ? t("admin.statusActive") : t("admin.statusInactive")}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="novamail-admin-mobile-meta mt-4 grid grid-cols-2 gap-2">
                      <div>
                        <span>{t("admin.colEmails")}</span>
                        <strong className="tabular-nums">{user.emailCount}</strong>
                      </div>
                      <div>
                        <span>{t("admin.colJoined")}</span>
                        <strong>{formatDate(user.createdAt)}</strong>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
