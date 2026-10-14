# Auditoria geral da plataforma LAIFT ("Prova de fogo") — arquivo vivo

Fonte única da verdade da auditoria iniciada em 2026-10-14. Atualize **Estado**, **Fila** e **Log** ao fim de cada sessão. A PR que corrige um achado edita a linha dele (status e PR) e acrescenta uma linha no Log.

## 1. Estado
| Campo | Valor |
|---|---|
| Fase atual | **0 — Enxergar e estancar** (em início) |
| Última atualização | 2026-10-14 |
| Progresso por trilha | SEC 0/10 · OPS 0/9 · DAT 0/2 · MOB 0/10 · ENG 0/7 · CON 0/2 · LGPD 0/3 · SEO 0/3 · TEC 0/2 (verificados ÷ total não descartados; DOC-01 e OPS-07 em curso) |
| PR em curso | docs/auditoria-geral (esta: arquivo vivo + correção de docs defasados) |
| Próximo passo | Fila item 2 (SEC-01), depois item 3 (SEC-09) |
| Bloqueios do dono | Itens marcados **[DONO]** na Fila (painéis, teste de cadastro, revisor clínico, Android real) |
| Repositório | **Público por ora** (decisão do dono, 2026-10-14) — ver regra de divulgação (§3) |

## 2. Como retomar
1. `git fetch origin main && git log --oneline -10 origin/main`
2. Ler **§1 Estado** e **§4 Fila** deste arquivo (e o Log, §9).
3. `gh pr list --state open` para ver PRs em curso.
4. Ramificar sempre de `origin/main` num worktree novo (`.claude/worktrees/`); nunca mesclar sem a frase explícita do dono.
Regras do projeto: arquivos ≤ 800 linhas, TDD, CI verde, 1 ID por PR (máx. 3 do mesmo tipo, < 300 linhas de diff).

## 3. Regra de divulgação (OPS-07)
O repositório é público. Achados **abertos** de severidade CRÍTICA/ALTA ficam aqui só com ID, título genérico, área e status — **sem receita de exploração** (sem números de limites nem passos de ataque). A evidência detalhada desses itens fica em `Desktop\cortex\AUDITORIA_GERAL_DETALHES.md` (fora do git, só do dono) e passa para este arquivo quando o item virar "verificado". Documentos já públicos que tratam de itens abertos (`docs/avaliacao/AVALIACAO_2026-10-09.md`, `docs/AUDITORIA_SEGURANCA_E_ESCALA_2026-09-25.md`, `docs/riscos-residuais.md`) devem ser revisados com o mesmo critério (item OPS-07).

## 4. Fila (ordem de execução; máx. 10)
1. **DOC-01** + criar este arquivo + link em `CONTINUIDADE.md` (esta PR).
2. **SEC-01** limite de login (Fase 0).
3. **SEC-09** papéis nas ações de proposta (1 h).
4. **[DONO]** teste real de cadastro em 3 provedores (Gmail, Outlook, e-mail institucional) e registro do % de confirmação.
5. **OPS-01** `/health` raso + monitor externo.
6. **OPS-02 / OPS-09** anotar consumo atual nos painéis e medir horas do Neon acordado **[DONO + agente]**.
7. **[DONO]** OPS-05 confirmar que produção usa o papel `laift_worker`; OPS-07 aplicar a política de divulgação.
8. **[DONO]** CON-02 nomear o revisor clínico e a meta semanal.
9. **SEC-08 ADR** (escopo do cookie HttpOnly e impacto no GitHub Pages).
10. **DAT-01** parte 1 (`usage_daily` + `activity_days`).
Logo depois (Fase 1): SEC-04, SEC-06 (HSTS escalonado + headers na API), SEO-01.

## 5. Achados
Legenda — **Sev:** CRÍTICO (impede o uso ou vaza dados) · ALTO · MÉDIO · BAIXO. **Status:** aberto → em curso → corrigido (mergeado) → verificado (produção, com evidência) | verificado por revisão (decisões/ADR/docs) | descartado (com motivo). **Dono:** A = agente, D = dono do produto, J = jurídico/externo. **Esf:** P (<1 dia), M (1–3 dias), G (>3 dias). Origem cita itens de `docs/avaliacao/AVALIACAO_2026-10-09.md` (I/C) e `docs/riscos-residuais.md` (O).

