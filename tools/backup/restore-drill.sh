#!/usr/bin/env bash
# Plataforma de Membros LAIFT
# © 2026 Daniel Pires Francisco. Todos os direitos reservados.
# Licença proprietária: ver LICENSE na raiz do repositório.
#
# Teste de restauração do backup (docs/BACKUP_RESTORE.md). Decifra um dump
# do R2 e restaura numa BRANCH VAZIA do Neon — nunca na produção — para provar
# que o backup funciona. Rode ao menos uma vez por trimestre.
#
#   ./tools/backup/restore-drill.sh <dump.age> <chave-privada-age.txt>
#
# A URL da branch de teste vem do ambiente (não de argumento, para não ficar no
# histórico do shell):
#   export RESTORE_DATABASE_URL='postgresql://...branch-de-teste...'
set -euo pipefail

DUMP="${1:?uso: restore-drill.sh <dump.age> <chave-privada-age.txt>}"
KEY="${2:?uso: restore-drill.sh <dump.age> <chave-privada-age.txt>}"
: "${RESTORE_DATABASE_URL:?defina RESTORE_DATABASE_URL com a URL da branch de TESTE}"

for tool in age pg_restore psql; do
  command -v "$tool" >/dev/null || { echo "Falta o programa: $tool" >&2; exit 1; }
done

# Trava de segurança: recusa uma URL que pareça a de produção definida no ambiente.
if [ -n "${PRODUCTION_DATABASE_URL:-}" ] && [ "$RESTORE_DATABASE_URL" = "$PRODUCTION_DATABASE_URL" ]; then
  echo "RESTORE_DATABASE_URL é igual à de produção. Abortado." >&2
  exit 1
fi

# A branch precisa estar vazia: restaurar por cima de dados mascararia falhas.
EXISTING=$(psql "$RESTORE_DATABASE_URL" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
if [ "$EXISTING" != "0" ]; then
  echo "A branch de teste já tem $EXISTING tabela(s). Use uma branch vazia." >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "1/3 Decifrando..."
age -d -i "$KEY" -o "$WORK/dump.custom" "$DUMP"

echo "2/3 Restaurando na branch de teste..."
pg_restore --no-owner --no-privileges --exit-on-error --dbname "$RESTORE_DATABASE_URL" "$WORK/dump.custom"

echo "3/3 Conferindo..."
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "
  SELECT 'tabelas', count(*) FROM information_schema.tables WHERE table_schema = 'public';
  SELECT 'profiles', count(*) FROM profiles;
  SELECT 'events', count(*) FROM events;
  SELECT 'audit_logs', count(*) FROM audit_logs;"

echo "Restauração concluída. Confira os números acima com a produção e apague a branch de teste."
