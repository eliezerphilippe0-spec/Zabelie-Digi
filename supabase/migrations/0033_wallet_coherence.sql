-- ============================================================================
-- 0033 — Chantier 0, lot 0.c.1 : contrôle de cohérence du registre
-- ============================================================================
-- On ne peut pas apurer une dette contre un registre dont on ignore s'il dit
-- vrai. Ce lot vérifie une identité comptable EXACTE, vraie après chaque
-- opération d'argent du système :
--
--     Σ(wallet_transactions.amount_htg)  =  balance_htg + pending_htg
--
-- Démonstration (tous les flux existants) :
--   • vente confirmée      (0005/0006) : ledger +net   · pending +net
--   • maturation J+7       (0006)      : pending −x    · balance +x  (pas de
--                                        ledger — la somme des deux est stable)
--   • remboursement avant  (0006)      : ledger −x     · pending −x
--   • remboursement après  (0006)      : ledger −x     · balance −x
--   • facture Business     (0022)      : ledger +net   · balance +net
--   • règlement manuel     (0032)      : ledger −x     · balance −x
--
-- Un écart signifie qu'un solde a bougé hors du grand livre : soit un bug,
-- soit une écriture directe en base. Il faut le savoir AVANT de payer, pas
-- après. Ce contrôle est purement interne — il ne dit rien du solde réel du
-- compte marchand MonCash (contrôle de solvabilité, docs/19 §3.2, manuel).
-- ============================================================================

-- ─────────────────── 1. Vue de cohérence, portefeuille par portefeuille ─────

create view zabelie_wallet_coherence as
select w.id                                   as wallet_id,
       w.owner_id,
       p.display_name,
       w.balance_htg,
       w.pending_htg,
       w.balance_htg + w.pending_htg          as solde_registre_htg,
       coalesce(l.somme, 0)                   as somme_ledger_htg,
       (w.balance_htg + w.pending_htg) - coalesce(l.somme, 0) as ecart_htg
  from wallets w
  join profiles p on p.id = w.owner_id
  left join (
    select wallet_id, sum(amount_htg) as somme
      from wallet_transactions
     group by wallet_id
  ) l on l.wallet_id = w.id;

revoke all on zabelie_wallet_coherence from anon, authenticated;

-- ─────────────────── 2. Rapport global (cron + écran admin) ─────────────────
-- Renvoie l'état du registre en un objet. `ok` = false dès qu'un écart existe.

create function zabelie_solvency_report()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'genere_a',            now(),
    -- Ce que la plateforme doit, au total : le nombre à couvrir par le solde
    -- réel du compte marchand MonCash.
    'du_total_htg',        coalesce(sum(solde_registre_htg), 0),
    'disponible_htg',      coalesce(sum(balance_htg), 0),
    'en_attente_htg',      coalesce(sum(pending_htg), 0),
    'vendeurs_crediteurs', count(*) filter (where solde_registre_htg > 0),
    -- Cohérence interne : tout écart est anormal.
    'ecarts',              count(*) filter (where ecart_htg <> 0),
    'ecart_total_htg',     coalesce(sum(ecart_htg), 0),
    'ok',                  count(*) filter (where ecart_htg <> 0) = 0
  )
  from zabelie_wallet_coherence;
$$;
revoke all on function zabelie_solvency_report() from public, anon, authenticated;
