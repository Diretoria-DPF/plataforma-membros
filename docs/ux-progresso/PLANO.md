# Plano — progresso de leitura e usabilidade (ux-progresso, v2, 2026-10-10)

Pedido do dono (2026-10-09): opções e botões fáceis de alcançar, menos escolhas, fluxo direto, hierarquia clara, grupos; barra de
progresso nas páginas de leitura e módulos (25, 50, 75, 100%; "só conta depois de ler": abre em 0%), frases nos marcos, ícone de meta no
50% e no 75%, estrela e aviso no 100%, estrela registrada no lugar da barra; gradiente de meta; primeira tela organizada (login e cadastro).
Documentos: `CONTRATO.md` (decisões, textos e tokens exatos), `AUDITORIA.md` (achados medidos), `fichas/ORDEM.md` (regras e ondas).

## 1. Decisões já tomadas pelo dono (não reabrir)
1. Progresso e estrelas **neste aparelho** (`localStorage`, só conveniência, `try/catch`) numa camada única `LaiftProgress` com
   interface estável; conta depois, por adaptador, sem mexer nas telas. Nada de Worker nem migração agora.
2. Barra **primeiro nos posts do blog**; módulos (iframes) no lote seguinte, com o padrão pronto (CONTRATO §7).
3. Auditoria na ordem entrada, cadastro, app logado, módulos.
4. Opus orquestra; até 6 Haiku; fichas finas e disjuntas, em ondas; dúvida de produto vai ao dono (§6).
5. (2026-10-10) Barra abre em 0%; nota de privacidade sem mudar a versão; estrela no feed/aviso só no próximo lote (sem ficha);
   login só com o nome da Liga; telefone opcional só no Lote W (no Lote B segue obrigatório); barra do app decidida após protótipos.

## 2. Lotes e ondas
| Lote | O quê | Fichas | Arquivos quentes | Estado |
|---|---|---|---|---|
| **A** | Barra de progresso nos posts do blog (`LaiftProgress`, ícones, gerador, `post.js`, cache offline, Política) | H1–H5 | **nenhum** | fichado e ensaiado (67/0) |
| **B** | Entrada e cadastro: Entrar > Criar conta > links; "Mostrar senha"; foco no título; cadastro em grupos; sem SMS; campos 16 px | H6 + sessão principal | `index.html`, `scripts/build.js`, `sw.js` via `aplicar-quentes.js` | fichado e ensaiado (47/0) |
| C | App logado (descrito, sem ficha) | — | sim | ver §2.1 |
| D | Módulos (descrito, sem ficha) | — | não | ver §2.2 |
| W | Telefone opcional no cadastro (banco, Worker, depois front) | W1 (1 Sonnet) | front só depois do Worker no ar | fichado; **não disparar** sem o dono (§2.4) |
Ondas exatas: `fichas/ORDEM.md` (A1 → A2 → B0 → B1 → B2 → build/testes/e2e → revisão Opus → portão visual do dono → PR).
A e B têm arquivos disjuntos: podem correr juntos (no máximo 6 Haiku: H1–H5 + H6 depois do B0).

### 2.1 Lote C — app logado (achados A1–A6)
- C1 barra inferior: **decidir após protótipos** (folha "Mais" x menu hambúrguer; a sessão principal monta os dois). Para qualquer um:
  no máximo 5 alvos visíveis, rótulo ≥ 12 px, alvo ≥ 44 px (meta 64 px de largura a 375), grupos com título. Quentes: `index.html`,
  `styles.css`, `app.js`; a geometria do `visual-qa` muda (pedir OK do dono).
- C2 Início: "Agora" no topo; gráficos num grupo "Seu desempenho"; um só aviso de falha com um "Tentar de novo" (`home.js`, `home-editorial.css`).
- C3 campos de 16 px no app inteiro (`styles.css`, quente). C4 cartões do Aprender com estrelas/avanço (depende do D; função pura nova
  `contarConcluidos()` na camada). C5 tirar os 42 `style=""` do `index.html` e então a `'unsafe-inline'` de `style-src`.

### 2.2 Lote D — módulos (achados M1–M3)
- D1 páginas de leitura dos módulos com `montarLeitura` (`modulo:<id>`), mesmo CSS e sprite (CONTRATO §7).
- D2 módulos por questões com `montarEtapas({ alvo, id, total })` (contrato e teste a escrever; mesmas frases e marcos).
- D3 Laboratório: textos do HUD e botões ≥ 12 px (`modulos/laboratorio/`).

### 2.4 Lote W — telefone opcional (`fichas/W1.md`, 1 Sonnet)
Branch de backup no Neon antes; migração com volta (`sql/028_telefone_opcional.sql` + `sql/down/028_…`); Worker (`authService.js`,
`profileService.js`) com testes; front (campo em "Completar perfil (opcional)" e no Perfil) **só depois do Worker no ar**. Lote B não muda.

