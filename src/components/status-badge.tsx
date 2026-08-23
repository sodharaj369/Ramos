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
  not_checked: "bg-muted text-muted-foreground border-border",
  pending: "bg-warning/15 text-warning-foreground border-warning/40",
  unverified: "bg-muted text-muted-foreground border-border",
};

const DOTS: Record<EmailStatus, string> = {
  valid: "bg-success",
  invalid: "bg-destructive",
  catch_all: "bg-warning",
  disposable: "bg-warning",
  role: "bg-info",
  risky: "bg-warning",
  unknown: "bg-muted-foreground/50",
  not_checked: "bg-muted-foreground/50",
  pending: "bg-warning",
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
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
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
  queued: "bg-muted text-muted-foreground border-border",
  running: "bg-info/12 text-info border-info/30",
  completed: "bg-success/12 text-success border-success/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const JOB_DOTS: Record<string, string> = {
  queued: "bg-muted-foreground/50",
  running: "bg-info animate-pulse",
  completed: "bg-success",
  failed: "bg-destructive",
  cancelled: "bg-muted-foreground/40",
};

export function JobStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium capitalize whitespace-nowrap transition-colors",
        JOB_STYLES[normalized] ?? JOB_STYLES["queued"],
      )}
    >
      <span className={cn("size-1.5 rounded-full", JOB_DOTS[normalized] ?? JOB_DOTS["queued"])} aria-hidden />
      {status}
    </span>
  );
}

export function SemanticStatusBadge({
  status,
  label,
  className,
}: {
  status: "green" | "amber" | "red" | "gray" | string;
  label: string;
  className?: string;
}) {
  let styleClass = "bg-muted text-muted-foreground border-border";
  let dotClass = "bg-muted-foreground/50";

  switch (status.toLowerCase()) {
    case "green":
    case "valid":
    case "connected":
    case "completed":
    case "ready":
    case "success":
    case "enabled":
      styleClass = "bg-success/12 text-success border-success/30";
      dotClass = "bg-success";
      break;
    case "amber":
    case "risky":
    case "pending":
    case "warning":
    case "partial":
    case "unconfigured":
    case "modified":
      styleClass = "bg-warning/15 text-warning-foreground border-warning/40";
      dotClass = "bg-warning";
      break;
    case "blue":
    case "info":
    case "saving":
      styleClass = "bg-info/12 text-info border-info/30";
      dotClass = "bg-info animate-pulse";
      break;
    case "red":
    case "invalid":
    case "failed":
    case "error":
    case "disconnected":
      styleClass = "bg-destructive/10 text-destructive border-destructive/30";
      dotClass = "bg-destructive";
      break;
    case "gray":
    case "unknown":
    case "unverified":
    case "disabled":
    default:
      styleClass = "bg-muted text-muted-foreground border-border";
      dotClass = "bg-muted-foreground/40";
      break;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
        styleClass,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", dotClass)} aria-hidden />
      {label}
    </span>
  );
}
