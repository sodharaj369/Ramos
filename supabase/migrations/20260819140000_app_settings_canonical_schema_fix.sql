-- Migration 20260819140000: Fix app_settings label column, enforce NOT NULL constraint, and seed missing discovery.chrome_extension_enabled setting cleanly.

-- Step 1: Add label column as NULLABLE TEXT if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_settings' AND column_name = 'label'
  ) THEN
    ALTER TABLE public.app_settings ADD COLUMN label TEXT;
  END IF;
END $$;

-- Step 2: Backfill canonical human-readable labels for all 16 settings
UPDATE public.app_settings SET label = 'Chrome Extension Discovery Enabled' WHERE key = 'discovery.chrome_extension_enabled';
UPDATE public.app_settings SET label = 'Default Discovery Limit' WHERE key = 'discovery.default_limit';
UPDATE public.app_settings SET label = 'Maximum Discovery Limit' WHERE key = 'discovery.max_limit';
UPDATE public.app_settings SET label = 'Default Discovery Provider' WHERE key = 'discovery.default_provider';
UPDATE public.app_settings SET label = 'Discovery Job Timeout (ms)' WHERE key = 'discovery.job_timeout_ms';
UPDATE public.app_settings SET label = 'Max Discovery Retries' WHERE key = 'discovery.retry_count';

UPDATE public.app_settings SET label = 'Lead Import Batch Size' WHERE key = 'import.batch_size';

UPDATE public.app_settings SET label = 'Default Email Verifier' WHERE key = 'verification.default_verifier';
UPDATE public.app_settings SET label = 'Verification Concurrency' WHERE key = 'verification.concurrency';
UPDATE public.app_settings SET label = 'Verification Timeout (ms)' WHERE key = 'verification.timeout_ms';
UPDATE public.app_settings SET label = 'Master Verification Switch' WHERE key = 'verification.enabled';

UPDATE public.app_settings SET label = 'Self-Hosted Google Maps Provider' WHERE key = 'providers.self_hosted_gmaps_enabled';
UPDATE public.app_settings SET label = 'AfterShip SMTP Verifier' WHERE key = 'providers.aftership_smtp_enabled';
UPDATE public.app_settings SET label = 'Built-in DNS Fallback Verifier' WHERE key = 'providers.builtin_dns_enabled';

UPDATE public.app_settings SET label = 'CSV Export Capability' WHERE key = 'feature_flags.csv_export_enabled';
UPDATE public.app_settings SET label = 'Bulk Verification Capability' WHERE key = 'feature_flags.bulk_verification_enabled';

-- Step 3: Insert missing discovery.chrome_extension_enabled row with canonical label
INSERT INTO public.app_settings (key, label, value, category, description, value_type, is_secret)
VALUES (
  'discovery.chrome_extension_enabled',
  'Chrome Extension Discovery Enabled',
  'true'::jsonb,
  'discovery',
  'Master toggle to enable or disable lead discovery via Chrome Extension',
  'boolean',
  false
)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description;

-- Step 4: Ensure no remaining rows have NULL or empty labels
UPDATE public.app_settings
SET label = initcap(replace(split_part(key, '.', 2), '_', ' '))
WHERE label IS NULL OR label = '';

-- Step 5: Enforce NOT NULL constraint on label column
ALTER TABLE public.app_settings ALTER COLUMN label SET NOT NULL;
