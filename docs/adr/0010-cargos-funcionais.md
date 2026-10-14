# ADR 0010: Cargos funcionais acumuláveis (papéis com capacidades)

Status: aceita em 2026-10-14 (ROL-01 e ROL-02: tabela, capacidades na sessão e concessão pelo admin; os serviços ainda decidem pelo papel base, a troca é o ROL-03).

## Contexto
A plataforma tem três papéis base em `profiles.role` (ENUM `visitor | member | admin`, `sql/001_schema.sql`). Na prática a liga precisa delegar partes do trabalho do admin: quem organiza eventos, tarefas e presença; quem revisa conteúdo e casos de simulação; quem modera denúncias e o feedback da Lia; quem cura a Biblioteca; quem oferece mentoria. Hoje isso só existe dentro da Biblioteca (`library_staff`, `sql/029` e `030`, matriz em `worker/src/library/permissions.js`).

Pôr esses cargos no ENUM seria arriscado: há `role IN ('member', 'admin')` fixo em SQL e cerca de 15 serviços que comparam o papel com `member` e `admin`. Um valor novo no ENUM ou cai fora dessas listas (o "gestor" perde o acesso de membro) ou exige revisar todas elas de uma vez. Além disso, um membro pode precisar de mais de um cargo, e um ENUM guarda um só.

## Decisão
- **Papel base não muda.** `profiles.role` segue com os três valores e continua decidindo cotas de IA (`AI_QUOTAS`) e o acesso de membro.
- **Cargos em tabela própria, acumuláveis** (`member_roles`, `sql/038`): uma linha por (pessoa, cargo), cargos `gestor`, `revisor_conteudo`, `moderador`, `curador` e `mentor`. CHECK com a lista fechada; gatilho recusa cargo para quem não é `member` ou `admin`; `ON DELETE CASCADE` na pessoa e `SET NULL` em quem concedeu; RLS forçado com a política única `laift_worker_all`.
- **Capacidades no Worker** (`worker/src/roles/capabilities.js`, puro e congelado). Cada cargo libera um conjunto (gestor: `events.manage`, `tasks.manage`, `attendance.manage`, `proposals.review`, `orgchart.edit`; revisor de conteúdo: `content.review`, `sim.review`; moderador: `reports.moderate`, `assistant.feedback.moderate`; curador: `library.curate`; mentor: `mentoring.offer`). Algumas são exclusivas do admin e nenhum cargo as recebe: `users.manage`, `flags`, `mfa.reset`, `audit.read`, `metrics.read`, `roles.grant`, `kb.reindex`. `capabilitiesFor`: admin tem todas; membro tem a união dos seus cargos; visitante não tem nenhuma (cargo gravado para visitante é ignorado).
- **Sessão com capacidades.** `requireSession`/`resolveSession` leem os cargos no mesmo SELECT da sessão (subconsulta em `member_roles`, sem consulta extra) e devolvem `functionalRoles` e `capabilities`. `requireCapability(identity, cap)` fica ao lado de `requireRole` (admin passa em qualquer capacidade). Banco ainda sem a `038`: a sessão segue valendo, sem cargos.
- **Só o admin concede e retira** (`apiAdminGrantRole`, `apiAdminRevokeRole`, `apiAdminListRoles`; `worker/src/services/rolesService.js`): reautenticação (senha e, se houver, o segundo fator), teto por admin (`ROLE_RATE_LIMITS.ROLE_ADMIN_WRITE`), idempotente e auditado (`role_granted`, `role_revoked`, só com o cargo e se mudou algo).
- **MFA para cargos privilegiados.** Gestor, revisor de conteúdo, moderador e curador exigem verificação em duas etapas: a concessão é recusada se a pessoa ainda não tem MFA ativo, e o portão já existente (`mfa_required`) passa a cobrar também quem tem um desses cargos (o comportamento do admin não muda). Mentor não exige.
- **Biblioteca.** O curador da `library_staff` com MFA ativo é copiado para o cargo `curador`; quem ainda não tem MFA continua curando pela `library_staff` e recebe o cargo do admin depois. O mentor da Biblioteca (importa e sugere artigos) não é o cargo mentor (mentoria entre membros), e o revisor clínico não tem cargo equivalente: os dois ficam só na `library_staff`, que segue sendo a fonte da matriz da Biblioteca.

## Consequências
- Nenhum gate de serviço muda nesta etapa: quem tem cargo ainda não ganha acesso novo. O ROL-03 troca `requireRole([ADMIN])` por `requireCapability` onde couber e cria a tela de cargos; até lá, `functionalRoles` e `capabilities` chegam ao frontend em `apiGetMyProfile` só como informação.
- Com `mfa_required` ligada, quem tiver cargo privilegiado e perder o MFA (reset pelo admin, por exemplo) só alcança o cadastro do MFA até refazê-lo. A descrição da flag no banco ainda fala só de administradores.
- Com a flag desligada, um cargo privilegiado cujo MFA foi resetado continua valendo. Ao trocar os gates (ROL-03), `requireCapability` deve exigir MFA ativo para as capacidades de cargos privilegiados, com ou sem a flag. O aviso `mfaSetupRequired` no próprio login também ainda olha só o admin; quem tem cargo é avisado na primeira chamada seguinte.
- Cargo de quem volta a ser visitante fica gravado, mas não vale; o admin pode retirá-lo.
- Rollback: `sql/down/038_member_roles.sql` apaga os cargos (a `library_staff` fica intacta); o Worker volta a ver só o papel base.

## Alternativa rejeitada
Novos valores no ENUM `user_role` (por exemplo `gestor`, `moderador`). Rejeitada porque quebra as listas `('member', 'admin')` espalhadas pelo SQL e pelos serviços, não permite acumular cargos e não dá para desfazer com segurança (Postgres não remove valor de ENUM).
