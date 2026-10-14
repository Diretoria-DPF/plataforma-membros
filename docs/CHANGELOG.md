# Registro de mudanças

Mudanças relevantes da plataforma, da mais recente para a mais antiga. As datas são as de mescla na `main` (UTC). Detalhes e decisões ficam em `docs/ANDAMENTO.md`, `docs/riscos-residuais.md` e `docs/adr/`.

## [Não publicado]

Rodada 3 (operação e Liga), em andamento nas branches `docs/ops-rotina-2026-10` e `feat/liga-identidade`.

### Adicionado
- Simulação clínica com pacientes variados (ADR 0009, **desligada**: flag `clinical_sim_enabled`, sem revisor clínico definido). Módulos puros `worker/src/clinicalSim/` (eixos, PRNG determinístico, estado que evolui, catálogo fixo), parâmetro `simulation` em `apiLearnClinicalChat/Evaluate` (prompt atual byte a byte sem a flag), guardrail de saída do paciente, nota por componentes calculada pelo servidor (hipótese 30, conduta 30, processo 20, comunicação 20), migração `037_clinical_sim.sql` com a trava de revisão em dois passos no banco, persona `paciente-virtual` 0.2.0 e "Modo simulação (beta)" na Clínica (`clinic-sim.js`).
- Eventos: botão **Cancelar inscrição** (com confirmação). `apiCancelEventRegistration` apaga só a própria inscrição, antes de o evento começar e antes da presença; libera a vaga, invalida o cache, audita (`CANCEL_EVENT_REGISTRATION`) e limita a 20 por hora.
- Lia: sugestões por tela (na entrada: perguntas gerais como "O que tem no blog?" e "O que posso fazer na plataforma?"; logado: por painel), `frontend/assistant-suggestions.js`.
- Lia cita artigos da Biblioteca (flag `lia_library_enabled`), histórico de 8 turnos e registro de respostas para membros (flag `rag_cache_enabled`, migração 034, desligada).
- Lia: novos trechos de conteúdo (o que é a Biblioteca, Farmacologia x Toxicologia, farmacocinética, o que fazer na plataforma) e 60+ perguntas novas no conjunto de referência.

### Corrigido (Atlas 3D: cliques, fáscias, separar peças — auditoria de 13/10/2026)
- **Destaque do clique só aparecia em metade do corpo.** As peças do lado espelhado (matriz de determinante negativo: o Z-Anatomy modela o esquerdo como cópia do direito com escala -1 em X) eram desenhadas "por dentro" no BatchedMesh e o raycast acertava a face de fora. Agora cada camada tem um segundo batch para as espelhadas (`scale.x = -1` no batch, matriz da instância pré-multiplicada pelo espelho; posição final inalterada). Clique == peça que aparece: de 3% a 9% numa metade da tela para 94% a 98% (e2e `atlas-espelho`, limiar de 75% por metade). Orçamento de draw calls: 2 -> 4 com os sistemas padrão (limite 150). `registry.js` dividido em `registry-helpers.js` e `registry-pick.js`; o campo `side` do registro agora casa `.l`/`.r`.
- O clique atravessa estruturas quase transparentes (Raio-X, Fantasma, camada abaixo de 35%): o que se vê através delas é o que se seleciona.

### Adicionado (Atlas 3D: fáscias e Separar peças)
- Camada **Fáscias** no painel de camadas (desligada na abertura, translúcida a 45%) e botão **Somente fáscias** (`aria-pressed`). O clique **prefere a estrutura sob a fáscia** (decisão do dono, opção 2); clicar de novo no mesmo ponto alterna para a fáscia. Regra por nome, orientada a dados, em `fascia-rules.js`.
- Vista **Separar peças** (explodida) no menu Mais opções, atrás da flag `explode`: slider acessível, deslocamento radial por camada a partir do centro do corpo (ou da estrutura isolada), respeita as peças espelhadas, animação que respeita `prefers-reduced-motion`, sem custo no boot (carregamento sob demanda).
- `docs/ATLAS_LICENCAS_PENDENTES.md`: registro das 8 estruturas suspeitas de licença NC, dos 174 nós de cérebro de licença desconhecida, do `body.glb` sem origem, das lacunas de atribuição e do checklist "antes de cobrar". **Somente documentação: nenhum modelo nem a tela de Créditos foi alterado.**
- Testes: `registry-mirror`, `registry-fascia`, `registry-pick`, `fascia-rules`, `explode` (unitários) e e2e `atlas-espelho`, `atlas-fascias`, `atlas-explode`.

