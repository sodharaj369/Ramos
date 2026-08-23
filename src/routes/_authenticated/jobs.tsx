import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  AlertTriangle,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  StopCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { JobStatusBadge } from "@/components/status-badge";
import { JobProgressPanel } from "@/components/job-progress";
import { EmptyState } from "@/components/empty-state";
import { useJobRunner } from "@/hooks/use-job-runner";
import { cancelJob, listJobs } from "@/lib/jobs.functions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({
    meta: [
      { title: "Jobs — Sales Intelligence" },
      {
        name: "description",
        content: "Track discovery, import and verification jobs; resume or cancel long runs.",
      },
      { property: "og:title", content: "Jobs — Sales Intelligence" },
      {
        property: "og:description",
        content: "Track discovery, import and verification jobs.",
      },
    ],
  }),
  component: JobsPage,
});

const COUNTER_LABELS: Record<string, string> = {
  created: "New leads",
  duplicate: "Duplicates",
  enriched: "Enriched",
  invalid: "Invalid",
  valid: "Valid",
  risky: "Risky",
  unknown: "Unknown",
  failed: "Failed",
  found: "Found",
  with_website: "With website",
  with_email: "With email",
  with_phone: "With phone",
};

function formatJobDate(isoStr?: string | null) {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "—";
    const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    return `${date} · ${time}`;
  } catch {
    return isoStr;
  }
}

