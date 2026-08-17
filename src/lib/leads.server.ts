/** Server-only lead persistence: normalisation, deduplication, history. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RawLead } from "@/lib/domain-types";
import {
  domainFromEmail,
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  normalizeWebsite,
} from "@/lib/normalize";

type DB = SupabaseClient<any, "public", any>;

export type UpsertOutcome = "created" | "duplicate" | "enriched" | "invalid";

export interface UpsertResult {
  outcome: UpsertOutcome;
  leadId?: string;
  reason?: string;
  company?: string;
}

export interface UpsertContext {
  source: string;
  searchQuery?: string | null;
  jobId?: string | null;
  userId: string;
}

export function buildLeadRow(raw: RawLead, ctx: UpsertContext) {
  const website = normalizeWebsite(raw.website ?? null);
  const domain = normalizeDomain(raw.domain ?? raw.website ?? null) ?? domainFromEmail(raw.email);
  const email = normalizeEmail(raw.email ?? null);
  const phone = raw.phone?.trim() || null;
  const nowIso = new Date().toISOString();
  return {
    company_name: raw.company_name.trim(),
    website,
    domain,
    normalized_domain: domain,
    normalized_name: normalizeCompanyName(raw.company_name) ?? raw.company_name.toLowerCase(),
    normalized_city: normalizeText(raw.city ?? null),
    category: raw.category ?? null,
    description: raw.description ?? null,
    address: raw.address ?? null,
    city: raw.city ?? null,
    region: raw.region ?? null,
    country: raw.country ?? null,
    postal_code: raw.postal_code ?? null,
    phone,
    normalized_phone: normalizePhone(phone),
    email,
    normalized_email: email,
    location_count: raw.location_count ?? null,
    rating: raw.rating ?? null,
    review_count: raw.review_count ?? null,
    social_urls: raw.social_urls ?? {},
    contact_page_url: raw.contact_page_url ?? null,
    booking_url: raw.booking_url ?? null,
    ordering_url: raw.ordering_url ?? null,
    has_ecommerce: raw.has_ecommerce ?? null,
    business_type: raw.business_type ?? null,
    opening_status: raw.opening_status ?? null,
    attributes: raw.attributes ?? {},
    source: ctx.source,
    source_url: raw.source_url ?? null,
    search_query: ctx.searchQuery ?? null,
    created_by: ctx.userId,
    discovered_at: nowIso,
  };
}

async function findExisting(db: DB, row: ReturnType<typeof buildLeadRow>) {
  if (row.normalized_domain) {
    const { data } = await db
      .from("leads")
      .select("*")
      .eq("normalized_domain", row.normalized_domain)
      .maybeSingle();
    if (data) return { lead: data, matchedOn: "domain" };
  }
  if (row.normalized_email) {
    const { data } = await db
      .from("leads")
      .select("*")
      .eq("normalized_email", row.normalized_email)
      .limit(1);
    if (data?.[0]) return { lead: data[0], matchedOn: "email" };
  }
  if (row.normalized_phone) {
    const { data } = await db
      .from("leads")
      .select("*")
      .eq("normalized_phone", row.normalized_phone)
      .limit(1);
    if (data?.[0]) return { lead: data[0], matchedOn: "phone" };
  }
  const nameQuery = db
    .from("leads")
    .select("*")
    .eq("normalized_name", row.normalized_name)
    .limit(1);
  const { data } = row.normalized_city
    ? await nameQuery.eq("normalized_city", row.normalized_city)
    : await nameQuery.is("normalized_city", null);
  if (data?.[0]) return { lead: data[0], matchedOn: "company name + location" };
  return null;
}

const ENRICHABLE = [
  "website",
  "domain",
  "normalized_domain",
  "category",
  "description",
  "address",
  "city",
  "normalized_city",
  "region",
  "country",
  "postal_code",
  "phone",
  "normalized_phone",
  "email",
  "normalized_email",
  "location_count",
  "rating",
  "review_count",
  "contact_page_url",
  "booking_url",
  "ordering_url",
  "has_ecommerce",
  "business_type",
  "opening_status",
  "source_url",
] as const;

/**
 * Inserts a lead, or safely reconciles it with an existing record.
 * Existing records are never overwritten — only empty fields are filled in,
 * created_at is preserved, and discovered_at is updated to the latest import timestamp.
 */
export async function upsertLead(db: DB, raw: RawLead, ctx: UpsertContext): Promise<UpsertResult> {
  if (!raw.company_name?.trim()) {
    return { outcome: "invalid", reason: "Missing company name" };
  }
  const row = buildLeadRow(raw, ctx);
  const existing = await findExisting(db, row);

  if (existing) {
    const lead = existing.lead as Record<string, unknown>;
    const patch: Record<string, unknown> = {
      discovered_at: new Date().toISOString(), // Update latest import timestamp; created_at remains untouched
    };
    for (const field of ENRICHABLE) {
      const current = lead[field];
      const incoming = (row as Record<string, unknown>)[field];
      if ((current === null || current === undefined || current === "") && incoming != null) {
        patch[field] = incoming;
      }
    }
    const enriched = Object.keys(patch).length > 1; // more than just discovered_at
    await db.from("leads").update(patch).eq("id", lead["id"] as string);

    await db.from("lead_history").insert({
      lead_id: lead["id"] as string,
      event_type: enriched ? "enriched" : "duplicate_detected",
      detail: enriched
        ? `Duplicate matched on ${existing.matchedOn}; filled empty field(s) from ${ctx.source}.`
        : `Duplicate matched on ${existing.matchedOn}; updated discovered timestamp from ${ctx.source}.`,
      metadata: { matched_on: existing.matchedOn, source: ctx.source, fields: Object.keys(patch) },
      user_id: ctx.userId,
    });
    return {
      outcome: enriched ? "enriched" : "duplicate",
      leadId: lead["id"] as string,
      reason: `Matched existing lead on ${existing.matchedOn}`,
      company: row.company_name,
    };
  }

  const { data, error } = await db.from("leads").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505") {
      return { outcome: "duplicate", reason: "Matched an existing lead", company: row.company_name };
    }
    return { outcome: "invalid", reason: error.message, company: row.company_name };
  }
  await db.from("lead_history").insert({
    lead_id: data.id,
    event_type: ctx.source === "csv-import" ? "imported" : "discovered",
    detail: `Added from ${ctx.source}${ctx.searchQuery ? ` — query: "${ctx.searchQuery}"` : ""}.`,
    metadata: { source: ctx.source, job_id: ctx.jobId ?? null },
    user_id: ctx.userId,
  });
  return { outcome: "created", leadId: data.id, company: row.company_name };
}

export async function recordUsage(
  db: DB,
  entry: {
    provider: string;
    kind: "lead_source" | "email_verifier";
    operation: string;
    units?: number;
    requested_units?: number | null;
    success: boolean;
    estimated_cost?: number | null;
    error?: string | null;
    metadata?: Record<string, unknown> | null;
    job_id?: string | null;
    user_id: string;
  },
) {
  await db.from("provider_usage").insert({
    provider: entry.provider,
    kind: entry.kind,
    operation: entry.operation,
    units: entry.units ?? 1,
    requested_units: entry.requested_units ?? null,
    success: entry.success,
    estimated_cost: entry.estimated_cost ?? null,
    error: entry.error ?? null,
    metadata: entry.metadata ?? {},
    job_id: entry.job_id ?? null,
    user_id: entry.user_id,
  });
}
