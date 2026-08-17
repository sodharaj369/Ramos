
CREATE TYPE public.app_role AS ENUM ('admin', 'member');
CREATE TYPE public.email_status AS ENUM ('valid', 'invalid', 'risky', 'unknown', 'pending', 'unverified');
CREATE TYPE public.job_type AS ENUM ('discovery', 'verification', 'import');
CREATE TYPE public.job_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- leads
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  website TEXT,
  domain TEXT,
  normalized_domain TEXT,
  normalized_name TEXT NOT NULL,
  normalized_city TEXT,
  category TEXT,
  description TEXT,
  address TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  postal_code TEXT,
  phone TEXT,
  normalized_phone TEXT,
  email TEXT,
  normalized_email TEXT,
  email_status public.email_status NOT NULL DEFAULT 'unverified',
  email_verified_at TIMESTAMPTZ,
  email_verification_reason TEXT,
  email_verification_confidence INTEGER,
  email_verification_provider TEXT,
  location_count INTEGER,
  rating NUMERIC,
  review_count INTEGER,
  social_urls JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_page_url TEXT,
  booking_url TEXT,
  ordering_url TEXT,
  has_ecommerce BOOLEAN,
  business_type TEXT,
  opening_status TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual',
  source_url TEXT,
  search_query TEXT,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE SET DEFAULT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX leads_domain_unique ON public.leads (normalized_domain) WHERE normalized_domain IS NOT NULL;
CREATE UNIQUE INDEX leads_name_city_unique ON public.leads (normalized_name, coalesce(normalized_city, '')) WHERE normalized_domain IS NULL;
CREATE INDEX leads_email_idx ON public.leads (normalized_email);
CREATE INDEX leads_phone_idx ON public.leads (normalized_phone);
CREATE INDEX leads_created_at_idx ON public.leads (created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "leads_insert" ON public.leads FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "leads_delete" ON public.leads FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- lead history
CREATE TABLE public.lead_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  detail TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lead_history_lead_idx ON public.lead_history (lead_id, created_at DESC);
GRANT SELECT, INSERT ON public.lead_history TO authenticated;
GRANT ALL ON public.lead_history TO service_role;
ALTER TABLE public.lead_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_history_select" ON public.lead_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_history_insert" ON public.lead_history FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- email verifications
CREATE TABLE public.email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads ON DELETE SET NULL,
  status public.email_status NOT NULL,
  reason TEXT,
  confidence INTEGER,
  provider TEXT NOT NULL,
  syntax_valid BOOLEAN,
  domain_valid BOOLEAN,
  mx_valid BOOLEAN,
  smtp_result TEXT,
  disposable BOOLEAN,
  role_account BOOLEAN,
  catch_all BOOLEAN,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  job_id UUID,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE SET DEFAULT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_verifications_email_idx ON public.email_verifications (normalized_email, created_at DESC);
GRANT SELECT, INSERT ON public.email_verifications TO authenticated;
GRANT ALL ON public.email_verifications TO service_role;
ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_verifications_select" ON public.email_verifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "email_verifications_insert" ON public.email_verifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- jobs
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.job_type NOT NULL,
  status public.job_status NOT NULL DEFAULT 'queued',
  label TEXT NOT NULL,
  provider TEXT,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  cursor INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  counters JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE SET DEFAULT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jobs_created_idx ON public.jobs (created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs_select" ON public.jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "jobs_insert" ON public.jobs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "jobs_update" ON public.jobs FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- provider usage
CREATE TABLE public.provider_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  operation TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 1,
  success BOOLEAN NOT NULL,
  estimated_cost NUMERIC,
  error TEXT,
  job_id UUID REFERENCES public.jobs ON DELETE SET NULL,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE SET DEFAULT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX provider_usage_created_idx ON public.provider_usage (created_at DESC);
GRANT SELECT, INSERT ON public.provider_usage TO authenticated;
GRANT ALL ON public.provider_usage TO service_role;
ALTER TABLE public.provider_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "provider_usage_select" ON public.provider_usage FOR SELECT TO authenticated USING (true);
CREATE POLICY "provider_usage_insert" ON public.provider_usage FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
