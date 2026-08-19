import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const filterSchema = z.object({
  search: z.string().nullish(),
  city: z.string().nullish(),
  country: z.string().nullish(),
  category: z.string().nullish(),
  source: z.string().nullish(),
  importedDate: z.string().nullish(),
  importedFrom: z.string().nullish(),
  importedTo: z.string().nullish(),
  emailStatus: z.string().nullish(),
  hasWebsite: z.boolean().nullish(),
  hasEmail: z.boolean().nullish(),
  hasPhone: z.boolean().nullish(),
  createdByMe: z.boolean().nullish(),
  sortBy: z.string().nullish(),
  sortDir: z.enum(["asc", "desc"]).nullish(),
  page: z.number().int().min(0).nullish(),
  pageSize: z.number().int().min(1).max(200).nullish(),
});

export type LeadFilters = z.infer<typeof filterSchema>;

const LIST_COLUMNS =
  "id,company_name,website,domain,category,city,region,country,phone,email,email_status,email_verified_at,email_verification_reason,source,discovered_at,created_at,created_by,rating,review_count";

function applyFilters(query: any, f: LeadFilters, userId: string) {
  if (f.search) {
    const term = `%${f.search.replace(/[%,]/g, "")}%`;
    query = query.or(
      `company_name.ilike.${term},domain.ilike.${term},email.ilike.${term},city.ilike.${term},category.ilike.${term}`,
    );
  }
  if (f.city) query = query.ilike("city", f.city);
  if (f.country) query = query.ilike("country", f.country);
  if (f.category) query = query.ilike("category", f.category);
  if (f.source) query = query.eq("source", f.source);
  if (f.emailStatus) query = query.eq("email_status", f.emailStatus);
  if (f.hasWebsite) query = query.not("website", "is", null);
  if (f.hasEmail) query = query.not("email", "is", null);
  if (f.hasPhone) query = query.not("phone", "is", null);
  if (f.createdByMe) query = query.eq("created_by", userId);

  // Authoritative Server-side Date Range Filtering against discovered_at column
  if (f.importedDate && f.importedDate !== "all" && f.importedDate !== "__any__") {
    const now = new Date();
    if (f.importedDate === "today") {
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      query = query.gte("discovered_at", todayStart.toISOString());
    } else if (f.importedDate === "yesterday") {
      const yestStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0, 0));
      const yestEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 23, 59, 59, 999));
      query = query.gte("discovered_at", yestStart.toISOString()).lte("discovered_at", yestEnd.toISOString());
    } else if (f.importedDate === "last_7_days") {
      const last7 = new Date(now.getTime() - 7 * 86400000);
      query = query.gte("discovered_at", last7.toISOString());
    } else if (f.importedDate === "last_30_days") {
      const last30 = new Date(now.getTime() - 30 * 86400000);
      query = query.gte("discovered_at", last30.toISOString());
    }
  }

  if (f.importedFrom) {
    query = query.gte("discovered_at", f.importedFrom);
  }
  if (f.importedTo) {
    query = query.lte("discovered_at", f.importedTo);
  }

  return query;
}

async function attachOwners(supabase: any, rows: any[]) {
  const ids = Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean)));
  if (ids.length === 0) return rows.map((r) => ({ ...r, created_by_name: null }));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,email,full_name")
    .in("id", ids);
  const map = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email]));
  return rows.map((r) => ({ ...r, created_by_name: map.get(r.created_by) ?? null }));
}

export const listLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => filterSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const page = data.page ?? 0;
    const pageSize = data.pageSize ?? 25;
    const sortBy = data.sortBy ?? "discovered_at";
    let query = context.supabase.from("leads").select(LIST_COLUMNS, { count: "exact" });
    query = applyFilters(query, data, context.userId);
    query = query
      .order(sortBy, { ascending: (data.sortDir ?? "desc") === "asc" })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: await attachOwners(context.supabase, rows ?? []), total: count ?? 0 };
  });

import { getRuntimeConfig } from "@/lib/config/runtime-config.server";

