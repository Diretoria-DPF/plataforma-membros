# Contrato do time de agentes (v5 UX)

Todo agente lê este arquivo antes de editar. Plano completo: `C:\Users\Administrador\.claude\plans\c-users-administrador-desktop-auditoria-lucky-planet.md`.

## Regras de ouro
1. **Tarefa pequena**: no máximo 3 arquivos. Se precisar de mais, pare e reporte.
2. **Só mexa nos arquivos que a tarefa permite.** Arquivos quentes (`app.js`, `ux.css`, `styles.css`, `handlers.js`, `constants.js`, `scripts/build.js`, `sw.js`) têm um único dono por onda; sem dono, reporte a mudança necessária em vez de editar.
3. **Sem `git push` e sem PR.** Ao terminar, faça **um commit local** na branch do seu worktree (`git add` só dos seus arquivos; mensagem `tipo: descrição`). Quem integra (merge) é o orquestrador.
4. **Critério de aceite = comando de teste** informado na tarefa. Rode e cole o resultado resumido.
5. **Relatório final ≤ 15 linhas**: arquivos alterados, comando e resultado, pendências. O relatório é a entrega.

## Restrições inegociáveis do repositório
- **CSP**: sem `unsafe-inline` em script, sem handler inline (`onclick=`), sem `innerHTML` fora de `frontend/modulos/shared/safe-dom.js` (exceção de desenvolvimento: `frontend/modulos/anatomia-3d/dev/*-demo.js`). Use `data-action` + `LaiftDom.delegateActions` e `LaiftDom.h`. Fontes só do sistema; nenhum script ou CDN de terceiros (exceção registrada: as bibliotecas das páginas de módulo que ainda vêm do jsDelivr, O31b em `docs/riscos-residuais.md`; o painel de administração já não tem exceção, O31 mitigado em 2026-10-08).
- **Arquivo novo no frontend** entra em `frontend/scripts/build.js`, no `PRECACHE` de `frontend/sw.js` e, se preciso, na CSP. O e2e `csp` barra o deploy.
- **A11y**: alvos de toque ≥ 44px, contraste ≥ 4,5:1 nos dois temas (inclusive sobre vidro), foco visível, nada comunicado só por cor, `prefers-reduced-motion` respeitado (valor final direto).
- **Movimento**: só `transform` e `opacity`; duração e curva só via `--dur-*` e `--ease-*` de `modulos/shared/laift-tokens.css`.
- **Sem bordas de card** sob `:root[data-flag-ux-v2-enabled]`: separar por tom (`--layer-0..3`), raio 24–32px, sombra de luz e hairline.
- **Atlas 3D congelado** (`docs/ATLAS_UX_SPEC.md`): não mexer em `#organ-hud`, `#organ-name`, `#bio-search-input`; sem `backdrop-filter` sobre o canvas.
- **LGPD / IA**: nenhum dado pessoal vai para a IA; a Lia **nunca altera dados**; texto de IA nunca vira botão (só a lista branca de `ACTION_KEYS`).
- **Worker**: toda action nova entra no `API_REGISTRY` (`worker/src/handlers.js`) com `runWithSession`, validação de entrada, cota e testes; segredo nunca no código nem no chat. Migração nova = `sql/NNN_*.sql` + `sql/down/NNN_*.sql` e `npm run validate:sql` verde. Próxima numeração livre: 025.
- **Imutabilidade, funções < 50 linhas, arquivos < 800 linhas.**

## Comandos de verificação
```bash
cd worker && npm test && npm run validate:sql
cd frontend && node --test scripts/*.test.mjs        # 2 falhas conhecidas só no Windows: testes de _headers (CRLF)
cd frontend && npm run e2e                           # ou: node scripts/build.js && node scripts/e2e/run.js csp smoke home assistant
```

## Rodada 2 (fechamento pós-fusão, 2026-10-08)
Plano: `C:\Users\Administrador\.claude\plans\c-users-administrador-desktop-auditoria-lucky-planet.md`. Time fixo de 7 agentes (5 Haiku + 2 Sonnet, no máximo 2 Sonnet ao mesmo tempo).

| Agente | Modelo | Dono dos arquivos quentes |
|---|---|---|
| S1 `laift-backend-seguranca` | Sonnet | `worker/src/handlers.js`, `worker/src/constants.js`, `sql/` |
| S2 `laift-frontend-lia` | Sonnet | `frontend/app.js`, `frontend/modulos/shared/lia/lia*.js`, `frontend/assistant*.js` |
| H1 `laift-design-system` | Haiku | `frontend/ux.css`, `frontend/styles.css`, `frontend/modulos/shared/laift-tokens.css` |
| H2 `laift-arte-lia` | Haiku | `frontend/modulos/shared/lia/*.svg`, `preview*`, `lab*` |
| H3 `laift-qa-a11y` | Haiku | `frontend/scripts/e2e/*` |
| H4 `laift-docs-release` | Haiku | `docs/*` |
| H5 `laift-front-integrador` | Haiku | `frontend/index.html` (só as linhas da sua tarefa) |

