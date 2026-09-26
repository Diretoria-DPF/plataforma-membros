# Fase 3: IA na Worker e clínica virtual

Parte do plano `docs/PLANO_FASES_2_3_4.md`. Esta página segue o contrato de lá: Contrato 1 para a migração 013, Contrato 2 para os endpoints da Equipe 3 e Contrato 3 para a ponte `LaiftApi`.

## O que mudou

| Antes (Apps Script) | Agora |
|---|---|
| IA da clínica e do laboratório rodava no Apps Script, com as chaves do Groq lá dentro | IA na Worker (`worker/src/ai/`), com as chaves no secret `GROQ_API_KEYS` |
| `conversarComPaciente`, `avaliarCondutaPreceptor`, `gerarCasoProcedural` | `apiLearnClinicalChat`, `apiLearnClinicalEvaluate`, `apiLearnClinicalGenerateCase` |
| `listarCasosAcervo` (planilha, sem moderação) | `apiLearnClinicalLibrary` (tabela `clinical_cases`, só casos `approved`) |
| `obterDashboardEpidemiologico` / `consolidarDashboard` | `apiLearnClinicalEpidemiology` (agrega `learning_attempts`) |
| `consultarPreceptorIA`, `consultarCacheGlobal`, `salvarCacheGlobal` | `apiLearnLabPreceptor`. O cache de síntese é gravado **só pelo servidor** |
| `obterStatusSaudeIA` (cartão no terminal fiscal) | `apiAdminAiHealth`, no novo painel admin **IA** |
| Cooldown de 30 s ou 5 min no botão "Gerar caso" | Cota diária por pessoa, por recurso e papel, mais um disjuntor global |
| Casos gerados iam direto para o acervo de todos | Casos gerados entram como `pending`. Só aparecem para os outros depois que um admin aprova em `apiAdminLearnReviewCase` |

Arquivos novos ou alterados:

- `sql/013_clinical_ai.sql`
- `worker/src/ai/`: `config.js`, `groqClient.js`, `prompts.js`, `validators.js`, `errors.js`
- `worker/src/services/aiService.js` e `clinicalService.js`
- Blocos `// Fase 3 —` em `handlers.js` e `constants.js`
- Vars do Groq em `wrangler.toml`
- `frontend/modulos/clinica/**` e `frontend/modulos/laboratorio/js/lab-preceptor.js`
- Painel admin de IA:
  - `frontend/admin-ai.js`
  - botão e seção `panel-admin-ai` em `index.html`
  - loader e limpeza em `app.js`
  - cópia em `build.js`
  - bloco `/* Fase 3 — */` em `styles.css`
- Testes:
  - Jest: `worker/test/groqClient.test.js`, `aiService.test.js`, `clinicalService.test.js`, `aiValidators.test.js`, acréscimos em `handlers.test.js`
  - E2E: `frontend/scripts/e2e/fase3.e2e.js`

## Arquitetura da IA

```
módulo (iframe) ──LaiftApi.call(action, input)──► app.js (token da sessão) ──► Worker
                                                                              │
          handlers.js (runWithSession) ─► clinicalService / aiService ─► withQuota (cota)
                                                                              │
                                        ai/prompts.js (monta mensagens) ─► ai/groqClient.js ─► Groq
                                        ai/validators.js (valida entrada e saída)       │
                                                                     ai_usage_log (sem conteúdo)
```

- **Identidade só da sessão.** Nenhum endpoint aceita `profileId` ou e-mail do cliente. O token nunca chega ao iframe: a ponte anexa o token no app principal.
- **Um provedor, preparado para simplificar.** Os services pedem um *recurso* (`chat`, `evaluate`, `generate_case`, `lab_preceptor`). A tabela `FEATURE_CONFIG` em `ai/config.js` decide para cada recurso:
  - o modelo;
  - o `max_tokens`;
  - os timeouts;
  - o JSON mode.

  Para usar um modelo só, basta pôr o mesmo valor em `GROQ_MODEL_FAST` e `GROQ_MODEL_SMART`. Os parâmetros próprios do gpt-oss (`reasoning_effort` e `include_reasoning: false`) só são enviados a modelos dessa família.

