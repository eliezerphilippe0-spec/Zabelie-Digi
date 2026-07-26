# Taxonomie catalogue Zabelie — proposition complète

> **Statut : PROPOSITION. Aucune migration, aucun seed écrit.** Chantier B (§5
> de la spec V1) — présenté en avance à ta demande explicite.
> Date : 2026-07-24.

## Cadre

- **3 niveaux maximum** (spec §5) : `Depatman` → `Kategori` → `Sou-kategori`.
- **16 départements**, ~80 catégories, ~330 sous-catégories.
- Libellés **KR / FR / EN** aux niveaux 1 et 2. Au niveau 3, le libellé FR fait
  foi dans ce document ; **les traductions KR/EN du niveau 3 seront produites
  avec la migration de seed**, pour être relues d'un bloc.
- ⚠️ **Tout le Kreyòl est à faire relire par un locuteur natif** avant mise en
  ligne — même règle que `lib/i18n.ts`.

### Sources de cette proposition
1. Ta demande explicite : **pièces détachées, autos, motos** → département 1.
2. Le seed prioritaire de la spec §5 : **électronique/accessoires** et
   **cosmétique/capillaire** → départements 2 et 6.
3. La capture d'écran fournie : Mode & accessoires, Sport, Savon, Livres et
   papeterie, Marché agricole, Chaussures, Sacs → départements 3, 4, 5, 7, 9,
   12, 13.
4. Le marché haïtien réel : **énergie solaire/inverters** (2.5), produits
   locaux (8.3), artisanat pour la diaspora (15).
5. L'existant à ne pas détruire : produits digitaux et services (16).

### ✅ Périmètre d'activation — arbitré (2026-07-24)

**Principe retenu** : les 16 départements sont **définis en base**, l'activation
est partielle (colonne `active`). Un département inactif n'apparaît ni à la
publication ni dans les filtres. Ouverture progressive **sans migration**.

**Vague 1 — activée au lancement**, resserrée à l'intérieur des départements :

| Département | Portée activée | Motif |
|---|---|---|
| **1. Auto & Moto** | **4 familles seulement** — filtration · freinage · **huiles & liquides (1.4)** · batteries & delcos | **Pièces d'usure et consommables** : achat répété, ambiguïté de compatibilité faible, poids maîtrisé |
| **2. Électronique** | 2.1 Téléphones & tablettes · 2.2 Accessoires | Seed prioritaire d'origine |
| **6. Beauté** | 6.1 Capillaire · 6.2 Soins de la peau | Seed prioritaire d'origine |
| **16. Digital & Services** | Tel quel | Existant, ne pas casser |

> ⚠️ **Explicitement PAS en vague 1** : carrosserie, vitrage, suspension (1.1),
> pneus (1.3). Ce sont les **pires cas en fitment et en logistique** — forte
> ambiguïté de référence et encombrement. Ils viennent après.

**Vague 2 — définis maintenant, activés ensuite** :
- **2.5 Énergie & électricité** (solaire, inverters, delcos) — le **panier
  moyen le plus élevé** du marché
- **15. Artisanat & cadeaux** — le **meilleur argument** pour le rail en devise
  forte (diaspora)

Les 10 autres départements restent définis et inactifs.

---

## 1. Otomobil & Moto — Auto & Moto — *Automotive*

> Département demandé explicitement. Le plus exigeant du catalogue : une pièce
> ne s'achète pas sans **compatibilité véhicule**. Voir §Notes techniques.

| # | Kreyòl | Français | English |
|---|---|---|---|
| 1.1 | Pyès detache oto | Pièces détachées auto | Car parts |
| 1.2 | Pyès detache moto | Pièces détachées moto | Motorcycle parts |
| 1.3 | Kawotchou & jant | Pneus & jantes | Tires & rims |
| 1.4 | Luil & likid | Huiles & liquides | Oils & fluids |
| 1.5 | Akseswa oto | Accessoires auto | Car accessories |
| 1.6 | Ekipman motosiklis | Équipement motard | Rider gear |
| 1.7 | Zouti & garaj | Outillage & garage | Tools & garage |
| 1.8 | Veyikil 2 wou | Véhicules 2 roues | Two-wheelers |

