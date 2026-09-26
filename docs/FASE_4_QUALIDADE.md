# Fase 4 — Qualidade, Design & Segurança dos módulos (Ondas 1 e 2)

Equipe 4 · branch local `equipe/fase4-qualidade` · base `6608523`.
Contrato: `docs/PLANO_FASES_2_3_4.md`. Este documento registra:

- o que mudou;
- o guia do design system para novos módulos;
- os números antes/depois;
- as bibliotecas pinadas;
- os achados de segurança corrigidos;
- os pedidos de integração;
- a lista da Onda 2.

## 1. O que mudou

| Área | Mudança |
|---|---|
| **Design system** | `modulos/shared/laift-tokens.css` espelha os tokens da plataforma (`frontend/styles.css`) com o prefixo `--laift-*`, nos temas claro e escuro. Todo CSS de módulo passou a mapear as próprias variáveis para esses tokens. A identidade de cada módulo fica só em `--module-accent`. |
| **Tema escuro** | Segue `<html data-theme="light\|dark">`, que a ponte da Equipe 2 vai aplicar. Sem o atributo, vale `prefers-color-scheme`. Quiz, Toxicologia, Clínica, Fiscal e a interface do Crachá funcionam nos dois temas. Laboratório, Estúdio e Anatomia 3D são escuros por natureza (ver §3). |
| **Motor único de quiz** | `modulos/shared/quiz-engine.js` + `quiz-engine.css` atendem Farmacologia (`quiz/`) e Toxicologia (`toxicologia/`). Cada módulo só configura: banco de questões, chave de progresso (`pharmaQuizProgress`/`toxicoQuizProgress`, as mesmas de antes), rótulos, acento e integrações (RxNav/PubChem/ChEBI; OpenFDA). |
| **Ponte (Contrato 4)** | Os dois quizzes enviam `apiLearnSubmitQuizAttempt` pela ponte, e a toxicologia nunca enviava. O quiz 3D da anatomia também envia (`module:'anatomia'`). O laboratório envia `apiLearnRecordLabFormulation`. O backup em nuvem da anatomia (`salvarBackupApi`) saiu. Não sobrou `APPS_SCRIPT_GATEWAY` em arquivo da Equipe 4. |
| **Segurança** | Não há mais `innerHTML`/`document.write` fora de `shared/safe-dom.js`. Não há handlers inline nem `<script>` inline. As bibliotecas externas têm versão fixa e SRI. `postMessage` usa a origem fixa, e os listeners validam `event.origin`. |
| **Mobile/UX** | Nenhuma página da Equipe 4 (nem a Clínica) rola na horizontal em 360 px. Os cabeçalhos do laboratório, do Estúdio e da anatomia foram refeitos para caber. Em telas de toque, os alvos têm 44 px. |
| **Acessibilidade** | Foco visível e `aria-label` nos botões só-ícone. `role`/`aria-live` em avisos, log, chat, cronômetro e resultados. Alternativas do quiz viraram `<button>`. Itens de lista e da tabela periódica são acessíveis por teclado. Esc fecha os modais. `prefers-reduced-motion` é respeitado em todos os módulos (tokens). |
| **Plataforma** | `frontend/styles.css`: texto do botão primário com contraste AA (novo `--on-primary`) e fundo do iframe no tema da plataforma. Alvos de 44 px em botões pequenos do chat e do lightbox. |
| **Testes** | `frontend/scripts/e2e/fase4.e2e.js` (35 verificações): parte estática em Node e parte no navegador a 360 px. |

Não há migração de banco, secret ou var nova. O deploy é o do front-end: merge na `main`, e o GitHub Actions publica.

## 2. Guia do design system para novos módulos

1. **Ordem de carga** (no `<head>`, depois de `../shared/laift-identity.js`):
   ```html
   <link rel="stylesheet" href="../shared/laift-tokens.css">
   <link rel="stylesheet" href="style.css">   <!-- o CSS do módulo -->
   ```
   Uma folha que já é compartilhada pode usar `@import url("laift-tokens.css");` como primeira regra (é o que faz `shared/style.css`).
