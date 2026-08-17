import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { runJobBatch } from "@/lib/jobs.functions";

export interface JobProgress {
  id: string;
  status: string;
  processed: number;
  total: number;
  counters: Record<string, number>;
}

/**
 * Drives a job to completion in batches. Work happens server-side one batch at
 * a time, so the browser stays responsive and the job can be resumed later
 * from the Jobs page if the user navigates away.
 */
export function useJobRunner(onFinished?: () => void) {
  const runBatch = useServerFn(runJobBatch);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  const start = useCallback(
    async (jobId: string) => {
      cancelled.current = false;
      setRunning(true);
      setError(null);
      setProgress({ id: jobId, status: "running", processed: 0, total: 0, counters: {} });
      try {
        for (let guard = 0; guard < 2000; guard++) {
          if (cancelled.current) break;
          const next = (await runBatch({ data: { jobId } })) as JobProgress;
          setProgress(next);
          if (["completed", "failed", "cancelled"].includes(next.status)) break;
        }
        onFinished?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "The job could not be completed.");
      } finally {
        setRunning(false);
      }
    },
    [runBatch, onFinished],
  );

  const stop = useCallback(() => {
    cancelled.current = true;
    setRunning(false);
  }, []);

  return { start, stop, progress, error, running, reset: () => setProgress(null) };
}