**1.1 Pièces détachées auto** — Moteur (culasse, joints, pistons, courroies) ·
Freinage (plaquettes, disques, étriers, liquide) · Suspension & direction
(amortisseurs, rotules, biellettes) · Embrayage & transmission ·
Filtration (huile, air, carburant, habitacle) · Démarrage & charge (batteries,
alternateurs, démarreurs, bougies) · Refroidissement (radiateurs, pompes à eau,
thermostats) · Échappement · Carrosserie (pare-chocs, ailes, capots, phares,
feux) · Vitrage & rétroviseurs · Électricité & câblage · Climatisation

**1.2 Pièces détachées moto** — Moteur moto · Freinage moto · Chaînes, pignons
& couronnes · Suspension moto · Carénage & carrosserie · Batteries moto ·
Bougies & allumage · Câbles & commandes · Guidons, leviers & repose-pieds ·
Échappement moto

**1.3 Pneus & jantes** — Pneus auto · Pneus moto · Pneus camion & pick-up ·
Jantes & enjoliveurs · Chambres à air · Valves & équilibrage · Kits anti-crevaison

**1.4 Huiles & liquides** — Huile moteur · Huile de boîte · Liquide de frein ·
Liquide de refroidissement · Liquide lave-glace · Graisses · Additifs & traitements

**1.5 Accessoires auto** — Tapis & housses de siège · Autoradio & multimédia ·
Caméras de recul & assistance · GPS · Chargeurs & supports téléphone ·
Nettoyage & entretien auto · Sécurité (extincteurs, triangles, antivols) ·
Bâches & protections

**1.6 Équipement motard** — Casques · Gants · Vestes & protections ·
Bottes moto · Antivols & alarmes · Top-cases & sacoches · Imperméables

**1.7 Outillage & garage** — Clés & douilles · Crics & chandelles ·
Compresseurs & gonfleurs · Valises de diagnostic OBD · Chargeurs de batterie ·
Câbles de démarrage · Produits d'atelier

**1.8 Véhicules 2 roues** — Motos · Scooters · Vélos · Vélos électriques ·
Pièces & accessoires vélo

---

## 2. Elektwonik — Électronique — *Electronics*

| # | Kreyòl | Français | English |
|---|---|---|---|
| 2.1 | Telefòn & tablèt | Téléphones & tablettes | Phones & tablets |
| 2.2 | Akseswa telefòn | Accessoires téléphone | Phone accessories |
| 2.3 | Enfòmatik | Informatique | Computing |
| 2.4 | Odyo & imaj | Audio & vidéo | Audio & video |
| 2.5 | Enèji & kouran | Énergie & électricité | Power & energy |
| 2.6 | Kamera & sekirite | Caméras & sécurité | Cameras & security |

**2.1** Smartphones · Téléphones simples · Tablettes · Montres connectées ·
Pièces détachées téléphone (écrans, batteries, connecteurs)

**2.2** Coques & étuis · Protections d'écran · Chargeurs & adaptateurs ·
Câbles · Batteries externes (powerbanks) · Écouteurs & oreillettes ·
Cartes mémoire · Supports & trépieds

**2.3** Ordinateurs portables · Ordinateurs de bureau · Écrans ·
Claviers & souris · Imprimantes · Cartouches & toners · Stockage (clés USB,
disques durs) · Réseau (routeurs, répéteurs) · Composants & pièces PC

**2.4** Téléviseurs · Enceintes & sonos · Casques audio · Barres de son ·
Projecteurs · Micros & matériel DJ · Accessoires TV (supports, câbles HDMI)

**2.5** ⚡ *Catégorie stratégique en Haïti* — Panneaux solaires ·
Batteries solaires · Onduleurs & inverters · Régulateurs de charge ·
Groupes électrogènes (delco) · Ampoules & LED · Lampes rechargeables ·
Rallonges & multiprises · Stabilisateurs de tension · Câblage électrique

