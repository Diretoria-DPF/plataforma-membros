# Regras das fichas de pesquisa (P1–P6) — valem junto com `_REGRAS.md`

**Ferramentas:** carregue `WebSearch` e `WebFetch` com ToolSearch (`select:WebSearch,WebFetch`). Teto: ~40 chamadas de ferramenta.

## O que vale como fonte
- **Primária:** INCA e Ministério da Saúde (gov.br), CONITEC, DATASUS, IBGE, leis e decretos no **planalto.gov.br** (texto compilado),
  Diário Oficial (in.gov.br), OMS/OPAS/IARC (GLOBOCAN, Monografias), artigos científicos com **DOI** (Lancet, NEJM, JAMA, JCO, Nature, BMJ…),
  NCI/SEER, American Cancer Society, WCRF.
- **Jornal de referência** (Agência Brasil, Folha, G1, O Globo, Estadão, BBC): só para contexto/anúncio; número de jornal só entra se a
  fonte primária não estiver disponível **e** o jornal citar a primária — marque isso na coluna evidência.
- Blog, site de clínica, Wikipedia, rede social, "portal de saúde" genérico: **não** valem. Afirmação só com esse tipo de fonte = DESCARTADO.
- O link final tem de estar num host da lista `HOSTS_FONTES` (`docs/blog/CAMPANHAS.md` §6). Fora da lista: use o DOI (`https://doi.org/…`)
  ou a página equivalente em gov.br; não achou = DESCARTADO.
- **Abra a página (WebFetch) e confira o número/lei nela.** Resultado de busca não é conferência. Registre uma evidência de até 15 palavras,
  entre aspas (nunca copie trechos longos).

## Status
- **CONFIRMADO** — o número/lei está exatamente na fonte primária aberta.
- **CORRIGIDO** — o material do dono (`C:\Users\Administrador\Desktop\outubrorosa.md`) ou a hipótese estava errado; escreva o valor correto com a fonte.
- **DESCARTADO** — não achado em fonte primária, fonte inacessível, ou só fonte fraca. Não entra no post.
O material do dono é **hipótese**, não fonte: pode ter número, lei e DOI errados. Toda afirmação dele no seu tema precisa de um status.

## Redação da coluna "afirmação pronta"
Português simples, 1 frase, pronta para o público geral. Respeite as armadilhas do gerador (`CAMPANHAS.md` §8): sem "garantido",
sem `d/m` (nem frações como "1/8": escreva "1 em cada 8"), anos com 4 dígitos ("Lei nº 9.797/1999"), sem "em estudo"/"planejado",
sem `<`/`>`, sem nome de pessoa (nem autores: cite título, periódico/órgão e DOI), sem data por extenso tipo "19 de outubro".

## Formato do arquivo `docs/blog/campanhas/outubro-rosa/fatos-<tema>.md`
```
# Fatos — <tema> (Outubro Rosa 2026)
Checagem: 2026-10-09 · ficha Pn · <n> fontes abertas

## 1. Afirmações
| id | afirmação pronta (PT-BR simples) | número / lei | fonte (título · órgão · link · DOI) | acessado em | status | evidência (≤ 15 palavras) |
|---|---|---|---|---|---|---|
| <prefixo>-01 | … | … | … | 2026-10-09 | CONFIRMADO | "…" |

## 2. Material do dono: o que foi corrigido ou descartado
| linha do outubrorosa.md | o que dizia | status | correto / motivo |

## 3. Referências para o bloco `referencias` (JSON válido; só fontes de linhas CONFIRMADO/CORRIGIDO)
```json
[ { "id": "<prefixo>-<slug-curto>", "titulo": "…", "orgao": "…", "href": "https://…", "doi": "10.…", "acesso": "2026-10-09", "tipo": "dados|artigo|lei|guia|noticia" } ]
```
(omita `doi` se não houver; `id` casa `^[a-z0-9-]{3,48}$`; cada linha da tabela 1 aponta para um `id` desta lista na coluna fonte)

## 4. Lacunas
O que você procurou e não achou em fonte primária (1 linha cada).
```

## Aceite comum (de `frontend/`, Bash; troque `<tema>`)
```
F=../docs/blog/campanhas/outubro-rosa/fatos-<tema>.md
grep -cE '\| (CONFIRMADO|CORRIGIDO|DESCARTADO) \|' "$F"        # >= mínimo da ficha
node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8");const m=s.match(/```json\n([\s\S]*?)\n```/);const a=JSON.parse(m[1]);const ok=new Set(["www.gov.br","www.inca.gov.br","www.planalto.gov.br","www.in.gov.br","legis.senado.leg.br","www12.senado.leg.br","www25.senado.leg.br","www.camara.leg.br","bvsms.saude.gov.br","datasus.saude.gov.br","tabnet.datasus.gov.br","www.sei.ba.gov.br","doi.org","pubmed.ncbi.nlm.nih.gov","pmc.ncbi.nlm.nih.gov","www.ncbi.nlm.nih.gov","www.who.int","iris.who.int","gco.iarc.who.int","gco.iarc.fr","www.iarc.who.int","publications.iarc.who.int","monographs.iarc.who.int","www.scielo.br","www.thelancet.com","www.nejm.org","jamanetwork.com","ascopubs.org","www.nature.com","www.bmj.com","acsjournals.onlinelibrary.wiley.com","www.cancer.gov","seer.cancer.gov","www.cancer.org","www.wcrf.org","www.paho.org","www.ibge.gov.br","biblioteca.ibge.gov.br","www.saude.ba.gov.br","agenciabrasil.ebc.com.br","agenciagov.ebc.com.br","www1.folha.uol.com.br","g1.globo.com","oglobo.globo.com","www.estadao.com.br","www.bbc.com"]);const ids=new Set();for(const r of a){const u=new URL(r.href);if(u.protocol!=="https:"||!ok.has(u.hostname))throw new Error("host fora: "+r.href);if(!/^[a-z0-9-]{3,48}$/.test(r.id)||ids.has(r.id))throw new Error("id: "+r.id);ids.add(r.id);if(!/^\d{4}-\d{2}-\d{2}$/.test(r.acesso))throw new Error("acesso: "+r.id)}console.log("OK",a.length,"referencias")' "$F"
grep -ciE 'garantid|em estudo|planejad|[0-9]{1,2}/[0-9]{1,2}\b' "$F"   # olhe cada ocorrência: na coluna "afirmação pronta" deve ser 0
```
Relatório (≤ 12 linhas): nº de CONFIRMADO/CORRIGIDO/DESCARTADO, as 3 correções mais importantes do material do dono, lacunas.
