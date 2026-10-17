# Continuidade: estado, intenção e próximos passos (2026-10-17)

Arquivo-mestre para retomar o trabalho em **qualquer chat novo**, sem depender de memória de conversa. Atualize a seção 2 e a fila
(seção 4) ao fim de cada sessão.

## 0. Como retomar (copie e cole no chat novo)
> Leia `docs/CONTINUIDADE.md` e continue pela fila da seção 4, na ordem. Opus 5.5 orquestra (escreve contrato e fichas, revisa) e
> Haiku 5.5 executam; você dispara, integra, roda as suítes e comita. Não abra PR visual sem eu aprovar as capturas.

**Auditoria geral em curso (desde 2026-10-14; estado real em 2026-10-17 na seção 2 abaixo):** estado, fila e achados em `docs/AUDITORIA_GERAL_2026-10-14.md`. Leia a seção "Estado" e a "Fila" dele antes de começar qualquer trabalho de segurança, mobile, engajamento ou SEO.

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

## 2. Estado em 2026-10-17
| Item | Estado |
|---|---|
| `main` | `6ee7c74` (PR #79). Deploys do Worker e do site passam; `/health` responde `{"ok":true}`; `laift.com.br`, `/biblioteca` e a API em ~0,3 s. Só as PRs de dependências #58 e #59 estão abertas |
| Biblioteca LAIFT (Córtex) | **No ar e completa no código** (PRs #50–#57, #60–#61, #78, #79). 155 artigos: 137 publicados, 3 aprovados, 15 em triagem. Curadoria em abas (Para revisar, No ar, Pedidos de remoção, Editar artigos); só o admin remove ou muda o estado; curador e mentor pedem remoção. Os 56 DOIs de inglês do lote 1 **não serão importados** (decisão do dono). Detalhe: `docs/cortex/CONTINUIDADE-BIBLIOTECA.md` |
| Lia | v2 com busca no acervo (RAG), guia da plataforma e guia da Biblioteca. Flags ligadas: `chatbot`, `rag`, `rag_cache`, `lia_hibrida`, `lia_library`, `lia_visitor_ai`. Depois de cada mudança no guia o admin toca em **Reindexar base da Lia** |
| Cargos funcionais | **Feitos** (#73, #77; ADR 0010): gestor, revisor de conteúdo, moderador, curador e mentor, acumuláveis, com MFA nos privilegiados |
| Auditoria geral (`docs/AUDITORIA_GERAL_2026-10-14.md`) | Fase 0 quase fechada; Fase 1 em andamento. Corrigidos: SEC-01 (#72), SEC-09 (#71), SEC-02 (#76), SEC-03/04/07 (#74), OPS-01 (#70), DAT-01 (#75), ROL-01/02/03 (#73, #77) |
| Banco (Neon `jolly-snow-39561777`, banco `plataforma_membros`) | Migrações até `040` aplicadas (`039` não existe). A senha do papel dono foi rotacionada em 2026-10-17 |
| Flags em produção | Ligadas: `ux_v2_enabled`, `chatbot`, `rag`, `rag_cache`, `feedback`, `moderation`, `library_enabled`, `library_ai_summary`, `library_member_suggest`, `lia_*` acima. **Desligadas:** `research_enabled`, `rag_rerank`, `mfa_required`, `nvidia_fallback`, `clinical_sim_enabled` |
| Backup | Diário, verde (09:35 de 17/10). **Restauração completa ainda não treinada** (OPS-03) |
| E-mail | Remetente ainda é Gmail (OPS-04 pendente) |
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
1. **Auditoria, Fase 1** (ver Fila e Log em `docs/AUDITORIA_GERAL_2026-10-14.md`): SEC-06 (HSTS escalonado e cabeçalhos da API) e SEO-01 em PR própria; MOB-01 (botão Voltar do Android); SEC-08 (token de sessão em cookie HttpOnly, sob flag; ADR 0011); depois SEC-05 (cota de IA para membros), OPS-06, OPS-08.
2. **Verificação dos módulos** (pedido do dono, depois do item 1): percorrer Aprender (farmaco, toxico, clínica, lab, anatomia/Atlas), Eventos, Propostas, Tarefas, Mensagens, Equipe, Perfil, crachá, Biblioteca e Lia, em celular e desktop, corrigindo o que falhar.
3. **Dono** (roteiro passo a passo enviado no chat de 2026-10-17): monitor externo no `/health` (OPS-01); planilha de consumo e horas do Neon (OPS-02/09); treino de restauração (OPS-03); remetente de e-mail no domínio e plano do Brevo (OPS-04); segundo admin de emergência; **Reindexar base da Lia**; revisar os 18 artigos que faltam publicar; Android real; Google Forms (6 áreas antigas e "Campus Pituba").
4. **Biblioteca**: nomear a Diretoria Científica no texto público; critério de inclusão; importar mais artigos em português quando o dono pedir.
5. **ux-progresso**: Lote A (barra de progresso de leitura nos posts) e Lote W; splash "Bem-vindo".
6. **Jev (TypeSafe AI)**: checklist de `docs/lia/JEV.md` §5, só pesquisa e staging.
7. **Docs e limpeza**: `docs/TIME_CONTRATO.md` (numeração das migrações); worktrees e branches antigas (`git worktree remove`); fechar as PRs #58 e #59.
8. **Jurídico** (go/no-go de abertura ampla e monetização): LGPD-01/02/03, menores, parecer sobre licenças NC, revisão da Política.
9. Backlog maior: `docs/backlog-futuro.md`, `docs/riscos-residuais.md`, inscrição nativa, `selection_open` só com vagas e datas.

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