**2.6** Caméras de surveillance · Enregistreurs (DVR/NVR) · Sonnettes vidéo ·
Alarmes & détecteurs · Appareils photo · Drones · Accessoires photo

---

## 3. Mòd & Akseswa — Mode & accessoires — *Fashion*

| # | Kreyòl | Français | English |
|---|---|---|---|
| 3.1 | Rad fanm | Vêtements femme | Women's clothing |
| 3.2 | Rad gason | Vêtements homme | Men's clothing |
| 3.3 | Rad timoun | Vêtements enfant | Kids' clothing |
| 3.4 | Bijou & mont | Bijoux & montres | Jewelry & watches |
| 3.5 | Akseswa mòd | Accessoires de mode | Fashion accessories |

**3.1** Robes · Hauts & chemisiers · Pantalons & jeans · Jupes ·
Ensembles & tailleurs · Lingerie · Maillots de bain · Vestes & manteaux ·
Tenues traditionnelles (karabela)

**3.2** Chemises · T-shirts & polos · Pantalons & jeans · Shorts ·
Costumes · Sous-vêtements · Vestes · Tenues traditionnelles

**3.3** Bébé 0-2 ans · Fille · Garçon · Uniformes scolaires ·
Tenues de cérémonie

**3.4** Colliers · Bracelets · Boucles d'oreilles · Bagues · Montres homme ·
Montres femme · Parures · Bijoux artisanaux

**3.5** Ceintures · Chapeaux & casquettes · Lunettes de soleil · Foulards &
écharpes · Portefeuilles · Gants · Cravates & nœuds papillon

---

## 4. Soulye — Chaussures — *Shoes*

| # | Kreyòl | Français | English |
|---|---|---|---|
| 4.1 | Soulye fanm | Chaussures femme | Women's shoes |
| 4.2 | Soulye gason | Chaussures homme | Men's shoes |
| 4.3 | Soulye timoun | Chaussures enfant | Kids' shoes |
| 4.4 | Antretyen soulye | Entretien chaussures | Shoe care |

**4.1** Sandales · Talons · Baskets · Ballerines · Bottes · Mules & claquettes
**4.2** Baskets · Chaussures de ville · Mocassins · Sandales · Bottes · Tongs
**4.3** Bébé · Fille · Garçon · Chaussures scolaires · Baskets enfant
**4.4** Cirage & entretien · Semelles · Lacets · Embauchoirs

---

## 5. Sak & Bagay — Sacs & bagagerie — *Bags & luggage*

| # | Kreyòl | Français | English |
|---|---|---|---|
| 5.1 | Sak fanm | Sacs femme | Women's bags |
| 5.2 | Sak vwayaj | Bagagerie | Luggage |
| 5.3 | Sak lekòl | Sacs scolaires | School bags |
| 5.4 | Sak travay | Sacs professionnels | Work bags |

**5.1** Sacs à main · Sacs bandoulière · Pochettes · Sacs à dos femme · Cabas
**5.2** Valises · Sacs de voyage · Sacs de cabine · Housses & accessoires
**5.3** Sacs à dos scolaires · Cartables · Sacs à roulettes · Trousses
**5.4** Sacoches ordinateur · Serviettes & porte-documents · Sacs à outils

---

## 6. Bote & Swen — Beauté & soins — *Beauty & care*

> Seed prioritaire (spec §5) avec l'électronique.

| # | Kreyòl | Français | English |
|---|---|---|---|
| 6.1 | Swen cheve | Soins capillaires | Hair care |
| 6.2 | Swen po | Soins de la peau | Skin care |
| 6.3 | Makiyaj | Maquillage | Makeup |
| 6.4 | Pafen | Parfums | Fragrances |
| 6.5 | Ijyèn pèsonèl | Hygiène personnelle | Personal hygiene |
| 6.6 | Aparèy bote | Appareils de beauté | Beauty devices |

