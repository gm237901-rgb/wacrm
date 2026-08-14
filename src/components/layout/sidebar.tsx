"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import {
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  ChevronsLeft,
  Crown,
  GitBranch,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  Shield,
  User,
  UserCog,
  Users,
  UsersRound,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import type { AccountRole } from "@/lib/auth/roles";
import { LogoLockup } from "@/components/brand/logo";

// Per-role chip metadata used in the sidebar's account strip + the
// Members tab roster. Keeping this near both consumers in a single
// place avoids drift between the two surfaces — when a designer
// wants to recolour "agent" rows, this is the one diff.
const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; labelKey: string; className: string }
> = {
  owner: {
    icon: Crown,
    labelKey: "roleOwner",
    // Amber: scarce, immutable, "the boss" — gets visual emphasis.
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  admin: {
    icon: Shield,
    labelKey: "roleAdmin",
    // Primary-tinted: significant but not as scarce as owner.
    className:
      "border-primary/40 bg-primary/10 text-primary",
  },
  agent: {
    icon: UserCog,
    labelKey: "roleAgent",
    // Neutral slate: the operational default.
    className:
      "border-border bg-muted text-foreground",
  },
  viewer: {
    icon: User,
    labelKey: "roleViewer",
    // Muted slate: read-only role; visually quieter than agent.
    className:
      "border-border bg-card text-muted-foreground",
  },
};
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  /**
   * When true, the nav row renders a small "Beta" chip after the label.
   * Purely informational — doesn't affect routing or access.
   */
  beta?: boolean;
}

interface NavSection {
  labelKey: string;
  items: NavItem[];
}