2. **Tokens disponíveis** (todos `--laift-*`):
   - superfícies e texto: `bg`, `surface`, `surface-alt`, `border`, `border-strong`, `text`, `muted`;
   - marca: `primary`, `primary-strong`, `primary-soft`, `on-primary`;
   - estados: `danger`, `danger-soft`, `on-danger`, `success`, `success-soft`, `warning`, `warning-soft`, `info`, `info-soft`, `overlay`;
   - forma: `shadow`, `shadow-sm`, `radius-sm`, `radius-md`, `radius-lg`, `radius-pill`;
   - espaçamento e toque: `space-1` a `space-6` (4 a 32 px), `touch` (44 px);
   - fontes: `font` (a mesma pilha do sistema da plataforma), `font-mono`;
   - foco: `focus-color`.

   Não use cor fixa para superfície ou texto. Cor fixa só para **dado** (ex.: vermelho de alerta num gráfico).
3. **Identidade do módulo = acento.** Defina só o par claro/escuro:
   ```css
   :root {
     --module-accent-light: #283593;   /* ≥ 4,5:1 contra --laift-surface claro */
     --module-accent-dark:  #9fa8ff;   /* ≥ 4,5:1 contra --laift-surface escuro */
     --module-on-accent-dark: #0b1030; /* texto sobre o acento no escuro (no claro: branco) */
   }
   ```
   E use `var(--module-accent)`, `var(--module-on-accent)` e `var(--module-accent-soft)`. O token escolhe o par certo conforme o tema. O acento também é resolvido no `<body>`, então dá para trocá-lo por classe (ex.: `body.theme-clinic`).
4. **Tema.** Não escreva `@media (prefers-color-scheme)` no módulo: os tokens já tratam `html[data-theme="dark"]`, o fallback do sistema e `html.laift-always-dark`. Um módulo que precisa ser sempre escuro (cena 3D/WebGL) usa `<html class="laift-always-dark">` e mapeia as variáveis para os mesmos tokens.
5. **Acessibilidade herdada dos tokens.** Anel de foco em tudo que é focável, `.laift-sr-only` para rótulos só de leitor de tela, e `prefers-reduced-motion` desliga animações e transições.
6. **JS do módulo** (ver `shared/safe-dom.js`):
   - carregue `<script src="../shared/safe-dom.js">` antes dos scripts da página;
   - dado → `textContent` ou `LaiftDom.h()`; marcação com dado → `LaiftDom.setHtml(el, LaiftDom.html\`...${dado}...\`)`;
   - botões com `data-action="funcao"` / `data-arg` / `data-args='[...]'`, e `LaiftDom.delegateActions(document, [lista fechada])`. Nada de `onclick="..."` nem `<script>` inline;
   - chamadas à plataforma: `if (window.LaiftApi) LaiftApi.call('apiLearn…', {...})`;
   - biblioteca externa: jsDelivr com versão fixa + `integrity` + `crossorigin="anonymous"` (§5).

## 3. Módulos escuros por natureza (justificativa)

Laboratório, Estúdio Molecular e Anatomia 3D ficam escuros também no tema claro, com `<html class="laift-always-dark">`. Eles usam as superfícies, textos, bordas, raios e fontes **escuros** do design system, e a identidade continua no acento.

- **Visualização**: cena WebGL (three.js/3Dmol), bancada com chama, gelo e precipitados, e gráficos PK. Tudo foi desenhado sobre fundo escuro, e as cores de dado (ciano, verde, magenta, amarelo) perdem contraste sobre branco.
- **Canvas e bibliotecas**: o SmilesDrawer desenha em cores claras (tema "dark" da biblioteca), e os viewers 3D usam `backgroundColor: '#020617'`.
- **Estilos gerados por JS**: HUDs e painéis com cores em linha assumem o fundo escuro. Levá-los ao tema claro exigiria reescrever essas cores em centenas de pontos de JS, com risco alto de regressão, sem ganho de uso.

O cartão da molécula no Quiz de Farmacologia fica escuro pelo mesmo motivo (canvas do SmilesDrawer).

## 4. Números antes/depois (arquivos da Equipe 4)

Contagem sem comentários, sobre os 29 → 38 arquivos `.js/.html` da Equipe 4. Ficam fora `lab-preceptor.js`, que é da Equipe 3, e os bancos de dados estáticos. O script de contagem é a mesma lógica da parte estática do `fase4.e2e.js`.

