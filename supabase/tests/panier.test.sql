-- Tests du panier (0058) — propriété, gardes métier, idempotence.
-- Transaction annulée : rien ne persiste.
begin;

do $$
declare
  v_acheteur uuid := gen_random_uuid();
  v_autre    uuid := gen_random_uuid();
  v_vendeur  uuid := gen_random_uuid();
  v_publie   uuid;
  v_brouillon uuid;
  v_cart     uuid;
  v_n        integer;
begin
  insert into auth.users (id) values (v_acheteur), (v_autre), (v_vendeur);
  insert into profiles (id, display_name)
  values (v_acheteur, 'Achtè'), (v_autre, 'Lòt'), (v_vendeur, 'Vandè')
  on conflict (id) do nothing;
  insert into products (id, seller_id, slug, title, price_htg, kind, status)
  values (gen_random_uuid(), v_vendeur, 'pwodui-panyen', 'Pwodui panyen', 500, 'fichier', 'published')
  returning id into v_publie;
  insert into products (id, seller_id, slug, title, price_htg, kind, status)
  values (gen_random_uuid(), v_vendeur, 'bwouyon-panyen', 'Bwouyon', 500, 'fichier', 'draft')
  returning id into v_brouillon;

  -- La RPC lit auth.uid() : on se fait passer pour l'acheteur.
  perform set_config('request.jwt.claim.sub', v_acheteur::text, true);

  -- PA1 — connu-négatif : l'ajout d'un produit publié passe, et crée le panier.
  select zabelie_cart_add(v_publie) into v_cart;
  if v_cart is null then raise exception 'PA1: aucun panier créé'; end if;
  raise notice 'OK — PA1 ajout + création du panier';

  -- PA2 — idempotence : rajouter ne double pas la ligne.
  perform zabelie_cart_add(v_publie);
  select count(*) into v_n from zabelie_cart_items where cart_id = v_cart;
  if v_n <> 1 then raise exception 'PA2: % ligne(s), 1 attendue', v_n; end if;
  raise notice 'OK — PA2 idempotent';

  -- PA3 — un brouillon ne s'ajoute pas.
  begin
    perform zabelie_cart_add(v_brouillon);
    raise exception 'PA3: le brouillon aurait du etre refusé';
  exception when sqlstate 'ZB058' then
    raise notice 'OK — PA3 brouillon refusé (ZB058)';
  end;

  -- PA4 — un vendeur n'achète pas son propre produit.
  perform set_config('request.jwt.claim.sub', v_vendeur::text, true);
  begin
    perform zabelie_cart_add(v_publie);
    raise exception 'PA4: l''auto-achat aurait du etre refusé';
  exception when sqlstate 'ZB058' then
    raise notice 'OK — PA4 auto-achat refusé (ZB058)';
  end;

  -- PA5 — retirer depuis un AUTRE compte ne touche rien.
  perform set_config('request.jwt.claim.sub', v_autre::text, true);
  select zabelie_cart_remove(v_publie) into v_n;
  if v_n <> 0 then raise exception 'PA5: % ligne(s) retirées du panier d''autrui', v_n; end if;
  raise notice 'OK — PA5 le panier d''autrui est hors d''atteinte';

  -- PA6 — le propriétaire, lui, retire bien.
  perform set_config('request.jwt.claim.sub', v_acheteur::text, true);
  select zabelie_cart_remove(v_publie) into v_n;
  if v_n <> 1 then raise exception 'PA6: % retirée(s), 1 attendue', v_n; end if;
  raise notice 'OK — PA6 retrait par le propriétaire';

  -- PA7 — aucun prix stocké au panier : la table ne PORTE pas de colonne prix.
  select count(*) into v_n
  from information_schema.columns
  where table_name = 'zabelie_cart_items'
    and column_name in ('price_htg', 'price', 'amount', 'total');
  if v_n > 0 then
    raise exception 'PA7: le panier porte une colonne de prix — règle dure n°3';
  end if;
  raise notice 'OK — PA7 aucun prix au panier';
end;
$$;

rollback;
