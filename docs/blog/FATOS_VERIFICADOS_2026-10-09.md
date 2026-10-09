# Fatos verificados para o blog "Conheça a LAIFT"

Checagem: 2026-10-09 | base origin/main 3bb5909 | branch feat/blog-plataforma em 32680ed | consolidação do orquestrador (Onda 0)

Fonte única dos posts (`docs/blog/ESTILO.md:4`): **se o fato não está aqui, não entra.** Entradas: `docs/blog/verif/H1-modulos.md`, `docs/blog/verif/H2-visual.md` e `docs/blog/verif/H3-plataforma-futuro.md`. Quando relatório e código divergem, vale o código e a divergência fica na seção 7. "(inferência)" marca dedução sem prova direta.

## 0. Como foi conferido

| Conferência | Resultado |
|---|---|
| Aceite H1 (16d9fe3) | arquivo não vazio; 23 ocorrências de "NAO CONFIRMADO"; 60 citações `arquivo:linha`; sem e-mail pessoal nem cabeçalho de licença; 1 arquivo no commit; sem trailer |
| Aceite H2 (091041e) | arquivo não vazio; 13 "NAO CONFIRMADO"; 72 citações; 13 medidas de dimensão/viewBox; sem PII; 1 arquivo; sem trailer |
| Aceite H3 (4e6b42a) | arquivo não vazio; 9 "NAO CONFIRMADO"; 145 citações; 10 selos; roadmap sem datas; sem PII; 1 arquivo; sem trailer |
| Questões (recontagem) | `frontend/modulos/quiz/questions.js`: 240 por `^\s*{`, 240 por `question:`, 240 por `{ id:`. `frontend/modulos/toxicologia/questions.js`: 240 por `^\s*{`, 240 por `question:`, 240 por `^\s*id:` |
| Atlas, só a pasta `content` (recontagem) | `grep -rhoE '"status": ?"(auto-draft\|legacy-unverified\|reviewed\|approved)"' frontend/modulos/anatomia-3d/data/atlas/content \| sort \| uniq -c` → 143 `auto-draft`, 72 `legacy-unverified`, 0 `reviewed`, 0 `approved` |
| API_REGISTRY (recontagem) | `grep -cE '^  api[A-Za-z0-9]+:' worker/src/handlers.js` = 117; nomes únicos `api*` em `worker/openapi.yaml` = 117 |
| Sorteio H1 (10 linhas) | hero.js:17, assistant.js:620-623, msg-crypto.js:170, onboarding.js:144, liga.js:63, handlers.js:115/132/164/171/176/202/216/242/255/260, index.html:348, app.js:1571: todas conferem |
| Sorteio H2 (6 linhas) | styles.css:40 (`--press-scale: 0.98`), splash.js:18 (`SAFETY_MS = 4000`), laift-tokens.css:323, manifest.webmanifest:12, LIGHTHOUSE_2026-10-08b.md:9, sw.js PRECACHE = 49 entradas: todas conferem |
| Sorteio H3 (6 linhas) | sql/019_assistant.sql:21, featureFlagService.js:119-120, msg-crypto.js:42, backup.yml:26, riscos-residuais.md:76, ATLAS_CONTENT_POLICY.md:60: todas conferem |

## 1. Sumário executivo

