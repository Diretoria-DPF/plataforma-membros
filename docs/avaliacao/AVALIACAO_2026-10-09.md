# Avaliação da plataforma LAIFT (2026-10-09)

Avaliador: Opus 5.5, somente leitura. Base: `origin/main` c132c0f (identidade da Liga #47, Lia #46, blog, `ux_v2_enabled` ligada).
Método: leitura dos documentos de estado e do código por amostragem, capturas de `docs/identidade/capturas/`. Não rodei build, testes nem e2e.
Números de testes vêm dos documentos; contagens de arquivos, telas e linhas foram medidas agora. "Não verificado" = não dá para confirmar só lendo.
Em andamento em outra frente (não são defeitos aqui): tela de login sem a cabeça da Lia, botões maiores "Conheça a LAIFT" e "Acessar blog",
miniatura do laço rosa no aviso do blog, endereço da UNINASSAU para Rua dos Maçons, 364, rodapé da Liga no blog.

## 1. Resumo executivo
| Eixo | Nota | Justificativa |
|---|---|---|
| Usabilidade | 6,5 | Telas claras e "Voltar" em tudo; mas o cadastro tem becos sem saída e a barra do app tem 8 itens com rótulo de 10 px. |
| Acessibilidade | 7,5 | Lighthouse 100 e regras fortes (44 px, 4,5:1, movimento reduzido); teste manual com leitor de tela nunca registrado. |
| Segurança e privacidade | 6,5 | Base técnica muito boa (CSP, hash, allowlist); limite global de login travável por 1 IP; Política ainda é minuta. |
| Desempenho | 8,5 | Login mobile: Perf 94, LCP 1,2 s, CLS 0; sobra um PNG de 285 KB e JS/CSS sem minificar. |
| Confiabilidade e operação | 6 | Backup cifrado validado e staging separado; restauração nunca treinada, flags só por SQL, sem monitor externo. |
| Código e testes | 7 | 52 arquivos de teste no Worker e 51 suítes e2e; `app.js` com 2.688 linhas, 10 e2e vermelhos e cobertura não medida. |
| Conteúdo | 7 | Fontes oficiais e "a divulgar" honesto; nenhuma revisão humana com registro profissional documentada. |
| Lia e IA | 6,5 | Arquitetura segura (lista branca, hash, moderação); base pequena (recall 13/24) e ativação da #46 incompleta. |
| Preparo para crescer | 5,5 | Planos gratuitos (Groq ~25 ativos/dia), limites globais de liga pequena, promoção a membro e exclusão manuais. |
**Nota geral: 6,8/10.** Produto sólido para uma liga pequena; os riscos estão na entrada (cadastro e login), no jurídico e na operação.

## 2. Pontos positivos (manter e proteger)
- **CSP rígida:** `script-src 'self'` sem inline (`frontend/index.html:6`); `innerHTML` só em `safe-dom.js` (`docs/TIME_CONTRATO.md:13`); o e2e `csp` barra o deploy (`docs/AMBIENTES.md:37`).
- **Autenticação:** bcrypt calculado no banco (`worker/src/services/authService.js:148`), `crypt()` contra hash fixo para e-mail inexistente (`:242-247`), tokens com pepper (`:143`), sessão de 30 min e teto de 12 h (`worker/src/constants.js:119-120`), MFA TOTP.
- **API fechada:** 117 ações numa allowlist com `hasOwnProperty` (`worker/src/index.js:84`, `worker/src/handlers.js:88`).
- **Flags com falha segura e auditoria pela API** (`docs/FEATURE_FLAGS.md:12-16`); regra "nasce desligada".
- **Backup:** dump diário e mensal cifrado com age no R2, validado em 2026-10-09 (`docs/BACKUP_RESTORE.md:3-12`, `:66-67`).
- **Staging** com site, API e banco próprios, sem dado real (`docs/AMBIENTES.md:3-14`).
- **Retenção automática** de sessões, tokens, logs e dados da Lia (`worker/src/maintenance.js:56-67`).
- **Lia com minimização:** pergunta guardada só como hash (`docs/POLITICA_DE_PRIVACIDADE.md:135-138`); botões só da lista branca (`docs/TIME_CONTRATO.md:19`); registro de pesquisas sem `profile_id` (`docs/lia/REVISAO.md:46`).
- **Terceiro só por clique:** mapa do OpenStreetMap carrega só ao clicar (`docs/identidade/PLANO.md:31-33`).
- **Sem invenção:** vagas e datas "a divulgar" (`frontend/liga-ciclo.json:4-9`); "Processo seletivo aberto" só aparece com a flag (`frontend/styles.css:846-847`).
- **Saúde com fonte:** Outubro Rosa com ~25 referências oficiais (`frontend/blog/conteudo/campanhas.json:982-1185`) e aviso "não substitui consulta" (`:38`); correções críticas aplicadas (ex.: "100%" explicado, `:98`).
- **Desempenho:** mediana mobile Perf 94, LCP 1,2 s, CLS 0; desktop 100 (`docs/LIGHTHOUSE_2026-10-08b.md:9-16`, `:39-46`).
- **Navegação:** "Voltar" em 17 painéis, no cadastro, no "Esqueci" e no 404 (`docs/identidade/STATUS.md:12`).
- **Riscos e backlog com gatilhos objetivos** (`docs/riscos-residuais.md`, `docs/backlog-futuro.md`).

## 3. Pontos negativos e dívidas
- **Estado espalhado e desatualizado** (37 arquivos na raiz de `docs/`): `CONTINUIDADE.md:47` manda abrir a PR da identidade, já mesclada (#47); `FEATURE_FLAGS.md:22` lista 3 flags públicas, o código tem 4 (`featureFlagService.js:120`).
  O1 diz que o backup falha (`riscos-residuais.md:45`), mas ele passou (`BACKUP_RESTORE.md:66-67`); `TIME_CONTRATO.md:20` ("próxima 025") contradiz `:65`.
- **Monólitos:** `frontend/app.js` 2.688 linhas (O33 registrava 2.499); `index.html` 1.026; `liga.css` 867; `styles.css` 849. 20 arquivos de código passam de 800 linhas.
- **Testes vermelhos normalizados:** 10 e2e falham desde antes (`docs/CONTINUIDADE.md:30`). O deploy roda só `csp` e `smoke` (`docs/AMBIENTES.md:32`).
- **Cobertura não medida** (`worker/jest.config.js` sem coverage), e a regra do repositório pede 80%. O Semgrep só gera relatório (`.github/workflows/security.yml:115`).
- **Token de sessão** em `localStorage` e em `App.getState()` (`frontend/app.js:2587`; O37), com módulos em iframe da mesma origem (S4).
- **Flags só por SQL ou curl:** nenhuma tela chama `apiAdminSetFeatureFlag` (grep no `frontend/`: 0). O SQL não grava auditoria (O30).
- **Sem exclusão nem exportação em autosserviço:** nenhuma ação no registro (`docs/AMBIENTES.md:333`); a Política dá até 180 dias (`docs/POLITICA_DE_PRIVACIDADE.md:214`).
- **Restauração nunca treinada** (`docs/CHANGELOG.md:70`); a janela do Neon é de ~6 h (`docs/AMBIENTES.md:51`).
- **Erro da API volta com HTTP 200** (`worker/src/index.js:100-110`): um monitor externo não enxerga falha. Também não há monitor de disponibilidade no repositório.
- **HSTS de 5 minutos** há semanas (`frontend/_headers:36`).
- **Site legado:** o GitHub Pages ainda é publicado a cada push, sem testes e sem `_headers` (`.github/workflows/deploy-frontend.yml:3-8`). A CORS de produção aceita `github.io` e `localhost` (`worker/wrangler.toml:29`).
- **Mídia em `r2.dev`** (`worker/wrangler.toml:37`). A Cloudflare limita essa URL e não a indica para produção.
- **Peso evitável:** `laift-marca.png` tem 291.829 bytes e entra no PRECACHE (`frontend/sw.js:28`). JS e CSS saem sem minificar (`docs/LIGHTHOUSE_2026-10-08b.md:57-59`).
- **Teto gratuito:** Groq atende ~25 ativos/dia (`docs/backlog-futuro.md:20`); KV tem ~1.000 escritas/dia (O3).
- **Lia:** recall@4 de 13/24 só com trigramas (O36); `sql/026` não aplicada; rerank sem calibração (`docs/lia/REVISAO.md:56`).
- **Mensagens presas ao aparelho:** limpar o navegador ou trocar de aparelho perde o histórico (`frontend/messaging.js:28-33`). A pessoa só descobre depois (`:550`).

## 4. Pontos críticos (P0/P1)
**C1 (P0). Um IP trava login, cadastro e redefinição de todos.** Impacto: ninguém entra por 15 min (login) ou 1 h (cadastro, reset), repetível.
- Probabilidade: média. Basta um script de ~61 pedidos; um evento com mais de 60 logins em 15 min também trava, porque o login certo conta.
- Evidência: `authService.js:233-235` confere o teto global **antes** do IP e do e-mail; `security.js:96-118` conta toda tentativa;
  `LOGIN_GLOBAL` = 60/15 min (`constants.js:178`); `REGISTER_GLOBAL` 30/h < `REGISTER_IP` 40/h (`:184`, `:200`).
- Correção (I1): e-mail e IP primeiro; o global conta só falhas, com teto alto; testes com dois IPs.

**C2 (P1). Cadastro sem saída e e-mail frágil: perda de membros na entrada.** Quem perde o e-mail de confirmação (48 h) fica preso; não há reenvio (grep "reenvi": 0).
- Becos: cadastrar de novo dá "já existe" (`authService.js:134-136`); o login dá a mensagem genérica (`:263-268`; `constants.js:223`);
  a redefinição troca a senha, mas não confirma o e-mail (`authService.js:385-387`); a conta não confirmada nunca é apagada (`maintenance.js:56-67`).
- Remetente `@gmail.com` pelo Brevo (`wrangler.toml:34`); a autenticação do domínio está planejada e não feita (`docs/MIGRACAO_CLOUDFLARE.md:73-75`).
- Probabilidade: alta (entrega na caixa de entrada: não verificado). Correção (I2).

**C3 (P1). Menores e Google Forms.** Impacto: LGPD art. 14, dado de adolescente no Google (EUA); o Forms aceita 12 a 17 anos (`riscos-residuais.md:40`).
- Falta: a Política não cita Google nem Forms (grep: 0); o edital não diz a retenção (`frontend/edital.html:163-164`); o Forms tem áreas antigas e "Campus Pituba" (`CONTINUIDADE.md:58`).
- Probabilidade: certa ao ligar `selection_open`. Correção (I5, I11): maioridade até o parecer; Política e edital completos antes de abrir.

**C4 (P1). Base jurídica em minuta.** Impacto: jurídico e de confiança; probabilidade média.
- Evidência: a página pública diz "Minuta, revisão jurídica pendente" (`frontend/privacidade.html:37`); exclusão manual em até 180 dias;
  sem re-aceite da versão 2026-10-08 (`docs/AMBIENTES.md:332`); chaves de `localStorage` não descritas (J5). Correção (I5, I9).

**C5 (P1). Saúde sem revisão humana com registro profissional.** Impacto: erro de saúde com a marca da Liga; probabilidade média.
- Evidência: Atlas com 0 de 215 fichas revisadas (`FATOS_VERIFICADOS_2026-10-09.md:112`); Outubro Rosa revisado só pelo orquestrador
  (`docs/blog/campanhas/outubro-rosa/REVISAO.md:1`); questões dos módulos: não verificado. Avisos e fontes não substituem revisão. Correção (I10).

**C6 (P1). Recuperação de desastre não comprovada.** Impacto alto, probabilidade baixa. Nenhum treino de restauração (`CHANGELOG.md:70`),
  PITR de ~6 h, sem monitor externo, erro da API com HTTP 200. Correção (I7).

**C7 (P1, condicional). Pesquisa externa da Lia.** O aviso de privacidade sai depois do envio (`frontend/assistant.js:519-525`; `docs/lia/REVISAO.md:29`);
  a Política não cita a Europe PMC (grep: 0). Certo se `research_enabled` ligar antes. Correção (I3, passo 6).

## 5. Usabilidade
**Detalhes que já ajudam:**
- "Voltar" no canto superior esquerdo em páginas e painéis; barra pública com Início, Blog, Entrar e Cadastrar (captura `blog-375-claro.png`).
- Aviso de que a conta começa como visitante e de que o e-mail é obrigatório (`index.html:128`); limites do avatar ditos antes (`:138`).
- `autocomplete` correto em e-mail, senha, nome e telefone (`index.html:94-97`, `:145-154`); mensagens em `role="alert"` (`:110`).
- Estados vazios claros ("Não há eventos publicados no momento", captura `app-voltar-375-claro.png`); onboarding de 3 a 4 passos por papel (`onboarding.js:7`).
- Processo seletivo: 5 passos "Antes de começar", etapas com selo eliminatória/classificatória, 5 perguntas frequentes, edital imprimível (captura `processo-375-claro.png`).
- Mapa por clique e "abrir no app de mapas"; aviso "Nova publicação no blog" com até 14 dias (`docs/identidade/PLANO.md:34-35`).
- Atalhos de teclado (`keyboard-shortcuts.js`); a Lia leva à tela certa e cita a fonte (`assistantService.js:266-276`).

**Atritos por jornada:**
- **Visitante, cadastro, e-mail, login:** o C2; seletor "SMS (indisponível na V1)" inútil (`index.html:171-176`); telefone obrigatório (`:153`);
  nome "não pode ser alterado depois" (`:144`); sem "mostrar senha"; sessão de 30 min sem uso, então o membro do PWA entra de novo a cada volta.
- **Candidato, processo seletivo, formulário:** criar conta não é se inscrever (Google Forms), e nada explica isso; "Cadastrar" no blog gera uma conta de visitante.
  O `/liga` tem 8.204 px de altura a 375 px (captura); o "Voltar" passa por cada chip de atalho (`docs/identidade/STATUS.md:32`); o Forms tem dados antigos.
- **Membro (Aprender, Eventos, Propostas, Tarefas, Mensagens, Perfil):** barra inferior com 8 itens e rótulos de 10 a 11 px com reticências
  (`styles.css:344-347`; "Mensag…" na captura); mensagens presas ao aparelho sem aviso antes; o visitante não sabe como vira membro (`onboarding.js:26`).
- **Admin (10 painéis):** sem tela de flags, de reenviar confirmação, de excluir ou anonimizar conta; promoção a membro após o Forms manual e sem prazo.
- **Celular e leitor de tela:** Lighthouse 100 só no login (`LIGHTHOUSE_2026-10-08b.md:76`); teste manual com NVDA, JAWS e VoiceOver nunca
  registrado (`QA_LEITORES_DE_TELA.md:169-171`); 82 textos com menos de 11 px nos módulos (`backlog-futuro.md:37`).
- **Lia:** "Não encontrei" provável para pergunta do acervo enquanto a busca for só por trigramas (O36); aviso de pesquisa tardio (C7);
  emergência sem números de atendimento (`worker/src/assistant/docsConteudo.js:117-118`).

## 6. O que pode melhorar (por área)
| Área | Melhoria | Esforço | Valor |
|---|---|---|---|
| Autenticação | Limites por IP e e-mail antes do global; o global conta só falhas | P | alto |
| Autenticação | Reenviar confirmação; a redefinição confirma o e-mail; "mostrar senha" | M | alto |
| E-mail | Domínio `laift.com.br` autenticado no Brevo (SPF, DKIM e DMARC) e remetente `noreply@` | P (dono) | alto |
| Privacidade | Excluir e exportar a própria conta; apagar contas não confirmadas após N dias | M | alto |
| Jurídico | Política e edital completos (Google Forms, OSM, Europe PMC, localStorage, retenção, idade) | P Claude / G advogado | alto |
| Operação | Painel de flags com confirmação e auditoria | M | alto |
| Operação | Treino de restauração; monitor externo de disponibilidade | P | alto |
| Segurança | HSTS de 1 ano; desligar o GitHub Pages; CORS de produção só com `laift.com.br` | P | médio |
| Segurança | Token fora de `getState()` (`callApiAuthed`) | G | médio |
| Desempenho | Marca em WebP de até 40 KB; minificar JS e CSS; mídia em domínio próprio | P | médio |
| App no celular | Barra com 5 itens + "Mais"; rótulos de 12 px ou mais; cartão "Como virar membro" | M | alto |
| Lia | Ativação da v2 em ordem; números oficiais de emergência com fonte; painel de lacunas | M | alto |
| Conteúdo | Revisão humana assinada (Outubro Rosa, questões, Atlas) | G | alto |
| Código | Extrair Administração de `app.js`; dividir `liga.css`; consertar os 10 e2e; medir cobertura | M | médio |
| Documentação | Uma fonte de estado (`CONTINUIDADE.md`); atualizar riscos, flags e contrato | P | médio |

## 7. Sugestões priorizadas
| id | Item | Por quê | Esforço | Valor | Depende de | Ficha sugerida |
|---|---|---|---|---|---|---|
| S1 | Limites de autenticação sem bloqueio geral | C1, P0 | P | alto | Claude (dono aprova os tetos) | `AV-01-rate-limit.md` |
| S2 | Reenvio de confirmação, redefinição que confirma, faxina de não confirmadas | C2 | M | alto | Claude + dono (prazo) | `AV-02-funil-cadastro.md` |
| S3 | Domínio de e-mail autenticado | C2 | P | alto | dono (Brevo e DNS) | `AV-03-email-dominio.md` |
| S4 | Ativação da Lia v2 (reindexar, 026, cache) | #46 já está na `main` | M | alto | dono (flags) + Claude | `AV-04-lia-ativacao.md` |
| S5 | Higiene de produção (HSTS, Pages, CORS, imagem, `r2.dev`) | baixo custo | P | médio | dono (DNS) + Claude | `AV-05-higiene-prod.md` |
| S6 | Painel de flags | tira o SQL do caminho | M | alto | Claude; portão visual | `AV-06-painel-flags.md` |
| S7 | Pacote jurídico (idade, Política, edital, retenção, re-aceite) | C3, C4 | P/G | alto | dono + jurídico | `AV-07-pacote-juridico.md` |
| S8 | Treino de restauração e monitor externo | C6 | P | alto | dono + Claude | `AV-08-operacao.md` |
| S9 | 10 e2e vermelhos, cobertura medida, Semgrep bloqueante | qualidade | M | médio | Claude | `AV-09-testes.md` |
| S10 | Barra do app, visitante para membro, aviso das mensagens | atrito diário | M | alto | Claude; portão visual | `AV-10-ux-app.md` |
| S11 | Excluir e exportar conta | LGPD | M | alto | jurídico + Claude | `AV-11-titular.md` |
| S12 | Revisão humana de saúde e números de emergência na Lia | C5 | G | alto | dono (revisor) | `AV-12-revisao-saude.md` |
| S13 | Forms atualizado e flag só com datas | C3 | P | alto | dono e diretoria | `AV-13-processo.md` |
| S14 | Consolidar documentos de estado | divergências | P | médio | Claude | `AV-14-docs.md` |
| S15 | Extrair Administração de `app.js`; dividir `liga.css` | arquivo quente | M | médio | Claude | `AV-15-modularizar.md` |
| S16 | Token fora de `getState()` | O37 | G | médio | Claude (depois) | `AV-16-token.md` |

## 8. PLANO DE CONTINUIDADE
### 8.0 Regras do dono (valem para todo agente)
- **Equipe:**
  - Opus 5.5 orquestra: lê o código, escreve as fichas e revisa;
  - Sonnet produz o código de risco (autenticação, banco, Lia, build);
  - Haiku faz o mecânico (documentos, textos, testes simples, CSS pontual), uma ficha cada, até 3 arquivos, aceite por comando e relatório de até 12 linhas;
  - no máximo 3 agentes ao mesmo tempo. A sessão principal dispara os agentes, integra os arquivos quentes (`index.html`, `app.js`, `build.js`, `sw.js`), roda as suítes e abre a PR.
- **O dono só revisa e mescla.** Sem auto-merge e sem linhas de atribuição nos commits.
- **Nada de segredos no chat** nem em arquivo. Quem digita é o dono (`wrangler secret put`, `gh secret set`).
- **Saúde só com fonte aberta verificada.** Nada de dose ou conduta na interface.
- **Sem inventar** vagas, datas, notas, pesos ou nomes: fica "a divulgar".
- **Flags só com OK do dono**, uma de cada vez. Quando o classificador bloquear, não contornar: pedir o comando ao dono.
- **Portão visual antes de PR de interface:** capturas em 375 e 1280 px, claro e escuro, aprovadas pelo dono.
- **Banco:** branch do Neon antes de cada migração; `--dry-run` primeiro; ledger com hash. Próxima migração livre: conferir em `docs/TIME_CONTRATO.md` (hoje a F4 é a 025 e a inscrição nativa é a 027, então a próxima é a 028).
- **GateGuard:** se pedir fatos, escreva 2 linhas e repita a mesma chamada. Ramifique sempre de `origin/main` num worktree.

### 8.1 Estado de partida
- #46 (Lia) e #47 (identidade) estão mescladas.
- Em produção: `ux_v2_enabled` ligada; 020 a 024 aplicadas; **026 não aplicada**.
- Se a base da Lia foi reindexada depois do deploy: não verificado.
- Em andamento: os ajustes da tela de login, do blog e do endereço (cabeçalho). Na troca para Rua dos Maçons, 364, conferir CEP e coordenadas em fonte aberta, como em `docs/identidade/PLANO.md:28-30`.

### 8.2 Iniciativas (nesta ordem)
**I1. Limites de autenticação sem bloqueio geral (C1)**
- Opus orquestra, Sonnet produz. Esforço: P (meio dia).
- Objetivo: um IP não trava o login, o cadastro nem a redefinição de todos.
- Por que agora: é P0, explorável hoje, e o processo seletivo vai trazer pico de acesso.
- Passos:
  1. Conferir e-mail e IP antes do global (`authService.js:129-131`, `:233-235`, `~:307`).
  2. Contar no global só as falhas, com uma função nova `recordFailure`, e subir o teto.
  3. `REGISTER_GLOBAL` maior ou igual a `REGISTER_IP`.
  4. Testes: 61 tentativas do IP A não bloqueiam o IP B; login certo não consome o global.
- Arquivos: `worker/src/services/authService.js`, `worker/src/constants.js:169-200`, `worker/src/security.js`, `worker/test/authService.test.js`.
- Aceite: `cd worker && npm test -- -i authService security` verde com os testes novos; `npm test` completo verde.
- Riscos: afrouxar demais (manter 8 por e-mail a cada 15 min). Quem decide: o dono aprova os tetos.

**I2. Cadastro sem beco sem saída (C2)**
- Sonnet no Worker, Haiku na tela. Esforço: M.
- Passos:
  1. `apiResendConfirmation`: resposta sempre igual, limite por e-mail e por IP, e o token novo invalida o anterior. Botão "Reenviar e-mail de confirmação" no login e depois do cadastro.
  2. `confirmPasswordReset` também grava `email_confirmed_at`.
  3. A faxina apaga a conta não confirmada depois de N dias (o dono decide; sugestão: 30).
  4. Admin: "Reenviar confirmação" na lista de usuários.
  5. Dono: autenticar `laift.com.br` no Brevo e trocar `MAIL_FROM_ADDRESS` (`wrangler.toml:34`, `:127`).
- Arquivos: `authService.js`, `handlers.js`, `constants.js`, `maintenance.js`, `openapi.yaml`, `index.html`, `app.js`, testes.
- Aceite: testes do Worker verdes; e2e novo `cadastro` (cadastrar, reenviar, confirmar, entrar); o dono confirma a chegada fora do spam em Gmail, Outlook e e-mail institucional.
- Riscos: enumeração de e-mail (resposta neutra) e abuso de envio (limites). Quem decide: o dono (prazo e domínio).

**I3. Ativar a Lia v2 em produção na ordem segura**
- Opus orquestra; Sonnet faz a calibração e o aviso; Haiku faz os documentos. Esforço: M.
- Passos (`docs/lia/REVISAO.md:68`):
  0. Conferir que o Worker no ar contém a #46.
  1. Reindexar pelo painel e conferir `total` e `embedded` ≈ 73 e `embeddingAvailable` true.
  2. `rag_enabled` em 100%, sem condições.
  3. Simular e aplicar a `sql/026`, com o `CHECK` de tamanho (REVISAO, item 11).
  4. Ligar `rag_cache_enabled` e observar 24 h.
  5. Calibração L11 no staging antes de `rag_rerank_enabled`.
  6. `research_enabled` só depois de I5 e com o aviso de privacidade antes do envio (`assistant.js:519-525`).
- Aceite: painel com 73/73/true; `SELECT count(*) FROM lia_pesquisas` funciona; 24 h sem `ASSISTANT_KB_INDEX_FAILED` em `error_logs`; `cd worker && npm test -- -i ragEval` verde.
- Riscos: reindexar sem o binding de IA (O20). Quem decide: o dono, flag por flag.

**I4. Higiene de produção**
- Haiku no mecânico, Sonnet no build. Esforço: P.
- Passos:
  1. HSTS de `max-age=31536000` (`_headers:36`).
  2. Desligar `deploy-frontend.yml` e tirar `github.io` e `localhost` da CORS de produção (`wrangler.toml:29`).
  3. Marca em WebP ou PNG de até 40 KB (`sw.js:28`).
  4. Minificar JS e CSS no `build.js`.
  5. Mídia em domínio próprio do R2, com o `img-src` da CSP atualizado.
  6. `/blog-sw.js` com `no-cache` no `_headers`.
- Aceite: `curl -I https://laift.com.br/` mostra o HSTS de 1 ano; `node scripts/e2e/run.js csp smoke blog` verde; Lighthouse mobile com Perf de 95 ou mais e "imagens" abaixo de 50 KiB.
- Riscos: avatares antigos com a URL `r2.dev` (manter as duas na CSP por um tempo). Quem decide: o dono (DNS e Pages).

**I5. Pacote jurídico e LGPD (C3, C4)**
- Opus redige, Haiku aplica o texto aprovado. Esforço: P para Claude, G no calendário.
- Passos: Claude escreve `docs/juridico/PACOTE_2026-10.md` com perguntas fechadas e minutas:
  - idade mínima: maioridade no edital e no Forms até o parecer;
  - Política: Google Forms, OSM, Europe PMC, chaves de `localStorage` (J5) e retenção dos dados de candidatos;
  - prazo de exclusão (hoje 180 dias) e re-aceite;
  - Termos: autoria anônima (J6) e conteúdo de terceiros;
  - coautoria e INPI (J1).
  O dono leva ao advogado; depois Claude aplica o texto e sobe `LEGAL_VERSIONS` junto com `index.html:184,188`.
- Aceite: cada item marcado "aprovado" ou "alterado" pelo advogado; a página sem "Minuta"; `cd worker && npm test -- -i authService` verde.
- Riscos: atraso do parecer, que bloqueia I11 e o `research_enabled`. Quem decide: dono e jurídico.

**I6. Painel de flags no admin**
- Sonnet e Haiku. Esforço: M.
- Passos:
  - lista de `apiAdminListFeatureFlags` com estado, %, condições, quem mudou e quando;
  - alternar com confirmação por `apiAdminSetFeatureFlag`;
  - `mfa_required` só leitura;
  - cada flag com o que faz; `selection_open` com o aviso "só com vagas e datas".
- Arquivos: `frontend/admin-flags.js` (novo), `index.html`, `build.js`, `sw.js`, teste unitário e e2e.
- Aceite: e2e `admin-flags` (listar, alternar, linha em `audit_logs`); `csp` verde; portão visual aprovado.
- Riscos: clique errado (por isso a confirmação). Quem decide: o dono.

**I7. Confiabilidade e testes (C6)**
- Sonnet e Haiku; o dono faz o treino. Esforço: M.
- Passos:
  1. O dono roda `tools/backup/restore-drill.sh` numa branch vazia e registra em `docs/CHANGELOG.md:64-70`.
  2. Monitor externo: workflow a cada 15 min com `tools/ci/smoke.mjs`, que abre uma Issue.
  3. Consertar ou pôr em quarentena registrada os 10 e2e (`apis`, `atlas-*`).
  4. Cobertura com `--coverage` e piso registrado.
  5. Semgrep bloqueante depois da triagem.
- Aceite: treino registrado com as contagens; `node scripts/e2e/run.js apis atlas-farmaco atlas-feedback atlas-ficha-nav atlas-fisiologia atlas-moleculas` verde; relatório de cobertura no CI.
- Riscos: e2e instável por carga (rodar em série). Quem decide: o dono (treino).

**I8. Usabilidade do app no celular**
- Sonnet produz, Haiku faz os testes. Esforço: M.
- Passos:
  - barra com Início, Aprender, Eventos, Mensagens, Perfil e "Mais" (Propostas, Tarefas, Equipe);
  - rótulos de 12 px ou mais, sem reticências (`styles.css:344-347`);
  - cartão "Como virar membro" no Início do visitante;
  - aviso "as mensagens ficam neste aparelho" antes da primeira conversa;
  - cadastro sem o seletor de SMS, com "mostrar senha"; o telefone fica opcional se o dono quiser.
- Aceite: capturas aprovadas; `node scripts/e2e/run.js visual-qa navegacao onboarding home` verde; baseline regravada só depois da aprovação.
- Riscos: geometria do `visual-qa` (O41). Quem decide: o dono (portão visual).

**I9. Direitos do titular em autosserviço (depois de I5)**
- Sonnet. Esforço: M.
- Passos:
  - `apiDeleteMyAccount`, com senha e MFA quando estiver ativo: anonimiza votos e auditoria, apaga o avatar no R2, cascata;
  - `apiExportMyData` em JSON;
  - botões no Perfil;
  - migração só se precisar (próximo número livre).
- Aceite: testes do Worker (a exclusão apaga o perfil e as sessões; os votos ficam sem vínculo); e2e do Perfil; `npm run validate:sql` verde.
- Riscos: apagar o que a lei manda guardar (o prazo vem do I5). Quem decide: dono e jurídico.

**I10. Revisão humana do conteúdo de saúde (C5)**
- Opus prepara os checklists. Esforço: G (depende de pessoas).
- Passos:
  1. O dono nomeia o revisor com registro profissional.
  2. Fila: Outubro Rosa, depois as questões de toxicologia e do quiz, depois o Atlas (0 de 215).
  3. Registro assinado (nome, data, escopo) em `docs/`.
  4. Lia: números oficiais de emergência (Disque-Intoxicação e SAMU), conferidos na fonte oficial, em `docsConteudo.js:117-118`, e reindexar.
- Aceite: tabela de revisão assinada; `cd worker && npm test -- -i docsConteudo ragEval` verde.
- Riscos: falta de revisor; nada vira "revisado" sem assinatura. Quem decide: o dono.

**I11. Processo seletivo pronto para abrir (depois de I5)**
- Haiku. Esforço: P.
- Passos:
  - o dono atualiza o Forms (8 áreas, endereço novo, maioridade);
  - preencher `liga-ciclo.json` com vagas e datas reais;
  - documentar quem promove o aprovado a "membro" e em quanto tempo;
  - só então ligar `selection_open`.
- Depois, a inscrição nativa (027) com flag e parecer.
- Aceite: `liga-ciclo.json` sem "a divulgar"; `node scripts/e2e/run.js liga` verde.
- Riscos: abrir sem datas (ver a captura do processo). Quem decide: dono e diretoria.

**I12. Documentação e dívida estrutural**
- Haiku nos documentos, Sonnet na extração. Esforço: M.
- Passos:
  1. `CONTINUIDADE.md` vira a única fonte de estado (corrigir a fila).
  2. Atualizar O1, S7 e os novos C1 e C2 em `riscos-residuais.md`, as flags em `FEATURE_FLAGS.md` e a numeração em `TIME_CONTRATO.md`.
  3. Arquivar `ANDAMENTO.md`.
  4. Extrair a Administração de `app.js`; dividir `liga.css`.
  5. O dono roda uma vez o roteiro de `docs/QA_LEITORES_DE_TELA.md`.
- Aceite: `app.js` com menos de 2.000 linhas; `node scripts/e2e/run.js visual-qa smoke csp` verde; nenhuma contradição entre CONTINUIDADE, FEATURE_FLAGS e TIME_CONTRATO.
- Riscos: conflito em arquivo quente (um dono por onda). Quem decide: Opus.

### 8.3 Primeiros 7 dias
| Dia | Claude (Opus, Sonnet, Haiku) | Dono |
|---|---|---|
| 1 | I1 completo; I12, passo 1 (corrigir a fila de `CONTINUIDADE.md`) | revisar e mesclar a PR do I1 |
| 2 | I2, código e testes | autenticar o domínio no Brevo (I2, passo 5) |
| 3 | I3, passos 0 a 3, com a sessão principal | clicar em Reindexar; OK para a 026 |
| 4 | I4 | desligar o GitHub Pages; DNS da mídia |
| 5 | I6, até as capturas | portão visual do painel de flags |
| 6 | I5 (minuta do pacote); I3, passo 4 (`rag_cache_enabled`) | enviar o pacote ao advogado; OK da flag |
| 7 | I7, passos 2 a 5; atualizar `CONTINUIDADE.md` | treino de restauração (I7, passo 1) |

### 8.4 Como retomar (cole no chat novo)
> Leia `docs/avaliacao/AVALIACAO_2026-10-09.md` (§8) e `docs/CONTINUIDADE.md`; siga "Primeiros 7 dias" a partir da primeira iniciativa não concluída.
> Opus 5.5 orquestra e revisa, Sonnet produz o código de risco, Haiku faz o mecânico; você dispara, integra, roda as suítes e abre a PR; eu só reviso e mesclo.
> Sem segredos no chat, saúde só com fonte, nada inventado, flag só com meu OK e portão visual antes de PR de interface.
