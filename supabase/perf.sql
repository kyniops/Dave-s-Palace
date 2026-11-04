-- Dave's Palace : moins de charge sur la base (le site ramait).
--  1. « saves » et « jackpot » ne sont plus diffusés en temps réel : ils changent à chaque partie de chaque joueur,
--     et Supabase vérifiait les droits de chaque abonné à chaque écriture (la base saturait). Le site les relit déjà
--     régulièrement (jackpot toutes les 5 s, modification admin vérifiée à intervalle régulier + notification).
--  2. Poker : le ménage des tables (pk_sweep) tourne au plus une fois toutes les 30 s pour tout le monde,
--     au lieu de chaque rafraîchissement du salon par chaque joueur (le salon mettait jusqu'à 40 s).
-- À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

do $$ begin alter publication supabase_realtime drop table public.saves; exception when undefined_object or others then null; end $$;
do $$ begin alter publication supabase_realtime drop table public.jackpot; exception when undefined_object or others then null; end $$;

create or replace function public.dp_patch_fn(p_sig text, p_old text, p_new text) returns void language plpgsql as $$
declare d text := pg_get_functiondef(p_sig::regprocedure);
begin
  if position(p_new in d) > 0 then return; end if;
  if position(p_old in d) = 0 then raise exception 'Code attendu introuvable dans %', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
select public.dp_patch_fn('public.poker_lobby()',
  'perform pk_sweep();',
  'if pg_try_advisory_xact_lock(424242) and coalesce((select (v ->> ''t'')::bigint from eng_const where k = ''pk_sweep_at''), 0) < eng_ms() - 30000 then
    insert into eng_const (k, v) values (''pk_sweep_at'', jsonb_build_object(''t'', eng_ms())) on conflict (k) do update set v = excluded.v;
    perform pk_sweep();
  end if;');
drop function public.dp_patch_fn(text, text, text);
