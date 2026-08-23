import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  Globe,
  History,
  Mail,
  MailCheck,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Upload,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { EmailStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
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
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-xs sm:text-sm font-medium text-foreground break-words">{value ?? "—"}</p>
    </div>
  );
}

function formatDate(isoStr?: string | null) {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "—";
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
  const history = (query.data?.history ?? []) as any[];
  const verifications = (query.data?.verifications ?? []) as any[];
  const owner = query.data?.owner ?? "System";

  const verify = async () => {
    if (!lead?.email) return;
    try {
      const res: any = await verifyFn({ data: { email: lead.email, leadId: id, force: true } });
      if (res.notConfigured || res.failed) {
        toast.error(res.message ?? "Verification service unavailable.");
        return;
      }
      toast.success(`Verification complete: ${res.result?.status ?? "unknown"}`);
      query.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed.");
    }
  };

  const isRediscovered =
    lead?.discovered_at &&
    lead?.created_at &&
    new Date(lead.discovered_at).getTime() > new Date(lead.created_at).getTime() + 60000;

  const mapsQueryUrl = lead?.company_name
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${lead.company_name} ${lead.address || lead.city || ""}`,
      )}`
    : null;

  return (
    <AppShell
      title={lead?.company_name ?? "Lead Profile"}
      description={
        lead
          ? [lead.category, [lead.city, lead.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")
          : undefined
      }
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link to="/leads">
              <ArrowLeft className="size-4 mr-1.5" /> Back to leads
            </Link>
          </Button>
          {lead?.website ? (
            <Button asChild variant="outline" size="sm">
              <a href={lead.website} target="_blank" rel="noreferrer noopener">
                <Globe className="size-4 mr-1.5" /> Website
              </a>
            </Button>
          ) : null}
          <Button size="sm" onClick={verify} disabled={!lead?.email}>
            <MailCheck className="size-4 mr-1.5" /> Verify email
          </Button>
        </>
      }
    >
      {query.isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-32 rounded-lg" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-96 lg:col-span-2 rounded-lg" />
            <Skeleton className="h-96 rounded-lg" />
          </div>
        </div>
      ) : query.error ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="size-8 text-destructive" />
          <h3 className="mt-2 text-sm font-semibold text-foreground">Unable to load lead profile</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {query.error instanceof Error ? query.error.message : "The requested lead could not be retrieved."}
          </p>
          <div className="flex gap-2 mt-4">
            <Button asChild variant="outline" size="sm">
              <Link to="/leads">
                <ArrowLeft className="size-3.5 mr-1" /> Back to leads
              </Link>
            </Button>
            <Button size="sm" onClick={() => query.refetch()}>
              <RefreshCw className="size-3.5 mr-1" /> Try again
            </Button>
          </div>
        </div>
      ) : !query.data || !lead ? (
        <EmptyState
          icon={<AlertCircle className="size-6 text-muted-foreground" />}
          title="Lead not found"
          description="This lead profile may have been deleted or is no longer accessible."
          action={
            <Button asChild size="sm">
              <Link to="/leads">Back to leads</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Main Content Area (2/3) */}
          <div className="space-y-6">
            {/* Card 1: Company Profile & Business Information */}
            <section className="rounded-lg border border-border bg-card p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-border pb-3.5">
                <div>
                  <h2 className="font-display text-base font-bold text-foreground">Company Overview</h2>
                  <p className="text-xs text-muted-foreground">Core identity, industry parameters and operational attributes</p>
                </div>
                {lead.email_status ? <EmailStatusBadge status={lead.email_status} /> : null}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Company Name" value={lead.company_name} />
                <Field label="Industry / Category" value={lead.category} />
                <Field label="Business Type" value={lead.business_type} />
                <Field
                  label="Rating & Reviews"
                  value={
                    lead.rating ? (
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <Star className="size-3.5 text-warning-foreground fill-warning-foreground" />
                        {lead.rating} {lead.review_count ? `(${lead.review_count} reviews)` : ""}
                      </span>
                    ) : (
                      "No ratings recorded"
                    )
                  }
                />
                <Field label="Street Address" value={lead.address} />
                <Field
                  label="Geographic Location"
                  value={[lead.city, lead.region, lead.postal_code, lead.country].filter(Boolean).join(", ") || "—"}
                />
                <Field label="Opening Status" value={lead.opening_status} />
                <Field label="E-Commerce Enabled" value={lead.has_ecommerce ? "Yes" : "No"} />
              </div>

              {lead.description ? (
                <div className="mt-4 border-t border-border pt-3.5">
                  <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Description</p>
                  <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">{lead.description}</p>
                </div>
              ) : null}

              {/* Action Links & Social Media */}
              {lead.contact_page_url || lead.booking_url || lead.ordering_url || (lead.social_urls && Object.keys(lead.social_urls).length > 0) ? (
                <div className="mt-4 border-t border-border pt-3.5">
                  <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-2">
                    Action & Social Links
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {lead.contact_page_url ? (
                      <a
                        href={lead.contact_page_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary hover:text-primary transition-colors"
                      >
                        <MessageSquare className="size-3.5 text-primary" /> Contact Page
                      </a>
                    ) : null}
                    {lead.booking_url ? (
                      <a
                        href={lead.booking_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary hover:text-primary transition-colors"
                      >
                        <Calendar className="size-3.5 text-primary" /> Book Online
                      </a>
                    ) : null}
                    {lead.ordering_url ? (
                      <a
                        href={lead.ordering_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary hover:text-primary transition-colors"
                      >
                        <ShoppingBag className="size-3.5 text-primary" /> Order Online
                      </a>
                    ) : null}
                    {lead.social_urls
                      ? Object.entries(lead.social_urls as Record<string, string>).map(([platform, url]) => (
                          <a
                            key={platform}
                            href={url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors capitalize"
                          >
                            <Globe className="size-3.5" /> {platform}
                          </a>
                        ))
                      : null}
                  </div>
                </div>
              ) : null}
            </section>

            {/* Card 2: Verification History */}
            <section className="rounded-lg border border-border bg-card p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-border pb-3.5">
                <div>
                  <h2 className="font-display text-base font-bold text-foreground">Email Verification History</h2>
                  <p className="text-xs text-muted-foreground">Deliverability checks, SMTP logs and syntax validations</p>
                </div>
                <Button size="sm" variant="outline" onClick={verify} disabled={!lead?.email}>
                  <MailCheck className="size-4 mr-1.5" /> Re-verify
                </Button>
              </div>

              {verifications.length === 0 ? (
                <div className="py-4">
                  <EmptyState
                    icon={<ShieldCheck className="size-5" />}
                    title="No verifications run yet"
                    description="Run an automated deliverability check on this email address."
                    action={
                      <Button size="sm" onClick={verify} disabled={!lead?.email}>
                        Verify Email
                      </Button>
                    }
                  />
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {verifications.map((v: any) => (
                    <li key={v.id} className="py-3.5 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <EmailStatusBadge status={v.status} />
                          <span className="font-mono font-medium text-foreground">{v.email}</span>
                        </div>
                        <span className="text-muted-foreground text-[11px]">
                          {formatDate(v.created_at)} · {v.provider}
                        </span>
                      </div>

                      {v.reason ? <p className="text-xs text-muted-foreground">{v.reason}</p> : null}

                      <div className="flex flex-wrap gap-2 text-[10px]">
                        <span className="rounded bg-secondary px-2 py-0.5 text-muted-foreground">
                          Syntax: {v.syntax_valid ? "Valid" : "Invalid"}
                        </span>
                        <span className="rounded bg-secondary px-2 py-0.5 text-muted-foreground">
                          MX: {v.mx_valid ? "Valid" : "Missing"}
                        </span>
                        <span className="rounded bg-secondary px-2 py-0.5 text-muted-foreground">
                          Disposable: {v.disposable ? "Yes" : "No"}
                        </span>
                        <span className="rounded bg-secondary px-2 py-0.5 text-muted-foreground">
                          Role: {v.role_account ? "Yes" : "No"}
                        </span>
                        <span className="rounded bg-secondary px-2 py-0.5 text-muted-foreground">
                          Catch-all: {v.catch_all ? "Yes" : "No"}
                        </span>
                        {v.confidence !== undefined && v.confidence !== null ? (
                          <span className="rounded bg-primary/10 px-2 py-0.5 text-primary font-medium">
                            Confidence: {v.confidence}%
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Card 3: Chronological Audit Trail & Activity Timeline */}
            <section className="rounded-lg border border-border bg-card p-5 shadow-xs">
              <div className="border-b border-border pb-3.5">
                <h2 className="font-display text-base font-bold text-foreground">Lead Activity History</h2>
                <p className="text-xs text-muted-foreground">Chronological audit trail of discovery, import and status events</p>
              </div>

              {history.length === 0 ? (
                <div className="py-4">
                  <EmptyState
                    icon={<History className="size-5" />}
                    title="No activity recorded yet"
                    description="System events and user updates will be logged here chronologically."
                  />
                </div>
              ) : (
                <div className="relative mt-4 pl-4 border-l border-border space-y-6">
                  {history.map((h: any) => {
                    const icon =
                      h.event_type === "imported" ? (
                        <Upload className="size-3 text-primary" />
                      ) : h.event_type === "verified" ? (
                        <ShieldCheck className="size-3 text-success" />
                      ) : (
                        <Clock className="size-3 text-muted-foreground" />
                      );

                    return (
                      <div key={h.id} className="relative group">
                        <div className="absolute -left-[23px] top-0.5 flex size-4 items-center justify-center rounded-full bg-card border border-border">
                          {icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground capitalize">
                            {String(h.event_type).replace(/_/g, " ")}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDate(h.created_at)}
                            {h.user_name ? ` · by ${h.user_name}` : ""}
                          </p>
                          {h.detail ? (
                            <p className="mt-1 text-xs text-muted-foreground leading-relaxed bg-secondary/40 rounded p-2 border border-border/50">
                              {h.detail}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Right Sidebar (1/3) */}
          <aside className="space-y-6">
            {/* Contactability Card */}
            <div className="rounded-lg border border-border bg-card p-5 shadow-xs space-y-4">
              <h3 className="font-display text-sm font-bold text-foreground">Contact & Deliverability</h3>

              <div className="space-y-3.5 text-xs">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Email Address</p>
                  {lead.email ? (
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <a href={`mailto:${lead.email}`} className="font-mono text-xs text-foreground font-medium hover:underline truncate">
                        {lead.email}
                      </a>
                      <a href={`mailto:${lead.email}`} className="text-primary hover:underline shrink-0">
                        <Mail className="size-3.5" />
                      </a>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground italic">Email not available</p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Phone Number</p>
                  {lead.phone ? (
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <a href={`tel:${lead.phone}`} className="font-medium text-foreground hover:underline">
                        {lead.phone}
                      </a>
                      <a href={`tel:${lead.phone}`} className="text-primary hover:underline shrink-0">
                        <Phone className="size-3.5" />
                      </a>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground italic">Phone not available</p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Website URL</p>
                  {lead.website ? (
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <a href={lead.website} target="_blank" rel="noreferrer noopener" className="font-medium text-primary hover:underline truncate">
                        {lead.domain || lead.website}
                      </a>
                      <a href={lead.website} target="_blank" rel="noreferrer noopener" className="text-primary shrink-0">
                        <ExternalLink className="size-3.5" />
                      </a>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground italic">Website not available</p>
                  )}
                </div>

                {mapsQueryUrl ? (
                  <div className="pt-2 border-t border-border">
                    <Button asChild variant="outline" size="sm" className="w-full text-xs">
                      <a href={mapsQueryUrl} target="_blank" rel="noreferrer noopener">
                        <MapPin className="size-3.5 mr-1.5 text-primary" /> Open in Google Maps
                      </a>
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Lead Provenance Card */}
            <div className="rounded-lg border border-border bg-card p-5 shadow-xs space-y-4">
              <h3 className="font-display text-sm font-bold text-foreground">Lead Provenance</h3>

              <div className="space-y-3">
                <Field label="Discovery Source" value={lead.source} />
                <Field label="Added By User" value={owner} />
                <Field label="Created Date" value={formatDate(lead.created_at)} />
                <Field
                  label={isRediscovered ? "Last Imported Date" : "Imported / Discovered"}
                  value={formatDate(lead.discovered_at || lead.created_at)}
                />
                <Field label="Last Updated" value={formatDate(lead.updated_at)} />

                {lead.source_url ? (
                  <Field
                    label="Source URL"
                    value={
                      <a
                        href={lead.source_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                      >
                        View Original Source <ExternalLink className="size-3" />
                      </a>
                    }
                  />
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
