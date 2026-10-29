/**
 * Supabase simulé (PostgREST + Auth) pour le parcours PRODUIT PHYSIQUE.
 *
 * Pourquoi un stub et pas le mode démo : le mode démo n'a pas de base, donc
 * aucun produit `physical` — c'est précisément le trou que ces tests
 * comblent. Aucun `kind = 'physical'` n'avait jamais traversé le flux.
 *
 * Le produit est PUBLIÉ de force : depuis la décision « la saisie crée un
 * brouillon », un physique ne peut plus atteindre le checkout par le chemin
 * normal. Le fixture reproduit donc l'état qui existera après publication
 * explicite par le porteur — c'est celui qu'il faut tester.
 *
 * Le serveur enregistre toutes les ÉCRITURES sur `orders` : c'est ce qui
 * permet d'affirmer qu'une commande physique n'est jamais passée à
 * `delivered`. Les relire via GET /__ecritures.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { jointureAmbigue, REFUS_PGRST201, tableDe } from "./jointures-postgrest.mjs";
import { createMediaReviewFixture } from "./media-review.mjs";

const PORT = Number(process.env.STUB_PORT ?? 15421);
const BOUTIQUE_FIXTURE = process.env.BOUTIQUE_FIXTURE === "true";
const POLICY_ACCEPTANCE_FIXTURE = [
  { policy_version: "cgu-v1", accepted_at: "2026-10-05T00:00:00Z" },
  { policy_version: "confidentialite-v5", accepted_at: "2026-10-05T00:00:00Z" },
];
const digitalFacts = new Map();
const digitalStudios = new Map();
const digitalProgress = new Map();
// Publication physique : journal isolé par titre de scénario, sans reset
// partagé entre tests parallèles. Les contraintes SQL restent testées en CI.
const physicalCreationRows = [];
const physicalCreationWrites = [];
const physicalCreationVariants = [];
const physicalCreationStocks = [];
const physicalCreationExtensions = [];
const physicalCreationUploads = [];
const PHYSICAL_CREATION_PREFIX = "Reprise physique ";
// Chaque test profil crée deux UUID propres ; aucun état/reset global partagé.
const profileIdentityScenarios = new Map();
const boutikVisites = [];
const profileIdentityActors = new Map();
const HISTORY_ID = "88888888-8888-8888-8888-000000000100";
const HISTORY_ERROR_ID = "88888888-8888-8888-8888-000000000101";
const DIGITAL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa001";
const RELEASE_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa011";
const RELEASE_2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa012";
const ASSET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa021";
const LESSON_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa031";
const digitalFile = { id: ASSET_ID, storage_path: "studio/private.pdf", file_name: "guide.pdf", size_bytes: 1024 };
const digitalLessons = [{ id: LESSON_ID, chapter: "Démarrer", title: "Méthode complète", body: "PRIVATE_SECRET: votre méthode achetée", assetId: ASSET_ID, free: false }, { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa032", chapter: "Démarrer", title: "Découverte", body: "FREE_SAMPLE: extrait consultable", assetId: "", free: true }];
const digitalReleases = [1, 2].map(version => ({ id: version === 1 ? RELEASE_1 : RELEASE_2, product_id: DIGITAL_ID, version, title: `Formation version ${version}`, created_at: "2026-09-08T00:00:00Z", details: { license: version === 1 ? "Licence originale conservée" : "Nouvelle licence" }, manifest: { mode: "course", preview: "Un extrait avant votre achat", outcomes: "Construire son premier projet", prerequisites: "Un navigateur", include_updates: version === 1, faq: [{ question: "Où lire les leçons ?", answer: "Dans votre bibliothèque." }], files: [{ id: ASSET_ID, file_name: "guide.pdf", size_bytes: 1024 }], lessons: digitalLessons.map(l => ({ id: l.id, chapter: l.chapter, title: l.title, body: l.free ? l.body : "", free: l.free })) }, payload: { files: [digitalFile], lessons: digitalLessons } }));

export const BUYER_ID = "11111111-1111-1111-1111-111111111111";
export const SELLER_ID = "22222222-2222-2222-2222-222222222222";
export const ORDER_ID = "33333333-3333-3333-3333-333333333333";
export const PRODUCT_ID = "44444444-4444-4444-4444-444444444444";
export const SLUG = "filtre-huile-corolla";

const PNG_FIXTURE = readFileSync(new URL("./cover.png", import.meta.url));
const COVER_PNG = "data:image/png;base64," + PNG_FIXTURE.toString("base64");
const PRODUCT = {
  id: PRODUCT_ID,
  slug: SLUG,
  title: "Filtre à huile Corolla",
  description: "Filtre à huile pour Toyota Corolla.",
  kind: "physical",
  category: "Pièces détachées auto",
  price_htg: 1500,
  sales_count: 0,
  rating_count: 0,
  rating_sum: 0,
  seller_id: SELLER_ID,
  delivery_days: null,
  service_includes: null,
  cover_url: COVER_PNG,
  status: "published",
  in_stock: true,
  seller: { display_name: "Garaj Petyonvil" },
};
const mediaReviewFixture = createMediaReviewFixture({ baseProduct: PRODUCT, sellerId: SELLER_ID });


/* ── Essayage virtuel (docs/74, tâche 4.5) ─────────────────────────────────
 * Une robe d'un vendeur pilote, au sous-rayon « wob ». Les comptes d'essai
 * sont choisis pour leur groupe de mesure (lib/essayage/regles.ts) : …001 est
 * au témoin, les autres à l'essai. Les fonctions d'essayage passent par la
 * clé de service : le scénario se lit donc à l'identifiant de l'acheteur,
 * jamais au jeton. Aucune photo n'arrive ici : elle va du serveur Next au
 * fournisseur « simulation », qui ne sort pas de la machine. */
export const ROBE_ID = "e55a1000-0000-4000-8000-0000000000a1";
export const ROBE_SLUG = "wob-lakay-test";
const ROBE_VENDEUR = "e55a1000-0000-4000-8000-000000000100";
const ROBE = { ...PRODUCT, id: ROBE_ID, slug: ROBE_SLUG, title: "Wòb lakay", category: "Mode", seller_id: ROBE_VENDEUR, seller: { display_name: "Atelye Mod" }, sous_rayon: { slug: "wob" } };
/** En production, les photos principales sont en https (Storage Supabase) ; l'essayage refuse le reste. */
const ROBE_COUVERTURE_HTTPS = "https://exemple.supabase.co/storage/v1/object/public/covers/wob-lakay.png";
const ESSAYAGE_COMPTES = new Set([1, 2, 3, 4, 5, 6, 7].map((n) => `e55a1000-0000-4000-8000-${String(n).padStart(12, "0")}`));
const ESSAYAGE_REFUS = { "e55a1000-0000-4000-8000-000000000004": "quota", "e55a1000-0000-4000-8000-000000000005": "pause" };
const essayage = { essais: new Map(), expositions: new Map() };
const jourHaiti = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Port-au-Prince" });

const OFFER_SOURCE = "44444444-4444-4444-4444-444444444444";
const OFFER_TARGETS = ["66666666-6666-6666-6666-666666666661","66666666-6666-6666-6666-666666666662","66666666-6666-6666-6666-666666666663"];
const OFFER_IDS = ["77777777-7777-7777-7777-777777777771","77777777-7777-7777-7777-777777777772","77777777-7777-7777-7777-777777777773"];
const offerProducts = [
 { ...PRODUCT, id: OFFER_SOURCE, price_htg: 1200, title: "Kit de départ", slug: "kit-depart", cover_url: null },
 ...OFFER_TARGETS.map((id,i) => ({ ...PRODUCT,id,title:["Kit complet","Accessoire pratique","Kit économique"][i],slug:["kit-complet","accessoire-pratique","kit-economique"][i],price_htg:[2400,700,600][i],cover_url:null })),
];
let linkedOffers = [];
const offerOrders = [];
let offerOrderStatus = "paid";
let recommendationHistory = false;
const automaticPreferences = new Map();
function offersFixture(req,url,send,single) {
 const publicRows = (source) => linkedOffers.filter(o=>o.source_product_id===source).map(o => {
   const p=offerProducts.find(p=>p.id===o.target_product_id);return {...o,title:p.title,slug:p.slug,price_htg:p.price_htg,product_kind:p.kind};
 });
 const automaticRows = source => recommendationHistory && automaticPreferences.get(source)!==false && source===OFFER_SOURCE
   ? OFFER_TARGETS.filter(id=>!linkedOffers.some(o=>o.source_product_id===source&&o.target_product_id===id)).map(id=>{
     const p=offerProducts.find(x=>x.id===id);return {id:null,source_product_id:source,target_product_id:id,offer_kind:"cross_sell",origin:"purchases",title:p.title,slug:p.slug,price_htg:p.price_htg,product_kind:p.kind};
   }) : [];
 const body = callback => { let value="";req.on("data",c=>value+=c);req.on("end",()=>callback(JSON.parse(value||"{}"))); };
 if(url.pathname==="/__offers-reset"){linkedOffers=[];offerOrders.length=0;offerOrderStatus="paid";recommendationHistory=false;automaticPreferences.clear();send(200,{});return true;}
 if(url.pathname==="/__recommendations-history"){body(p=>{recommendationHistory=p.enough===true;send(200,{});});return true;}
 if(url.pathname==="/rest/v1/rpc/zabelie_product_recommendations"){body(p=>send(200,automaticRows(p.p_product_id)));return true;}
 if(url.pathname==="/rest/v1/rpc/zabelie_recommendation_stats"){send(200,[]);return true;}
 if(url.pathname==="/__offers-orders"){send(200,offerOrders);return true;}
 if(url.pathname==="/__offers-status"){body(p=>{offerOrderStatus=p.status;send(200,{});});return true;}
 if(url.pathname==="/rest/v1/products"){
   const id=eq(url,"id"),slug=eq(url,"slug"),seller=eq(url,"seller_id");
   single(offerProducts.filter(p=>(!id||p.id===id)&&(!slug||p.slug===slug)&&(!seller||p.seller_id===seller)).map(p=>({...p,zabelie_auto_recommendations:automaticPreferences.get(p.id)??true})));return true;
 }
 if(url.pathname==="/rest/v1/zabelie_product_offers"){send(200,linkedOffers);return true;}
 if(url.pathname==="/rest/v1/rpc/zabelie_offer_stats"){send(200,linkedOffers.map(o=>({offer_id:o.id,confirmed:0})));return true;}
 if(url.pathname==="/rest/v1/rpc/zabelie_offers_public"){body(p=>send(200,publicRows(p.p_product_id)));return true;}
 if(["/rest/v1/rpc/zabelie_save_product_offers","/rest/v1/rpc/zabelie_configure_product_offers"].includes(url.pathname)){
   body(p=>{
     const source=offerProducts.find(x=>x.id===p.p_product_id);
     if(p.p_user_id!==SELLER_ID||!source)return send(200,{ok:false,reason:"not_owner"});
     const kinds=["upsell","cross_sell","downsell"],targets=Object.values(p.p_targets).filter(Boolean);
     if(new Set(targets).size!==targets.length||targets.some(id=>!OFFER_TARGETS.includes(id)))return send(200,{ok:false,reason:"invalid"});
     if(typeof p.p_recommendations_enabled==="boolean")automaticPreferences.set(source.id,p.p_recommendations_enabled);
     linkedOffers=linkedOffers.filter(o=>o.source_product_id!==source.id).concat(kinds.flatMap((kind,i)=>p.p_targets[kind]?[{id:OFFER_IDS[i],source_product_id:source.id,target_product_id:p.p_targets[kind],offer_kind:kind,active:true}]:[]));
     return send(200,{ok:true});
   });return true;
 }
 if(url.pathname==="/rest/v1/zabelie_product_variants"){
   const product=eq(url,"product_id"),id=eq(url,"id");
   send(200,offerProducts.map((p,i)=>({id:"88888888-8888-8888-8888-88888888888"+i,product_id:p.id,price_htg:p.price_htg,options:{},active:true,position:0,zabelie_stock:{quantity_available:4}})).filter(v=>(!product||v.product_id===product)&&(!id||v.id===id)));return true;
 }
 if(url.pathname==="/rest/v1/rpc/zabelie_reserve_stock"){send(200,{ok:true});return true;}
 if(url.pathname==="/rest/v1/orders"){
   if(req.method==="POST"){body(p=>{const offer=linkedOffers.find(o=>o.id===p.zabelie_offer_id&&o.target_product_id===p.product_id);const source=!offer&&automaticRows(p.zabelie_recommendation_source_id).some(o=>o.target_product_id===p.product_id)?p.zabelie_recommendation_source_id:null;const row={id:ORDER_ID,...p,zabelie_offer_id:offer?.id??null,zabelie_recommendation_source_id:source};offerOrders.push(row);single([row]);});return true;}
   if(req.method==="GET"){const buyer=eq(url,"buyer_id"),id=eq(url,"id");
     return single(id===ORDER_ID&&(!buyer||buyer===BUYER_ID)?[{...ORDER,status:offerOrderStatus,product_id:OFFER_SOURCE,buyer_id:BUYER_ID}]:[]),true;}
 }
 return false;
}

