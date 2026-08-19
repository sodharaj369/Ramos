-- Corrective Migration: Targeted Admin Authorization for rajsodha@waytoweb.info

-- 1. Grant execute permission on has_role helper function to authenticated users
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;

-- 2. Grant table mutation permissions to authenticated users (governed by RLS policies)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings_history TO authenticated;

-- 3. Restore handle_new_user() trigger so new accounts receive 'member' role by default
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

-- 4. Explicitly assign admin role to rajsodha@waytoweb.info
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'rajsodha@waytoweb.info'
ON CONFLICT (user_id, role) DO NOTHING;

-- 5. Revoke admin role from all other accounts
DELETE FROM public.user_roles
WHERE role = 'admin'::public.app_role
  AND user_id NOT IN (
    SELECT id FROM auth.users WHERE lower(email) = 'rajsodha@waytoweb.info'
  );

-- 6. Ensure all non-admin users have member role assigned
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'member'::public.app_role
FROM auth.users
WHERE id NOT IN (
  SELECT user_id FROM public.user_roles WHERE role = 'admin'::public.app_role
)
ON CONFLICT (user_id, role) DO NOTHING;
