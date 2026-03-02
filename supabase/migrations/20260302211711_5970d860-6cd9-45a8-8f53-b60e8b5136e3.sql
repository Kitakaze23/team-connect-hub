
-- Create call_logs table for tracking call history
CREATE TABLE public.call_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL,
  call_type TEXT NOT NULL DEFAULT 'audio',
  status TEXT NOT NULL DEFAULT 'missed',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE
);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View call logs in own company"
ON public.call_logs FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Create call logs in own company"
ON public.call_logs FOR INSERT
WITH CHECK (company_id = get_user_company_id(auth.uid()) AND caller_id = auth.uid());

CREATE POLICY "Update own call logs"
ON public.call_logs FOR UPDATE
USING (caller_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
