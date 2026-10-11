# Operação em lote da Biblioteca LAIFT

Cadastra muitos artigos de uma vez usando o próprio serviço de curadoria do Worker (papéis, limites de taxa, duplicidade, versão e auditoria valem como na tela). A ferramenta **nunca aprova, publica nem marca resumo como revisado**: tudo fica em `em_triagem`.

## Antes de rodar

Na raiz do repositório, com `cd worker && npm ci` feito uma vez. As variáveis ficam só no ambiente (nada é impresso nem gravado):

```powershell
$env:DATABASE_URL = "<url do Neon>"
$env:LIBRARY_CONTACT_EMAIL = "<seu e-mail de contato>"   # só para importar
```

Todo comando leva a sua identidade: `--perfil <uuid do seu perfil admin> --nome "Seu Nome"` (o perfil precisa existir).

## Comandos

```
node tools/library/lote.mjs importar --arquivo candidatos.json [--simular] --perfil <uuid> --nome "Nome"
node tools/library/lote.mjs exportar [--estado em_triagem] --saida abstracts.json --perfil <uuid> --nome "Nome"
node tools/library/lote.mjs resumos --arquivo resumos.json [--simular] --perfil <uuid> --nome "Nome"
node tools/library/lote.mjs fila --perfil <uuid> --nome "Nome"
```

1. **importar** lê `[{ "doi": "10.1371/...", "areas": ["toxicologia"] }]` (áreas: `farmacologia-clinica`, `toxicologia`). Cadastra cada DOI e define as áreas. Grava `relatorio-importar.json` (importados, duplicados, falhas com motivo, avisos de licença/conflito, pendentes) e `<arquivo>.estado.json`. `--simular` só confere DOIs, áreas e duplicatas no banco, sem chamar as fontes (relatório `relatorio-importar-simulacao.json`). `--pausa <ms>` muda a pausa entre itens (padrão 1000); `--refazer-falhas` tenta de novo os que falharam.
2. **exportar** grava, para cada artigo em triagem sem resumo, `{ id, version, doi, title, journal, year, type, isClinical, sourceAbstract }`. O `sourceAbstract` é só para quem redige o resumo: não vai para a tela do membro.
3. **resumos** aplica `[{ "id", "version", "summary", "isClinical"? }]`. Cada resumo precisa ter 3 a 5 frases curtas, até 1200 caracteres, em português, sem termos de conduta/dose/interação; se tiver, o item precisa vir com `"isClinical": true` (vai para revisor clínico e aparece em `clinicos` no `relatorio-resumos.json`). Os textos entram como **resumo de IA** (`summary_origin = 'ia'`) e continuam barrados até um curador revisar. `--simular` só confere.
4. **fila** mostra o total por estado, quantos têm resumo e quantos são de IA.

## Limites e retomada

O serviço limita a importação a 60 por hora por perfil (200 por hora no total) e a curadoria a 300 ações por hora. Ao bater no limite a ferramenta para, grava o ponto e avisa (código de saída 3). Espere cerca de uma hora e rode **o mesmo comando**: o `.estado.json` pula o que já foi feito. Em `resumos`, rodar de novo ignora quem já tem resumo.

## Testes

```
node --test tools/library/lote-lib.test.mjs
```

Usam PGlite e fontes simuladas: sem rede e sem tocar em banco real.
