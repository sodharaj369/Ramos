import { useEffect } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { AdminSettingsPanel } from "@/components/admin-settings-panel";
import { checkIsAdmin } from "@/lib/admin.functions";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/settings/system")({
  head: () => ({
    meta: [
      { title: "System Configuration — Sales Intelligence" },
      {
        name: "description",
        content: "Manage runtime limits, providers, feature flags, integrations and system-wide configuration.",
      },
      { property: "og:title", content: "System Configuration — Sales Intelligence" },
      { property: "og:description", content: "Runtime configuration control console." },
    ],
  }),
  component: SystemConfigPage,
});

function SystemConfigPage() {
  const router = useRouter();
  const checkAdminFn = useServerFn(checkIsAdmin);
  const adminQuery = useQuery({
    queryKey: ["checkIsAdmin"],
    queryFn: () => checkAdminFn({}),
  });

  const isLoading = adminQuery.isLoading;
  const isAdmin = adminQuery.data?.isAdmin === true;

  useEffect(() => {
    if (!isLoading && adminQuery.data && !isAdmin) {
      void router.navigate({ to: "/settings", replace: true });
    }
  }, [isLoading, isAdmin, adminQuery.data, router]);

  if (isLoading) {
    return (
      <AppShell
        title="System Configuration"
        description="Manage runtime limits, providers, feature flags, integrations and system-wide configuration."
      >
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <AppShell
      title="System Configuration"
      description="Manage runtime limits, providers, feature flags, integrations and system-wide configuration."
    >
      <AdminSettingsPanel />
    </AppShell>
  );
}
