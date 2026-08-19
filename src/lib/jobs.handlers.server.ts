import type { SupabaseClient } from "@supabase/supabase-js";
import { runBatch } from "@/lib/job-runner.server";
import { listEmailVerifiers } from "@/lib/providers/email-verifiers.server";
import { listLeadSources } from "@/lib/providers/lead-sources.server";

type DB = SupabaseClient;

export function handleListProviders() {
  return {
    leadSources: listLeadSources(),
    emailVerifiers: listEmailVerifiers(),
  };
}

import { getRuntimeConfig } from "@/lib/config/runtime-config.server";

export async function handleCreateDiscoveryJob(
  db: DB,
  userId: string,
  data: Record<string, unknown> & { query: string; sourceId: string; limit?: number },
) {
  const runtimeConfig = await getRuntimeConfig(db);

  const sourceId = data.sourceId || runtimeConfig.discoveryDefaultProvider;
  if (sourceId === "self-hosted-google-maps" && !runtimeConfig.providersSelfHostedGmapsEnabled) {
    throw new Error("Self-hosted Google Maps scraper provider is currently disabled by administrator.");
  }

  const requestedLimit = Number(data.limit ?? runtimeConfig.discoveryDefaultLimit);
  if (requestedLimit > runtimeConfig.discoveryMaxLimit) {
    throw new Error(
      `Requested limit (${requestedLimit}) exceeds maximum allowed discovery limit (${runtimeConfig.discoveryMaxLimit}).`,
    );
  }

  const params = { ...data, sourceId, limit: requestedLimit };

  const { data: job, error } = await db
    .from("jobs")
    .insert({
      type: "discovery",
      label: `Discovery — ${data.query}`,
      provider: sourceId,
      params,
      user_id: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { jobId: job.id as string };
}

export async function handleCreateImportJob(
  db: DB,
  userId: string,
  data: { label: string; rows: Array<Record<string, unknown>> },
) {
  const { data: job, error } = await db
    .from("jobs")
    .insert({
      type: "import",
      label: `Import — ${data.label}`,
      provider: "csv-import",
      params: {},
      payload: data.rows,
      total: data.rows.length,
      user_id: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { jobId: job.id as string };
}

export async function handleCreateVerificationJob(
  db: DB,
  userId: string,
  data: {
    label: string;
    provider?: string | null | undefined;
    items: Array<{ email: string; lead_id?: string | undefined }>;
  },
) {
  const runtimeConfig = await getRuntimeConfig(db);

  if (!runtimeConfig.verificationEnabled) {
    throw new Error("Email verification subsystem is currently disabled by administrator.");
  }

  if (!runtimeConfig.featureFlagsBulkVerificationEnabled) {
    throw new Error("Bulk email verification feature is currently disabled by administrator.");
  }

  const { data: job, error } = await db
    .from("jobs")
    .insert({
      type: "verification",
      label: data.label,
      provider: data.provider ?? runtimeConfig.verificationDefaultVerifier,
      payload: data.items,
      total: data.items.length,
      user_id: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { jobId: job.id as string };
}

export async function handleRunJobBatch(db: DB, userId: string, jobId: string) {
  const job = await runBatch(db, jobId, userId);
  return {
    id: job.id,
    status: job.status,
    processed: job.processed,
    total: job.total,
    counters: job.counters ?? {},
  };
}

export async function handleGetJob(db: DB, jobId: string) {
  const { data, error } = await db
    .from("jobs")
    .select("id,type,status,label,provider,total,processed,counters,error,created_at,finished_at")
    .eq("id", jobId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function handleListJobs(db: DB) {
  const { data, error } = await db
    .from("jobs")
    .select("id,type,status,label,provider,total,processed,counters,error,created_at,finished_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function handleCancelJob(db: DB, jobId: string) {
  const { error } = await db
    .from("jobs")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  return { ok: true };
}