const discountOrders = [];
const discountVariants = [
  { id: "55555555-5555-5555-5555-555555555555", options: { variante: "M" }, price_htg: 2000, compare_at_htg: null, position: 0 },
  { id: "55555555-5555-5555-5555-555555555556", options: { variante: "L" }, price_htg: 2500, compare_at_htg: null, position: 1 },
].map(v => ({ ...v, product_id: PRODUCT_ID, active: true, zabelie_stock: { quantity_available: 4 } }));

const SHOP_PRODUCTS = [
  PRODUCT,
  { ...PRODUCT, id: DIGITAL_ID, slug: "formation-studio-test", title: "Formation studio", description: "Apprenez à préparer votre première offre avec un guide et des leçons.", kind: "fichier", cover_url: null, product_assets: [{ id: ASSET_ID }] },
  { ...PRODUCT, id: "66666666-6666-6666-6666-666666666666", slug: "service-boutique-test", title: "Conseil pour votre projet", description: "Une consultation pour organiser vos prochaines étapes.", kind: "service", cover_url: null, delivery_days: 2, service_includes: ["Une consultation"] },
].map(product => ({ ...product, seller: { display_name: "Atelye Lakay" } }));
const ORDER = {
  id: ORDER_ID,
  order_ref: "ZB-260720-TESTX",
  buyer_id: BUYER_ID,
  product_id: PRODUCT_ID,
  status: "paid",
  amount_htg: 1500,
  created_at: "2026-07-20T10:00:00Z",
  product: { id: PRODUCT_ID, title: PRODUCT.title, slug: SLUG, kind: "physical" },
};

/** Écritures observées sur `orders` — la preuve que rien n'a été « livré ». */
const ecritures = [];
const collectionsBySession = new Map();
const commitments = new Map();
const giftWrites = [];
const giftOrders = new Map();
const giftPayments = new Map();
const GIFT_PRODUCT = "99999999-9999-9999-9999-999999999990";

const eq = (url, key) => {
  const v = url.searchParams.get(key);
  return v?.startsWith("eq.") ? decodeURIComponent(v.slice(3)) : null;
};