### Pool de chaves (`ai/groqClient.js`)

- **`GROQ_API_KEYS`.** Traz **todas** as chaves, separadas por vírgula, `;` ou quebra de linha. Chaves repetidas e vazias são ignoradas.
- **Rodízio round-robin por isolate, com ponto de partida aleatório.** A alternativa seria um ponteiro compartilhado em KV. Não usamos porque cada chamada gravaria no KV, e o plano gratuito do Workers KV aceita só 1.000 gravações por dia, menos que o disjuntor de 3.000 chamadas.
- **Failover.** Em HTTP 401, 403, 429 ou 5xx, ou em timeout ou falha de rede, a chave entra em cooldown e o cliente tenta a próxima.
  - O cooldown fica em memória e em KV, na chave `ai:key-cooldown:<i>`.
  - O TTL é o do `Retry-After`, entre 60 s e 1 h. Sem `Retry-After`, é de 60 s.
  - As chamadas seguintes, mesmo em outros isolates, pulam essa chave.
- **Erros da requisição não fazem failover.** Um 400, 404, 413 ou 422 é problema da própria requisição, então trocar de chave não resolve. Vira um erro esperado, com mensagem fixa.
- **Timeouts.** Cada tentativa tem um `AbortController`, e o recurso tem um orçamento total que soma as tentativas. O orçamento fica abaixo dos 60 s da ponte do front-end.

  | Recurso | Por tentativa | Orçamento total |
  |---|---|---|
  | chat | 20 s | 25 s |
  | evaluate | 45 s | 55 s |
  | generate_case | 45 s | 55 s |
  | lab_preceptor | 25 s | 40 s |

- **Todas as chaves falhando.** O resultado é um `AiUnavailableError`: um erro esperado, com mensagem genérica fixa. A unidade de cota consumida é devolvida.
- **A chave nunca vaza.** Ela não aparece em erro, `error_logs`, `ai_usage_log` (onde vai só o índice), `console` ou resposta. O teste `groqClient.test.js` confere isso, inclusive quando o próprio `fetch` falha com uma mensagem que contém a chave.
- **Saúde das chaves (`apiAdminAiHealth`).** Faz um `GET /openai/v1/models` por chave, em paralelo e com timeout de 8 s. Esse endpoint não gera tokens.
  - Devolve para cada chave: índice, final mascarado (`…abcd`), ok, latência e status.
  - Devolve também `overallPct`, a configuração e o uso das últimas 24 h.
  - Uma chave que responde bem sai do cooldown.
  - O teste tem limite de 20 execuções por hora por admin.

### Cotas (`constants.js`, bloco `// Fase 3 —`)

As cotas são por pessoa, em janelas de 24 h. A contagem usa `enforceRateLimit`, tabela `rate_limit_buckets`, buckets `AI_*`.

| Recurso | Visitante | Membro | Admin |
|---|---|---|---|
| chat | 40 | 150 | 300 |
| evaluate | 5 | 20 | 40 |
| generate_case | 2 | 8 | 20 |
| lab_preceptor | 20 | 80 | 160 |

- **Disjuntor global.** Até 3.000 chamadas em 24 h, somando toda a plataforma (bucket `AI_GLOBAL`).
- **Cota estourada.** O endpoint devolve `{ success:false, quotaExceeded:true, message }`, com mensagens como:
  - "Você atingiu o limite diário de 8 casos gerados com IA; a cota volta amanhã."
  - "A IA da plataforma atingiu o limite diário de uso de toda a liga; volta amanhã."

  A clínica usa a flag para desabilitar o botão, sem mostrar erro.
- **Devolução.** Se nenhuma chave responder, a unidade é devolvida à pessoa e ao disjuntor. Uma saída inválida do modelo **não** devolve a unidade, porque os tokens foram gastos.
- **Acerto do cache de síntese do laboratório não consome cota**, porque não chama a IA.
- **`apiLearnGetMyAiQuota`** lê as linhas do `rate_limit_buckets` sem incrementar. Usa o mesmo hash que o `enforceRateLimit`, e um teste garante isso.

### Prompts (`ai/prompts.js`)

