DROP POLICY IF EXISTS leads_update ON public.leads;
CREATE POLICY leads_update ON public.leads FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role)
);

DROP POLICY IF EXISTS leads_delete ON public.leads;
CREATE POLICY leads_delete ON public.leads FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role)
);

DROP POLICY IF EXISTS jobs_update ON public.jobs;
CREATE POLICY jobs_update ON public.jobs FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role)
);

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;