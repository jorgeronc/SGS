#!/usr/bin/env bash
# Regenera los .docx comerciales desde los .md (fuente de verdad) con pandoc.
# Uso:  bash docs/venta/tools/build-docx.sh
# Requiere: pandoc (https://pandoc.org). Los .md viven en docs/venta/ y docs/.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # docs/venta
ROOT="$(cd "$HERE/.." && pwd)"                             # docs

PANDOC_OPTS=(--toc --toc-depth=2 -V lang=es-MX --standalone)

gen() {  # gen <md> <docx>
  echo "→ $2"
  pandoc "$1" -o "$2" "${PANDOC_OPTS[@]}"
}

# Comerciales (docs/venta)
gen "$HERE/SGS-Propuesta-Comercial.md" "$HERE/SGS-Propuesta-Comercial.docx"
gen "$HERE/SGS-Precios.md"             "$HERE/SGS-Precios.docx"
gen "$HERE/SGS-Precios-Interno.md"     "$HERE/SGS-Precios-Interno.docx"
gen "$HERE/SGS-Flujo-Operativo.md"     "$HERE/SGS-Flujo-Operativo.docx"
# Comparativa (docs/)
gen "$ROOT/SGS-vs-Clave10-Comparativa.md" "$HERE/SGS-vs-Clave10-Comparativa.docx"

echo "Listo. .docx regenerados en docs/venta/"