### Segurança (SEC)
| ID | Título | Sev | Evidência | Status | Dono | Esf | PR | Origem |
|---|---|---|---|---|---|---|---|---|
| SEC-01 | Limite de login: revisar ordem e comportamento do teto global | CRÍTICO | `worker/src/services/authService.js`, `worker/src/security.js` (detalhe: complemento privado) | aberto | A | M | — | I1 |
| SEC-02 | Cadastro sem saída: reenvio de confirmação, limpeza de contas não confirmadas, mensagens uniformes | ALTO | `authService.js`, `maintenance.js` (detalhe: complemento privado) | aberto | A | M | — | C-cadastro |
| SEC-03 | Rate limit de escrita por conta (proposta, feedback, comentário, avatar) e limpeza de avatares | MÉDIO | `proposalService.js`, `profileService.js`, `mediaService.js` | aberto | A | M | — | — |
| SEC-04 | Reautenticação (step-up) nas ações de admin que mudam papel/banem | MÉDIO | `adminService.js` | aberto | A | M | — | — |
| SEC-05 | Cota de IA: fatia reservada a membros, IA só com e-mail confirmado, alerta a 70% do Groq | ALTO | `aiService.js`, `constants.js` | aberto | A | M | — | — |
| SEC-06 | Headers/CSP/HSTS: HSTS escalonado, CSP também como header, COOP/CORP, headers na API | MÉDIO | `frontend/_headers`, `worker/src/index.js` | aberto | A | M | — | — |
| SEC-07 | Teto de tamanho do corpo da requisição | MÉDIO | `worker/src/index.js`, `mediaService.js` | aberto | A | P | — | — |
| SEC-08 | Token de sessão: sair do localStorage para cookie HttpOnly (ADR na Fase 0; implementação sob flag nas Fases 1–2) | ALTO | `frontend/app.js` (`pm_session`), `LaiftApi.call` | aberto | A | G | — | O37 |
| SEC-09 | Autorização por papel e rate limit nas ações de proposta (M1 da auditoria de 2026-09-25) | ALTO | `worker/src/services/proposalService.js`, `handlers.js` (detalhe: complemento privado) | aberto | A | P | — | M1 (2026-09-25) |
| SEC-10 | `window.App.getState()` expõe o token a qualquer script same-origin; migrar módulos para `getIdentity()` | MÉDIO | `frontend/app.js` (~L2659 / `getIdentity` ~L2663) | aberto | A | M | — | O37 |

### Operação e custos (OPS)
| ID | Título | Sev | Evidência | Status | Dono | Esf | PR | Origem |
|---|---|---|---|---|---|---|---|---|
| OPS-01 | Monitor de disponibilidade: `/health` raso e público + detalhes só por ação admin autenticada | ALTO | sem monitor externo hoje | aberto | A | P | — | — |
| OPS-02 | Planilha semanal de consumo vs limites (CU-h Neon, requisições, KV, tokens Groq, Brevo) | ALTO | gatilhos em `docs/backlog-futuro.md` dependem de "usuários ativos" não medidos | aberto | D+A | P | — | — |
| OPS-03 | Treino de restauração completo (`tools/backup/restore-drill.sh` em branch Neon, cronometrado) e incluir `laift-memory` no backup | ALTO | `docs/BACKUP_RESTORE.md`: backup passou em 2026-10-09 e o dump abriu; **restauração completa não registrada** | aberto | D | M | — | B3, O1 |
| OPS-04 | Remetente de e-mail no domínio (SPF/DKIM/DMARC) e confirmação do plano/limite do Brevo | ALTO | `worker/wrangler.toml` (remetente Gmail); limites do Brevo não documentados | aberto | D | M | — | — |
| OPS-05 | Confirmar que produção usa o papel `laift_worker` (RLS efetivo) | ALTO | `sql/031`/`032`; nenhum doc confirma o papel da `DATABASE_URL` | aberto | D | P | — | — |
| OPS-06 | Status HTTP real nas respostas de erro + retry só em leitura idempotente + mensagem útil (auditar chamadores antes) | ALTO | `worker/src/index.js`, `handlers.js`, `frontend/app.js` | aberto | A | G | — | — |
| OPS-07 | Política de divulgação (repo público) e revisão dos docs de auditoria já públicos; checklist de privatização futura | MÉDIO | §3 deste arquivo | em curso | D+A | P | esta | — |
| OPS-08 | Coleta agregada de erros do frontend (sem PII); Sentry/GlitchTip só se insuficiente | ALTO | `apiLogClientError` só planejado em `docs/ATLAS_PLANO_V2.md:120`; Atlas tem `telemetry.js` próprio (flag desligada) | aberto | A | M | — | — |
| OPS-09 | Auditar o que mantém o Neon acordado e fixar orçamento de CU-h | ALTO | `docs/cortex/ESCALA-BANCO.md`; polling de mensagens (5 s→45 s, pausa em aba oculta) e sync de 60 s | aberto | A+D | M | — | B2 |

