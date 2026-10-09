# L07: Pesquisa externa ("pesquisar mais a fundo"), adaptador e serviço atrás de `research_enabled`

**Objetivo.** Deixar a Lia buscar referências científicas numa base externa grande (v1: Europe PMC, que cobre o PubMed sem chave; confirme em L01), mandando **só termos gerais**, guardando no registro (L04) apenas metadados e link e devolvendo um texto fixo, nunca gerado por IA. Desligado por padrão. Só liga depois do OK jurídico (Política, seção 5).

**Passo 0.** Leia:
- `docs/lia/pesquisa/BASES.md` (de L01): endpoint, parâmetros, campos, limite e hosts. Se o arquivo não existir, use `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=<termos>&format=json&pageSize=5&resultType=lite` e marque a hipótese;
- `worker/src/services/researchLogService.js` (de L04: `lookup`, `record`, `sanitizeResults`, `RESEARCH_LOG`);
- `worker/src/ai/semanticCache.js` (`isCacheable`, `normalizeQuestion`);
- `worker/src/security.js` (`enforceRateLimit(sql, bucket, identificador, max, janelaSeg)`);
- `worker/src/services/featureFlagService.js` (`isEnabled`);
- `worker/src/logging.js`;
- `docs/F4_DECISOES_JURIDICAS.md:103-121`.

**Arquivos-donos (novos).** `worker/src/research/scholarlyClient.js`, `worker/src/services/researchService.js` e `worker/test/researchService.test.js`.

**Requisitos: `scholarlyClient.js`.**
- `searchEuropePmc(query, { fetchImpl = fetch, timeoutMs = 5000 })`: GET com `AbortController`, `encodeURIComponent` e cabeçalho `Accept: application/json`, sem cookie e sem dado da pessoa. Mapeia cada resultado para `{ title, journal, year, url, ids: { pmid, pmcid, doi } }`, com `url` = `https://europepmc.org/article/MED/<pmid>`, ou `https://doi.org/<doi>`, ou nenhuma. Lança `Error` curto quando o status não é 2xx, o tempo se esgota ou o JSON é inválido.
- `PROVIDERS = { europepmc: searchEuropePmc }`. O PubMed direto fica para quando houver chave institucional; não implemente.

**Requisitos: `researchService.js`.** Exporta `research(sql, env, identity, rawQuestion, correlationId)` e `buildQuery(rawQuestion)`.
1. `buildQuery` é pura. Recusa (`null`) o que falhar em `isCacheable`. Normaliza, remove as stopwords do português (lista local, cerca de 60 palavras), descarta termos com menos de 3 letras e termos repetidos, mantém até 8 termos e até 120 caracteres.
2. `research`:
   - flag `research_enabled` (`isEnabled`, falha fechada) → `{ success: false, disabled: true, message }`;
   - sem `identity` → `{ success: false, message: 'Entre na plataforma para pesquisar em bases científicas.' }`;
   - `buildQuery` nulo → resposta orientando a escrever só o tema, sem dado pessoal;
   - `lookup` no registro (provedor `europepmc`): se achar, devolve com `cached: true` **sem** chamar a rede nem gastar o limite;
   - sem acerto, `enforceRateLimit(sql, 'ASSISTANT_RESEARCH', identity.profileId, 10, 3600)` (constantes locais), depois o cliente e depois `record` (`answered`, ou `empty` sem itens);
   - falha do cliente → `Logging.logError(sql, cid, 'ASSISTANT_RESEARCH_FAILED', <mensagem curta sem os termos>, null)` e resposta honesta com `failed: true`.
3. Formato de retorno (contrato com L08 e L09):
   `{ success: true, source: 'research', reply: <texto fixo>, actions: [], suggestions: [], research: { provider: 'europepmc', query, cached, failed, items: [...] } }`.
   O `reply` diz quantas referências achou e traz o aviso "Referências de base externa; a Lia não resume artigos nem dá orientação de saúde."
4. Os itens passam por `sanitizeResults` antes de sair, mesmo quando vêm do cache.

**Teste (com `fetch` simulado, sem rede).**
- `buildQuery`: stopwords, limite de termos, recusa de PII e de instrução.
- Flag desligada.
- Pessoa anônima.
- Acerto no cache não chama `fetch`.
- Erro, tempo esgotado e JSON inválido levam a `failed`.
- Host de link fora da lista é removido.
- `record` chamado com `empty` quando a busca não traz nada.
- O texto da pergunta nunca aparece no log.

Use PGlite (`createMigratedDb`) ou um `sql` falso, como nos vizinhos.

**Aceite (comando).**
```bash
cd "C:/Users/Administrador/Desktop/plataforma membro/worker" && npm test -- -i test/researchService.test.js test/researchLogService.test.js
```

**Regras.** Sem git, sem banco de produção, sem flag e **sem chamada real à internet nos testes**. Nenhum segredo. Cabeçalho de copyright; LF; funções com menos de 50 linhas. GateGuard: se o hook pedir fatos, escreva 2 linhas (quem usa: `assistantService.chat` com `research: true`, ligado por L09; a instrução: "integrarmos outro sistema de pesquisa nela, algo bem maior", PubMed/NCBI pela F4 (d)) e repita a mesma chamada.

**Relatório (até 12 linhas).** O endpoint usado e a fonte dele, o contrato de retorno, os casos de teste, o resultado do aceite e as pendências jurídicas para ligar a flag.
