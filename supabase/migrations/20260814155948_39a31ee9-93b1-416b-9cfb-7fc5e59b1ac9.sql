ALTER TYPE public.email_status ADD VALUE IF NOT EXISTS 'catch_all';
ALTER TYPE public.email_status ADD VALUE IF NOT EXISTS 'disposable';
ALTER TYPE public.email_status ADD VALUE IF NOT EXISTS 'role';
ALTER TYPE public.email_status ADD VALUE IF NOT EXISTS 'not_checked';