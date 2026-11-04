# Estúdio 3D: carga do RDKit e lacuna de SRI do `.wasm`

Registro da auditoria do Laboratório (LAB-14 e achado de segurança do WASM). Nenhuma troca de CDN foi feita agora.

## Estado atual

- `studio/studio-loader.js` injeta `RDKit_minimal.js` do jsDelivr (`@rdkit/rdkit@2026.3.6`) **com SRI** (`integrity` sha384 + `crossorigin`).
- O `RDKit_minimal.wasm` (7,3 MB) é buscado pelo próprio `initRDKitModule` via `fetch`/`instantiateStreaming` (`locateFile` em `studio.js`). **Esse download não tem SRI**: o navegador não oferece `integrity` para o `fetch` interno do Emscripten.
- Efeito: se o CDN servir outro `.wasm`, o navegador o executa. O `.js` com SRI limita o risco (ele carrega o `.wasm` por URL fixa e versão fixa), mas não o elimina.
- A carga é **sob demanda**: a bancada nunca referencia o RDKit (o Estúdio é um iframe aberto por clique) e, dentro do Estúdio, `window.__rdkitReady` é um *getter* que só injeta o script na primeira leitura.
- `'unsafe-eval'` continua sendo risco aceito apenas no Estúdio (ver `docs/SECURITY.md`); não foi alargado.

## Caminhos de correção (decisão fica para a sessão principal)

1. **Vendorizar** o `.wasm` em `modulos/laboratorio/vendor/rdkit/` com hash conferido em `scripts/vendor-sri.test.mjs` (mesmo padrão do TEC-01). Custo: 7,3 MB no repositório e no cache do navegador; `locateFile` passa a apontar para `../vendor/rdkit/`.
2. **Conferir o hash no cliente** antes de instanciar: `fetch` do `.wasm`, `crypto.subtle.digest('SHA-384')` e passagem dos bytes por `instantiateWasm`. Mantém o CDN, mas baixa o arquivo inteiro antes de iniciar (sem streaming).
3. Manter como está e aceitar o risco, já mitigado por versão fixa e SRI do `.js`.

## Sem rede ou sem RDKit

Sem o RDKit o Estúdio mostra apenas massa molar e contagem de átomos (calculadas do SMILES ou da fórmula). logP, TPSA, doadores/aceptores, Lipinski, Veber, Ghose, alertas estruturais, similaridade e bioisosterismo ficam indisponíveis, com mensagem; nada é estimado.
