# Cursos, prova e certificado: operação (Onda 1)

Plano: `cortex/PLANO_OPERACAO_EDUCACAO_2026-11-14.md` (seção 4). Tudo nasce **desligado** e as migrações estão só escritas.

## Peças
- **Banco:** `sql/056_cursos.sql` (cursos, aulas, progresso, banco de questões, tentativas), `sql/057_certificados.sql`, `sql/058_requisitos_evento.sql`. RLS forçado (`laift_enable_rls`, política `laift_worker_all`). Reversão em `sql/down/` na ordem 058 → 057 → 056 (a 057 revertida **apaga** certificados: exportar antes).
- **Worker:** `courseService.js`, `assessmentService.js`, `certificateService.js`, `eventPrereqService.js` (comum: `courseCommon.js`). Rotas em `handlers.js`.
- **Tela:** módulo `frontend/modulos/cursos/` (aberto pelo menu "Cursos", visível só com `courses_enabled`) e a página pública `frontend/certificado/` (`/certificado/<código>`).
- **Importador:** `worker/scripts/import-course.mjs`.

## Regras que o código garante
- Prova sorteada e corrigida na Worker; resposta ao navegador sem gabarito, sem id de questão e sem a ordem original das alternativas. A pessoa responde com a posição exibida.
- Aulas todas lidas e `min_study_pct` do tempo previsto antes da prova; uma tentativa aberta por vez; prazo `attempt_minutes`; `max_attempts` por versão com `retry_wait_hours` entre elas; nota mínima `pass_pct` por curso; questão crítica errada reprova; ao menos `min_critical` críticas por prova. Tentativa vencida conta como nota 0.
- Depois da aprovação ou das tentativas esgotadas, a pessoa vê **quais** enunciados errou e a fonte para revisar; nunca a alternativa certa.
- Certificado: código `LAIFT-XXXXX-XXXXX` (50 bits), campos congelados e assinados (HMAC-SHA-256, chave derivada de `CERTIFICATE_SECRET`, domínio `laift-certificate-v1`). Revogado não se reemite na mesma versão.
- Verificação pública: limite por IP; mostra só situação (válido, vencido, revogado), nome, curso, carga horária e datas. Sem consentimento público, exige o nome digitado. Código inexistente, nome errado e assinatura que não confere respondem igual.
- Requisito de evento: certificado não revogado, não vencido e na versão atual. Dispensa só com `events.manage`, com motivo, nunca para si; tudo em `audit_logs`. A inscrição na portaria (check-in) não é bloqueada.
- Publicar curso: `content.review` (revisor de conteúdo com MFA, ou admin). Recusado com marcador `[VERIFICAR]`, conferência interna pendente (`review_notes`) ou banco de questões insuficiente.

## Importar um curso (sem aplicar nada sozinho)
```
cd worker
node scripts/import-course.mjs <pasta-do-curso> --versao 1 --saida curso.sql
```
O curso entra (ou volta) em `rascunho_interno`. Marcadores `[VERIFICAR]` saem do texto do aluno e viram notas internas; seção que fica vazia sai inteira. Reimportar não rebaixa a versão. Aplicar o SQL à mão, depois das migrações, só com a frase do dono.

Curso piloto `diretrizes-lab-pop01`: 5 aulas, 20 questões (7 críticas), prova de 12 com 6 críticas, 80%, 30 min de carga, validade 12 meses. Entra com 29 conferências pendentes (a Aula 5 sem o texto do POP 01), portanto **não publica** até a revisão.

## Ordem para ligar (cada passo com a frase do dono)
1. Aplicar 056, 057, 058 (`tools/db/migrate.mjs`, que grava o ledger com hash).
2. `wrangler secret put CERTIFICATE_SECRET` (valor próprio, nunca o pepper das sessões).
3. Importar o curso, conferir, zerar as pendências e publicar pela equipe de conteúdo.
4. Ligar `courses_enabled`, depois `certificates_enabled`, depois `event_prereq_enabled`.
5. Antes de `certificates_enabled`: atualizar Política e Termos (página pública, consentimento, prazo da linha mínima de conta apagada) e incluir cursos e certificados no export do titular.
