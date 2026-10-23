#!/usr/bin/env bash
# Regenera los .docx TÉCNICOS desde los .md (fuente de verdad) con pandoc.
# Uso:  bash docs/tools/build-docx.sh
# Requiere: pandoc. Los comerciales se generan con docs/venta/tools/build-docx.sh.
set -euo pipefail

DOCS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # docs/

PANDOC_OPTS=(--toc --toc-depth=3 -V lang=es-MX --standalone)

TECNICOS=(
  "SGS-Modulos-y-Funciones"
  "SGS-Secure-Access"
  "SGS-Integracion-SecurOS-ISS"
  "gps-guardias"
  "SCP-Portar-Mapa-Camaras-y-Chat"
)

for name in "${TECNICOS[@]}"; do
  echo "→ $name.docx"
  pandoc "$DOCS/$name.md" -o "$DOCS/$name.docx" "${PANDOC_OPTS[@]}"
done

echo "Listo. .docx técnicos regenerados en docs/"
