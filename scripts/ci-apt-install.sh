#!/usr/bin/env bash
# Installe des paquets apt en CI sans qu'une panne passagère des miroirs
# Ubuntu ne rougisse un contrôle qui n'a encore rien testé.
#
# POURQUOI — mesuré le 2026-11-11 : `sql-tests` a échoué trois fois de suite
# (PR #486 deux fois, PR #487 une fois) à « Install psql », avant tout test :
#
#   Temporary failure resolving 'azure.archive.ubuntu.com'
#   E: Failed to fetch …/postgresql-client_18+290ubuntu1_all.deb
#
# Deux défauts dans l'ancienne ligne `apt-get update && apt-get install` :
#
#   1. aucun réessai : une résolution DNS ratée, et le contrôle est rouge ;
#   2. `apt-get update` rend 0 même quand AUCUN miroir n'a répondu. Le `&&`
#      ne protège donc de rien, et l'échec n'apparaît qu'à l'installation.
#      Ici, chaque essai rejoue la paire entière.
#
# Et un troisième, propre à `psql` : le journal de l'échec disait « 1 newly
# installed, need to get 15.2 kB ». Le paquet demandé n'était qu'un
# méta-paquet ; le client était DÉJÀ sur le runner. Le contrôle mourait pour
# un téléchargement qui n'apportait rien. D'où `--si-absent`.
#
# Usage :
#   bash scripts/ci-apt-install.sh [--si-absent <commande>] [--sans-recommandes] <paquet>...
#
#   --si-absent <commande>   n'installe rien si <commande> est déjà sur le PATH
#                            (et le DIT : un saut silencieux ne se distingue pas
#                            d'une installation qui n'a pas eu lieu)
#   --sans-recommandes       passe --no-install-recommends
#
# Réglages (variables d'environnement) :
#   APT_ESSAIS   nombre d'essais, 4 par défaut
#   APT_PAUSE    pause de base en secondes, 15 par défaut ; elle double à
#                chaque essai (15, 30, 60 : 105 s d'attente au plus)
#   APT_GET      commande apt, « sudo apt-get » par défaut (les tests y
#                branchent un faux apt)
#
# CE QUE CE SCRIPT NE FAIT PAS : il ne rend jamais 0 sans que l'installation
# ait réussi. Après le dernier essai, il échoue, et il dit que la cause est
# l'infrastructure, pas le code. Une panne plus longue que la fenêtre de
# réessai rougit toujours le contrôle : c'est voulu.
set -euo pipefail

si_absent=""
recommandes=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --si-absent)
      [ "$#" -ge 2 ] || { echo "ci-apt-install : --si-absent attend une commande" >&2; exit 2; }
      si_absent="$2"; shift 2 ;;
    --sans-recommandes) recommandes=(--no-install-recommends); shift ;;
    --) shift; break ;;
    -*) echo "ci-apt-install : option inconnue : $1" >&2; exit 2 ;;
    *) break ;;
  esac
done
[ "$#" -ge 1 ] || { echo "ci-apt-install : aucun paquet demandé" >&2; exit 2; }

essais="${APT_ESSAIS:-4}"
pause="${APT_PAUSE:-15}"
case "$essais" in ''|*[!0-9]*|0) echo "ci-apt-install : APT_ESSAIS doit être un entier ≥ 1" >&2; exit 2 ;; esac
case "$pause" in ''|*[!0-9]*) echo "ci-apt-install : APT_PAUSE doit être un entier ≥ 0" >&2; exit 2 ;; esac
read -r -a apt <<< "${APT_GET:-sudo apt-get}"

if [ -n "$si_absent" ] && command -v "$si_absent" >/dev/null 2>&1; then
  echo "ci-apt-install : « $si_absent » est déjà présent ($(command -v "$si_absent")), rien à installer."
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
essai=1
while :; do
  echo "ci-apt-install : essai $essai sur $essais — $*"
  if "${apt[@]}" update && "${apt[@]}" install -y -o Acquire::Retries=3 "${recommandes[@]}" "$@"; then
    echo "ci-apt-install : installé à l'essai $essai."
    exit 0
  fi
  if [ "$essai" -ge "$essais" ]; then
    echo "::error title=Miroirs apt injoignables::ci-apt-install : $essais essais, aucun n'a abouti ($*). C'est une panne d'infrastructure du runner, pas un échec des tests : aucun test n'a tourné."
    exit 1
  fi
  echo "ci-apt-install : échec, nouvel essai dans ${pause} s."
  sleep "$pause"
  pause=$((pause * 2))
  essai=$((essai + 1))
done
