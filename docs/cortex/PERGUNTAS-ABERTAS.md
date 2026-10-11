# Perguntas abertas para o dono · Biblioteca LAIFT B1/B2 (2026-10-10)

Só o que muda produto, interface ou operação e não está nas decisões do PLANO-CORTEX §1. Nenhuma bloqueia a onda 1.

## P1. Os curadores da Diretoria Científica viram administradores da plataforma? (bloqueia o B2-H7/H8 só no texto, não no código)
Hoje só existem os papéis visitante, membro e admin (`worker/src/constants.js:11-15`); a aba de curadoria fica no modo admin, que só o admin vê.
- **A.** Curadores recebem papel admin. Usam a aba de curadoria já no B2. Ganham também banir pessoas, mudar flags e ver auditoria.
- **B. (recomendada)** Papel restrito da Biblioteca (`library_staff`: curador ou revisor clínico), dado pelo admin na aba "Equipe". No B2 só admins curam; a tela de curadoria para quem não é admin (e a do revisor clínico) entra no B3, dentro do painel da Biblioteca.
- **C.** Papel restrito e a tela para curador não-admin já no B2 (mais um Haiku e uns dias a mais).
O revisor clínico (professor orientador) **nunca** precisa ser admin em nenhuma opção.

## P2. Áreas do catálogo: lista simples ou com subáreas?
O filtro "área" precisa de uma lista. A migração já cria "Farmacologia clínica" e "Toxicologia" (decisão 13), editáveis na aba "Áreas".
- **A. (recomendada)** Lista simples; um artigo pode ter até 5 áreas. Subáreas, se um dia precisar, entram como áreas novas.
- **B.** Áreas com subáreas (ex.: Toxicologia › Toxicologia clínica). Exige mudar o banco e o filtro antes do lançamento.
Confirme também os dois nomes iniciais.

## P3. Licenças "não comercial" (CC BY-NC, BY-NC-SA, BY-NC-ND): a plataforma conta como uso não comercial?
Isso decide se o **resumo original** do artigo aparece para membros quando a licença é NC. Link oficial e resumo próprio aparecem sempre.
- **A. (recomendada até haver parecer)** Tratar NC como fechada: só link e resumo da LAIFT.
- **B.** Tratar a Liga como uso não comercial e mostrar o resumo original nas NC. Precisa de parecer jurídico (PLANO §6, item 4).

## P4. Política de Privacidade: favoritos e sugestões
A Biblioteca guarda os favoritos de cada membro e as sugestões que ele envia (as buscas **não** são guardadas). Ambos saem junto com a conta.
- **A. (recomendada)** Acrescentar um parágrafo à Política sem pedir novo aceite, se o jurídico concordar; ligar a Biblioteca para membros só depois do texto publicado (até lá, ligada só para admins).
- **B.** Nova versão da Política com novo aceite de todos (`LEGAL_VERSIONS.PRIVACY`, `worker/src/constants.js:163-166`).

## P5. Atualização diária do catálogo público em produção
O catálogo público é gerado no deploy do site; o plano roda o deploy todo dia às 06:17 (Brasília) e quando você pedir.
Se o ambiente `production` do GitHub exigir aprovação (o workflow prevê isso: `.github/workflows/deploy-frontend-cloudflare.yml:14-15`), cada rodada diária vai esperar o seu clique.
- **A.** Manter a aprovação e aprovar quando houver artigo novo (os outros dias podem ser recusados sem problema).
- **B. (recomendada se hoje há aprovação)** Sem agendamento diário: a curadoria avisa e você dispara à mão (Actions → workflow_dispatch) depois de publicar um lote.
- **C.** Tirar a aprovação do ambiente `production`.
Se hoje não há aprovação, nada a decidir: fica o diário.

## Decisões do dono (2026-10-10)
- **P1:** papel restrito da Biblioteca (`library_staff`); no B2 só admins curam; a tela do curador e a do revisor clínico entram no B3.
- **P2:** lista simples de áreas, até 5 por artigo; nomes iniciais "Farmacologia clínica" e "Toxicologia".
- **P3:** licenças não comerciais (BY-NC e variantes) tratadas como fechadas até haver parecer jurídico: só link oficial e resumo da LAIFT.
- **P5:** o ambiente `production` pede aprovação: **sem agendamento diário**; o dono dispara a atualização do catálogo à mão (workflow_dispatch) depois de publicar um lote. O B2-I remove o `schedule` do workflow.
- **P4 (não perguntada, adotada a recomendação A):** parágrafo na Política sem novo aceite, se o jurídico concordar; a Biblioteca só liga para membros depois do texto publicado (antes, só admins).
