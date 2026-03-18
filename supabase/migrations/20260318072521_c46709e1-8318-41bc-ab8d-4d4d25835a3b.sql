
-- Backlog tasks table
CREATE TABLE public.backlog_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'web',
  status TEXT NOT NULL DEFAULT 'development',
  has_dependencies BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.backlog_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View backlog tasks in own company" ON public.backlog_tasks
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can create backlog tasks" ON public.backlog_tasks
  FOR INSERT TO authenticated
  WITH CHECK (is_company_admin(auth.uid(), company_id));

CREATE POLICY "Admins can update backlog tasks" ON public.backlog_tasks
  FOR UPDATE TO authenticated
  USING (is_company_admin(auth.uid(), company_id));

CREATE POLICY "Admins can delete backlog tasks" ON public.backlog_tasks
  FOR DELETE TO authenticated
  USING (is_company_admin(auth.uid(), company_id));

-- Task stages table
CREATE TABLE public.backlog_task_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.backlog_tasks(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.backlog_task_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View stages via task company" ON public.backlog_task_stages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.backlog_tasks t WHERE t.id = task_id AND t.company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Admins can manage stages" ON public.backlog_task_stages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.backlog_tasks t WHERE t.id = task_id AND is_company_admin(auth.uid(), t.company_id)));

-- Task dependencies
CREATE TABLE public.backlog_task_dependencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.backlog_tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  release_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.backlog_task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View dependencies via task company" ON public.backlog_task_dependencies
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.backlog_tasks t WHERE t.id = task_id AND t.company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Admins can manage dependencies" ON public.backlog_task_dependencies
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.backlog_tasks t WHERE t.id = task_id AND is_company_admin(auth.uid(), t.company_id)));

-- Task stage links
CREATE TABLE public.backlog_stage_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_id UUID NOT NULL REFERENCES public.backlog_task_stages(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  label TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.backlog_stage_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View links via stage" ON public.backlog_stage_links
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.backlog_task_stages s 
    JOIN public.backlog_tasks t ON t.id = s.task_id 
    WHERE s.id = stage_id AND t.company_id = get_user_company_id(auth.uid())
  ));

CREATE POLICY "Admins can manage links" ON public.backlog_stage_links
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.backlog_task_stages s 
    JOIN public.backlog_tasks t ON t.id = s.task_id 
    WHERE s.id = stage_id AND is_company_admin(auth.uid(), t.company_id)
  ));

-- Task comments
CREATE TABLE public.backlog_task_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.backlog_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.backlog_task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View comments via task company" ON public.backlog_task_comments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.backlog_tasks t WHERE t.id = task_id AND t.company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Members can add comments" ON public.backlog_task_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.backlog_tasks t WHERE t.id = task_id AND t.company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Users can delete own comments" ON public.backlog_task_comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Milestones
CREATE TABLE public.backlog_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  milestone_type TEXT NOT NULL DEFAULT 'release_web',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.backlog_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View milestones in own company" ON public.backlog_milestones
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can create milestones" ON public.backlog_milestones
  FOR INSERT TO authenticated
  WITH CHECK (is_company_admin(auth.uid(), company_id));

CREATE POLICY "Admins can update milestones" ON public.backlog_milestones
  FOR UPDATE TO authenticated
  USING (is_company_admin(auth.uid(), company_id));

CREATE POLICY "Admins can delete milestones" ON public.backlog_milestones
  FOR DELETE TO authenticated
  USING (is_company_admin(auth.uid(), company_id));
