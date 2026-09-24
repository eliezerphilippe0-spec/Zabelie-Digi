import { z } from "zod";
export const supportReasons = ["debited", "not_received", "wrong", "digital", "other"] as const;
export const caseStatuses = ["open", "waiting_buyer", "waiting_seller", "resolved"] as const;
export const supportInput = z.object({
  orderId: z.string().uuid(), requestId: z.string().uuid(),
  reason: z.enum(supportReasons), message: z.string().trim().min(10).max(2000),
}).strict();
export const caseUpdateInput = z.object({
  orderId: z.string().uuid(), requestId: z.string().uuid(),
  status: z.enum(caseStatuses), message: z.string().trim().min(10).max(2000),
}).strict();
export type SupportCase = {
  id: string; order_id: string; reason: typeof supportReasons[number]; status: typeof caseStatuses[number];
  created_at: string; updated_at: string; response_due_at: string; opened_by: string;
};
export type SupportMessage = { id: string; author_id: string; author_role: "buyer" | "seller" | "admin"; body: string; created_at: string };
