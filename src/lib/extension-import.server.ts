/**
 * Server-only ingestion of Chrome extension discovery batches.
 * All records are untrusted: validated, normalised, then handed to the
 * existing lead pipeline (dedup + enrichment + history). No second
 * deduplication algorithm lives here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { RawLead } from "@/lib/domain-types";
import { recordUsage, upsertLead } from "@/lib/leads.server";
import { getRuntimeConfig } from "@/lib/config/runtime-config.server";
import { parseAddressLocation, sanitizeAddress, sanitizeCategory } from "@/lib/normalize";

export const EXTENSION_SOURCE_ID = "chrome-extension";
export const MAX_BATCH_SIZE = 50;

type DB = SupabaseClient<any, "public", any>;

const nullableString = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      const t = typeof v === "string" ? v.trim() : "";
      return t.length ? t.slice(0, max) : null;
    });

const nullableNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  });

export const extensionLeadSchema = z.object({
  company_name: z.string().trim().min(1).max(300),
  category: nullableString(200),
  business_type: nullableString(200),
  phone: nullableString(60),
  website: nullableString(500),
  address: nullableString(500),
  city: nullableString(160),
  region: nullableString(160),
  country: nullableString(160),
  postal_code: nullableString(40),
  rating: nullableNumber,
  review_count: nullableNumber,
  opening_status: nullableString(160),
  opening_hours: nullableString(500),
  source_url: nullableString(1000),
  place_id: nullableString(300),
  latitude: nullableNumber,
  longitude: nullableNumber,
  plus_code: nullableString(60),
  price_range: nullableString(100),
  menu: nullableString(500),
  ordering_url: nullableString(500),
  booking_url: nullableString(500),
  extraction_source: nullableString(60),
});

export const extensionImportSchema = z.object({
  source: z.literal("chrome-extension"),
  search_query: z.union([z.string(), z.null()]).optional(),
  source_url: z.union([z.string(), z.null()]).optional(),
  leads: z.array(z.unknown()).min(1).max(MAX_BATCH_SIZE),
});

export interface ExtensionImportRecordResult {
  company: string | null;
  outcome: "created" | "duplicate" | "merged" | "rejected" | "error";
  reason?: string | undefined;
}

export interface ExtensionImportResponse {
  jobId: string | null;
  total: number;
  created: number;
  duplicate: number;
  merged: number;
  rejected: number;
  errors: number;
  results: ExtensionImportRecordResult[];
}

function toRawLead(parsed: z.infer<typeof extensionLeadSchema>): RawLead {
  const cleanCategory = sanitizeCategory(parsed.category ?? parsed.business_type ?? null);
  const cleanAddr = sanitizeAddress(parsed.address ?? null);
  const loc = parseAddressLocation(cleanAddr);
  return {
    company_name: parsed.company_name,
    website: parsed.website ?? null,
    domain: null,
    category: cleanCategory,
    address: cleanAddr,
    city: sanitizeAddress(parsed.city) ?? loc.city ?? null,
    region: sanitizeAddress(parsed.region) ?? loc.region ?? null,
    country: sanitizeAddress(parsed.country) ?? loc.country ?? null,
    postal_code: parsed.postal_code ?? null,
    phone: parsed.phone ?? null,
    email: null,
    rating: parsed.rating ?? null,
    review_count: parsed.review_count ?? null,
    business_type: cleanCategory,
    opening_status: parsed.opening_status ?? null,
    source_url: parsed.source_url ?? null,
    attributes: {
      place_id: parsed.place_id ?? null,
      latitude: parsed.latitude ?? null,
      longitude: parsed.longitude ?? null,
      plus_code: parsed.plus_code ?? null,
      opening_hours: parsed.opening_hours ?? null,
      price_range: parsed.price_range ?? null,
      menu: parsed.menu ?? null,
      ordering_url: parsed.ordering_url ?? null,
      booking_url: parsed.booking_url ?? null,
      extraction_source: parsed.extraction_source ?? "detail",
      captured_by: "chrome-extension",
    },
  };
}

export async function importExtensionBatch(
  db: DB,
  userId: string,
  payload: z.infer<typeof extensionImportSchema>,
): Promise<ExtensionImportResponse> {
  const runtimeConfig = await getRuntimeConfig(db);
  
  if (!runtimeConfig.discoveryChromeExtensionEnabled) {
    throw new Error("Chrome extension lead discovery is currently disabled by administrator.");
  }

  if (payload.leads.length > runtimeConfig.importBatchSize) {
    throw new Error(
      `Batch size (${payload.leads.length}) exceeds maximum allowed import batch size (${runtimeConfig.importBatchSize}).`,
    );
  }

  const searchQuery = payload.search_query?.trim() || null;

  const { data: job } = await db
    .from("jobs")
    .insert({
      type: "discovery",
      label: `Browser discovery — ${searchQuery ?? "Google Maps"}`,
      provider: EXTENSION_SOURCE_ID,
      params: { source: EXTENSION_SOURCE_ID, search_query: searchQuery, source_url: payload.source_url ?? null },
      status: "running",
      total: payload.leads.length,
      started_at: new Date().toISOString(),
      user_id: userId,
    })
    .select("id")
    .single();
  const jobId = (job?.id as string | undefined) ?? null;

  const response: ExtensionImportResponse = {
    jobId,
    total: payload.leads.length,
    created: 0,
    duplicate: 0,
    merged: 0,
    rejected: 0,
    errors: 0,
    results: [],
  };

  for (const candidate of payload.leads) {
    const parsed = extensionLeadSchema.safeParse(candidate);
    if (!parsed.success) {
      response.rejected++;
      response.results.push({
        company: null,
        outcome: "rejected",
        reason: parsed.error.issues[0]?.message ?? "Malformed record",
      });
      continue;
    }
    try {
      const result = await upsertLead(db, toRawLead(parsed.data), {
        source: EXTENSION_SOURCE_ID,
        searchQuery,
        jobId,
        userId,
      });
      if (result.outcome === "created") response.created++;
      else if (result.outcome === "enriched") response.merged++;
      else if (result.outcome === "duplicate") response.duplicate++;
      else response.rejected++;
      response.results.push({
        company: result.company ?? parsed.data.company_name,
        outcome:
          result.outcome === "enriched"
            ? "merged"
            : result.outcome === "invalid"
              ? "rejected"
              : result.outcome,
        reason: result.reason,
      });
    } catch (err) {
      response.errors++;
      response.results.push({
        company: parsed.data.company_name,
        outcome: "error",
        reason: err instanceof Error ? err.message : "Import failed",
      });
    }
  }

  if (jobId) {
    await db
      .from("jobs")
      .update({
        status: "completed",
        processed: response.total,
        counters: {
          created: response.created,
          duplicate: response.duplicate,
          enriched: response.merged,
          rejected: response.rejected,
          errors: response.errors,
        },
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }

  await recordUsage(db, {
    provider: EXTENSION_SOURCE_ID,
    kind: "lead_source",
    operation: "import",
    units: response.total,
    requested_units: response.total,
    success: response.errors === 0,
    estimated_cost: 0,
    metadata: { search_query: searchQuery },
    job_id: jobId,
    user_id: userId,
  });

  return response;
}
