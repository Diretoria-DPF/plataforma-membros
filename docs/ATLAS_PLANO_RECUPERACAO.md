# Plano de recuperação — Módulo de Anatomia (Atlas v2)

## Contexto (diagnóstico confirmado em 29/09)
- O PR #4 (merge `8b0a9a8`) passou em todos os testes: atlas, responsivo em 13 telas, smoke, csp e fase4.
- **Depois do merge, 9 commits foram feitos direto na `main`** (`96d6f6a` … `f9291e0`, "Refactor…/Update…"). Eles reescreveram 8 arquivos e **renomearam as funções exportadas**:
  - `createRenderer` → `EngineRenderer`;
  - `LAYERS`/`SYSTEMS`/`MODES` → `CanonicalSystems`…;
  - `createSearchBox` → `UISearchBox` etc.
- **Efeito:** os outros arquivos continuam importando os nomes antigos, e o `main.js` importa nomes que não existem (`AppBus`, `EngineCameraRig`, `UIFocusNav`).
  - O navegador para no primeiro import: `The requested module '../core/bus.js' does not provide an export named 'AppBus'`.
  - **O atlas inteiro não inicia**: sem 3D, sem busca, sem modos, sem layout. Isso vale em todos os aparelhos, e a causa é uma só.
  - O `main.js` perdeu 140 linhas: ligações do quiz, dos modos, da camada de compatibilidade e das fichas PT.
- **Problema real à parte, anterior aos 9 commits:** 0 de 2.427 estruturas têm nome em PT no índice. Só cerca de 215 fichas estão em PT, então a busca e os rótulos aparecem em inglês.
- Não existe teste automático no CI para PRs; por isso a quebra chegou ao ar.

**Decisões do usuário:**
- reverter os 9 commits;
- traduzir os nomes com glossário e o selo "tradução assistida";
- proteger a `main` com PR e teste obrigatório;
- a execução desta semana será por IA de chat no navegador e pelo site do GitHub.

---

## FASE 0 — Colocar o atlas no ar de novo (urgente, cerca de 15 min)

### Opção A — FEITA pelo Claude em 29/09: PR #5 (só falta clicar em Merge)
1. Reiniciar o branch `claude/optimistic-babbage-3pm2em` a partir da `main`.
2. `git revert --no-edit 8b0a9a8..origin/main`: desfaz os 9 commits sem apagar histórico.
3. Adicionar o workflow de teste da Fase 1: `.github/workflows/atlas-e2e.yml`.
4. Gerar os lotes de nomes da Fase 3 em `docs/atlas-traducao/lote-01.txt` … `lote-10.txt`.
5. Rodar `atlas`, `smoke` e `csp` localmente, fazer push e abrir o PR.
   - **Você só clica em "Merge"** no GitHub.
   - O Pages publica em cerca de 3 min.

### Opção B (manual, só pelo site do GitHub), se a A não for possível
Para **cada um dos 8 arquivos** abaixo, todos em `frontend/modulos/anatomia-3d/js/`:
`core/contracts.js`, `engine/renderer.js`, `engine/selection.js`, `main.js`, `ui/infocard.js`, `ui/layers-panel.js`, `ui/search-box.js`, `ui/search-index.js`.

1. Abrir a versão boa: `https://github.com/Diretoria-DPF/plataforma-membros/blob/8b0a9a8/frontend/modulos/anatomia-3d/js/<ARQUIVO>`, clicar em **Raw** e copiar tudo (Ctrl+A, Ctrl+C).
2. Abrir o mesmo arquivo na `main`, clicar no lápis (Edit), dar Ctrl+A e colar.
3. Em "Commit changes":
   - no **primeiro** arquivo, escolher **"Create a new branch… and start a pull request"**, com o nome `fix/reverte-atlas`;
   - nos outros 7, abrir o arquivo **nesse branch** (seletor de branch no topo) e commitar nele.
