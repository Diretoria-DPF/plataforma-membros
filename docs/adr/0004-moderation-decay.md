# ADR 0004 — Decaimento da moderação da Lia

Status: proposta. Data: 2026-10-07.

## Contexto
A moderação da Lia tem 4 níveis (normal, alerta, aviso sério, suspensão) com redenção. Sem decaimento, um deslize antigo pesa para sempre.

## Decisão
- O nível cai 1 ponto a cada 30 dias corridos sem novo incidente, até 0.
- Implementação: coluna `assistant_moderation.last_incident_at` e job diário `moderationService.decay`, no cron já existente (`worker/src/maintenance.js`).
- Nível 3 (suspensão de 24h) só decai depois de a suspensão expirar e dos 30 dias sem incidente.
- Redenção manual zera o nível para 0 na hora e não reinicia o contador.
- A regra aparece na tela de moderação do admin.

## Testes exigidos
(a) 3 incidentes em 90 dias → nível 3. (b) o mesmo + 30 dias sem novo incidente → nível 2. (c) redenção → nível 0 imediato.

## Consequências
Depende de D2 (`assistant_feedback.message_id`). Auditoria preservada em `audit_logs`.