| Métrica | Antes (`6608523`) | Depois |
|---|---:|---:|
| `innerHTML`/`insertAdjacentHTML`/`document.write` | 98 | **0** fora de `safe-dom.js` (2 dentro: `setHtml`/`appendHtml`, que só aceitam o `html\`\`` que escapa tudo) |
| Handlers inline (`on*="..."`) no HTML e em templates JS | 178 | **0** |
| `<script>` inline | 6 | **0** |
| `<script src="https://…">` sem versão/SRI | 12 de 12 | **0** de 11 (o QR do crachá passou a ser local) |
| Carregamentos dinâmicos sem versão/SRI (Estúdio) | 4 (RDKit sem versão) | **0** (2, com versão e SRI) |
| `postMessage(..., '*')` | 5 | **0** |
| Referências ao Apps Script (`APPS_SCRIPT_GATEWAY`/`GAS_ENDPOINT`) | 11 | **0** |
| Quiz: JS de `quiz/app.js` + `toxicologia/app.js` | 1.463 linhas (≈220 duplicadas) | 928 (191 + 138 + motor de 599) |
| Quiz: CSS de `quiz/style.css` + `toxicologia/style.css` | 1.816 linhas quase iguais | 654 (77 + 29 + `quiz-engine.css` de 548) |

Em todo `frontend/modulos/` (com Clínica, Fiscal e `lab-preceptor.js`, contando comentários), `innerHTML` caiu de 138 para 51. O restante está nos arquivos das Equipes 2 e 3 (§8).

### Contraste (WCAG) dos pares principais

| Par | Razão |
|---|---:|
| Texto / superfície (claro · escuro) | 15,7 · 14,1 |
| Texto secundário `--laift-muted` / superfície (claro · escuro) | 5,9 · 6,8 |
| Botão primário da plataforma (claro): antes `#06231e`/`#0f6f62` → agora branco | 2,7 → **6,1** |
| Texto secundário da Clínica/Fiscal: antes `#718096` → agora `--laift-muted` | 4,0 → **5,9** |
| Acentos (texto sobre acento, claro · escuro): Farmacologia | 10,4 · 8,4 |
| Acentos: Toxicologia | 6,6 · 9,3 |
| Acentos: Clínica | 5,5 · 8,5 |
| Acentos: Fiscal | 5,4 · 8,4 |
| Warning / warning-soft (claro) | 5,4 |
| Ciano do laboratório / superfície escura | 11,0 |
| `--text-dim` da anatomia / superfície | 4,7 |

## 5. Bibliotecas pinadas com SRI

Os hashes foram calculados sobre os arquivos do **tarball do npm** (`npm pack <pkg>@<versão>`), porque os CDNs respondem 403 neste ambiente. O jsDelivr (`/npm/<pkg>@<versão>/<caminho>`) serve exatamente esses bytes. Em todos os casos o caminho **existe no pacote**, sem minificação gerada na hora pelo jsDelivr.