## 3. Riscos
| id | Risco | Mitigação |
|---|---|---|
| R1 | H1 é a ficha mais densa (regra de contagem + DOM) para um Haiku | teste pronto (TDD, 14 casos) + verificador A2; 2 falhas seguidas → avisar o orquestrador; Sonnet só com OK do dono |
| R2 | Agentes ativos nesta sessão (`s2a-css`, `s2b-gerador`, `s2c-paginas`, `s1c-e2e`, `docs-vivos`) podem estar mexendo em `blog.css`, `scripts/build-blog.js`, `index.html` ou e2e | **só disparar A1/B0 depois que eles entregarem**; `aplicar-quentes.js --conferir` e os "texto antigo aparece 1 vez" das fichas acusam mudança |
| R3 | A faixa presa no topo depende de nenhum ancestral com `overflow` | hoje nenhum (medido); o verificador confere "barra presa no topo" a 375 (0 px) e 1280 (64 px) |
| R4 | Recarregar no meio do artigo não conta até voltar ao trecho já lido (guarda contra salto) | de propósito; os marcos gravados ficam e a barra reabre no último marco |
| R5 | `localStorage` bloqueado ou limpo | barra funciona sem gravar (verificado, sem erro); só a estrela não fica |
| R6 | A nota da Política pode exigir nova versão e novo aceite | pergunta 2 (§6); H5 não mexe em versão |
| R7 | Lote B muda a marcação usada por e2e (`entrada`, `navegacao`, `mfa`, `qa-full`, `campanha`) | ids e `data-nav` mantidos; e2e na onda 3 antes da PR |
| R8 | CRLF no Windows | `aplicar-quentes.js` preserva o fim de linha; fichas usam Edit |

## 4. Revisão (Opus, onda 4) e definição de pronto
- [ ] `a-progresso.js` **67 ok, 0 falha**; `b-entrada.js` **47 ok, 0 falha** (rodados pela sessão principal, da RAIZ).
- [ ] `node --test scripts/*.test.mjs`: só as 2 falhas antigas de `_headers` (hoje 1022 testes); testes novos: `laift-progress` 14, `build-blog` +1, `entrada` +4.
- [ ] e2e `blog entrada navegacao csp smoke qa-full mfa campanha liga`: 0 ✘ sobre o build novo.
- [ ] `node tools/license/apply-headers.mjs --check` verde (cabeçalho nos 3 arquivos novos e no teste novo). Hoje ele quebra antes
      de conferir (procura `frontend/hero.js`, apagado no ajustes-2 e ainda não comitado): rodar depois do commit do ajustes-2.
- [ ] Nenhum arquivo quente mudou fora de `aplicar-quentes.js`; `ICONES` do gerador igual; `laift-tokens.css` igual.
- [ ] Capturas em `docs/ux-progresso/capturas/` aprovadas pelo dono (progresso 375 claro e 1280 escuro: início, 50, 100; entrada e cadastro).
- [ ] Docs de estado (sessão principal): `docs/CONTINUIDADE.md` (§2 e fila), `docs/riscos-residuais.md` (R4, R5).

## 5. O que a sessão principal faz nos arquivos quentes
- **Lote A:** nada. A camada mora em `modulos/shared/` (o `build.js` já copia a pasta inteira) e entra nos posts pelo gerador; o `sw.js`
  do app não muda (o app ainda não usa a camada; o `blog-sw.js` é da ficha H3).
- **Lote B (onda B0):** da RAIZ, `node docs/ux-progresso/aplicar-quentes.js --conferir` (esperado: index.html 11, scripts/build.js 1,
  sw.js 1 trocas conferidas) e, verde, `node docs/ux-progresso/aplicar-quentes.js`. Muda: cartão de login (texto curto, linha "Mostrar senha" +
  "Esqueci minha senha", bloco "Primeira vez aqui?" + botão secundário "Criar conta"), cadastro (grupos, opcional recolhido, `reg-validation`
  oculto com `email`, botão "Criar conta"), `<script src="entrada.js" defer>` depois do `app.js`, `'entrada.js'` no `build.js` e no
  `PRECACHE` do `sw.js` (sem subir a versão do cache: rede primeiro). `app.js` e `styles.css` **não mudam**. Conteúdo exato: CONTRATO §6.
- Sem flag nova: o blog é estático e público; a entrada segue o mesmo caminho do ajustes-2 (sem flag).

## 6. Respostas do dono (2026-10-10) e pergunta nova
Respondidas: 1 não (abre em 0%: "só conta depois de ler"); 2 sim (sem mudar a versão); 3 próximo lote, sem ficha; 4 opcional só no
Lote W; 5 protótipos antes de decidir; 6 sim (só o nome da Liga).
Nova (fechada): 7. Texto da barra vazia, antes do 25: "0% Boa leitura"? Sim / Outro (diga qual).
