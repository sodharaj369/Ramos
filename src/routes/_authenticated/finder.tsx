import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ExtensionConnection } from "@/components/extension-connection";
import { JobProgressPanel } from "@/components/job-progress";
import { useJobRunner } from "@/hooks/use-job-runner";
import { createDiscoveryJob, listProviders } from "@/lib/jobs.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LocationPicker,
  composeLocation,
  emptyLocation,
  validateLocation,
  type StructuredLocation,
} from "@/components/location-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/finder")({
  head: () => ({
    meta: [
      { title: "Lead Finder — Sales Intelligence" },
      {
        name: "description",
        content:
          "Describe the businesses you want and discover publicly available company leads from pluggable sources.",
      },
      { property: "og:title", content: "Lead Finder — Sales Intelligence" },
      {
        property: "og:description",
        content: "Describe the businesses you want and discover public company leads.",
      },
    ],
  }),
  component: FinderPage,
});

const RESULT_LIMITS = [5, 10, 20, 25, 50] as const;

const EXAMPLES = [
  "Independent coffee shops in Manchester with a website",
  "Dental clinics in Austin, Texas with online booking",
  "B2B SaaS companies in Berlin hiring sales staff",
];

function FinderPage() {
  const router = useRouter();
  const providersFn = useServerFn(listProviders);
  const createJob = useServerFn(createDiscoveryJob);
  const providers = useQuery({ queryKey: ["providers"], queryFn: () => providersFn({}) });

  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<StructuredLocation>(emptyLocation);
  const [availability, setAvailability] = useState({ hasStates: false, hasCities: false });
  const [industry, setIndustry] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sourceId, setSourceId] = useState<string>("");
  const [limit, setLimit] = useState(5);
  const [requireWebsite, setRequireWebsite] = useState(false);
  const [requirePhone, setRequirePhone] = useState(false);
  const [requireEmail, setRequireEmail] = useState(false);
  const [starting, setStarting] = useState(false);

  const runner = useJobRunner(() => {
    toast.success("Search finished. New leads are in the Leads table.");
  });

  const sources = providers.data?.leadSources ?? [];
  const productionSources = sources.filter((s) => s.id !== "demo");
  const configuredProduction = productionSources.filter((s) => s.configured);
  // Never silently fall back to the demo source, and never auto-switch away
  // from the primary Render provider when it fails — the user picks manually.
  const primary = configuredProduction.find((s) => s.id === "self-hosted-google-maps");
  const selectedSource =
    sources.find((s) => s.id === sourceId) ?? primary ?? configuredProduction[0] ?? null;
  const isDemo = selectedSource?.id === "demo";
  const isExtension = selectedSource?.id === "chrome-extension";
  const noProviderConfigured = configuredProduction.length === 0;

  const run = async () => {
    if (query.trim().length < 2) {
      toast.error("Describe what you're looking for first.");
      return;
    }
    const locationError = validateLocation(location, availability.hasStates, availability.hasCities);
    if (locationError) {
      toast.error(locationError);
      return;
    }
    if (!selectedSource) {
      toast.error("Lead discovery provider not configured.");
      return;
    }
    if (!selectedSource.configured) {
      toast.error(`${selectedSource.name} is not configured.`);
      return;
    }
    setStarting(true);
    try {
      const { jobId } = await createJob({
        data: {
          sourceId: selectedSource.id,
          query: query.trim(),
          location: composeLocation(location) || null,
          industry: industry || null,
          keyword: keyword || null,
          requireWebsite,
          requirePhone,
          requireEmail: isDemo ? requireEmail : false,
          limit,
        },
      });
      await runner.start(jobId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the search.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <AppShell
      title="Lead Finder"
      description="Describe the businesses you want. Only publicly available company data is collected."
      actions={
        <Button variant="outline" size="sm" onClick={() => router.navigate({ to: "/leads" })}>
          Go to leads
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="query">What are you looking for?</Label>
            <Textarea
              id="query"
              rows={3}
              placeholder="e.g. Independent coffee shops in Manchester with a website"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  onClick={() => setQuery(example)}
                  className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <LocationPicker
            value={location}
            onChange={setLocation}
            onAvailabilityChange={setAvailability}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                value={industry}
                placeholder="Hospitality"
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="keyword">Keyword</Label>
              <Input
                id="keyword"
                value={keyword}
                placeholder="speciality"
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            {[
              ["Has website", requireWebsite, setRequireWebsite] as const,
              ["Has phone", requirePhone, setRequirePhone] as const,
              ...(isDemo ? [["Has email", requireEmail, setRequireEmail] as const] : []),
            ].map(([label, checked, setter]) => (
              <label key={label} className="flex items-center gap-2 text-sm">
                <Checkbox checked={checked} onCheckedChange={(v) => setter(Boolean(v))} />
                {label}
              </label>
            ))}
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="limit" className="text-sm font-normal">
                Max results
              </Label>
              <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                <SelectTrigger id="limit" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESULT_LIMITS.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {noProviderConfigured ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
              <p className="font-medium text-warning-foreground">
                Lead discovery provider not configured.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                No real lead source is connected, so no companies can be discovered. Add the
                provider credentials in the backend to enable discovery. The demo source below
                produces clearly-labelled sample records for testing only — it is never used
                automatically.
              </p>
            </div>
          ) : null}

          {isDemo ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-warning-foreground">
              DEMO SOURCE SELECTED — results are synthetic sample records prefixed with [DEMO], not
              real businesses. Do not use them for outreach.
            </div>
          ) : null}

          {isExtension ? (
            <div className="space-y-3">
              <ExtensionConnection compact />
              <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                <li>Connect the Sales Intel Maps Connector extension above.</li>
                <li>Open Google Maps and search for the businesses you want.</li>
                <li>Open the extension and click Start Discovery, then Import to Sales Intel.</li>
              </ol>
              <Button variant="outline" asChild>
                <a
                  href={`https://www.google.com/maps/search/${encodeURIComponent(
                    [query.trim(), composeLocation(location)].filter(Boolean).join(", "),
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Search className="size-4" />
                  Open this search in Google Maps
                </a>
              </Button>
            </div>
          ) : (
            <Button
              onClick={run}
              disabled={starting || runner.running || !selectedSource?.configured}
            >
              <Search className="size-4" />
              {runner.running ? "Searching…" : "Find leads"}
            </Button>
          )}

          <JobProgressPanel
            progress={runner.progress}
            error={runner.error}
            running={runner.running}
          />
          {!isDemo && !isExtension ? (
            <p className="text-xs text-muted-foreground">
              The hosted scraper runs on constrained infrastructure — 5 results is the reliable
              default. Larger limits (10–50) are supported but take longer. If a search fails,
              retry or switch to the Chrome Extension provider.
            </p>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <Label className="text-xs tracking-wide uppercase">Lead source</Label>
            <Select value={selectedSource?.id ?? ""} onValueChange={setSourceId}>
              <SelectTrigger className="mt-2 w-full">
                <SelectValue placeholder="Select a source" />
              </SelectTrigger>
              <SelectContent>
                {sources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.id === "demo" ? "DEMO — " : ""}
                    {source.name}
                    {source.configured ? "" : " (not configured)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSource ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">{selectedSource.description}</p>
                {!selectedSource.configured && selectedSource.configurationHint ? (
                  <p className="rounded-md bg-warning/12 px-2 py-1.5 text-xs text-warning-foreground">
                    {selectedSource.configurationHint}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-1">
                  {selectedSource.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">How results are handled</p>
            <p className="mt-2">
              Every result is normalised and deduplicated against the existing database. Matching
              companies are enriched with any new details instead of being duplicated.
            </p>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