| Biblioteca | Versão | Onde | Arquivo (jsDelivr) | `integrity` |
|---|---|---|---|---|
| smiles-drawer | 2.1.7 (a mesma de antes) | quiz, laboratório | `smiles-drawer@2.1.7/dist/smiles-drawer.min.js` | `sha384-7qaH3wakC2tfDmCIw89VkGQ+G9iEvHeVV+GFGveOo/NLBcwW3TtGNHrL7HLDCbCm` |
| smiles-drawer | 2.3.0 (a mesma de antes) | Estúdio | `smiles-drawer@2.3.0/dist/smiles-drawer.min.js` | `sha384-gvxePxLB8Ajzz7m7uFrbpge/5fM7QBToaa5lpbBqB44P3Erv4iIKXMBbPJDKkdX0` |
| 3dmol | 2.5.5 (antes `3Dmol.org/build`, sem versão) | laboratório, Estúdio, anatomia | `3dmol@2.5.5/build/3Dmol-min.js` | `sha384-OsczYbldvrHgslr9fFp/i4GiLSeuw9l+QIlv99ITw8soOwXcoGeflFMLg+CU/X1d` |
| three | 0.128.0 (= r128 de antes) | anatomia | `three@0.128.0/build/three.min.js` | `sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu` |
| three (GLTFLoader) | 0.128.0 | anatomia | `three@0.128.0/examples/js/loaders/GLTFLoader.js` | `sha384-fljlqkjWlmSFjkESkQvm77heIZpoWmXEOzlCA7kOpGUH+95Zk0yGfQieWM2q136E` |
| three (DRACOLoader) | 0.128.0 | anatomia | `three@0.128.0/examples/js/loaders/DRACOLoader.js` | `sha384-TNRcLasZnnfIJJskDY5XlrfmsKTjBSy98MtyLuX+3rQWRbpSQvtFIdikNpcOh3SN` |
| three (OrbitControls) | 0.128.0 | anatomia | `three@0.128.0/examples/js/controls/OrbitControls.js` | `sha384-wagZhIFgY4hD+7awjQjR4e2E294y6J2HSnd8eTNc15ZubTeQeVRZwhQJ+W6hnBsf` |
| chart.js | 4.5.1 (antes `npm/chart.js`, sem versão) | anatomia | `chart.js@4.5.1/dist/chart.umd.min.js` (o arquivo padrão do jsDelivr) | `sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ` |
| openchemlib | 8.6.0 (a mesma de antes) | Estúdio (sob demanda) | `openchemlib@8.6.0/dist/openchemlib-full.js` | `sha384-uGDLFGKDxSejlsZ5aP+cqrKccw9mRrYPhNcW0/EI8lXb7w+mDoDv+klc5T5xJRbw` |
| @rdkit/rdkit | 2026.3.6 (antes sem versão) | Estúdio (sob demanda) | `@rdkit/rdkit@2026.3.6/dist/RDKit_minimal.js` (+ `.wasm` da mesma pasta via `locateFile`) | `sha384-SEkYzZCyQ/+sB/gjMg6MB1SeXeooxG/gvnDEnpVHmNr1OwbJGvmSUyxg12pxrAxQ` |
| qrcodejs 1.0.0 (cdnjs) | **removida** | crachá | substituída por `vendor/qrcode-generator.js`, local, a mesma da credencial | — |
| html5-qrcode | 2.3.8 | fiscal (Equipe 2) | `html5-qrcode@2.3.8/html5-qrcode.min.js` | `sha384-c9d8RFSL+u3exBOJ4Yp3HUJXS4znl9f+z66d1y54ig+ea249SpqR+w1wyvXz/lk+` (pedido de integração §7) |

**Observações:**
- O `.wasm` do RDKit não tem SRI, porque o navegador não verifica integridade em `fetch` de WebAssembly. A versão fixa garante ao menos o par `.js`/`.wasm` coerente.
- **Decodificador Draco vendorizado (não jsDelivr).** `modulos/anatomia-3d/models/body.glb` é exportado com `KHR_draco_mesh_compression` (extensionsRequired) — sem decodificar, o GLTFLoader recusa o arquivo (826 malhas) inteiro. Antes, o `THREE.GLTFLoader` do módulo não tinha `setDRACOLoader`, então o GLB real nunca carregava e a página ficava sempre no manequim procedural. O DRACOLoader (jsDelivr, tabela acima) precisa de 3 arquivos que ele mesmo busca por `decoderPath` — copiados do **mesmo pacote npm** (`three@0.128.0`, `examples/js/libs/draco/`) para `frontend/modulos/anatomia-3d/vendor/draco/`, servidos como qualquer outro arquivo estático do módulo (não do jsDelivr, porque o Worker `blob:` que os usa lê via `FileLoader` same-origin, não por `<script src>`):
  - `draco_wasm_wrapper.js` (52,3 KiB) e `draco_decoder.wasm` (274,8 KiB) — o par que o DRACOLoader busca quando `WebAssembly` está disponível (sempre, em Chromium);
  - `draco_decoder.js` (736,7 KiB) — variante 100% JS, buscada só se `WebAssembly` não existir; vendorizada por completude, não exercida pelos testes.

  `scripts/build.js` já copiava `vendor/` e `modulos/` inteiros para `dist/`, então nenhuma mudança foi necessária ali — só em `frontend/modulos/anatomia-3d/js/three-engine.js` (`setDecoderPath('vendor/draco/')` + `loader.setDRACOLoader(...)`) e no `<meta>` de CSP do módulo (`'wasm-unsafe-eval'` — ver `docs/SECURITY.md`, "Decisões"). `dev-server.js`, `scripts/e2e/harness.js` e `scripts/serve-dist.js` já serviam `.wasm` como `application/wasm` (e `.glb` como `model/gltf-binary`) antes desta tarefa. Ver `scripts/e2e/atlas.e2e.js` para o teste funcional (826 malhas reais, toggle de sistema/camada, clique mostrando nome+descrição, zero violação de CSP).
