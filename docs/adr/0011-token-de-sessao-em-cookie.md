# ADR 0011: Token de sessão em cookie HttpOnly (SEC-08)

Status: aceita em 2026-10-17 e **implementada, com a flag desligada** (Worker: `sessionCookie.js` e `index.js`; front: `credentials: 'include'` nas duas chamadas de `app.js`; migração 041, que só semeia a flag). Nada muda para ninguém até a flag ser ligada: primeiro em staging, produção depois do roteiro de verificação abaixo.

## Contexto
O token de sessão (64 caracteres hexadecimais, o hash fica no banco) chega ao navegador no corpo da resposta de `apiLogin` e fica em `localStorage` (`pm_session`) e em `window.App.getState().sessionToken`. Qualquer script da mesma origem, inclusive os módulos em iframe e uma eventual falha de XSS, consegue lê-lo e usá-lo de outro lugar. Vale para todos, e para o admin é o pior caso (auditoria SEC-08 e SEC-10, riscos R7 e O37).

A API fica em `api.laift.com.br` e o site em `laift.com.br`: são origens diferentes, mas do mesmo site (mesmo domínio registrável). A cópia do GitHub Pages (`diretoria-dpf.github.io`) é outro site.

## Decisão
- **Cookie `__Host-pm_session`** definido pela API: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sem `Domain` (host-only, só vai para `api.laift.com.br`), `Max-Age` de 24 h. O valor é o mesmo token opaco de hoje; a validade de verdade continua no banco (deslizante, 30 min).
- **Resposta de login sem o token.** Em `apiLogin` e `apiLoginMfa`, com a flag ligada e a origem na lista permitida **e** no mesmo site da API (`SESSION_COOKIE_SITE`), o Worker troca `sessionToken` pelo marcador `"cookie"` e acrescenta `sessionCookie: true`. A cópia do GitHub Pages e clientes antigos continuam recebendo o token no corpo.
- **Marcador nas chamadas.** O front guarda o marcador no lugar do token e o manda como primeiro argumento (como já faz). O Worker troca o marcador pelo token do cookie antes de chamar o handler (`resolveArgs`). Nenhum handler muda.
- **Logout** (`apiLogout`) devolve o cookie expirado.
- **CORS com credenciais:** `Access-Control-Allow-Credentials: true` só para origens permitidas; o front chama com `credentials: 'include'` quando o marcador está em uso.
- **CSRF:** `SameSite=Lax` já impede o envio em POST de outro site; além disso, quando a sessão vem do cookie, o Worker exige `Origin` na lista permitida e do mesmo site, e recusa o resto.
- **Sem JavaScript no meio:** com o cookie, o token não existe mais no JavaScript da página. `getState().sessionToken` passa a valer `"cookie"` e `pm_session` guarda só o marcador (SEC-10 deixa de expor credencial; migrar os módulos para `getIdentity()` continua sendo limpeza, sem urgência).

## Alternativas rejeitadas
- **Cookie com `Domain=.laift.com.br`:** o cookie iria também ao site estático e a qualquer subdomínio, sem necessidade. O host-only basta, porque só a API precisa dele.
- **Token em memória (sem `localStorage`):** não resolve a leitura por script e derruba a sessão a cada recarga.
- **Tirar a cópia do GitHub Pages do ar agora:** decisão do dono em 2026-10-14 é manter o Pages; ele segue no modo antigo (token no corpo) até ser desligado.

## Consequências
- **Risco de quebra:** qualquer cliente que chame a API sem `credentials: 'include'` perde a sessão. Por isso a flag existe e o roteiro abaixo é obrigatório.
- **iPhone/Safari:** cookies de terceiros bloqueados não afetam, porque site e API são do mesmo site (primeira parte). Testar em Safari real.
- **Cópia do GitHub Pages:** continua com o token em `localStorage` (risco aceito até desligá-la); o administrador não deve usar o Pages.
- **Rollback:** desligar `session_cookie_enabled` (as sessões em cookie já abertas continuam válidas até expirar; quem entrar depois recebe o token no corpo). Reversão do arquivo: `sql/down/041_session_cookie_flag.sql`.

## Roteiro de ativação
1. Mesclar a PR (a flag está desligada; nada muda para ninguém).
2. Em staging: definir `SESSION_COOKIE_SITE=laift.com.br` (variável do Worker), ligar a flag, e testar: login, MFA, recarregar a página, trocar de painel, logout, abrir dois navegadores, Safari/iPhone, e confirmar no DevTools (Application) que `pm_session` do `localStorage` guarda só `cookie` e que o cookie está `HttpOnly`.
3. Produção: definir a variável, ligar a flag para o admin primeiro (condição `role=admin`), depois 100%.
