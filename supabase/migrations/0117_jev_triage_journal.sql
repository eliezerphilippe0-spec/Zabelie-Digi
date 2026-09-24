select zabelie_migration_garde('0117_jev_triage_journal.sql');

-- 0117 — Journal des décisions du triage Jev, en OBSERVATION (docs/61 §8).
--
-- Une ligne par message de support soumis quand `ZABELIE_JEV_TRIAGE_ENABLED`
-- vaut `true` : ce que Jev AURAIT décidé, pour mesurer sa dérive sur de vrais
-- messages avant de lui confier le moindre routage. Le triage ne route rien :
-- chaque message reste dans la file humaine, avec ou sans cette table.
--
-- ─── CE QUE LA TABLE NE CONTIENT PAS, PAR CONSTRUCTION ─────────────────────
-- Aucun texte : ni le message, ni sa version masquée, ni la réponse brute du
-- fournisseur. Le lien vers le message passe par (case_id, request_id), qui
-- est unique par auteur dans `zabelie_support_messages` (0113). `masquages`
-- ne porte que des COMPTES par type de donnée retirée.
--
-- ─── CE QU'ELLE NE TOUCHE PAS ──────────────────────────────────────────────
-- Aucun lien vers commande, paiement, escrow, ledger, retrait, KYC ou recharge.
-- La seule clé étrangère vise le dossier de support.
--
-- ─── ÉTAT ──────────────────────────────────────────────────────────────────
-- Rédigée, NON appliquée. Tant qu'elle ne l'est pas, le drapeau reste à
-- `false` ; s'il était posé quand même, l'écriture échouerait, le journal le
-- dirait (`console.warn`, sans texte) et le support ne verrait aucune
-- différence.

create table public.zabelie_jev_decisions (
 id bigint generated always as identity primary key,
 case_id uuid not null references zabelie_support_cases(id) on delete restrict,
 request_id uuid not null,
 mode text not null default 'observation' check(mode = 'observation'),
 outcome text not null check(outcome in('classe','echec')),
 failure_reason text check(failure_reason is null or failure_reason ~ '^[a-z0-9_]{1,40}$'),
 entansyon text check(entansyon is null or entansyon in(
   'swivi_komand','pwoblem_peman','ranbousman','akse_nimerik','kont',
   'kesyon_pwodwi','vande','plent','lot')),
 confidence numeric(4,3) check(confidence between 0 and 1),
 eskalade_p numeric(4,3) check(eskalade_p between 0 and 1),
 ijans_p numeric(4,3) check(ijans_p between 0 and 1),
 model_demande text not null check(length(model_demande) between 1 and 80),
 model_rendu text check(model_rendu is null or length(model_rendu) between 1 and 80),
 latency_ms integer not null check(latency_ms >= 0),
 attempts smallint not null check(attempts between 0 and 3),
 masquages jsonb not null default '{}'::jsonb check(jsonb_typeof(masquages) = 'object'),
 created_at timestamptz not null default now(),
 -- Une décision est entière ou c'est un échec nommé : jamais une ligne à moitié
 -- remplie qui se lirait comme une classification.
 constraint zabelie_jev_decisions_coherence check(
   (outcome = 'classe' and failure_reason is null and entansyon is not null
     and confidence is not null and eskalade_p is not null and ijans_p is not null)
   or
   (outcome = 'echec' and failure_reason is not null and entansyon is null
     and confidence is null and eskalade_p is null and ijans_p is null))
);
create index zabelie_jev_decisions_case on public.zabelie_jev_decisions(case_id);
create index zabelie_jev_decisions_recent on public.zabelie_jev_decisions(created_at);

alter table public.zabelie_jev_decisions enable row level security;
-- `service_role` compris dans le revoke : les privilèges PAR DÉFAUT du schéma
-- lui accordent tout, `update` et `delete` inclus. Mesuré par le test J4 : un
-- simple `grant select, insert` laissait la réécriture ouverte au serveur.
revoke all on public.zabelie_jev_decisions from public, anon, authenticated, service_role;
grant select, insert on public.zabelie_jev_decisions to service_role;
-- Aucune policy : ni acheteur, ni vendeur, ni client authentifié ne lit ce
-- journal. Seul le serveur l'écrit et l'administration le lit.

create function public.zabelie_jev_decisions_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'zabelie_jev_decisions est append-only' using errcode = '42501';
end $$;
revoke all on function public.zabelie_jev_decisions_immutable() from public, anon, authenticated;
create trigger zabelie_jev_decisions_immutable
  before update or delete on public.zabelie_jev_decisions
  for each row execute function public.zabelie_jev_decisions_immutable();
create trigger zabelie_jev_decisions_no_truncate
  before truncate on public.zabelie_jev_decisions
  for each statement execute function public.zabelie_jev_decisions_immutable();