- Para atualizar uma biblioteca:
  1. rode `npm pack <pkg>@<nova>`;
  2. extraia o tarball;
  3. calcule `openssl dgst -sha384 -binary <arquivo> | openssl base64 -A`;
  4. troque a versão e o hash **juntos**.
- Google Fonts (Urbanist, Fira Code, DM Sans, Fraunces) saíram dos módulos. A tipografia agora é a pilha do sistema da plataforma, sem requisição a terceiros e com uma origem a menos para a CSP.

## 6. Achados de segurança corrigidos

Todos na origem da plataforma, onde fica `localStorage['pm_session']`:

1. **XSS refletido — Anatomia, busca de protocolos.** O termo digitado voltava por `innerHTML` em "Nenhum protocolo encontrado para "…"".
2. **XSS armazenado — Anatomia, dossiê PDF.** O composto e a via do histórico (`localStorage`, com nome digitado pelo usuário na simulação customizada) iam crus para `document.write` numa janela da mesma origem. O dossiê agora é montado pelo DOM, sem `document.write` e sem `<script>` inline.
3. **XSS — Estúdio, similaridade.** O composto ia serializado num `onclick='…'`: um apóstrofo no nome de uma molécula criada no Estúdio fechava o atributo. Agora o item leva só o id, e a ação vem de `data-action`.
4. **XSS — Estúdio, bioisosterismo.** Nome e SMILES eram colados num `onclick` do botão "Injetar". Agora vão por `data-args` em JSON, escapados.
5. **Dados de APIs públicas por `innerHTML`**: OpenFDA (Toxicologia); RxNav/ChEBI/PubChem (ficha do Quiz); PubChem/ChEBI/Wikidata (dossiê do laboratório); ChEMBL e UniChem (Estúdio); RCSB PDB (Anatomia). Tudo virou `textContent` ou `html\`\``. No ChEMBL, o id ia sem `encodeURIComponent` para a URL da segunda consulta.
6. **Respostas do preceptor e pergunta do aluno** (chat do laboratório) iam por `innerHTML +=`. Agora são texto puro com `white-space: pre-wrap` (Contrato 2: "o cliente renderiza com `textContent`").
7. **Nomes vindos do Estúdio para a bancada** (`postMessage`/`BroadcastChannel`/`storage`) iam por `innerHTML` no catálogo e no log. O seletor CSS também usava a chave crua; agora usa `CSS.escape`.
8. **`postMessage('*')`** entre a bancada e o Estúdio: agora usa `location.origin`, e os dois listeners validam `event.origin`.
9. **Bibliotecas de CDN sem versão e sem SRI**: Chart.js e 3Dmol pegavam sempre a última versão, e o RDKit também. Um CDN comprometido rodaria código na origem da plataforma (§5).
10. **Métricas enviadas ao Apps Script** com o e-mail no corpo (identidade não verificada). Agora a ponte usa a sessão da Worker, e a identidade vem do servidor.
11. **Crachá**: a URL da foto só aceita http(s) ou `blob:`, e o QR é gerado localmente (antes, o texto do QR ia para um script de terceiro sem SRI).

Bugs funcionais encontrados no caminho e corrigidos:

- Na Anatomia, os botões do catálogo PDB e a simulação customizada nunca funcionavam. `const MolEngine`/`PkEngine` não viram `window.X`, e o código testava `window.MolEngine`.
- Na Anatomia, "Atualizar Relatório Local" chamava uma função não exportada, e "Refazer Quiz" quebrava porque o resultado apagava o cartão do caso.
- No Quiz, estudar um tópico apagava o progresso salvo dos outros tópicos.
- No Laboratório, o `<script>` inline duplicava funções que o `script.js` já redefinia.
- Na Toxicologia, o alerta do OpenFDA de uma questão podia aparecer na questão seguinte (corrida assíncrona).

## 7. Pedidos de integração

### Equipe 2 — `modulos/shared/laift-identity.js` (ponte)

