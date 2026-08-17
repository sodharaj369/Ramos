import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Database, MailCheck, Search, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BreakdownList, StatCard } from "@/components/stat-card";
import { getDashboardStats } from "@/lib/leads.functions";
import { listJobs } from "@/lib/jobs.functions";
import { JobStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Sales Intelligence" },
      {
        name: "description",
        content: "Team-wide lead totals, email verification quality and recent job activity.",
      },
      { property: "og:title", content: "Dashboard — Sales Intelligence" },
      {
        property: "og:description",
        content: "Team-wide lead totals, verification quality and recent activity.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const stats = useServerFn(getDashboardStats);
  const jobs = useServerFn(listJobs);
  const statsQuery = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => stats({}) });
  const jobsQuery = useQuery({ queryKey: ["jobs"], queryFn: () => jobs({}) });

  const s = statsQuery.data;
  const recent = (jobsQuery.data ?? []).slice(0, 6);

  return (
    <AppShell
      title="Dashboard"
      description="Everything the team has discovered, imported and verified."
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link to="/import">
              <Upload className="size-4" /> Import CSV
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/finder">
              <Search className="size-4" /> Find leads
            </Link>
          </Button>
        </>
      }
    >
      {statsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : statsQuery.error ? (
        <p className="text-sm text-destructive">Could not load dashboard statistics.</p>
      ) : s ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total leads"
              value={s.total.toLocaleString()}
              hint={`${s.newLast7Days.toLocaleString()} added in the last 7 days`}
              icon={<Database className="size-4" />}
            />
            <StatCard
              label="Discovered today"
              value={s.discoveredToday.toLocaleString()}
              hint={`${s.importedToday.toLocaleString()} imported today`}
              icon={<Search className="size-4" />}
            />
            <StatCard
              label="Verified valid"
              value={s.valid.toLocaleString()}
              tone="success"
              hint={
                s.verificationSuccessRate === null
                  ? "No verifications yet"
                  : `${s.verificationSuccessRate}% of verified emails are valid`
              }
              icon={<MailCheck className="size-4" />}
            />
            <StatCard
              label="Verifications run"
              value={s.verificationsTotal.toLocaleString()}
              hint={`${s.unverified.toLocaleString()} leads still unverified`}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Invalid emails" value={s.invalid.toLocaleString()} tone="danger" />
            <StatCard label="Risky emails" value={s.risky.toLocaleString()} tone="warning" />
            <StatCard label="Unknown result" value={s.unknown.toLocaleString()} />
            <StatCard
              label="Contactability"
              value={`${s.withEmail.toLocaleString()} emails`}
              hint={`${s.withPhone.toLocaleString()} phones · ${s.withWebsite.toLocaleString()} websites`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <BreakdownList title="Leads by source" items={s.bySource} total={s.total} />
            <BreakdownList title="Top industries" items={s.byCategory} total={s.total} />
            <BreakdownList title="Top cities" items={s.byCity} total={s.total} />
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">Recent jobs</h3>
              <Link to="/jobs" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            {recent.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No jobs yet. Run a search from the Lead Finder to get started.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((job) => (
                  <li key={job.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{job.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.type} · {new Date(job.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="tabular text-xs text-muted-foreground">
                        {job.processed}/{job.total}
                      </span>
                      <JobStatusBadge status={job.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
