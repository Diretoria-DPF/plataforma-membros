#!/usr/bin/env bash
# Valida o repositório no estado atual. Uso:
#   bash docs/atlas-continuacao/validar.sh              # rápido (sem e2e)
#   bash docs/atlas-continuacao/validar.sh --e2e atlas-offline atlas-quiz   # + e2e por prefixo de nome
# Sai com código 1 se qualquer passo falhar. Não altera arquivos versionados
# (o build só gera frontend/dist/, que não é commitado).
cd "$(dirname "$0")/../.." || exit 1
fail=0
passo() { # passo <pasta> <comando...>
  local dir=$1; shift
  echo "▶ ($dir) $*"
  if ! (cd "$dir" && "$@"); then echo "✘ FALHOU: ($dir) $*"; fail=1; fi
}
passo frontend node --test scripts/atlas/*.test.mjs
passo frontend node scripts/atlas/check-curated-signed.mjs
passo frontend node scripts/atlas/build-review-status.mjs --check
passo frontend node scripts/atlas/validate-curated.mjs
passo worker npm test --silent
passo worker npm run validate:sql --silent
passo frontend node scripts/build.js
if [ "${1:-}" = "--e2e" ]; then
  shift
  passo frontend node scripts/e2e/run.js "$@"
fi
if [ $fail -eq 0 ]; then echo "✔ tudo certo"; else echo "✘ há falhas (veja acima)"; fi
exit $fail
