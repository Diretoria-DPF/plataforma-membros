# ADR 0004 — Decaimento da moderação da Lia

Status: aceita (2026-10-08); a tela de moderação do admin ainda não existe no front. Data: 2026-10-07.

## Contexto
A moderação da Lia tem 4 níveis (normal, alerta, aviso sério, suspensão) com redenção. Sem decaimento, um deslize antigo pesa para sempre.

## Decisão
- O nível cai 1 ponto a cada 30 dias corridos sem novo incidente, até 0.
- Implementação: coluna `assistant_moderation.last_incident_at` e job diário `ModerationService.decayAssistantModeration` (`worker/src/services/moderationService.js`), no cron já existente (`worker/src/maintenance.js`).
- Nível 3 (suspensão de 24h) só decai depois de a suspensão expirar e dos 30 dias sem incidente.
- Redenção manual zera o nível para 0 na hora e não reinicia o contador.
- A regra aparece na tela de moderação do admin.

## Testes exigidos
(a) 3 incidentes em 90 dias → nível 3. (b) o mesmo + 30 dias sem novo incidente → nível 2. (c) redenção → nível 0 imediato.

## Consequências
Depende de D2 (`assistant_feedback.message_id`). Auditoria preservada em `audit_logs`.

## Campo `stateChanged` da redenção (2026-10-08)

**O que é.** Campo booleano da resposta de `apiAssistantRedeem` (`redeemAssistant`, em `worker/src/services/moderationService.js`). Quando `true`, a Lia aceitou o pedido de redenção, mas o estado da moderação mudou enquanto o juiz avaliava (incidente novo ou decaimento entre a leitura e a gravação). Por isso a redenção não foi aplicada.

**Quando vem `true`.** Só no caminho `stateChangedReply`: a gravação condicional (`applyRedemption`) não encontra mais a linha que foi julgada (mesmo nível e mesmo último incidente). Nas demais respostas o campo não é enviado; não existe `stateChanged: false`. Recusa, espera, juiz indisponível e limite de redenções aceitas não o trazem.

**O que o servidor faz nesse caso.**
- Não aplica a redenção e não grava `assistant_redeemed` em `audit_logs`.
- Mantém o incidente ou o decaimento que aconteceu no meio.
- Devolve `level` com o nível atual, relido do banco, e `retryAfterSeconds: 0`.
- Libera a reivindicação da tentativa: o cooldown de 1 hora não é consumido.
- Mensagem: `MSG_REDEEM_CHANGED` ("O seu estado mudou enquanto o pedido era avaliado... Isso não conta como tentativa...").

**Como o front reage hoje (`frontend/assistant-moderation.js`).**
- O front não lê `stateChanged` nem `level` dessa resposta.
- `redeemOutcome` classifica a resposta como `error`: `accepted` é `false` e `retryAfterSeconds` é `0`, então não entra no caminho de espera.
- `failRedeem` mostra a mensagem no alerta do formulário, mantém o formulário aberto e reabilita o envio. Não há contagem regressiva.
- O nível exibido não muda com essa resposta. `apiAssistantModerationState` é chamada uma vez por abertura do painel (`checkModerationOnce`), não depois da redenção.

**Pendências (decisão do dono, não tomada aqui).**
1. O alerta é o canal das falhas reais (rede, exceção, erro do servidor), segundo o comentário em `buildRedeem`. Este caso é um aviso, não uma falha. O front pode tratá-lo como aviso e usar `level` para atualizar a tela.
2. A mensagem pede para "conferir o seu nível", mas o front não exibe o nível novo nesse fluxo.

**Chat.** A conversa (`worker/src/assistant/moderationGate.js`) não devolve `stateChanged`. O estado de moderação vem no objeto `moderation` (`level`, `suspended`, `until`).

**Testes.** `worker/test/moderationConcurrency.test.js`: bloco "redenção x incidente DURANTE o julgamento (achado 4)" (nível 3, nível 1, decaimento no meio, cooldown devolvido) e o teste de concorrência com incidente em paralelo.
