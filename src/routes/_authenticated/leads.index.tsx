import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, MailCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { EmailStatusBadge } from "@/components/status-badge";
import { JobProgressPanel } from "@/components/job-progress";
import { useJobRunner } from "@/hooks/use-job-runner";
import { deleteLeads, exportLeads, listLeads, type LeadFilters } from "@/lib/leads.functions";
import { createVerificationJob } from "@/lib/jobs.functions";
import { listLeadsForVerification } from "@/lib/verification.functions";
import { downloadCsv, formatLeadsToCsv, parseCsv, toCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/leads/")({
  validateSearch: (search: Record<string, unknown>) => ({
    search: (search.search as string) || undefined,
    city: (search.city as string) || undefined,
    country: (search.country as string) || undefined,
    category: (search.category as string) || undefined,
    importedDate: (search.importedDate as string) || undefined,
    emailStatus: (search.emailStatus as string) || undefined,
    hasWebsite: search.hasWebsite === "true" || search.hasWebsite === true ? true : undefined,
    hasEmail: search.hasEmail === "true" || search.hasEmail === true ? true : undefined,
    hasPhone: search.hasPhone === "true" || search.hasPhone === true ? true : undefined,
    createdByMe: search.createdByMe === "true" || search.createdByMe === true ? true : undefined,
    sortBy: (search.sortBy as string) || "discovered_at",
    sortDir: (search.sortDir as "asc" | "desc") || "desc",
    page: typeof search.page === "number" ? search.page : 0,
  }),
  head: () => ({
    meta: [
      { title: "Leads — Sales Intelligence" },
      {
        name: "description",
        content:
          "Search, filter, verify and export the team's deduplicated company lead database.",
      },
      { property: "og:title", content: "Leads — Sales Intelligence" },
      {
        property: "og:description",
        content: "Search, filter, verify and export the team's lead database.",
      },
    ],
  }),
  component: LeadsPage,
});

const ANY = "__any__";
const PAGE_SIZE = 25;

function formatCompactDate(isoStr?: string | null) {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "—";
    const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    return `${day} · ${time}`;
  } catch {
    return isoStr;
  }
}

function formatFullDate(isoStr?: string | null) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return isoStr;
  }
}

function LeadsPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const searchParams = Route.useSearch();

  const listFn = useServerFn(listLeads);
  const exportFn = useServerFn(exportLeads);
  const deleteFn = useServerFn(deleteLeads);
  const verifyPrepFn = useServerFn(listLeadsForVerification);
  const createVerifyJob = useServerFn(createVerificationJob);

  const [search, setSearch] = useState(searchParams.search || "");
  const [city, setCity] = useState(searchParams.city || "");
  const [country, setCountry] = useState(searchParams.country || "");
  const [category, setCategory] = useState(searchParams.category || "");
  const [importedDate, setImportedDate] = useState(searchParams.importedDate || ANY);
  const [emailStatus, setEmailStatus] = useState(searchParams.emailStatus || ANY);
  const [hasWebsite, setHasWebsite] = useState(searchParams.hasWebsite || false);
  const [hasEmail, setHasEmail] = useState(searchParams.hasEmail || false);
  const [hasPhone, setHasPhone] = useState(searchParams.hasPhone || false);
  const [createdByMe, setCreatedByMe] = useState(searchParams.createdByMe || false);
  const [sortBy, setSortBy] = useState(searchParams.sortBy || "discovered_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(searchParams.sortDir || "desc");
  const [page, setPage] = useState(searchParams.page || 0);
  const [selected, setSelected] = useState<string[]>([]);

  const updateUrlState = (params: Record<string, unknown>) => {
    navigate({
      search: (old: any) => ({
        ...old,
        ...params,
      }),
      replace: true,
    });
  };

  const filters: LeadFilters = useMemo(
    () => ({
      search: search || null,
      city: city || null,
      country: country || null,
      category: category || null,
      importedDate: importedDate === ANY ? null : importedDate,
      emailStatus: emailStatus === ANY ? null : emailStatus,
      hasWebsite,
      hasEmail,
      hasPhone,
      createdByMe,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    }),
    [
      search,
      city,
      country,
      category,
      importedDate,
      emailStatus,
      hasWebsite,
      hasEmail,
      hasPhone,
      createdByMe,
      sortBy,
      sortDir,
      page,
    ],
  );

  const query = useQuery({
    queryKey: ["leads", filters],
    queryFn: () => listFn({ data: filters }),
    placeholderData: keepPreviousData,
  });

  const runner = useJobRunner(() => {
    toast.success("Verification finished.");
    query.refetch();
  });

  const rows = (query.data?.rows ?? []) as any[];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  const toggleAll = () => {
    setSelected((prev) =>
      allSelected
        ? prev.filter((id) => !rows.some((r) => r.id === id))
        : Array.from(new Set([...prev, ...rows.map((r) => r.id)])),
    );
  };

  const exportSelected = async (scope: "selected" | "filtered") => {
    const data = await exportFn({
      data: scope === "selected" ? { ids: selected } : { filters },
    });
    if (data.length === 0) {
      toast.error("Nothing to export.");
      return;
    }
    downloadCsv(`leads-${new Date().toISOString().slice(0, 10)}.csv`, formatLeadsToCsv(data as any));
  };

  const removeSelected = async () => {
    if (selected.length === 0) return;
    if (!confirm(`Delete ${selected.length} lead(s)? This cannot be undone.`)) return;
    try {
      const res = await deleteFn({ data: { ids: selected } });
      toast.success(`Deleted ${res.deleted} lead(s).`);
      if (res.deleted < res.requested) {
        toast.warning("Some leads could only be deleted by their owner or an admin.");
      }
      setSelected([]);
      query.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  const verifySelected = async () => {
    if (selected.length === 0) return;
    const leads = await verifyPrepFn({ data: { ids: selected } });
    if (leads.length === 0) {
      toast.error("None of the selected leads have an email address.");
      return;
    }
    const { jobId } = await createVerifyJob({
      data: {
        label: `Verify ${leads.length} selected lead(s)`,
        items: leads.map((l: any) => ({ email: l.email as string, lead_id: l.id as string })),
      },
    });
    await runner.start(jobId);
  };

  return (
    <AppShell
      title="Leads"
      description={`${total.toLocaleString()} leads match the current filters.`}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => exportSelected("filtered")}>
            <Download className="size-4" /> Export filtered
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selected.length === 0}
            onClick={() => exportSelected("selected")}
          >
            Export selected
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Input
            placeholder="Search company, domain, email…"
            value={search}
            onChange={(e) => {
              setPage(0);
              setSearch(e.target.value);
              updateUrlState({ search: e.target.value || undefined, page: 0 });
            }}
          />
          <Input
            placeholder="City"
            value={city}
            onChange={(e) => {
              setPage(0);
              setCity(e.target.value);
              updateUrlState({ city: e.target.value || undefined, page: 0 });
            }}
          />
          <Input
            placeholder="Country"
            value={country}
            onChange={(e) => {
              setPage(0);
              setCountry(e.target.value);
              updateUrlState({ country: e.target.value || undefined, page: 0 });
            }}
          />
          <Input
            placeholder="Industry"
            value={category}
            onChange={(e) => {
              setPage(0);
              setCategory(e.target.value);
              updateUrlState({ category: e.target.value || undefined, page: 0 });
            }}
          />

          {/* Imported Date Filter */}
          <Select
            value={importedDate}
            onValueChange={(v) => {
              setPage(0);
              setImportedDate(v);
              updateUrlState({ importedDate: v === ANY ? undefined : v, page: 0 });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Imported date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="last_7_days">Last 7 days</SelectItem>
              <SelectItem value="last_30_days">Last 30 days</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={emailStatus}
            onValueChange={(v) => {
              setPage(0);
              setEmailStatus(v);
              updateUrlState({ emailStatus: v === ANY ? undefined : v, page: 0 });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Email status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any email status</SelectItem>
              {["valid", "invalid", "risky", "unknown", "unverified"].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          {[
            ["Has website", hasWebsite, setHasWebsite, "hasWebsite"] as const,
            ["Has email", hasEmail, setHasEmail, "hasEmail"] as const,
            ["Has phone", hasPhone, setHasPhone, "hasPhone"] as const,
            ["Added by me", createdByMe, setCreatedByMe, "createdByMe"] as const,
          ].map(([label, checked, setter, key]) => (
            <label key={label} className="flex items-center gap-2">
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => {
                  setPage(0);
                  const val = Boolean(v);
                  setter(val);
                  updateUrlState({ [key]: val || undefined, page: 0 });
                }}
              />
              {label}
            </label>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Select
              value={sortBy}
              onValueChange={(v) => {
                setSortBy(v);
                updateUrlState({ sortBy: v });
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="discovered_at">Imported / Discovered</SelectItem>
                <SelectItem value="company_name">Company name</SelectItem>
                <SelectItem value="city">City</SelectItem>
                <SelectItem value="email_status">Email status</SelectItem>
                <SelectItem value="rating">Rating</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const nextDir = sortDir === "asc" ? "desc" : "asc";
                setSortDir(nextDir);
                updateUrlState({ sortDir: nextDir });
              }}
            >
              {sortDir === "asc" ? "Oldest / Asc" : "Newest / Desc"}
            </Button>
          </div>
        </div>

        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm">
            <span className="font-medium">{selected.length} selected</span>
            <Button size="sm" variant="outline" onClick={verifySelected} disabled={runner.running}>
              <MailCheck className="size-4" /> Verify emails
            </Button>
            <Button size="sm" variant="outline" onClick={removeSelected}>
              <Trash2 className="size-4" /> Delete
            </Button>
            <button
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setSelected([])}
            >
              Clear selection
            </button>
          </div>
        ) : null}

        <JobProgressPanel progress={runner.progress} error={runner.error} running={runner.running} />

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">Company</th>
                <th className="px-3 py-2.5 text-left font-medium">Location</th>
                <th className="px-3 py-2.5 text-left font-medium">Industry</th>
                <th className="px-3 py-2.5 text-left font-medium">Contact</th>
                <th className="px-3 py-2.5 text-left font-medium">Email status</th>
                <th className="px-3 py-2.5 text-left font-medium">Imported</th>
                <th className="px-3 py-2.5 text-left font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {query.isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="px-3 py-2">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                : rows.length === 0
                  ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                          No leads match these filters yet.
                        </td>
                      </tr>
                    )
                  : rows.map((lead) => (
                      <tr key={lead.id} className="hover:bg-secondary/40">
                        <td className="px-3 py-2.5">
                          <Checkbox
                            checked={selected.includes(lead.id)}
                            onCheckedChange={(v) =>
                              setSelected((prev) =>
                                v ? [...prev, lead.id] : prev.filter((id) => id !== lead.id),
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <Link
                            to="/leads/$id"
                            params={{ id: lead.id }}
                            className="font-medium text-foreground hover:text-primary"
                          >
                            {lead.company_name}
                          </Link>
                          {lead.domain ? (
                            <p className="text-xs text-muted-foreground">{lead.domain}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {[lead.city, lead.country].filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {lead.category ?? "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="truncate">{lead.email ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{lead.phone ?? ""}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <EmailStatusBadge status={lead.email_status} />
                        </td>
                        <td
                          className="px-3 py-2.5 text-xs text-muted-foreground"
                          title={formatFullDate(lead.discovered_at || lead.created_at)}
                        >
                          {formatCompactDate(lead.discovered_at || lead.created_at)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {lead.source ?? "—"}
                        </td>
                      </tr>
                    ))}
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
              onClick={() => {
                const p = Math.max(0, page - 1);
                setPage(p);
                updateUrlState({ page: p });
              }}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount}
              onClick={() => {
                const p = page + 1;
                setPage(p);
                updateUrlState({ page: p });
              }}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