- Aplicar `data-theme` no `<html>` também quando o módulo abre numa **aba nova com `window.opener`**. É o caso do Crachá, aberto pelo terminal fiscal. `findHost()` já encontra a plataforma pelo `opener`, então basta aplicar o tema a partir desse mesmo `host`, e não só de `window.top`. Esboço (o nome da função que devolve o tema efetivo é o que a Equipe 2 definir):
  ```js
  // Fase 2 — tema da plataforma no módulo (iframe OU aba aberta por um módulo)
  function applyTheme() {
    var theme = getTheme();            // 'light' | 'dark', já resolvido a partir de findHost()
    if (theme === 'light' || theme === 'dark') global.document.documentElement.setAttribute('data-theme', theme);
  }
  ```
- Os módulos da Equipe 4 chamam `window.LaiftApi.call` **na hora do uso** e são defensivos. Não precisam de nada além do contrato.
- Valores enviados, para a validação no serviço:
  - `apiLearnSubmitQuizAttempt.topics`: até 20 strings, com os tópicos das questões do simulado. Na anatomia é `['Quiz 3D — anatomia aplicada']`, com travessão Unicode.
  - `apiLearnRecordLabFormulation`:
    - `product` ≤ 120 caracteres;
    - `reagents` ≤ 30 chaves internas (ex.: `AcidoSalicilico_s`, as mesmas que iam ao Apps Script);
    - `temperature` numérico, com 0,1 °C;
    - `stirring` booleano;
    - `observation` ≤ 500 caracteres.
- `fiscal/index.html`: fixar e verificar o leitor de QR:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js" integrity="sha384-c9d8RFSL+u3exBOJ4Yp3HUJXS4znl9f+z66d1y54ig+ea249SpqR+w1wyvXz/lk+" crossorigin="anonymous"></script>
  ```
- `fiscal/fiscal-engine.js` (link para o crachá): os parâmetros podem ir com um único `encodeURIComponent`. O crachá agora tolera o duplo, mas ele deixa de ser necessário.

### Equipe 3 — `laboratorio/js/lab-preceptor.js`

- `limparChatPreceptor` monta as sugestões por `innerHTML` com `onclick="enviarDuvidaRapida(...)"`, o que quebra sob a CSP da Onda 2. O `script.js` já trata qualquer `[data-pergunta]` dentro de `#labChatMessages`. Proposta:
  ```js
  window.limparChatPreceptor = function () {
    LabPreceptorEngine.historicoChatLab = [];
    const chatBox = document.getElementById('labChatMessages');
    if (!chatBox) return;
    chatBox.replaceChildren();
    const h = LaiftDom.h;
    const chips = [
      ['💊 Síntese de Dipirona', 'Como sintetizar Dipirona?'],
      ['🧪 Rota da Aspirina', 'Como sintetizar Aspirina?'],
      ['🔬 Rota do Ibuprofeno', 'Como sintetizar Ibuprofeno?'],
      ['🌡️ Diagnóstico do Vaso', 'O que tem no meu vaso?'],
    ].map(([rotulo, pergunta]) => h('button', { type: 'button', className: 'chat-chip', 'data-pergunta': pergunta, text: rotulo }));
    chatBox.appendChild(h('div', { className: 'lab-chat-msg msg-preceptor' }, ['Olá! Pergunte sobre qualquer rota de síntese.', h('div', { className: 'chat-chips' }, chips)]));
  };
  ```
- `LabPreceptorEngine.processarMensagem` deve devolver **texto puro**. O `script.js` renderiza com `textContent` e `white-space: pre-wrap`, e `<br>`/Markdown aparecem literalmente.

### Integrador

- `frontend/styles.css`: o bloco da Fase 4 fica **antes** da seção "Área Aprender", e não no fim do arquivo, para não conflitar com os blocos que as Equipes 2 e 3 acrescentam no fim.
- `docs/SECURITY.md`: sugestão de acréscimo:

  > Módulos em `frontend/modulos/` usam `shared/safe-dom.js` (único `innerHTML`, via `html\`\``), não têm handlers nem scripts inline e carregam bibliotecas externas só do jsDelivr com versão fixa + SRI (tabela em `docs/FASE_4_QUALIDADE.md`). O `fase4.e2e.js` falha se isso regredir.

- `README.md`: apontar `docs/FASE_4_QUALIDADE.md §2` como o guia do design system para novos módulos.
- `harness.js`/`smoke.e2e.js`: nada a mudar. A lista `IGNORABLE` do smoke já cobre as bibliotecas abortadas, e o `fase4.e2e.js` usa a mesma.

## 8. Onda 2 (depois da integração) — resultado

