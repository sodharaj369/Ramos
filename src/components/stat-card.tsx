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

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <p className={cn("tabular mt-2 text-2xl font-semibold", toneClass)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function BreakdownList({
  title,
  items,
  total,
  emptyLabel = "No data yet",
}: {
  title: string;
  items: { label: string; count: number }[];
  total: number;
  emptyLabel?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          items.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate pr-2">{item.label}</span>
                <span className="tabular text-muted-foreground">{item.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary">
                <div
                  className="h-1.5 rounded-full bg-primary"
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
