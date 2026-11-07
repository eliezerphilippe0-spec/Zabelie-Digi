#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DÉCOUPE DE LA POLICE D'ACCENT — reproductible, sur le modèle d'Inter
# (scripts/decouper-police-inter.sh). Décision V-25 A3, docs/design/AUDIT-0.md.
#
# Produit `app/fonts/InstrumentSerifZabelie.woff2`, chargé par `app/layout.tsx`
# via `next/font/local`, employé par `.mot-accent` (app/globals.css).
#
# POURQUOI PAS `next/font/google` : le sous-ensemble `latin` pèse 22 128 octets
# et porterait le total des polices à 98,7 Ko, au-delà du budget de 90 Ko.
#
# CE QUI EST GARDÉ : les lettres et les accents des quatre langues du site,
# l'espace, l'apostrophe et le trait d'union, plus le crénage.
# CE QUI EST RETIRÉ : les chiffres et la ponctuation. Conséquence, tenue par
# `tests/police-accent.test.ts` : un mot d'accent ne porte ni chiffre ni
# ponctuation, sinon le navigateur irait les chercher dans la police de repli.
#
# Licence : SIL Open Font License 1.1 — découpe et auto-hébergement permis, la
# licence voyage avec le fichier (`app/fonts/InstrumentSerif-LICENSE.txt`).
#
# Prérequis : `pip install fonttools brotli`, et `npm` (registre public).
# Usage     : bash scripts/decouper-police-accent.sh
#             PYTHON=python bash scripts/decouper-police-accent.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

VERSION="5.3.0"
PYTHON="${PYTHON:-python3}"
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
SORTIE="$RACINE/app/fonts/InstrumentSerifZabelie.woff2"
TRAVAIL="$(mktemp -d)"
trap 'rm -rf "$TRAVAIL"' EXIT

"$PYTHON" -P -c "import fontTools, brotli" || { echo "✗ fonttools ou brotli absent — pip install fonttools brotli" >&2; exit 1; }

# 1. La source, épinglée — jamais « latest ».
( cd "$TRAVAIL" && npm pack "@fontsource/instrument-serif@$VERSION" --silent >/dev/null && tar xzf fontsource-instrument-serif-*.tgz )
SOURCE="$TRAVAIL/package/files/instrument-serif-latin-400-italic.woff2"

# 2. Le périmètre. Les accents en FIN de mot (vandè, bò, lè) sont le piège du
#    kreyòl : ils sont listés un par un, jamais par plage.
BASE="U+0020,U+0027,U+002D,U+2019,U+0041-005A,U+0061-007A"
#    à â ç è é ê ë î ï ò ô ù û ü, puis les majuscules utiles, puis l'espagnol.
FR_HT="U+00E0,U+00E2,U+00E7,U+00E8,U+00E9,U+00EA,U+00EB,U+00EE,U+00EF,U+00F2,U+00F4,U+00F9,U+00FB,U+00FC"
MAJ="U+00C0,U+00C7,U+00C8,U+00C9,U+00CA,U+00D1,U+00D2,U+00D4"
ES="U+00E1,U+00ED,U+00F1,U+00F3,U+00FA"

mkdir -p "$(dirname "$SORTIE")"
"$PYTHON" -P -m fontTools.subset "$SOURCE" \
  --unicodes="$BASE,$FR_HT,$MAJ,$ES" \
  --layout-features="kern" \
  --name-IDs+=13,14 \
  --flavor=woff2 \
  --output-file="$SORTIE"
cp "$TRAVAIL/package/LICENSE" "$RACINE/app/fonts/InstrumentSerif-LICENSE.txt"

echo "✓ $SORTIE"
echo "  $(stat -c%s "$SORTIE") octets · sha256 $(sha256sum "$SORTIE" | cut -d' ' -f1)"
echo "  Vérification : node --import tsx --test tests/police-accent.test.ts"
