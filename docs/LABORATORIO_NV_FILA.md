# Laboratório: fila de conferência [NV]

Documento gerado por `frontend/scripts/lab-nv-fila.js`. Não edite à mão.

Como o revisor farmacêutico usa esta fila:

1. Cada linha é um valor a conferir com a fonte primária (arquivo, campo e item de referência).
2. A marca [NV] permanece nas fontes do repositório (`frontend/modulos/laboratorio/data/**`); o build a remove de `dist`, então o público nunca a vê.
3. Após conferir, edite o JSON de origem (corrija o valor ou a citação e apague a marca [NV] daquele campo) e rode `node frontend/scripts/lab-nv-fila.js --escrever` para atualizar este documento.
4. Para ver a fila sem abrir arquivos: `node frontend/scripts/lab-nv-fila.js` (imprime o documento).

Total: 36 marca(s) [NV] em 13 arquivo(s).

| Arquivo | Campo | Item | Valor a conferir |
|---|---|---|---|
| `modulos/laboratorio/data/cq/ensaios.json` | `conferencia.nota` |  | [NV] Critérios, limites e números dos métodos a conferir com a Farmacopeia Brasileira vigente e com as monografias antes de publicar. |
| `modulos/laboratorio/data/processos/proc_alcool_gel_70_v1.json` | `conferencia.nota` | Álcool em gel antisséptico a 70 % (p/p) | [NV] Valores numéricos, faixas de critério, tolerâncias e citações de norma a conferir com a fonte primária (edição e artigo vigentes) antes de publicar. |
| `modulos/laboratorio/data/processos/proc_alcool_gel_70_v1.json` | `referencias[0].nota` | RDC nº 42/2010 (ANVISA) | [NV] conferir título, vigência e enquadramento regulatório do produto (saneante ou cosmético) |
| `modulos/laboratorio/data/processos/proc_alcool_gel_70_v1.json` | `referencias[1].nota` | OMS: WHO-recommended Handrub Formulations (2010) | [NV] conferir a formulação e a forma de citação |
| `modulos/laboratorio/data/processos/proc_alcool_gel_70_v1.json` | `referencias[2].nota` | RDC nº 67/2007 (ANVISA) | [NV] conferir vigência e alterações |
| `modulos/laboratorio/data/processos/proc_capsulas_vitc_v1.json` | `conferencia.nota` | Cápsulas de ácido ascórbico 100 mg | [NV] Valores numéricos, faixas de critério, tolerâncias e citações de norma a conferir com a fonte primária (edição e artigo vigentes) antes de publicar. |
| `modulos/laboratorio/data/processos/proc_capsulas_vitc_v1.json` | `referencias[0].nota` | Farmacopeia Brasileira (edição vigente), métodos gerais | [NV] conferir número do método e critérios |
| `modulos/laboratorio/data/processos/proc_capsulas_vitc_v1.json` | `referencias[1].nota` | RDC nº 67/2007 (ANVISA) | [NV] conferir vigência e alterações |
| `modulos/laboratorio/data/processos/proc_cq_titulacao_hcl_v1.json` | `conferencia.nota` | Controle de qualidade: teor de uma solução de HCl 0,1 mol/L por titulação | [NV] Valores numéricos, faixas de critério, tolerâncias e citações de norma a conferir com a fonte primária (edição e artigo vigentes) antes de publicar. |
| `modulos/laboratorio/data/processos/proc_cq_titulacao_hcl_v1.json` | `referencias[0].nota` | Farmacopeia Brasileira (edição vigente), análise volumétrica | [NV] conferir método e critério |
| `modulos/laboratorio/data/processos/proc_desinfetante_cloro_v1.json` | `conferencia.nota` | Desinfetante de superfícies a 0,1 % de cloro ativo | [NV] Valores numéricos, faixas de critério, tolerâncias e citações de norma a conferir com a fonte primária (edição e artigo vigentes) antes de publicar. |
| `modulos/laboratorio/data/processos/proc_desinfetante_cloro_v1.json` | `referencias[0].nota` | RDC nº 59/2010 (ANVISA), produtos saneantes | [NV] conferir título, vigência e norma que a substituiu |
| `modulos/laboratorio/data/processos/proc_desinfetante_cloro_v1.json` | `referencias[1].nota` | RDC nº 67/2007 (ANVISA) | [NV] conferir vigência e alterações |
| `modulos/laboratorio/data/processos/proc_home_spray_v1.json` | `conferencia.nota` | Home spray (aromatizador de ambiente) | [NV] Valores numéricos, faixas de critério, tolerâncias e citações de norma a conferir com a fonte primária (edição e artigo vigentes) antes de publicar. |
| `modulos/laboratorio/data/processos/proc_home_spray_v1.json` | `referencias[0].nota` | RDC nº 59/2010 (ANVISA), produtos saneantes | [NV] conferir título, vigência e norma que a substituiu |
| `modulos/laboratorio/data/processos/proc_home_spray_v1.json` | `referencias[1].nota` | RDC nº 67/2007 (ANVISA) | [NV] conferir vigência e alterações |
| `modulos/laboratorio/data/processos/proc_nacl_09_v1.json` | `conferencia.nota` | Solução de cloreto de sódio a 0,9 % (p/v) | [NV] Valores numéricos, tolerâncias e campos de rótulo a conferir com fonte primária (Formulário Nacional, norma vigente) antes de publicar. |
| `modulos/laboratorio/data/processos/proc_nacl_09_v1.json` | `referencias[0].nota` | Formulário Nacional da Farmacopeia Brasileira (edição vigente) | [NV] conferir a monografia e a forma de citação |
| `modulos/laboratorio/data/processos/proc_pomada_zno_v1.json` | `conferencia.nota` | Pomada de óxido de zinco a 10 % (p/p) | [NV] Valores numéricos, faixas de critério, tolerâncias e citações de norma a conferir com a fonte primária (edição e artigo vigentes) antes de publicar. |
| `modulos/laboratorio/data/processos/proc_pomada_zno_v1.json` | `referencias[0].nota` | Formulário Nacional da Farmacopeia Brasileira (edição vigente) | [NV] conferir a monografia e a forma de citação |
| `modulos/laboratorio/data/processos/proc_pomada_zno_v1.json` | `referencias[1].nota` | RDC nº 67/2007 (ANVISA) | [NV] conferir vigência e alterações |
| `modulos/laboratorio/data/processos/proc_sabonete_liquido_v1.json` | `conferencia.nota` | Sabonete líquido com ajuste de pH e viscosidade | [NV] Valores numéricos, faixas de critério, tolerâncias e citações de norma a conferir com a fonte primária (edição e artigo vigentes) antes de publicar. |
| `modulos/laboratorio/data/processos/proc_sabonete_liquido_v1.json` | `referencias[0].nota` | RDC nº 48/2013 (ANVISA), boas práticas de fabricação de cosméticos | [NV] conferir título e vigência |
| `modulos/laboratorio/data/processos/proc_sabonete_liquido_v1.json` | `referencias[1].nota` | RDC nº 67/2007 (ANVISA) | [NV] conferir vigência e alterações |
| `modulos/laboratorio/data/processos/proc_sf09_esteril_v1.json` | `conferencia.nota` | Soro fisiológico a 0,9 % estéril (esterilização terminal) | [NV] Valores numéricos, faixas de critério, tolerâncias e citações de norma a conferir com a fonte primária (edição e artigo vigentes) antes de publicar. |
| `modulos/laboratorio/data/processos/proc_sf09_esteril_v1.json` | `referencias[0].nota` | Farmacopeia Brasileira (edição vigente), esterilização e esterilidade | [NV] conferir método e critério |
| `modulos/laboratorio/data/processos/proc_sf09_esteril_v1.json` | `referencias[1].nota` | RDC nº 67/2007 (ANVISA) | [NV] conferir vigência e alterações |
| `modulos/laboratorio/data/processos/proc_suspensao_mgoh2_v1.json` | `conferencia.nota` | Suspensão oral de hidróxido de magnésio a 8 % (p/v) | [NV] Valores numéricos, faixas de critério, tolerâncias e citações de norma a conferir com a fonte primária (edição e artigo vigentes) antes de publicar. |
| `modulos/laboratorio/data/processos/proc_suspensao_mgoh2_v1.json` | `referencias[0].nota` | Formulário Nacional da Farmacopeia Brasileira (edição vigente) | [NV] conferir a monografia e a forma de citação |
| `modulos/laboratorio/data/processos/proc_suspensao_mgoh2_v1.json` | `referencias[1].nota` | RDC nº 67/2007 (ANVISA) | [NV] conferir vigência e alterações |
| `modulos/laboratorio/data/processos/proc_vitc_filtrada_v1.json` | `conferencia.nota` | Solução de ácido ascórbico a 5 % estéril por filtração | [NV] Valores numéricos, faixas de critério, tolerâncias e citações de norma a conferir com a fonte primária (edição e artigo vigentes) antes de publicar. |
| `modulos/laboratorio/data/processos/proc_vitc_filtrada_v1.json` | `referencias[0].nota` | Farmacopeia Brasileira (edição vigente), esterilização e esterilidade | [NV] conferir método e critério |
| `modulos/laboratorio/data/processos/proc_vitc_filtrada_v1.json` | `referencias[1].nota` | RDC nº 67/2007 (ANVISA) | [NV] conferir vigência e alterações |
| `modulos/laboratorio/data/processos/proc_xarope_simples_v1.json` | `conferencia.nota` | Xarope simples a 85 % (p/v) | [NV] Valores numéricos, faixas de critério, tolerâncias e citações de norma a conferir com a fonte primária (edição e artigo vigentes) antes de publicar. |
| `modulos/laboratorio/data/processos/proc_xarope_simples_v1.json` | `referencias[0].nota` | Formulário Nacional da Farmacopeia Brasileira (edição vigente) | [NV] conferir a monografia e a forma de citação |
| `modulos/laboratorio/data/processos/proc_xarope_simples_v1.json` | `referencias[1].nota` | RDC nº 67/2007 (ANVISA) | [NV] conferir vigência e alterações |
