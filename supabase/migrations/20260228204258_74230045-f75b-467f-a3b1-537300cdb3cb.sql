
-- Remove old unique constraints
ALTER TABLE public.desk_assignments DROP CONSTRAINT IF EXISTS desk_assignments_desk_id_date_key;
ALTER TABLE public.desk_assignments DROP CONSTRAINT IF EXISTS desk_assignments_user_id_date_key;

-- Drop date column and add day_of_week
ALTER TABLE public.desk_assignments DROP COLUMN IF EXISTS date;
ALTER TABLE public.desk_assignments ADD COLUMN day_of_week text NOT NULL DEFAULT 'mon';

-- Add unique constraints: one desk per day_of_week, one user per day_of_week per company
ALTER TABLE public.desk_assignments ADD CONSTRAINT desk_assignments_desk_day_unique UNIQUE (desk_id, day_of_week);
ALTER TABLE public.desk_assignments ADD CONSTRAINT desk_assignments_user_day_company_unique UNIQUE (user_id, day_of_week, company_id);
