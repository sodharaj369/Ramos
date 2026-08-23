import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Standardized EmptyState component for zero-data views across the application. */
export function EmptyState({
  icon,
  title,
  heading,
  description,
  action,
  secondaryAction,
  className,
}: {
  icon?: ReactNode;
  title?: string;
  heading?: string;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}) {
  const displayTitle = title ?? heading ?? "No items found";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center shadow-xs transition-colors",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-foreground tracking-tight">{displayTitle}</h3>
      {description ? (
        <div className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</div>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-4 flex flex-wrap justify-center items-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
