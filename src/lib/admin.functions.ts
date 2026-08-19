import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getRuntimeConfig,
  updateAppSetting,
} from "@/lib/config/runtime-config.server";
import { getServiceConfig as getSmtpConfig } from "@/lib/providers/aftership-smtp.server";

export interface AdminSettingItem {
  key: string;
  category: string;
  name: string;
  description: string;
  value: unknown;
  valueType: string;
  isSecret: boolean;
  configured?: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByName?: string | null;
}

export interface AdminSettingsSection {
  category: string;
  title: string;
  description: string;
  items: AdminSettingItem[];
}

async function verifyAdminRole(supabase: any, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || !data) {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    return Boolean(roles && roles.length > 0);
  }
  return Boolean(data);
}

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await verifyAdminRole(context.supabase, context.userId);
    return { isAdmin };
  });

export const getAdminSettingsData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await verifyAdminRole(context.supabase, context.userId);
    if (!isAdmin) {
      throw new Error("Forbidden: Admin privileges required.");
    }

    const { data: rows, error } = await context.supabase
      .from("app_settings")
      .select("*")
      .order("category", { ascending: true })
      .order("key", { ascending: true });

    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.updated_by).filter(Boolean)));
    const { data: profiles } = userIds.length
      ? await context.supabase.from("profiles").select("id,email,full_name").in("id", userIds)
      : { data: [] as any[] };
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email]));

    // System secrets status evaluation (never expose values)
    const smtpConfig = getSmtpConfig();
    const isSmtpConfigured = Boolean(smtpConfig.baseUrl);
    const isScraperConfigured = Boolean(process.env["GMAPS_SCRAPER_URL"]);

    const items: AdminSettingItem[] = (rows ?? []).map((r: any) => ({
      key: r.key,
      category: r.category,
      name: r.label || r.key.split(".").slice(1).join(" ").replace(/_/g, " ").toUpperCase(),
      description: r.description,
      value: r.is_secret ? "[MASKED]" : r.value,
      valueType: r.value_type,
      isSecret: r.is_secret,
      updatedAt: r.updated_at,
      updatedBy: r.updated_by,
      updatedByName: r.updated_by ? profileMap.get(r.updated_by) ?? null : null,
    }));

    // Add virtual secret status indicators (read-only status cards)
    const secretItems: AdminSettingItem[] = [
      {
        key: "secrets.email_verifier_api_key",
        category: "verification",
        name: "EMAIL VERIFIER API KEY / ENDPOINT",
        description: "Server-side secret endpoint and authorization token for email verifier service.",
        value: "[MASKED]",
        valueType: "secret",
        isSecret: true,
        configured: isSmtpConfigured,
        updatedAt: null,
        updatedBy: null,
      },
      {
        key: "secrets.gmaps_scraper_api_key",
        category: "providers",
        name: "GOOGLE MAPS SCRAPER API KEY / URL",
        description: "Server-side secret endpoint for optional self-hosted Google Maps scraper.",
        value: "[MASKED]",
        valueType: "secret",
        isSecret: true,
        configured: isScraperConfigured,
        updatedAt: null,
        updatedBy: null,
      },
    ];

    const allItems = [...items, ...secretItems];

    const categoryTitles: Record<string, { title: string; description: string }> = {
      discovery: { title: "Discovery Settings", description: "Google Maps lead extraction limits, timeouts, and defaults." },
      import: { title: "Lead Import & Ingestion", description: "Batch sizing and payload ingestion controls." },
      verification: { title: "Email Verification Subsystem", description: "SMTP verification concurrency, defaults, and timeouts." },
      providers: { title: "Provider Integrations", description: "Enable/disable data source and verification providers." },
      feature_flags: { title: "System Feature Flags", description: "Control application capabilities and feature availability." },
    };

    const sectionsMap = new Map<string, AdminSettingItem[]>();
    for (const item of allItems) {
      const list = sectionsMap.get(item.category) ?? [];
      list.push(item);
      sectionsMap.set(item.category, list);
    }

    const sections: AdminSettingsSection[] = Array.from(sectionsMap.entries()).map(([cat, sectionItems]) => ({
      category: cat,
      title: categoryTitles[cat]?.title ?? `${cat.toUpperCase()} Settings`,
      description: categoryTitles[cat]?.description ?? `Manage ${cat} settings.`,
      items: sectionItems,
    }));

    return { sections, runtimeConfig: await getRuntimeConfig(context.supabase) };
  });

export const updateAdminSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        key: z.string().min(1),
        value: z.unknown(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const isAdmin = await verifyAdminRole(context.supabase, context.userId);
    if (!isAdmin) {
      throw new Error("Forbidden: Admin privileges required to update system settings.");
    }

    const result = await updateAppSetting(context.supabase, data.key, data.value, context.userId);
    return result;
  });

export const getAdminSettingsHistoryData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await verifyAdminRole(context.supabase, context.userId);
    if (!isAdmin) {
      throw new Error("Forbidden: Admin privileges required.");
    }

    const { data: rows, error } = await context.supabase
      .from("settings_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.changed_by).filter(Boolean)));
    const { data: profiles } = userIds.length
      ? await context.supabase.from("profiles").select("id,email,full_name").in("id", userIds)
      : { data: [] as any[] };
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email]));

    return {
      history: (rows ?? []).map((r: any) => ({
        id: r.id,
        settingKey: r.setting_key,
        oldValue: r.old_value,
        newValue: r.new_value,
        changedBy: r.changed_by,
        changedByName: r.changed_by ? profileMap.get(r.changed_by) ?? null : null,
        createdAt: r.created_at,
      })),
    };
  });
