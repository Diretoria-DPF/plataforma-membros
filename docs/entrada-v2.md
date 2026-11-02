# Entrada v2

Tela de abertura para quem ainda não entrou, atrás da flag `entrada_v2_enabled` (desligada por padrão). Com a flag desligada, a tela de login e cadastro de sempre fica idêntica.

## O que é

- Herói com a promessa, "Criar conta" e o link "Conheça a LAIFT" (leva a `liga.html`).
- Seção "Explore a LAIFT" logo abaixo da vitrine: Conheça a LAIFT, Blog, Biblioteca e Processo seletivo, em botões grandes (o rodapé continua com os links legais e os mesmos atalhos).
- Vitrine "O que a plataforma oferece": cinco cartões deslizantes com cadeado (quiz do dia, Atlas 3D, a Guia, casos clínicos, Liga) que levam ao cadastro.
- "Como funciona" em três passos.
- "Acontecendo na Liga" e "Novidades do blog": só aparecem com dado real. Eventos vêm de `apiListEvents` sem sessão (apenas os públicos, futuros ou em andamento); o blog vem de `blog/index.json`. Sem dado, a seção fica escondida. Nada é inventado.
- Barra fixa de convite no celular (some a partir de 900 px).
- Folha com as abas Entrar e Criar conta (folha de baixo no celular, janela centralizada a partir de 768 px).
- Links Termos, Privacidade, Blog, Processo seletivo, Biblioteca e Conheça a LAIFT no rodapé.

## Como funciona por dentro

- `frontend/entrada-v2.js` e `frontend/entrada-v2.css` formam o pacote sob demanda `entradaV2` (`lazy-bundles.js`). Não estão no `index.html` nem no precache do service worker; o orçamento do shell não muda.
- `app.js` (`mountEntradaV2`) baixa o pacote só quando o `<html>` tem `data-flag-entrada-v2-enabled` (aplicado por `ux-v2.js` a partir de `apiGetFeatureFlags`) e não há sessão. Depois do login, ou com a flag desligada, `LaiftEntradaV2.reset()` devolve cada elemento ao lugar original.
- A folha NÃO tem formulários próprios. Ela recebe os mesmos elementos do `index.html`: `#form-login`, `#form-login-mfa`, `#msg-login`, `#login-inscricao-aviso`, `#form-register` e `#msg-register`. Por isso validações, MFA, "Esqueci minha senha", caixas de termos, `app.js`, `mfa.js`, `entrada.js` e `resend-confirmation.js` seguem iguais.
- "Esqueci minha senha" fecha a folha e abre a tela de redefinição de sempre; voltar leva à Entrada v2.
- Pedidos de cadastro feitos pelo app (`#cadastro`, botão "Criar conta" do aviso do processo seletivo) abrem a aba Criar conta. `#entrar` e `#inscricao` abrem a aba Entrar (`window.APP_PUBLIC_HASH`).
- Mensagens de `#msg-login` com a folha fechada (por exemplo, e-mail confirmado) aparecem em uma faixa no topo da página.

## Acessibilidade

Dialog modal com foco preso e Esc, devolvendo o foco a quem abriu; abas com `role=tablist` e setas, Home e End; alvos de toque de pelo menos 44 px; cores dos tokens (claro e escuro) e texto branco só sobre fundos escuros com contraste AA; `prefers-reduced-motion` desliga as transições.

## Pendência de outro agente

`entrada_v2_enabled` precisa estar em `PUBLIC_FLAGS` (`worker/src/services/featureFlagService.js`) e na migração `sql/049_ui_v2_flags.sql` para chegar ao navegador. Esta entrega não cria a migração nem altera `PUBLIC_FLAGS`.

## Testes

`frontend/scripts/entrada-v2.test.mjs` (lógica pura e contratos de arquivo) e `frontend/scripts/e2e/entrada-v2.e2e.js` (flag simulada por `apiGetFeatureFlags`; 375x812 e 1280x800).
