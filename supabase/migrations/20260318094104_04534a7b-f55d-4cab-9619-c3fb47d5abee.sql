ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS sprint_length_days integer NOT NULL DEFAULT 14;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS sprint_start_date date;