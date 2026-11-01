# Coleta de erros do navegador (OPS-08)

Painel simples dos erros de JavaScript que as pessoas encontram, sem terceiros e sem dados pessoais.

## Como funciona
- `frontend/client-errors.js` escuta `error` e `unhandledrejection` e chama a ação pública `apiLogClientError`.
- Cada relato leva só: mensagem curta (até 200 caracteres), tipo (`error` ou `rejection`), caminho da página (sem query nem hash), classe de navegador (chrome, safari, firefox, edge, samsung, opera, other) e versão do app (`data-app-version` em `index.html`, igual ao cache do `sw.js`).
- Dedupe por aba (o mesmo erro vai uma vez) e teto de 5 relatos por sessão. Falha ao relatar é silenciosa.
- O Worker limpa de novo (e-mail, token, URL com query, UUID e números longos saem), calcula uma impressão digital e faz UPSERT em `client_errors` (contador por impressão). Limite por IP (20/h) e teto de 2000 linhas; corpo máximo de 4 KB. Nunca devolve erro ao cliente.
- Retenção: 30 dias (`clientErrorsPurge` em `worker/src/maintenance.js`).

## Painel
Em Admin > Visão geral, abaixo de "Uso da plataforma", lista os 20 erros mais frequentes dos últimos 7 dias (ação `apiAdminClientErrors`, capacidade `metrics.read`).

## Migração
`sql/045_client_errors.sql` (reversão em `sql/down/`). Quem aplica é o dono do banco. Sem a tabela, o Worker degrada: o relato é descartado e o painel mostra que a coleta ainda não foi ativada.

## O que NÃO entra
IP, e-mail, token, cookie, perfil, query string, texto da tela e user agent completo.
