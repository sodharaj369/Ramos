import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  BookOpen,
  Briefcase,
  Database,
  Search,
  Settings,
  ShieldCheck,
  Shield,
  Upload,
  History,
  LogOut,
  Menu,
  Sparkles,
  Puzzle,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useExtensionBridge } from "@/hooks/use-extension-bridge";
import { checkIsAdmin } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const NAV_GROUPS: {
  title: string;
  adminOnly?: boolean;
  items: { to: string; label: string; icon: typeof Search }[];
}[] = [
  {
    title: "SALES INTEL",
    items: [{ to: "/dashboard", label: "Dashboard", icon: BarChart3 }],
  },
  {
    title: "LEADS",
    items: [
      { to: "/finder", label: "Find Leads", icon: Search },
      { to: "/leads", label: "Leads", icon: Database },
      { to: "/import", label: "Import", icon: Upload },
    ],
  },
  {
    title: "VERIFICATION",
    items: [
      { to: "/verification", label: "Email Verification", icon: ShieldCheck },
      { to: "/verification-history", label: "Verification History", icon: History },
    ],
  },
  {
    title: "OPERATIONS",
    items: [{ to: "/jobs", label: "Jobs", icon: Briefcase }],
  },
  {
    title: "SYSTEM",
    items: [
      { to: "/settings", label: "Settings", icon: Settings },
      { to: "/documentation", label: "Documentation", icon: BookOpen },
    ],
  },
  {
    title: "ADMINISTRATION",
    adminOnly: true,
    items: [
      { to: "/settings/system", label: "System Configuration", icon: Shield },
    ],
  },
];

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const bridge = useExtensionBridge();
  const [mobileOpen, setMobileOpen] = useState(false);

  const checkAdminFn = useServerFn(checkIsAdmin);
  const adminQuery = useQuery({
    queryKey: ["checkIsAdmin"],
    queryFn: () => checkAdminFn({}),
  });
  const isAdmin = adminQuery.data?.isAdmin === true;

  const visibleNavGroups = NAV_GROUPS.filter((g) => !g.adminOnly || isAdmin);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex shrink-0 items-center gap-3 border-b border-sidebar-border px-5 py-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-xs">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold tracking-tight text-sidebar-accent-foreground truncate">
              Sales Intel
            </p>
            <p className="text-[11px] text-sidebar-foreground/60 truncate">
              Lead Management Platform
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {visibleNavGroups.map((group) => (
            <div key={group.title}>
              <p className="px-2.5 pb-1.5 text-[10px] font-bold tracking-widest text-sidebar-foreground/40 uppercase">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    activeProps={{
                      className:
                        "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                    }}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border bg-sidebar p-3">
          <div className="flex items-center justify-between rounded-lg bg-sidebar-accent/40 p-2.5">
            <div className="min-w-0 pr-2">
              <p className="truncate text-xs font-medium text-sidebar-accent-foreground">
                {user?.email ?? "—"}
              </p>
              <p className="text-[10px] text-sidebar-foreground/60">Signed in</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="size-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Sheet Trigger */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden size-9 shrink-0"
                  aria-label="Open navigation menu"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex flex-col h-full w-72 bg-sidebar text-sidebar-foreground p-0 border-sidebar-border">
                <SheetHeader className="shrink-0 border-b border-sidebar-border px-5 py-4 text-left">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                      <Sparkles className="size-4" />
                    </div>
                    <div>
                      <SheetTitle className="font-display text-sm font-bold tracking-tight text-sidebar-accent-foreground">
                        Sales Intel
                      </SheetTitle>
                      <p className="text-[11px] text-sidebar-foreground/60">
                        Lead Management Platform
                      </p>
                    </div>
                  </div>
                </SheetHeader>

                <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
                  {visibleNavGroups.map((group) => (
                    <div key={group.title}>
                      <p className="px-2.5 pb-1.5 text-[10px] font-bold tracking-widest text-sidebar-foreground/40 uppercase">
                        {group.title}
                      </p>
                      <div className="space-y-0.5">
                        {group.items.map((item) => (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setMobileOpen(false)}
                            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            activeProps={{
                              className:
                                "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                            }}
                          >
                            <item.icon className="size-4 shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </nav>

                <div className="shrink-0 border-t border-sidebar-border bg-sidebar p-3">
                  <div className="flex items-center justify-between rounded-lg bg-sidebar-accent/40 p-2.5">
                    <div className="min-w-0 pr-2">
                      <p className="truncate text-xs font-medium text-sidebar-accent-foreground">
                        {user?.email ?? "—"}
                      </p>
                      <p className="text-[10px] text-sidebar-foreground/60">Signed in</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"
                      onClick={() => {
                        setMobileOpen(false);
                        void signOut();
                      }}
                      title="Sign out"
                      aria-label="Sign out"
                    >
                      <LogOut className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="min-w-0">
              <h1 className="font-display text-lg font-bold tracking-tight text-foreground truncate">
                {title}
              </h1>
              {description ? (
                <p className="mt-0.5 text-xs text-muted-foreground truncate">{description}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            {/* Extension Connection Badge */}
            {bridge.status === "connected" ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/12 px-2.5 py-1 text-[11px] font-medium text-success">
                <span className="size-1.5 rounded-full bg-success animate-pulse" />
                Extension Connected
              </span>
            ) : bridge.status === "checking" ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-muted-foreground/50 animate-pulse" />
                Checking Extension...
              </span>
            ) : bridge.status === "installed-not-connected" ? (
              <Link
                to="/settings"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/15 px-2.5 py-1 text-[11px] font-medium text-warning-foreground hover:bg-warning/25 transition-colors"
              >
                <Puzzle className="size-3 text-warning-foreground" />
                Extension Installed — Not Connected
              </Link>
            ) : (
              <Link
                to="/settings"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Puzzle className="size-3 text-muted-foreground" />
                Extension Disconnected
              </Link>
            )}

            {actions}
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
