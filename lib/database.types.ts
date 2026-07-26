// Types du schéma Zabelie (Vague 1).
// Reflètent supabase/migrations/0001_schema.sql.
// À terme, générables via `supabase gen types typescript`.

export type UserRole = "buyer" | "creator" | "admin";
// `physical` est accepté en base depuis `0036` (`alter type product_kind add
// value 'physical'`). L'union le connaît désormais : c'est ce qui force les
// rendus à traiter le cas au lieu de le laisser tomber dans un `else` écrit
// pour un fichier. Toute valeur ajoutée à l'énumération SQL doit être ajoutée
// ICI et dans `lib/sample-data.ts` — les `switch` exhaustifs cesseront alors
// de compiler tant que le nouveau cas n'est pas traité.
export type ProductKind = "fichier" | "service" | "physical";
export type ProductStatus = "draft" | "published" | "archived";
export type OrderStatus =
  | "pending"
  | "paid"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "disputed";
// 'natcash' en Vague 2 (bloqué). 'stripe'/'zelle' = rails diaspora USD (V-10).
export type PaymentRail = "moncash" | "stripe" | "zelle";
export type PaymentStatus = "pending" | "confirmed" | "failed";
export type WalletTxnType = "credit" | "debit" | "payout";
export type PayoutStatus = "requested" | "processing" | "paid" | "rejected";
export type CreatorTier = "standard" | "elite";

export type Profile = {
  id: string;
  role: UserRole;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  tier: CreatorTier;
  country_code: string | null;
  region_code: string | null;
  created_at: string;
};

export type PlatformEarning = {
  id: string;
  order_id: string;
  gross_htg: number;
  commission_htg: number;
  rate_bps: number;
  created_at: string;
};

export type ProductReview = {
  id: string;
  product_id: string;
  buyer_id: string;
  order_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  seller_id: string;
  slug: string;
  title: string;
  description: string | null;
  kind: ProductKind;
  category: string | null;
  price_htg: number;
  cover_url: string | null;
  status: ProductStatus;
  sales_count: number;
  rating_count: number;
  rating_sum: number;
  created_at: string;
};

export type ProductAsset = {
  id: string;
  product_id: string;
  storage_path: string;
  file_name: string;
  size_bytes: number | null;
  created_at: string;
};

export type Order = {
  id: string;
  buyer_id: string;
  product_id: string;
  amount_htg: number;
  status: OrderStatus;
  created_at: string;
};

export type Payment = {
  id: string;
  order_id: string;
  rail: PaymentRail;
  idempotency_key: string;
  provider_ref: string | null;
  /** Montant USD figé au checkout (rails diaspora) ; null pour MonCash. */
  expected_usd_cents: number | null;
  status: PaymentStatus;
  raw: Record<string, unknown> | null;
  confirmed_at: string | null;
  created_at: string;
};

export type Wallet = {
  id: string;
  owner_id: string;
  balance_htg: number; // disponible (retirable)
  pending_htg: number; // en attente de maturation (J+7)
  created_at: string;
};

export type EscrowStatus = "maturing" | "matured" | "reversed";

export type EscrowEntry = {
  id: string;
  order_id: string;
  wallet_id: string;
  amount_htg: number;
  matures_at: string;
  status: EscrowStatus;
  created_at: string;
};

export type WalletTransaction = {
  id: string;
  wallet_id: string;
  type: WalletTxnType;
  amount_htg: number;
  order_id: string | null;
  idempotency_key: string | null;
  reference: string | null;
  created_at: string;
};

export type Payout = {
  id: string;
  wallet_id: string;
  amount_htg: number;
  status: PayoutStatus;
  created_at: string;
};
