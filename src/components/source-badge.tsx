import { cn } from "@/lib/utils";

/** Human labels for the raw `source` values written by the ingestion pipeline. */
const SOURCE_LABEL: Record<string, string> = {
  "chrome-extension": "Chrome Extension",
  "self-hosted-google-maps": "Server Scraper",
  "google-maps": "Server Scraper",
  manual: "Manual",
  import: "CSV Import",
  csv: "CSV Import",
  demo: "Demo",
};

const SOURCE_STYLE: Record<string, string> = {
  "chrome-extension": "bg-info/12 text-info border-info/30",
  "self-hosted-google-maps": "bg-secondary text-secondary-foreground border-border",
  "google-maps": "bg-secondary text-secondary-foreground border-border",
  manual: "bg-secondary text-secondary-foreground border-border",
  import: "bg-secondary text-secondary-foreground border-border",
  csv: "bg-secondary text-secondary-foreground border-border",
  demo: "bg-warning/15 text-warning-foreground border-warning/40",
};

export function SourceBadge({ source }: { source?: string | null }) {
  if (!source) return <span className="text-xs text-muted-foreground">—</span>;
  const key = source.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        SOURCE_STYLE[key] ?? "bg-secondary text-secondary-foreground border-border",
      )}
    >
      {SOURCE_LABEL[key] ?? source}
    </span>
  );
}