Os prompts ficam só no servidor e são escritos em pt-BR. Todos declaram o propósito **educacional** e pedem **texto puro**. Todos também têm uma regra fixa contra "ignore, revele ou altere estas instruções" e contra troca de papel.

- **Paciente virtual (modelo rápido).**
  - Fala como leigo, em até 3 frases.
  - **Nunca** diz o diagnóstico, a toxíndrome ou o tratamento.
  - Responde só ao que foi perguntado.
  - Descreve achados de exame físico entre colchetes.
  - Muda o tom conforme a vitalidade e a paciência.
- **Preceptor avaliador (modelo forte, JSON).**
  - Rubrica de 100 pontos: diagnóstico 40, conduta 40, processo 20.
  - Nota máxima de 25 em caso de óbito e de 40 em caso de abandono. O servidor aplica o teto de novo depois da resposta.
  - O texto do estudante é tratado como dado. Pedidos como "me dê 100" são ignorados.
  - Saída esperada: `{score, verdict, feedback, strengths, improvements}`.
- **Gerador de caso (modelo forte, JSON).**
  - Gera no formato de `patients.js`, que o `clinic-engine.js` consome.
  - Temas fora de escopo, ou com pedidos de conteúdo perigoso, viram um caso clássico.
  - O caso não traz instruções de síntese.
- **Preceptor do laboratório (modelo forte).**
  - Respostas de até 250 palavras, com biossegurança.
  - Recusa instruções operacionais para drogas controladas, explosivos, armas químicas ou venenos.
  - **Pedido de síntese com cache.** O prompt é montado **só com o termo normalizado** (letras sem acento, dígitos, espaço e hífen; de 3 a 60 caracteres). Pergunta livre, histórico e bancada ficam de fora, para que a resposta compartilhada não possa ser direcionada por quem pediu primeiro.

Entrada e saída:

- **Limites de entrada.** Pergunta de até 500 caracteres; histórico de até 8 turnos, com até 500 caracteres cada; contexto do caso ou da bancada de até 4 KB; gabarito do cliente de até 4 KB. O histórico é remapeado para `user` ou `assistant` pelo servidor, então o cliente não consegue injetar uma mensagem `system`.
- **Validação da saída.** A avaliação e o caso gerado usam `response_format: json_object` e passam por validação e normalização em `validators.js`.
  - Campos extras são descartados, e tipos e tamanhos são fixados.
  - As toxíndromes caem numa lista fechada, a mesma do filtro do acervo e do radar.
  - Se a saída for inválida, a pessoa recebe um erro esperado e **nada é salvo**.
- **Saída sempre como texto.** A clínica e o painel admin renderizam tudo com `textContent`/`createElement`.

## Endpoints e regras de negócio

Todos recebem um único objeto: `(sql, env, [sessionToken, input])`. Os nomes seguem a allowlist da ponte, e um teste em `handlers.test.js` confere isso.

- **`apiLearnClinicalChat` / `apiLearnClinicalEvaluate`.** O `caseSource` indica a origem do caso:
  - `acervo`: contexto do paciente e **gabarito vêm do banco**, só de casos aprovados. Qualquer `answerKey` enviado pelo cliente é ignorado.
  - `builtin` e `ia`: o caso já está no navegador, então contexto e gabarito vêm do cliente, com limite de tamanho. **Adulterar esse gabarito só muda a nota da própria pessoa** e a contagem dela no radar agregado; a nota de outras pessoas não é afetada.
- **Gravação da avaliação.** `apiLearnClinicalEvaluate` grava em `learning_attempts`:
  - `module='clinica'`, `activity='caso_clinico'`;
  - `score` de 0 a 100, `max_score=100`, `duration_seconds`;
  - `details = {caseId, caseSource, outcome, toxindrome, agent}`.

  O `outcome` do simulador é convertido assim: `concluido` vira `sobreviveu`, `obito` fica `obito` e `abandono` vira `estavel` (o paciente saiu vivo, sem conduta concluída). Se a gravação falhar, o parecer é devolvido mesmo assim, com `saved:false`, e o erro vai para o `error_logs`. A avaliação é auditada.
