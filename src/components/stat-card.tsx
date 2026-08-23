import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning-foreground",
    danger: "text-destructive",
    info: "text-info",
  }[tone];

  const iconBg = {
    default: "bg-secondary text-muted-foreground",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning-foreground",
    danger: "bg-destructive/12 text-destructive",
    info: "bg-info/12 text-info",
  }[tone];

  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-lg border border-border bg-card p-4.5 shadow-xs transition-colors hover:border-border/80",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
        {icon ? (
          <div className={cn("flex size-7 items-center justify-center rounded-md text-xs", iconBg)}>
            {icon}
          </div>
        ) : null}
      </div>
      <div className="mt-3">
        <p className={cn("tabular font-display text-2xl font-bold tracking-tight", toneClass)}>
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

export function BreakdownList({
  title,
  items,
  total,
  emptyLabel = "No data recorded yet",
}: {
  title: string;
  items: { label: string; count: number }[];
  total: number;
  emptyLabel?: string;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4.5 shadow-xs">
      <h3 className="font-display text-sm font-semibold text-foreground tracking-tight">{title}</h3>
      <div className="mt-3.5 space-y-2.5 flex-1">
        {items.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">{emptyLabel}</p>
        ) : (
          items.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate font-medium text-foreground pr-2">{item.label}</span>
                <span className="tabular text-muted-foreground font-mono">{item.count.toLocaleString()}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-1.5 rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${total ? Math.max(4, (item.count / total) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