### Dados e métricas (DAT)
| ID | Título | Sev | Evidência | Status | Dono | Esf | PR | Origem |
|---|---|---|---|---|---|---|---|---|
| DAT-01 | Analytics mínimo: `usage_daily(day, metric, n)` agregado + `activity_days(profile_id, day)` único/usuário/dia; funil de 5 eventos; sem cookies | ALTO | `worker/src/services/adminService.js` (dashboard só conta membros, eventos, propostas, tarefas) | aberto | A | M | — | — |
| DAT-02 | Analytics v2: uso por módulo, duração de sessão, erro por módulo, coortes D1/D7/D30, Web Vitals agregados (após ≥4 semanas de DAT-01) | MÉDIO | — | aberto | A | M | — | — |

### Mobile e desempenho (MOB) — MOB-10 não utilizado
| ID | Título | Sev | Evidência | Status | Dono | Esf | PR | Origem |
|---|---|---|---|---|---|---|---|---|
| MOB-01 | Botão voltar do Android: `router.js` + `pushState`/`popstate` (3 passos) | ALTO | sem `pushState`/`popstate` (só `replaceState`: `app.js` ~L930, ~L2700) | aberto | A | G | — | — |
| MOB-02 | Fila offline do quiz (IndexedDB + `idempotencyKey`) | MÉDIO | `modulos/quiz/quiz-engine.js:434` ("Não foi possível registrar") | aberto | A | M | — | — |
| MOB-03 | Trocar `alert()`/`confirm()` nativos por modais | MÉDIO | `modulos/clinica/clinic-engine.js:1073,1243`; `modulos/quiz/quiz-engine.js:299,495` | aberto | A | M | — | — |
| MOB-04 | Admin/Lia carregados sob demanda por papel (hoje ~140 KB admin + ~124 KB Lia para todos) | MÉDIO | `frontend/index.html` | aberto | A | M | — | — |
| MOB-05 | Imagens (WebP/AVIF; `laift-marca.png` 285 KB exibido a 40 px; `icon-512.png` 269 KB) e Cache-Control de JS/CSS | MÉDIO | `frontend/_headers`, `frontend/scripts/build.js` | aberto | A | M | — | — |
| MOB-06 | Laboratório: fontes < 12 px (117 declarações; HUD 8,3 px) e alvos < 44 px (links de Termos/Política) | MÉDIO | `docs/ux-progresso/AUDITORIA.md` K7/M1 | aberto | A | M | — | — |
| MOB-07 | Service worker com módulos (hoje só a casca é pré-cacheada) | MÉDIO | `frontend/sw.js` (`laift-shell-v9`) | aberto | A | M | — | U1 |
| MOB-08 | Instalação do PWA no app logado, `shortcuts`, `screenshots`, `id` no manifest | BAIXO | `frontend/manifest.webmanifest`; prompt só em `blog/instalar.js` | aberto | A | P | — | — |
| MOB-09 | Orçamento de desempenho no CI (hoje só no Atlas); Lighthouse **logado** | MÉDIO | `docs/LIGHTHOUSE_2026-10-08b.md` mediu só a tela de login | aberto | A | M | — | — |
| MOB-11 | Atlas: fallback de WebGL (detectar renderização por software, avisar, modo lista/busca/ficha sem 3D) | MÉDIO | `modulos/anatomia-3d/js/engine/renderer.js` trata `webglcontextlost`, não software rendering | aberto | A | M | — | — |