- **`apiLearnClinicalGenerateCase`.** Gera o caso, valida e grava em `clinical_cases` como `pending, source='ia'`. Devolve o caso com o id da linha, para a pessoa atender na hora, e registra auditoria.
- **`apiLearnClinicalLibrary`.** Devolve só casos `approved`, **sem `gabaritoPreceptor`** e sem o contexto oculto (fica só o temperamento). A lista sem filtro fica 5 min em cache no KV e é invalidada na revisão.
- **`apiLearnClinicalEpidemiology`.** Agrega `learning_attempts` da clínica: sobrevida (tudo que não é óbito), total e os 6 principais toxíndromes e agentes. Não devolve dado individual. Fica 5 min em cache, invalidado a cada avaliação gravada. Sem dados, `survivalRatePct` vem `null`.
- **Moderação do acervo.**
  - `apiAdminLearnListPendingCases` exige admin e devolve os casos pendentes com um resumo para a decisão.
  - `apiAdminLearnReviewCase` exige admin e só altera caso ainda `pending`. Um caso já revisado dá `ConflictError`. A revisão é auditada e invalida o cache da biblioteca.

### Casos resolvidos (`laift_resolved_cases`)

**Decisão: a marca fica local.** O "Concluído" no cartão do leito continua no `localStorage` do navegador. É só uma marca visual de "já atendi este leito".

O registro oficial de cada atendimento avaliado é o `learning_attempts` gravado no servidor. É dele que saem as estatísticas da área "Aprender" (`apiLearnGetMyStats`, da Equipe 2) e o radar.

O `apiLearnGetMyStats` não devolve a lista de ids de casos, então derivar a marca dele exigiria um endpoint novo só para um detalhe visual.

## Clínica e laboratório no front-end

- **A clínica não carrega mais o `api-service.js`.** Todas as chamadas passam por `callLaift()`, que usa `window.LaiftApi.call`. Sem a ponte, ou com falha, a função devolve `{success:false, message}` e nunca lança exceção. Nesses casos:
  - o paciente responde de forma simulada, com um aviso único no chat;
  - a avaliação é feita localmente por palavras-chave, marcada como "não registrada";
  - a geração usa um caso de contingência local;
  - o acervo e o radar mostram uma mensagem.
- **DOM seguro na clínica.** O `clinic-engine.js` não usa `innerHTML` em lugar nenhum. As reações de "digitando" viraram texto em itálico.
  - Os handlers inline da página viraram `addEventListener` em `clinica-page.js`.
  - Os textos "Groq 120B" saíram da interface.
  - A cota restante aparece abaixo do título: "IA hoje: X de Y casos · … avaliações · … perguntas".
  - Com a cota de casos esgotada, o botão fica desabilitado com "Cota diária de casos esgotada".
- **Laboratório.** A camada 1 local continua respondendo primeiro, com o acervo curado (`ROTAS_SINTESE` e `data/sinteses-database.js`). As camadas 2 e 3 viraram uma só chamada a `apiLearnLabPreceptor`.
  - Pedidos de síntese mandam `synthesisTerm`, e o servidor responde do cache compartilhado ou gera e grava ele mesmo.
  - Não existe mais nenhum `APPS_SCRIPT_GATEWAY` nem `fetch` neste arquivo.
  - `lab-preceptor.js` não tinha camada de IndexedDB própria. O IndexedDB do laboratório vive em `script.js` e `lab-storage.js`, da Equipe 4, e não foi tocado.
  - As respostas remotas saem como texto, com `<` e `>` trocados por `‹` e `›`. O chat do laboratório (`script.js`) ainda usa `innerHTML`, e essa troca garante que nenhuma tag seja criada. Ver "Pedidos de integração".
- **Painel admin "IA".** Mostra:
  - o percentual geral e um cartão por chave mascarada;
  - o uso das últimas 24 h;
  - as cotas por papel;
  - a fila de casos pendentes, com Aprovar e Rejeitar via `openConfirm`.

  É limpo no logout e na expiração da sessão. Funciona em 360 px, validado no E2E: sem rolagem horizontal e com alvos de toque de pelo menos 44 px.

## Custos e limites

