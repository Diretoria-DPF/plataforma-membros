# Backup e restauração do banco

Backup diário do Postgres (Neon), **cifrado antes de sair do runner** e guardado no
Cloudflare R2. Workflow: `.github/workflows/backup.yml`. Teste de restauração:
`tools/backup/restore-drill.sh`.

| Camada | Cobre | Retenção |
|---|---|---|
| PITR do Neon | erro recente (volta no tempo dentro da janela do plano) | a do plano |
| `daily/` no R2 | perda de projeto, exclusão acidental | 7 dias |
| `monthly/` no R2 | corrupção descoberta tarde | 400 dias (~13 meses) |
| Artefato mensal do GitHub | cópia fora do R2 (só repositório privado) | 90 dias |

## Configurar (uma vez)

1. **Chave age** — na sua máquina (a privada **nunca** vai ao GitHub ou ao chat):
   ```bash
   age-keygen -o laift-backup.key      # imprime a chave pública (age1...)
   ```
   Guarde `laift-backup.key` em **dois** lugares fora do computador de trabalho
   (gerenciador de senhas + pendrive/cofre). Sem ela, os backups não abrem.
2. **Papel de leitura total no Neon** (console → Roles) com login próprio, por
   exemplo `laift_backup`, e conceda a leitura de tudo no SQL Editor:
   `GRANT pg_read_all_data TO laift_backup;`. Use a **URL direta** (sem `-pooler`):
   o `pg_dump` não funciona pelo pooler.
3. **R2**: crie um bucket só para backup (privado) e um token de API com permissão
   *Object Read & Write* limitado a esse bucket.
4. **Secrets do repositório** (`gh secret set <NOME>`, digitando/colando o valor no
   prompt): `BACKUP_DATABASE_URL`, `BACKUP_AGE_PUBLIC_KEY` (a pública, `age1...`),
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET`.
   Variável opcional: `PG_MAJOR` (padrão 17; precisa ser ≥ à versão do servidor).
5. Rode uma vez à mão: *Actions → Backup do banco → Run workflow*. Atenção: o job
   AGENDADO (todo dia, 05:30 UTC) **falha** (fica vermelho) enquanto os secrets faltarem;
   só a execução manual termina com aviso (`::warning::`). Com os secrets, falha de
   verdade se algo estiver errado e abre uma Issue com a label `backup`.

### Roteiro dos 6 secrets

Caminho recomendado: `powershell -File tools\ci\registrar-segredos-backup.ps1`. Ele gera
a chave age fora do repositório (`%USERPROFILE%\laift-backup-chave`), pede cada valor
sem eco e cadastra os 6 secrets com `gh secret set`.

| Nome | De onde vem | Formato esperado (sem valor real) | Observação |
|---|---|---|---|
| `BACKUP_DATABASE_URL` | Neon → Roles → papel `laift_backup`, URL direta (sem `-pooler`) | `postgresql://laift_backup:<senha>@<host-direto>/<banco>?sslmode=require` | Papel próprio de leitura total, não o da aplicação |
| `BACKUP_AGE_PUBLIC_KEY` | Saída do `age-keygen` (chave pública) | `age1…` | A chave privada nunca vai ao repositório nem ao chat |
| `R2_ACCOUNT_ID` | Painel da Cloudflare (ID da conta) | `<id-da-conta>` | Compõe o endpoint `https://<id-da-conta>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | Token de API do R2 (*Object Read & Write*, limitado ao bucket) | `<id-da-chave>` | Par com `R2_SECRET_ACCESS_KEY` |
| `R2_SECRET_ACCESS_KEY` | Mesmo token de API do R2 | `<chave-secreta>` | Par com `R2_ACCESS_KEY_ID` |
| `R2_BACKUP_BUCKET` | Bucket R2 privado criado para o backup | `<nome-do-bucket>` | Usado só para backup |

- (a) Quem digita os valores é o dono, no terminal, nunca no chat.
- (b) Conferir só os nomes com `gh secret list` (ou `powershell -File tools\ci\registrar-segredos-backup.ps1 -SomenteVerificar`).
- (c) Rodar "Backup do banco" uma vez à mão, com o OK do dono.

## Restaurar (e treinar a restauração)

Faça o **teste de restauração a cada trimestre** e depois de qualquer mudança no
processo. Um backup que nunca foi restaurado é uma hipótese.

1. Baixe o dump do R2 (painel da Cloudflare ou `aws s3 cp --endpoint-url ...`).
2. No Neon, crie uma **branch vazia** só para o teste (nunca restaure sobre a produção).
3. Rode:
   ```bash
   export RESTORE_DATABASE_URL='<URL da branch de teste>'
   ./tools/backup/restore-drill.sh laift-AAAA-MM-DDTHHMMSSZ.dump.age laift-backup.key
   ```
   O script decifra, restaura e imprime as contagens de `profiles`, `events` e
   `audit_logs` para você conferir com a produção.
4. Apague a branch de teste e registre a data e o resultado no `docs/CHANGELOG.md`.

### Restauração de verdade (desastre)
1. Crie um projeto/branch novo no Neon; restaure com o mesmo script.
2. Aplique, se faltar, as migrações posteriores ao dump (`sql/NNN_*.sql`).
3. Troque o secret `DATABASE_URL` do Worker (`wrangler secret put DATABASE_URL`) e faça
   o deploy. As sessões continuam válidas (estão no banco).
4. Se o `SESSION_TOKEN_PEPPER` ou o `MFA_ENCRYPTION_KEY` mudaram desde o dump, sessões
   e segredos de MFA ficam inválidos: mantenha esses dois segredos em cofre.

## Papel somente leitura (relatórios)
`sql/ops/readonly_role.sql` cria `laift_readonly`, que enxerga só tabelas sem dado
sensível e, em `profiles`, só colunas sem e-mail, telefone ou senha. Ver o cabeçalho
do arquivo para o `CREATE ROLE ... LOGIN` (senha digitada por você).