### Engajamento (ENG)
| ID | Título | Sev | Evidência | Status | Dono | Esf | PR | Origem |
|---|---|---|---|---|---|---|---|---|
| ENG-01 | "Continuar de onde parou" na home | MÉDIO | `frontend/home.js` ("Agora" só mostra eventos, votação, caixa de entrada) | aberto | A | M | — | — |
| ENG-02 | Streak e meta diária (servidor, fuso America/Sao_Paulo) | MÉDIO | `learning_attempts.created_at`; `learningService.js` | aberto | A | M | — | — |
| ENG-03 | Quiz diário determinístico | MÉDIO | — | aberto | A | M | — | — |
| ENG-04 | Onboarding que leva ao 1º quiz em ≤ 2 toques (e texto da barra inferior defasado) | MÉDIO | `frontend/onboarding.js:34` | aberto | A | M | — | — |
| ENG-05 | Microinterações e feedback visual/háptico | BAIXO | — | aberto | A | M | — | — |
| ENG-06 | Revisão por tópico fraco (repetição espaçada por questão exige tabela nova; só com dados de DAT-02) | BAIXO | — | aberto | A | G | — | — |
| ENG-07 | "Novidades" in-app (`frontend/whats-new.js`), 1× por versão | BAIXO | — | aberto | A | P | — | — |

### Conteúdo (CON) e jurídico (LGPD)
| ID | Título | Sev | Evidência | Status | Dono | Esf | PR | Origem |
|---|---|---|---|---|---|---|---|---|
| CON-01 | Selo discreto (ⓘ) "ainda não revisada" + "Reportar erro" em questões/fichas sem revisor | ALTO | 480 questões sem fonte/revisor; 215 fichas do Atlas, 0 revisadas | aberto | A | M | — | C5 (2026-10-09) |
| CON-02 | Plano operacional de revisão: revisor(es) nomeado(s), meta semanal, fonte obrigatória (`source`, `reviewed_by`, `reviewed_at`), checklist assinado | CRÍTICO | decisão na Fase 0; execução na Fase 5A | aberto | D | G | — | C5 |
| LGPD-01 | Exclusão de conta self-service (efeito imediato; purga definitiva ≤ 30 dias; sujeita a parecer) | ALTO | exclusão hoje é manual, até 180 dias (Política §7) | aberto | D+J+A | G | — | C-LGPD |
| LGPD-02 | Controle de idade e bloqueio de IA/memória a menores — **adiado por decisão do dono**; obrigatório antes de abrir amplamente/monetizar | ALTO | cadastro não coleta idade; Forms aceita 12–17 | aberto (adiado) | D+J | M | — | J7 |
| LGPD-03 | Política v2 + re-aceite (Forms, Europe PMC, localStorage, memória, `activity_days`); consentimento da memória sai de RASCUNHO | ALTO | `docs/POLITICA_DE_PRIVACIDADE.md`, `docs/memoria-consentimento-RASCUNHO.md` | aberto | D+J | M | — | — |

