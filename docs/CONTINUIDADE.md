# Continuidade: estado, intenção e próximos passos (2026-10-09)

Arquivo-mestre para retomar o trabalho em **qualquer chat novo**, sem depender de memória de conversa. Atualize a seção 2 e a fila
(seção 4) ao fim de cada sessão.

## 0. Como retomar (copie e cole no chat novo)
> Leia `docs/CONTINUIDADE.md` e continue pela fila da seção 4, na ordem. Opus 5.5 orquestra (escreve contrato e fichas, revisa) e
> Haiku 5.5 executam; você dispara, integra, roda as suítes e comita. Não abra PR visual sem eu aprovar as capturas.

## 1. Como o dono quer que se trabalhe (regras fixas)
- **Equipe:** 1 orquestrador **Opus 5.5** (lê o repositório, escreve `CONTRATO.md` e `fichas/`, revisa) + vários **Haiku 5.5** (uma ficha
  cada, ≤ 3 arquivos, aceite = comando, relatório ≤ 12 linhas), em ondas por segmento (pico ≤ 8 ao mesmo tempo). A sessão principal
  dispara, integra os arquivos quentes (`index.html`, `app.js`, `scripts/build.js`, `sw.js`), roda build/e2e, comita e abre a PR.
- **O dono só revisa e mescla.** Nada de auto-merge. PR sem linhas de atribuição nos commits.
- **Portão visual:** capturas (375 e 1280 px, claro e escuro) aprovadas pelo dono **antes** de abrir PR de interface.
- **Sem invenção:** vagas, datas, notas, pesos e nomes de pessoa ficam "a divulgar". Texto de saúde só com fonte aberta verificada.
  Detalhe de segurança (ex.: validade do QR de presença) não vai em texto público.
- **Interface:** tudo como concluído (nada de "em revisão", "planejado", "proposta", "pendente").
- **Banco:** a base é pequena e há backup, então o dono não quer confirmar cada passo; mesmo assim, o classificador do assistente
  **bloqueia escrita em flag de produção** e tabela fora do combinado. Quando bloquear, não contorne: peça ao dono o comando (abaixo).
- **Segredos nunca no chat nem em arquivo.** Chaves entram como segredo do Worker (`wrangler secret put`).
- **Economia de tokens:** não ler arquivo grande inteiro; fichas curtas; relatórios curtos.

