# Licenças de terceiros

Levantamento feito em 2026-10-03 a partir dos arquivos `LICENSE`/`VERSION`
presentes no repositório, dos cabeçalhos dos arquivos e das referências de CDN
nos `index.html`. **Regenerar antes do depósito no INPI e a cada release.**
Itens marcados com "confirmar" não foram verificados em arquivo do projeto.

## Distribuídas no repositório (vendorizadas)
| Biblioteca | Versão | Licença | Local | Verificação |
|---|---|---|---|---|
| three.js | 0.186.1 | MIT | `frontend/modulos/anatomia-3d/vendor/three/` | `LICENSE` do projeto |
| 3Dmol.js | 2.5.5 | BSD-3-Clause | `.../vendor/3dmol/` | `LICENSE` do projeto |
| Chart.js | 4.5.1 | MIT | `.../vendor/chartjs/` | `LICENSE.md` do projeto |
| qrcode-generator (Kazuhiko Arase) | — | MIT | `frontend/vendor/qrcode-generator.js` | cabeçalho do arquivo |
| 3Dmol.js (cópia do Laboratório/Estúdio) | 2.5.5 | BSD-3-Clause | `frontend/modulos/laboratorio/vendor/3dmol/` | `LICENSE` do pacote npm; SRI idêntico ao do CDN |
| SmilesDrawer | 2.1.7 | MIT | `frontend/modulos/laboratorio/vendor/smiles-drawer-2.1.7/` e `frontend/modulos/quiz/vendor/smiles-drawer/` | `LICENSE.md` do pacote; SRI idêntico ao do CDN |
| SmilesDrawer | 2.3.0 | MIT | `frontend/modulos/laboratorio/vendor/smiles-drawer-2.3.0/` | `LICENSE.md` do pacote; SRI idêntico ao do CDN |
| OpenChemLib (build `full`, 3,1 MB) | 8.6.0 | BSD-3-Clause | `frontend/modulos/laboratorio/vendor/openchemlib/` | `LICENSE` do pacote; SRI idêntico ao do CDN |
| html5-qrcode | 2.3.8 | Apache-2.0 | `frontend/modulos/fiscal/vendor/html5-qrcode/` | `LICENSE` do pacote; SRI idêntico ao do CDN |
| Draco decoder (Google) | — | Apache-2.0 | `.../vendor/draco/` | confirmar |
| meshoptimizer decoder | — | MIT | `.../vendor/three/libs/meshopt_decoder.module.js` | confirmar |

## Carregadas por CDN (jsDelivr) com versão fixa e SRI
| Biblioteca | Versão | Licença | Verificação |
|---|---|---|---|
| RDKit (MinimalLib: `RDKit_minimal.js` 105 KB + `.wasm` 7,3 MB) | 2026.3.6 | BSD-3-Clause | `LICENSE` do pacote npm `@rdkit/rdkit`; SRI do `.js` em `studio-loader.js` |

Decisão TEC-01: o RDKit **não** foi vendorizado porque o `.wasm` passa de 5 MB
(7,3 MB) e engordaria o repositório para sempre (cada versão nova duplica o
binário no histórico do git). Ele é carregado sob demanda só no Estúdio
(`laboratorio/studio`), com SRI, e a página mantém `cdn.jsdelivr.net` em
`script-src`/`connect-src`. As demais bibliotecas dos módulos saíram do CDN.

## Back-end (Worker)
| Pacote | Versão | Licença |
|---|---|---|
| @neondatabase/serverless | 0.10.4 | MIT |
| pacotes `pg-*` e `postgres-*` (transitivos) | — | MIT / ISC |

## Somente desenvolvimento (não distribuídas ao usuário final)
javascript-obfuscator (BSD-2-Clause), wrangler (MIT/Apache-2.0), jest (MIT),
ajv (MIT), axe-core (MPL-2.0), jsqr (Apache-2.0), @gltf-transform/core (MIT),
Playwright (Apache-2.0). Licenças a confirmar no `package-lock.json`.

## Dados e modelos
Ver [NOTICE.md](NOTICE.md), seção 2 (Z-Anatomy CC BY-SA 4.0, HRA CC BY 4.0,
Wikipédia CC BY-SA 4.0, Wikidata CC0).