**6.1** Shampoings · Après-shampoings & masques · Huiles & sérums capillaires ·
Mèches & extensions · Perruques · Tresses & crochets · Défrisants & texturisants ·
Gels & fixateurs · Accessoires coiffure (peignes, brosses, pinces) ·
Produits cheveux naturels/crépus

**6.2** Crèmes visage · Laits & crèmes corps · Sérums · Nettoyants & toniques ·
Protections solaires · Savons de soin · Soins ciblés (taches, acné) ·
Beurres & huiles naturelles (karité, coco, ricin)

**6.3** Fond de teint & poudres · Yeux (mascara, fards, crayons) ·
Lèvres (rouges, gloss) · Ongles (vernis, faux ongles, soins) ·
Pinceaux & éponges · Palettes

**6.4** Parfums femme · Parfums homme · Déodorants · Brumes corporelles ·
Coffrets

**6.5** Dentifrices & brosses à dents · Papier hygiénique · Serviettes &
protections périodiques · Rasage & épilation · Savons & gels douche ·
Cotons & lingettes

**6.6** Sèche-cheveux · Tondeuses & rasoirs électriques · Fers à lisser & à
boucler · Épilateurs · Appareils de soin visage · Miroirs lumineux

---

## 7. Savon & Netwayaj — Savon & entretien — *Soap & cleaning*

> Catégorie de tête sur la capture fournie — produit de consommation courante
> à forte rotation.

| # | Kreyòl | Français | English |
|---|---|---|---|
| 7.1 | Savon | Savons | Soaps |
| 7.2 | Lesiv | Lessive | Laundry |
| 7.3 | Netwayaj kay | Entretien maison | Home cleaning |
| 7.4 | Materyèl netwayaj | Matériel de nettoyage | Cleaning tools |

**7.1** Savon de toilette · Savon artisanal · Savon noir · Savon liquide ·
Savon de Marseille · Savon antiseptique
**7.2** Lessive en poudre · Lessive liquide · Adoucissants · Eau de Javel ·
Détachants · Amidon
**7.3** Nettoyants sols & surfaces · Liquide vaisselle · Désinfectants ·
Insecticides & répulsifs · Désodorisants · Nettoyants sanitaires
**7.4** Balais & serpillières · Seaux & bassines · Éponges & chiffons ·
Gants de ménage · Poubelles & sacs

---

## 8. Manje & Machandiz — Alimentation & épicerie — *Food & grocery*

| # | Kreyòl | Français | English |
|---|---|---|---|
| 8.1 | Pwodwi sèk | Épicerie sèche | Dry goods |
| 8.2 | Bwason | Boissons | Beverages |
| 8.3 | Pwodwi lokal | Produits locaux | Local products |
| 8.4 | Konsèv & sòs | Conserves & condiments | Canned & condiments |
| 8.5 | Goute & bonbon | Snacks & confiserie | Snacks & sweets |