### Alterado
- Cotas diárias de IA dos membros mais generosas (chat 100, avaliar 25, caso 10, laboratório 80, Lia 60; administrador ~2x). O orçamento global de tokens continua sendo o freio.
- A Lia do membro usa o modelo inteligente (120B) enquanto o uso de tokens das últimas 24 h estiver abaixo de 50 % do orçamento e o 120B abaixo de 150 mil tokens.
- CI e ambiente (auditoria do Atlas, 13/10/2026): `.gitattributes` com `* text=auto eol=lf` e binários explícitos (corrige as falhas de CRLF dos testes de front no Windows); o workflow `atlas-e2e` pula só os passos pesados em PRs que não tocam `frontend/`, `tools/atlas-`, `.github/workflows/atlas-` nem `docs/atlas-conteudo/` (o job continua sempre existindo e concluindo, e roda tudo em `workflow_dispatch` ou se a detecção falhar); `STATUS.md` e `CONTINUIDADE.md` do Atlas atualizados (T00 e T09 feitos; e2e verdes no CI).

### Adicionado (Operação LAIFT Agêntica, front; API alfa `agents/v1-alpha`, atrás de flags desligadas)
- Tutor clínico na tela Aprender (`frontend/agents-tutor.js`): cartão "Falar com o Tutor" só aparece se `apiAgentsList` devolver o agente; conversa só na memória da página (8 turnos), resposta por `textContent`, fontes só de `doi.org` e PubMed, recusa de guardrail mostrada como resposta (não como erro) e mensagens amigáveis por `code`.
- Memória de estudo no Perfil (`frontend/memory.js`, `memory-core.js`, `memory.css`): cartão com o texto da finalidade (rascunho do dono em `docs/memoria-consentimento-RASCUNHO.md`, ainda não aprovado), ativar com confirmação enviando a `purposeVersion` do servidor, ver os itens em texto puro, apagar item, apagar tudo, desligar (revoga), baixar os dados em JSON (gerado no navegador, sem enviar a lugar nenhum) e escolher preferências só de listas fechadas. Texto que mudou (`needsReconsent`) pede novo aceite sem ler nada; `MEMORY_DISABLED` esconde o cartão. Nada vai ao armazenamento do navegador; trocar de conta ou sair limpa o cartão.
- Selo do Tutor "Usou sua memória de estudo" mostra quantos itens foram usados e ganhou o atalho "Gerenciar memória", que leva ao Perfil.
- Cache do service worker v8 -> v9 (arquivos novos no precache). As ações de memória e do Tutor continuam fora da ponte dos módulos.

### Adicionado (rodada 3)
- `tools/ci/registrar-segredos-backup.ps1`: cadastra os 6 secrets do workflow "Backup do banco" sem passar valores pelo chat (`-SomenteVerificar` lista só os nomes). Hoje os 6 estão em falta.
- `docs/LIGHTHOUSE_2026-10-08b.md`: medição da produção (`laift.com.br`). Mobile, mediana de 3 rodadas: Performance 94, Acessibilidade 100, Boas práticas 100, SEO 100, CLS 0,000.
- `docs/liga/`: fontes da Liga (Edital 2026 original e estrutura do Forms atual), referências de ligas acadêmicas, proposta de Edital v2 e resumo visual (propostas; a diretoria aprova).
- Seção "Rodada 3" em `docs/TIME_CONTRATO.md` (1 orquestrador Opus 5.5 e executores Haiku 5.5).