const PIXEL_SELLER = "99999999-9999-4999-8999-999999999991";
const PIXEL_PRODUCT = "99999999-9999-4999-8999-999999999992";
const webhookPoints = [];
const sansSecret = (p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== "secret"));
const apiKeys = [];
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const send = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const single = (rows) =>
    (req.headers.accept ?? "").includes("pgrst.object")
      ? rows.length
        ? send(200, rows[0])
        : send(406, { code: "PGRST116", message: "no rows" })
      : send(200, rows);

  if (url.pathname === "/__profile-identity") {
    if (req.method === "POST") {
      let text = ""; req.on("data", chunk => text += chunk);
      return req.on("end", () => {
        const input = JSON.parse(text);
        if (profileIdentityScenarios.has(input.scenario)) return send(409, { error: "scenario exists" });
        const profiles = [input.actorA, input.actorB].map((id, index) => ({
          id, display_name: `Profil ${index ? "B" : "A"} ${input.scenario.slice(0, 8)}`,
          bio: `Présentation fictive ${index ? "B" : "A"}`, avatar_url: null,
          country_code: index && !input.withZones ? "US" : "HT", region_code: index && !input.withZones ? null : "HT-OU",
          zone_id: null, pwen_repe: `Repère fictif ${index ? "B" : "A"}`,
          role: "creator", tier: "standard", boutik_slug: null, suspended_at: null, suspended_reason: null,
        }));
        const departmentId = crypto.randomUUID();
        const scenario = { profiles, writes: [], slugReads: [], ...(input.withZones ? {
          zones: [
            { id: departmentId, parent_id: null, level: "depatman", slug: "depatman-fictif", label_kr: "Depatman tès", label_fr: "Département fictif", label_en: "Test department", label_es: "Departamento ficticio" },
            { id: crypto.randomUUID(), parent_id: departmentId, level: "komin", slug: "komin-fictive", label_kr: "Komin tès", label_fr: "Commune fictive", label_en: "Test commune", label_es: "Comuna ficticia" },
          ], zoneRequests: [],
        } : {}) };
        if (input.deliveryInfo === true) {
          scenario.deliveryInfo = {
            rows: profiles.map((profile, index) => ({ user_id: profile.id,
              full_name: `Destinataire fictif ${index ? "B" : "A"} ${input.scenario.slice(0, 8)}`,
              phone: index ? "+1 555 000 0002" : "+509 3700 0001",
              adres_liv: `Adresse privée fictive ${index ? "B" : "A"} ${input.scenario.slice(0, 8)}` })),
            reads: [], upserts: [],
          };
        }
        if (input.payouts === true) {
          // Soldes strictement fictifs : ce mode observe le vrai handler et
          // ses appels RPC, sans reproduire les contrôles financiers SQL.
          scenario.payouts = {
            wallets: profiles.map((profile, index) => ({ id: crypto.randomUUID(), owner_id: profile.id,
              balance_htg: index ? 9000 : 7000, pending_htg: 0 })),
            requests: [], rpcs: [], reads: [], refusalOnce: input.payoutRefusalOnce === true,
          };
        }
        if (input.coupons === true) {
          const products = profiles.map((profile, index) => ({ ...PRODUCT, id: crypto.randomUUID(), seller_id: profile.id,
            title: `Produit fictif ${index ? "B" : "A"} ${input.scenario.slice(0, 8)}`, slug: `coupon-${profile.id}` }));
          // E/S locales seulement : les vrais handlers choisissent le vendeur.
          // Ces lignes ne prouvent ni les contraintes, ni la RLS PostgreSQL.
          scenario.coupons = { products, rows: profiles.map((profile, index) => ({ id: crypto.randomUUID(), seller_id: profile.id,
            code: index ? "BASE-B" : "BASE-A", percent: index ? 20 : 15, product_id: products[index].id,
            max_uses: index ? 8 : 5, uses: 0, expires_at: "2028-01-01T00:00:00Z", active: true, created_at: "2026-10-05T10:00:00Z" })),
            reads: [], inserts: [], updates: [], refusalOnce: input.couponRefusalOnce === true };
        }
        if (input.pixels === true) {
          // Deux configurations non vides, isolées par scénario. Le double
          // observe les E/S du vrai PUT ; aucun garde d'identité n'est copié.
          scenario.pixels = { rows: profiles.map((profile, index) => ({ seller_id: profile.id,
            meta_pixel_id: index ? "223456789012345" : "123456789012345",
            google_tag_id: index ? "G-B123456789" : "G-A123456789",
            tiktok_pixel_id: index ? "C5ABCDEF0123456789AB" : "C4ABCDEF0123456789AB" })),
            reads: [], upserts: [] };
        }
        if (input.kyc === true) {
          const documents = profiles.map((profile, index) => {
            const id = crypto.randomUUID();
            return { id, user_id: profile.id, kind: index ? "paspo" : "cin", storage_path: `${profile.id}/${id}.png`, created_at: "2026-10-05T10:00:00Z" };
          });
          scenario.kyc = {
            submissions: profiles.map((profile, index) => ({ user_id: profile.id, status: "pending",
              submitted_at: `2026-10-05T1${index}:00:00.000001Z`, decided_at: null, decided_by: null, note_admin: null })),
            documents, objects: documents.map(doc => ({ user_id: doc.user_id, bucket: "kyc-documents", path: doc.storage_path,
              sha256: createHash("sha256").update(PNG_FIXTURE).digest("hex"), size: PNG_FIXTURE.length, contentType: "image/png" })),
            reads: [], uploads: [], rpcs: [], removals: [],
          };
        }
        if (["history", "empty"].includes(input.accountClosure)) {
          scenario.accountClosure = {
            mode: input.accountClosure, events: [], profileReads: [],
            counts: Object.fromEntries(profiles.map(profile => [profile.id, { purchases: 0, sales: 0, kyc: 0, acceptances: input.accountClosure === "history" ? 2 : 0 }])),
            authUsers: profiles.map((profile, index) => ({ id: profile.id, email: `fictif-${profile.id}@example.test`,
              user_metadata: { name: `Compte fictif ${index ? "B" : "A"}`, phone: `Téléphone fictif ${index ? "B" : "A"}` }, deleted: false, ban_duration: null })),
            kycSubmissions: input.accountClosure === "history" ? profiles.map(profile => ({ user_id: profile.id, status: "pending", note_admin: null, decided_at: null })) : [],
            favorites: profiles.map(profile => ({ user_id: profile.id, product_id: PRODUCT_ID })),
            follows: profiles.map(profile => ({ user_id: profile.id, seller_id: SELLER_ID })),
          };
        }
        if (input.clients === true || input.clients === "vide") {
          // PR-Z3 (docs/75 §5.C) : ventes fictives du vendeur A, PIÈGES COMPRIS
          // (impayées, paiement d'essai, gratuite, vente d'un autre vendeur).
          // Le stub ne filtre RIEN : c'est la page qui doit écarter les pièges.
          const jour = 86_400_000, il = (j) => new Date(Date.now() - j * jour).toISOString();
          const [sellerA, sellerB] = profiles.map(p => p.id);
          const buyers = Array.from({ length: 8 }, () => crypto.randomUUID());
          const p1 = crypto.randomUUID(), p2 = crypto.randomUUID(), pB = crypto.randomUUID();
          const row = (buyer, product, title, seller, amount, status, live, jours) => ({ buyer_id: buyer, product_id: product,
            amount_htg: amount, status, zabelie_payment_is_live: live, created_at: il(jours), products: { seller_id: seller, title } });
          const sak = "Sak an pay fictif", liv = "Liv kreyòl fictif";
          scenario.clients = {
            buyers, queries: [], deliveryReads: [],
            orders: input.clients === "vide" ? [] : [
              row(buyers[0], p1, sak, sellerA, 1500, "paid", true, 5),
              row(buyers[0], p1, sak, sellerA, 1500, "delivered", true, 40),
              row(buyers[1], p2, liv, sellerA, 800, "paid", true, 60),
              row(buyers[2], p1, sak, sellerA, 1500, "paid", true, 200),
              row(buyers[3], p1, sak, sellerA, 1500, "pending", true, 1),
              row(buyers[4], p1, sak, sellerA, 1500, "failed", true, 1),
              row(buyers[5], p1, sak, sellerA, 1500, "paid", false, 1),
              row(buyers[6], p1, sak, sellerA, 0, "paid", true, 1),
              row(buyers[7], pB, "Produit d'un autre vendeur fictif", sellerB, 9999, "paid", true, 1),
            ],
            delivery: [{ user_id: buyers[0], full_name: "Wilson Pierre-Fictif", phone: "+509 3700 0009", adres_liv: "Adresse privée fictive C1" }],
          };
        }
        if (input.signaux === true || input.signaux === "fuite") {
          // PR-Z4 : réponse de zabelie_vendeur_signaux (0156). « fuite » rend un
          // compte EXACT de 2 paniers, que la page doit refuser (section tue).
          scenario.signaux = { reads: [], reponse: { fenetre_jours: 30, abonnes: 2,
            paniers: input.signaux === "fuite"
              ? [{ titre: "Batri fiktif", paniers: 2, moins_de_3: false }]
              : [{ titre: "Panno solè fiktif", paniers: 4, moins_de_3: false }, { titre: "Batri fiktif", paniers: null, moins_de_3: true }],
            recherches: [{ terme: "konvètisè", sessions: 5, mon_rayon: true }, { terme: "jeneratè", sessions: 6, mon_rayon: false }] } };
        }
        if (input.visites === true) {
          // PR-Z2 : 60 + 40 vues dans les 30 jours, et une ligne de 45 jours
          // (999 vues) que la page doit écarter d'elle-même : le stub ne filtre pas.
          const jourHaiti = (j) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Port-au-Prince", year: "numeric", month: "2-digit", day: "2-digit" })
            .format(new Date(Date.now() - j * 86_400_000));
          scenario.visites = { reads: [], rows: [
            { jour: jourHaiti(1), vues: 60 }, { jour: jourHaiti(10), vues: 40 }, { jour: jourHaiti(45), vues: 999 },
          ] };
        }
        profileIdentityScenarios.set(input.scenario, scenario);
        for (const profile of profiles) profileIdentityActors.set(profile.id, { profile, scenario });
        return send(200, scenario);
      });
    }
    return send(200, profileIdentityScenarios.get(url.searchParams.get("scenario")) ?? null);
  }
  const identityProfile = url.pathname === "/rest/v1/profiles" ? profileIdentityActors.get(eq(url, "id")) : null;
  if (identityProfile) {
    const { profile, scenario } = identityProfile;
    if (req.method === "PATCH") {
      let text = ""; req.on("data", chunk => text += chunk);
      return req.on("end", () => {
        const patch = JSON.parse(text);
        if (url.searchParams.get("boutik_slug") === "is.null" && profile.boutik_slug !== null) return send(200, []);
        scenario.writes.push({ id: profile.id, kind: Object.hasOwn(patch, "boutik_slug") ? "slug" : "profile", patch });
        Object.assign(profile, patch);
        if (scenario.accountClosure) {
          scenario.accountClosure.events.push({ actorId: profile.id, kind: "profile.update", patch });
          return single([profile]);
        }
        return send(200, []);
      });
    }
    if (scenario.payouts && req.method === "GET") {
      scenario.payouts.reads.push({ table: "profiles", owner: profile.id,
        select: url.searchParams.get("select"), rows: [{ ...profile }] });
      return single([profile]);
    }
    if (scenario.accountClosure) scenario.accountClosure.profileReads.push({ actorId: profile.id, select: url.searchParams.get("select") });
    if (scenario.kyc) scenario.kyc.reads.push({ table: "profiles", owner: profile.id, select: url.searchParams.get("select"),
      serviceRole: req.headers.authorization === "Bearer cle-service-de-test", rows: [{ ...profile }] });
    if (scenario.coupons) scenario.coupons.reads.push({ table: "profiles", owner: profile.id, select: url.searchParams.get("select"),
      serviceRole: req.headers.authorization === "Bearer cle-service-de-test", rows: [{ ...profile }] });
    if (scenario.pixels) scenario.pixels.reads.push({ table: "profiles", owner: profile.id, select: url.searchParams.get("select"),
      serviceRole: req.headers.authorization === "Bearer cle-service-de-test", rows: [{ ...profile }] });
    if (url.searchParams.get("select") === "boutik_slug") scenario.slugReads.push({ id: profile.id });
    return single([profile]);
  }

  // PR-Z4 : signaux de demande, appelés par la SESSION du vendeur. Sans
  // `signaux` dans le scénario, la fonction répond ABSENTE (0156 pas encore
  // appliquée), comme le vrai PostgREST.
  if (url.pathname === "/rest/v1/rpc/zabelie_vendeur_signaux") {
    const tokenId = /profile-identity-([0-9a-f-]{36})/.exec(req.headers.authorization ?? "")?.[1];
    const acteur = profileIdentityActors.get(tokenId);
    const s = acteur?.scenario.signaux;
    if (!s) return send(404, { code: "PGRST202", message: "Could not find the function public.zabelie_vendeur_signaux without parameters in the schema cache" });
    s.reads.push({ tokenActorId: tokenId, serviceRole: req.headers.authorization === "Bearer cle-service-de-test" });
    return send(200, s.reponse);
  }

  // PR-Z2 : lecture des visites par le vendeur. Sans `visites` dans le
  // scénario, la table répond ABSENTE (0155 pas encore appliquée), comme le
  // vrai PostgREST : c'est le cas que la page doit taire.
  const visitesActor = url.pathname === "/rest/v1/zabelie_boutik_visites" && req.method === "GET"
    ? profileIdentityActors.get(eq(url, "seller_id")) : null;
  if (visitesActor) {
    const v = visitesActor.scenario.visites;
    if (!v) return send(404, { code: "PGRST205", message: "Could not find the table 'public.zabelie_boutik_visites' in the schema cache" });
    const tokenId = /profile-identity-([0-9a-f-]{36})/.exec(req.headers.authorization ?? "")?.[1];
    v.reads.push({ tokenActorId: profileIdentityActors.has(tokenId) ? tokenId : null,
      serviceRole: req.headers.authorization === "Bearer cle-service-de-test", params: Object.fromEntries(url.searchParams) });
    return send(200, v.rows);
  }

  // PR-Z3 : « Mes clients ». Toutes les ventes du scénario, sans filtre ; les
  // filtres DEMANDÉS sont consignés pour que le spec les vérifie aussi.
  const clientsActor = url.pathname === "/rest/v1/orders" && req.method === "GET"
    ? profileIdentityActors.get(eq(url, "products.seller_id")) : null;
  if (clientsActor?.scenario.clients) {
    const c = clientsActor.scenario.clients;
    c.queries.push({ sellerId: eq(url, "products.seller_id"), params: Object.fromEntries(url.searchParams),
      serviceRole: req.headers.authorization === "Bearer cle-service-de-test" });
    return send(200, c.orders);
  }
  const clientsBuyers = url.pathname === "/rest/v1/zabelie_delivery_info" && req.method === "GET"
    && url.searchParams.get("user_id")?.startsWith("in.(") ? url.searchParams.get("user_id").slice(4, -1).split(",") : null;
  const clientsDelivery = clientsBuyers && [...profileIdentityScenarios.values()]
    .find(s => s.clients?.buyers.some(b => clientsBuyers.includes(b)))?.clients;
  if (clientsDelivery) {
    const tokenId = /profile-identity-([0-9a-f-]{36})/.exec(req.headers.authorization ?? "")?.[1];
    clientsDelivery.deliveryReads.push({ select: url.searchParams.get("select"), tokenActorId: profileIdentityActors.has(tokenId) ? tokenId : null,
      serviceRole: req.headers.authorization === "Bearer cle-service-de-test" });
    const cols = (url.searchParams.get("select") ?? "").split(",").map(s => s.trim());
    return send(200, clientsDelivery.delivery.filter(r => clientsBuyers.includes(r.user_id))
      .map(r => Object.fromEntries(cols.filter(k => k in r).map(k => [k, r[k]]))));
  }

  const payoutOwner = eq(url, "owner_id") ?? eq(url, "seller_id");
  const payoutWalletId = eq(url, "wallet_id");
  const payoutScenario = profileIdentityActors.get(payoutOwner)?.scenario.payouts
    ?? [...profileIdentityScenarios.values()].find(scenario => scenario.payouts?.wallets.some(wallet => wallet.id === payoutWalletId))?.payouts;
  if (payoutScenario && req.method === "GET") {
    const table = url.pathname.slice("/rest/v1/".length);
    const tables = ["wallets", "payouts", "products", "escrow_entries", "wallet_transactions"];
    if (tables.includes(table)) {
      const rows = table === "wallets" ? payoutScenario.wallets.filter(wallet => wallet.owner_id === payoutOwner)
        : table === "payouts" ? payoutScenario.requests.filter(row => row.wallet_id === payoutWalletId) : [];
      payoutScenario.reads.push({ table, owner: payoutOwner, wallet_id: payoutWalletId,
        select: url.searchParams.get("select"), rows: rows.map(row => ({ ...row })) });
      return single(rows);
    }
  }
  if (url.pathname === "/rest/v1/rpc/zabelie_request_payout" && req.method === "POST") {
    let text = ""; req.on("data", chunk => text += chunk);
    return req.on("end", () => {
      const args = JSON.parse(text), state = profileIdentityActors.get(args.p_user_id)?.scenario.payouts;
      if (!state) return single([]);
      const wallet = state.wallets.find(row => row.owner_id === args.p_user_id);
      let result;
      if (state.refusalOnce) {
        state.refusalOnce = false;
        result = { ok: false, reason: "sous_minimum", min_htg: 500 };
      } else {
        const id = crypto.randomUUID();
        wallet.balance_htg -= args.p_amount_htg;
        state.requests.push({ id, wallet_id: wallet.id, amount_htg: args.p_amount_htg, status: "requested" });
        result = { ok: true, payout_id: id, balance_htg: wallet.balance_htg, frais_ia_regles_htg: 0 };
      }
      state.rpcs.push({ name: "zabelie_request_payout", args,
        serviceRole: req.headers.authorization === "Bearer cle-service-de-test", result });
      return send(200, result);
    });
  }

  const kycOwner = eq(url, "user_id"), kycState = profileIdentityActors.get(kycOwner)?.scenario.kyc;
  if (kycState && req.method === "GET" && ["/rest/v1/zabelie_kyc_submissions", "/rest/v1/zabelie_kyc_documents"].includes(url.pathname)) {
    const table = url.pathname.slice("/rest/v1/".length), select = url.searchParams.get("select") ?? "*";
    const rows = (table === "zabelie_kyc_submissions" ? kycState.submissions : kycState.documents).filter(row => row.user_id === kycOwner)
      .map(row => select === "*" ? { ...row } : Object.fromEntries(select.split(",").map(key => key.trim()).filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]])));
    kycState.reads.push({ table, owner: kycOwner, select, serviceRole: req.headers.authorization === "Bearer cle-service-de-test", rows });
    return single(rows);
  }
  const kycUpload = /^\/storage\/v1\/object\/kyc-documents\/([^/]+)\/(.+)$/.exec(url.pathname);
  const uploadState = profileIdentityActors.get(kycUpload?.[1])?.scenario.kyc;
  if (uploadState && kycUpload && req.method === "POST") {
    const chunks = []; req.on("data", chunk => chunks.push(chunk));
    return req.on("end", async () => {
      try {
        const contentType = req.headers["content-type"] ?? "", bytes = Buffer.concat(chunks);
        const multipart = contentType.startsWith("multipart/form-data");
        const fields = multipart ? await new Request("http://stub.test/upload", { method: "POST", headers: { "content-type": contentType }, body: bytes }).formData() : null;
        const file = fields ? [...fields.values()].find(value => value instanceof File) : new File([bytes], kycUpload[2], { type: contentType });
        if (!(file instanceof File)) return send(400, { error: "fixture upload has no File" });
        const object = { user_id: kycUpload[1], bucket: "kyc-documents", path: `${kycUpload[1]}/${kycUpload[2]}`,
          sha256: createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex"), size: file.size, contentType: file.type };
        uploadState.uploads.push({ ...object, multipart, fileName: file.name, serviceRole: req.headers.authorization === "Bearer cle-service-de-test" });
        uploadState.objects.push(object);
        return send(200, { Key: `kyc-documents/${object.path}`, Id: crypto.randomUUID() });
      } catch { return send(400, { error: "fixture upload parsing failed" }); }
    });
  }
  if (url.pathname === "/rest/v1/rpc/zabelie_register_kyc_document" && req.method === "POST") {
    let text = ""; req.on("data", chunk => text += chunk);
    return req.on("end", () => {
      const args = JSON.parse(text), state = profileIdentityActors.get(args.p_user_id)?.scenario.kyc;
      if (!state) return single([]);
      // Journal et effet de fixture seulement : aucune garde expectedActorId,
      // aucun verrou, contrôle de snapshot ou règle RLS SQL n'est simulé.
      const id = crypto.randomUUID(), now = new Date().toISOString();
      state.documents.push({ id, user_id: args.p_user_id, kind: args.p_kind, storage_path: args.p_storage_path, created_at: now });
      Object.assign(state.submissions.find(row => row.user_id === args.p_user_id), { status: "pending", submitted_at: now, decided_at: null, decided_by: null });
      const result = { ok: true, id };
      state.rpcs.push({ name: "zabelie_register_kyc_document", args, result, serviceRole: req.headers.authorization === "Bearer cle-service-de-test" });
      return send(200, result);
    });
  }
  if (url.pathname === "/storage/v1/object/kyc-documents" && req.method === "DELETE") {
    let text = ""; req.on("data", chunk => text += chunk);
    return req.on("end", () => {
      const paths = JSON.parse(text).prefixes;
      for (const path of paths) {
        const state = profileIdentityActors.get(path.split("/")[0])?.scenario.kyc;
        if (!state) continue;
        state.removals.push({ path, serviceRole: req.headers.authorization === "Bearer cle-service-de-test" });
        state.objects = state.objects.filter(object => object.path !== path);
      }
      return send(200, []);
    });
  }

  const deliveryOwner = eq(url, "user_id");
  const deliveryScenario = profileIdentityActors.get(deliveryOwner)?.scenario.deliveryInfo;
  if (deliveryScenario && url.pathname === "/rest/v1/zabelie_delivery_info" && req.method === "GET") {
    const row = deliveryScenario.rows.find(row => row.user_id === deliveryOwner);
    const tokenId = /profile-identity-([0-9a-f-]{36})/.exec(req.headers.authorization ?? "")?.[1];
    deliveryScenario.reads.push({ tokenActorId: profileIdentityActors.has(tokenId) ? tokenId : null,
      requestedActorId: deliveryOwner, select: url.searchParams.get("select"),
      serviceRole: req.headers.authorization === "Bearer cle-service-de-test", row: row ? { ...row } : null });
    return single(row ? [row] : []);
  }
  if (url.pathname === "/rest/v1/zabelie_delivery_info" && req.method === "POST") {
    let text = ""; req.on("data", chunk => text += chunk);
    return req.on("end", () => {
      // Observer le vrai token et la vraie ligne upsert ; aucune garde
      // expectedActorId, contrainte ou politique RLS n'est reproduite ici.
      const row = JSON.parse(text);
      const state = profileIdentityActors.get(row.user_id)?.scenario.deliveryInfo;
      if (!state) return single([]);
      const tokenId = /profile-identity-([0-9a-f-]{36})/.exec(req.headers.authorization ?? "")?.[1];
      state.upserts.push({ tokenActorId: profileIdentityActors.has(tokenId) ? tokenId : null,
        serviceRole: req.headers.authorization === "Bearer cle-service-de-test", row: { ...row } });
      const existing = state.rows.find(saved => saved.user_id === row.user_id);
      if (existing) Object.assign(existing, row);
      else state.rows.push(row);
      return send(201, []);
    });
  }

  // Fermeture : observer les E/S réelles pour les seuls UUID opt-in. Aucun
  // refus d'identité, trigger, cascade SQL ou mécanisme de RLS n'est simulé.
  const closureOwner = eq(url, "buyer_id") ?? eq(url, "products.seller_id") ?? eq(url, "user_id");
  const closureScenario = profileIdentityActors.get(closureOwner)?.scenario;
  const closure = closureScenario?.accountClosure;
  if (closure) {
    const table = url.pathname.slice("/rest/v1/".length);
    const metric = table === "orders" ? (eq(url, "buyer_id") ? "purchases" : "sales")
      : table === "zabelie_kyc_documents" ? "kyc" : table === "zabelie_policy_acceptances" ? "acceptances" : null;
    if (req.method === "HEAD" && metric) {
      const count = closure.counts[closureOwner][metric];
      closure.events.push({ actorId: closureOwner, kind: "count", metric, count });
      res.writeHead(200, { "content-type": "application/json", "content-range": `*/${count}` });
      return res.end();
    }
    if (table === "zabelie_kyc_submissions") {
      if (req.method === "PATCH") {
        let text = ""; req.on("data", chunk => text += chunk);
        return req.on("end", () => {
          const patch = JSON.parse(text);
          closure.events.push({ actorId: closureOwner, kind: "kyc.update", patch });
          closure.kycSubmissions.filter(row => row.user_id === closureOwner && row.status === eq(url, "status")).forEach(row => Object.assign(row, patch));
          return send(200, []);
        });
      }
      return single(closure.kycSubmissions.filter(row => row.user_id === closureOwner));
    }
    if (table === "zabelie_kyc_documents") return single([]);
    if (req.method === "DELETE" && ["zabelie_favorites", "zabelie_shop_follows"].includes(table)) {
      const key = table === "zabelie_favorites" ? "favorites" : "follows";
      closure.events.push({ actorId: closureOwner, kind: `${key}.delete` });
      closure[key] = closure[key].filter(row => row.user_id !== closureOwner);
      return send(200, []);
    }
    if (table === "orders" && req.method === "GET") {
      closure.events.push({ actorId: closureOwner, kind: "orders.read" });
      return single([]); // Les deux modes déclarent exactement zéro achat.
    }
  }
  const closureAuthId = /^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/.exec(url.pathname)?.[1];
  const closureAuth = profileIdentityActors.get(closureAuthId)?.scenario.accountClosure;
  if (closureAuth && ["PUT", "DELETE"].includes(req.method)) {
    let text = ""; req.on("data", chunk => text += chunk);
    return req.on("end", () => {
      const patch = JSON.parse(text || "{}");
      const user = closureAuth.authUsers.find(user => user.id === closureAuthId);
      closureAuth.events.push({ actorId: closureAuthId, kind: req.method === "DELETE" ? "auth.delete" : "auth.update", patch,
        serviceRole: req.headers.authorization === "Bearer cle-service-de-test" });
      if (req.method === "DELETE") user.deleted = true;
      else Object.assign(user, patch, { user_metadata: { ...user.user_metadata, ...patch.user_metadata } });
      return send(200, user);
    });
  }

  // Une jointure commandes → produits sans clé nommée : refusée comme en production (0111).
  if (jointureAmbigue(tableDe(url.pathname), url.searchParams.get("select"))) {
    console.error("[stub] PGRST201", tableDe(url.pathname), url.searchParams.get("select"));
    return send(300, REFUS_PGRST201);
  }

  // The real limiter returns a boolean; an empty PostgREST result is an error.
  if (url.pathname === "/rest/v1/rpc/zabelie_rate_limit") return send(200, true);
  if (mediaReviewFixture(req, res, url, send, single)) return;
  if (url.pathname === "/__physical-creations") {
    const title = url.searchParams.get("title");
    const writes = physicalCreationWrites.filter(row => !title || row.title === title);
    const ids = new Set(writes.map(row => row.id));
    const variants = physicalCreationVariants.filter(row => ids.has(row.product_id));
    return send(200, { products: writes, active: physicalCreationRows.filter(row => ids.has(row.id)),
      extensions: physicalCreationExtensions.filter(row => ids.has(row.product_id)), variants,
      stocks: physicalCreationStocks.filter(row => variants.some(variant => variant.id === row.variant_id)),
      uploads: physicalCreationUploads.filter(row => ids.has(row.product_id)) });
  }
  const physicalCover = /^\/storage\/v1\/object\/product-covers\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (physicalCover && physicalCreationRows.some(row => row.id === physicalCover[1])) {
    physicalCreationUploads.push({ product_id: physicalCover[1], path: physicalCover[0] });
    req.resume(); return send(200, { Key: `product-covers/${physicalCover[1]}/${physicalCover[2]}` });
  }
  if (["/rest/v1/zabelie_physical_products", "/rest/v1/zabelie_stock"].includes(url.pathname) && req.method === "POST") {
    let text = ""; req.on("data", chunk => text += chunk);
    return req.on("end", () => {
      const input = JSON.parse(text || "{}");
      const rows = Array.isArray(input) ? input : [input];
      if (url.pathname.endsWith("zabelie_physical_products")) physicalCreationExtensions.push(...rows.filter(row => physicalCreationRows.some(product => product.id === row.product_id)));
      else physicalCreationStocks.push(...rows.filter(row => physicalCreationVariants.some(variant => variant.id === row.variant_id)));
      return send(201, []);
    });
  }

  // These fixture accounts explicitly represent users who accepted both
  // current documents. This is simulated data, not evidence for a real user.
  if (url.pathname === "/rest/v1/zabelie_policy_acceptances") {
    const owner = url.searchParams.get("user_id")?.replace(/^eq\./, "");
    const state = profileIdentityActors.get(owner)?.scenario.kyc ?? profileIdentityActors.get(owner)?.scenario.pixels;
    const rows = [BUYER_ID, SELLER_ID].includes(owner) || ESSAYAGE_COMPTES.has(owner) || state ? POLICY_ACCEPTANCE_FIXTURE : [];
    if (state) state.reads.push({ table: "zabelie_policy_acceptances", owner, select: url.searchParams.get("select"),
      serviceRole: req.headers.authorization === "Bearer cle-service-de-test", rows: rows.map(row => ({ ...row })) });
    return send(200, rows);
  }

  // RPC : expiration des réservations. Renvoie 0 — le cas « rien à libérer »,
  // celui où le journal d'exécution est justement indispensable.
  if (url.pathname === "/rest/v1/rpc/zabelie_expire_stock_reservations") {
    return send(200, 0);
  }

  if (url.pathname === "/rest/v1/zabelie_product_commitments") return single([...commitments.values()].filter(row => url.searchParams.get("product_id")?.includes(row.product_id)));
  if (url.pathname === "/rest/v1/rpc/zabelie_save_product_commitment") {
    let body = ""; req.on("data", c => body += c);
    return req.on("end", () => {
      const p = JSON.parse(body);
      const old = commitments.get(p.p_product);
      const row = { product_id: p.p_product, zones: p.p_zones, pickup: p.p_pickup, delivery_days: p.p_days, fees: p.p_fees, next_available: p.p_next, availability_confirmed_at: p.p_confirm ? new Date().toISOString() : old?.availability_confirmed_at ?? null };
      commitments.set(p.p_product, row); return single([row]);
    });
  }

  // Photo produit. `STUB_COVER` permet d'éprouver les cas de DÉFAILLANCE de la
  // carte de partage — la surface où un échec coûte le plus cher, puisque
  // WhatsApp fige l'aperçu obtenu :
  //   STUB_COVER=404   → stockage qui répond en erreur
  //   STUB_COVER=lent  → stockage qui traîne (8 s), au-delà du délai interne
  if (url.pathname === "/cover.png") {
    const servir = () => {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(readFileSync(new URL("./cover.png", import.meta.url)));
    };
    if (process.env.STUB_COVER === "404") {
      res.writeHead(404);
      return res.end();
    }
    if (process.env.STUB_COVER === "lent") return setTimeout(servir, 8000);
    return servir();
  }

  if (url.pathname === "/__ecritures") return send(200, ecritures);
  if (url.pathname === "/__partner") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<title>Partner test</title>"); }
  if (url.pathname === "/__sante") return send(200, { ok: true });


  if (process.env.OFFERS_FIXTURE === "true" && offersFixture(req,url,send,single)) return;

  // Ventes flash (0080) — opt-in : une offre vivante sur le produit publié,
  // 1 050 HTG au lieu de 1 500, plafond de 10 unités dont 3 déjà prises
  // (comptage HEAD des commandes, comme le checkout). Les autres suites
  // gardent le prix normal.
  if (process.env.FLASH_FIXTURE === "true") {
    if (url.pathname === "/rest/v1/zabelie_flash_sales") {
      const now = Date.now();
      return single([{ id: "f1a5f1a5-0000-4000-8000-000000000001", product_id: PRODUCT_ID, prix_flash_htg: 1050, debut: new Date(now - 3600e3).toISOString(), fin: new Date(now + 3 * 3600e3).toISOString(), unites_max: 10 }]);
    }
    if (url.pathname === "/rest/v1/orders" && req.method === "HEAD") {
      res.writeHead(200, { "content-type": "application/json", "content-range": "*/3" });
      return res.end();
    }
  }

  if (process.env.PRICING_FIXTURE === "true") {
    if (url.pathname === "/rest/v1/zabelie_seller_pricing_config") return single([{
      id: true, enabled: true, direct_rate_bps: 1000, direct_fixed_usd_cents: 50,
      discovery_rate_bps: 3000, usd_htg_micros: 132000000, launch_days: 30, submission_days: 7,
      launch_sales_limit: 3, launch_discount_bps: 5000, payments_ready: true, attribution_days: 7,
    }]);
    if (url.pathname === "/rest/v1/zabelie_seller_launch") {
      const now = Date.now(), date = n => new Date(now + n * 86400000).toISOString();
      return single(eq(url, "seller_id") === SELLER_ID ? [{
        seller_id: SELLER_ID, submitted_at: date(-3), submission_deadline: date(3), published_at: date(-2),
        eligible: true, starts_at: date(-2), ends_at: date(28), used_sales: 1, sales_limit: 3,
      }] : []);
    }
  }


  if (process.env.DISCOUNT_FIXTURE === "true") {
    const variants = discountVariants;
    if (url.pathname === "/__discount-reset") {
      variants.forEach((v, i) => { v.price_htg = i ? 2500 : 2000; v.compare_at_htg = null; });
      discountOrders.length = 0;
      return send(200, { ok: true });
    }
    if (url.pathname === "/__discount-orders") return send(200, discountOrders);
    if (url.pathname === "/rest/v1/rpc/zabelie_reserve_stock") {
      let body = ""; req.on("data", c => body += c);
      return req.on("end", () => {
        const input = JSON.parse(body), variant = variants.find(v => v.id === input.p_variant_id);
        const order = discountOrders.find(o => o.id === input.p_order_id && o.buyer_id === BUYER_ID && o.product_id === PRODUCT_ID);
        return send(200, { ok: Boolean(variant && order && input.p_quantity > 0 && input.p_quantity <= variant.zabelie_stock.quantity_available) });
      });
    }

    if (url.pathname === "/rest/v1/products") {
      const row = { ...PRODUCT, price_htg: Math.min(...variants.map(v => v.price_htg)), compare_at_htg: null, cover_url: null };
      const id = eq(url, "id"), slug = eq(url, "slug"), seller = eq(url, "seller_id");
      return single((id && id !== PRODUCT_ID) || (slug && slug !== PRODUCT.slug) || (seller && seller !== SELLER_ID) ? [] : [row]);
    }
    if (url.pathname === "/rest/v1/zabelie_product_variants") {
      const id = eq(url, "id"), product = eq(url, "product_id");
      return send(200, variants.filter(v => (!id || v.id === id) && (!product || product === PRODUCT_ID)));
    }
    if (url.pathname === "/rest/v1/rpc/zabelie_set_variant_discount" || url.pathname === "/rest/v1/rpc/zabelie_clear_variant_discount") {
      let text = ""; req.on("data", c => text += c);
      return req.on("end", () => {
        const input = JSON.parse(text), v = variants.find(v => v.id === input.p_variant_id);
        if (!v || input.p_product_id !== PRODUCT_ID || input.p_user_id !== SELLER_ID) return send(200, { ok: false, reason: "introuvable" });
        if (url.pathname.endsWith("clear_variant_discount")) { v.compare_at_htg = null; return send(200, { ok: true, prix_htg: v.price_htg }); }
        if (input.p_new_price_htg >= v.price_htg) return send(200, { ok: false, reason: "pas_une_baisse" });
        v.compare_at_htg ??= v.price_htg; v.price_htg = input.p_new_price_htg;
        return send(200, { ok: true, ancien_htg: v.compare_at_htg, nouveau_htg: v.price_htg });
      });
    }
    if (url.pathname === "/rest/v1/orders" && req.method === "POST") {
      let text = ""; req.on("data", c => text += c);
      return req.on("end", () => { const row = { id: ORDER_ID, ...JSON.parse(text) }; discountOrders.push(row); return single([row]); });
    }
  }

  const token = req.headers.authorization ?? "";
  // Isolated scenarios: no mutable global mode between parallel tests.
  const history = token.includes("historique-test") || eq(url, "buyer_id") === HISTORY_ID;
  const historyError = token.includes("historique-erreur") || eq(url, "buyer_id") === HISTORY_ERROR_ID;
  const sellerPreparation = token.includes("vendeur-preparation");
  const compteEssayage = /essayage-([0-9a-f-]{36})/.exec(token)?.[1];
  const essayageCompte = compteEssayage && ESSAYAGE_COMPTES.has(compteEssayage) ? compteEssayage : null;
  const profileIdentityId = /profile-identity-([0-9a-f-]{36})/.exec(token)?.[1];
  const profileIdentityActor = profileIdentityActors.has(profileIdentityId) ? profileIdentityId : null;
  const identityScenario = profileIdentityActors.get(profileIdentityActor)?.scenario;
  if (identityScenario?.pixels && req.method === "GET" && ["/rest/v1/zabelie_seller_pixels", "/rest/v1/zabelie_api_keys",
    "/rest/v1/zabelie_webhook_endpoints", "/rest/v1/zabelie_webhook_deliveries", "/rest/v1/zabelie_seller_domains"].includes(url.pathname)) {
    const table = url.pathname.slice("/rest/v1/".length);
    const rows = table === "zabelie_seller_pixels" ? identityScenario.pixels.rows.filter(row => row.seller_id === profileIdentityActor) : [];
    identityScenario.pixels.reads.push({ table, owner: profileIdentityActor, select: url.searchParams.get("select"),
      serviceRole: req.headers.authorization === "Bearer cle-service-de-test", rows: rows.map(row => ({ ...row })) });
    return single(rows);
  }
  if (identityScenario?.pixels && url.pathname === "/rest/v1/zabelie_seller_pixels" && req.method === "POST") {
    let text = ""; req.on("data", chunk => text += chunk);
    return req.on("end", () => {
      const input = JSON.parse(text), state = identityScenario.pixels;
      let row = state.rows.find(candidate => candidate.seller_id === input.seller_id);
      const before = row ? { ...row } : null;
      if (row) Object.assign(row, input);
      else { row = { ...input }; state.rows.push(row); }
      state.upserts.push({ tokenActorId: profileIdentityActor, input, before, row: { ...row } });
      return send(201, []);
    });
  }
  const couponOwner = eq(url, "seller_id") ?? profileIdentityActor;
  const couponScenario = profileIdentityActors.get(couponOwner)?.scenario.coupons;
  if (couponScenario && req.method === "GET" && ["/rest/v1/products", "/rest/v1/zabelie_coupons"].includes(url.pathname)) {
    const table = url.pathname.slice("/rest/v1/".length);
    const rows = (table === "products" ? couponScenario.products : couponScenario.rows).filter(row => row.seller_id === couponOwner);
    couponScenario.reads.push({ table, owner: couponOwner, select: url.searchParams.get("select"),
      serviceRole: req.headers.authorization === "Bearer cle-service-de-test", rows: rows.map(row => ({ ...row })) });
    return single(rows);
  }
  if (identityScenario?.coupons && url.pathname === "/rest/v1/zabelie_coupons" && ["POST", "PATCH"].includes(req.method)) {
    let text = ""; req.on("data", chunk => text += chunk);
    return req.on("end", () => {
      const input = JSON.parse(text), state = identityScenario.coupons;
      if (req.method === "POST") {
        const refused = state.refusalOnce || state.rows.some(row => row.seller_id === input.seller_id && row.code === input.code);
        state.refusalOnce = false;
        if (refused) {
          const result = { code: "23505", message: "duplicate coupon code in fictitious shop" };
          state.inserts.push({ tokenActorId: profileIdentityActor, input, result });
          return send(409, result);
        }
        const row = { id: crypto.randomUUID(), uses: 0, active: true, created_at: "2026-10-05T11:00:00Z", ...input };
        state.rows.push(row); state.inserts.push({ tokenActorId: profileIdentityActor, input, row: { ...row } });
        return single([row]);
      }
      const id = eq(url, "id"), row = state.rows.find(coupon => coupon.id === id && coupon.seller_id === profileIdentityActor);
      state.updates.push({ tokenActorId: profileIdentityActor, id, input, affected: row ? 1 : 0 });
      if (row) Object.assign(row, input);
      return send(200, []);
    });
  }
  if (identityScenario?.accountClosure && url.pathname === "/auth/v1/logout") {
    identityScenario.accountClosure.events.push({ actorId: profileIdentityActor, kind: "auth.signout", scope: url.searchParams.get("scope") });
    return send(200, {});
  }
  if (identityScenario?.zones && url.pathname === "/rest/v1/zabelie_zones" && req.method === "GET") {
    const id = eq(url, "id");
    return single(identityScenario.zones.filter(zone => !id || zone.id === id));
  }
  if (identityScenario?.zones && url.pathname === "/rest/v1/zabelie_zone_requests" && req.method === "POST") {
    let text = ""; req.on("data", chunk => text += chunk);
    return req.on("end", () => {
      // Journal d'E/S par scénario : il observe le vrai corps INSERT et son
      // token, sans prétendre reproduire les triggers, l'index ou la RLS SQL.
      const input = JSON.parse(text);
      const row = { id: crypto.randomUUID(), status: "pending", ...input };
      identityScenario.zoneRequests.push({ tokenActorId: profileIdentityActor, row });
      return send(201, []);
    });
  }

  // ── Essayage virtuel : les cinq fonctions de 0150, la table des essais, et une lecture pour les tests.
  if (url.pathname === "/__essayage") return send(200, { essais: [...essayage.essais.values()], expositions: [...essayage.expositions.values()] });
  if (url.pathname.startsWith("/rest/v1/rpc/zabelie_essayage_")) {
    let texte = "";
    req.on("data", (c) => (texte += c));
    return req.on("end", () => {
      const p = JSON.parse(texte || "{}");
      const nom = url.pathname.slice("/rest/v1/rpc/".length);
      if (nom === "zabelie_essayage_eligible") return send(200, p.p_produit === ROBE_ID && p.p_acheteur !== ROBE_VENDEUR);
      if (nom === "zabelie_essayage_exposer") {
        const jour = jourHaiti();
        const cle = `${p.p_acheteur}|${p.p_produit}|${jour}`;
        if (!essayage.expositions.has(cle)) essayage.expositions.set(cle, { acheteur: p.p_acheteur, produit: p.p_produit, jour, groupe: p.p_groupe });
        return send(200, null);
      }
      if (nom === "zabelie_essayage_reserver") {
        if (p.p_produit !== ROBE_ID) return send(200, [{ essai: null, refus: "non_eligible" }]);
        const refus = ESSAYAGE_REFUS[p.p_acheteur];
        if (refus) return send(200, [{ essai: null, refus }]);
        const id = crypto.randomUUID();
        essayage.essais.set(id, { id, acheteur_id: p.p_acheteur, produit_id: p.p_produit, fournisseur: p.p_fournisseur, travail_id: null, statut: "en_cours", raison: null, cree_le: new Date().toISOString() });
        return send(200, [{ essai: id, refus: null }]);
      }
      const essai = essayage.essais.get(p.p_essai);
      if (!essai) return send(400, { code: "P0001", message: "essai inconnu" });
      if (nom === "zabelie_essayage_lancer") essai.travail_id = p.p_travail;
      else if (nom === "zabelie_essayage_terminer" && essai.statut === "en_cours") Object.assign(essai, { statut: p.p_statut, raison: p.p_raison ?? null });
      return send(200, null);
    });
  }
  if (url.pathname === "/rest/v1/zabelie_essayage_essais") {
    const e = essayage.essais.get(eq(url, "id"));
    return single(e && e.acheteur_id === eq(url, "acheteur_id") ? [{ id: e.id, fournisseur: e.fournisseur, travail_id: e.travail_id, statut: e.statut, raison: e.raison, cree_le: e.cree_le }] : []);
  }

  if (url.pathname === "/__gift-writes") {
    const orderId = url.searchParams.get("order_id");
    return send(200, orderId ? giftWrites.filter(event => event.order_id === orderId) : giftWrites);
  }
  if (["zabelie_reserve_stock", "zabelie_release_stock", "confirm_payment"].some(name => url.pathname === `/rest/v1/rpc/${name}`)) {
    let body = ""; req.on("data", c => body += c);
    return req.on("end", () => {
      const input = JSON.parse(body || "{}"), orderId = input.p_order_id ?? input.p_order ?? input.p_idempotency_key;
      if (giftOrders.has(orderId)) giftWrites.push({ step: "stock-or-confirm", order_id: orderId, method: req.method, rpc: url.pathname, body: input });
      return single([]);
    });
  }
  // Domaine vendeur (0125) : un seul domaine actif connu du stub.
  if (url.pathname === "/rest/v1/rpc/zabelie_domaine_boutik") {
    let body = ""; req.on("data", c => body += c);
    return req.on("end", () => send(200, JSON.parse(body || "{}").p_hote === "boutik-mari.ht" ? "atelye-lakay" : null));
  }
  if (url.pathname === "/rest/v1/rpc/zabelie_boutik_public") {
    let body = ""; req.on("data", c => body += c);
    return req.on("end", () => {
      const slug = JSON.parse(body || "{}").p_slug;
      // PR-Z2 : une vitrine par test (`v-<uuid sans tirets>`, 34 caractères :
      // un slug en compte 40 au plus), pour que les appels au compteur de deux
      // tests parallèles ne se mélangent pas.
      const vitrine = /^v-([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/.exec(slug ?? "");
      if (vitrine) return send(200, { id: vitrine.slice(1).join("-"), display_name: "Boutik vizit fiktif", bio: "", avatar_url: null, zone_id: null, pwen_repe: null, boutik_slug: slug });
      if (!BOUTIQUE_FIXTURE) return send(200, { id: SELLER_ID, display_name: "Garaj Petyonvil", bio: "Boutique de test", avatar_url: null, zone_id: null, pwen_repe: null, boutik_slug: null });
      const empty = slug === "boutique-vide";
      send(200, { id: empty ? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" : SELLER_ID, display_name: "Atelye Lakay", bio: "Des ressources pour apprendre et préparer votre projet.\nBoutique de démonstration pour les tests.", avatar_url: null, zone_id: null, pwen_repe: null, boutik_slug: empty ? "boutique-vide" : "atelye-lakay" });
    });
  }
  // PR-Z2 : le compteur de visites (0155). Chaque appel est consigné, avec le
  // rôle qui l'a fait, et relu par le spec via /__boutik-visites.
  if (url.pathname === "/rest/v1/rpc/zabelie_boutik_visite") {
    let body = ""; req.on("data", c => body += c);
    return req.on("end", () => {
      boutikVisites.push({ seller: JSON.parse(body || "{}").p_seller ?? null, serviceRole: req.headers.authorization === "Bearer cle-service-de-test" });
      res.writeHead(204); return res.end();
    });
  }
  if (url.pathname === "/__boutik-visites") return send(200, boutikVisites.filter(v => v.seller === url.searchParams.get("seller")));
  if (["/rest/v1/zabelie_favorites", "/rest/v1/zabelie_shop_follows"].includes(url.pathname)) {
    const column = url.pathname.endsWith("zabelie_favorites") ? "product_id" : "seller_id";
    const key = token + column;
    if (!collectionsBySession.has(key)) collectionsBySession.set(key, new Set(token.includes("collections-list") ? [column === "product_id" ? PRODUCT_ID : SELLER_ID] : []));
    const saved = collectionsBySession.get(key);
    if (req.method === "POST") {
      let body = ""; req.on("data", c => body += c);
      return req.on("end", () => {
        if (token.includes("collections-fail")) return send(503, { code: "08006" });
        saved.add(JSON.parse(body)[column]); return send(201, []);
      });
    }
    const id = eq(url, column);
    if (req.method === "DELETE") { saved.delete(id); return send(200, []); }
    let rows = [...saved].filter(value => !id || value === id).map(value => ({ [column]: value, created_at: "2026-09-07T00:00:00Z" }));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    rows = rows.slice(offset, offset + Number(url.searchParams.get("limit") ?? 100));
    return single(rows);
  }
  if (url.pathname === "/rest/v1/zabelie_order_recipients" && req.method === "POST") {
    let body = ""; req.on("data", c => body += c);
    return req.on("end", () => {
      const input = JSON.parse(body);
      if (giftOrders.has(input.order_id)) giftWrites.push({ step: "recipient", order_id: input.order_id, body: input });
      send(503, { code: "08006" });
    });
  }
  if (url.pathname === "/rest/v1/payments") {
    const orderId = eq(url, "order_id");
    if (req.method === "GET" && giftOrders.has(orderId)) return single(giftPayments.has(orderId) ? [giftPayments.get(orderId)] : []);
    if (req.method === "POST" || giftOrders.has(orderId)) {
      let body = ""; req.on("data", c => body += c);
      return req.on("end", () => {
        const input = JSON.parse(body || "{}"), target = input.order_id ?? orderId;
        if (!giftOrders.has(target)) return send(201, []);
        giftWrites.push({ step: req.method === "POST" ? "payment" : "payment-change", order_id: target, method: req.method, body: input });
        if (req.method === "POST") {
          if (giftPayments.has(target)) return send(409, { code: "23505" });
          giftPayments.set(target, input);
        } else if (req.method === "DELETE") giftPayments.delete(target);
        else Object.assign(giftPayments.get(target) ?? {}, input);
        return send(req.method === "POST" ? 201 : 200, []);
      });
    }
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  if (url.pathname.startsWith("/auth/v1/user")) {
    const closureUser = identityScenario?.accountClosure?.authUsers.find(user => user.id === profileIdentityActor);
    if (closureUser?.deleted) return send(401, { message: "User not found", error_code: "user_not_found" });
    return send(200, {
      id: profileIdentityActor ?? essayageCompte ?? (sellerPreparation ? SELLER_ID : historyError ? HISTORY_ERROR_ID : history ? HISTORY_ID : BUYER_ID),
      aud: "authenticated",
      role: "authenticated",
      email: closureUser?.email ?? "achte@example.ht",
      app_metadata: {},
      user_metadata: closureUser?.user_metadata ?? {},
      created_at: "2026-01-01T00:00:00Z",
    });
  }
  if (url.pathname.startsWith("/auth/v1/")) return send(200, {});

  if (url.pathname === "/rest/v1/zabelie_digital_studio") {
    if (req.method === "POST") {
      let body = ""; req.on("data", c => body += c);
      return req.on("end", () => { const input = JSON.parse(body); digitalStudios.set(input.product_id, input); return single([input]); });
    }
    return single([...digitalStudios.values()].filter(row => url.searchParams.get("product_id")?.includes(row.product_id)));
  }
  if (url.pathname === "/rest/v1/zabelie_digital_releases") {
    let rows = digitalReleases.filter(r => (!eq(url, "id") || r.id === eq(url, "id")) && (!eq(url, "product_id") || r.product_id === eq(url, "product_id")));
    if (url.searchParams.get("order")?.includes("desc")) rows = rows.toSorted((a, b) => b.version - a.version);
    if (url.searchParams.has("limit")) rows = rows.slice(0, Number(url.searchParams.get("limit")));
    return single(rows);
  }
  if (url.pathname === "/rest/v1/zabelie_digital_entitlements") {
    const id = eq(url, "order_id");
    return single(id?.startsWith("aaaaaaaa-") ? [{ order_id: id, release_id: id.endsWith("105") ? RELEASE_2 : RELEASE_1 }] : []);
  }
  if (url.pathname === "/rest/v1/zabelie_digital_progress") {
    if (req.method === "POST") {
      let body = ""; req.on("data", c => body += c);
      return req.on("end", () => { const v = JSON.parse(body); digitalProgress.set(`${v.order_id}:${v.release_id}:${v.lesson_id}`, v); return single([v]); });
    }
    return single([...digitalProgress.values()].filter(p => p.order_id === eq(url, "order_id") && p.release_id === eq(url, "release_id")));
  }
  if (url.pathname.startsWith("/storage/v1/object/info/product-files/")) return send(200, { id: "test-object", version: "test-version", size: 1024 });
  if (url.pathname.startsWith("/storage/v1/object/product-files/_security/")) return send(200, { schema: 1, objectId: "test-object", objectVersion: "test-version", sha256: "a".repeat(64), verdict: "clean", scannedAt: new Date(Date.now() - 1000).toISOString(), engine: "ClamAV fixture" });
  if (url.pathname.startsWith("/storage/v1/object/sign/product-files/")) return send(200, { signedURL: "/object/sign/product-files/studio/private.pdf?token=test-signed" });

  // ── PostgREST ───────────────────────────────────────────────────────────
  if (url.pathname.startsWith("/rest/v1/orders")) {
    // STUB_DRIFT=0030 : rejoue le schéma de production AVANT 0042 — toute
    // sélection de `order_ref` répond 42703, comme le vrai PostgREST. C'est ce
    // qui permet d'ÉPROUVER la tolérance de dérive des surfaces (règle 3),
    // pas de la raisonner.
    if (
      process.env.STUB_DRIFT === "0030" &&
      (url.searchParams.get("select") ?? "").includes("order_ref")
    ) {
      return send(400, {
        code: "42703",
        details: null,
        hint: null,
        message: "column orders.order_ref does not exist",
      });
    }
    if (req.method !== "GET") {
      let body = "";
      req.on("data", (c) => (body += c));
      return req.on("end", () => {
        if (req.method === "POST" && JSON.parse(body).product_id === GIFT_PRODUCT) {
          const input = JSON.parse(body);
          giftWrites.push({ step: "order", order_id: input.id, method: req.method, body: input });
          if (giftOrders.has(input.id)) return send(409, { code: "23505" });
          giftOrders.set(input.id, input);
          return single([input]);
        }
        if (giftOrders.has(eq(url, "id"))) {
          const orderId = eq(url, "id"), input = JSON.parse(body || "{}");
          giftWrites.push({ step: "cleanup", order_id: orderId, method: req.method, body: input });
          if (req.method === "DELETE") giftOrders.delete(orderId);
          else Object.assign(giftOrders.get(orderId), input);
          return send(200, []);
        }
        ecritures.push({ method: req.method, query: url.search, body });
        if (process.env.PRICING_FIXTURE === "true" && req.method === "POST") return send(503, { code: "08006", message: "pricing fixture stops before payment" });
        send(200, []);
      });
    }
    const id = eq(url, "id");
    if (giftOrders.has(id)) {
      const order = giftOrders.get(id), buyer = eq(url, "buyer_id");
      return single(!buyer || order.buyer_id === buyer ? [order] : []);
    }
    if (id?.startsWith("aaaaaaaa-")) return single([{ ...ORDER, id, product_id: DIGITAL_ID, buyer_id: id.endsWith("104") ? SELLER_ID : BUYER_ID, status: id.endsWith("102") ? "pending" : id.endsWith("103") ? "refunded" : "paid", product: { title: "Formation achetée", slug: "formation-studio-test", kind: "fichier" } }]);
    if (historyError) return send(503, { code: "08006", message: "test unavailable" });
    let rows = id && id !== ORDER_ID ? [] : [ORDER];
    if (history || id?.startsWith("88888888-8888-8888-8888-")) {
      const make = (n, title, kind, status) => ({ ...ORDER,
        id: `88888888-8888-8888-8888-${String(n).padStart(12, "0")}`, buyer_id: HISTORY_ID,
        order_ref: `ZB-TEST-${n}`, status,
        product: title ? { title, kind, slug: SLUG } : null,
      });
      rows = [
        make(1, "Livre en attente", "fichier", "pending"),
        make(2, "Guide remboursé", "fichier", "refunded"),
        make(3, "Objet en litige", "physical", "disputed"),
        make(4, "Prestation confirmée", "service", "paid"),
        make(5, null, null, "cancelled"),
        ...Array.from({ length: 24 }, (_, i) => make(i + 6, `Guide acquis ${i + 1}`, "fichier", "paid")),
      ];
      const buyer = eq(url, "buyer_id");
      if (buyer && buyer !== HISTORY_ID) rows = [];
      const kind = eq(url, "product.kind");
      if (kind) rows = rows.filter(row => row.product?.kind === kind);
      if (id) rows = rows.filter(row => row.id === id);
      // Respect filtering and pagination, like PostgREST (before rendering).
      const status = url.searchParams.get("status");
      if (status?.startsWith("in.(")) rows = rows.filter(row => status.slice(4, -1).split(",").includes(row.status));
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? rows.length);
      rows = rows.slice(offset, offset + limit);
    }
    return single(rows);
  }

  // Taxonomie de test : un département ouvert sans offres, trois niveaux,
  // et une feuille inactive que la lecture publique ne doit jamais exposer.
  if (url.pathname === "/rest/v1/zabelie_categories") {
    const make = (id, parent_id, level, slug, label_fr, active = true) => ({
      id, parent_id, level, slug, label_fr, active, position: 10,
      label_kr: label_fr, label_en: label_fr, label_es: label_fr,
    });
    let rows = [
      make("d1", null, 1, "mod-akseswa", "Mode & accessoires"),
      make("c1", "d1", 2, "rad-fanm", "Vêtements femme"),
      make("s1", "c1", 3, "wob", "Robes"),
      make("s2", "c1", 3, "foula", "Écharpes"),
      make("closed", "c1", 3, "ferme", "Rayon fermé", false),
      ...(sellerPreparation ? [
        make("services-dept", null, 1, "dijital-sevis", "Digital & services"),
        make("services-parent", "services-dept", 2, "sevis-pwofesyonel", "Services professionnels"),
        make("services-design", "services-parent", 3, "grafik-ak-design", "Graphisme & design"),
        make("services-repair", "services-parent", 3, "reparasyon", "Réparations"),
      ] : []),
    ].filter(row => row.active);
    for (const key of ["id", "parent_id", "slug", "level", "label_fr"]) {
      const value = eq(url, key);
      if (value !== null) rows = rows.filter(row => String(row[key]) === value);
    }
    const ids = url.searchParams.get("id");
    if (ids?.startsWith("in.(")) rows = rows.filter(row => ids.slice(4, -1).split(",").includes(row.id));
    return single(rows);
  }

  // Compte des rayons peuplés (menu, `/categories`) : une offre publiée dans
  // « Écharpes » (s2), aucune dans « Robes » (s1). Seule la requête du menu
  // (select=category_id, sans filtre de département) est servie ici.
  if (url.pathname === "/rest/v1/products" && url.searchParams.get("select") === "category_id" && !url.searchParams.has("category")) {
    return single([{ category_id: "s2" }]);
  }
  if (url.pathname.startsWith("/rest/v1/products")) {
    const slug = eq(url, "slug");
    const id = eq(url, "id");
    const status = eq(url, "status");
    let rows = BOUTIQUE_FIXTURE ? SHOP_PRODUCTS : sellerPreparation ? [
      { ...PRODUCT, id: "77777777-7777-7777-7777-777777777777", slug: "guide-test", title: "Guide vendeur test", kind: "fichier", status: "draft", product_assets: [], cover_url: null },
      { ...PRODUCT, id: "66666666-6666-6666-6666-666666666666", slug: "service-test", title: "Prestation vendeur test", kind: "service", status: "draft", product_assets: [], delivery_days: 0, service_includes: ["Une consultation"] },
    ] : [PRODUCT];
    if (req.method === "POST") {
      let text = ""; req.on("data", chunk => text += chunk);
      return req.on("end", () => {
        const input = JSON.parse(text || "{}");
        if (input.kind !== "physical" || !input.title?.startsWith(PHYSICAL_CREATION_PREFIX)) return single(rows);
        const product = { ...PRODUCT, ...input, id: crypto.randomUUID(), cover_url: null, product_assets: [] };
        physicalCreationRows.push(product); physicalCreationWrites.push({ ...product });
        return single([product]);
      });
    }
    const createdPhysical = physicalCreationRows.find(row => row.id === id || row.slug === slug);
    if (createdPhysical) rows = [createdPhysical];
    else if (sellerPreparation && token.includes("physical-recovery")) rows = [...rows, ...physicalCreationRows];
    if (req.method === "PATCH" && createdPhysical) {
      let text = ""; req.on("data", chunk => text += chunk);
      return req.on("end", () => { Object.assign(createdPhysical, JSON.parse(text || "{}")); single([createdPhysical]); });
    }
    if (req.method === "DELETE" && createdPhysical) {
      physicalCreationRows.splice(physicalCreationRows.indexOf(createdPhysical), 1);
      return send(200, []);
    }
    // Audit 2026-10-19 (UX-01) : un vendeur dont une fiche a été retirée par la modération.
    if (sellerPreparation && token.includes("-archive")) rows = [...rows,
      { ...PRODUCT, id: "cccccccc-0000-4000-8000-000000000384", slug: "service-retire", title: "Service retiré test", kind: "service", status: "archived", product_assets: [], delivery_days: 1, service_includes: ["Une séance"] }];
    if (BOUTIQUE_FIXTURE && (id === DIGITAL_ID || slug === "formation-studio-test")) return single([SHOP_PRODUCTS[1]]);
    if (id === DIGITAL_ID || slug === "formation-studio-test") return single([{ ...PRODUCT, id: DIGITAL_ID, slug: "formation-studio-test", title: "Formation studio", kind: "fichier", product_assets: [{ id: ASSET_ID }], seller_id: SELLER_ID }]);
    // Produit dédié aux pixels (0123) : son vendeur, et lui seul, a un pixel.
    if (slug === "pixel-test" || id === PIXEL_PRODUCT) return single([{ ...PRODUCT, id: PIXEL_PRODUCT, slug: "pixel-test", title: "Produit pixel", seller_id: PIXEL_SELLER }]);
    if (id === GIFT_PRODUCT) return single([{ ...PRODUCT, id: GIFT_PRODUCT }]);
    if (slug === ROBE_SLUG || id === ROBE_ID) {
      // supabase-js retire les espaces du `select` : « title,cover_url,sous_rayon:… ».
      const lectureEssayage = (url.searchParams.get("select") ?? "").replace(/\s/g, "").startsWith("title,cover_url,sous_rayon");
      return single([lectureEssayage ? { title: ROBE.title, cover_url: ROBE_COUVERTURE_HTTPS, sous_rayon: ROBE.sous_rayon } : ROBE]);
    }
    if (slug) rows = rows.filter((row) => row.slug === slug);
    if (id) rows = rows.filter((row) => row.id === id);
    if (status) rows = rows.filter((row) => row.status === status);
    const sellerId = eq(url, "seller_id");
    if (sellerId) rows = rows.filter((row) => row.seller_id === sellerId);
    // API v1 validates RFC UUIDs; legacy UI fixtures use mnemonic identifiers.
    const projection = url.searchParams.get("select") ?? "";
    if (projection.includes("in_stock") && projection.includes("created_at") && !projection.includes(":")) {
      rows = rows.map(row => ({ ...row, id: "44444444-4444-4444-8444-444444444444", seller_id: "22222222-2222-4222-8222-222222222222", created_at: "2026-07-20T10:00:00Z" }));
    }
    return single(rows);
  }

  // Un produit physique n'a AUCUN livrable — c'est le cœur du sujet.
  if (url.pathname === "/rest/v1/zabelie_digital_details") {
    if (req.method === "POST") {
      let text = "";
      req.on("data", (chunk) => text += chunk);
      req.on("end", () => { const input = JSON.parse(text || "{}"); digitalFacts.set(input.product_id, input); single([input]); });
      return;
    }
    return single([...digitalFacts.values()].filter((row) => url.searchParams.get("product_id")?.includes(row.product_id)));
  }
  if (url.pathname.startsWith("/rest/v1/product_assets")) return single([]);

  if (url.pathname.startsWith("/rest/v1/zabelie_product_variants")) {
    if (BOUTIQUE_FIXTURE && eq(url, "product_id") !== PRODUCT_ID) return send(200, []);
    const fallback = [{
      id: "55555555-5555-5555-5555-555555555555", options: null, price_htg: 1500,
      position: 1, zabelie_stock: { quantity_available: 4 },
    }];
    if (req.method === "POST") {
      let text = ""; req.on("data", chunk => text += chunk);
      return req.on("end", () => {
        const input = JSON.parse(text || "[]"); const rows = Array.isArray(input) ? input : [input];
        const created = rows.filter(row => physicalCreationRows.some(product => product.id === row.product_id)).map(row => ({ ...row, id: crypto.randomUUID() }));
        physicalCreationVariants.push(...created); return send(created.length ? 201 : 200, created.length ? created : fallback);
      });
    }
    const productId = eq(url, "product_id");
    if (physicalCreationRows.some(product => product.id === productId)) {
      return send(200, physicalCreationVariants.filter(variant => variant.product_id === productId)
        .map(variant => ({ ...variant, zabelie_stock: physicalCreationStocks.find(stock => stock.variant_id === variant.id) ?? null })));
    }
    return send(200, fallback);
  }
  if (url.pathname.startsWith("/rest/v1/zabelie_product_fitment")) {
    if (BOUTIQUE_FIXTURE && eq(url, "product_id") !== PRODUCT_ID) return send(200, []);
    return send(200, [
      {
        year_start: 2008,
        year_end: 2015,
        zabelie_vehicle_models: { kind: "auto", make: "Toyota", model: "Corolla" },
      },
    ]);
  }
  // Pixels vendeur (0123) : seul le vendeur du produit « pixel-test » en a.
  if (url.pathname === "/rest/v1/zabelie_seller_pixels") {
    return single(eq(url, "seller_id") === PIXEL_SELLER ? [{ meta_pixel_id: "123456789012345", google_tag_id: "G-AB12CD34EF", tiktok_pixel_id: null }] : []);
  }
  // Points webhook (0122) : même simulation ; le secret n'est jamais relu.
  if (url.pathname === "/rest/v1/zabelie_webhook_endpoints") {
    let body = ""; req.on("data", c => body += c);
    return req.on("end", () => {
      if (req.method === "POST") {
        const row = { id: `dddddddd-dddd-4ddd-8ddd-${String(webhookPoints.length + 1).padStart(12, "0")}`, created_at: new Date().toISOString(), disabled_at: null, disabled_reason: null, ...JSON.parse(body) };
        webhookPoints.unshift(row);
        return single([sansSecret(row)]);
      }
      if (req.method === "PATCH") {
        const patch = JSON.parse(body), id = eq(url, "id"), seller = eq(url, "seller_id");
        const hits = webhookPoints.filter(p => p.id === id && p.seller_id === seller && !p.disabled_at);
        hits.forEach(p => Object.assign(p, patch));
        return single(hits.map(sansSecret));
      }
      return single(webhookPoints.map(sansSecret));
    });
  }
  // Clés d'API (0121) : table simulée en mémoire, avec le plafond ZB121 et le
  // filtre de révocation de la vraie route. Une seule spec l'utilise.
  if (url.pathname === "/rest/v1/zabelie_api_keys") {
    if (req.method === "POST") {
      let body = ""; req.on("data", c => body += c);
      return req.on("end", () => {
        const row = JSON.parse(body);
        if (apiKeys.filter(k => k.seller_id === row.seller_id && !k.revoked_at).length >= 5) {
          return send(400, { code: "ZB121", message: "ZB121 : 5 clés actives au plus par vendeur" });
        }
        const created = { id: `cccccccc-cccc-4ccc-8ccc-${String(apiKeys.length + 1).padStart(12, "0")}`, created_at: new Date().toISOString(), last_used_at: null, revoked_at: null, ...row };
        apiKeys.unshift(created);
        return single([created]);
      });
    }
    if (req.method === "PATCH") {
      let body = ""; req.on("data", c => body += c);
      return req.on("end", () => {
        const patch = JSON.parse(body), id = eq(url, "id"), seller = eq(url, "seller_id");
        const hits = apiKeys.filter(k => k.id === id && k.seller_id === seller && (url.searchParams.get("revoked_at") !== "is.null" || !k.revoked_at));
        hits.forEach(k => Object.assign(k, patch));
        return single(hits);
      });
    }
    const hash = eq(url, "key_hash");
    return single((hash ? apiKeys.filter(k => k.key_hash === hash) : apiKeys).map(k => ({ ...k, seller: { suspended_at: null } })));
  }
  if (url.pathname.startsWith("/rest/v1/profiles")) {
    if (BOUTIQUE_FIXTURE) {
      const ownShop = eq(url, "id") === SELLER_ID;
      return single([{ id: ownShop ? SELLER_ID : BUYER_ID, display_name: ownShop ? "Atelye Lakay" : "Acheteur test", role: ownShop ? "creator" : "buyer", boutik_slug: ownShop ? "atelye-lakay" : null }]);
    }
    return single([{ id: SELLER_ID, display_name: "Garaj Petyonvil", role: "creator" }]);
  }

  return single([]);
});

// PORTS HORS DE LA PLAGE ÉPHÉMÈRE (2026-10-04). Les stubs écoutaient sur
// 54321–54329, DANS la plage éphémère de Linux (32768–60999) : une connexion
// sortante de la suite précédente pouvait détenir ce port local par hasard,
// et `listen` échouait en EADDRINUSE avant qu'aucun test ne tourne (#251,
// #263, #272, puis #303, #309, #311 — la nouvelle tentative de 10 s s'est
// épuisée à 10,4 s sur #311). Ils écoutent désormais sur 15421–15429, que le
// noyau n'attribue jamais à une connexion sortante. `tests/e2e-ports.test.ts`
// interdit d'y revenir. La nouvelle tentative reste, en filet : un port peut
// encore être tenu par un processus de la suite précédente qui s'éteint.
const ESSAIS_MAX = 50;
const ATTENTE_MS = 200;
let essais = 0;
server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && ++essais < ESSAIS_MAX) {
    console.log(`stub Supabase : port ${PORT} occupé, nouvel essai ${essais}/${ESSAIS_MAX}`);
    setTimeout(() => server.listen(PORT), ATTENTE_MS);
    return;
  }
  throw err;
});
server.listen(PORT, () => console.log(`stub Supabase sur :${PORT}`));
