#!/usr/bin/env bash
# Confere se cada caminho citado entre crases nos cartões e guias existe.
# Ignora: linhas com "(novo)", caminhos com marcador de lugar (N, NN) e os arquivos
# da lista ARQUIVOS_FUTUROS (criados por tarefas ainda não feitas). Quando uma tarefa
# criar o arquivo, ele passa a ser conferido normalmente: tire-o da lista.
cd "$(dirname "$0")/../.." || exit 1
faltam=0
ARQUIVOS_FUTUROS=(
  frontend/scripts/atlas/aplicar-lote.mjs frontend/scripts/atlas/aplicar-lote.test.mjs
  frontend/scripts/atlas/aplicar-quiz.mjs frontend/scripts/atlas/aplicar-quiz.test.mjs
  frontend/vendor/chartjs/ docs/atlas-qa/teste-papel-visao-sistemica.md docs/atlas-qa/post-mortem-onda-3-5.md
)
while IFS= read -r linha; do
  arq=${linha%%:*}; resto=${linha#*:}
  case "$resto" in *"(novo)"*) continue;; esac
  for caminho in $(echo "$resto" | grep -oE '`(frontend|worker|docs|sql|tools)/[^`<>* ]+`' | tr -d '`'); do
    caminho=${caminho%%#*}
    case "$caminho" in *-N.*|*NN*|*-N/*) continue;; esac
    for f in "${ARQUIVOS_FUTUROS[@]}"; do [ "$caminho" = "$f" ] && continue 2; done
    [ -e "$caminho" ] || { echo "FALTA: $caminho  (em $arq)"; faltam=1; }
  done
done < <(grep -rn --include=*.md '`\(frontend\|worker\|docs\|sql\|tools\)/' docs/atlas-continuacao)
[ $faltam -eq 0 ] && echo "✔ todos os caminhos citados existem"
exit $faltam
