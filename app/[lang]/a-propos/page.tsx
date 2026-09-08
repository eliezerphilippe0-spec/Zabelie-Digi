import { notFound } from "next/navigation";
import { isLang } from "@/lib/i18n";
import Page, { generateMetadata as metadata } from "../../a-propos/page";

type Props = { params: Promise<{ lang: string }> };
export async function generateMetadata({ params }: Props) {
  if (!isLang((await params).lang)) notFound();
  return metadata();
}
export default async function LocalizedPage({ params }: Props) {
  if (!isLang((await params).lang)) notFound();
  return <Page />;
}
