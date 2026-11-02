# Mensagens v2

Tela Mensagens reapresentada, **atrás da flag `messages_v2_enabled`, desligada por padrão** (migração `050`). Com a flag desligada, ou se o pacote falhar, a tela de sempre fica idêntica.

## Como funciona

`messages-v2.js` (pacote sob demanda `mensagens2`, `lazy-bundles.js`) **não toca na cifragem nem no fluxo**: `msg-crypto.js` e `messaging.js` seguem iguais, com os mesmos nós e ids. O script só acrescenta cabeçalho, aviso de cifragem, o espaço "Escolha uma conversa" e o atalho "Ir para a Equipe" (sem conversas), e dá papel de botão e teclado (Enter e espaço) às linhas da lista. Tudo é desfeito por `reset()`.

- **Celular:** alterna lista e conversa, como sempre (botão Voltar).
- **Desktop (900 px ou mais):** lista e conversa lado a lado, só por CSS (`messages-v2.css`, regras sob `data-flag-messages-v2-enabled` e `data-m2`).
- Mantidos: banner de chave não verificada, Limpar, contador 0 / 2000, apagar mensagem.

## Fora desta versão

- Busca na lista de conversas, botão "Verificar" da chave e hora na linha da lista (a prévia os mostrava; o app real não tem esses dados ou ações).
- No desktop, a lista só atualiza sozinha quando a conversa é fechada (o `messaging.js` de sempre atualiza a lista apenas enquanto ela está ativa).

## Testes

`frontend/scripts/messages-v2.test.mjs` e `frontend/scripts/e2e/messages-v2.e2e.js` (flag ligada e desligada, 375, 768 e 1280, claro e escuro, envio cifrado).
