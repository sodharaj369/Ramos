import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Database,
  HelpCircle,
  MailCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BreakdownList, StatCard } from "@/components/stat-card";
import { getDashboardStats, listLeads } from "@/lib/leads.functions";
import { listJobs } from "@/lib/jobs.functions";
import { EmailStatusBadge, JobStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Sales Intelligence" },
      {
        name: "description",
        content: "Operational overview of company leads, verification health and background jobs.",
      },
      { property: "og:title", content: "Dashboard — Sales Intelligence" },
      {
        property: "og:description",
        content: "Operational overview of company leads, verification health and background jobs.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const statsFn = useServerFn(getDashboardStats);
  const jobsFn = useServerFn(listJobs);
  const listLeadsFn = useServerFn(listLeads);

  const statsQuery = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => statsFn({}) });
  const jobsQuery = useQuery({ queryKey: ["jobs"], queryFn: () => jobsFn({}) });
  const recentLeadsQuery = useQuery({
    queryKey: ["dashboard-recent-leads"],
    queryFn: () => listLeadsFn({ data: { page: 0, pageSize: 5, sortBy: "discovered_at", sortDir: "desc" } }),
  });

  const s = statsQuery.data;
  const recentJobs = (jobsQuery.data ?? []).slice(0, 5);
  const failedJobs = (jobsQuery.data ?? []).filter((j: any) => j.status === "failed");
  const recentLeads = (recentLeadsQuery.data?.rows ?? []).slice(0, 5) as any[];

  return (
    <AppShell
      title="Dashboard"
      description="Operational pipeline overview, deliverability metrics and background job health."
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link to="/import">
              <Upload className="size-4 mr-1.5" /> Import CSV
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/finder">
              <Search className="size-4 mr-1.5" /> Find leads
            </Link>
          </Button>
        </>
      }
    >
      {statsQuery.isLoading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-80 lg:col-span-2 rounded-lg" />
            <Skeleton className="h-80 rounded-lg" />
          </div>
        </div>
      ) : statsQuery.error ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="size-8 text-destructive" />
          <h3 className="mt-2 text-sm font-semibold text-foreground">Could not load dashboard statistics</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {statsQuery.error instanceof Error ? statsQuery.error.message : "An unexpected network error occurred."}
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => statsQuery.refetch()}>
            <RefreshCw className="size-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      ) : s ? (
        <div className="space-y-6">
          {/* Actionable Attention Alert Header */}
          {failedJobs.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle className="size-4 shrink-0 text-destructive" />
                <p className="truncate text-xs sm:text-sm font-medium">
                  <span className="font-semibold">{failedJobs.length} background job(s)</span> encountered errors requiring attention.
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/15">
                <Link to="/jobs">Review Jobs</Link>
              </Button>
            </div>
          ) : null}

          {/* KPI Cards — Row 1: Core Pipeline */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total leads"
              value={s.total.toLocaleString()}
              hint={`${s.newLast7Days.toLocaleString()} added in last 7 days`}
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
                  ? "No verifications run yet"
                  : `${s.verificationSuccessRate}% deliverability success rate`
              }
              icon={<MailCheck className="size-4" />}
            />
            <StatCard
              label="Verifications run"
              value={s.verificationsTotal.toLocaleString()}
              hint={`${s.unverified.toLocaleString()} leads unverified`}
              icon={<ShieldCheck className="size-4" />}
            />
          </div>

          {/* KPI Cards — Row 2: Deliverability Breakdown & Contactability */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Invalid emails"
              value={s.invalid.toLocaleString()}
              tone="danger"
              hint="Bounced / non-existent domains"
              icon={<XCircle className="size-4" />}
            />
            <StatCard
              label="Risky emails"
              value={s.risky.toLocaleString()}
              tone="warning"
              hint="Catch-all & disposable domains"
              icon={<AlertCircle className="size-4" />}
            />
            <StatCard
              label="Unknown result"
              value={s.unknown.toLocaleString()}
              hint="SMTP handshake timeout"
              icon={<HelpCircle className="size-4" />}
            />
            <StatCard
              label="Contactability"
              value={`${s.withEmail.toLocaleString()} emails`}
              hint={`${s.withPhone.toLocaleString()} phones · ${s.withWebsite.toLocaleString()} websites`}
              icon={<Users className="size-4" />}
            />
          </div>

          {/* Quick Actions Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-xs">
            <div>
              <p className="font-display text-sm font-semibold text-foreground">Pipeline Quick Actions</p>
              <p className="text-xs text-muted-foreground">Jump directly to key lead discovery, verification and management tasks.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link to="/finder">
                  <Search className="size-3.5 mr-1.5" /> Find Leads
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/leads">
                  <Database className="size-3.5 mr-1.5" /> Manage Leads
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/verification">
                  <ShieldCheck className="size-3.5 mr-1.5" /> Verify Emails
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/jobs">
                  <Briefcase className="size-3.5 mr-1.5" /> Monitor Jobs
                </Link>
              </Button>
            </div>
          </div>

          {/* Primary Work Area: Recent Leads & Recent Jobs */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Recent Leads Preview (2/3 width) */}
            <div className="flex flex-col rounded-lg border border-border bg-card shadow-xs lg:col-span-2">
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <div>
                  <h3 className="font-display text-sm font-semibold text-foreground">Recent Leads</h3>
                  <p className="text-[11px] text-muted-foreground">Latest company prospects added to the pipeline</p>
                </div>
                <Button asChild variant="ghost" size="sm" className="text-xs text-primary hover:text-primary">
                  <Link to="/leads">
                    View all leads <ArrowRight className="size-3 ml-1" />
                  </Link>
                </Button>
              </div>

              {recentLeadsQuery.isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : recentLeads.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={<Database className="size-5" />}
                    title="No leads in pipeline"
                    description="Start by discovering company leads on Google Maps or importing a CSV list."
                    action={
                      <Button asChild size="sm">
                        <Link to="/finder">Find Leads</Link>
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-secondary/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-2.5">Company</th>
                        <th className="px-4 py-2.5">Location</th>
                        <th className="px-4 py-2.5">Email Status</th>
                        <th className="px-4 py-2.5">Discovered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {recentLeads.map((lead) => (
                        <tr key={lead.id} className="transition-colors hover:bg-secondary/40">
                          <td className="px-4 py-3 font-medium text-foreground">
                            <Link to="/leads/$id" params={{ id: lead.id }} className="hover:text-primary transition-colors">
                              {lead.company_name}
                            </Link>
                            {lead.category ? (
                              <p className="text-[11px] font-normal text-muted-foreground">{lead.category}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {[lead.city, lead.country].filter(Boolean).join(", ") || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <EmailStatusBadge status={lead.email_status} />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                            {lead.discovered_at
                              ? new Date(lead.discovered_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent Background Jobs Queue (1/3 width) */}
            <div className="flex flex-col rounded-lg border border-border bg-card shadow-xs">
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <div>
                  <h3 className="font-display text-sm font-semibold text-foreground">Recent Jobs</h3>
                  <p className="text-[11px] text-muted-foreground">Batch execution queue status</p>
                </div>
                <Button asChild variant="ghost" size="sm" className="text-xs text-primary hover:text-primary">
                  <Link to="/jobs">
                    View all <ArrowRight className="size-3 ml-1" />
                  </Link>
                </Button>
              </div>

              {jobsQuery.isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : recentJobs.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={<Briefcase className="size-5" />}
                    title="No background jobs"
                    description="Discovery and verification tasks will appear here when triggered."
                    action={
                      <Button asChild size="sm" variant="outline">
                        <Link to="/finder">Start Discovery</Link>
                      </Button>
                    }
                  />
                </div>
              ) : (
                <ul className="divide-y divide-border flex-1">
                  {recentJobs.map((job: any) => (
                    <li key={job.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs hover:bg-secondary/30 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{job.label}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {job.type} · {new Date(job.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="tabular font-mono text-[11px] text-muted-foreground">
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

          {/* Lead Distribution Breakdowns */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <BreakdownList title="Leads by source" items={s.bySource} total={s.total} />
            <BreakdownList title="Top industries" items={s.byCategory} total={s.total} />
            <BreakdownList title="Top cities" items={s.byCity} total={s.total} />
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
