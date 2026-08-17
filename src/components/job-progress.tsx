import { useEffect, useState } from "react";
import type { JobProgress } from "@/hooks/use-job-runner";
import { Progress } from "@/components/ui/progress";

const COUNTER_LABELS: Record<string, string> = {
  created: "New leads",
  duplicate: "Duplicates",
  enriched: "Enriched duplicates",
  invalid: "Invalid rows",
  valid: "Valid",
  risky: "Risky",
  unknown: "Unknown",
  failed: "Failed",
  found: "Found by source",
  with_website: "With website",
  with_email: "With email",
  with_phone: "With phone",
};

/** Seconds elapsed since the panel started showing a running job. */
function useElapsedSeconds(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return seconds;
}

function stageLabel(progress: JobProgress, running: boolean, seconds: number): string {
  if (!running) {
    if (progress.status === "completed") {
      const created = progress.counters?.["created"];
      const found = progress.counters?.["found"] ?? progress.total;
      return typeof created === "number"
        ? `Found ${found} businesses — ${created} new leads saved`
        : `Found ${found} leads`;
    }
    return progress.status;
  }
  // While the source is still working the job has no known total yet.
  if (progress.total === 0) {
    if (seconds < 5) return "Finding businesses…";
    if (seconds < 30) return "Searching Google Maps…";
    return "Collecting business details…";
  }
  return "Processing leads…";
}

export function JobProgressPanel({
  progress,
  error,
  running,
}: {
  progress: JobProgress | null;
  error?: string | null;
  running?: boolean;
}) {
  const seconds = useElapsedSeconds(Boolean(running));
  if (!progress && !error) return null;
  const percent =
    progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  const waiting = Boolean(running) && progress?.total === 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : progress ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium capitalize">
              {stageLabel(progress, Boolean(running), seconds)}
            </span>
            <span className="tabular text-muted-foreground">
              {waiting
                ? `${seconds}s`
                : `${progress.processed.toLocaleString()} / ${progress.total.toLocaleString()}`}
            </span>
          </div>
          <Progress value={waiting ? undefined : percent} className={waiting ? "animate-pulse" : ""} />
          {waiting && seconds >= 30 ? (
            <p className="text-xs text-muted-foreground">
              Real searches can take a few minutes. Keep this tab open — the app is still waiting for
              the discovery service.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {Object.entries(progress.counters ?? {}).map(([key, value]) => (
              <span key={key} className="text-muted-foreground">
                {COUNTER_LABELS[key] ?? key}:{" "}
                <span className="tabular font-medium text-foreground">{value}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