### SEO e marca (SEO) e dívida técnica (TEC)
| ID | Título | Sev | Evidência | Status | Dono | Esf | PR | Origem |
|---|---|---|---|---|---|---|---|---|
| SEO-01 | Higiene: og/twitter em `termos`/`privacidade`; sitemap-fonte = dist (6 vs 26 URLs); cópia do GitHub Pages com `noindex` + canonical; noscript com texto dos módulos | MÉDIO | `frontend/sitemap.xml`, `termos.html`, `privacidade.html` | aberto | A | M | — | — |
| SEO-02 | Conteúdo e indexação: páginas públicas de prévia estáticas, Search Console/Bing, pauta por buscas reais | MÉDIO | home entrega ao robô só o `<h1>Entrar</h1>` | aberto | A+D | G | — | — |
| SEO-03 | Sinais de marca: Google Business, Wikidata, parcerias — só com dados confirmados pelo dono | BAIXO | `sameAs`: Instagram real é `laift.liga`; `github.com/Diretoria-DPF` não é rede da Liga | aberto | D | M | — | — |
| TEC-01 | Vendorizar libs do jsDelivr (3Dmol, smiles-drawer, OpenChemLib, RDKit/WASM, leitor de QR) e remover o CDN do `script-src` | MÉDIO | `modulos/quiz`, `laboratorio`, `laboratorio/studio`, `fiscal` (todos com SRI) | aberto | A | M | — | O31b |
| TEC-02 | Dívida de arquivos > 800 linhas (regra do escoteiro): `frontend/app.js` 2760, `studio.js` 3444, `bio-database.js` 4061; 23 arquivos do frontend (medido na `main` em 2026-10-14, sem vendor) | MÉDIO | `wc -l` na `main` | aberto | A | G | — | B5 |
| DOC-01 | Docs defasados: O1 (backup), "8 abas", Lia 35/72, link do arquivo vivo | BAIXO | `docs/riscos-residuais.md`, `docs/ANDAMENTO.md`, `docs/CONTINUIDADE.md` | em curso | A | P | esta | — |

## 6. O que o rascunho inicial errava (não propagar)
- A barra inferior tem **4 itens** de membro (Início, Aprender, Eventos, Perfil), não 8; "Aprender" não está escondido; o botão "Refazer" já não fica atrás do nav; inputs já têm 16 px.
- O login **já tem** limites por e-mail, IP e global (o problema é o comportamento, não a ausência); o cache KV de leituras quentes **existe**; JSON-LD **existe** (home, liga, blog); Chart.js não está na home (CDN só em quiz, laboratório e fiscal, sempre com SRI).
- O Instagram da Liga é `laift.liga`; `github.com/Diretoria-DPF` não é rede da Liga; não existe "/aprender público".
- Metas de DAU/D7 **não são mensuráveis hoje**: não há analytics de produto.
- "Mover HMAC para o frontend" seria inseguro; WebSocket/Durable Objects não cabem no plano Free; keep-warm do Neon gasta a cota.
- O item sobre WebGL em software de `CONTINUIDADE.md` (falhas só locais no Windows) é verdade para o CI, mas o risco em aparelhos fracos é real (MOB-11).
- "A restauração do backup foi testada": o backup diário passou em 2026-10-09 e o dump abriu, mas o treino de restauração completo **não foi registrado** (OPS-03).

## 7. Decisões
| Data | Decisão | Alternativa rejeitada | Quem |
|---|---|---|---|
| 2026-10-14 | Cadastro externo continua aberto; IA só após confirmar e-mail e visitantes limitados a 30% da cota global | Fechar o cadastro externo | dono |
| 2026-10-14 | Gamificação só pessoal (streak, meta, quiz diário, conquistas); sem ranking público | Ranking social (o score vem do navegador e é fraudável) | dono |
| 2026-10-14 | **Menores: manter sem controle de idade** por ora. Risco aceito conscientemente; LGPD-02 vira pré-requisito do go/no-go de abertura ampla e de monetização | Bloquear menores agora | dono |
| 2026-10-14 | **Repositório continua público**; GitHub Pages segue ativo como ambiente de gerenciamento (cópia com `noindex` + canonical) | Privatizar o repo / desligar o Pages | dono |
| 2026-10-14 | Detalhes de vulnerabilidades abertas ficam fora do git até serem corrigidas (§3) | Tudo em um arquivo público | acordado no plano |
| 2026-10-14 | O arquivo vivo mora no repositório (sem ponteiro em `Desktop\cortex`, que quebraria se o dono trocar de máquina); o complemento privado é exceção só para detalhes de itens abertos | Ponteiro local | acordado no plano |
| Pendente | Remetente de e-mail no domínio e plano Brevo (padrão: sim, Fase 0) | — | dono |
| Pendente | Segundo admin "de emergência" com runbook (padrão: sim) | — | dono |