1. O Aprender tem **5** módulos (`frontend/learning.js:60-86`), não 6. O terminal fiscal (`learning.js:88`) é só do admin.
2. Farmacologia e Toxicologia têm **240 questões cada** (recontado, seção 0).
3. O Worker expõe **117 actions** em 14 grupos (`worker/src/handlers.js:88-271`), com a mesma lista do `openapi.yaml`.
4. Migrações **001 a 019 aplicadas** e **020 a 024 pendentes** em produção, segundo os docs (`docs/ANDAMENTO.md:6`, `:26`; `docs/CHANGELOG.md:57`). Não há `sql/025`.
5. Flags públicas lidas em produção em 2026-10-09, por volta de 03:37-03:38 UTC: `chatbot_enabled=true`, `ux_v2_enabled=false`, `feedback_enabled` e `selection_open` ausentes (= desligadas).
6. A Lia (guia) está ligada em produção. A base de conhecimento, o feedback e a moderação da Lia estão prontos, mas aguardam as migrações 020 a 024.
7. O novo visual (vidro e hero da UX v2) **não** está ligado no app em produção (`ux_v2_enabled=false`; `frontend/hero.js:17`).
8. A `/liga` responde HTTP 200 em produção. O processo seletivo está fechado (`selection_open` ausente) e não há inscrição nativa.
9. A segurança tem base real: CSP por página, MFA TOTP, mensagens cifradas no navegador (X25519, HKDF, AES-GCM), rate limit e backup diário cifrado. Os limites ficam declarados: QR sem validade (O14), Termos e Privacidade em minuta (J2).
10. O Atlas **não** está revisado: 143 fichas `auto-draft` e 72 `legacy-unverified` na pasta `content`. Lighthouse e axe só existem para as páginas registradas (seção 4).

## 2. Matriz de módulos (normalizada a partir de H1)

Legenda de "produção": **ativo** = código no main + site e Worker publicados depois da #38 (`docs/ANDAMENTO.md:6`) + nenhuma flag desligada no caminho (inferência por doc; não há registro de publicação por módulo).

