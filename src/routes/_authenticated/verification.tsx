import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { HelpCircle, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { EmailStatusBadge } from "@/components/status-badge";
import { JobProgressPanel } from "@/components/job-progress";
import { useJobRunner } from "@/hooks/use-job-runner";
import { checkVerifierService, getUsageStats, verifySingleEmail } from "@/lib/verification.functions";
import { SMTP_HELP_TEXT, VERIFICATION_STATUSES } from "@/lib/domain-types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createVerificationJob } from "@/lib/jobs.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/verification")({
  head: () => ({
    meta: [
      { title: "Email verification — Sales Intelligence" },
      {
        name: "description",
        content:
          "Verify single addresses or bulk lists with syntax, domain, MX, disposable and role-account checks.",
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
          <button type="button" aria-label="About SMTP verification" className="text-muted-foreground">
            <HelpCircle className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{SMTP_HELP_TEXT}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-2">
      {VERIFICATION_STATUSES.map((s) => (
        <EmailStatusBadge key={s} status={s} />
      ))}
    </div>
  );
}

function CheckRow({ label, value }: { label: string; value: unknown }) {
  let text = "Not checked";
  if (value !== null && value !== undefined) {
    if (typeof value === "boolean") {
      text = value ? "Yes" : "No";
    } else if (typeof value === "string") {
      if (value === "host_unreachable" || value === "timeout") text = "Unreachable";
      else if (value === "accepted" || value === "deliverable") text = "Accepted";
      else if (value === "rejected" || value === "undeliverable") text = "Rejected";
      else if (value === "catch_all") text = "Catch-all";
      else if (value === "not_attempted") text = "Not attempted";
      else text = value;
    } else {
      text = String(value);
    }
  }
  return (
    <div className="flex items-center justify-between border-b border-border py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{text}</span>
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

  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState("");

  const runner = useJobRunner(() => toast.success("Bulk verification finished."));

  const providerArg = provider;

  const verifyOne = async () => {
    if (!email.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const res: any = await verifyFn({ data: { email, provider: providerArg } });
      if (res.notConfigured || res.failed) {
        setResult(null);
        toast.error(res.message ?? "Verification unavailable.");
        return;
      }
      setResult({ ...res.result, cached: res.cached });
      usage.refetch();
    } finally {
      setBusy(false);
    }
  };

  const verifyBulk = async () => {
    const emails = Array.from(
      new Set(
        bulk
          .split(/[\s,;]+/)
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.includes("@")),
      ),
    );
    if (emails.length === 0) {
      toast.error("Paste at least one email address.");
      return;
    }
    const { jobId } = await createJob({
      data: {
        label: `Bulk verification — ${emails.length} address(es)`,
        provider: providerArg,
        items: emails.map((e) => ({ email: e })),
      },
    });
    await runner.start(jobId);
  };

  return (
    <AppShell
      title="Email verification"
      description="Deliverability checks with clear, honest results — no invented confidence."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/verification-history">History</Link>
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Single address</h2>
              <HelpTip />
            </div>
            {health.data && !health.data.ok ? (
              <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Free SMTP Verification is unavailable: {health.data.message} Results are never
                downgraded to Valid — switch to Free DNS Verification or fix the service.
              </p>
            ) : null}
            <div className="mt-3">
              <StatusLegend />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Input
                className="max-w-sm flex-1"
                placeholder="hello@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void verifyOne();
                }}
              />
              <Button onClick={verifyOne} disabled={busy}>
                <MailCheck className="size-4" /> Verify
              </Button>
            </div>

            {result ? (
              <div className="mt-5 rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <EmailStatusBadge status={result.status} />
                  <span className="text-sm font-medium">{result.email}</span>
                  {result.cached ? (
                    <span className="text-xs text-muted-foreground">
                      cached result (last 30 days)
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{result.reason}</p>
                <div className="mt-3">
                  <CheckRow label="Syntax valid" value={result.syntax_valid} />
                  <CheckRow label="Domain resolves" value={result.domain_valid} />
                  <CheckRow label="MX records" value={result.mx_valid} />
                  <CheckRow label="SMTP result" value={result.smtp_result} />
                  <CheckRow label="Disposable domain" value={result.disposable} />
                  <CheckRow label="Role account" value={result.role_account} />
                  <CheckRow label="Catch-all domain" value={result.catch_all} />
                  <CheckRow
                    label="Confidence"
                    value={
                      result.confidence !== null && result.confidence !== undefined
                        ? `${result.confidence}%`
                        : null
                    }
                  />
                  <CheckRow label="Provider" value={result.provider} />
                </div>
                <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                  {SMTP_HELP_TEXT} Free DNS Verification does not perform an SMTP handshake, so it
                  reports Unknown rather than Valid. No result guarantees 100% deliverability.
                </p>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">Bulk verification</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste addresses separated by new lines, commas or spaces. Bulk runs use the shared
              job engine with bounded SMTP concurrency (2 simultaneous checks).
            </p>
            <Textarea
              rows={6}
              className="mt-3"
              placeholder={"one@company.com\ntwo@company.com"}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
            />
            <Button className="mt-3" onClick={verifyBulk} disabled={runner.running}>
              {runner.running ? "Verifying…" : "Verify list"}
            </Button>
            <div className="mt-4">
              <JobProgressPanel
                progress={runner.progress}
                error={runner.error}
                running={runner.running}
              />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <Label className="text-xs tracking-wide uppercase">Verification provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(usage.data?.providers ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.configured ? "" : " (not configured)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ul className="mt-3 space-y-2">
              {(usage.data?.providers ?? []).map((p) => (
                <li key={p.id} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{p.name}</span> — {p.description}
                  {!p.configured && p.configurationHint ? (
                    <span className="mt-1 block text-warning-foreground">
                      {p.configurationHint}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Provider usage</h3>
            {(usage.data?.usage ?? []).length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No provider calls recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-xs">
                {usage.data!.usage.map((u) => (
                  <li key={u.provider} className="flex items-center justify-between">
                    <span className="truncate pr-2">{u.provider}</span>
                    <span className="tabular text-muted-foreground">
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
