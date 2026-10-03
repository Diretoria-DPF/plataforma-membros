# NOTICE — Plataforma de Membros LAIFT

Copyright (c) 2026 Daniel Pires Francisco. Todos os direitos reservados ao
código próprio, nos termos do arquivo [LICENSE](LICENSE).

Este repositório reúne **materiais com regimes jurídicos diferentes**. A
licença proprietária do `LICENSE` vale somente para o código e os conteúdos
originais do titular. Os itens abaixo seguem as licenças de seus autores.

## 1. Código e conteúdo próprios (licença proprietária)
- `frontend/` (exceto `frontend/modulos/anatomia-3d/vendor/`, `frontend/vendor/` e `frontend/modulos/anatomia-3d/models/`)
- `worker/src/`, `worker/test/`, `worker/scripts/`
- `sql/`, `tools/`, `docs/`

> Atenção: parte de `frontend/modulos/` veio do antigo repositório
> `o-bala-vip`, mesclado com histórico preservado. A autoria desses módulos
> deve ser confirmada antes do registro no INPI (ver
> `docs/juridico/REGISTRO_INPI_SOFTWARE.md`).

## 2. Modelos 3D e dados com licença própria
| Material | Onde | Licença | Obrigação principal |
|---|---|---|---|
| Z-Anatomy (20 arquivos GLB, incluindo versões LOD1 derivadas) | `frontend/modulos/anatomia-3d/models/zanatomy/` | CC BY-SA 4.0 | Atribuição e compartilhamento pela mesma licença das adaptações |
| Human Reference Atlas / HuBMAP (17 arquivos GLB) | `frontend/modulos/anatomia-3d/models/hra/` | CC BY 4.0 | Atribuição |
| Textos derivados da Wikipédia PT (fichas do Atlas) | `frontend/modulos/anatomia-3d/data/atlas/content/` | CC BY-SA 4.0 | Atribuição e mesma licença |
| Dados da Wikidata | idem | CC0 | Nenhuma |

Textos das licenças e a atribuição detalhada de cada arquivo estão em
`frontend/modulos/anatomia-3d/models/LICENSES/` (`ATTRIBUTION.md`,
`CC-BY-4.0.txt`, `CC-BY-SA-4.0.txt`). Esses arquivos **não** podem ser
relicenciados como proprietários e **ficam fora** do objeto de registro de
programa de computador.

## 3. Bibliotecas de terceiros
Lista completa, com versões e licenças, em
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## 4. Marcas
"LAIFT" e o logotipo não são licenciados. Ver `LICENSE`, item 5.