| ID | Módulo | O que faz | Produção | Flag (valor em 2026-10-09) | Teste (exemplo) | Entrada |
|---|---|---|---|---|---|---|
| M1 | Início | Resumo e atalhos do membro | ativo; o hero não aparece (exige ux_v2 e chatbot, `hero.js:17`) | ux_v2=false | `frontend/scripts/home.test.mjs`; `e2e/home.e2e.js` | `index.html:348`; `handlers.js:132` |
| M2 | Aprender (hub) | Cards dos 5 módulos e estatísticas | ativo | nenhuma | `learning-skeleton.test.mjs` | `index.html:362`; `learning.js:110` |
| M3 | Eventos | Lista e inscrição em eventos | ativo | nenhuma | `worker/test/eventService.test.js` | `index.html:397`; `handlers.js:164` |
| M4 | Propostas e votação | Enviar proposta e votar | ativo | nenhuma | sem teste dedicado (só `handlers.test.js`) | `index.html:411`; `handlers.js:171` |
| M5 | Tarefas | Inscrição em tarefas e comentários | ativo | nenhuma | `worker/test/taskService.test.js` | `index.html:439`; `handlers.js:176` |
| M6 | Equipe e organograma | Árvore da Liga e conexões | ativo | nenhuma | `orgChartService.test.js`; `connectionService.test.js` | `index.html:448`; `handlers.js:202`; `app.js:1571` |
| M7 | Mensagens cifradas | Conversas cifradas no navegador | ativo | nenhuma | `messageService.test.js`; `messagingKeyService.test.js` | `index.html:484`; `msg-crypto.js:42`, `:226`, `:281` |
| M8 | Perfil | Dados e preferências da conta | ativo | nenhuma | `profileService.test.js`; `e2e/mfa.e2e.js` | `index.html:521`; `handlers.js:115-117` |
| F1 | Crachá virtual | Cartão com papel e QR de presença assinado | ativo (inferência: #36 antes da #38) | nenhuma | `credential.test.mjs`; `e2e/credential.e2e.js`; `e2e/qr.e2e.js` | `credential.js:270`; `handlers.js:244` |
| F2 | Lia (guia) | Orienta e leva às telas; chat para quem está logado | ativo | chatbot_enabled=true | `assistant.test.mjs`; `e2e/assistant.e2e.js`; `lia*.test.mjs` | `assistant.js:620-623`; `handlers.js:140` |
| F3 | Feedback da Lia | Polegar e comentário nas respostas | pronto-aguardando-ativacao | feedback_enabled ausente | `assistant-feedback.test.mjs` | `assistant.js:274-276`; `handlers.js:145` |
| F4 | Onboarding | Passos por papel após o login | ativo (inferência) | passo da Lia depende de chatbot (on) | `onboarding.test.mjs`; `e2e/onboarding.e2e.js` | `app.js:937`; `onboarding.js:144` |
| F5 | Verificação em duas etapas | TOTP no login e códigos de recuperação | ativo (017 aplicada e chave cadastrada: `docs/ANDAMENTO.md:26`) | mfa_required NAO CONFIRMADO | `mfaTotp.test.js`; `mfaService.test.js`; `e2e/mfa.e2e.js` | `handlers.js:98`; `mfa.js:277` |
| F6 | Página /liga | Quem somos, áreas, processo seletivo, contato | ativo (HTTP 200, H3:86) | selection_open ausente (CTA oculto) | `e2e/liga.e2e.js` | `frontend/liga.html:23-121`; `liga.js:63` |
| Q1 | Farmacologia Básica | Simulador com 240 questões | ativo | nenhuma | `e2e/quiz-farmaco.e2e.js` | `learning.js:62`; `handlers.js:242` |
| Q2 | Toxicologia Clínica e Forense | Simulador com 240 questões | ativo | nenhuma | só `e2e/parsers.e2e.js` cita o módulo | `learning.js:67` |
| Q3 | Clínica Médica Virtual (OSCE) | Plantão, acervo e preceptor com IA | ativo | nenhuma | `worker/test/clinicalService.test.js` | `learning.js:72`; `handlers.js:255-259` |
| Q4 | Laboratório Virtual | Bancada, sínteses e estúdio 3D; preceptor com IA | ativo | nenhuma | `lab-preceptor.test.mjs` | `learning.js:77`; `handlers.js:260` |
| Q5 | Anatomia e Farmacocinética 3D | Atlas 3D, PK e vias; telemetria anônima | ativo; conteúdo em revisão (seção 6) | nenhuma | `frontend/scripts/atlas/*.test.mjs`; `e2e/atlas*.e2e.js` | `learning.js:82`; `sql/014_atlas_telemetry.sql:4` |
| A1-A8 | Admin: painel, usuários, eventos, propostas, tarefas, feedback, auditoria, denúncias | Gestão pela diretoria | ativo (só papel admin, `app.js:1044`) | nenhuma | `adminService.test.js`; `e2e/qa-full.e2e.js` | `index.html:298-345`; `handlers.js:182-196` |
| A9 | Terminal fiscal | Check-in de presença por QR | ativo (admin) | nenhuma | `e2e/fase2.e2e.js`; `e2e/qr.e2e.js` | `learning.js:88`, `:358`; `handlers.js:245-249` |
| A10-A11 | Painel de IA e moderação da Lia | Uso, cotas, métricas; moderação agregada | tela no main (`admin-moderation.js:338`); a moderação em si depende da 023 | moderation_enabled NAO CONFIRMADO | `admin-ai.test.mjs`; `admin-moderation.test.mjs` | `index.html:771`; `handlers.js:219`, `:262-263` |

## 3. Segurança e privacidade

| Tema | Fato | Fonte |
|---|---|---|
| CSP | 31 de 33 páginas HTML têm meta CSP. `index.html`, `liga.html`, 404, termos e privacidade usam `script-src 'self'`. As exceções ficam em quiz, fiscal e laboratório (+ jsDelivr), no estúdio (`unsafe-eval`) e no Atlas (`wasm-unsafe-eval`). O cabeçalho HTTP traz só `frame-ancestors 'self'` | `frontend/index.html:6`; `frontend/liga.html:6`; `modulos/laboratorio/studio/index.html:17`; `modulos/anatomia-3d/index.html:23`; `frontend/_headers:35-40`; S3 e O31b em `docs/riscos-residuais.md:12`, `:76` |
| MFA | TOTP (RFC 6238, HMAC-SHA1). Segredo cifrado com AES-256-GCM e chave derivada por HKDF-SHA256. Códigos de recuperação com hash e uso único | `worker/src/mfa/totp.js:8`, `:58`; `worker/src/mfa/secretBox.js:8-12`; `sql/017_mfa.sql:10` |
| Mensagens | X25519 + HKDF-SHA-256 → AES-GCM-256 no navegador. Chave privada não extraível. Sem frase-secreta desde a 010 | `frontend/msg-crypto.js:42`, `:174`, `:225-226`, `:281`; `sql/010_messaging_simplify.sql:7-8` |
| Rate limit | Tabela com UPSERT atômico. Por IP só no login; cotas por conta pendentes | `sql/003_rate_limits.sql:9-11`; S7 em `docs/riscos-residuais.md:16` |
| LGPD | A Política cita base legal (art. 7), transferência internacional (art. 33) e direitos (arts. 18 e 20). Termos e Privacidade são **minutas sem revisão de advogado**. Nenhum encarregado nomeado | `docs/POLITICA_DE_PRIVACIDADE.md:69`, `:163`, `:253`, `:267`; J2 em `docs/riscos-residuais.md:35` |
| Backup | Diário às 05:30 UTC, cifrado com `age` antes de sair do runner, guardado no R2. Retenção: 7 dias (diário), 400 dias (mensal) e 90 dias (artefato) | `.github/workflows/backup.yml:26`, `:89-98`, `:109-121`; `docs/BACKUP_RESTORE.md:3-12` |
| Backup funcionando | **Confirmado fora do repo, a registrar**: o dono informou o run 37873140437 e a Issue #34 fechada. O restore drill existe (`tools/backup/restore-drill.sh`); não há execução registrada (O1 "a mitigar") | `docs/riscos-residuais.md:45` |
| IA e dados | A Lia nunca altera dados; nenhum dado pessoal vai para a IA | `docs/TIME_CONTRATO.md:19` |
| Limites declarados | O14: QR do crachá sem validade. S8: QR estático. S9: troca de origem perde a identidade das mensagens. I2: IA pode errar clinicamente. 56 riscos abertos ou aceitos | `docs/riscos-residuais.md:56`, `:17`, `:18`, `:25`; H3 seção 3 |

## 4. Desempenho e acessibilidade (só números com fonte e data)

| Medição | Número | Fonte |
|---|---|---|
| Lighthouse produção, login `/`, mobile, mediana de 3 rodadas, 2026-10-08 | Desempenho 94; Acessibilidade 100; Boas práticas 100; SEO 100; LCP 1,2 s; TBT 124 ms; CLS 0,000 (R1: 0,041) | `docs/LIGHTHOUSE_2026-10-08b.md:9-17`, `:67` |
| Lighthouse produção, login `/`, desktop, mediana, 2026-10-08 | 100 / 100 / 100 / 100; LCP 369 ms; CLS 0,000 | `docs/LIGHTHOUSE_2026-10-08b.md:39-47` |
| Lighthouse build local, mobile, 2026-10-08 (não é produção) | Desempenho 81; CLS 0,113 | `docs/LIGHTHOUSE_2026-10-08.md:9`, `:15`, `:18` |
| axe-core 4.13.0, 375x812, 2026-10-08 | login, termos e privacidade: 0 critical e 0 serious; telas logadas: serious/critical 32 de 32 ok | `docs/qa/A11Y_EVIDENCIA_2026-10.md:8`, `:19-21`, `:37` |
| Alvo de toque | aviso: `pref-email-notif` com 13x44 px no Perfil (aceito, O34) | `docs/qa/A11Y_EVIDENCIA_2026-10.md:50`; `docs/riscos-residuais.md:79` |
| Movimento reduzido | regra global zera duração e iterações | `frontend/modulos/shared/laift-tokens.css:323-336` |

Os números valem só para as páginas medidas. Não existe Lighthouse de outras rotas públicas (`docs/LIGHTHOUSE_2026-10-08b.md:76`).

## 5. PWA e offline

| Fato | Fonte |
|---|---|
| Instalável: manifest com nome curto "LAIFT", `display: standalone` e ícones 192, 512 e maskable 512 | `frontend/manifest.webmanifest:4`, `:10`, `:15-19` |
| O service worker pré-carrega 49 arquivos do shell (estilos, scripts, Lia, ícone, splash) | `frontend/sw.js:23-29` |
| Estratégia: rede primeiro; sem rede, usa o cache; navegação sem cache devolve a página inicial | `frontend/sw.js:80-90` |
| **Não** funciona offline: API e POST (outra origem), CDN das páginas de módulo (O31b) | `frontend/sw.js:33`, `:36`; `docs/riscos-residuais.md:76` |
| O Atlas 3D tem cache próprio por build, fora do service worker | `frontend/sw.js:37`; `frontend/scripts/build.js:133`, `:143` |
| Aviso "Você está offline" quando o navegador perde a conexão | `frontend/shared-states.js:28`, `:109-121` |

## 6. Perspectiva de futuro (selos recalculados; sem datas)

| Item | Selo | Fonte | O que falta |
|---|---|---|---|
| Lia, guia da plataforma | EM PRODUCAO | `sql/019_assistant.sql:21`; `docs/ANDAMENTO.md:26`; leitura pública de flags (H1:26, H3:61) | nada no escopo atual |
| Base de conhecimento, feedback e moderação da Lia | PRONTO AGUARDANDO ATIVACAO | `docs/CHANGELOG.md:57`; `docs/ANDAMENTO.md:6`, `:69-71`; `sql/023_flags_v2.sql:49-51` | aplicar 020 a 022 e 024, reindexar e, por último, a 023 |
| Novo visual do app (UX v2: vidro, hero) | PRONTO AGUARDANDO ATIVACAO | `docs/ANDAMENTO.md:6`; `sql/023_flags_v2.sql:47`; `frontend/hero.js:17` | ligar `ux_v2_enabled` (desligada na leitura pública) |
| Abertura do processo seletivo pela /liga | PRONTO AGUARDANDO ATIVACAO | `frontend/liga.js:63`; `frontend/liga.html:128` | a diretoria ligar `selection_open` |
| Inscrição direta no site (Etapa 2) | PLANEJADO | `docs/TIME_CONTRATO.md:65`; `docs/liga/fontes/forms-processo-seletivo.md:3` | migração 025 e action de inscrição (nenhuma das duas existe) |
| Acervo compartilhado e busca global (F4) | EM ESTUDO | `docs/F4_DECISOES_JURIDICAS.md:123`, `:145` | decisões do dono e do advogado; rascunhos fora do main |
| Contas para jovens com responsável | EM ESTUDO | `docs/riscos-residuais.md:40`; `docs/TIME_CONTRATO.md:67` | depende de parecer jurídico; `minors_enabled` não existe no código |
| Revisão profissional do conteúdo do Atlas | PLANEJADO | `docs/ATLAS_CONTENT_POLICY.md:49-60`; seção 0 (143 + 72; 0 revisadas) | revisão por profissional com registro no conselho |
| Painel de flags para a diretoria | PLANEJADO | plano v4.2 aprovado pelo dono; `worker/src/handlers.js:157` (a action existe; nenhuma tela a chama) | a tela; o dono confirma no portão |
| Gráfico de Progresso | PLANEJADO | plano v4.2; `frontend/modulos/shared/charts.js:41` (componente radial sem tela) | definir onde entra |
| Funcionamento interno da Liga | NAO CONFIRMADO | nenhuma fonte no repo ("em breve" não aparece em `frontend/liga.html`, `liga.js` nem `docs/liga`) | fica fora dos posts até a diretoria definir |

## 7. Divergências (vale o código; registradas)

| # | Divergência | Fonte | Muda post? |
|---|---|---|---|
| D1 | O pedido citava 6 módulos no Aprender; são 5. O FISCAL_PATH é só admin | `learning.js:60-86`, `:88`, `:358` | sim: posts de Módulos e Bem-vindo dizem "cinco módulos" |
| D2 | `chatbot_enabled` está **ligada** em produção (2026-10-09, ~03:37-03:38 UTC), mas os docs dizem desligada; quando e por quem foi ligada não está registrado | `docs/AMBIENTES.md:142`; `docs/ANDAMENTO.md:26`; H1:26; H3:61 | sim: Lia = ativo |
| D3 | Liga "em andamento" nos docs, mas a PR #42 já foi mesclada (04eb9de) e a `/liga` responde 200 | `docs/CHANGELOG.md:7`; `docs/ANDAMENTO.md:147`; H1:88; H3:86 | sim: a /liga existe; o seletivo segue fechado |
| D4 | O rascunho da F4 aparece como 025, mas a 025 está reservada para a inscrição nativa (a F4 vira 026) | `docs/ANDAMENTO.md:127`; `docs/TIME_CONTRATO.md:65` | não (nenhum post cita número de migração da F4) |
| D5 | `PUBLIC_FLAGS` está na linha :120, não na :119. O doc lista 3 flags públicas; o código tem 4 (inclui `selection_open`) | `featureFlagService.js:120`; `docs/FEATURE_FLAGS.md:22` | não |
| D6 | `--press-scale` está em `styles.css:40`, não em `laift-tokens.css` | `frontend/styles.css:40` | não (afeta o WIREFRAME) |
| D7 | O splash do app não tem teste nem e2e próprios (o `ux-v2.test.mjs:134-172` cobre partes), não tem flag nem `inert`, e o texto é "LAIFT". O `index.html` tem dois `<main>` | `splash.js:83`; `index.html:83`, `:347`, `:984` | não (afeta a PR do splash) |
| D8 | "101 arquivos no precache" contra 49 entradas no `sw.js`. Os 101 provavelmente são o precache do Atlas impresso pelo build (inferência) | `docs/qa/A11Y_EVIDENCIA_2026-10.md:7`; `sw.js:23-29`; `build.js:143` | sim: o post de offline usa 49 e não cita 101 |
| D9 | Backup "funcionando desde 2026-10-09" não está no repo | H3:95 | sim: o post diz "backup diário cifrado" sem citar run nem data |
| D10 | O doc diz que não há tela de moderação, mas `admin-moderation.js` existe | `docs/AMBIENTES.md:271`; `docs/ANDAMENTO.md:87` | não |
| D11 | `ux_v2_enabled=false` em produção: vidro e hero não aparecem no app | leitura pública; `hero.js:17`; `ux-glass.css:14` | sim: Início e Bem-vindo não mostram o visual novo como atual |
| D12 | Selos recalculados: revisão do Atlas passa de EM ESTUDO (H3) a PLANEJADO (não depende de decisão externa). A /liga foi separada em página (ativa), abertura (pronta) e funcionamento interno (sem fonte) | `docs/blog/ESTILO.md:29-32` | sim: post Para onde vamos |
| D13 | O Edital v2 é proposta e a /liga diz "em revisão pela diretoria" | `docs/liga/EDITAL_2026_v2.md:1`; `frontend/liga.html:114` | sim: o post do seletivo não cita regras do edital como definitivas |
| D14 | 1424 testes do worker (#38) e 1506 (#40) no mesmo dia: PRs diferentes | `docs/CHANGELOG.md:62`, `:40` | não (nenhum post cita contagem de testes) |

## 8. AFIRMAÇÕES PROIBIDAS nos posts

1. Atlas "revisado", "aprovado" ou "validado por especialistas". Diga "em revisão".
2. "100% seguro", "garantido", "inviolável", "à prova de fraude", "imune a ataques".
3. Base de conhecimento, feedback ou moderação da Lia ativos em produção.
4. Novo visual (vidro) ou hero como estado atual do app.
5. "Inscrições abertas", "inscreva-se pelo site" ou inscrição nativa existente.
6. Datas, vagas, pesos ou notas do seletivo (use "a divulgar"); regras do Edital v2 como definitivas.
7. Qualquer coisa sobre menores além de "em estudo, depende de parecer jurídico" (nem a trilha de `EDITAL_2026_v2.md:45`).
8. QR do crachá "com validade" ou "impossível de copiar" (O14, S8).
9. "Funciona 100% offline" ou "tudo funciona sem internet".
10. Números de Lighthouse/axe fora da seção 4, ou números do login generalizados para a plataforma inteira.
11. "Revisado por advogado", "em total conformidade com a LGPD" ou "encarregado" nomeado.
12. Integração com OpenFDA na Toxicologia (é só etiqueta, `learning.js:69`).
13. "Seis módulos" no Aprender.
14. "Restauração do backup testada" (O1 a mitigar) ou o número do run.
15. "Verificação em duas etapas obrigatória" (`mfa_required` NAO CONFIRMADO).
16. Contagem de testes ou cobertura como estado atual.
17. Nome, foto, cargo com nome, e-mail pessoal ou @ de pessoa. O e-mail da Liga (`frontend/liga.html:120`) aguarda o OK da diretoria: o bloco mostra "e-mail a divulgar" (`frontend/blog/site.json` tem `email: null`).
18. "Ninguém nunca consegue ler suas mensagens": diga "cifradas no seu navegador" e cite o limite S9.
19. IA "confiável", "que acerta sempre" ou que substitui o professor (I2).
20. "Funcionamento interno da Liga em breve" ou "em breve" sem selo (`docs/blog/ESTILO.md:33`).

## 9. LISTA FINAL de posts (18)

Fusões guiadas pelos fatos:
- "Sobre a Liga" entra no Bem-vindo, porque missão, história e nome oficial seguem "a definir pela diretoria" e o post sozinho ficaria vazio.
- Desempenho e offline viram um post só: a mesma base de evidência (login e `sw.js`).
- Equipe (Liga) absorve o organograma; Perfil fica com as conexões.
- A Lia é um post só, com selo por recurso.

| # | slug | título | série | status | fontes |
|---|---|---|---|---|---|
| 1 | bem-vindo-a-laift | Bem-vindo à LAIFT | liga | ativo | `frontend/liga.html:23`, `:30`, `:37`, `:50`; `frontend/learning.js:60-86` |
| 2 | processo-seletivo-2026 | Processo seletivo 2026: como vai funcionar | liga | pronto-aguardando-ativacao | `frontend/liga.html:62-90`, `:114`, `:121`; `frontend/liga.js:63` |
| 3 | equipe-cargos-e-areas | Quem faz a LAIFT: cargos e diretorias | liga | ativo | `sql/008_league_org_chart.sql:10-27`; `worker/src/handlers.js:202`; `frontend/app.js:1571` |
| 4 | modulo-inicio | Início: o painel de cada membro | modulos | ativo | `frontend/index.html:348`; `worker/src/handlers.js:132`; `frontend/hero.js:17` |
| 5 | modulo-farmacologia | Farmacologia Básica: 240 questões comentadas | modulos | ativo | `frontend/learning.js:62-65`; `frontend/modulos/quiz/questions.js`; `worker/src/handlers.js:242` |
| 6 | modulo-toxicologia | Toxicologia Clínica e Forense | modulos | ativo | `frontend/learning.js:67-70`; `frontend/modulos/toxicologia/questions.js:1-3` |
| 7 | modulo-clinica-virtual | Clínica Médica Virtual (OSCE) | modulos | ativo | `frontend/learning.js:72-75`; `worker/src/handlers.js:255-259`; `docs/riscos-residuais.md:25` |
| 8 | modulo-laboratorio | Laboratório Virtual | modulos | ativo | `frontend/learning.js:77-80`; `worker/src/handlers.js:260`; `docs/riscos-residuais.md:76` |
| 9 | modulo-anatomia-3d | Anatomia e Farmacocinética 3D | modulos | ativo | `frontend/learning.js:82-85`; `docs/ATLAS_CONTENT_POLICY.md:49-54`; seção 0 (143 + 72) |
| 10 | eventos-e-cracha | Eventos, presença e crachá virtual | modulos | ativo | `frontend/index.html:397`; `worker/src/handlers.js:164`, `:244`; `docs/riscos-residuais.md:56` |
| 11 | propostas-votacao-tarefas | Propostas, votação e tarefas | modulos | ativo | `frontend/index.html:411`, `:439`; `worker/src/handlers.js:171`, `:176` |
| 12 | mensagens-cifradas | Mensagens cifradas entre membros | modulos | ativo | `frontend/msg-crypto.js:42`, `:226`, `:281`; `sql/009_messaging.sql:5`; `docs/riscos-residuais.md:18` |
| 13 | lia-a-guia | Lia, a guia da plataforma | modulos | ativo | `frontend/assistant.js:620-623`; `sql/019_assistant.sql:21`; `docs/CHANGELOG.md:57`; seção 6 |
| 14 | perfil-e-conexoes | Perfil, conexões e segurança da conta | modulos | ativo | `worker/src/handlers.js:98`, `:115-117`, `:216`; `frontend/mfa.js:277` |
| 15 | seguranca-e-privacidade | Segurança e privacidade na LAIFT | plataforma | ativo | seção 3 (`frontend/index.html:6`; `msg-crypto.js:226`; `.github/workflows/backup.yml:26`; `docs/riscos-residuais.md:35`) |
| 16 | desempenho-acessibilidade-offline | Rápida, acessível e instalável no celular | plataforma | ativo | `docs/LIGHTHOUSE_2026-10-08b.md:9-17`; `docs/qa/A11Y_EVIDENCIA_2026-10.md:19-21`; `frontend/sw.js:23-29`, `:36` |
| 17 | o-que-mudou | O que mudou na plataforma | plataforma | ativo | `docs/CHANGELOG.md:3`, `:23`, `:40`, `:57`, `:62` (sem citar contagem de testes) |
| 18 | para-onde-vamos | Para onde vamos | plataforma | planejado | seção 6 (cada item com o seu selo e a sua fonte) |

Observações obrigatórias:
- **Equipe (#3):** só cargos e diretorias (`sql/008_league_org_chart.sql:10-27`). Sem nomes, fotos ou e-mails pessoais. Nome e foto só com `autorizacaoEscrita: true`; senão, "nome a definir pela diretoria". Quem quiser conhecer os membros vai ao Instagram @laift.liga.
- **Processo seletivo (#2):** aponta para `/liga` e para o Instagram @laift.liga (`frontend/liga.html:121`). Vagas e datas "a divulgar". O edital está "em revisão pela diretoria" (`frontend/liga.html:114`). O CTA é "Acompanhe o seletivo no Instagram".
- **Menores:** nenhum post fala de menores além de "em estudo, depende de parecer jurídico", e isso só no #18.
- **Posts de módulos clínicos (#5 a #9):** terminam com o aviso de material educacional (`docs/blog/ESTILO.md:46-48`).
- **E-mail:** "e-mail a divulgar" em todos os posts até o OK da diretoria.

## NAO CONFIRMADO / NAO ENCONTRADO

- NAO CONFIRMADO: quando e por quem `chatbot_enabled` foi ligada (D2).
- NAO CONFIRMADO: valor em produção das flags não públicas (`rag_enabled`, `moderation_enabled`, `mfa_required`, `use_orchestrator`, `nvidia_fallback`).
- NAO CONFIRMADO: estado real do banco de produção; as migrações vêm dos docs.
- NAO CONFIRMADO: publicação por módulo; vale a publicação do site e do Worker (`docs/ANDAMENTO.md:6`).
- NAO CONFIRMADO: backup funcionando no repo (confirmado fora do repo pelo dono; a registrar em `docs/BACKUP_RESTORE.md`); execução do restore drill.
- NAO CONFIRMADO: revisão jurídica de Termos e Privacidade (J2).
- NAO CONFIRMADO: integração com OpenFDA (Q2); aviso `degraded` do preceptor de laboratório (`docs/ANDAMENTO.md:172`).
- NAO CONFIRMADO: os 101 arquivos do precache (D8); transparência de `laift-marca.png`.
- NAO CONFIRMADO: resultado de qualquer teste e cobertura de 80% (nada foi executado na Onda 0).
- NAO ENCONTRADO: missão, história e nome oficial da Liga (a definir pela diretoria); e-mail institucional confirmado.
- NAO ENCONTRADO: funcionamento interno da Liga ("em breve") em `frontend/liga.html`, `frontend/liga.js` e `docs/liga`.
- NAO ENCONTRADO: `minors_enabled` no código; `sql/025`; action de inscrição nativa; tela do painel de flags; tela do gráfico de Progresso.
- NAO ENCONTRADO: testes dedicados de Propostas, Denúncias, Auditoria, Clínica (front) e Toxicologia; e2e do splash.
- NAO ENCONTRADO: Lighthouse de rotas públicas além do login; axe em cadastro e recuperação de senha.