### Alterado
- A Lia passa a responder sobre o processo seletivo, as áreas e o contato da Liga (intenção `liga_processo` e fonte `liga` na base de conhecimento). Nenhum dado de candidato é lido.

### Corrigido
- `docs/BACKUP_RESTORE.md`: o job agendado falha (fica vermelho) sem os secrets; só a execução manual termina com aviso.
- `docs/AMBIENTES.md`: lista de secrets do staging inclui `MFA_ENCRYPTION_KEY` e `NVIDIA_API_KEY`.
- `docs/SECURITY.md`: o site roda no Worker `laift-web` da Cloudflare, e o clickjacking está mitigado por `frame-ancestors 'self'` (`frontend/_headers`).

## #40: Lia ondas 2–4, rosto mais leve, onboarding e moderação admin (2026-10-08)
Branch `feat/v5-fechamento`. 100 arquivos, +9.637 −311.

### Adicionado
- Lia: 7 cenas em código (Laboratório, Clínica, Atlas, Aprender, aviso, suspensa e redenção, confusa), props sob demanda e efeito de digitação.
- Onboarding por papel, atalhos `Ctrl/Cmd+/` e `Ctrl/Cmd+K`, hero do login com a cabeça da Lia.
- Tela "Moderação da Lia" no painel admin (agregados e por pessoa, sem nome).
- Cobertura de assuntos da Lia (propostas, equipe, mensagens, feedback, redenção, limite de IA e telas de admin, estas só para admin).

### Alterado
- Rosto da Lia mais leve (variante "suave" aprovada pelo dono); partes do corpo sobrepostas corrigidas.
- Painel admin sem Chart.js/CDN (SVG próprio, tabela alternativa); CSP sem jsDelivr (O31).
- `openConfirm` acessível (foco preso, Esc, foco devolvido, fundo `inert`); `h1` por tela; alvos de 44 px; reduced-motion consolidado.

### Segurança
- Suspensão da Lia relida do banco (O17), alerta de reindex sem embeddings (O20), respostas com fontes fora do cache (O27); `profile.id` do próprio perfil nas respostas de login.

Verificação: worker 1506 testes; front 899 (2 falhas só no Windows, `_headers`); e2e 319 ✔.

## #39: CI verde na `main` após a #38 (2026-10-08)
Branch `fix/ci-pos-fusao`. 6 arquivos, +196 −128.

### Corrigido
- Cabeçalho de copyright em 3 testes (`lia-anim`, `nav-a11y`, `ux-v2`).
- `sharp` 0.35.4 → 0.35.5 em `tools/atlas-pipeline` (GHSA-wq5f-xc86-pv6w).

## #38: UX v2, Lia viva, RAG, feedback e moderação (2026-10-08)
Branch `feat/v5-ux-fundacao`. 128 arquivos, +21.484 −508.

### Adicionado
- Fundação visual (flag `ux_v2_enabled`): camadas por tom, motion tokens, cartões sem borda, vidro com fallback, skeletons, splash.
- Início editorial: números com contagem animada, gráficos em SVG próprio, tabela alternativa.
- Lia viva: personagem SVG modular (ADR 0003), estados, humor e variações, dicas por módulo.
- RAG com busca híbrida (pgvector e pg_trgm) e citações; feedback 👍/👎 e painel "Satisfação da Lia"; moderação em 4 níveis com redenção.
- Migrações 020 a 024 (ainda **não aplicadas em produção**; ver runbook em `docs/AMBIENTES.md`).

### Segurança
- Revisões de segurança, banco, RAG e acessibilidade; nenhum crítico; todos os altos corrigidos e cobertos por testes.

Verificação: worker 1424 testes; front 650 (2 falhas só no Windows); QA visual com 222 verificações.

## Treino de restauração

Registre aqui cada treino (a cada trimestre e depois de qualquer mudança no processo), conforme `docs/BACKUP_RESTORE.md`.

| Data | Dump (arquivo) | Branch de teste | Contagens conferidas | Resultado |
|---|---|---|---|---|
| — | — | — | — | Nenhum treino registrado ainda |
