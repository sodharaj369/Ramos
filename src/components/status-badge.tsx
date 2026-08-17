import { cn } from "@/lib/utils";
import { EMAIL_STATUS_LABEL, type EmailStatus } from "@/lib/domain-types";

const STYLES: Record<EmailStatus, string> = {
  valid: "bg-success/12 text-success border-success/30",
  invalid: "bg-destructive/10 text-destructive border-destructive/30",
  catch_all: "bg-warning/15 text-warning-foreground border-warning/40",
  disposable: "bg-warning/25 text-warning-foreground border-warning/60",
  role: "bg-info/12 text-info border-info/30",
  risky: "bg-warning/15 text-warning-foreground border-warning/40",
  unknown: "bg-muted text-muted-foreground border-border",
  not_checked: "bg-foreground/5 text-muted-foreground border-border",
  pending: "bg-info/12 text-info border-info/30",
  unverified: "bg-secondary text-muted-foreground border-border",
};

const DOTS: Record<EmailStatus, string> = {
  valid: "bg-success",
  invalid: "bg-destructive",
  catch_all: "bg-warning",
  disposable: "bg-warning",
  role: "bg-info",
  risky: "bg-warning",
  unknown: "bg-muted-foreground/50",
  not_checked: "bg-foreground/40",
  pending: "bg-info",
  unverified: "bg-muted-foreground/40",
};


export function EmailStatusBadge({
  status,
  className,
}: {
  status: EmailStatus | string | null | undefined;
  className?: string;
}) {
  const key = (status ?? "unverified") as EmailStatus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        STYLES[key] ?? STYLES.unverified,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOTS[key] ?? DOTS.unverified)} aria-hidden />
      {EMAIL_STATUS_LABEL[key] ?? key}
    </span>

  );
}

const JOB_STYLES: Record<string, string> = {
  queued: "bg-secondary text-muted-foreground border-border",
  running: "bg-info/12 text-info border-info/30",
  completed: "bg-success/12 text-success border-success/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export function JobStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        JOB_STYLES[status] ?? JOB_STYLES["queued"],
      )}
    >
      {status}
    </span>
  );
}
