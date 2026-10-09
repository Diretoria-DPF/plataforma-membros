# Regras das fichas de conteúdo (C1–C5) — valem junto com `_REGRAS.md`

## Fonte única
Só entram fatos com status **CONFIRMADO** ou **CORRIGIDO** nos arquivos `docs/blog/campanhas/outubro-rosa/fatos-*.md` (use o valor CORRIGIDO,
nunca o do material do dono). DESCARTADO não entra. Sem fato, sem frase: prefira texto sem número a número sem fonte.
Toda frase com número, lei ou recomendação oficial leva fonte: `"ref": "<id>"` no item do bloco de campanha ou, num `p`/`lista`, um link
`[INCA](#ref-<id>)` no fim da frase. O `<id>` vem da seção 3 (JSON) do arquivo de fatos.

## Formato do arquivo de parte (`docs/blog/campanhas/outubro-rosa/partes/parte-N.json`)
```json
{ "parte": 1,
  "blocos": [ { "t": "h2", "texto": "…" }, { "t": "p", "texto": "… [INCA](#ref-epi-inca-estimativa-2026)." } ],
  "referencias": [ { "id": "epi-inca-estimativa-2026", "titulo": "…", "orgao": "…", "href": "https://…", "acesso": "2026-10-09", "tipo": "dados" } ] }
```
`referencias` = só as usadas na sua parte, copiadas **sem alterar** do JSON do arquivo de fatos. Blocos e campos: `docs/blog/CAMPANHAS.md` §3 e
`frontend/blog/conteudo/_EXEMPLO.json` (blocos comuns). Cada seção começa com um bloco `h2` comum. Nada de `sumario`, `referencias`, `contato`
ou aviso de topo/fim nas partes (o C5 põe).

## Texto
- Público geral (não só estudante): "você", frases de até ~20 palavras, voz ativa, uma ideia por parágrafo, termo técnico explicado na 1ª vez.
  Leve e direto, sem alarmismo e sem promessa ("cura garantida" é proibido; "as chances de cura são maiores quando…" com fonte).
- Prosa curta (≤ 120 palavras por seção); a informação mora nos blocos visuais.
- Armadilhas do build: `docs/blog/CAMPANHAS.md` §8 (sem "garantido", sem `d/m` nem frações "1/8", anos com 4 dígitos, sem "19 de outubro",
  sem "em estudo"/"planejad…", sem `<`/`>`, sem nome de pessoa, sem e-mail, sem `@` exceto `@laift.liga`, link externo só em `referencias`).
- Sem emoji (exceção: `habitos[].emoji`, só na parte 4).

## Aceite comum (de `frontend/`, Bash; troque N)
```
node scripts/blog-blocos-campanha.js --checar-parte ../docs/blog/campanhas/outubro-rosa/partes/parte-N.json   # "OK (…)", sem "AVISO: plugue S1 ausente"
node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const s=JSON.stringify(p.blocos);const ids=new Set(p.referencias.map(r=>r.id));const usados=[...s.matchAll(/"ref":"([a-z0-9-]+)"|#ref-([a-z0-9-]+)/g)].map(m=>m[1]||m[2]);const falta=usados.filter(i=>!ids.has(i));const sobra=[...ids].filter(i=>!usados.includes(i));console.log("refs usadas",new Set(usados).size,"faltando",falta,"sobrando",sobra);process.exit(falta.length?1:0)' ../docs/blog/campanhas/outubro-rosa/partes/parte-N.json
```
E confira, linha a linha, que cada número do seu JSON aparece igual no arquivo de fatos (anote no relatório quantos números conferiu).
Relatório (≤ 12 linhas): blocos criados, nº de palavras de prosa, refs usadas, números conferidos, o que ficou de fora por falta de fonte.