## 2. Estado em 2026-10-09
| Item | Estado |
|---|---|
| Blog "Conheça a LAIFT", Publicações, Outubro Rosa | **Mesclado** (PR #45); backup validado (PR #44). Site e blog no ar |
| PR #46 `feat/lia-conhecimento` | **Mesclada** na main. Base da Lia 35→72 trechos, registro de pesquisas (`sql/026`, **não aplicada**), reranker, Europe PMC, 3 flags novas desligadas |
| PR #47 Identidade da Liga (`feat/identidade-liga`) | **Mesclada** na main. Pendências do dono em `docs/identidade/PLANO.md` §4 seguem abertas. Estado: `docs/identidade/STATUS.md`. Ver seção 3 |
| Ajustes de entrada e blog (`ajustes-2`) | **Pronto, aguardando o portão visual do dono e a PR** (branch `feat/ajustes-login-blog`, worktree `.claude/worktrees/ajustes-2`). Verificadores 112+135+34 ok; e2e entrada, liga, blog, campanha, csp, navegacao, smoke, home, assistant e onboarding: 0 falhas |
| **ux-progresso (2026-10-10, EM ANDAMENTO, no mesmo worktree `ajustes-2`)** | Docs do Opus em `docs/ux-progresso/` (PLANO, AUDITORIA, CONTRATO, `fichas/` H1–H6 e W1, verificadores, `aplicar-quentes.js`). **Lote B (entrada e cadastro) FEITO e verificado** (`b-entrada.js` 47 ok; e2e `entrada navegacao csp smoke mfa campanha liga qa-full onboarding assistant` sem falha real): `index.html`, `scripts/build.js`, `sw.js` por `aplicar-quentes.js`; `entrada.js`, `ux.css` e `entrada.test.mjs` pelo H6. **Falta o Lote A** (barra de progresso nos posts, H1–H5): **decisão do dono: o marco 25% só conta depois de ler (barra começa em 0%)**; o Opus estava revisando CONTRATO, anexos e fichas para isso (CONTRATO, H1, H4, ORDEM, PLANO, W1 e os anexos de teste e CSS já foram regravados) mas **caiu no limite de sessão antes de re-ensaiar**; refazer: rodar `docs/ux-progresso/verificadores/a-progresso.js` e os testes dos anexos numa cópia e ajustar até 63/0. Nota de privacidade entra **sem** mudar a versão 2026-10-08. Estrela no feed fica para depois. **Telefone opcional = Lote W (W1.md, 1 Sonnet, migração + Worker + front), não entrou no Lote B (telefone segue obrigatório).** **Barra do app (Lote C) FEITA em 2026-10-10 (opção B escolhida pelo dono):** barra com Início, Aprender, Eventos e Perfil (rótulos de 12 px); botão de três tracinhos no cabeçalho com aviso do total de pendências (votação aberta + tarefas + mensagens não lidas + solicitações de conexão); painel lateral (`<dialog id="app-menu">`) com Propostas, Tarefas (grupo Participação) e Mensagens, Equipe (grupo Comunicação), cada item dizendo o que espera ("2 tarefas em aberto"). Código: `app-menu.js`/`app-menu.css` (novos), `index.html`, `app.js` (seletores e ordem do deslizar), `build.js`, `sw.js`; e2e `menu`; baseline do `visual-qa` regravada (só as abas). O selo do papel foi para a linha do "Área do membro". Protótipos e fotos em `docs/ux-progresso/prototipos/` e `capturas/prototipos/`. Laço novo e capas **aprovados pelo dono**; PR única do ajustes-2 + Lote B + Lote C. Falta: Lote A (progresso nos posts) e Lote W (telefone opcional) |
| E2E: falhas que já existiam | 10 ✘ em `apis`, `atlas-farmaco`, `atlas-feedback`, `atlas-ficha-nav`, `atlas-fisiologia` e `atlas-moleculas` (iguais sem as mudanças da identidade; não bloqueiam PR). Investigar numa tarefa à parte |
| Banco (Neon `plataforma-membro`, id `jolly-snow-39561777`, org "Daniel") | Migrações 020–024 e `atlas_telemetry` aplicadas; **026 não aplicada**; backup na branch `backup-pre-020-024-2026-10-09` |
| Flags em produção | `chatbot`, `rag`, `feedback`, `moderation` **ligadas**; `ux_v2_enabled` **LIGADA em 2026-10-09 13:12 UTC** (100%, sem condições, a pedido do dono; para desfazer: `UPDATE feature_flags SET enabled = FALSE WHERE key = 'ux_v2_enabled';`); `rag_cache`, `rag_rerank`, `research` ainda nem existem no banco (nascem com a #46, desligadas) |
| Jev (TypeSafe AI) | Só registrado: `docs/lia/JEV.md` |
| Splash "Bem-vindo" do app | Não feita (`feat/splash-bem-vindo`) |

## 3. Identidade da Liga (o que o dono pediu)
Documentos: `docs/identidade/PLANO.md` (diagnóstico, decisões, riscos, itens para o dono), `CONTRATO.md` (regras técnicas e textos),
`fichas/ORDEM.md` (ondas e regras) e uma ficha por tarefa. Resumo do pedido:
- `/liga` vira a identidade digital: hero com nome, lema "✨ Nada se cria, nada se perde, tudo se transforma 📚", "🧬 conteúdo científico • projetos • capacitações" e botão "Processo seletivo" (abre as instruções; lá "Participar do processo seletivo" abre o formulário).
- Quem somos em cards verticais; Áreas de interesse gerais; Como funciona (compromissos e benefícios); FAQ (Como se inscrever; Quem pode participar?; Quando são as inscrições?; Quantas vagas há?; Como acompanho o resultado?); Edital novo, vinculado, aberto por clique; Contato.
- Instituição: UNINASSAU, Rua dos Maçons, 364, Salvador-Bahia, 41810-205, Brasil; site uninassau.edu.br; prédio grande em SVG; mapa só por clique (OpenStreetMap), "abrir no app de mapas".
- Tela inicial: cartões sem a cabeça da Lia, com botões grandes "Conheça a LAIFT" e "Acessar blog"; aviso "nova publicação" com miniatura e laço rosa discreto, lendo `blog/index.json`.
- Botão **Voltar** no canto superior esquerdo em todo módulo e página. Favicon e ícones nas páginas públicas. Blog instalável (PWA).
- Pendências do dono (PLANO §4): texto do edital, áreas, frase incompleta do botão, benefícios, idade/menores, dados da diretoria, mapa na Política, nome do app do blog.

## 4. Fila (fazer nesta ordem)
1. **Fechar a PR do ajustes-2** (branch `feat/ajustes-login-blog`, worktree `.claude/worktrees/ajustes-2`): pronto e verificado. Falta o dono aprovar as capturas (entrada, blog, Liga e rodapé em 375 e 1280 px) → **abrir a PR** para `main`.
2. **I1** (limite de login, P0): `docs/avaliacao/AVALIACAO_2026-10-09.md` §8.
3. **I3** (Lia v2 em produção, ordem segura): reindexar pelo botão do painel admin (esperado ~72 trechos, todos com embedding) →
   manter `rag_enabled` sem condições → simular e aplicar `sql/026` (inserir em `schema_migrations` com o hash sha256 do arquivo, CRLF normalizado) →
   `rag_cache_enabled` e observar 24 h → `rag_rerank_enabled` só depois de calibrar em staging (`docs/lia/pesquisa/SELECAO.md` §4) →
   `research_enabled` só depois do OK jurídico (Política §5, retenção de 30 e 7 dias) e primeiro só para admin.
4. **Visual do app**: `ux_v2_enabled` já ligada (ver §2); reverter só com `UPDATE feature_flags SET enabled = FALSE WHERE key = 'ux_v2_enabled';`.
5. **Planejamento do Córtex**: `docs/avaliacao/AVALIACAO_2026-10-09.md` §8.
6. **Jev (TypeSafe AI)**: seguir o checklist de `docs/lia/JEV.md` §5. Só pesquisa e staging; nada em produção sem OK.
7. **Splash "Bem-vindo" do app** (`feat/splash-bem-vindo`): texto "Bem-vindo", 1,2 a 2 s, uma vez por sessão, "Pular"/Esc, zero com movimento reduzido, `inert` no contêiner principal. Reaproveita `frontend/splash.js` e `splash.css`.
8. **Docs e limpeza:** atualizar `docs/TIME_CONTRATO.md` (numeração: Lia = 026, F4 = 025, inscrição nativa = 027); reabrir os links do planalto.gov.br nas referências do Outubro Rosa; PR opcional de `.gitattributes` (os avisos de CRLF no Windows).
9. **Dono:** editar o Google Forms (6 áreas antigas e "Campus Pituba" continuam lá); ligar a flag `selection_open` só quando houver vagas e datas.
10. Backlog maior: `docs/backlog-futuro.md`, `docs/riscos-residuais.md`, inscrição nativa (migração 027), contas de menores (parecer jurídico).

## 5. Mapa de documentos
| Assunto | Onde |
|---|---|
| Blog, estilo, wireframe, campanhas | `docs/blog/` (`WIREFRAME.md`, `CAMPANHAS.md`, `fichas/`, `campanhas/outubro-rosa/`) |
| Lia: plano, revisão, fichas, bases, seleção | `docs/lia/` (`PLANO.md`, `REVISAO.md`, `JEV.md`, `pesquisa/BASES.md`, `pesquisa/SELECAO.md`) |
| Identidade da Liga | `docs/identidade/` |
| Liga e edital (fontes) | `docs/liga/` (`IDENTIDADE_VISUAL.md`, `fontes/edital-original-2026.txt`) |
| Ambientes, deploy, flags, backup | `docs/AMBIENTES.md`, `docs/DEPLOYMENT.md`, `docs/FEATURE_FLAGS.md`, `docs/BACKUP_RESTORE.md` |
| Política e termos | `docs/POLITICA_DE_PRIVACIDADE.md`, `docs/TERMOS_DE_USO.md` |
| Contrato do time | `docs/TIME_CONTRATO.md` |

## 6. Armadilhas conhecidas
- **GateGuard** (hook): na primeira criação/edição de um arquivo, pede fatos (quem usa, API afetada, esquema, instrução literal do usuário). Escreva 2 linhas e **repita a mesma chamada**.
- **Classificador do assistente** bloqueia: escrita em `feature_flags` de produção e tabelas fora do combinado. Peça o comando ao dono.
- **Neon MCP:** `list_projects` precisa de `org_id`; `run_sql` aceita 1 comando; `run_sql_transaction` recebe um comando por item. O conector já "invalidou" uma vez: se falhar, o dono reconecta.
- **Migrações:** ledger `schema_migrations(name, hash, applied_at)`, hash sha256 do arquivo com CRLF normalizado. Sempre backup (branch Neon) antes; ligar flag só depois de reindexar.
- **Front:** CSP sem inline (`script-src 'self'; style-src 'self'`); sem `innerHTML`; alvos de 44 px; `prefers-reduced-motion`; cabeçalho de copyright em `.js/.css/.mjs/.sql` (`node tools/license/apply-headers.mjs --check`).
- **`main` local pode estar atrasado:** sempre `git fetch` e ramificar de `origin/main`.
- **Worktrees pesam** (`.claude/worktrees/`); limpar com `git worktree remove` quando a PR for mesclada.
- O checkout principal tinha mudanças da Lia não comitadas em arquivos quentes: trabalhe a identidade num worktree separado e espere conflito pequeno ao mesclar.

## 7. Comandos úteis
```bash
cd frontend && node scripts/build.js && node --test scripts/*.test.mjs
cd frontend && node scripts/e2e/run.js csp assistant entrada blog campanha liga
cd worker && npm test -- -i
node tools/license/apply-headers.mjs --check
gh pr list --state open
```
