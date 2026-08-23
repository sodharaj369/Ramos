import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  History,
  Info,
  Layers,
  Mail,
  MailCheck,
  Play,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { EmailStatusBadge } from "@/components/status-badge";
import { JobProgressPanel } from "@/components/job-progress";
import { useJobRunner } from "@/hooks/use-job-runner";
import { checkVerifierService, getUsageStats, verifySingleEmail } from "@/lib/verification.functions";
import { SMTP_HELP_TEXT, VERIFICATION_STATUSES } from "@/lib/domain-types";
import { createVerificationJob } from "@/lib/jobs.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/verification")({
  head: () => ({
    meta: [
      { title: "Email verification — Sales Intelligence" },
      {
        name: "description",
        content: "Verify single addresses or bulk lists with syntax, domain, MX, disposable and role-account checks.",
      },
      { property: "og:title", content: "Email verification — Sales Intelligence" },
      {
        property: "og:description",
        content: "Verify single addresses or bulk lists with honest, evidence-based results.",
      },
    ],
  }),
  component: VerificationPage,
});

const DEFAULT_PROVIDER = "aftership-smtp";

function HelpTip() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="About SMTP verification" className="text-muted-foreground hover:text-foreground">
            <HelpCircle className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs p-3 leading-relaxed">{SMTP_HELP_TEXT}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function CheckRow({ label, value, hint }: { label: string; value: unknown; hint?: string }) {
  let text = "Not checked";
  let isPositive = false;
  let isNegative = false;

  if (value !== null && value !== undefined) {
    if (typeof value === "boolean") {
      text = value ? "Yes" : "No";
      if (label.includes("Syntax") || label.includes("Domain") || label.includes("MX")) {
        isPositive = value;
        isNegative = !value;
      } else if (label.includes("Disposable") || label.includes("Role") || label.includes("Catch-all")) {
        isNegative = value;
      }
    } else if (typeof value === "string") {
      if (value === "host_unreachable" || value === "timeout") {
        text = "Unreachable";
        isNegative = true;
      } else if (value === "accepted" || value === "deliverable") {
        text = "Accepted";
        isPositive = true;
      } else if (value === "rejected" || value === "undeliverable") {
        text = "Rejected";
        isNegative = true;
      } else if (value === "catch_all") {
        text = "Catch-all";
      } else if (value === "not_attempted") {
        text = "Not attempted";
      } else {
        text = value;
      }
    } else {
      text = String(value);
    }
  }

  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-xs last:border-0">
      <span className="text-muted-foreground flex items-center gap-1">
        {label}
        {hint ? <span className="text-[10px] text-muted-foreground/60">({hint})</span> : null}
      </span>
      <span
        className={cn(
          "font-medium tabular",
          isPositive ? "text-success font-semibold" : isNegative ? "text-destructive font-semibold" : "text-foreground",
        )}
      >
        {text}
      </span>
    </div>
  );
}

