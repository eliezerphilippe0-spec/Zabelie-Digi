-- 0055 — Journal d'audit des actes d'administration (docs/30, P5).
--
-- Constat : neuf routes admin mutantes — remboursement, confirmation Zelle,
-- règlement et rejet de retraits, suspension de comptes, dépublication,
-- catalogue topup — n'écrivaient AUCUNE trace. Le commentaire de
-- app/api/admin/user-status/route.ts renvoyait même à des « logs d'audit »
-- qui n'existaient pas. Sur une plateforme dont le grand livre est
-- append-only par posture (Circulaire 121), les actes d'administration
-- doivent l'être aussi : qui a fait quoi, à quoi, quand, pourquoi.
--
-- Modèle : zabelie_topup_ledger (0010) — append-only par trigger, RLS,
-- service role seul. Pattern inspiré du journal AdminAction d'izikit,
-- réécrit aux conventions du dépôt.
--
-- Choix assumés :
--   • PAS de clé étrangère sur actor_id : une trace d'audit doit SURVIVRE à
--     la disparition de son auteur ou de sa cible — une FK forcerait à
--     choisir entre bloquer la suppression et perdre l'historique.
--   • `action` en forme `domaine.verbe` (contrainte), contrat stable pour
--     les regroupements futurs.
--   • AUCUNE donnée personnelle au-delà des identifiants : la règle de
--     last_error (0043) vaut ici — le journal dit ce qui a été fait, jamais
--     l'adresse ou le téléphone de qui que ce soit.

create table zabelie_admin_actions (
  id          bigint generated always as identity primary key,
  actor_id    uuid not null,
  action      text not null
    constraint zabelie_admin_actions_forme check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type text,
  target_id   text,
  reason      text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create index zabelie_admin_actions_cible_idx
  on zabelie_admin_actions (target_type, target_id);
create index zabelie_admin_actions_acteur_idx
  on zabelie_admin_actions (actor_id, created_at desc);

create or replace function zabelie_admin_actions_guard()
returns trigger language plpgsql as $$
begin
  raise exception 'zabelie_admin_actions est APPEND-ONLY : % interdit', tg_op
    using errcode = 'ZB055';
end;
$$;

create trigger zabelie_admin_actions_immutable
  before update or delete on zabelie_admin_actions
  for each row execute function zabelie_admin_actions_guard();

-- RLS active, aucune policy : seul le service role écrit et lit.
alter table zabelie_admin_actions enable row level security;
revoke all on zabelie_admin_actions from anon, authenticated;
