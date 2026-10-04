# infra/

Material de infraestrutura que **não** está em produção. Nada aqui é implantado por CI.

| Pasta | O que é | Estado |
|---|---|---|
| `9drive/` | Esboço de gateway para agregar contas do Google Drive como armazenamento pesado | Referência; ativar só por gatilho em `docs/backlog-futuro.md` |

## Camadas de armazenamento
1. **Neon (Postgres)** — dados transacionais, metadados, logs e auditoria (fonte da verdade).
2. **Cloudflare R2** — avatares, imagens de evento, PDFs gerados e backups cifrados (arquivos < 100 MB).
3. **9drive / Google Drive** — só se um gatilho ocorrer: modelos 3D > 100 MB, vídeos de aula, retenção longa de backups. Sem dados pessoais.

## Regras
- O arquivo `.env` do 9drive fica **fora do git**; este repositório só traz os nomes das variáveis.
- Antes de qualquer migração R2 → Drive: backup, referência atualizada no Neon e só então exclusão no R2.
- O subdomínio `storage.laift.com.br` só é criado quando houver servidor para ele.
