-- Correctif : les inscriptions étaient bloquées (contrôle du pseudo sans droit d'exécution).
alter function public.check_username() security definer set search_path = public;
grant execute on function public.username_clean(text), public.username_forbidden(text) to anon, authenticated;