## 8. Pré-mortem (E = estimativa; medir antes de afirmar)
| # | Risco | Prob./Impacto | Sinal | Itens |
|---|---|---|---|---|
| R1 | Negação de acesso ao login por tráfego hostil, que também gasta escritas do banco | Alta / Crítico | bloqueios de login por dia | SEC-01 |
| R2 | E-mail de confirmação não chega e o usuário fica sem saída | Média-alta E / Crítico | % confirmados em 48 h | SEC-02, OPS-04 |
| R3 | Neon excede ~100 CU-h/mês E | Média E / Crítico | CU-h > 55% no dia 15 | OPS-09, OPS-02 |
| R4 | Workers atinge 100k requisições/dia | Baixa / Alto | > 40k/dia | OPS-02 |
| R5 | IA esgotada para os membros (cota global e Groq ≈ 100–130 chamadas/dia por modelo E) | Média / Alto | tokens > 70% | SEC-05 |
| R6 | Bus factor 1 e restauração nunca treinada | Média / Crítico | treino > 90 dias | OPS-03 |
| R7 | Token de admin roubado altera papéis | Baixa-média / Crítico | mudança de papel sem step-up | SEC-04, SEC-08 |
| R8 | Voltar do Android fecha o app; ≥ 4 toques até o 1º quiz; sem gancho de retorno | Alta / Alto | funil, D1/D7 | MOB-01, ENG-* |
| R9 | Atlas 9–12 s em Fast 3G; fontes de 8,3 px no laboratório | Alta em celular simples / Médio | LCP, toque < 44 px | MOB-05/06 |
| R10 | Questão errada divulgada (480 sem fonte/revisor; 215 fichas, 0 revisadas) | Média / Alto | erros reportados | CON-01, CON-02 |
| R11 | Menores usam IA/memória; Política desatualizada — **risco aceito pelo dono por ora** | Média / Alto se comercial | — | LGPD-01..03 |
| R12 | Cegueira: sem DAU/retenção, gatilhos de upgrade nunca disparam | Certa / Alto | — | DAT-01 |

Diferencial defensável: Tutor com guardrails, simulação clínica, Atlas 3D em PT-BR, memória opt-in — não o volume de questões frente a Anki/UWorld.

