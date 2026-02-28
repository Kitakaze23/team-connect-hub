
ALTER TABLE public.work_schedules
  ADD COLUMN sat TEXT NOT NULL DEFAULT 'day_off',
  ADD COLUMN sun TEXT NOT NULL DEFAULT 'day_off';