function VerificationPage() {
  const verifyFn = useServerFn(verifySingleEmail);
  const usageFn = useServerFn(getUsageStats);
  const createJob = useServerFn(createVerificationJob);
  const healthFn = useServerFn(checkVerifierService);

  const usage = useQuery({ queryKey: ["usage"], queryFn: () => usageFn({}) });
  const health = useQuery({ queryKey: ["verifier-health"], queryFn: () => healthFn({}) });

  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const runner = useJobRunner(() => {
    toast.success("Bulk verification finished.");
    usage.refetch();
  });

  const parsedBulkEmails = useMemo(() => {
    return Array.from(
      new Set(
        bulkText
          .split(/[\s,;]+/)
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.includes("@") && e.length > 3),
      ),
    );
  }, [bulkText]);

  const verifyOne = async () => {
    if (!email.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res: any = await verifyFn({ data: { email: email.trim(), provider } });
      if (res.notConfigured || res.failed) {
        toast.error(res.message ?? "Verification service unavailable.");
        return;
      }
      setResult({ ...res.result, cached: res.cached });
      usage.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const verifyBulk = async () => {
    if (parsedBulkEmails.length === 0) {
      toast.error("Paste at least one valid email address.");
      return;
    }
    try {
      const { jobId } = await createJob({
        data: {
          label: `Bulk verification — ${parsedBulkEmails.length} address(es)`,
          provider,
          items: parsedBulkEmails.map((e) => ({ email: e })),
        },
      });
      await runner.start(jobId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to initiate bulk verification.");
    }
  };

  const getResultBanner = (status: string) => {
    const s = status?.toLowerCase();
    if (s === "valid") {
      return {
        bg: "border-success/30 bg-success/10 text-success",
        icon: <CheckCircle2 className="size-5 text-success shrink-0" />,
        title: "Valid Email Address",
        desc: "This mailbox is deliverable and confirmed active.",
      };
    }
    if (s === "invalid") {
      return {
        bg: "border-destructive/30 bg-destructive/10 text-destructive",
        icon: <XCircle className="size-5 text-destructive shrink-0" />,
        title: "Invalid Email Address",
        desc: "This email address is undeliverable or does not exist.",
      };
    }
    if (s === "risky" || s === "catch_all" || s === "disposable") {
      return {
        bg: "border-warning/30 bg-warning/10 text-warning-foreground",
        icon: <AlertTriangle className="size-5 text-warning-foreground shrink-0" />,
        title: `${s.charAt(0).toUpperCase() + s.slice(1)} Email Address`,
        desc: "Higher bounce risk detected (disposable, role account or catch-all server).",
      };
    }
    return {
      bg: "border-border bg-secondary/50 text-foreground",
      icon: <HelpCircle className="size-5 text-muted-foreground shrink-0" />,
      title: "Unknown Deliverability Result",
      desc: "SMTP handshake timed out or was not attempted by the provider.",
    };
  };

  return (
    <AppShell
      title="Email Verification"
      description="Verify single addresses or bulk lead lists with evidence-based deliverability checks."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/verification-history">
            <History className="size-4 mr-1.5" /> Verification History
          </Link>
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main Workspace with Segmented Tab Control */}
        <div className="space-y-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "single" | "bulk")} className="w-full">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5 mb-6">
              <TabsList className="grid w-full max-w-sm grid-cols-2">
                <TabsTrigger value="single" className="gap-2">
                  <Mail className="size-4" /> Single Verification
                </TabsTrigger>
                <TabsTrigger value="bulk" className="gap-2">
                  <Layers className="size-4" /> Bulk Verification
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                <HelpTip />
                <span className="text-xs text-muted-foreground hidden sm:inline">How verification works</span>
              </div>
            </div>

            {/* TAB 1: Single Verification Workspace */}
            <TabsContent value="single" className="mt-0 space-y-6">
              <section className="rounded-lg border border-border bg-card p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-border pb-3.5">
                  <div>
                    <h2 className="font-display text-base font-bold text-foreground">Verify Single Email</h2>
                    <p className="text-xs text-muted-foreground">Instant deliverability lookup with MX, DNS and SMTP handshake analysis</p>
                  </div>
                </div>

                {health.data && !health.data.ok ? (
                  <div className="mt-4 flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">SMTP Verifier Warning</p>
                      <p className="mt-0.5 opacity-90">{health.data.message}</p>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 space-y-3">
                  <Label htmlFor="single-email-input" className="text-xs font-semibold text-muted-foreground uppercase">
                    Email Address
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <div className="relative flex-1 min-w-[240px]">
                      <Mail className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                      <Input
                        id="single-email-input"
                        placeholder="prospect@company.com"
                        value={email}
                        className="pl-8"
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void verifyOne();
                        }}
                      />
                    </div>
                    <Button onClick={verifyOne} disabled={busy || !email}>
                      <MailCheck className="size-4 mr-1.5" />
                      {busy ? "Verifying..." : "Verify email"}
                    </Button>
                  </div>
                </div>

                {/* Loading Skeleton */}
                {busy ? (
                  <div className="mt-6 space-y-3 p-4 border border-border rounded-lg">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : null}

                {/* Single Verification Result Display */}
                {result && !busy ? (
                  <div className="mt-6 space-y-4 rounded-lg border border-border bg-card p-5 shadow-xs animate-in fade-in-50 duration-200">
                    {/* Result Banner */}
                    {(() => {
                      const b = getResultBanner(result.status);
                      return (
                        <div className={cn("flex items-start justify-between gap-3 rounded-lg border p-4", b.bg)}>
                          <div className="flex items-start gap-3">
                            {b.icon}
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-display text-sm font-bold">{b.title}</h3>
                                <EmailStatusBadge status={result.status} />
                              </div>
                              <p className="mt-0.5 text-xs opacity-90">{b.desc}</p>
                            </div>
                          </div>
                          {result.confidence !== null && result.confidence !== undefined ? (
                            <div className="text-right shrink-0">
                              <p className="font-display text-lg font-bold tabular">{result.confidence}%</p>
                              <p className="text-[10px] uppercase tracking-wider opacity-80">Confidence</p>
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}

                    {/* Analyzed Email & Cache Note */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-xs">
                      <span className="font-mono font-bold text-foreground text-sm">{result.email}</span>
                      {result.cached ? (
                        <span className="rounded bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                          Cached result (verified within 30 days)
                        </span>
                      ) : null}
                    </div>

                    {/* Failure / Assignment Reason */}
                    {result.reason ? (
                      <div className="rounded bg-secondary/50 p-3 text-xs text-muted-foreground border border-border/60">
                        <p className="font-semibold text-foreground mb-0.5">Assigned Status Reason:</p>
                        <p>{result.reason}</p>
                      </div>
                    ) : null}

                    {/* Detailed Checks Breakdown */}
                    <div className="space-y-1 pt-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Technical Validation Evidence
                      </p>
                      <CheckRow label="Syntax Format Valid" value={result.syntax_valid} />
                      <CheckRow label="Domain Resolves (DNS)" value={result.domain_valid} />
                      <CheckRow label="MX Records Present" value={result.mx_valid} />
                      <CheckRow label="SMTP Handshake Result" value={result.smtp_result} />
                      <CheckRow label="Disposable Domain" value={result.disposable} />
                      <CheckRow label="Role Account (e.g. admin@)" value={result.role_account} />
                      <CheckRow label="Catch-all Domain Server" value={result.catch_all} />
                      <CheckRow label="Verification Provider" value={result.provider} />
                    </div>

                    <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">
                      Verification results represent real technical evidence recorded at time of check. No system guarantees 100% deliverability.
                    </p>
                  </div>
                ) : null}
              </section>
            </TabsContent>

            {/* TAB 2: Bulk Verification Workspace */}
            <TabsContent value="bulk" className="mt-0 space-y-6">
              <section className="rounded-lg border border-border bg-card p-5 shadow-xs">
                <div className="border-b border-border pb-3.5">
                  <h2 className="font-display text-base font-bold text-foreground">Bulk List Verification</h2>
                  <p className="text-xs text-muted-foreground">
                    Paste email lists to verify deliverability in parallel using the background job engine.
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="bulk-email-input" className="text-xs font-semibold text-muted-foreground uppercase">
                      Paste Email List (New line, comma or space separated)
                    </Label>
                    {parsedBulkEmails.length > 0 ? (
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {parsedBulkEmails.length} unique email(s) detected
                      </span>
                    ) : null}
                  </div>

                  <Textarea
                    id="bulk-email-input"
                    rows={8}
                    placeholder={"alex@company.com\nsarah@acme.org\ncontact@startup.io"}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    className="font-mono text-xs"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <Button onClick={verifyBulk} disabled={runner.running || parsedBulkEmails.length === 0}>
                      <Play className="size-4 mr-1.5" />
                      {runner.running
                        ? "Verifying list..."
                        : `Start bulk verification (${parsedBulkEmails.length})`}
                    </Button>

                    <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground">
                      <Link to="/verification-history">
                        View in Verification History <ArrowRight className="size-3.5 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="mt-6">
                  <JobProgressPanel progress={runner.progress} error={runner.error} running={runner.running} />
                </div>
              </section>
            </TabsContent>
          </Tabs>

          {/* Verification Status Legend */}
          <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
              Standard Deliverability Status Legend
            </p>
            <div className="flex flex-wrap gap-2">
              {VERIFICATION_STATUSES.map((s) => (
                <EmailStatusBadge key={s} status={s} />
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <aside className="space-y-6">
          {/* Provider Selection Card */}
          <div className="rounded-lg border border-border bg-card p-4.5 shadow-xs space-y-3">
            <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Active Provider
            </Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(usage.data?.providers ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {!p.configured ? " (not configured)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ul className="space-y-2.5 pt-2 border-t border-border">
              {(usage.data?.providers ?? []).map((p) => (
                <li key={p.id} className="text-xs text-muted-foreground space-y-0.5">
                  <p className="font-semibold text-foreground">{p.name}</p>
                  <p className="text-[11px] leading-relaxed">{p.description}</p>
                  {!p.configured && p.configurationHint ? (
                    <p className="text-[11px] text-warning-foreground font-medium pt-0.5">
                      {p.configurationHint}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          {/* Provider Usage Statistics Card */}
          <div className="rounded-lg border border-border bg-card p-4.5 shadow-xs space-y-3">
            <h3 className="font-display text-sm font-bold text-foreground">Provider Usage Statistics</h3>
            {(usage.data?.usage ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No provider verification calls recorded yet.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {usage.data!.usage.map((u) => (
                  <li key={u.provider} className="flex items-center justify-between border-b border-border pb-1.5 last:border-0">
                    <span className="font-medium text-foreground truncate pr-2">{u.provider}</span>
                    <span className="tabular font-mono text-muted-foreground text-[11px]">
                      {u.calls} calls · {u.failed} failed
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
