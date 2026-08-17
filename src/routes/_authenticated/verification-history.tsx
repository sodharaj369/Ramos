import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmailStatusBadge } from "@/components/status-badge";
import { listVerifications } from "@/lib/verification.functions";
import { EMAIL_STATUS_LABEL, VERIFICATION_STATUSES } from "@/lib/domain-types";
import { downloadCsv, toCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/verification-history")({
  head: () => ({
    meta: [
      { title: "Verification history — Sales Intelligence" },
      {
        name: "description",
        content: "Every email verification the team has run, with result, reason and provider.",
      },
      { property: "og:title", content: "Verification history — Sales Intelligence" },
      {
        property: "og:description",
        content: "Every verification the team has run, with result and reason.",
      },
    ],
  }),
  component: HistoryPage,
});

const ANY = "__any__";

function HistoryPage() {
  const listFn = useServerFn(listVerifications);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ANY);
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["verifications", search, status, page],
    queryFn: () =>
      listFn({ data: { search: search || null, status: status === ANY ? null : status, page } }),
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / (query.data?.pageSize ?? 50)));

  return (
    <AppShell
      title="Verification history"
      description={`${total.toLocaleString()} verification result(s) recorded.`}
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={rows.length === 0}
          onClick={() =>
            downloadCsv(
              `verifications-${new Date().toISOString().slice(0, 10)}.csv`,
              toCsv(rows as any),
            )
          }
        >
          <Download className="size-4" /> Export page
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Input
            className="max-w-xs"
            placeholder="Search email…"
            value={search}
            onChange={(e) => {
              setPage(0);
              setSearch(e.target.value);
            }}
          />
          <Select
            value={status}
            onValueChange={(v) => {
              setPage(0);
              setStatus(v);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any status</SelectItem>
              {VERIFICATION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {EMAIL_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">Email</th>
                <th className="px-3 py-2.5 text-left font-medium">Result</th>
                <th className="px-3 py-2.5 text-left font-medium">SMTP</th>
                <th className="px-3 py-2.5 text-left font-medium">Reason</th>
                <th className="px-3 py-2.5 text-left font-medium">Provider</th>
                <th className="px-3 py-2.5 text-left font-medium">Run by</th>
                <th className="px-3 py-2.5 text-left font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No verification results yet.
                  </td>
                </tr>
              ) : (
                rows.map((row: any) => (
                  <tr key={row.id} className="hover:bg-secondary/40">
                    <td className="px-3 py-2.5">{row.email}</td>
                    <td className="px-3 py-2.5">
                      <EmailStatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {row.smtp_result ?? "not_checked"}
                      {row.catch_all ? " · catch-all" : ""}
                      {row.mx_valid === false ? " · no MX" : ""}
                    </td>
                    <td className="max-w-80 px-3 py-2.5 text-muted-foreground">{row.reason}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.provider}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {row.user_name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
