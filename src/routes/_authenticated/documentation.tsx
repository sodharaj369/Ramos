import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { EmailStatusBadge } from "@/components/status-badge";
import { VERIFICATION_STATUSES } from "@/lib/domain-types";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/documentation")({
  head: () => ({
    meta: [
      { title: "Documentation — Sales Intel" },
      {
        name: "description",
        content:
          "How to discover leads with the Chrome connector, import, verify emails and export from Sales Intel.",
      },
      { property: "og:title", content: "Documentation — Sales Intel" },
      {
        property: "og:description",
        content: "Guides for discovery, importing, email verification, jobs and exporting.",
      },
    ],
  }),
  component: DocumentationPage,
});

const SECTIONS = [
  { id: "getting-started", title: "Getting started" },
  { id: "connector", title: "Google Maps connector" },
  { id: "finding-leads", title: "Finding leads" },
  { id: "importing", title: "Importing leads" },
  { id: "verification", title: "Email verification" },
  { id: "jobs", title: "Jobs" },
  { id: "exporting", title: "Exporting" },
  { id: "troubleshooting", title: "Troubleshooting" },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-lg border border-border bg-card p-5 shadow-card">
      <h2 className="font-[family-name:var(--font-display)] text-base font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function DocumentationPage() {
  return (
    <AppShell
      title="Documentation"
      description="How Sales Intel works, written for the people using it every day."
      actions={
        <Button asChild size="sm">
          <Link to="/finder">Find leads</Link>
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Documentation sections" className="lg:sticky lg:top-6 lg:self-start">
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-4">
          <Section id="getting-started" title="Getting started">
            <p>
              Sales Intel collects publicly available business information, removes duplicates and
              helps you check whether an email address is likely to work.
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Sign in with your work email.</li>
              <li>Install and connect the Sales Intel Maps Connector in Settings.</li>
              <li>Discover businesses, import them, then verify and export.</li>
            </ol>
          </Section>

          <Section id="connector" title="Google Maps connector (Chrome extension)">
            <p>
              The connector is the primary discovery method. Discovery runs in your own browser on
              a Google Maps results page; Sales Intel only receives the businesses you choose to
              import.
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Settings → download the connector ZIP and unzip it.</li>
              <li>
                Open <span className="text-foreground">chrome://extensions</span>, enable Developer
                mode, choose “Load unpacked” and select the folder.
              </li>
              <li>Return to Settings and click Connect Extension.</li>
              <li>Open Google Maps, search for the businesses you want.</li>
              <li>Open the connector, pick a result limit and click Start Discovery.</li>
              <li>Review the count, then click Import to Sales Intel.</li>
            </ol>
            <p>
              The connector never signs in on your behalf beyond the session you approve, and it
              only reads business listings that are already visible on the page.
            </p>
          </Section>

          <Section id="finding-leads" title="Finding leads">
            <p>
              On the Find Leads page, describe the business type, choose country, state, city and
              optionally an area, then pick a maximum number of results and a discovery provider.
            </p>
            <p>
              Every result is normalised and matched against the existing database. A match is
              enriched with new details instead of being added twice.
            </p>
          </Section>

          <Section id="importing" title="Importing leads">
            <p>
              Import accepts a CSV with a company name column plus any of website, email, phone,
              address, city, country and industry. Rows are deduplicated on domain, email, phone
              and normalised company name.
            </p>
            <p>
              Imports run as a job, so you can watch progress and see how many rows were created,
              merged or rejected.
            </p>
          </Section>

          <Section id="verification" title="Email verification">
            <p>
              Two providers are available. <span className="text-foreground">Free SMTP
              Verification</span> asks the recipient mail server whether it accepts the mailbox.{" "}
              <span className="text-foreground">Free DNS Verification</span> only checks syntax,
              domain and MX records, so it never reports Valid.
            </p>
            <div className="flex flex-wrap gap-2 py-1">
              {VERIFICATION_STATUSES.map((s) => (
                <EmailStatusBadge key={s} status={s} />
              ))}
            </div>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="text-foreground">Valid</span> — the server accepted the mailbox.
              </li>
              <li>
                <span className="text-foreground">Invalid</span> — the server rejected the mailbox
                or the domain cannot receive mail.
              </li>
              <li>
                <span className="text-foreground">Catch-all</span> — the domain accepts every
                address, so this specific mailbox cannot be confirmed. Catch-all is never treated
                as Valid.
              </li>
              <li>
                <span className="text-foreground">Unknown</span> — the check could not complete.
              </li>
              <li>
                <span className="text-foreground">Disposable</span> — a temporary-inbox provider.
              </li>
              <li>
                <span className="text-foreground">Role</span> — a shared address such as info@ or
                support@.
              </li>
              <li>
                <span className="text-foreground">Not checked</span> — no verification has run.
              </li>
            </ul>
            <p>
              No verification result guarantees deliverability. A message can still bounce or be
              filtered after the mail server accepted the address.
            </p>
          </Section>

          <Section id="jobs" title="Jobs">
            <p>
              Discovery, import and verification run as resumable jobs. Jobs progress while this
              browser tab is open; a job left unfinished stays queued and can be resumed from the
              Jobs page. Completed jobs show real counts only — found, created, duplicates and
              contact coverage.
            </p>
          </Section>

          <Section id="exporting" title="Exporting">
            <p>
              From the Leads page you can export the current filtered set or just the rows you
              selected. The file is a CSV containing the same fields shown in the table, including
              the email status at the time of export.
            </p>
          </Section>

          <Section id="troubleshooting" title="Troubleshooting">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="text-foreground">Connector shows “Not installed”</span> — reload
                the page after loading the unpacked extension.
              </li>
              <li>
                <span className="text-foreground">“Open Google Maps”</span> — the connector only
                works on a Maps results list; run a search first.
              </li>
              <li>
                <span className="text-foreground">Discovery couldn't be completed</span> — reload
                the Maps page and try again with a smaller result limit.
              </li>
              <li>
                <span className="text-foreground">SMTP verification unavailable</span> — the
                verification service isn't reachable. Results are never downgraded to Valid; use
                DNS verification meanwhile.
              </li>
              <li>
                <span className="text-foreground">A search returns nothing</span> — narrow the
                location or use different keywords; only public listings are collected.
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
