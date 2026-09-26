#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DÉCOUPE D'INTER 4.1 POUR ZABELIE — reproductible, pas une commande perdue.
#
# Produit `app/fonts/InterZabelie-4.1.1.woff2`, chargé par `app/layout.tsx`
# via `next/font/local`. Audit : `docs/REVUE-2026-09-26-typographie.md`.
#
# POURQUOI PAS L'INTER DE GOOGLE (celle de `next/font/google`) : son
# sous-ensemble `latin` est AMPUTÉ — ni flèches, ni coche, ni étoile, ni `⚠`,
# et ni zéro barré (`zero`) ni `l` distinct (`cv05`). Mesuré au moteur de
# rendu : `✓` ×51, `→` ×12, `★` ×7… étaient dessinés par la police du
# TÉLÉPHONE, pas par celle de la marque. Cette découpe les contient.
#
# CE QUI EST GARDÉ :
#   • latin (le même périmètre que Google) + accents COMBINANTS U+0300-0301,
#     pour le kreyòl saisi en forme décomposée ;
#   • les symboles d'interface réellement employés par le site ;
#   • l'axe de graisse `wght` 100→900 (UNE police variable, aucun faux gras) ;
#   • l'axe de taille optique `opsz` est FIGÉ à 14 (texte courant) : les
#     titres sont en Manrope, et à taille mobile la variante « titrage »
#     coûtait 27 Ko pour une différence que l'écran visé ne rend pas.
#
# Licence : SIL Open Font License 1.1 — découpe et auto-hébergement permis,
# la licence voyage avec le fichier (`app/fonts/Inter-LICENSE.txt`).
#
# Prérequis : `pip install fonttools brotli`, et `npm` (registre public).
# Usage     : bash scripts/decouper-police-inter.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

VERSION="4.1.1"
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SORTIE="$RACINE/app/fonts/InterZabelie-$VERSION.woff2"
TRAVAIL="$(mktemp -d)"
trap 'rm -rf "$TRAVAIL"' EXIT

command -v pyftsubset >/dev/null || { echo "✗ pyftsubset absent — pip install fonttools brotli" >&2; exit 1; }

# 1. La source, épinglée — jamais « latest » : une découpe doit pouvoir être
#    refaite à l'identique.
( cd "$TRAVAIL" && npm pack "inter-ui@$VERSION" --silent >/dev/null && tar xzf inter-ui-*.tgz )
SOURCE="$TRAVAIL/package/variable/InterVariable.woff2"

# 2. Taille optique figée à 14 (texte), graisse laissée variable.
python3 - "$SOURCE" "$TRAVAIL/inter-opsz14.ttf" <<'PY'
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
t = TTFont(sys.argv[1]); t.flavor = None
instantiateVariableFont(t, {"opsz": 14}).save(sys.argv[2])
PY

# 3. Le périmètre.
#    LATIN : identique au sous-ensemble `latin` de Google Fonts, plus U+0300-0301.
LATIN="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2212,U+2215,U+FEFF,U+FFFD"
#    UI : flèches ← ↑ → ↓ ↗…, ✓ ★ ☆ ≥ ≤ ≈ ≠ ∞ ⚠ ● ○ ▶ ⊘. `✕` n'existe pas dans
#    Inter : le site emploie `×` (U+00D7, déjà dans LATIN).
UI="U+2190-2199,U+2713,U+2605-2606,U+2264-2265,U+2248,U+2260,U+221E,U+26A0,U+25CF,U+25CB,U+25B6,U+2298"
#    Fonctionnalités : crénage, marques (accents combinants), chiffres
#    tabulaires/proportionnels, zéro barré, `l` distinct, formes capitales,
#    fractions. Rien de décoratif.
#    Métadonnées : `pyftsubset` ne garde par défaut que les noms 0 à 6. On y
#    ajoute 13 (texte de licence) et 14 (adresse de la licence) : servir une
#    police sur le web, c'est la DISTRIBUER, et l'OFL veut que la licence
#    accompagne chaque copie. L'Inter de Google gardait le 14 ; la première
#    version de ce script les perdait tous deux.
FEATURES="kern,calt,ccmp,locl,mark,mkmk,tnum,pnum,zero,cv05,case,frac,numr,dnom"

mkdir -p "$(dirname "$SORTIE")"
pyftsubset "$TRAVAIL/inter-opsz14.ttf" \
  --unicodes="$LATIN,$UI" \
  --layout-features="$FEATURES" \
  --name-IDs+=13,14 \
  --flavor=woff2 \
  --output-file="$SORTIE"
cp "$TRAVAIL/package/LICENSE.txt" "$RACINE/app/fonts/Inter-LICENSE.txt"

echo "✓ $SORTIE"
echo "  $(stat -c%s "$SORTIE") octets · sha256 $(sha256sum "$SORTIE" | cut -d' ' -f1)"
echo "  Vérification : npm test -- tests/police-inter.test.ts"
