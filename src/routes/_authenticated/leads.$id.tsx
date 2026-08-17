import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ExternalLink, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { EmailStatusBadge } from "@/components/status-badge";
import { getLead } from "@/lib/leads.functions";
import { verifySingleEmail } from "@/lib/verification.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  head: () => ({
    meta: [
      { title: "Lead detail — Sales Intelligence" },
      {
        name: "description",
        content: "Full company profile, sales signals, verification results and change history.",
      },
      { property: "og:title", content: "Lead detail — Sales Intelligence" },
      {
        property: "og:description",
        content: "Company profile, sales signals, verification results and history.",
      },
    ],
  }),
  component: LeadDetailPage,
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 text-sm break-words">{value ?? "—"}</p>
    </div>
  );
}

function formatDate(isoStr?: string | null) {
  if (!isoStr) return null;
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return null;
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

function LeadDetailPage() {
  const { id } = useParams({ from: "/_authenticated/leads/$id" });
  const getLeadFn = useServerFn(getLead);
  const verifyFn = useServerFn(verifySingleEmail);
  const query = useQuery({ queryKey: ["lead", id], queryFn: () => getLeadFn({ data: { id } }) });

  const lead = query.data?.lead as any;

  const verify = async () => {
    if (!lead?.email) return;
    const res: any = await verifyFn({ data: { email: lead.email, leadId: id, force: true } });
    if (res.notConfigured || res.failed) {
      toast.error(res.message ?? "Verification unavailable.");
      return;
    }
    toast.success(`Result: ${res.result?.status ?? "unknown"}`);
    query.refetch();
  };

  const isRediscovered =
    lead?.discovered_at &&
    lead?.created_at &&
    new Date(lead.discovered_at).getTime() > new Date(lead.created_at).getTime() + 60000;

  return (
    <AppShell
      title={lead?.company_name ?? "Lead"}
      description={lead ? [lead.city, lead.country].filter(Boolean).join(", ") : undefined}
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link to="/leads">
              <ArrowLeft className="size-4" /> Back to leads
            </Link>
          </Button>
          <Button size="sm" onClick={verify} disabled={!lead?.email}>
            <MailCheck className="size-4" /> Verify email
          </Button>
        </>
      }
    >
      {query.isLoading ? (
        <Skeleton className="h-64" />
      ) : !query.data ? (
        <p className="text-sm text-muted-foreground">This lead no longer exists.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Company</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Company name" value={lead.company_name} />
                <Field
                  label="Website"
                  value={
                    lead.website ? (
                      <a
                        href={lead.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {lead.domain ?? lead.website} <ExternalLink className="size-3" />
                      </a>
                    ) : null
                  }
                />
                <Field label="Industry" value={lead.category} />
                <Field label="Business type" value={lead.business_type} />
                <Field label="Address" value={lead.address} />
                <Field
                  label="Location"
                  value={[lead.city, lead.region, lead.postal_code, lead.country]
                    .filter(Boolean)
                    .join(", ")}
                />
                <Field label="Phone" value={lead.phone} />
                <Field
                  label="Email"
                  value={
                    lead.email ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {lead.email} <EmailStatusBadge status={lead.email_status} />
                      </span>
                    ) : null
                  }
                />
              </div>
              {lead.description ? (
                <p className="mt-4 text-sm text-muted-foreground">{lead.description}</p>
              ) : null}
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Sales signals</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field label="Rating" value={lead.rating} />
                <Field label="Reviews" value={lead.review_count} />
                <Field label="Locations" value={lead.location_count} />
                <Field label="Opening status" value={lead.opening_status} />
                <Field label="E-commerce" value={lead.has_ecommerce ? "Yes" : "No"} />
                <Field
                  label="Contact page"
                  value={
                    lead.contact_page_url ? (
                      <a
                        href={lead.contact_page_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary hover:underline"
                      >
                        Open
                      </a>
                    ) : null
                  }
                />
                <Field
                  label="Booking"
                  value={
                    lead.booking_url ? (
                      <a
                        href={lead.booking_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary hover:underline"
                      >
                        Open
                      </a>
                    ) : null
                  }
                />
                <Field
                  label="Ordering"
                  value={
                    lead.ordering_url ? (
                      <a
                        href={lead.ordering_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary hover:underline"
                      >
                        Open
                      </a>
                    ) : null
                  }
                />
              </div>
              {lead.social_urls && Object.keys(lead.social_urls).length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {Object.entries(lead.social_urls as Record<string, string>).map(([key, url]) => (
                    <a
                      key={key}
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-full border border-border px-2.5 py-1 text-xs capitalize hover:border-primary hover:text-primary"
                    >
                      {key}
                    </a>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Verification history</h2>
              {query.data.verifications.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  This email has not been verified yet.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {query.data.verifications.map((v: any) => (
                    <li key={v.id} className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <EmailStatusBadge status={v.status} />
                        <span className="text-sm">{v.email}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(v.created_at)} · {v.provider}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{v.reason}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Syntax {String(v.syntax_valid)} · MX {String(v.mx_valid)} · Disposable{" "}
                        {String(v.disposable)} · Role {String(v.role_account)} · Catch-all{" "}
                        {String(v.catch_all)} · Confidence {v.confidence}%
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4 text-sm">
              <h3 className="text-sm font-semibold">Provenance</h3>
              <div className="mt-3 space-y-3">
                <Field label="Source" value={lead.source} />
                <Field
                  label="Source URL"
                  value={
                    lead.source_url ? (
                      <a
                        href={lead.source_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary hover:underline"
                      >
                        View original
                      </a>
                    ) : null
                  }
                />
                <Field label="Added by" value={query.data.owner} />
                <Field label="Created" value={formatDate(lead.created_at)} />
                <Field
                  label={isRediscovered ? "Last Imported" : "Imported / Discovered"}
                  value={formatDate(lead.discovered_at || lead.created_at)}
                />
                <Field label="Last updated" value={formatDate(lead.updated_at)} />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold">Change history</h3>
              {query.data.history.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No changes recorded.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {query.data.history.map((h: any) => (
                    <li key={h.id} className="text-sm">
                      <p className="font-medium capitalize">{String(h.event_type).replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(h.created_at)}
                        {h.user_name ? ` · ${h.user_name}` : ""}
                      </p>
                      {h.detail ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{h.detail}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
