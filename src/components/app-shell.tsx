import { Link, useRouter } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  Briefcase,
  Database,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  History,
  LogOut,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

const NAV_GROUPS: { title: string; items: { to: string; label: string; icon: typeof Search }[] }[] = [
  { title: "Overview", items: [{ to: "/dashboard", label: "Dashboard", icon: BarChart3 }] },
  {
    title: "Leads",
    items: [
      { to: "/finder", label: "Find Leads", icon: Search },
      { to: "/leads", label: "Leads", icon: Database },
      { to: "/import", label: "Import", icon: Upload },
    ],
  },
  {
    title: "Email",
    items: [
      { to: "/verification", label: "Email Verification", icon: ShieldCheck },
      { to: "/verification-history", label: "Verification History", icon: History },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/jobs", label: "Jobs", icon: Briefcase },
      { to: "/documentation", label: "Documentation", icon: BookOpen },
      { to: "/settings", label: "Settings", icon: Settings },
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

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="border-b border-sidebar-border px-5 py-4">
          <p className="font-[family-name:var(--font-display)] text-sm font-bold tracking-tight text-sidebar-accent-foreground">
            Sales Intelligence
          </p>
          <p className="text-[11px] text-sidebar-foreground/60">Internal lead platform</p>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-2 pb-1.5 text-[10px] font-semibold tracking-widest text-sidebar-foreground/45 uppercase">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    activeProps={{
                      className:
                        "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                    }}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border px-4 py-3">
          <p className="truncate text-xs text-sidebar-foreground/70">{user?.email ?? "—"}</p>
          <button
            onClick={signOut}
            className="mt-2 flex items-center gap-2 text-xs text-sidebar-foreground/70 transition-colors hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-6 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
        <div className="lg:hidden">
          <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-3 py-2">
            {NAV_GROUPS.flatMap((g) => g.items).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap text-muted-foreground"
                activeProps={{ className: "bg-secondary text-foreground font-medium" }}
              >
                {item.label}
              </Link>
            ))}
            <Button variant="ghost" size="sm" className="text-xs" onClick={signOut}>
              Sign out
            </Button>
          </nav>
        </div>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
