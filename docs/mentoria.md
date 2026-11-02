# Mentoria entre membros

Tela **Mentoria** (menu Participação), atrás da flag `mentoring_enabled` (nasce **desligada**, semeada pela migração `039`). Item ROL-04 de `docs/AUDITORIA_GERAL_2026-10-14.md`; cargos em `docs/adr/0010`.

## Como funciona

- **Quem pode ser mentor**: membro com o cargo `mentor` (capacidade `mentoring.offer`, concedido pelo admin) **ou** qualquer membro que ligue "Estou disponível como mentor" (`profiles.mentoring_available`).
- **Pedido**: a pessoa mentorada escolhe um mentor da lista e pede (`pending`). O mentor aceita (`active`) ou recusa (`declined`). Qualquer parte encerra um vínculo ativo (`ended`); quem pediu cancela o próprio pedido pendente.
- **Regras**: sem auto-mentoria; um vínculo aberto (pendente ou ativo) por par de pessoas, em qualquer direção; até 5 pedidos pendentes e 3 mentores ativos por pessoa mentorada; até 10 mentorados ativos e 20 pedidos pendentes por mentor; após recusa, o mesmo par só pede de novo depois de 14 dias; contas banidas e bloqueios entre as partes ficam fora.
- **Aceitar** exige ser mentor elegível naquele momento (cargo ou disponibilidade ligada). Recusar e encerrar sempre podem.

## Progresso compartilhado (consentimento)

- Quem decide é **só a pessoa mentorada**, por mentoria (`share_progress`, padrão desligado). Pode mudar a qualquer hora; ao recusar ou encerrar, volta a desligado.
- O mentor recebe **apenas o resumo agregado**: acerto geral, questões respondidas, atividades, sequência de dias e, por módulo, atividades e % de acerto. Nada de respostas individuais, insígnias, última atividade, nome ou contato.
- A Worker só entrega com vínculo **ativo** + mentor **da mentoria** + `share_progress` verdadeiro, conferido a cada leitura. A consulta entra em limite de uso por pessoa; as escritas entram em `audit_logs`.

## Autorização (não confia no cliente)

Cada ação confere o vínculo no próprio SQL (`mentor_id`/`mentee_id` + estado esperado). Quem não é parte recebe o mesmo "não encontrado" de um vínculo inexistente. Só a pessoa mentorada altera `share_progress`; só o mentor responde pedido recebido. Visitante é recusado; flag desligada devolve vazio (leitura) ou recusa (escrita).

## Conversa

Reaproveita o chat cifrado (`connections`/`conversations`). Se já existe conexão aceita entre as duas pessoas, o vínculo mostra **Enviar mensagem** (`LaiftMessaging.openConversationWithPeer`). Caso contrário, mostra a orientação para se conectar em Mensagens. **O serviço não cria conexão automaticamente**: `connections` tem gatilho de cooldown, bloqueio e descoberta por nome de usuário, e contorná-lo seria arriscado. Evolução possível: criar a conexão no aceite por um caminho dedicado e revisado.

## Operação

- Ações: `apiMentoringOverview`, `apiMentoringListMentors`, `apiMentoringSetAvailability`, `apiMentoringRequest`, `apiMentoringRespond`, `apiMentoringEnd`, `apiMentoringSetShare`, `apiMentoringGetMenteeProgress`.
- Sem a migração `039` aplicada: leituras devolvem lista vazia (`tableMissing`) e escritas recusam com "atualização do banco pendente". Aplicar: rodar a `039` e depois ligar a flag em Admin > Flags.
- Reversão: `sql/down/039_mentoring.sql` (apaga vínculos, a coluna e a flag).
- Pendência: o export de dados do titular (LGPD, `privacyService.js`) ainda não inclui os vínculos de mentoria; a exclusão da conta apaga tudo (`ON DELETE CASCADE`).