**8.1** Riz · Haricots (pwa) · Maïs & farines · Pâtes · Huiles de cuisine ·
Sucre & sel · Épices & assaisonnements · Lait en poudre
**8.2** Eau · Jus · Sodas · Café · Thé & tisanes · Boissons énergisantes ·
Sirops
**8.3** ⭐ *Différenciant diaspora* — Rapadou · Mamba (beurre d'arachide) ·
Cassave · Café haïtien · Cacao · Épices créoles (epis) · Confitures locales ·
Miel local
**8.4** Conserves · Sauces & piments · Vinaigres · Mayonnaise & moutarde ·
Bouillons
**8.5** Biscuits · Chips & snacks salés · Bonbons · Chocolats · Fruits secs

---

## 9. Mache Agrikòl — Marché agricole — *Agriculture*

| # | Kreyòl | Français | English |
|---|---|---|---|
| 9.1 | Legim & fwi | Fruits & légumes | Fresh produce |
| 9.2 | Grenn & semans | Graines & semences | Seeds |
| 9.3 | Zouti agrikòl | Outils agricoles | Farm tools |
| 9.4 | Angrè & tretman | Engrais & traitements | Fertilizers |
| 9.5 | Bèt & pwovann | Élevage & aliments | Livestock & feed |

**9.1** Légumes frais · Fruits frais · Tubercules (igname, patate, manioc) ·
Bananes & plantains · Herbes aromatiques
**9.2** Semences potagères · Semences vivrières · Plants & boutures · Terreau
**9.3** Machettes (manchèt) · Houes & pioches · Arrosoirs · Pulvérisateurs ·
Sécateurs · Brouettes
**9.4** Engrais organiques · Engrais chimiques · Pesticides · Fongicides
**9.5** Volailles · Petit bétail · Aliments pour volaille · Aliments pour
bétail · Matériel d'élevage (abreuvoirs, mangeoires) · Produits vétérinaires

---

## 10. Kay & Kizin — Maison & cuisine — *Home & kitchen*

| # | Kreyòl | Français | English |
|---|---|---|---|
| 10.1 | Mèb | Mobilier | Furniture |
| 10.2 | Kizin | Cuisine | Kitchenware |
| 10.3 | Elektwomenaje | Électroménager | Appliances |
| 10.4 | Dekorasyon | Décoration | Home decor |
| 10.5 | Kabann & twal | Literie & linge | Bedding & linen |
| 10.6 | Konstriksyon | Bricolage & construction | Hardware & DIY |

**10.1** Salon · Chambre · Salle à manger · Bureau · Rangement & armoires ·
Mobilier extérieur · Meubles enfants
**10.2** Casseroles & marmites · Poêles · Ustensiles · Vaisselle · Verres &
tasses · Couverts · Conservation & boîtes · Chaudières traditionnelles
**10.3** Réfrigérateurs · Congélateurs · Cuisinières & réchauds · Micro-ondes ·
Mixeurs & blenders · Machines à laver · Ventilateurs · Climatiseurs ·
Fers à repasser · Bouilloires
**10.4** Rideaux · Tapis · Luminaires · Cadres & miroirs · Plantes & pots ·
Objets décoratifs · Horloges
**10.5** Matelas · Draps & parures · Oreillers · Couvertures ·
Moustiquaires · Serviettes de bain · Nappes
**10.6** Outils à main · Outillage électroportatif · Peinture & pinceaux ·
Plomberie · Électricité & câbles · Quincaillerie (vis, clous) ·
Matériaux (ciment, carrelage) · Échelles · Serrurerie

---

## 11. Sante & Byennèt — Santé & bien-être — *Health & wellness*

| # | Kreyòl | Français | English |
|---|---|---|---|
| 11.1 | Parafamasi | Parapharmacie | Healthcare |
| 11.2 | Pwodwi natirèl | Produits naturels | Natural remedies |
| 11.3 | Materyèl medikal | Matériel médical | Medical supplies |

**11.1** Vitamines & compléments · Premiers soins · Thermomètres ·
Tensiomètres · Glucomètres · Antiseptiques
**11.2** Tisanes & feuilles · Huiles essentielles · Remèdes traditionnels ·
Compléments naturels
**11.3** Masques & gants · Béquilles & déambulateurs · Fauteuils roulants ·
Pansements & bandages · Matériel de diagnostic

> ⚠️ **Restriction réglementaire** : aucun médicament sur ordonnance. Ce
> département exige une **liste de produits interdits** appliquée à la
> publication. À écrire avant activation.

---

## 12. Espò & Lwazi — Sport & loisirs — *Sports & leisure*

| # | Kreyòl | Français | English |
|---|---|---|---|
| 12.1 | Ekipman espò | Équipement sportif | Sports equipment |
| 12.2 | Rad espò | Vêtements de sport | Sportswear |
| 12.3 | Aktivite deyò | Plein air | Outdoor |
| 12.4 | Jwèt & lwazi | Jeux & loisirs | Games & hobbies |

**12.1** Football · Basketball · Fitness & musculation · Arts martiaux ·
Natation · Tennis & raquettes · Ballons
**12.2** Maillots & shorts · Chaussures de sport · Survêtements ·
Accessoires (gants, protections)
**12.3** Camping · Pêche · Plage · Randonnée · Gourdes & glacières
**12.4** Jeux de société · Dominos & cartes · Puzzles · Jeux vidéo & consoles

---

## 13. Liv & Papèt — Livres & papeterie — *Books & stationery*

| # | Kreyòl | Français | English |
|---|---|---|---|
| 13.1 | Liv | Livres | Books |
| 13.2 | Founiti lekòl | Fournitures scolaires | School supplies |
| 13.3 | Founiti biwo | Fournitures de bureau | Office supplies |
| 13.4 | Atizay & kreyasyon | Arts créatifs | Arts & crafts |

**13.1** Manuels scolaires · Romans · Livres religieux · Jeunesse ·
Professionnels & techniques · Livres en créole · Dictionnaires
**13.2** Cahiers · Stylos & crayons · Calculatrices · Règles & géométrie ·
Sacs & trousses · Uniformes
**13.3** Classeurs & chemises · Papier & ramettes · Encre & toners ·
Agendas · Tampons · Petit matériel
**13.4** Peinture & toiles · Dessin · Loisirs créatifs · Matériel de couture

---

## 14. Timoun & Bebe — Bébé & enfants — *Baby & kids*

| # | Kreyòl | Français | English |
|---|---|---|---|
| 14.1 | Swen bebe | Soins bébé | Baby care |
| 14.2 | Materyèl bebe | Équipement bébé | Baby gear |
| 14.3 | Jwèt | Jouets | Toys |

**14.1** Couches (kouchèt) · Lingettes · Crèmes & soins · Biberons & tétines ·
Lait infantile · Bavoirs · Bain bébé
**14.2** Poussettes · Sièges auto · Lits & berceaux · Chaises hautes ·
Porte-bébés · Parcs · Tapis d'éveil
**14.3** Jouets d'éveil · Jouets éducatifs · Poupées · Voitures & circuits ·
Jeux d'extérieur · Peluches · Jeux de construction

---

## 15. Atizana & Kado — Artisanat & cadeaux — *Crafts & gifts*

> ⭐ Département à **fort potentiel diaspora** : produits introuvables ailleurs,
> panier moyen élevé, justifie le rail de paiement en devise forte.

| # | Kreyòl | Français | English |
|---|---|---|---|
| 15.1 | Atizana ayisyen | Artisanat haïtien | Haitian crafts |
| 15.2 | Tablo & atizay | Art & tableaux | Art & paintings |
| 15.3 | Kado & fèt | Cadeaux & fêtes | Gifts & party |
| 15.4 | Enstriman mizik | Instruments de musique | Musical instruments |

**15.1** Fer découpé · Bois sculpté · Vannerie & paille · Papier mâché ·
Pierre & corne · Textiles artisanaux · Poterie
**15.2** Peintures haïtiennes · Sculptures · Photographies d'art · Cadres
**15.3** Décoration de fête · Ballons · Emballages cadeaux · Cartes ·
Coffrets · Articles de mariage
**15.4** Tambours · Guitares · Claviers · Percussions · Accessoires musique

---

## 16. Dijital & Sèvis — Digital & services — *Digital & services*

> **Département de continuité** : préserve l'existant (`product_kind` =
> `'fichier'` / `'service'`) et le service de recharge. Ne pas supprimer lors du
> pivot vers le physique — ce sont des produits déjà vendus.