4. Abrir o PR `fix/reverte-atlas` → `main` e clicar em **Merge**.
5. Conferir que o PR mostra exatamente 8 arquivos alterados. Se aparecer um nono, algo foi colado errado.

### Como verificar que voltou
- Abrir a plataforma → Aprender → Anatomia, com Ctrl+Shift+R no computador para limpar o cache.
- No computador, F12 → aba **Console**: não pode haver erro vermelho.
- O corpo 3D aparece em até cerca de 5 s; a busca por "coração" abre a ficha do Coração.

---

## FASE 1 — Proteger a `main` para nunca mais quebrar (cerca de 10 min, você)
1. **Workflow de teste.** Se a Opção A foi usada, ele já existe. Senão, criar pelo site (Add file → Create new file, **em branch + PR**) o arquivo `.github/workflows/atlas-e2e.yml`:
```yaml
name: Testes do Atlas
on:
  pull_request:
  workflow_dispatch: {}
jobs:
  atlas-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    defaults: { run: { working-directory: frontend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci || npm install
      - run: npm install --no-save playwright
      - run: npx playwright install --with-deps chromium
      - run: node scripts/build.js
      - run: node scripts/e2e/run.js atlas atlas-responsive smoke csp
```
2. **Regra de proteção.** No GitHub: Settings → Branches → **Add branch ruleset** (ou "Add rule"). Escopo: `main`. Marcar:
   - **Require a pull request before merging**;
   - **Require status checks to pass**, e escolher `atlas-e2e` (ele só aparece depois de rodar uma vez em algum PR).
3. **Regras de ouro ao usar IA de chat** (copiar no início de toda conversa com a IA):
   > "Não renomeie funções/exports existentes. Não reescreva arquivos inteiros; mostre só o trecho a trocar (antes/depois). Não invente imports de arquivos que não te mostrei. Se precisar de outro arquivo, peça que eu cole."
4. Toda mudança entra por PR. Só fazer merge com o check **atlas-e2e verde**. Se ficar vermelho, **não fazer merge**: copiar o log do erro e guardar para o Claude.

---

## FASE 2 — Teste em todos os aparelhos (você, depois da Fase 0)
Para cada aparelho (Android, iPhone, computador, tablet/TV), preencher a tabela: ✅ ou ❌ + nota.

| # | Passo | Esperado |
|---|---|---|
| 1 | Abrir Anatomia | Corpo 3D visível em ≤ 5 s, sem tela preta |
| 2 | Girar com 1 dedo/mouse; zoom com pinça/roda | Fluido, sem travar |
| 3 | Buscar "coração", "fêmur", "fígado" | Resultado aparece; tocar abre a ficha |
| 4 | Ficha: abas Resumo/Anatomia/Histologia/Clínica/Referências | Todas abrem, com texto em PT |
| 5 | Painel inferior (celular): arrastar entre espiar/metade/cheio | Encaixa, sem cobrir a barra da plataforma |
| 6 | Camadas: ligar e desligar Pele/Músculos/Esqueleto/Vísceras | O corpo muda na hora |
| 7 | Isolar, Raio-X, Corte, Reset | Cada botão tem efeito visível |
| 8 | Modos: Fisiologia, Farmacologia, Moléculas, Quiz, Meu estudo | Cada um abre com o corpo visível |
| 9 | Quiz: responder até o fim e tocar "Refazer" | Reinicia |
| 10 | Girar o celular (paisagem) | Nada cortado nem sobreposto |
| 11 | Créditos | Tela de licenças abre |

**Relato de bug** (um por problema, num arquivo de texto ou numa issue do GitHub):
```
Aparelho/navegador:  ex.: Samsung A54 / Chrome
Passo nº:            ex.: 7 (Raio-X)
Esperado:            ...
Aconteceu:           ...
Print:               (anexar)
Erro do console:     (computador: F12 → Console, copiar a linha vermelha)
```
Dica: no Android, com o celular ligado por cabo ao PC, `chrome://inspect` no Chrome do PC mostra o console do celular.

