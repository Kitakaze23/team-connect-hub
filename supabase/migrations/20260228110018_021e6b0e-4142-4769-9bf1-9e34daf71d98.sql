
-- ============================================
-- MULTI-TENANT: Companies & Members
-- ============================================

-- Companies table
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  invite_code text UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation trigger for company status
CREATE OR REPLACE FUNCTION public.validate_company_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'Invalid company status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_company_status_trigger
BEFORE INSERT OR UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.validate_company_status();

-- Company members (approval flow)
CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_company_members_updated_at
BEFORE UPDATE ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation trigger for member status
CREATE OR REPLACE FUNCTION public.validate_member_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid member status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_member_status_trigger
BEFORE INSERT OR UPDATE ON public.company_members
FOR EACH ROW EXECUTE FUNCTION public.validate_member_status();

-- Add company_id to profiles
ALTER TABLE public.profiles ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- ============================================
-- HELPER FUNCTIONS (security definer)
-- ============================================

-- Get user's approved company_id
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.company_members
  WHERE user_id = _user_id AND status = 'approved'
  LIMIT 1
$$;

-- Check if user is company admin
CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = _user_id AND company_id = _company_id AND role = 'admin' AND status = 'approved'
  )
$$;

-- Lookup company by invite code (safe for users without company)
CREATE OR REPLACE FUNCTION public.lookup_company_by_code(_code text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name FROM public.companies c
  WHERE c.invite_code = _code AND c.status = 'active'
$$;

-- ============================================
-- RLS POLICIES: companies
-- ============================================

-- Members can view their company, owners can view theirs
CREATE POLICY "Members can view their company"
ON public.companies FOR SELECT
TO authenticated
USING (
  id = get_user_company_id(auth.uid())
  OR owner_id = auth.uid()
);

CREATE POLICY "Authenticated users can create companies"
ON public.companies FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Company admins can update their company"
ON public.companies FOR UPDATE
TO authenticated
USING (is_company_admin(auth.uid(), id));

-- ============================================
-- RLS POLICIES: company_members
-- ============================================

-- Members can see other members; user can see own pending requests
CREATE POLICY "View company members"
ON public.company_members FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  OR user_id = auth.uid()
);

-- Users can request to join (only pending, only for self)
CREATE POLICY "Users can request to join"
ON public.company_members FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- Company admins can update members (approve/reject/change role)
CREATE POLICY "Company admins can update members"
ON public.company_members FOR UPDATE
TO authenticated
USING (is_company_admin(auth.uid(), company_id));

-- Company admins can remove members
CREATE POLICY "Company admins can remove members"
ON public.company_members FOR DELETE
TO authenticated
USING (is_company_admin(auth.uid(), company_id));

-- ============================================
-- UPDATE PROFILES RLS: scope by company
-- ============================================

DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;

CREATE POLICY "View profiles in same company or own"
ON public.profiles FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR company_id = get_user_company_id(auth.uid())
  OR company_id IS NULL
);

-- Enable realtime for company_members (for approval notifications)
ALTER PUBLICATION supabase_realtime ADD TABLE public.company_members;