// Two groups, one of them unlabelled. With Empresas, Tarefas,
// Atividades, Produtos and E-mails gone, the old four sections held two
// or three rows each — at that size a section header costs more
// attention than the grouping saves, and four of them stacked was most
// of why the sidebar read as crowded.
const navSections: NavSection[] = [
  {
    labelKey: "",
    items: [
      { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
      { href: "/inbox", labelKey: "inbox", icon: MessageSquare },
      { href: "/contacts", labelKey: "contacts", icon: Users },
      { href: "/pipelines", labelKey: "pipelines", icon: GitBranch },
      { href: "/agenda", labelKey: "agenda", icon: CalendarDays },
      { href: "/reports", labelKey: "reports", icon: BarChart3 },
    ],
  },
  {
    labelKey: "sectionAutomacao",
    items: [
      { href: "/automations", labelKey: "automations", icon: Zap },
      { href: "/flows", labelKey: "flows", icon: Workflow, beta: true },
      { href: "/agents", labelKey: "aiAgents", icon: Bot },
    ],
  },
];

// Notifications joins Settings at the bottom: the header already carries
// a bell with the unread count, so its row up top was a second entrance
// to the same screen.
const bottomNavItems = [
  { href: "/notifications", labelKey: "notifications", icon: Bell },
  { href: "/settings", labelKey: "settings", icon: Settings },
];

interface SidebarProps {
  /** Controlled on mobile by the Header's hamburger button. Ignored on lg+. */
  open?: boolean;
  onClose?: () => void;
}

import { useTranslations } from "next-intl";

/** Desktop-only collapse preference. Device-scoped, like the theme. */
const COLLAPSE_STORAGE_KEY = "linovexa.sidebar.collapsed";

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const { profile, profileLoading, account, accountRole, signOut } = useAuth();
  // Collapsed applies to the desktop rail only — on mobile the sidebar
  // is a drawer that's either open or gone, so narrowing it would just
  // produce an unusable sliver.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1");
    } catch {
      // localStorage throws in private-browsing/sandboxed contexts.
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Same private-browsing case; the session still reflects it.
      }
      return next;
    });
  }, []);
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();
  // Only surface the account-name strip when it actually carries
  // information. A solo user's personal account is named after them
  // (the 017 signup trigger seeds it from `full_name`), so showing it
  // here would just duplicate the user name in the footer below. Once
  // the account is renamed or the user joins a shared account, the
  // name diverges and the strip becomes meaningful — that's the signal
  // we gate on. Wait for the profile fetch to settle first, otherwise
  // the strip flashes in once the row resolves (a layout jump).
  const showAccountStrip =
    !profileLoading &&
    !!account?.name &&
    account.name !== profile?.full_name;

  // Close the drawer when route changes — users opened it to navigate,
  // so once they pick a destination the drawer should get out of the way.
  useEffect(() => {
    onClose?.();
    // Only pathname drives this — onClose identity doesn't need to re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open on
  // mobile. No-ops on desktop because the sidebar isn't positioned there.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — only exists on mobile and only when open. Clicking
          it closes the drawer. Hidden from lg+ since the sidebar is
          part of the main flex row there. */}
      <button
        type="button"
        aria-label={t("closeMenu")}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          // Mobile: fixed drawer that slides in from the left. pl- keeps the
          // logo/nav row clear of a landscape notch/rounded corner now that
          // viewportFit:"cover" lets content draw edge-to-edge.
          "fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-border bg-card pl-[env(safe-area-inset-left)]",
          "transition-transform duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
          // Desktop: static, always visible — reset all the mobile framing.
          // Width animates so collapsing reads as the rail shrinking
          // rather than the page jumping.
          "lg:static lg:z-0 lg:translate-x-0 lg:transition-[width] lg:duration-200",
          collapsed ? "lg:w-[4.5rem]" : "lg:w-60",
        )}
        aria-label={t("navPrimaryAria")}
      >
        {/* Logo row. On mobile we put a close button here; on desktop the
            close button is hidden since the sidebar is always-visible. */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4",
            collapsed && "lg:justify-center lg:px-0",
          )}
        >
          <Link href="/dashboard">
            <LogoLockup subtitle="CRM" hideText={collapsed} />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeMenu")}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main navigation. pb- adds the home-indicator clearance on top of
            the existing py-4 so the last item isn't flush against it. */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {navSections.map((section, sectionIdx) => (
            <div key={section.labelKey} className={sectionIdx > 0 ? "mt-4" : undefined}>
              {/* The first group is deliberately unlabelled — the primary
                  routes need no heading to explain them. */}
              {section.labelKey ? (
                <p
                  className={cn(
                    "px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground/70 uppercase",
                    collapsed && "lg:hidden",
                  )}
                >
                  {t(section.labelKey)}
                </p>
              ) : null}
              <ul className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));

                  const showUnreadDot =
                    item.href === "/inbox" && totalUnread > 0 && !isActive;

                  // Unlike the inbox dot, the notifications count stays visible
                  // even while the page is active — it reflects unread state
                  // (cleared by marking notifications read), not "currently
                  // viewing this section".
                  const showNotificationBadge =
                    item.href === "/notifications" && unreadNotifications > 0;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        // Collapsed rows show only an icon, so the label has
                        // to survive as the accessible name and the hover
                        // tooltip — otherwise the rail is unreadable to a
                        // screen reader and guesswork for everyone else.
                        title={collapsed ? t(item.labelKey as string) : undefined}
                        className={cn(
                          // Taller on mobile so fingers can hit the row reliably (≥44px).
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors lg:py-2",
                          collapsed && "lg:justify-center lg:px-0",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className={cn("flex-1", collapsed && "lg:hidden")}>
                          {t(item.labelKey as string)}
                        </span>
                        {item.beta && (
                          <span
                            aria-label={t("beta")}
                            className={cn(
                              "rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300",
                              collapsed && "lg:hidden",
                            )}
                          >
                            {t("beta")}
                          </span>
                        )}
                        {showUnreadDot && (
                          <span
                            aria-label={t("unreadConversations", { count: totalUnread })}
                            className="relative flex h-2 w-2"
                          >
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                          </span>
                        )}
                        {showNotificationBadge && (
                          <span
                            aria-label={t("unreadNotifications", { count: unreadNotifications })}
                            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground"
                          >
                            {unreadNotifications > 9 ? "9+" : unreadNotifications}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="my-4 border-t border-border" />

          <ul className="flex flex-col gap-1">
            {bottomNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={collapsed ? t(item.labelKey as string) : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors lg:py-2",
                      collapsed && "lg:justify-center lg:px-0",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className={cn(collapsed && "lg:hidden")}>
                      {t(item.labelKey as string)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User section */}
        <div className="shrink-0 border-t border-border p-3">
          {/* Account name display — surfaced only when the account
              name differs from the user's own name (see
              `showAccountStrip`). For a default solo account the two
              match, so we hide it to avoid duplicating the user name
              below; for renamed or shared accounts it tells the user
              which account they're acting in. */}
          {showAccountStrip && account?.name ? (
            <div
              className={cn(
                "mb-2 flex items-center gap-2 px-3 text-xs text-muted-foreground",
                collapsed && "lg:hidden",
              )}
            >
              <UsersRound className="size-3.5 shrink-0" />
              {/* `title=` exposes the full name on hover when it
                  gets truncated (long account names + narrow
                  sidebars). Cheap a11y win. */}
              <span className="truncate" title={account.name}>
                {account.name}
              </span>
              {accountRole ? (
                // Always render the chip — owners used to be
                // invisible here, which made them indistinguishable
                // from admins at a glance. Now everyone sees their
                // role (with a colour cue) regardless of tier.
                (() => {
                  const meta = ROLE_CHIP[accountRole];
                  const Icon = meta.icon;
                  return (
                    <span
                      className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${meta.className}`}
                    >
                      <Icon className="size-3" />
                      {t(meta.labelKey as string)}
                    </span>
                  );
                })()
              ) : null}
            </div>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:outline-none data-popup-open:bg-muted/60",
                collapsed && "lg:justify-center lg:px-0",
              )}
            >
              <Avatar className="size-8 shrink-0">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? t("defaultAvatar")}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ??
                    profile?.email?.charAt(0)?.toUpperCase() ??
                    "U"}
                </AvatarFallback>
              </Avatar>
              <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
                <p className="truncate text-sm font-medium text-foreground">
                  {profile?.full_name ?? t("defaultUser")}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {profile?.email ?? ""}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={6}
              className="min-w-56 bg-popover text-popover-foreground ring-border"
            >
              <DropdownMenuItem
                render={
                  <Link
                    href="/conta"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <User className="size-4" />
                {t("menuProfile")}
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <Settings className="size-4" />
                {t("menuSettings")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={signOut}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <LogOut className="size-4" />
                {t("menuSignOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Desktop only: on mobile the drawer already closes via the
              backdrop and the X in the header, and a 4.5rem sliver would
              be worse than either. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t("expandMenu") : t("collapseMenu")}
            title={collapsed ? t("expandMenu") : t("collapseMenu")}
            className={cn(
              "mt-1 hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex",
              collapsed && "lg:justify-center lg:px-0",
            )}
          >
            <ChevronsLeft
              className={cn(
                "size-4 shrink-0 transition-transform",
                collapsed && "rotate-180",
              )}
            />
            <span className={cn(collapsed && "lg:hidden")}>
              {t("collapseMenu")}
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
