select zabelie_migration_garde('0159_zabelie_zones_communes.sql');

-- 0159 — Les communes des neuf autres départements (docs/77 §10 ; demande directe
-- du porteur, 2026-10-29 : « ajoute les communes et les autres départements »).
--
-- ─── POURQUOI ──────────────────────────────────────────────────────────────
-- 0069 n'a semé que les communes du Nord. La règle ZB069 exige une commune au
-- minimum pour déclarer une zone : un vendeur ou un acheteur de l'Ouest
-- (Port-au-Prince, Delmas, Pétion-Ville…) ne pouvait RIEN déclarer, donc la
-- proximité par zone (#443, #444, #445) ne servait que le Nord. Les dix
-- départements existent déjà (0069) ; il manquait leurs communes.
--
-- ─── CE QUE C'EST : 121 COMMUNES, DÉSACTIVÉES ──────────────────────────────
-- Neuf départements, 121 communes. Avec les 19 du Nord déjà en base : 140.
-- TOUTES sont insérées `is_active = false`. La RLS de zabelie_zones (0069) ne
-- montre que les zones ACTIVES : tant qu'une zone est fermée, elle n'existe
-- pour aucun client — ni sélecteur, ni filtre catalogue, ni assistant, ni
-- zones de service. Cette migration ne change donc RIEN de visible.
-- Le porteur ouvre les zones par vagues, depuis /admin/zones (« Rouvrir »,
-- journalisé dans zabelie_admin_actions), après relecture.
--
-- ─── ⚠️ PROVENANCE : NON VÉRIFIÉE CONTRE UNE SOURCE OUVERTE ─────────────────
-- Le 2026-10-29, aucune page de référence n'a pu être ouverte : le réseau de la
-- session refuse fr.wikipedia.org et en.wikipedia.org, et le scraper n'a pas de
-- clé valide. La liste est donc celle de l'AGENT, de mémoire, et n'a qu'une
-- vérification INTERNE : les effectifs par département (AR 15 · CE 12 · GA 12 ·
-- NI 11 · NE 13 · NO 10 · OU 20 · SD 18 · SE 10, + ND 19 déjà en base) somment à
-- 140, et cinq d'entre eux (OU 20, ND 19, SD 18, NI 11, SE 10) ont été recoupés
-- avec un résumé de recherche externe. Les cinq autres (AR, CE, GA, NE, NO) ne
-- reposent que sur la mémoire de l'agent et la somme.
-- Une recherche a aussi relevé « 146 communes » dans une source plus récente
-- (création de communes par décret, 2015) : il peut en MANQUER. Ajouter une
-- commune est un simple insert ; en retirer une, jamais.
-- ⚠️ Les graphies KREYÒL sont de l'agent, best-effort, EN ATTENTE DE RELECTURE
-- NATIVE — même statut que le seed du Nord (0069, arbitrage Z-D). Quand une
-- graphie kreyòl n'était pas certaine, le nom français a été repris tel quel.
-- label_en / label_es restent NULL (repli sur le français, arbitrage Z-D).
--
-- ─── CE QUE CETTE MIGRATION NE FAIT PAS ────────────────────────────────────
-- Aucun quartier (un quartier est optionnel, ZB069 n'exige que la commune),
-- aucune coordonnée, aucun département créé ou modifié, aucune commune du Nord
-- touchée. Aucune suppression, aucune fonction, aucun droit modifié.
-- La clause « on conflict do nothing » garde telle quelle une commune déjà
-- ajoutée à la main depuis /admin/zones (le post-contrôle compte alors toutes
-- les communes du département, pas seulement celles de ce fichier).

begin;

insert into zabelie_zones (parent_id, level, slug, label_kr, label_fr, is_active)
select d.id, 'komin', v.slug, v.label_kr, v.label_fr, false
  from (values
  ('HT-AR', 'gonaives', 'Gonayiv', 'Gonaïves'),
  ('HT-AR', 'ennery', 'Enri', 'Ennery'),
  ('HT-AR', 'l-estere', 'Lestè', 'L''Estère'),
  ('HT-AR', 'dessalines', 'Desalin', 'Dessalines'),
  ('HT-AR', 'desdunes', 'Dedin', 'Desdunes'),
  ('HT-AR', 'grande-saline', 'Gran Salin', 'Grande-Saline'),
  ('HT-AR', 'petite-riviere-de-l-artibonite', 'Ti Rivyè Latibonit', 'Petite-Rivière-de-l''Artibonite'),
  ('HT-AR', 'gros-morne', 'Gwomòn', 'Gros-Morne'),
  ('HT-AR', 'anse-rouge', 'Ans Wouj', 'Anse-Rouge'),
  ('HT-AR', 'terre-neuve', 'Tèrnèv', 'Terre-Neuve'),
  ('HT-AR', 'marmelade', 'Marmelad', 'Marmelade'),
  ('HT-AR', 'saint-michel-de-l-attalaye', 'Sen Michèl Latalay', 'Saint-Michel-de-l''Attalaye'),
  ('HT-AR', 'saint-marc', 'Sen Mak', 'Saint-Marc'),
  ('HT-AR', 'verrettes', 'Vèrèt', 'Verrettes'),
  ('HT-AR', 'la-chapelle', 'Lachapèl', 'La Chapelle'),
  ('HT-CE', 'hinche', 'Ench', 'Hinche'),
  ('HT-CE', 'cerca-carvajal', 'Sèka Kavajal', 'Cerca-Carvajal'),
  ('HT-CE', 'maissade', 'Mayisad', 'Maïssade'),
  ('HT-CE', 'thomonde', 'Tomond', 'Thomonde'),
  ('HT-CE', 'lascahobas', 'Lascahobas', 'Lascahobas'),
  ('HT-CE', 'belladere', 'Belladè', 'Belladère'),
  ('HT-CE', 'savanette', 'Savanèt', 'Savanette'),
  ('HT-CE', 'mirebalais', 'Mibalè', 'Mirebalais'),
  ('HT-CE', 'saut-d-eau', 'Sodo', 'Saut-d''Eau'),
  ('HT-CE', 'boucan-carre', 'Boukan Kare', 'Boucan-Carré'),
  ('HT-CE', 'cerca-la-source', 'Sèka Lasous', 'Cerca-la-Source'),
  ('HT-CE', 'thomassique', 'Tomasik', 'Thomassique'),
  ('HT-GA', 'jeremie', 'Jeremi', 'Jérémie'),
  ('HT-GA', 'abricots', 'Abriko', 'Abricots'),
  ('HT-GA', 'bonbon', 'Bonbon', 'Bonbon'),
  ('HT-GA', 'chambellan', 'Chanbelan', 'Chambellan'),
  ('HT-GA', 'moron', 'Moron', 'Moron'),
  ('HT-GA', 'roseaux', 'Wozo', 'Roseaux'),
  ('HT-GA', 'corail', 'Koray', 'Corail'),
  ('HT-GA', 'beaumont', 'Bomon', 'Beaumont'),
  ('HT-GA', 'pestel', 'Pestèl', 'Pestel'),
  ('HT-GA', 'les-irois', 'Irwa', 'Les Irois'),
  ('HT-GA', 'dame-marie', 'Dammari', 'Dame-Marie'),
  ('HT-GA', 'anse-d-hainault', 'Ansdeno', 'Anse-d''Hainault'),
  ('HT-NI', 'miragoane', 'Miragwàn', 'Miragoâne'),
  ('HT-NI', 'petite-riviere-de-nippes', 'Ti Rivyè Nip', 'Petite-Rivière-de-Nippes'),
  ('HT-NI', 'paillant', 'Payan', 'Paillant'),
  ('HT-NI', 'fonds-des-negres', 'Fon Nèg', 'Fonds-des-Nègres'),
  ('HT-NI', 'arnaud', 'Arno', 'Arnaud'),
  ('HT-NI', 'l-asile', 'Lazil', 'L''Asile'),
  ('HT-NI', 'anse-a-veau', 'Ansavo', 'Anse-à-Veau'),
  ('HT-NI', 'plaisance-du-sud', 'Plezans disid', 'Plaisance-du-Sud'),
  ('HT-NI', 'baraderes', 'Baradè', 'Baradères'),
  ('HT-NI', 'grand-boucan', 'Gran Boukan', 'Grand-Boucan'),
  ('HT-NI', 'petit-trou-de-nippes', 'Ti Twou Nip', 'Petit-Trou-de-Nippes'),
  ('HT-NE', 'fort-liberte', 'Fòlibète', 'Fort-Liberté'),
  ('HT-NE', 'ferrier', 'Fery', 'Ferrier'),
  ('HT-NE', 'perches', 'Pèch', 'Perches'),
  ('HT-NE', 'ouanaminthe', 'Wanament', 'Ouanaminthe'),
  ('HT-NE', 'capotille', 'Kapotiy', 'Capotille'),
  ('HT-NE', 'mont-organise', 'Mon Organize', 'Mont-Organisé'),
  ('HT-NE', 'trou-du-nord', 'Twou dinò', 'Trou-du-Nord'),
  ('HT-NE', 'caracol', 'Karakòl', 'Caracol'),
  ('HT-NE', 'sainte-suzanne', 'Sent Sizàn', 'Sainte-Suzanne'),
  ('HT-NE', 'terrier-rouge', 'Tèrye Wouj', 'Terrier-Rouge'),
  ('HT-NE', 'vallieres', 'Valyè', 'Vallières'),
  ('HT-NE', 'carice', 'Karis', 'Carice'),
  ('HT-NE', 'mombin-crochu', 'Monben Kroshi', 'Mombin-Crochu'),
  ('HT-NO', 'port-de-paix', 'Pòdepè', 'Port-de-Paix'),
  ('HT-NO', 'bassin-bleu', 'Basen Ble', 'Bassin-Bleu'),
  ('HT-NO', 'chansolme', 'Chansolm', 'Chansolme'),
  ('HT-NO', 'ile-de-la-tortue', 'Latòtiy', 'Île de la Tortue'),
  ('HT-NO', 'jean-rabel', 'Jan Rabèl', 'Jean-Rabel'),
  ('HT-NO', 'mole-saint-nicolas', 'Mòl Sen Nikola', 'Môle-Saint-Nicolas'),
  ('HT-NO', 'bombardopolis', 'Bonbadopolis', 'Bombardopolis'),
  ('HT-NO', 'baie-de-henne', 'Baydenn', 'Baie-de-Henne'),
  ('HT-NO', 'saint-louis-du-nord', 'Sen Lwi dinò', 'Saint-Louis-du-Nord'),
  ('HT-NO', 'anse-a-foleur', 'Ansafòlè', 'Anse-à-Foleur'),
  ('HT-OU', 'port-au-prince', 'Pòtoprens', 'Port-au-Prince'),
  ('HT-OU', 'delmas', 'Dèlma', 'Delmas'),
  ('HT-OU', 'carrefour', 'Kafou', 'Carrefour'),
  ('HT-OU', 'petion-ville', 'Petyonvil', 'Pétion-Ville'),
  ('HT-OU', 'tabarre', 'Tabarè', 'Tabarre'),
  ('HT-OU', 'cite-soleil', 'Site Soley', 'Cité Soleil'),
  ('HT-OU', 'kenscoff', 'Kenskòf', 'Kenscoff'),
  ('HT-OU', 'gressier', 'Grese', 'Gressier'),
  ('HT-OU', 'leogane', 'Leyogàn', 'Léogâne'),
  ('HT-OU', 'petit-goave', 'Ti Goave', 'Petit-Goâve'),
  ('HT-OU', 'grand-goave', 'Gran Goave', 'Grand-Goâve'),
  ('HT-OU', 'cabaret', 'Kabarè', 'Cabaret'),
  ('HT-OU', 'arcahaie', 'Lakayè', 'Arcahaie'),
  ('HT-OU', 'croix-des-bouquets', 'Kwadèbouke', 'Croix-des-Bouquets'),
  ('HT-OU', 'ganthier', 'Ganthye', 'Ganthier'),
  ('HT-OU', 'thomazeau', 'Tomazo', 'Thomazeau'),
  ('HT-OU', 'fonds-verrettes', 'Fonsvèrèt', 'Fonds-Verrettes'),
  ('HT-OU', 'anse-a-galets', 'Ansagalèt', 'Anse-à-Galets'),
  ('HT-OU', 'pointe-a-raquette', 'Pwent Rakèt', 'Pointe-à-Raquette'),
  ('HT-OU', 'cornillon', 'Kònilon', 'Cornillon'),
  ('HT-SD', 'les-cayes', 'Okay', 'Les Cayes'),
  ('HT-SD', 'torbeck', 'Tòbèk', 'Torbeck'),
  ('HT-SD', 'chantal', 'Chantal', 'Chantal'),
  ('HT-SD', 'camp-perrin', 'Kanperen', 'Camp-Perrin'),
  ('HT-SD', 'maniche', 'Maniche', 'Maniche'),
  ('HT-SD', 'ile-a-vache', 'Ilavach', 'Île-à-Vache'),
  ('HT-SD', 'port-salut', 'Pòsali', 'Port-Salut'),
  ('HT-SD', 'saint-jean-du-sud', 'Sen Jan disid', 'Saint-Jean-du-Sud'),
  ('HT-SD', 'arniquet', 'Arnike', 'Arniquet'),
  ('HT-SD', 'aquin', 'Aken', 'Aquin'),
  ('HT-SD', 'cavaillon', 'Kavayon', 'Cavaillon'),
  ('HT-SD', 'saint-louis-du-sud', 'Sen Lwi disid', 'Saint-Louis-du-Sud'),
  ('HT-SD', 'roche-a-bateaux', 'Woch a Bato', 'Roche-à-Bateaux'),
  ('HT-SD', 'port-a-piment', 'Pò a Piman', 'Port-à-Piment'),
  ('HT-SD', 'chardonnieres', 'Chadonyè', 'Chardonnières'),
  ('HT-SD', 'les-anglais', 'Zanglè', 'Les Anglais'),
  ('HT-SD', 'tiburon', 'Tiburon', 'Tiburon'),
  ('HT-SD', 'coteaux', 'Koto', 'Coteaux'),
  ('HT-SE', 'jacmel', 'Jakmèl', 'Jacmel'),
  ('HT-SE', 'cayes-jacmel', 'Kayjakmèl', 'Cayes-Jacmel'),
  ('HT-SE', 'marigot', 'Marigo', 'Marigot'),
  ('HT-SE', 'la-vallee', 'Lavale', 'La Vallée'),
  ('HT-SE', 'bainet', 'Benè', 'Bainet'),
  ('HT-SE', 'cotes-de-fer', 'Kòt de Fè', 'Côtes-de-Fer'),
  ('HT-SE', 'belle-anse', 'Bèlans', 'Belle-Anse'),
  ('HT-SE', 'anse-a-pitres', 'Ansapit', 'Anse-à-Pitres'),
  ('HT-SE', 'grand-gosier', 'Gran Gozye', 'Grand-Gosier'),
  ('HT-SE', 'thiotte', 'Tyòt', 'Thiotte')
  ) as v(code, slug, label_kr, label_fr)
  join zabelie_zones d on d.level = 'depatman' and d.code = v.code
on conflict (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug) do nothing;

-- ── Post-conditions — la migration se prouve avant de se déclarer faite ─────
do $$
declare
  v_ecart text;
  v_total integer;
  v_ouvertes integer;
begin
  -- Effectifs OFFICIELS par département, toutes communes confondues.
  select string_agg(a.code || ': ' || coalesce(c.n, 0) || ' au lieu de ' || a.attendu, ' ; ')
    into v_ecart
    from (values ('HT-AR', 15), ('HT-CE', 12), ('HT-GA', 12), ('HT-NI', 11), ('HT-ND', 19),
                 ('HT-NE', 13), ('HT-NO', 10), ('HT-OU', 20), ('HT-SD', 18), ('HT-SE', 10))
         as a(code, attendu)
    left join (select d.code, count(*) as n
                 from zabelie_zones k join zabelie_zones d on d.id = k.parent_id
                where k.level = 'komin' and d.level = 'depatman'
                group by d.code) c on c.code = a.code
   where coalesce(c.n, 0) <> a.attendu;
  if v_ecart is not null then
    raise exception '0159 KO: effectifs de communes non conformes — %', v_ecart;
  end if;

  select count(*) into v_total from zabelie_zones where level = 'komin';
  if v_total <> 140 then
    raise exception '0159 KO: % communes en base, 140 attendues', v_total;
  end if;

  -- Rien de ce fichier n'est ouvert : l'ouverture est une décision du porteur.
  select count(*) into v_ouvertes
    from zabelie_zones k join zabelie_zones d on d.id = k.parent_id
   where k.level = 'komin' and k.is_active and d.code <> 'HT-ND';
  if v_ouvertes <> 0 then
    raise exception '0159 KO: % commune(s) ouverte(s) hors du Nord — elles doivent rester fermées', v_ouvertes;
  end if;

  raise notice '0159 OK — 140 communes en base, 121 ajoutées fermées';
end $$;

commit;