- **Pior caso diário: 3.000 chamadas**, limitado pelo disjuntor. Com os `max_tokens` configurados, o teto de saída por chamada é:

  | Recurso | Teto de saída |
  |---|---|
  | chat | 700 |
  | evaluate | 2.500 |
  | generate_case | 6.000 |
  | lab_preceptor | 1.500 |

  O raciocínio do gpt-oss conta dentro do `max_tokens`.
- **Workers KV (plano gratuito): 1.000 gravações por dia.** Só gravam no KV:
  - os cooldowns, apenas em caso de falha;
  - o cache de síntese, uma vez por composto a cada 30 dias;
  - os caches de biblioteca e radar, uma vez a cada 5 min.

  Com o Groq inteiro fora do ar o dia todo, os cooldowns podem passar do limite. Nesse caso o KV recusa a gravação em silêncio, e o cooldown em memória do isolate continua funcionando.
- **`ai_usage_log`.** Ganha uma linha por tentativa, o que dá até cerca de 3.000 × tentativas por dia. Sugestão de limpeza periódica: `DELETE FROM ai_usage_log WHERE created_at < now() - interval '180 days'`. Ver as pendências.

## Deploy

1. **Migrações.** No Neon, aplicar `sql/012_learning.sql` (Equipe 2) e **depois** `sql/013_clinical_ai.sql`. As duas são idempotentes.
2. **Chaves.** Rodar `cd worker && wrangler secret put GROQ_API_KEYS` e colar **todas** as chaves atuais, uma por linha ou separadas por vírgula.
3. **Modelos.** Conferir em `wrangler.toml` as vars `GROQ_MODEL_FAST` (`openai/gpt-oss-20b`) e `GROQ_MODEL_SMART` (`openai/gpt-oss-120b`).
4. **Worker.** Rodar `cd worker && npm run deploy`.
5. **Conferência.** No modo admin, abrir **IA** e clicar em "Testar chaves agora". O esperado é 100% e uma linha por chave.
6. **Front-end.** Fazer o merge na `main`. O GitHub Actions publica, e o `admin-ai.js` já está no `build.js`.

Verificações locais:

- `cd worker && npm test && npm run validate:sql`
- `cd frontend && npm install && npm run e2e`

## Riscos

- **Injeção de prompt.** Mitigada, não eliminada:
  - regras fixas no prompt de sistema;
  - dado do usuário marcado como dado;
  - limites de tamanho;
  - saída validada;
  - renderização só como texto;
  - **moderação humana** antes de um caso gerado ir para outras pessoas.

  Uma pessoa ainda pode fazer o paciente "sair do papel" na própria sessão. O efeito fica restrito a ela.
- **Nota adulterável em casos locais.** Em casos embutidos ou gerados, o gabarito vem do cliente. Alguém pode inflar a própria nota. Isso afeta só as próprias estatísticas e, em escala mínima, o radar agregado. Casos do acervo usam o gabarito do servidor.
- **Custo e abuso.** Cotas por pessoa e disjuntor global limitam o prejuízo. Criar muitas contas visitante multiplica a cota, até o teto do disjuntor.
- **Termos de uso do Groq com várias contas gratuitas: PONTO A CONFIRMAR PELO RESPONSÁVEL.** O rodízio entre chaves de contas diferentes foi mantido por decisão do responsável. É preciso confirmar se os termos do Groq permitem isso. A camada já permite reduzir para uma chave, ou um modelo, só mudando o secret e as vars.
- **Dados enviados ao Groq.** Vão ao Groq o texto que a pessoa escreve (perguntas, diagnóstico, conduta) e o contexto do caso fictício. Nome, e-mail e id **não** são enviados. Ver o texto proposto para a Política de Privacidade abaixo.
- **Conteúdo gerado incorreto.** A IA pode errar clinicamente. Os rodapés da interface dizem que a resposta é gerada por IA, e o acervo só publica depois de revisão humana.

## Desvios de contrato

Todos são acréscimos compatíveis ou detalhes que o contrato não fixava:

1. **Campos extras nas respostas:**
   - `apiLearnClinicalEvaluate` devolve também `saved`.
   - `apiLearnClinicalGenerateCase` devolve também `caseSource: 'ia'`.
   - `apiLearnGetMyAiQuota` devolve também `remaining`, `resetsAt` e `aiConfigured`.
   - `apiAdminAiHealth` devolve também `configured`, `config` (modelos, cotas, disjuntor) e `usage24h`.