- **Passo 0 de todo agente:** o worktree parte de um commit antigo. Rode `git merge feat/v5-fechamento` (branch local, já visível no worktree) antes de qualquer edição.
- **Arquivos novos do frontend** (`build.js`, `sw.js` PRECACHE): o orquestrador registra. Informe no relatório o caminho do arquivo e como ele é carregado (`<script defer>` ou `<link>`).
- **Esta PR não cria migração.** A 025 está reservada para a F4 (`feat/v5-f4-acervo`). *(Superado na Rodada 3: a 025 é da inscrição nativa; a F4 passa para a 026.)*
- **Lia ondas 2–4:** nenhum código antes de o dono aprovar o preview da arte.
- **Memória (3,9 GB):** testes do worker só das suítes afetadas, com `-i`; no máximo **um** e2e (Playwright) por agente e só o cenário que você precisa. A suíte completa é do orquestrador, em série, no fim.
- **Hot file de outro dono:** não edite. Entregue o trecho exato (arquivo, linha, antes/depois) no relatório.

## Rodada 3 (operação, Liga e inscrição, 2026-10-08)
Plano: `C:\Users\Administrador\.claude\plans\c-users-administrador-desktop-auditoria-lucky-planet.md` (v3). Um **orquestrador Opus 5.5** elabora as fichas de tarefa e revisa os relatórios; os executores são **Haiku 5.5**, no máximo **3 ao mesmo tempo**. Subagente não cria subagente: a **sessão principal dispara os Haiku**, integra as branches e fala com o dono. Esta seção vale no lugar da Rodada 2 (sem Sonnet).

| Agente | Modelo | Dono dos arquivos quentes |
|---|---|---|
| O `laift-orquestrador` | Opus | nenhum (não edita código) |
| H1 `laift-design-system` | Haiku | `frontend/ux.css`, `frontend/styles.css`, `frontend/modulos/shared/laift-tokens.css`, `frontend/liga.css` |
| H2 `laift-identidade-liga` | Haiku | `docs/liga/IDENTIDADE_VISUAL.md`, `docs/liga/KIT_INSTAGRAM.md`, `docs/liga/REFERENCIAS_LIGAS.md`, `docs/liga/previa/*` |
| H3 `laift-qa-a11y` | Haiku | `frontend/scripts/e2e/*`, `docs/LIGHTHOUSE_*`, `docs/QA_LEITORES_DE_TELA.md`, `docs/qa/*` |
| H4 `laift-docs-release` | Haiku | `docs/*` (exceto os de H2 e H3), `docs/adr/*` |
| H5 `laift-front-integrador` | Haiku | `frontend/index.html`, `frontend/app.js`, `frontend/liga.html`, `frontend/liga.js`, `frontend/inscricao.js` |
| H6 `laift-backend` | Haiku | `worker/src/handlers.js`, `worker/src/constants.js`, `worker/src/assistant/*`, `sql/` |
| Sessão principal | Sonnet | `frontend/scripts/build.js`, `frontend/sw.js` (PRECACHE), CSP, merges e suítes completas |

- **Passo 0 de todo agente:** `git rev-parse --show-toplevel` precisa apontar para um worktree em `.claude/worktrees/`; se for o checkout principal, pare e reporte. Depois `git merge --no-edit <BASE>`, com a branch-base nomeada na ficha (`docs/ops-rotina-2026-10`, `feat/liga-identidade`, ...). Conflito: `git merge --abort` e reporte.
- **Migrações:** a **025 é da inscrição nativa**. A F4 `shared_assets` (rascunho local em `feat/v5-f4-acervo`) passa a **026** quando for retomada. Flag nova **não** pede migração: entra na constante `PUBLIC_FLAGS` (`worker/src/services/featureFlagService.js:119`) se for pública, a linha só nasce quando o admin liga (`apiAdminSetFeatureFlag` faz upsert) e flag ausente = desligada.
- **Fatos da Liga** (vagas, datas, pesos, nome oficial): nunca inventar; escreva "a definir pela diretoria".
- **Menores:** nenhum dado de menor entra em produção antes do parecer jurídico; a flag `minors_enabled` nasce desligada.
- **Neon (free, 100 CU-h/mês):** página pública não consulta o banco a cada visita; o ciclo de seleção abre e fecha pela flag pública `selection_open`, que o app já carrega.
- **Segredos:** nunca em arquivo, commit ou relatório; só nomes. Quem digita valores é o dono, no terminal.
- **Saída:** um commit local por ficha, sem trailer de atribuição, relatório ≤ 15 linhas.

## Ambiente
- O hook **GateGuard** nega a primeira edição/criação/Bash de cada arquivo e pede fatos (quem chama o arquivo, que não há duplicata, estrutura dos dados, instrução do usuário citada). Apresente os fatos em texto e **repita a mesma chamada**.
- Windows: use caminhos absolutos; evite CRLF novo (o repo usa LF).
- Visual: use o navegador embutido (`preview_start`) para screenshots em claro/escuro, 375px e desktop.
