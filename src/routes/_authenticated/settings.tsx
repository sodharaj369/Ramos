import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { ExtensionConnection } from "@/components/extension-connection";
import { useAuth } from "@/hooks/use-auth";
import { listProviders } from "@/lib/jobs.functions";
import { getUsageStats } from "@/lib/verification.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Sales Intelligence" },
      {
        name: "description",
        content: "Account details, configured data providers and provider usage totals.",
      },
      { property: "og:title", content: "Settings — Sales Intelligence" },
      { property: "og:description", content: "Account details and provider configuration." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const providersFn = useServerFn(listProviders);
  const usageFn = useServerFn(getUsageStats);
  const providers = useQuery({ queryKey: ["providers"], queryFn: () => providersFn({}) });
  const usage = useQuery({ queryKey: ["usage"], queryFn: () => usageFn({}) });

  const all = [
    ...(providers.data?.leadSources ?? []),
    ...(providers.data?.emailVerifiers ?? []),
  ];

  return (
    <AppShell title="Settings" description="Account, providers and usage.">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Account</h2>
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-muted-foreground">
              Signed in as <span className="text-foreground">{user?.email ?? "—"}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Leads, jobs and verification results are shared across the whole team. You can edit or
              delete records you created; admins can manage everything.
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Provider usage</h2>
          {(usage.data?.usage ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No provider calls recorded yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {usage.data!.usage.map((u) => (
                <li key={u.provider} className="flex items-center justify-between">
                  <span>{u.provider}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    {u.calls} calls · {u.success} ok · {u.failed} failed
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:col-span-2">
          <ExtensionConnection />
        </section>

        <section className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Data providers</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Providers are pluggable. Unconfigured ones stay listed so they can be switched on later
            without code changes elsewhere. Credentials are stored as server-side secrets and are
            never sent to the browser — only the configured/not-configured status is shown here.
          </p>
          <ul className="mt-4 divide-y divide-border">
            {all.map((p) => (
              <li key={`${p.kind}-${p.id}`} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {p.kind === "lead_source" ? "Lead source" : "Email verifier"}
                  </span>
                  <span
                    className={
                      p.configured
                        ? "rounded-full bg-success/12 px-2 py-0.5 text-[10px] text-success"
                        : "rounded-full bg-warning/15 px-2 py-0.5 text-[10px] text-warning-foreground"
                    }
                  >
                    {p.configured ? "Configured" : "Not configured"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                {!p.configured && p.configurationHint ? (
                  <p className="mt-1 text-xs text-warning-foreground">{p.configurationHint}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Capabilities and current limits</h2>
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
            <li>
              <span className="text-foreground">Background jobs</span> — discovery, import and
              verification run in resumable batches driven by the open browser tab. There is no
              server-side worker or scheduled execution yet.
            </li>
            <li>
              <span className="text-foreground">Built-in email verification</span> — syntax, domain
              resolution, MX records, disposable domains and role accounts. No SMTP mailbox
              handshake, so mailbox existence and inbox delivery are never confirmed by this
              verifier.
            </li>
            <li>
              <span className="text-foreground">Demo lead source</span> — synthetic sample records
              for testing only. It is never selected automatically and results are prefixed with
              [DEMO].
            </li>
            <li>
              <span className="text-foreground">Account emails</span> — signup confirmation and
              password reset emails are sent by the backend auth service. The app can confirm a send
              was accepted; it cannot confirm inbox delivery.
            </li>
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
