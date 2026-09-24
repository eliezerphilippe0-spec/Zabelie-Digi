import type { SupabaseClient } from "@supabase/supabase-js";

export type Suspension = { suspendedAt: string; reason: string | null };

export class AccountStatusUnavailable extends Error {
  constructor() { super("account_status_unavailable"); }
}

/** A missing profile or failed read is not proof of an active account. */
export async function readSuspension(admin: SupabaseClient, userId: string): Promise<Suspension | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const { data, error } = await admin.from("profiles")
      .select("suspended_at, suspended_reason").eq("id", userId)
      .abortSignal(controller.signal).maybeSingle();
    if (error || !data) throw new AccountStatusUnavailable();
    return data.suspended_at ? { suspendedAt: data.suspended_at, reason: data.suspended_reason } : null;
  } catch { throw new AccountStatusUnavailable(); }
  finally { clearTimeout(timeout); }
}
