
-- Create teams table
CREATE TABLE public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- View teams in own company
CREATE POLICY "View teams in own company"
ON public.teams FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));

-- Admins can create teams
CREATE POLICY "Admins can create teams"
ON public.teams FOR INSERT
WITH CHECK (is_company_admin(auth.uid(), company_id));

-- Admins can update teams
CREATE POLICY "Admins can update teams"
ON public.teams FOR UPDATE
USING (is_company_admin(auth.uid(), company_id));

-- Admins can delete teams
CREATE POLICY "Admins can delete teams"
ON public.teams FOR DELETE
USING (is_company_admin(auth.uid(), company_id));
