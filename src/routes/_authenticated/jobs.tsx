import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { JobStatusBadge } from "@/components/status-badge";
import { JobProgressPanel } from "@/components/job-progress";
import { useJobRunner } from "@/hooks/use-job-runner";
import { cancelJob, listJobs } from "@/lib/jobs.functions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

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

function JobsPage() {
  const listFn = useServerFn(listJobs);
  const cancelFn = useServerFn(cancelJob);
  const query = useQuery({ queryKey: ["jobs"], queryFn: () => listFn({}), refetchInterval: 15000 });
  const runner = useJobRunner(() => {
    toast.success("Job finished.");
    query.refetch();
  });

  const jobs = query.data ?? [];

  return (
    <AppShell title="Jobs" description="Batched background work — resumable and cancellable.">
      <div className="space-y-4">
        <JobProgressPanel progress={runner.progress} error={runner.error} running={runner.running} />

        <p className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          Jobs progress only while this browser tab is open — batches are driven from the app, and
          there is no server-side worker or cron yet. A job left unfinished stays resumable: reopen
          this page and click Resume to continue from the last cursor position.
        </p>

        {jobs.length === 0 ? (
          <p className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            No jobs yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job: any) => {
              const percent = job.total ? Math.round((job.processed / job.total) * 100) : 0;
              const resumable = job.status === "queued" || job.status === "running";
              return (
                <li key={job.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{job.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.type}
                        {job.provider ? ` · ${job.provider}` : ""} ·{" "}
                        {new Date(job.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <JobStatusBadge status={job.status} />
                      {resumable ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={runner.running}
                            onClick={() => runner.start(job.id)}
                          >
                            Resume
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              await cancelFn({ data: { jobId: job.id } });
                              query.refetch();
                            }}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Progress value={percent} />
                    <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                      <span className="tabular">
                        {job.processed}/{job.total}
                      </span>
                      {Object.entries((job.counters ?? {}) as Record<string, number>).map(
                        ([key, value]) => (
                          <span key={key}>
                            {key}: <span className="tabular text-foreground">{value}</span>
                          </span>
                        ),
                      )}
                    </div>
                    {job.error ? <p className="text-xs text-destructive">{job.error}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
