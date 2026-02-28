
-- Work schedules (one row per user, stores weekly schedule)
CREATE TABLE public.work_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  mon TEXT NOT NULL DEFAULT 'office',
  tue TEXT NOT NULL DEFAULT 'office',
  wed TEXT NOT NULL DEFAULT 'office',
  thu TEXT NOT NULL DEFAULT 'office',
  fri TEXT NOT NULL DEFAULT 'office',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View schedules in own company" ON public.work_schedules
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert own schedule" ON public.work_schedules
  FOR INSERT WITH CHECK (user_id = auth.uid() AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can update own schedule" ON public.work_schedules
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own schedule" ON public.work_schedules
  FOR DELETE USING (user_id = auth.uid());

-- Vacations
CREATE TABLE public.vacations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vacations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View vacations in own company" ON public.vacations
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert own vacations" ON public.vacations
  FOR INSERT WITH CHECK (user_id = auth.uid() AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can update own vacations" ON public.vacations
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own vacations" ON public.vacations
  FOR DELETE USING (user_id = auth.uid());

-- Sick leaves
CREATE TABLE public.sick_leaves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sick_leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View sick_leaves in own company" ON public.sick_leaves
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert own sick_leaves" ON public.sick_leaves
  FOR INSERT WITH CHECK (user_id = auth.uid() AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can update own sick_leaves" ON public.sick_leaves
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own sick_leaves" ON public.sick_leaves
  FOR DELETE USING (user_id = auth.uid());
