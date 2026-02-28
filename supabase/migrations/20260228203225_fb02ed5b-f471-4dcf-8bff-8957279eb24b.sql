-- Add desk_sharing_enabled and floor_plan_url to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS desk_sharing_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS floor_plan_url text;

-- Desks table
CREATE TABLE public.desks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.desks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View desks in own company" ON public.desks FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can create desks" ON public.desks FOR INSERT
  WITH CHECK (is_company_admin(auth.uid(), company_id));

CREATE POLICY "Admins can update desks" ON public.desks FOR UPDATE
  USING (is_company_admin(auth.uid(), company_id));

CREATE POLICY "Admins can delete desks" ON public.desks FOR DELETE
  USING (is_company_admin(auth.uid(), company_id));

-- Desk assignments table
CREATE TABLE public.desk_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  desk_id uuid NOT NULL REFERENCES public.desks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_desk_date UNIQUE (desk_id, date),
  CONSTRAINT unique_user_date UNIQUE (user_id, date)
);

ALTER TABLE public.desk_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View desk assignments in own company" ON public.desk_assignments FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can create desk assignments" ON public.desk_assignments FOR INSERT
  WITH CHECK (is_company_admin(auth.uid(), company_id));

CREATE POLICY "Admins can update desk assignments" ON public.desk_assignments FOR UPDATE
  USING (is_company_admin(auth.uid(), company_id));

CREATE POLICY "Admins can delete desk assignments" ON public.desk_assignments FOR DELETE
  USING (is_company_admin(auth.uid(), company_id));

-- Enable realtime for desk_assignments
ALTER PUBLICATION supabase_realtime ADD TABLE public.desk_assignments;