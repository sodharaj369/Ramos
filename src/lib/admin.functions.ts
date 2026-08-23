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

export const CANONICAL_SETTINGS_METADATA: Record<
  string,
  {
    category: string;
    name: string;
    description: string;
    defaultValue: unknown;
    valueType: string;
    isSecret: boolean;
  }
> = {
  "discovery.chrome_extension_enabled": {
    category: "discovery",
    name: "Chrome Extension Discovery Enabled",
    description: "Master switch enabling or disabling Chrome Extension lead extraction system-wide.",
    defaultValue: true,
    valueType: "boolean",
    isSecret: false,
  },
  "discovery.default_limit": {
    category: "discovery",
    name: "Default Discovery Limit",
    description: "Default number of leads extracted per Google Maps discovery job.",
    defaultValue: 5,
    valueType: "number",
    isSecret: false,
  },
  "discovery.max_limit": {
    category: "discovery",
    name: "Maximum Discovery Limit",
    description: "Maximum allowed lead extraction limit per Google Maps discovery job.",
    defaultValue: 50,
    valueType: "number",
    isSecret: false,
  },
  "discovery.default_provider": {
    category: "discovery",
    name: "Default Discovery Provider",
    description: "Primary lead discovery engine used for new search jobs.",
    defaultValue: "chrome-extension",
    valueType: "string",
    isSecret: false,
  },
  "discovery.job_timeout_ms": {
    category: "discovery",
    name: "Discovery Job Timeout (ms)",
    description: "Maximum execution time in milliseconds before a discovery job is marked timed out.",
    defaultValue: 360000,
    valueType: "number",
    isSecret: false,
  },
  "discovery.retry_count": {
    category: "discovery",
    name: "Max Discovery Retries",
    description: "Number of retry attempts for failed background discovery requests.",
    defaultValue: 3,
    valueType: "number",
    isSecret: false,
  },
  "import.batch_size": {
    category: "import",
    name: "Lead Import Batch Size",
    description: "Number of leads ingested per batch during extension or CSV imports.",
    defaultValue: 50,
    valueType: "number",
    isSecret: false,
  },
  "verification.enabled": {
    category: "verification",
    name: "Master Verification Switch",
    description: "Global toggle enabling or disabling the email verification subsystem.",
    defaultValue: true,
    valueType: "boolean",
    isSecret: false,
  },
  "verification.default_verifier": {
    category: "verification",
    name: "Default Email Verifier",
    description: "Primary email verifier provider utilized for lead email validation.",
    defaultValue: "aftership-smtp",
    valueType: "string",
    isSecret: false,
  },
  "verification.concurrency": {
    category: "verification",
    name: "Verification Concurrency",
    description: "Maximum concurrent email verification requests executed in parallel.",
    defaultValue: 3,
    valueType: "number",
    isSecret: false,
  },
  "verification.timeout_ms": {
    category: "verification",
    name: "Verification Timeout (ms)",
    description: "Socket connection timeout in milliseconds for verification attempts.",
    defaultValue: 8000,
    valueType: "number",
    isSecret: false,
  },
  "providers.self_hosted_gmaps_enabled": {
    category: "providers",
    name: "Self-Hosted Google Maps Provider",
    description: "Enable or disable self-hosted scraper integration for Google Maps discovery.",
    defaultValue: true,
    valueType: "boolean",
    isSecret: false,
  },
  "providers.aftership_smtp_enabled": {
    category: "providers",
    name: "AfterShip SMTP Verifier",
    description: "Enable or disable AfterShip SMTP verification service provider.",
    defaultValue: true,
    valueType: "boolean",
    isSecret: false,
  },
  "providers.builtin_dns_enabled": {
    category: "providers",
    name: "Built-in DNS Fallback Verifier",
    description: "Enable or disable built-in DNS/MX verification fallback provider.",
    defaultValue: true,
    valueType: "boolean",
    isSecret: false,
  },
  "feature_flags.csv_export_enabled": {
    category: "feature_flags",
    name: "CSV Export Capability",
    description: "Global feature flag controlling lead CSV export capability for users.",
    defaultValue: true,
    valueType: "boolean",
    isSecret: false,
  },
  "feature_flags.bulk_verification_enabled": {
    category: "feature_flags",
    name: "Bulk Verification Capability",
    description: "Global feature flag controlling bulk email verification capability for users.",
    defaultValue: true,
    valueType: "boolean",
    isSecret: false,
  },
};

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

    const dbRowMap = new Map((rows ?? []).map((r: any) => [r.key, r]));
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.updated_by).filter(Boolean)));
    const { data: profiles } = userIds.length
      ? await context.supabase.from("profiles").select("id,email,full_name").in("id", userIds)
      : { data: [] as any[] };
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name || p.email]));

    // System secrets status evaluation (never expose values)
    const smtpConfig = getSmtpConfig();
    const isSmtpConfigured = Boolean(smtpConfig.baseUrl);
    const isScraperConfigured = Boolean(process.env["GMAPS_SCRAPER_URL"]);

    // Merge database rows with canonical setting definitions so all 16 settings are always represented
    const items: AdminSettingItem[] = Object.entries(CANONICAL_SETTINGS_METADATA).map(
      ([key, meta]) => {
        const row = dbRowMap.get(key);
        return {
          key,
          category: meta.category,
          name: row?.label || meta.name,
          description: row?.description || meta.description,
          value: row ? (row.is_secret ? "[MASKED]" : row.value) : meta.defaultValue,
          valueType: meta.valueType,
          isSecret: meta.isSecret,
          updatedAt: row?.updated_at ?? null,
          updatedBy: row?.updated_by ?? null,
          updatedByName: row?.updated_by ? profileMap.get(row.updated_by) ?? null : null,
        };
      },
    );

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
