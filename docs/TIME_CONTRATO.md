# Contrato do time de agentes (v5 UX)

Todo agente lê este arquivo antes de editar. Plano completo: `C:\Users\Administrador\.claude\plans\c-users-administrador-desktop-auditoria-lucky-planet.md`.

## Regras de ouro
1. **Tarefa pequena**: no máximo 3 arquivos. Se precisar de mais, pare e reporte.
2. **Só mexa nos arquivos que a tarefa permite.** Arquivos quentes (`app.js`, `ux.css`, `styles.css`, `handlers.js`, `constants.js`, `scripts/build.js`, `sw.js`) têm um único dono por onda; sem dono, reporte a mudança necessária em vez de editar.
3. **Sem `git commit`, `git push` ou PR.** Quem integra é o orquestrador.
4. **Critério de aceite = comando de teste** informado na tarefa. Rode e cole o resultado resumido.
5. **Relatório final ≤ 15 linhas**: arquivos alterados, comando e resultado, pendências. O relatório é a entrega.

## Restrições inegociáveis do repositório
- **CSP**: sem `unsafe-inline` em script, sem handler inline (`onclick=`), sem `innerHTML` fora de `frontend/modulos/shared/safe-dom.js` (exceção de desenvolvimento: `frontend/modulos/anatomia-3d/dev/*-demo.js`). Use `data-action` + `LaiftDom.delegateActions` e `LaiftDom.h`. Fontes só do sistema; nenhum script ou CDN de terceiros (exceção registrada: o Chart.js do painel de administração, O31 em `docs/riscos-residuais.md`).
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

## Ambiente
- O hook **GateGuard** nega a primeira edição/criação/Bash de cada arquivo e pede fatos (quem chama o arquivo, que não há duplicata, estrutura dos dados, instrução do usuário citada). Apresente os fatos em texto e **repita a mesma chamada**.
- Windows: use caminhos absolutos; evite CRLF novo (o repo usa LF).
- Visual: use o navegador embutido (`preview_start`) para screenshots em claro/escuro, 375px e desktop.
