
CREATE OR REPLACE FUNCTION public.validate_company_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('active', 'archived', 'suspended') THEN
    RAISE EXCEPTION 'Invalid company status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;
