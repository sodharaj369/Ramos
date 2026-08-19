-- Create app_settings table for centralized runtime configuration
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'string', -- 'number', 'boolean', 'string', 'json'
  is_secret BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users ON DELETE SET NULL
);

-- Create settings_history table for configuration audit trail
CREATE TABLE IF NOT EXISTS public.settings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settings_history_key_idx ON public.settings_history (setting_key, created_at DESC);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings_history ENABLE ROW LEVEL SECURITY;

-- Grants for authenticated users (governed strictly by RLS policies below)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings_history TO authenticated;
GRANT ALL ON public.settings_history TO service_role;

-- Policies for app_settings
DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
CREATE POLICY app_settings_select ON public.app_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS app_settings_insert_admin ON public.app_settings;
CREATE POLICY app_settings_insert_admin ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS app_settings_update_admin ON public.app_settings;
CREATE POLICY app_settings_update_admin ON public.app_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS app_settings_delete_admin ON public.app_settings;
CREATE POLICY app_settings_delete_admin ON public.app_settings
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Policies for settings_history
DROP POLICY IF EXISTS settings_history_select_admin ON public.settings_history;
CREATE POLICY settings_history_select_admin ON public.settings_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS settings_history_insert_admin ON public.settings_history;
CREATE POLICY settings_history_insert_admin ON public.settings_history
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed baseline configuration defaults matching existing effective values
INSERT INTO public.app_settings (key, value, category, description, value_type, is_secret) VALUES
  ('discovery.default_limit', '5'::jsonb, 'discovery', 'Default result limit for new discovery jobs', 'number', false),
  ('discovery.max_limit', '50'::jsonb, 'discovery', 'Maximum allowed result limit for discovery jobs', 'number', false),
  ('discovery.default_provider', '"chrome-extension"'::jsonb, 'discovery', 'Default lead discovery provider', 'string', false),
  ('discovery.job_timeout_ms', '360000'::jsonb, 'discovery', 'Job timeout in milliseconds', 'number', false),
  ('discovery.retry_count', '3'::jsonb, 'discovery', 'Max retry attempts for failed jobs', 'number', false),

  ('import.batch_size', '50'::jsonb, 'import', 'Max leads per import batch payload', 'number', false),

  ('verification.default_verifier', '"aftership-smtp"'::jsonb, 'verification', 'Default email verification provider', 'string', false),
  ('verification.concurrency', '3'::jsonb, 'verification', 'Maximum simultaneous SMTP verification workers', 'number', false),
  ('verification.timeout_ms', '8000'::jsonb, 'verification', 'Timeout per email verification check in ms', 'number', false),
  ('verification.enabled', 'true'::jsonb, 'verification', 'Master switch for email verification subsystem', 'boolean', false),

  ('providers.self_hosted_gmaps_enabled', 'true'::jsonb, 'providers', 'Enable self-hosted Google Maps scraper provider', 'boolean', false),
  ('providers.aftership_smtp_enabled', 'true'::jsonb, 'providers', 'Enable self-hosted AfterShip Go SMTP verifier', 'boolean', false),
  ('providers.builtin_dns_enabled', 'true'::jsonb, 'providers', 'Enable built-in DNS verifier fallback', 'boolean', false),

  ('feature_flags.csv_export_enabled', 'true'::jsonb, 'feature_flags', 'Enable CSV download and export features', 'boolean', false),
  ('feature_flags.bulk_verification_enabled', 'true'::jsonb, 'feature_flags', 'Enable bulk email verification actions', 'boolean', false)
ON CONFLICT (key) DO NOTHING;
