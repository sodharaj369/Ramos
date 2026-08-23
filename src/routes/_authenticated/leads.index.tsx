import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Database,
  Download,
  Filter,
  MailCheck,
  RotateCcw,
  Search,
  SearchX,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { EmailStatusBadge } from "@/components/status-badge";
import { JobProgressPanel } from "@/components/job-progress";
import { EmptyState } from "@/components/empty-state";
import { useJobRunner } from "@/hooks/use-job-runner";
import { deleteLeads, exportLeads, listLeads, type LeadFilters } from "@/lib/leads.functions";
import { createVerificationJob } from "@/lib/jobs.functions";
import { listLeadsForVerification } from "@/lib/verification.functions";
import { downloadCsv, formatLeadsToCsv } from "@/lib/csv";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export type LeadSearchSchema = {
  search?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  category?: string | undefined;
  importedDate?: string | undefined;
  emailStatus?: string | undefined;
  hasWebsite?: boolean | undefined;
  hasEmail?: boolean | undefined;
  hasPhone?: boolean | undefined;
  createdByMe?: boolean | undefined;
  sortBy?: string | undefined;
  sortDir?: "asc" | "desc" | undefined;
  page?: number | undefined;
};

export const Route = createFileRoute("/_authenticated/leads/")({
  validateSearch: (search: Record<string, unknown>): LeadSearchSchema => ({
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
    sortBy: (search.sortBy as string) || undefined,
    sortDir: (search.sortDir as "asc" | "desc") || undefined,
    page: typeof search.page === "number" ? search.page : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Leads — Sales Intelligence" },
      {
        name: "description",
        content: "Search, filter, verify and export company leads in the unified sales database.",
      },
      { property: "og:title", content: "Leads — Sales Intelligence" },
      {
        property: "og:description",
        content: "Search, filter, verify and export company leads.",
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

  // UI modal states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const updateUrlState = (params: Record<string, unknown>) => {
    navigate({
      search: (old: any) => ({
        ...old,
        ...params,
      }),
      replace: true,
    });
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search) count++;
    if (city) count++;
    if (country) count++;
    if (category) count++;
    if (importedDate && importedDate !== ANY) count++;
    if (emailStatus && emailStatus !== ANY) count++;
    if (hasWebsite) count++;
    if (hasEmail) count++;
    if (hasPhone) count++;
    if (createdByMe) count++;
    return count;
  }, [
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
  ]);

  const clearAllFilters = () => {
    setSearch("");
    setCity("");
    setCountry("");
    setCategory("");
    setImportedDate(ANY);
    setEmailStatus(ANY);
    setHasWebsite(false);
    setHasEmail(false);
    setHasPhone(false);
    setCreatedByMe(false);
    setPage(0);
    updateUrlState({
      search: undefined,
      city: undefined,
      country: undefined,
      category: undefined,
      importedDate: undefined,
      emailStatus: undefined,
      hasWebsite: undefined,
      hasEmail: undefined,
      hasPhone: undefined,
      createdByMe: undefined,
      page: 0,
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
    setIsExporting(true);
    try {
      const data = await exportFn({
        data: scope === "selected" ? { ids: selected } : { filters },
      });
      if (data.length === 0) {
        toast.error("Nothing to export.");
        return;
      }
      downloadCsv(`leads-${new Date().toISOString().slice(0, 10)}.csv`, formatLeadsToCsv(data as any));
      toast.success(`Exported ${data.length} lead(s) to CSV.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  const confirmDeleteLeads = async () => {
    if (selected.length === 0) return;
    setIsDeleting(true);
    try {
      const res = await deleteFn({ data: { ids: selected } });
      toast.success(`Deleted ${res.deleted} lead(s).`);
      if (res.deleted < res.requested) {
        toast.warning("Some leads could only be deleted by their owner or an admin.");
      }
      setSelected([]);
      setDeleteDialogOpen(false);
      query.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setIsDeleting(false);
    }
  };

  const verifySelected = async () => {
    if (selected.length === 0) return;
    try {
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to initiate verification.");
    }
  };

  const handleHeaderSort = (field: string) => {
    if (sortBy === field) {
      const nextDir = sortDir === "asc" ? "desc" : "asc";
      setSortDir(nextDir);
      updateUrlState({ sortDir: nextDir });
    } else {
      setSortBy(field);
      setSortDir("desc");
      updateUrlState({ sortBy: field, sortDir: "desc" });
    }
  };

  const renderSortColumnHeader = (label: string, field: string) => {
    const isSorted = sortBy === field;
    return (
      <button
        type="button"
        onClick={() => handleHeaderSort(field)}
        className={cn(
          "group inline-flex items-center gap-1.5 font-semibold text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded px-1 -mx-1 cursor-pointer",
          isSorted ? "text-foreground font-bold" : "text-muted-foreground",
        )}
      >
        <span>{label}</span>
        {isSorted ? (
          sortDir === "asc" ? (
            <ArrowUp className="size-3.5 text-primary shrink-0" />
          ) : (
            <ArrowDown className="size-3.5 text-primary shrink-0" />
          )
        ) : (
          <ArrowUpDown className="size-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
        )}
      </button>
    );
  };

  return (
    <AppShell
      title="Leads"
      description={`${total.toLocaleString()} lead(s) match the active criteria.`}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => exportSelected("filtered")} disabled={isExporting}>
            <Download className="size-4 mr-1.5" /> Export filtered
          </Button>
          <Button asChild size="sm">
            <Link to="/finder">
              <Search className="size-4 mr-1.5" /> Find leads
            </Link>
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Desktop Filter Bar */}
        <div className="hidden lg:block space-y-3 rounded-lg border border-border bg-card p-4 shadow-xs">
          <div className="grid gap-3 grid-cols-6">
            <div className="relative col-span-2">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search company, domain, email..."
                value={search}
                className="pl-8 pr-8"
                onChange={(e) => {
                  setPage(0);
                  setSearch(e.target.value);
                  updateUrlState({ search: e.target.value || undefined, page: 0 });
                }}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    updateUrlState({ search: undefined, page: 0 });
                  }}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>

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

            {/* Imported Date Select */}
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
          </div>

          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground">
              <Select
                value={emailStatus}
                onValueChange={(v) => {
                  setPage(0);
                  setEmailStatus(v);
                  updateUrlState({ emailStatus: v === ANY ? undefined : v, page: 0 });
                }}
              >
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue placeholder="Email status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any email status</SelectItem>
                  {["valid", "invalid", "risky", "unknown", "unverified"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {[
                ["Has website", hasWebsite, setHasWebsite, "hasWebsite"] as const,
                ["Has email", hasEmail, setHasEmail, "hasEmail"] as const,
                ["Has phone", hasPhone, setHasPhone, "hasPhone"] as const,
                ["Added by me", createdByMe, setCreatedByMe, "createdByMe"] as const,
              ].map(([label, checked, setter, key]) => (
                <label key={label} className="flex items-center gap-2 cursor-pointer hover:text-foreground">
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
            </div>

            {activeFilterCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="size-3.5 mr-1" /> Clear filters ({activeFilterCount})
              </Button>
            ) : null}
          </div>
        </div>

        {/* Mobile / Tablet Filter Trigger & Drawer */}
        <div className="lg:hidden flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search company, domain..."
              value={search}
              className="pl-8"
              onChange={(e) => {
                setPage(0);
                setSearch(e.target.value);
                updateUrlState({ search: e.target.value || undefined, page: 0 });
              }}
            />
          </div>
          <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0">
                <Filter className="size-4 mr-1.5" />
                Filters {activeFilterCount > 0 ? `· ${activeFilterCount}` : ""}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 p-5 space-y-4">
              <SheetHeader className="text-left pb-2 border-b border-border">
                <SheetTitle className="font-display text-base font-bold">Filter Leads</SheetTitle>
              </SheetHeader>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">City</label>
                  <Input
                    placeholder="e.g. London, Chicago"
                    value={city}
                    className="mt-1"
                    onChange={(e) => {
                      setPage(0);
                      setCity(e.target.value);
                      updateUrlState({ city: e.target.value || undefined, page: 0 });
                    }}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Country</label>
                  <Input
                    placeholder="e.g. UK, USA"
                    value={country}
                    className="mt-1"
                    onChange={(e) => {
                      setPage(0);
                      setCountry(e.target.value);
                      updateUrlState({ country: e.target.value || undefined, page: 0 });
                    }}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Industry</label>
                  <Input
                    placeholder="e.g. Software, Healthcare"
                    value={category}
                    className="mt-1"
                    onChange={(e) => {
                      setPage(0);
                      setCategory(e.target.value);
                      updateUrlState({ category: e.target.value || undefined, page: 0 });
                    }}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Imported Date</label>
                  <Select
                    value={importedDate}
                    onValueChange={(v) => {
                      setPage(0);
                      setImportedDate(v);
                      updateUrlState({ importedDate: v === ANY ? undefined : v, page: 0 });
                    }}
                  >
                    <SelectTrigger className="mt-1">
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
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Email Deliverability</label>
                  <Select
                    value={emailStatus}
                    onValueChange={(v) => {
                      setPage(0);
                      setEmailStatus(v);
                      updateUrlState({ emailStatus: v === ANY ? undefined : v, page: 0 });
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Email status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>Any email status</SelectItem>
                      {["valid", "invalid", "risky", "unknown", "unverified"].map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-2 space-y-2">
                  {[
                    ["Has website", hasWebsite, setHasWebsite, "hasWebsite"] as const,
                    ["Has email", hasEmail, setHasEmail, "hasEmail"] as const,
                    ["Has phone", hasPhone, setHasPhone, "hasPhone"] as const,
                    ["Added by me", createdByMe, setCreatedByMe, "createdByMe"] as const,
                  ].map(([label, checked, setter, key]) => (
                    <label key={label} className="flex items-center gap-2.5 font-medium cursor-pointer">
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
                </div>
              </div>

              {activeFilterCount > 0 ? (
                <Button variant="outline" size="sm" onClick={clearAllFilters} className="w-full mt-4">
                  <RotateCcw className="size-3.5 mr-1.5" /> Clear all filters
                </Button>
              ) : null}
            </SheetContent>
          </Sheet>
        </div>

        {/* Contextual Bulk Action Bar */}
        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm shadow-xs animate-in fade-in-50 duration-200">
            <div className="flex items-center gap-2.5">
              <span className="font-semibold text-foreground">{selected.length} lead(s) selected</span>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground underline"
                onClick={() => setSelected([])}
              >
                Clear selection
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={verifySelected} disabled={runner.running}>
                <MailCheck className="size-4 mr-1.5" /> Verify emails
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportSelected("selected")} disabled={isExporting}>
                <Download className="size-4 mr-1.5" /> Export selected
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={isDeleting}
              >
                <Trash2 className="size-4 mr-1.5" /> Delete
              </Button>
            </div>
          </div>
        ) : null}

        <JobProgressPanel progress={runner.progress} error={runner.error} running={runner.running} />

        {/* Leads Table Container */}
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-secondary/60 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="w-10 px-3.5 py-3">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all leads on page" />
                </th>
                <th className="px-3.5 py-3">{renderSortColumnHeader("Company", "company_name")}</th>
                <th className="px-3.5 py-3">{renderSortColumnHeader("Location", "city")}</th>
                <th className="px-3.5 py-3 font-semibold">Industry</th>
                <th className="px-3.5 py-3 font-semibold">Contact Details</th>
                <th className="px-3.5 py-3">{renderSortColumnHeader("Email Status", "email_status")}</th>
                <th className="px-3.5 py-3">{renderSortColumnHeader("Imported", "discovered_at")}</th>
                <th className="px-3.5 py-3 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {query.isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="h-12">
                    <td className="px-3.5 py-2.5">
                      <Skeleton className="size-4 rounded" />
                    </td>
                    <td className="px-3.5 py-2.5">
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-3 w-20" />
                    </td>
                    <td className="px-3.5 py-2.5">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-3.5 py-2.5">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-3.5 py-2.5">
                      <Skeleton className="h-4 w-28 mb-1" />
                      <Skeleton className="h-3 w-16" />
                    </td>
                    <td className="px-3.5 py-2.5">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="px-3.5 py-2.5">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-3.5 py-2.5">
                      <Skeleton className="h-4 w-16" />
                    </td>
                  </tr>
                ))
              ) : query.error ? (
                <tr>
                  <td colSpan={8} className="p-8">
                    <div className="flex flex-col items-center justify-center text-center">
                      <SearchX className="size-8 text-destructive mb-2" />
                      <p className="font-semibold text-foreground text-sm">Unable to load leads</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-md">
                        {query.error instanceof Error ? query.error.message : "A database query failure occurred."}
                      </p>
                      <Button variant="outline" size="sm" className="mt-4" onClick={() => query.refetch()}>
                        Try again
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8">
                    {activeFilterCount > 0 ? (
                      <EmptyState
                        icon={<SearchX className="size-6" />}
                        title="No leads match active filters"
                        description="Try removing or relaxing specific search criteria to find relevant company prospects."
                        action={
                          <Button variant="outline" size="sm" onClick={clearAllFilters}>
                            <RotateCcw className="size-3.5 mr-1.5" /> Clear all filters
                          </Button>
                        }
                      />
                    ) : (
                      <EmptyState
                        icon={<Database className="size-6" />}
                        title="No leads in database yet"
                        description="Start by discovering company prospects using the Lead Finder or import a CSV file."
                        action={
                          <div className="flex gap-2">
                            <Button asChild size="sm">
                              <Link to="/finder">Find Leads</Link>
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <Link to="/import">Import CSV</Link>
                            </Button>
                          </div>
                        }
                      />
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((lead) => {
                  const isSelected = selected.includes(lead.id);
                  return (
                    <tr
                      key={lead.id}
                      className={cn(
                        "transition-colors hover:bg-secondary/40",
                        isSelected ? "bg-primary/5 hover:bg-primary/10" : "",
                      )}
                    >
                      <td className="px-3.5 py-3">
                        <Checkbox
                          checked={isSelected}
                          aria-label={`Select lead ${lead.company_name}`}
                          onCheckedChange={(v) =>
                            setSelected((prev) =>
                              v ? [...prev, lead.id] : prev.filter((id) => id !== lead.id),
                            )
                          }
                        />
                      </td>
                      <td className="px-3.5 py-3">
                        <Link
                          to="/leads/$id"
                          params={{ id: lead.id }}
                          className="font-display font-semibold text-foreground hover:text-primary transition-colors block text-sm"
                        >
                          {lead.company_name}
                        </Link>
                        {lead.domain ? (
                          <a
                            href={lead.website || `https://${lead.domain}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-muted-foreground hover:underline"
                          >
                            {lead.domain}
                          </a>
                        ) : null}
                      </td>
                      <td className="px-3.5 py-3 text-muted-foreground">
                        {[lead.city, lead.country].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-3.5 py-3 text-muted-foreground">
                        {lead.category ?? "—"}
                      </td>
                      <td className="px-3.5 py-3">
                        {lead.email ? (
                          <a href={`mailto:${lead.email}`} className="text-foreground hover:underline block truncate font-medium">
                            {lead.email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {lead.phone ? (
                          <a href={`tel:${lead.phone}`} className="text-[11px] text-muted-foreground hover:underline block">
                            {lead.phone}
                          </a>
                        ) : null}
                      </td>
                      <td className="px-3.5 py-3">
                        <EmailStatusBadge status={lead.email_status} />
                      </td>
                      <td
                        className="px-3.5 py-3 text-muted-foreground font-mono text-[11px]"
                        title={formatFullDate(lead.discovered_at || lead.created_at)}
                      >
                        {formatCompactDate(lead.discovered_at || lead.created_at)}
                      </td>
                      <td className="px-3.5 py-3 text-muted-foreground font-medium">
                        {lead.source ? (
                          <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
                            {lead.source}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-xs shadow-xs">
          <div className="text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{rows.length > 0 ? page * PAGE_SIZE + 1 : 0}</span> to{" "}
            <span className="font-semibold text-foreground">{Math.min(total, (page + 1) * PAGE_SIZE)}</span> of{" "}
            <span className="font-semibold text-foreground">{total.toLocaleString()}</span> lead(s)
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-muted-foreground pr-2">
              Page <span className="font-semibold text-foreground">{page + 1}</span> of{" "}
              <span className="font-semibold text-foreground">{pageCount}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || query.isLoading}
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
              disabled={page + 1 >= pageCount || query.isLoading}
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

      {/* Destructive Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-base font-bold">
              Delete {selected.length} selected lead(s)?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              This operation is permanent. The selected lead records, their associated email verifications, and audit logs will be permanently deleted from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDeleteLeads();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete leads"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