A Onda 2 partiu do código integrado (`9679670`, Fases 2, 3 e 4 juntas). Os
itens planejados na Onda 1 para Clínica, Fiscal e preceptor do laboratório
(`innerHTML`, handlers inline) já tinham chegado a zero na integração.

### Números (front-end inteiro, fonte)

| Medida | Antes (`9679670`) | Depois |
|---|---|---|
| Referências a Apps Script (`script.google`, `APPS_SCRIPT`, `ApiService`) | várias, incluindo `api-service.js` | **0** (`api-service.js` removido) |
| `innerHTML`, `insertAdjacentHTML` ou `document.write` fora de `safe-dom.js` | 0 | 0 |
| Handlers inline (`on*=`) | 0 | 0 |
| `<script>` inline | 3 (404, termos, privacidade) | **0** (`static-page.js`) |
| URLs `javascript:` | 2 ("Voltar" dos termos e da privacidade) | **0** |
| Páginas com CSP | 0 de 12 | **12 de 12** |
| Atributos `style=` | 258 (clínica: 27) | 227 (clínica: **0**; restam laboratório 56, anatomia 126 e plataforma 45) |
| Regras transitórias `[style*=…]` em `shared/style.css` | presentes | **removidas** |

### O que foi feito

1. **Fim do Apps Script.**
   - Saíram:
     - `modulos/shared/api-service.js`;
     - `window.APPS_SCRIPT_GATEWAY`;
     - `LaiftLearning.APPS_SCRIPT_URL`;
     - comentários e textos obsoletos ("Groq 120B" no laboratório).
   - O harness E2E aborta e registra qualquer requisição fora da Worker. O smoke, a fase2 e a fase3 exigem:
     - nenhum POST fora da Worker;
     - token nunca enviado a outro host.
2. **CSP** por `<meta>` em todas as páginas; tabela por página em `docs/SECURITY.md`.
   - Correções que a CSP exigiu:
     - **Chart.js** da plataforma apontava para um arquivo inexistente no pacote 4.4.4. Agora é `chart.umd.min.js` 4.5.1 com SRI.
     - **RDKit**: o embind usa `new Function` (inclusive só para compilar o `.wasm`), então exige `'unsafe-eval'`. Ficou desligado na Onda 2 e foi religado na Onda 3, como exceção única de CSP confinada a `modulos/laboratorio/studio/index.html` (testado empiricamente: só `'wasm-unsafe-eval'` não basta) — ver `docs/SECURITY.md`. O `studio-loader.js` continua lendo a CSP em runtime e só carrega o RDKit se ela permitir.
     - **Organograma**: `TypeError` quando a resposta vinha sem `chart`.
   - O cenário novo `csp.e2e.js` faz três coisas:
     - checagem estática: CSP antes de qualquer script, diretivas obrigatórias, varredura do front-end inteiro;
     - percurso de membro e de admin com as bibliotecas reais, servidas por um espelho npm local (`scripts/e2e/cdn-mirror/`) com SRI conferido;
     - **falha em qualquer `securitypolicyviolation` em qualquer frame**.
3. **Clínica sem estilo inline.**
   - Leitos, acervo, radar, semiologia, exames e parecer usam classes com tokens.
   - O modal do radar virou `role=dialog`.
   - As regras `[style*=…]` saíram de `shared/style.css`.
4. **Passe de UX.**
   - **Hub "Aprender":**
     - o foco vai para "Voltar" ao abrir um módulo e volta ao cartão ao fechar;
     - `aria-busy` nas estatísticas.
   - **Fiscal:**
     - o iframe mede a altura do conteúdo (`ResizeObserver`), então a barra fixa do celular não cobre mais o fim do terminal;
     - as cores vêm dos tokens nos dois temas.
   - **Painel IA:** grade, 2 colunas a 360 px, botão em largura total.
   - Tudo conferido por captura em 360 px e 1280 px, nos temas claro e escuro.
