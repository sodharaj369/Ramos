import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { JobProgressPanel } from "@/components/job-progress";
import { useJobRunner } from "@/hooks/use-job-runner";
import { createImportJob } from "@/lib/jobs.functions";
import { parseCsv, guessFieldForHeader, downloadCsv, toCsv } from "@/lib/csv";
import { LEAD_FIELDS, LEAD_FIELD_LABELS, type LeadField } from "@/lib/domain-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "Import leads — Sales Intelligence" },
      {
        name: "description",
        content:
          "Upload a CSV, map columns to lead fields and import with automatic deduplication.",
      },
      { property: "og:title", content: "Import leads — Sales Intelligence" },
      {
        property: "og:description",
        content: "Upload a CSV and import leads with automatic deduplication.",
      },
    ],
  }),
  component: ImportPage,
});

const SKIP = "__skip__";

function ImportPage() {
  const createJob = useServerFn(createImportJob);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const runner = useJobRunner(() => toast.success("Import finished."));

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0) {
      toast.error("That file has no header row.");
      return;
    }
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    const auto: Record<number, string> = {};
    parsed.headers.forEach((header, index) => {
      auto[index] = guessFieldForHeader(header) ?? SKIP;
    });
    setMapping(auto);
  };

  const mappedRows = () => {
    const out: Record<string, string>[] = [];
    for (const row of rows) {
      const record: Record<string, string> = {};
      headers.forEach((_, index) => {
        const field = mapping[index];
        if (!field || field === SKIP) return;
        const value = (row[index] ?? "").trim();
        if (value) record[field] = value;
      });
      if (record["company_name"]) out.push(record);
    }
    return out;
  };

  const startImport = async () => {
    const data = mappedRows();
    if (data.length === 0) {
      toast.error("Map a column to “Company name” — rows without it are skipped.");
      return;
    }
    if (data.length > 5000) {
      toast.error("Please split files larger than 5,000 rows.");
      return;
    }
    const { jobId } = await createJob({
      data: { label: fileName || "CSV", rows: data as never },
    });
    await runner.start(jobId);
  };

  const downloadTemplate = () => {
    downloadCsv(
      "lead-import-template.csv",
      toCsv([Object.fromEntries(LEAD_FIELDS.map((f) => [f, ""]))], [...LEAD_FIELDS]),
    );
  };

  const skipped = rows.length - mappedRows().length;

  return (
    <AppShell
      title="Import leads"
      description="CSV upload with column mapping, preview and deduplication on import."
      actions={
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          Download template
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="rounded-lg border border-dashed border-border bg-card p-6">
          <Label htmlFor="csv" className="text-sm font-medium">
            CSV file
          </Label>
          <Input
            id="csv"
            type="file"
            accept=".csv,text/csv"
            className="mt-2 max-w-md"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
          {fileName ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {fileName} — {rows.length.toLocaleString()} data row(s)
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              The first row must contain column headers.
            </p>
          )}
        </div>

        {headers.length > 0 ? (
          <>
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Map columns</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {headers.map((header, index) => (
                  <div key={`${header}-${index}`} className="space-y-1.5">
                    <Label className="truncate text-xs">{header || `Column ${index + 1}`}</Label>
                    <Select
                      value={mapping[index] ?? SKIP}
                      onValueChange={(v) => setMapping((m) => ({ ...m, [index]: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SKIP}>Do not import</SelectItem>
                        {LEAD_FIELDS.map((field) => (
                          <SelectItem key={field} value={field}>
                            {LEAD_FIELD_LABELS[field as LeadField]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Preview (first 5 rows)</h2>
                {skipped > 0 ? (
                  <span className="text-xs text-warning-foreground">
                    {skipped.toLocaleString()} row(s) will be skipped — no company name
                  </span>
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60 text-xs text-muted-foreground uppercase">
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                          {mapping[i] && mapping[i] !== SKIP
                            ? LEAD_FIELD_LABELS[mapping[i] as LeadField]
                            : `${h} (skipped)`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.slice(0, 5).map((row, ri) => (
                      <tr key={ri}>
                        {headers.map((_, ci) => (
                          <td key={ci} className="max-w-56 truncate px-3 py-2">
                            {row[ci]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <Button onClick={startImport} disabled={runner.running}>
              <Upload className="size-4" />
              {runner.running ? "Importing…" : `Import ${mappedRows().length} lead(s)`}
            </Button>
          </>
        ) : null}

        <JobProgressPanel progress={runner.progress} error={runner.error} running={runner.running} />
      </div>
    </AppShell>
  );
}
