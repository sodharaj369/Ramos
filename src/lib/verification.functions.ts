import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { persistVerification } from "@/lib/job-runner.server";
import { getEmailVerifier, listEmailVerifiers } from "@/lib/providers/email-verifiers.server";
import { ProviderNotConfiguredError } from "@/lib/providers/runtime.server";
import { recordUsage } from "@/lib/leads.server";
import { normalizeEmail } from "@/lib/normalize";

const CACHE_DAYS = 30;

function isBadCachedResult(record: Record<string, any>): boolean {
  if (!record) return false;
  const reason = String(record.reason ?? "").toLowerCase();
  const metadataStr = JSON.stringify(record.metadata ?? {}).toLowerCase();
  const smtpResult = String(record.smtp_result ?? "").toLowerCase();
  const status = String(record.status ?? "").toLowerCase();

  const isTimeoutError =
    reason.includes("timeout") ||
    reason.includes("dial tcp") ||
    reason.includes("connection refused") ||
    reason.includes("i/o timeout") ||
    reason.includes("network failure") ||
    reason.includes("host unreachable") ||
    reason.includes("unreachable") ||
    metadataStr.includes("timeout") ||
    metadataStr.includes("dial tcp") ||
    smtpResult === "host_unreachable" ||
    smtpResult === "timeout";

  if (status === "invalid" && (isTimeoutError || smtpResult === "host_unreachable")) {
    return true;
  }

  const SYNTAX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  if (status === "invalid" && record.syntax_valid === false && SYNTAX.test(record.email || "")) {
    return true;
  }

  return false;
}

import { getRuntimeConfig } from "@/lib/config/runtime-config.server";

export const verifySingleEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().min(3),
        provider: z.string().nullish(),
        leadId: z.string().uuid().nullish(),
        force: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const runtimeConfig = await getRuntimeConfig(context.supabase);
    if (!runtimeConfig.verificationEnabled) {
      return {
        cached: false,
        disabled: true,
        message: "Email verification is currently disabled by system administrator.",
      };
    }

    const normalized = normalizeEmail(data.email) ?? data.email.trim().toLowerCase();

    if (!data.force) {
      const since = new Date(Date.now() - CACHE_DAYS * 864e5).toISOString();
      const { data: cached } = await context.supabase
        .from("email_verifications")
        .select("*")
        .eq("normalized_email", normalized)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cached?.[0] && !isBadCachedResult(cached[0])) return { cached: true, result: cached[0] };
    }

    let verifier;
    try {
      verifier = getEmailVerifier(data.provider ?? null);
      if (!verifier.isConfigured()) {
        throw new ProviderNotConfiguredError(verifier.name, verifier.configurationHint);
      }
    } catch (err) {
      return {
        cached: false,
        notConfigured: true,
        message: err instanceof Error ? err.message : "Verifier not configured",
      };
    }

    try {
      const result = await verifier.verify(normalized);
      await persistVerification(context.supabase, result, data.leadId ?? null, context.userId, null);
      await recordUsage(context.supabase, {
        provider: verifier.id,
        kind: "email_verifier",
        operation: "verify",
        success: true,
        estimated_cost: verifier.estimatedCostPerUnit ?? 0,
        user_id: context.userId,
      });
      const { data: saved } = await context.supabase
        .from("email_verifications")
        .select("*")
        .eq("normalized_email", normalized)
        .order("created_at", { ascending: false })
        .limit(1);
      return { cached: false, result: saved?.[0] ?? null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verification failed";
      await recordUsage(context.supabase, {
        provider: verifier.id,
        kind: "email_verifier",
        operation: "verify",
        success: false,
        error: message,
        user_id: context.userId,
      });
      return { cached: false, failed: true, message };
    }
  });

/** Health probe for the self-hosted SMTP verification service (server-side only). */
export const checkVerifierService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { serviceHealth } = await import("@/lib/providers/aftership-smtp.server");
    return serviceHealth();
  });

export const listVerifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().nullish(),
        status: z.string().nullish(),
        page: z.number().int().min(0).nullish(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const page = data.page ?? 0;
    const pageSize = 50;
    let query = context.supabase
      .from("email_verifications")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (data.search) query = query.ilike("email", `%${data.search.replace(/[%,]/g, "")}%`);
    if (data.status) query = query.eq("status", data.status as never);
    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean)));
    const { data: profiles } = userIds.length
      ? await context.supabase.from("profiles").select("id,email,full_name").in("id", userIds)
      : { data: [] as any[] };
    const map = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email]));
    return {
      rows: (rows ?? []).map((r: any) => ({ ...r, user_name: map.get(r.user_id) ?? null })),
      total: count ?? 0,
      pageSize,
    };
  });

export const getUsageStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("provider_usage")
      .select("provider,kind,operation,units,success,estimated_cost,created_at")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const byProvider = new Map<
      string,
      { provider: string; kind: string; calls: number; units: number; success: number; failed: number; cost: number }
    >();
    for (const row of rows as any[]) {
      const entry = byProvider.get(row.provider) ?? {
        provider: row.provider,
        kind: row.kind,
        calls: 0,
        units: 0,
        success: 0,
        failed: 0,
        cost: 0,
      };
      entry.calls += 1;
      entry.units += row.units ?? 1;
      if (row.success) entry.success += 1;
      else entry.failed += 1;
      entry.cost += Number(row.estimated_cost ?? 0);
      byProvider.set(row.provider, entry);
    }
    return {
      providers: listEmailVerifiers(),
      usage: Array.from(byProvider.values()).sort((a, b) => b.calls - a.calls),
      totalCalls: rows.length,
    };
  });

export const listLeadsForVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("leads")
      .select("id,company_name,email")
      .in("id", data.ids)
      .not("email", "is", null);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