5. **Crachá.** Os parâmetros eram decodificados duas vezes, e um nome com `%` quebrava. Agora são decodificados uma vez. A interface id/nome/cargo/qr é a mesma. Há teste com `Ana 100% %41 Silva`.
6. **Revisão de segurança** do diff `83c4640..HEAD` (Worker das Fases 2 e 3, ponte, fiscal, admin de IA, clínica):
   - **Corrigido: radar epidemiológico.** O nome do agente, texto livre do cliente nos casos locais, entrava no radar visto por toda a liga. Uma pessoa sozinha conseguia publicar um texto qualquer ali. Agora o agente só aparece se veio do acervo ou se 2+ pessoas diferentes o registraram. Teste em `worker/test/clinicalService.test.js`.
   - **Corrigido:** o link "Voltar" com `javascript:` era bloqueado em silêncio pela CSP.
   - **Conferido sem achado:**
     - papel checado no servidor em todo `apiAdmin*`;
     - identidade só da sessão;
     - SQL só por tagged template, com `ILIKE` escapado;
     - chaves do Groq fora de resposta, log e erro (erros com texto fixo, `ai_usage_log` só com o índice);
     - rate limits (aprendizagem, check-in, saúde da IA) e cotas de IA com disjuntor;
     - validação de entrada com lista fechada de campos e tetos de tamanho;
     - injeção de fórmula no CSV;
     - `postMessage` com origem fixa e conferida;
     - allowlist da ponte;
     - cache de síntese (só o servidor grava; prompt só com o termo normalizado);
     - acervo (só `approved` na biblioteca, sem gabarito; revisão só admin);
     - QR v2 (HMAC com chave derivada, comparação em tempo constante).
   - **Riscos aceitos:** `docs/SECURITY.md`, "Riscos residuais".
7. **Documentação integrada:**
   - `README.md`;
   - `docs/DEPLOYMENT.md`, reescrito para Neon, Worker e Pages;
   - `docs/SECURITY.md`, reescrito com CSP, QR v2, IA e rotação;
   - `docs/POLITICA_DE_PRIVACIDADE.md` e `privacidade.html`: versão 2026-09-26, com Groq como operador e a área "Aprender", **pendente de revisão jurídica**;
   - status nos dois planos.

## 9. Riscos e pendências

- **`style-src 'unsafe-inline'`** continua por causa dos `style=` restantes (laboratório, anatomia, plataforma) e do estilo injetado por bibliotecas. Tirar isso é o próximo passo para uma CSP 100% estrita.
- **RDKit religado no estúdio (Onda 3)**, com `'unsafe-eval'` como exceção única de CSP, confinada a essa página (que só fala com APIs públicas de química e o jsDelivr). Ver `docs/SECURITY.md` ("Decisões" e "Riscos residuais") para o trade-off e o teste que prova a inicialização (`scripts/e2e/rdkit.e2e.js`).
- **Clickjacking**: `frame-ancestors` não funciona em `<meta>`. Precisa de cabeçalho HTTP, que o GitHub Pages não oferece.
- **E2E intermitente no fiscal (`fase2.e2e.js`, "lista nominal")**: falhou 2 vezes em cerca de 25 execuções antes do reinício do container, com o clique em "Ver inscritos" sem efeito. Não se repetiu em 18 execuções seguidas depois. Uma suspeita é a mudança de altura do iframe (auto-altura da Onda 2) durante o clique. Se voltar a acontecer, investigar primeiro por aí.
- **Versões "latest" fixadas.** Chart.js 4.5.1, 3Dmol 2.5.5 e RDKit 2026.3.6 eram as versões mais recentes no npm na data da pinagem. Antes, a página pegava "a última" a cada acesso. O `csp.e2e.js` agora roda o gráfico PK, o 3Dmol e o atlas three.js com os arquivos reais dos pacotes npm (espelho local). Vale ainda uma olhada no jsDelivr de verdade depois do deploy.
- **SRI e cache.** Se o jsDelivr servir outro conteúdo, o navegador recusa o script e o módulo degrada: sem 3D, sem 2D, sem gráfico. É o comportamento desejado, mas fica visível ao usuário.
- **Tipografia.** Sem Google Fonts, o crachá impresso usa Georgia no lugar de Fraunces e a fonte do sistema no lugar de DM Sans. O laboratório e o Estúdio usam a fonte do sistema e `ui-monospace`.
- **Farmacologia**: a tela de resultado ganhou desempenho por tópico, "Revisar erradas" e "Refazer" (antes só a Toxicologia tinha). É uma mudança deliberada do motor único.
- **Anatomia no celular**: o botão "Tela Cheia" do próprio atlas some abaixo de 600 px, porque a plataforma já oferece "Tela cheia" na barra do módulo.
