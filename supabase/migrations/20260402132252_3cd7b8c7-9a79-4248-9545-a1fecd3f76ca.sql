ALTER TABLE public.companies ADD COLUMN chat_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.companies ADD COLUMN calls_enabled boolean NOT NULL DEFAULT true;