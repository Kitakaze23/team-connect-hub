
CREATE TABLE public.call_debug_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  call_session_id text NOT NULL,
  event text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.call_debug_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View call debug logs in own company"
  ON public.call_debug_logs FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Insert own call debug logs"
  ON public.call_debug_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can delete call debug logs"
  ON public.call_debug_logs FOR DELETE TO authenticated
  USING (is_company_admin(auth.uid(), company_id));

CREATE INDEX idx_call_debug_logs_company ON public.call_debug_logs(company_id, created_at DESC);
CREATE INDEX idx_call_debug_logs_session ON public.call_debug_logs(call_session_id);
