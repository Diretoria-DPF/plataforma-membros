# L08: Ajustes na conversa com a Lia (frontend): fontes legíveis, "já pesquisado", "Pesquisar mais a fundo"

**Objetivo.** Deixar visível o que muda no backend, sem quebrar nada quando as flags estiverem desligadas:
(1) rótulos legíveis para as fontes;
(2) aviso discreto quando a resposta veio do registro ou do cache (`cached: true`);
(3) botão **"Pesquisar mais a fundo"** quando o servidor mandar `canResearch: true`;
(4) estados da pesquisa externa;
(5) aviso de privacidade, uma única vez, antes da primeira pesquisa.

**Passo 0.** Leia:
- `frontend/assistant.js`: `sanitizeSources` (77), `renderSources` (250), `renderMessage` (335), `setBusy` (383), `send` (396-440) e o padrão de biblioteca `feedbackLib()` (264);
- `frontend/assistant-feedback.js`: padrão de módulo `root.LaiftAssistantFeedback` + `module.exports`;
- `frontend/assistant-feedback.css`: `.lia-sources*`;
- `frontend/scripts/assistant-feedback.test.mjs`, se existir (padrão de `node --test`);
- `docs/TIME_CONTRATO.md` (CSP, a11y, tokens, sem borda de card sob `ux_v2`).

**Arquivos-donos.** O par `frontend/assistant-research.js` + `frontend/scripts/assistant-research.test.mjs` (novos), `frontend/assistant.js` e `frontend/assistant-feedback.css`.

**Contrato com o backend (L07 e L09).**
- Resposta normal de `apiAssistantChat` pode trazer `cached: true` e `canResearch: true`.
- Pesquisa: `callApi('apiAssistantChat', token, { message, research: true })`, sem histórico.
- A resposta da pesquisa traz `source: 'research'` e `research: { provider, query, cached, failed, items: [{ title, journal, year, url, ids }] }`.

**Requisitos: `assistant-research.js`** (expõe `window.LaiftAssistantResearch`; só `createElement`/`textContent`/`setAttribute`, **sem `innerHTML`**):
- `sourceLabel(id)`: `kb` → "Guia da plataforma", `destinos` → "Telas e módulos", `guia` → "Guia da Lia", `privacidade` → "Privacidade", `convivencia` → "Convivência", `liga` → "A Liga", `plataforma` → "Plataforma", `modulos` → "Módulos de estudo", `publicacoes` → "Blog e publicações", `processo` → "Processo seletivo", `faq` → "Perguntas frequentes", `saude` → "Avisos de saúde"; id desconhecido volta como veio.
- `sanitizeResearch(r)`: até 10 itens; título até 300 caracteres, revista até 200, ano inteiro; `url` só `https:` com host em `['europepmc.org','www.ebi.ac.uk','pubmed.ncbi.nlm.nih.gov','doi.org','www.scielo.br','scielo.org','openalex.org']`, senão o item fica sem link.
- `renderResearch(doc, r)`:
  - lista `<ul aria-label="Referências encontradas">`;
  - cada item com título em texto, "revista · ano" e, se houver url, link "Abrir" com `target="_blank"` e `rel="noopener noreferrer"`;
  - estados: vazio ("Nada encontrado para esses termos.") e falha ("A base externa não respondeu agora. Tente mais tarde.");
  - rodapé "Referências de base externa (Europe PMC). A Lia não resume artigos nem dá orientação de saúde."
- `cachedNote(doc)`: texto "Resposta já pesquisada antes, sem gastar IA."
- `researchButton(doc, onClick)`: `<button type="button" class="lia-chip lia-research-btn">Pesquisar mais a fundo</button>`.
- `shouldShowPrivacyHint(storage)` e `markPrivacyHintSeen(storage)`: chave `lia.research.hint.v1`, com `try/catch` (o armazenamento pode faltar).

**Requisitos: `assistant.js`** (mudança pequena; o arquivo tem 661 linhas e deve ficar abaixo de 760):
- `renderSources` usa `sourceLabel`.
- `renderMessage` acrescenta, quando for o caso, `cachedNote`, `renderResearch` e `researchButton`.
- `send` e `addMessage` repassam `cached`, `canResearch` e `research` sanitizados.
- Nova `sendResearch(question)`, que segue o mesmo fluxo de `send`:
  - respeita `busy`, `moderation` e a troca de token;
  - mostra a pergunta do usuário com o prefixo "Pesquisar mais a fundo: ";
  - enquanto espera, o indicador diz "Pesquisando em bases científicas…" no mesmo nó `aria-live` do "digitando";
  - antes da primeira pesquisa, mostra uma vez o aviso de privacidade "Só os termos gerais da pergunta vão para a base externa. Não escreva dados pessoais.";
  - a pergunta usada é a última pergunta do usuário.
- **Sem os campos novos na resposta, a tela fica idêntica à de hoje.**
- Se `LaiftAssistantResearch` não estiver carregado (script ausente), tudo se comporta como hoje (`typeof` checado).

**Requisitos: CSS.** Só tokens (`--layer-*`, `--dur-*`, `--ease-*`, cores do tema); alvo de toque ≥ 44 px; contraste ≥ 4,5:1 nos dois temas; foco visível; sem borda de cartão sob `:root[data-flag-ux-v2-enabled]`; `prefers-reduced-motion` respeitado; nada comunicado só por cor.

**Teste (`node --test`).** `sourceLabel`; `sanitizeResearch` (host fora da lista, `http:`, `javascript:`, tamanhos); `renderResearch` com DOM mínimo simulado (como em `assistant-feedback.test.mjs`): `rel` e `target` corretos e estados vazio e falha; aviso de privacidade com o armazenamento lançando exceção.

**Aceite (comando).**
```bash
cd "C:/Users/Administrador/Desktop/plataforma membro/frontend" && node --test scripts/assistant-research.test.mjs && node --test scripts/*.test.mjs && node scripts/build.js && node scripts/e2e/run.js assistant
```
Esperado: o teste novo verde; nos `*.test.mjs`, só as 2 falhas conhecidas de CRLF no Windows; o e2e `assistant` verde (comportamento antigo preservado).

**Regras.** Sem git. **Não edite** `index.html`, `build.js`, `sw.js` nem `ux.css`: no relatório, informe à sessão principal a linha `<script defer src="assistant-research.js"></script>` (depois de `assistant-feedback.js`) e a entrada de `PRECACHE`. Cabeçalho de copyright; LF. GateGuard: se o hook pedir fatos, escreva 2 linhas (quem usa: o painel da Lia em `assistant.js`; a instrução: "vamos ajustar na interação") e repita a mesma chamada.

**Relatório (até 12 linhas).** Os arquivos com o número de linhas de cada um, o resultado dos três comandos, os trechos para a sessão principal (`index.html`, `sw.js`, `build.js`) e as capturas, se tiver feito.