| # | Kreyòl | Français | English |
|---|---|---|---|
| 16.1 | Pwodwi dijital | Produits digitaux | Digital products |
| 16.2 | Sèvis pwofesyonèl | Services professionnels | Professional services |
| 16.3 | Rechaj telefòn | Recharge téléphone | Mobile top-up |

**16.1** E-books · Formations & cours · Templates & modèles · Musique & sons ·
Photos & illustrations · Logiciels
**16.2** Design graphique · Marketing & réseaux sociaux · Développement web ·
Photo & vidéo · Traduction · Cours particuliers · Comptabilité · Événementiel
**16.3** Digicel · Natcom *(alimenté par le catalogue Reloadly — non éditable
par les vendeurs)*

---

## Notes techniques (pour le chantier B, après `go`)

1. **Compatibilité véhicule (dép. 1) — ✅ arbitré : la voie du milieu.**

   Ni recherche textuelle seule (taux d'erreur de référence élevé — et **sans
   COD, l'acheteur a déjà payé** : chaque mauvaise pièce devient un litige de
   remboursement), ni base véhicules type **TecDoc** (inexistante pour le parc
   haïtien, hors de proportion ici).

   **Retenu** — champ de compatibilité **structuré et obligatoire** sur
   l'annonce, saisi par le vendeur :
   ```
   compatibilite: [{ marque, modele, annee_debut, annee_fin }, …]
   ```
   plus un sélecteur **« mon véhicule »** côté acheteur qui filtre dessus.

   - **Aucune base externe.** Liste curée de **30 à 40 combinaisons** couvrant
     le parc réel haïtien : **Toyota, Nissan, Hyundai, Suzuki** (auto) ·
     **Haojue, Bajaj, Sanya, TVS** (moto).
   - Capte l'essentiel de la valeur pour une fraction du coût ; la structure
     permet d'ajouter un fitment complet plus tard **sans migration
     destructive**.

   ⚠️ **Corollaire impératif** : la **politique de retour sur pièces** doit être
   écrite **AVANT** l'ouverture du département — pas après. Prérequis bloquant,
   pas une finition.