2. **Cota estourada** devolve `{ success:false, quotaExceeded:true, message }`, e não só `{success:false, message}`.
3. **Sem dados no radar**, `apiLearnClinicalEpidemiology` devolve `survivalRatePct: null`.
4. **`details.outcome`:** o `abandono` do simulador é gravado como `estavel`. O contrato só listava `sobreviveu`, `obito` e `estavel`.
5. **Toxíndromes** são normalizadas numa lista fechada: Colinérgica, Anticolinérgica, Simpatomimética, Opioide, Sedativo-hipnótica, Serotoninérgica, Hemorrágica/Coagulopatia, Hepatotóxica/Metabólica e Outra.
6. **`apiLearnLabPreceptor` com `synthesisTerm` válido:**
   - ignora `question`, `history` e `benchContext` no prompt, para evitar envenenamento do cache;
   - um acerto de cache não consome cota;
   - o recurso usa o modelo forte, o que o contrato não especificava.
7. **Rodízio sem ponteiro em KV:** usa um ponto de partida aleatório por isolate, pelo motivo das gravações em KV. O contrato dizia "round-robin".
8. **Cooldown** usa o `Retry-After` limitado entre 60 s e 1 h. **400, 404, 413 e 422 não fazem failover.**
9. **`apiLearnClinicalLibrary`** não devolve `gabaritoPreceptor` nem o contexto oculto, só o temperamento.
10. **`apiAdminAiHealth`** tem rate limit de 20 execuções por hora por admin.

## Pedidos de integração

### Equipe 2 (ponte `laift-identity.js` e fiscal)

- **Atribuição da ponte.** `global.LaiftApi = { call }` deve ser atribuído **sem** condição como `if (!global.LaiftApi)`. O E2E da Fase 3 injeta uma ponte de teste antes do script, e a real precisa substituí-la.
- **Timeout.** O timeout de 60 s do `callLearningApi` deve ser mantido. Os orçamentos da IA foram dimensionados para caber nele.
- **Estatísticas.** `apiLearnGetMyStats` deve ler a clínica de `learning_attempts` com `module='clinica' AND activity='caso_clinico'`. `clinicalCasesCompleted` é a contagem, e `clinicalAvgScore` é a média de `score` (0–100).
- **Fiscal.** Remover o cartão "Rede Neural Groq Cloud" do terminal fiscal (`modulos/fiscal/index.html` e `fiscal-engine.js`, `obterStatusSaudeIA`). O substituto é o painel admin **IA**.

### Equipe 4 (laboratório, `api-service.js`, CSP)

- **Chat do laboratório.** `modulos/laboratorio/js/script.js`, função `enviarDuvidaLab`, deve renderizar a resposta com `textContent`. Hoje usa `innerHTML` com `replace(/\n/g,'<br>')`. Proposta:

  ```js
  const div = document.createElement('div');
  div.className = 'lab-chat-msg msg-preceptor';
  div.style.whiteSpace = 'pre-wrap';   // quebra de linha sem <br>
  div.textContent = respostaTexto || '';
  chatBox.appendChild(div);
  ```

  A mesma troca vale para a mensagem do aluno (`msg-aluno`, hoje interpolada com `${msg}`, um XSS de si para si) e para o bloco de erro, que interpola `e.message`. Enquanto isso, `lab-preceptor.js` já neutraliza `<` e `>` nas respostas da IA.
- **Textos do laboratório.** Em `modulos/laboratorio/index.html`, trocar "Preceptor IA (Groq 120B)" (linha ~399) por "Preceptor IA", e "Preceptor 120B" (linha ~430) por "Preceptor IA". No comentário do cabeçalho de `js/script.js`, trocar "Groq 120B" por "IA".
- **CSP da clínica.** A página não tem mais handlers inline, mas ainda tem atributos `style=` e um bloco `<style>` da Fase 3 em `clinica/index.html`. A CSP vai precisar de `style-src 'unsafe-inline'`, ou esses estilos devem ir para o CSS compartilhado. `clinic-engine.js` também aplica estilos via `style.cssText` (CSSOM), o que não é afetado por `style-src` sem `unsafe-inline`.
- **`api-service.js`.** A clínica não o carrega mais. Os consumidores restantes são `fiscal` (Equipe 2), `quiz/app.js`, `anatomia-3d/js/api-cache.js` e `laboratorio/js/script.js`.

