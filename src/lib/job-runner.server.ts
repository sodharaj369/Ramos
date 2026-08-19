/** Server-only job engine: batched, resumable, cancellable processing. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RawLead, VerificationResult } from "@/lib/domain-types";
import { getEmailVerifier } from "@/lib/providers/email-verifiers.server";
import { getLeadSource } from "@/lib/providers/lead-sources.server";
import {
  ProviderNotConfiguredError,
  RATE_LIMITS,
  mapWithLimit,
} from "@/lib/providers/runtime.server";
import { recordUsage, upsertLead } from "@/lib/leads.server";
import { normalizeEmail } from "@/lib/normalize";

type DB = SupabaseClient<any, "public", any>;

export interface JobRow {
  id: string;
  type: "discovery" | "verification" | "import";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  provider: string | null;
  params: Record<string, unknown>;
  payload: unknown[];
  cursor: number;
  total: number;
  processed: number;
  counters: Record<string, number>;
  user_id: string;
}

const bump = (counters: Record<string, number>, key: string, by = 1) => {
  counters[key] = (counters[key] ?? 0) + by;
};

export async function runBatch(db: DB, jobId: string, userId: string) {
  const { data: job, error } = await db.from("jobs").select("*").eq("id", jobId).single();
  if (error || !job) throw new Error("Job not found");
  const current = job as unknown as JobRow;

  if (current.status === "cancelled" || current.status === "completed" || current.status === "failed") {
    return current;
  }

  try {
    if (current.status === "queued") {
      await db.from("jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", jobId);
      current.status = "running";
    }

    if (current.type === "discovery" && current.total === 0 && current.cursor === 0) {
      return await startDiscovery(db, current, userId);
    }

    const counters = { ...current.counters };
    const slice = current.payload.slice(current.cursor, current.cursor + RATE_LIMITS.batchSize);

    if (slice.length === 0) {
      return await finish(db, jobId, "completed", counters, current.processed, current.total);
    }

    if (current.type === "verification") {
      await processVerificationSlice(db, current, slice as { email: string; lead_id?: string }[], counters, userId);
    } else {
      await processLeadSlice(db, current, slice as RawLead[], counters, userId);
    }

    const cursor = current.cursor + slice.length;
    const processed = cursor;
    const done = cursor >= current.total;
    if (done) return await finish(db, jobId, "completed", counters, processed, current.total);

    const { data } = await db
      .from("jobs")
      .update({ cursor, processed, counters })
      .eq("id", jobId)
      .select("*")
      .single();
    return data as unknown as JobRow;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected job failure";
    await db
      .from("jobs")
      .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
      .eq("id", jobId);
    throw err;
  }
}

async function finish(
  db: DB,
  jobId: string,
  status: "completed",
  counters: Record<string, number>,
  processed: number,
  total: number,
) {
  const { data } = await db
    .from("jobs")
    .update({ status, counters, processed, cursor: total, finished_at: new Date().toISOString() })
    .eq("id", jobId)
    .select("*")
    .single();
  return data as unknown as JobRow;
}

async function startDiscovery(db: DB, job: JobRow, userId: string) {
  const sourceId = String(job.params["sourceId"] ?? "");
  const source = getLeadSource(sourceId);
  const query = String(job.params["query"] ?? "");
  const requested = Number(job.params["limit"] ?? 25);
  const usageBase = {
    provider: sourceId,
    kind: "lead_source" as const,
    operation: "search",
    requested_units: requested,
    metadata: {
      query,
      location: job.params["location"] ?? null,
      industry: job.params["industry"] ?? null,
      keyword: job.params["keyword"] ?? null,
      requested,
    },
    job_id: job.id,
    user_id: userId,
  };

  if (!source.isConfigured()) {
    const message = `${source.name} is not configured. ${source.configurationHint ?? ""}`.trim();
    await db
      .from("jobs")
      .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
      .eq("id", job.id);
    await recordUsage(db, { ...usageBase, units: 0, success: false, error: message });
    throw new ProviderNotConfiguredError(source.name, source.configurationHint);
  }

  let results: RawLead[] = [];
  try {
    results = await source.search({
      query,
      location: (job.params["location"] as string) ?? null,
      industry: (job.params["industry"] as string) ?? null,
      keyword: (job.params["keyword"] as string) ?? null,
      requireWebsite: Boolean(job.params["requireWebsite"]),
      requirePhone: Boolean(job.params["requirePhone"]),
      requireEmail: Boolean(job.params["requireEmail"]),
      limit: requested,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lead source failed";
    await recordUsage(db, { ...usageBase, units: 0, success: false, error: message });
    throw err;
  }

  await recordUsage(db, {
    ...usageBase,
    units: results.length,
    success: true,
    estimated_cost: (source.estimatedCostPerUnit ?? 0) * results.length,
    metadata: { ...usageBase.metadata, returned: results.length },
  });


  if (results.length === 0) {
    return await finish(db, job.id, "completed", { found: 0 }, 0, 0);
  }

  const { data } = await db
    .from("jobs")
    .update({ payload: results, total: results.length, counters: { found: results.length } })
    .eq("id", job.id)
    .select("*")
    .single();
  return data as unknown as JobRow;
}

async function processLeadSlice(
  db: DB,
  job: JobRow,
  slice: RawLead[],
  counters: Record<string, number>,
  userId: string,
) {
  for (const raw of slice) {
    const result = await upsertLead(db, raw, {
      source: job.type === "import" ? "csv-import" : String(job.params["sourceId"] ?? "unknown"),
      searchQuery: (job.params["query"] as string) ?? null,
      jobId: job.id,
      userId,
    });
    bump(counters, result.outcome);
    if (raw.website) bump(counters, "with_website");
    if (raw.email) bump(counters, "with_email");
    if (raw.phone) bump(counters, "with_phone");
  }
}

import { getRuntimeConfig } from "@/lib/config/runtime-config.server";

async function processVerificationSlice(
  db: DB,
  job: JobRow,
  slice: { email: string; lead_id?: string }[],
  counters: Record<string, number>,
  userId: string,
) {
  const verifier = getEmailVerifier(job.provider);
  const runtimeConfig = await getRuntimeConfig(db);
  // Centralized runtime concurrency configuration (default 3)
  const concurrency = Math.max(1, runtimeConfig.verificationConcurrency ?? verifier.maxConcurrency ?? RATE_LIMITS.maxConcurrency);
  const results = await mapWithLimit(slice, concurrency, async (item) => {
    try {
      const result = await verifier.verify(item.email);
      return { item, result, error: null as string | null };
    } catch (err) {
      return {
        item,
        result: null,
        error: err instanceof Error ? err.message : "Verification failed",
      };
    }
  });

  for (const { item, result, error } of results) {
    if (!result) {
      bump(counters, "failed");
      await recordUsage(db, {
        provider: verifier.id,
        kind: "email_verifier",
        operation: "verify",
        success: false,
        error,
        job_id: job.id,
        user_id: userId,
      });
      continue;
    }
    bump(counters, result.status);
    await persistVerification(db, result, item.lead_id ?? null, userId, job.id);
    await recordUsage(db, {
      provider: verifier.id,
      kind: "email_verifier",
      operation: "verify",
      success: true,
      estimated_cost: verifier.estimatedCostPerUnit ?? 0,
      job_id: job.id,
      user_id: userId,
    });
  }
}

export async function persistVerification(
  db: DB,
  result: VerificationResult,
  leadId: string | null,
  userId: string,
  jobId: string | null,
) {
  await db.from("email_verifications").insert({
    email: result.email,
    normalized_email: normalizeEmail(result.email) ?? result.email,
    lead_id: leadId,
    status: result.status,
    reason: result.reason,
    confidence: result.confidence,
    provider: result.provider,
    syntax_valid: result.syntax_valid,
    domain_valid: result.domain_valid,
    mx_valid: result.mx_valid,
    smtp_result: result.smtp_result,
    disposable: result.disposable,
    role_account: result.role_account,
    catch_all: result.catch_all,
    metadata: result.metadata ?? {},
    job_id: jobId,
    user_id: userId,
  });

  if (leadId) {
    await db
      .from("leads")
      .update({
        email_status: result.status,
        email_verified_at: new Date().toISOString(),
        email_verification_reason: result.reason,
        email_verification_confidence: result.confidence,
        email_verification_provider: result.provider,
      })
      .eq("id", leadId);
    await db.from("lead_history").insert({
      lead_id: leadId,
      event_type: "verified",
      detail: `Email verification returned ${result.status.toUpperCase()} via ${result.provider}.`,
      metadata: { status: result.status, provider: result.provider, reason: result.reason },
      user_id: userId,
    });
  }
}