## 9. Log (uma linha por sessão)
- 2026-10-14 — Auditoria iniciada: 3 agentes de leitura validaram o rascunho contra o código; plano elaborado em Opus e aprovado pelo dono (decisões em §7). Worktree `docs/auditoria-geral` criado de `origin/main` (501244f, PR #68 incluída). Criado este arquivo; corrigidos O1, "8 abas" e Lia 35/72; link em `CONTINUIDADE.md`. Complemento privado criado fora do git. Próximo: SEC-01.

## 10. Fases e critérios de saída
| Fase | Itens | Critério de saída |
|---|---|---|
| **0 Enxergar e estancar** | DAT-01, OPS-01, OPS-02, OPS-09, OPS-03, OPS-05, OPS-07, SEC-01, SEC-09, SEC-08 (só ADR), CON-02 (decisão), teste de cadastro | baseline registrado; restauração cronometrada; SEC-01 e SEC-09 verificados; ADR aceito; revisor nomeado |
| **1 Não cair, vazar nem barrar** | SEC-02, OPS-04, SEC-03, SEC-04, SEC-05, SEC-06, OPS-06, SEC-07, SEC-08 (sob flag), OPS-08, MOB-01, SEO-01 | 0 SEC crítico/alto aberto (exceto SEC-08 em produção sob flag); confirmados ≥ 90% |
| **2 Mobile-first real** | MOB-02..09, MOB-11, TEC-01, SEC-10 + conclusão do SEC-08, CON-01 | Lighthouse mobile ≥ 90 **logado**; roteiro ok a 360 px low-end; nenhum token acessível a JS |
| **3 Diversão e retenção** | ENG-01..07, DAT-02 | melhor que o baseline (≥ 2–4 semanas de DAT-01 antes) |
| **4 SEO e marca** | SEO-02, SEO-03 | "LAIFT" no top 3; indexadas = sitemap |
| **5A Conteúdo confiável** | CON-02 (execução), licenças do Atlas | meta semanal cumprida; selo "em revisão" some nos itens aprovados |
| **5B LGPD e jurídico** | LGPD-01, LGPD-02, LGPD-03 | parecer jurídico anexado; go/no-go comercial |
| **6 Dívida (contínua)** | TEC-02 | nenhum arquivo novo > 800 linhas |

**Não fazer:** SSR/SSG da SPA inteira; WebSocket/Durable Objects no Free; HMAC/segredos no frontend; keep-warm do Neon; contadores ou rate limit em KV (~1k escritas/dia); ranking público com score vindo do navegador; push antes de medir retenção; metas fixas de DAU antes do baseline; reescrever em framework; pré-cachear o Atlas de 47 MB.

**Fora do escopo por fase:** F0 sem UI nem gamificação. F1 sem mexer em mobile além do MOB-01, sem refatorar módulos, sem trocar planos de hospedagem. F2 sem features de engajamento nem conteúdo novo. F3 sem ranking social, sem push, sem tabela por questão antes de o DAT-02 indicar uso. F4 sem SSR, sem criar perfis em redes sem dados confirmados pelo dono. F5 sem monetização e sem mudar documentos legais sem parecer. F6 só refatoração com testes verdes e comportamento inalterado.

## 11. Capacidade (estimativas; recalibrar ao fim da Fase 0)
Unidade: "sessão" = uma sessão de trabalho entre limites de uso, que fecha 1–2 PRs.
| Fase | Sessões de agente | Horas do dono |
|---|---|---|
| 0 | 3–4 | ~3 h (painéis, teste de cadastro, nomear revisor) |
| 1 | 8–12 (SEC-08 ≈ 3) | merges + 2 h (DNS/remetente, Android real) |
| 2 | 8–10 | 2 h (aparelho real) |
| 3 | 6–8, após ≥ 4 semanas de dados | decisões de produto |
| 4 | 4–6 | contas e pauta, sob demanda |
| 5A | depende do revisor | tempo do revisor (o gargalo real) |
| 5B | 3–4 | parecer jurídico externo |
| 6 | ~20% de cada PR | — |
Com 2–3 sessões por semana: ~3–4 meses até o fim da Fase 3 (estimativa).

## 12. Nova avaliação e portões
- Reexecutar a tabela de achados; "verificado" só com evidência em produção (curl de headers, Lighthouse logado, painéis).
- Varreduras: gitleaks, `frontend/scripts/e2e/axe-gate.js`, `qa-full.e2e.js`, Lighthouse mobile logado (home, quiz, Atlas, laboratório).
- Metas **condicionais ao baseline** (2–4 semanas): funil cadastro→1º quiz = baseline +20 p.p. ou ≥ 60%; D7 = baseline × 1,5; 5xx < 0,5%; CU-h no dia 15 ≤ 50%.
- Carga leve **só em staging** (20 usuários virtuais por 10 min com o padrão real de polling); nunca contra produção nem contra a IA.
- Teste com 3–5 estudantes no próprio celular **[DONO]**: cadastrar e confirmar ≤ 5 min; 1º quiz ≤ 60 s após o login; voltar sem sair do app; achar uma estrutura no Atlas ≤ 90 s; perguntar ao Tutor; SUS ≥ 70 e a pergunta "por que não voltaria?".
- **Go para abrir a mais usuários:** Fases 0–2 verificadas; LGPD-01 e LGPD-02; SEC-05; restauração com menos de 90 dias; DAT-01 ativo; OPS-07 revisado.
- **Go para monetizar:** o anterior + conteúdo revisado com fonte, licenças do Atlas resolvidas, parecer jurídico, D7 estável por 2 meses, SEC-08 em produção e SEC-10 concluído, segundo responsável técnico.