### Integrador (docs e teste compartilhado)

- **`docs/DEPLOYMENT.md`.** Acrescentar os passos 1–5 de "Deploy" acima (013 depois da 012, `wrangler secret put GROQ_API_KEYS`, teste no painel IA).
- **`docs/SECURITY.md`:**
  - **Risco residual 6.** O item "Identidade não verificável no Apps Script" deixa de valer para a IA da clínica e do laboratório, que agora usam a sessão da Worker.
  - **Riscos residuais novos.** Acrescentar: injeção de prompt (mitigações desta página), gabarito do cliente em casos locais (afeta só a própria nota) e cotas contornáveis com muitas contas (limitadas pelo disjuntor).
  - **Segredos.** Acrescentar `GROQ_API_KEYS` à seção de rotação de credenciais: gerar novas chaves no console do Groq, rodar `wrangler secret put GROQ_API_KEYS` e revogar as antigas.
- **`README.md`.** Uma linha sobre a IA na Worker e o painel admin **IA**.
- **`worker/test/handlers.test.js`.** ✅ Resolvido na integração: o título do teste da allowlist traz o total real (89 ações depois das Fases 2 e 3).
- **`docs/POLITICA_DE_PRIVACIDADE.md`.** Texto proposto, com atualização da versão em `LEGAL_VERSIONS.PRIVACY` e no `index.html`.

  Nova linha na tabela da seção 3:

  > | Perguntas e respostas escritas nos simuladores com IA (clínica virtual e laboratório), métricas de uso da IA | Oferecer o paciente virtual, o preceptor e a geração de casos; controlar custo e abuso (cota diária) | Execução de contrato (inciso V); métricas de uso: legítimo interesse (inciso IX) |

  Novo parágrafo na seção 5:

  > **Inteligência artificial.** Os recursos de IA da área "Aprender" (paciente virtual, preceptor da clínica, geração de casos e preceptor do laboratório) usam o serviço da **Groq, Inc.** como operador de dados. Quando você usa esses recursos, o texto que você escreve (perguntas, hipótese diagnóstica e conduta) e o contexto do caso clínico **fictício** são enviados à Groq para gerar a resposta. **Não enviamos seu nome, e-mail ou qualquer identificador da sua conta.** Não escreva dados pessoais reais seus ou de terceiros nesses campos. Na plataforma, guardamos apenas métricas de uso da IA (qual recurso, quando, quantos tokens, se funcionou), sem o conteúdo das conversas, e a nota e o desfecho dos casos que você concluir, que aparecem nas suas estatísticas. Casos gerados com IA podem ser publicados na biblioteca da liga depois de revisados pela diretoria; eles não contêm dados seus, apenas o seu vínculo como autor, visível só para administradores. O tratamento pela Groq segue os termos e a política de privacidade dela, com possível transferência internacional de dados (LGPD, art. 33).

## Pendências

- **Termos do Groq para várias contas gratuitas:** confirmar (ver Riscos).
- **Retenção do `ai_usage_log`:** definir o prazo (sugestão: 180 dias) e agendar a limpeza.
- **Casos do acervo antigo (planilha):** não foram importados. Precisam do código do Apps Script e de uma exportação da planilha, como as demais pendências do plano. A importação pode gravar em `clinical_cases` com `source='admin'` e `status='approved'`.
- **Criação e edição manual de casos pelo admin:** `source='admin'` já existe no schema, mas não há endpoint nem tela de criação ou edição. Hoje o admin só aprova ou rejeita.
- **Nenhuma chamada real ao Groq foi feita neste ambiente,** que não tem rede para a API nem chaves. Tudo foi validado com `fetch` simulado (Jest) e com a Worker simulada (E2E). Antes de liberar para todos, conferir no painel **IA**, após o deploy, e fazer um caso completo de ponta a ponta.
