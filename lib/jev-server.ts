import "server-only";
import { classifyWithJev } from "@/lib/jev";

export function jevConfigured(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

export async function classifySupportMessage(message: string) {
  return classifyWithJev(message, process.env.TYPESAFE_API_KEY?.trim() ?? "");
}
