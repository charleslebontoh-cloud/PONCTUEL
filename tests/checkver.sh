#!/bin/sh
# Vérifie que le numéro de version du code est cohérent avant publication
cd "$(dirname "$0")/.." || exit 1
a=$(grep -o "app.js?v=[0-9]*" index.html); b=$(grep -o "app.js?v=[0-9]*" sw.js)
[ "$a" = "$b" ] || { echo "ERREUR version index ($a) != sw ($b)"; exit 1; }
last=$(git show HEAD:index.html | grep -o "app.js?v=[0-9]*")
if ! git diff --quiet HEAD -- app.js && [ "$a" = "$last" ]; then echo "ERREUR app.js modifié mais version inchangée ($a)"; exit 1; fi
echo "version OK : $a"
