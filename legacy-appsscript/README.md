# Backend legado (Google Apps Script) — arquivado, não é mais o que está no ar

Este diretório guarda a **primeira versão real do backend**, implementada em
Google Apps Script (`HtmlService` + `google.script.run`, depois evoluída para
uma API JSON via `doPost`). Ela foi **substituída por completo** pelo backend
em `../worker/` (Cloudflare Workers) porque o Apps Script tinha um problema
estrutural de latência: cada consulta ao Neon abria uma conexão JDBC nova
(handshake TCP/TLS completo), e rotas com várias consultas sequenciais
levavam de 3 a 5 segundos para responder. Não era um bug pontual — era a
arquitetura. Ver `../docs/DEPLOYMENT.md` para o histórico completo da
migração.

## Por que isto não foi simplesmente apagado

- **Referência histórica**: todas as decisões de segurança documentadas em
  `../docs/SECURITY.md` foram validadas primeiro aqui, e o código mostra a
  forma original de cada uma delas (ex.: por que `google.script.run` tornava
  CSRF um não-problema estrutural, antes da separação front/back).
- **Rollback**: se algo grave for encontrado no backend novo, esta versão
  ainda pode ser reimplantada — o deployment do Apps Script continua existindo
  na conta Google do projeto (só não é mais o que o front-end chama).
- Os dois bugs reais e sutis encontrados em produção durante o uso do Apps
  Script (ordem alfabética de carregamento de arquivo, scriptlet fantasma
  vinda de um comentário) só são reproduzíveis nesse runtime específico — os
  testes que os capturam (`tests/loadOrder.test.js`,
  `tests/htmlTemplateSafety.test.js`) só fazem sentido aqui.

## O que NÃO fazer

- **Não adicione funcionalidade nova aqui.** Qualquer mudança de negócio
  (nova rota, novo campo, nova regra) deve ir para `../worker/` — que é o
  que está realmente no ar.
- **Não trate isto como fallback automático.** Se o backend novo cair, a
  correção é consertar `../worker/`, não reativar isto às pressas — as duas
  versões já divergem (rate limit, e-mail, etc.) e mantê-las sincronizadas
  não é um objetivo deste projeto.

## Como rodar os testes desta versão (se precisar)

```bash
cd legacy-appsscript
npm install
npm test
npm run lint
```