---

## FASE 3 — Nomes em português (você + IA de chat, ao longo da semana)
**Objetivo:** traduzir os **1.412 nomes únicos** de estruturas (o lado esquerdo/direito é tratado pelo código) para PT-BR, seguindo a Terminologia Anatômica. As traduções levam o selo "Tradução assistida — não revisada" até revisão profissional.

1. **Onde estão os lotes.** Na Opção A, o Claude gera `docs/atlas-traducao/lote-01.txt` … `lote-10.txt` (cerca de 140 nomes cada, um por linha). Sem a Opção A, esta fase espera o Claude na semana que vem.
2. Para cada lote, colar na IA de chat este prompt, seguido do conteúdo do lote:
   > "Você é tradutor de anatomia humana para português do Brasil, seguindo a Terminologia Anatômica (SBA/FIPAT). Traduza cada nome abaixo. Regras: substantivo primeiro ('Posterior tibiofibular ligament' → 'Ligamento tibiofibular posterior'); use termos oficiais em PT-BR ('Músculo', 'Nervo', 'Artéria', 'Veia', 'Linfonodos', 'Giro', 'Sulco', 'Falange'); sem anglicismos; mantenha números e epônimos; não traduza 'left/right' (não aparecem). Responda SOMENTE com linhas no formato `nome em inglês<TAB>nome em português`, na mesma ordem, uma por linha, sem comentários. Se não tiver certeza, termine a linha com ` ??`."
3. Salvar a resposta pelo site do GitHub, **em branch + PR**, como `docs/atlas-traducao/lote-NN.pt.tsv`.
4. **Conferência rápida:** o número de linhas do `.pt.tsv` tem de ser igual ao do lote, e as linhas com `??` são revisadas por você ou pelo profissional de saúde.
5. **Revisão profissional**, em paralelo: a pessoa revisa por amostragem (≥ 10% de cada lote) e as fichas de `data/atlas/legacy/content/*.json`, conforme `docs/ATLAS_CONTENT_POLICY.md` §5.

---

## FASE 4 — Quando o limite do Claude reiniciar (Claude, na semana que vem)
Ordem fixa, cada item com teste antes do push:
1. **Bugs da Fase 2:** corrigir por relato, começando pelo que impede o uso; um PR com o CI verde.
2. **Integrar os nomes PT:**
   - novo `tools/atlas-content/names-pt.mjs`: junta os `.pt.tsv` e grava `namePt` + `namePtStatus: "traducao-assistida"` em `structures.json`/`structures.boot.json`, com os sufixos de lado " (esquerdo/direita)";
   - `js/ui/search-index.js`: indexar `namePt` (sem acento, com tolerância a erro);
   - `navigator.js`, `labels.js`, `infocard.js`: exibir `namePt ?? englishName` e o selo;
   - `lint-pt.mjs` passa a rodar sobre os nomes;
   - teste: "ligamento tibiofibular" acha a estrutura.
3. **Melhorias que estavam nos commits revertidos:** só se você disser em uma linha qual era o objetivo de cada uma (ex.: "busca mais tolerante"). Serão refeitas em branch, sem renomear APIs.
4. **Fechamento:** `npm run e2e` completo; atualizar `docs/ATLAS_V2_CHECKPOINT.md`; PR com o CI verde.

---

## Verificação
- **Fase 0:** console sem erro, corpo visível e busca "coração" ok. Na Opção A, o Claude roda `node scripts/e2e/run.js atlas smoke csp` antes do push.
- **Fase 1:** o check `atlas-e2e` aparece verde no PR, e a `main` recusa merge sem ele.
- **Fase 2:** tabela preenchida para os 4 tipos de aparelho.
- **Fase 3:** 10 arquivos `.pt.tsv`, com o mesmo número de linhas de cada lote.
- **Fase 4:** o CI verde em cada PR e a tabela da Fase 2 refeita toda em ✅.