export const exportLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).nullish(),
        filters: filterSchema.nullish(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const runtimeConfig = await getRuntimeConfig(context.supabase);
    if (!runtimeConfig.featureFlagsCsvExportEnabled) {
      throw new Error("CSV export feature is currently disabled by system administrator.");
    }

    let query = context.supabase.from("leads").select("*").limit(5000);
    if (data.ids && data.ids.length > 0) {
      query = query.in("id", data.ids);
    } else if (data.filters) {
      query = applyFilters(query, data.filters, context.userId);
    }
    const { data: rows, error } = await query.order("discovered_at", { ascending: false });
    if (error) throw new Error(error.message);
    return await attachOwners(context.supabase, rows ?? []);
  });

export const getLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) return null;

    const [{ data: history }, { data: verifications }, { data: owner }] = await Promise.all([
      context.supabase
        .from("lead_history")
        .select("*")
        .eq("lead_id", data.id)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("email_verifications")
        .select("*")
        .eq("lead_id", data.id)
        .order("created_at", { ascending: false }),
      context.supabase.from("profiles").select("id,email,full_name").eq("id", lead.created_by).maybeSingle(),
    ]);

    const userIds = Array.from(
      new Set([...(history ?? []).map((h: any) => h.user_id)].filter(Boolean)),
    );
    const { data: profiles } = userIds.length
      ? await context.supabase.from("profiles").select("id,email,full_name").in("id", userIds)
      : { data: [] as any[] };
    const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email]));

    return {
      lead,
      owner: owner ? (owner as any).full_name || (owner as any).email : null,
      history: (history ?? []).map((h: any) => ({ ...h, user_name: nameMap.get(h.user_id) ?? null })),
      verifications: verifications ?? [],
    };
  });

export const deleteLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("leads")
      .delete({ count: "exact" })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0, requested: data.ids.length };
  });

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("leads")
      .select(
        "id,website,email,phone,email_status,source,category,city,country,discovered_at,created_at,created_by",
      )
      .limit(5000);
    if (error) throw new Error(error.message);
    const leads = rows ?? [];
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const isToday = (value: string | null) => Boolean(value && new Date(value) >= startOfDay);

    const byKey = (key: "source" | "category" | "city") => {
      const map = new Map<string, number>();
      for (const lead of leads) {
        const raw = (lead as any)[key];
        const label = raw && String(raw).trim() ? String(raw) : "Unknown";
        map.set(label, (map.get(label) ?? 0) + 1);
      }
      return Array.from(map, ([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
    };

    const statusCount = (status: string) => leads.filter((l: any) => l.email_status === status).length;
    const verified = statusCount("valid");
    const attempted = leads.filter(
      (l: any) => !["unverified", "pending"].includes(l.email_status),
    ).length;

    const { count: importedToday } = await context.supabase
      .from("lead_history")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "imported")
      .gte("created_at", startOfDay.toISOString());

    const { count: verificationsTotal } = await context.supabase
      .from("email_verifications")
      .select("id", { count: "exact", head: true });

    return {
      total: leads.length,
      newLast7Days: leads.filter(
        (l: any) => new Date(l.created_at) >= new Date(Date.now() - 7 * 864e5),
      ).length,
      discoveredToday: leads.filter((l: any) => isToday(l.discovered_at)).length,
      importedToday: importedToday ?? 0,
      valid: verified,
      invalid: statusCount("invalid"),
      risky: statusCount("risky"),
      unknown: statusCount("unknown"),
      unverified: statusCount("unverified"),
      withWebsite: leads.filter((l: any) => Boolean(l.website)).length,
      withEmail: leads.filter((l: any) => Boolean(l.email)).length,
      withPhone: leads.filter((l: any) => Boolean(l.phone)).length,
      verificationSuccessRate: attempted ? Math.round((verified / attempted) * 100) : null,
      verificationsTotal: verificationsTotal ?? 0,
      bySource: byKey("source"),
      byCategory: byKey("category"),
      byCity: byKey("city"),
    };
  });