2. **Variantes** — surtout dép. 3, 4 (taille/couleur), 6 (contenance),
   2 (capacité). Le modèle de variantes de §5 les couvre.
3. **Produits périssables** (8.1, 9.1) — incompatibles avec un délai de
   livraison de 48 h. Soit on restreint 9.1 à la livraison intra-ville, soit on
   n'active pas ce département au lancement. → **Décision attendue.**
4. **Produits interdits** — une liste noire est nécessaire avant l'activation
   des dép. 11 (médicaments) et 9.4 (pesticides). Également : armes, alcool
   (selon ta politique), contrefaçons.
5. **Poids & dimensions** — la grille de frais de port par zone (§7.4) suppose
   une classe de poids par produit. Les dép. 1 (pièces lourdes) et 10.1/10.3
   (mobilier, électroménager) sortiront des grilles standard : prévoir une
   classe « encombrant ».
6. **Structure en base** — table unique `zabelie_categories` auto-référencée
   (`parent_id`, `level`, `slug`, `label_kr/fr/en`, `active`, `position`),
   contrainte `level <= 3`, RLS lecture publique / écriture `service_role`.
   Le `slug` sert d'URL : `/kategori/otomobil-moto/pyes-detache-oto`.

---

## Ce qu'il reste à obtenir avant la migration de seed

| # | Point | État |
|---|---|---|
| 1 | Périmètre d'activation | ✅ **Arbitré** — vague 1 / vague 2 ci-dessus |
| 2 | Fitment véhicule | ✅ **Arbitré** — champ structuré + liste curée |
| 3 | Validation de la liste des 16 départements | ❓ Retraits / ajouts / renommages éventuels |
| 4 | **Politique de retour sur pièces** | ⛔ **BLOQUANT** — prérequis à l'ouverture du dép. 1 |
| 5 | Périssables (dép. 9) | ⏸️ Sans objet en vague 1 (département inactif) |
| 6 | Relecture Kreyòl par un locuteur natif | ❓ Ou accord pour publier avec la mention « traduction à valider », comme le reste de l'i18n |

⛔ **Rappel de gel** : cette migration de seed ne sera pas écrite avant la levée
du préalable juridique (`docs/17-DOSSIER-BRH-RETENTION.md`), qui bloque
l'ensemble des chantiers.
