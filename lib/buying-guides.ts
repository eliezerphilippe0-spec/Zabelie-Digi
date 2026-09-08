import type { I18nKey, Lang } from "@/lib/i18n";
export type BuyingGuide = { slug: string; title: I18nKey; intro: I18nKey; sections: { title: I18nKey; body: I18nKey }[]; catalogue: string };
export const BUYING_GUIDES: BuyingGuide[] = [
  { slug: "acheter-en-haiti", title: "guides.objects.title", intro: "guides.objects.intro", catalogue: "/catalogue?univers=objets", sections: [
    { title: "guides.objects.check.title", body: "guides.objects.check.body" },
    { title: "product.handover.title", body: "guides.objects.handover.body" },
    { title: "aide.problem.receipt.title", body: "aide.problem.receipt.body" },
  ] },
  { slug: "produits-numeriques", title: "guides.digital.title", intro: "guides.digital.intro", catalogue: "/catalogue?univers=numerique", sections: [
    { title: "digital.title", body: "guides.digital.check.body" },
    { title: "digital.license", body: "guides.digital.license.body" },
    { title: "purchases.title", body: "guides.digital.access.body" },
  ] },
  { slug: "acheter-pour-un-proche", title: "guides.diaspora.title", intro: "guides.diaspora.intro", catalogue: "/catalogue?univers=objets", sections: [
    { title: "recipient.title", body: "guides.diaspora.prepare.body" },
    { title: "guides.payment.title", body: "guides.payment.body" },
    { title: "purchases.title", body: "recipient.authority" },
  ] },
];
export const guideHref = (lang: Lang, slug?: string) => `/guides/${lang}${slug ? `/${slug}` : ""}`;