function JobsPage() {
  const listFn = useServerFn(listJobs);
  const cancelFn = useServerFn(cancelJob);

  const query = useQuery({ queryKey: ["jobs"], queryFn: () => listFn({}), refetchInterval: 15000 });
  const runner = useJobRunner(() => {
    toast.success("Job execution finished.");
    query.refetch();
  });

  const [expandedJobIds, setExpandedJobIds] = useState<string[]>([]);
  const [jobToCancel, setJobToCancel] = useState<{ id: string; label: string } | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const jobs = (query.data ?? []) as any[];

  const toggleExpand = (id: string) => {
    setExpandedJobIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const confirmCancelJob = async () => {
    if (!jobToCancel) return;
    setIsCancelling(true);
    try {
      await cancelFn({ data: { jobId: jobToCancel.id } });
      toast.success(`Job "${jobToCancel.label}" cancelled.`);
      setJobToCancel(null);
      query.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel job.");
    } finally {
      setIsCancelling(false);
    }
  };

  const runningCount = jobs.filter((j) => j.status === "running").length;
  const queuedCount = jobs.filter((j) => j.status === "queued").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;

  return (
    <AppShell
      title="Jobs Queue"
      description="Operational control center for background discovery, verification and import tasks."
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={cn("size-4 mr-1.5", query.isFetching ? "animate-spin text-primary" : "")} />
            {query.isFetching ? "Refreshing..." : "Refresh queue"}
          </Button>
          <Button asChild size="sm">
            <Link to="/finder">
              <Search className="size-4 mr-1.5" /> Find leads
            </Link>
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Active Job Progress Execution Panel */}
        <JobProgressPanel progress={runner.progress} error={runner.error} running={runner.running} />

        {/* Informational Guidance Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 text-xs shadow-xs">
          <div className="flex items-start gap-2.5 min-w-0">
            <Info className="size-4 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Browser-Driven Batch Architecture</p>
              <p className="text-muted-foreground mt-0.5">
                Jobs progress sequentially while this tab is active. Unfinished runs remain resumable — reopen this page and click <span className="font-medium text-foreground">Resume</span> to continue processing from the last saved cursor.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground font-mono shrink-0">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-success animate-pulse" />
              Auto-sync 15s
            </span>
          </div>
        </div>

        {/* Operational Status Filter Chips */}
        {jobs.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-foreground">Queue Status:</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1 font-medium">
              Total: {jobs.length}
            </span>
            {runningCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-info/30 bg-info/12 px-2.5 py-1 font-medium text-info">
                <span className="size-1.5 rounded-full bg-info animate-pulse" />
                {runningCount} Running
              </span>
            ) : null}
            {queuedCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 font-medium text-muted-foreground">
                {queuedCount} Queued
              </span>
            ) : null}
            {failedCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/12 px-2.5 py-1 font-medium text-destructive">
                <AlertCircle className="size-3" />
                {failedCount} Requiring Attention
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Main Job Queue Container */}
        {query.isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        ) : query.error ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <h3 className="mt-2 text-sm font-semibold text-foreground">Unable to load job queue</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {query.error instanceof Error ? query.error.message : "A database query error occurred."}
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => query.refetch()}>
              <RefreshCw className="size-3.5 mr-1.5" /> Try again
            </Button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-6">
            <EmptyState
              icon={<Briefcase className="size-6" />}
              title="No background jobs recorded"
              description="Batch discovery runs, CSV imports and email verification tasks will appear here."
              action={
                <div className="flex gap-2">
                  <Button asChild size="sm">
                    <Link to="/finder">Find Leads</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/verification">Verify Emails</Link>
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <ul className="space-y-4">
            {jobs.map((job: any) => {
              const percent = job.total ? Math.round((job.processed / job.total) * 100) : 0;
              const isResumable = job.status === "queued" || job.status === "running";
              const isExpanded = expandedJobIds.includes(job.id);
              const counters = (job.counters ?? {}) as Record<string, number>;

              return (
                <li
                  key={job.id}
                  className={cn(
                    "rounded-lg border bg-card p-4.5 shadow-xs transition-colors",
                    job.status === "failed" ? "border-destructive/30" : "border-border",
                  )}
                >
                  {/* Job Header Row */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <JobStatusBadge status={job.status} />
                        <h3 className="font-display font-semibold text-foreground text-sm truncate">
                          {job.label}
                        </h3>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground capitalize">{job.type}</span>
                        {job.provider ? (
                          <>
                            <span>·</span>
                            <span>Provider: {job.provider}</span>
                          </>
                        ) : null}
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatJobDate(job.created_at)}
                        </span>
                      </p>
                    </div>

                    {/* Operational Action Controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isResumable ? (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            disabled={runner.running}
                            onClick={() => runner.start(job.id)}
                            className="h-8 text-xs"
                          >
                            <Play className="size-3.5 mr-1" /> Resume
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setJobToCancel({ id: job.id, label: job.label })}
                            className="h-8 text-xs text-destructive hover:bg-destructive/10"
                          >
                            <StopCircle className="size-3.5 mr-1" /> Cancel
                          </Button>
                        </>
                      ) : null}

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleExpand(job.id)}
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? (
                          <>
                            Hide <ChevronUp className="size-3.5 ml-1" />
                          </>
                        ) : (
                          <>
                            Details <ChevronDown className="size-3.5 ml-1" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Progress Bar & Counters */}
                  <div className="mt-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">Progress</span>
                      <span className="tabular font-mono text-muted-foreground font-medium">
                        {job.processed.toLocaleString()} / {job.total.toLocaleString()} ({percent}%)
                      </span>
                    </div>
                    <Progress value={percent} className="h-2" />

                    {/* Metric Counter Chips */}
                    {Object.keys(counters).length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {Object.entries(counters).map(([key, value]) => (
                          <span
                            key={key}
                            className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {COUNTER_LABELS[key] ?? key}:{" "}
                            <span className="font-mono font-semibold text-foreground">{value}</span>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* Clear Failure/Error Presentation */}
                  {job.error ? (
                    <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                      <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-semibold">Execution Failure</p>
                        <p className="mt-0.5 break-words font-mono text-[11px] opacity-90">{job.error}</p>
                      </div>
                    </div>
                  ) : null}

                  {/* Expandable Technical Log Panel */}
                  {isExpanded ? (
                    <div className="mt-4 border-t border-border pt-3.5 space-y-2 text-xs">
                      <p className="font-semibold text-foreground">Technical Details & Metadata</p>
                      <div className="grid gap-2 sm:grid-cols-2 bg-secondary/50 p-3 rounded-md font-mono text-[11px]">
                        <div>
                          <span className="text-muted-foreground">Job ID:</span> {job.id}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Status:</span> {job.status}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Created:</span> {formatJobDate(job.created_at)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Updated:</span> {formatJobDate(job.updated_at)}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Radix AlertDialog for Job Cancellation */}
      <AlertDialog open={Boolean(jobToCancel)} onOpenChange={(open) => !open && setJobToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-base font-bold">
              Cancel job &quot;{jobToCancel?.label}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              This will stop active batch execution for this job. Any leads already processed or imported will remain safely saved in the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Keep running</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmCancelJob();
              }}
              disabled={isCancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCancelling ? "Cancelling..." : "Cancel job"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
