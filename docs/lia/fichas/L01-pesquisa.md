# L01: Pesquisa (bases científicas e seleção "jev"/reranker), só documentos

**Objetivo.** Confirmar, na documentação oficial, o que o `docs/lia/PLANO.md` (§2 e §3) traz como prévia, para que L05 e L07 implementem sem chutar. Não escreva código.

**Passo 0.** Leia `docs/lia/PLANO.md` (§2.3, §2.4, §3), `docs/F4_DECISOES_JURIDICAS.md` (linhas 103-121), `docs/backlog-futuro.md` (seção "Lia e RAG") e `worker/src/services/ragService.js` (formato dos trechos: `{id, source, section, content, score}`).

**Arquivos-donos (novos).** `docs/lia/pesquisa/BASES.md` (até 90 linhas) e `docs/lia/pesquisa/SELECAO.md` (até 70 linhas).

**Requisitos: BASES.md.** Uma tabela e um parágrafo por base: PubMed E-utilities, Europe PMC REST, OpenAlex, SciELO (ArticleMeta ou busca) e BVS/LILACS + DeCS. Para cada uma:
1. Tamanho do acervo e cobertura em português.
2. Autenticação: precisa de chave? Quem é o titular?
3. Limite de taxa, custo e o que acontece quando o limite estoura.
4. Licença e termos: o que se pode guardar e exibir (metadados, resumo) e se há exigência de atribuição.
5. **Endpoint exato** de busca que devolva só metadados (URL, parâmetros, exemplo de resposta com os campos título, revista, ano, PMID/PMCID/DOI e link).
6. Se aceita chamada de servidor (Worker) e se guarda IP ou registros de acesso.

Feche com a **recomendação de v1** (o plano sugere Europe PMC com `resultType=lite`; confirme ou corrija), a lista branca de hosts dos links e uma estratégia para termos em português (DeCS, ou deixar para a v2).

**Requisitos: SELECAO.md.**
1. **Jev (TypeSafe AI)**: página e documentação oficiais, se houver; formato da API (direta, OpenRouter e Vercel AI Gateway; id do modelo; como mandar pergunta e trechos e o que volta: probabilidades, "answerability", injeção); preço; retenção e uso dos dados para treino; região; status do acesso antecipado; termos para uso em saúde e educação.
2. **Rerankers na Workers AI**: ids dos modelos disponíveis hoje, idiomas (o `@cf/baai/bge-reranker-base` atende português?), formato de entrada e saída de `env.AI.run`, escala da nota (logit ou 0–1) e custo em neurônios.
3. Uma linha cada para G-Eval, JEPA/GEPA e EmbeddingGemma: o que fariam pela Lia.
4. Recomendação: o modelo do provedor inicial de L05 e o método de calibração do limiar no staging com `worker/test/fixtures/rag-eval.json`.

Todas as afirmações levam **URL e data de acesso**. Marque como "não confirmado" o que só aparece em fonte secundária. Não cadastre conta, não aceite termos e não baixe arquivos.

**Aceite (comando).**
```powershell
cd "C:\Users\Administrador\Desktop\plataforma membro"; (Select-String -Path docs/lia/pesquisa/BASES.md,docs/lia/pesquisa/SELECAO.md -Pattern 'https://').Count; (Get-Content docs/lia/pesquisa/BASES.md).Count; (Get-Content docs/lia/pesquisa/SELECAO.md).Count
```
Esperado: pelo menos 12 URLs e cada arquivo dentro do teto de linhas.

**Regras.** Sem git; sem banco, sem flag e sem segredo; português do Brasil; LF. GateGuard: se o hook pedir fatos na primeira criação de um arquivo, escreva 2 linhas (quem usa o arquivo: L05, L07 e o dono; a instrução: "pesquisa de viabilidade, limites, licença e custo") e repita a mesma chamada.

**Relatório (até 12 linhas).** Recomendação de v1 (base e endpoint), o modelo de reranker escolhido, o que ficou "não confirmado" sobre o Jev, URLs-chave e as pendências para o dono.
