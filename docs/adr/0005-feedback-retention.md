# ADR 0005 — Retenção do feedback da Lia (LGPD)

Status: proposta. Data: 2026-10-07.

## Contexto
`assistant_feedback` guarda polegar, categoria e comentário livre ligados a uma resposta da Lia. O comentário pode conter dado pessoal.

## Decisão
- 0–90 dias: registro bruto.
- Após 90 dias: `comment` anonimizado (hash irreversível e remoção do texto original). `rating` e categoria permanecem para métricas.
- Após 12 meses: registro removido por `tools/db/cleanup-feedback.mjs` (manual pelo admin ou cron do Worker).
- O fluxo de exclusão de conta e de denúncias deve cobrir `assistant_feedback`.
- Atualizar `docs/POLITICA_DE_PRIVACIDADE.md` e a página de Privacidade (bump de `LEGAL_VERSIONS.PRIVACY`) antes do merge de D2.

## Consequências
O documento de LGPD citado no plano não existe como `docs/LGPD.md`; a fonte atual é a política de privacidade. Criar o arquivo novo só se a revisão jurídica pedir.
