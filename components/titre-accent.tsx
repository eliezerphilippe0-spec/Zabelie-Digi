/**
 * TITRE À MOT D'ACCENT — chantier design, Phase 3.1 (V-25 A2, A3).
 *
 * Le titre reste UNE chaîne i18n, inchangée : elle sert aussi ailleurs
 * (`launch.title` sur « Ouvrir ma boutique »), et y glisser des marques de
 * mise en forme les ferait fuir dans ces autres emplois. Le mot d'accent est
 * désigné par une seconde clé, et ce composant le retrouve dans le titre.
 *
 * Un mot introuvable (traduction modifiée d'un côté seulement) ne casse rien :
 * le titre s'affiche sans accent, et le manque est journalisé, parce qu'un
 * accent qui disparaît en silence ne se verrait jamais en revue.
 * `tests/hero-accueil.test.ts` vérifie que chaque mot figure une fois dans
 * son titre, dans les quatre langues, et que la police d'accent porte chacune
 * de ses lettres.
 */
export function TitreAccent({ texte, accent }: { texte: string; accent: string }) {
  const i = accent ? texte.indexOf(accent) : -1;
  if (i < 0) {
    console.warn("[titre-accent] mot d'accent absent du titre :", JSON.stringify(accent), "dans", JSON.stringify(texte));
    return <>{texte}</>;
  }
  return (
    <>
      {texte.slice(0, i)}
      <span className="mot-accent">{accent}</span>
      {texte.slice(i + accent.length)}
    </>
  );
}
