# Revisão da entrega da Lia (commit 98ef51b, 2026-10-09)

Feita só por leitura do diff `HEAD~1..HEAD` (44 arquivos). Não rodei testes; a sessão principal rodou a suíte do Worker.
Aviso de processo: durante a revisão rodei por engano um `git add -N .` e desfiz na hora com `git reset -- <arquivos novos>`, antes do commit. O commit 98ef51b traz os 44 arquivos esperados (conferido em `git show --stat`).

## CRÍTICO: nenhum.

## IMPORTANTE (corrigir antes do PR)
1. **A versão da base vem do código, não do que está indexado** (`worker/src/services/assistantService.js:283-298`).
   - Risco: entre o deploy e a reindexação, respostas e lacunas (`empty`) são gravadas sob a versão nova, mas refletem o banco antigo, e ficam 30 dias. Exemplo: com `rag_cache_enabled` ligada, pergunta sobre o conteúdo novo grava `empty` e continua recebendo "Não encontrei…" mesmo depois de reindexar.
   - Correção (L09): `kbVersionOnce(sql)` lê o banco, com memória de 60 s por isolate: `SELECT coalesce(md5(string_agg(content_hash, ',' ORDER BY source, section)), '') AS v FROM kb_chunks`, cortado em 16 caracteres. Se a leitura falhar, não usa o registro (`logOn = false`). Com rerank ligado, acrescentar `':r'` à versão, porque o `empty` por `answerable=false` depende do limiar. Teste: mudar um `content_hash` muda a versão.
2. **Desligar a pesquisa derruba a Lia inteira na tela**.
   - Onde: `researchService.js:134` devolve `disabled: true`; `frontend/assistant.js:520` trata `disabled` com `hideLauncher()`.
   - Risco: o cache de flags dura 60 s por isolate. No rollback de `research_enabled` (justamente quando o admin desliga), quem clica no botão perde o lançador da Lia até recarregar a página.
   - Correção: na linha 134, devolver `{ success: false, researchDisabled: true, message: MSG.DISABLED }` e trocar `disabled` por `researchDisabled` em `researchService.test.js:93` e `assistantService.test.js:893`. O front já cai em `failReply(message)`.
3. **O próprio PR deixou um fato da base desatualizado** (`worker/src/assistant/docsConteudo.js:26`).
   - Risco: a base diz "49 arquivos", mas o `sw.js` agora tem 50 (entrou `assistant-research.js`). O post `frontend/blog/conteudo/plataforma.json:78` também diz 49.
   - Correção: tirar o número. Texto: "Os arquivos principais do app (estilos, scripts, a Lia, o ícone e a tela de abertura) ficam guardados no aparelho." O blog fica para o dono decidir (mesma troca, ou 50).
4. **"Em revisão" na base da Lia** (`docsConteudo.js:76`, `:83-84`, `:123-124`).
   - Contexto: o dono não quer o termo, e a Lia responde a perguntas diretas. A saída é dizer o que é verdade sem inventar aprovação (FATOS, linha 112: 0 fichas do Atlas revisadas).
   - `:76`, trocar "A regra está em revisão pela diretoria." por "Confira as condições no edital publicado pela diretoria na página da Liga."
   - `:83-84`, trocar por `## Edital 2026: onde conferir as regras` e "As regras oficiais do processo seletivo são as publicadas pela diretoria na página da Liga e no Instagram @laift.liga. A Lia não apresenta como definitiva uma regra que ainda não foi publicada. Vagas e datas: a definir pela diretoria."
   - `:123-124`, trocar por `## Atlas 3D: apoio ao estudo` e "O Atlas 3D é apoio ao estudo. As fichas das estruturas ainda não foram conferidas por profissional com registro: use junto com o livro-texto e a aula, e não como fonte única."
   - Nenhuma dessas seções está no golden set (conferido), então o `ragEval` não muda.

## MENOR
5. **Tabela vazia ainda gasta uma busca por pergunta** (`assistantService.js:324-327`). Enquanto a tabela estiver vazia, cada pergunta faz 1 embedding e 2 consultas antes de `hasIndexedChunks`. Correção: checar antes da busca, com memória de 60 s. Além disso, usar `asDegradedIfNotAi(await askAi(...))` na linha 327, para que "IA fora" saia marcado como degradado, como nos outros caminhos.
6. **Hosts da lista branca: decisão.** A v1 fica com `['europepmc.org', 'pubmed.ncbi.nlm.nih.gov', 'doi.org']` (`BASES.md:18`), igual em `researchLogService.js:32` e `assistant-research.js:32`. Saem `www.ebi.ac.uk`, `www.scielo.br`, `scielo.org` e `openalex.org`: cada provedor acrescenta o seu host quando o adaptador dele entrar. Ajustar os testes que citam os hosts removidos.
7. **O aviso de privacidade aparece depois do envio** (`frontend/assistant.js:505-520`): `offerPrivacyHint` roda depois que os termos já saíram. Correção: no primeiro clique, mostrar o aviso e o botão de novo, sem chamar a API. O servidor já filtra com `isCacheable`, por isso fica como MENOR.
8. **Nome próprio isolado passa no filtro** (`researchService.buildQuery`): "intoxicação da Maria" vira "intoxicacao maria" e vai para a Europe PMC. Correção: antes de normalizar, descartar as palavras com maiúscula que não estejam no início da frase.
9. **Fraqueza destacada demais** (`docsConteudo.js:97-98`): a pergunta frequente "O QR do crachá tem validade? Não." facilita presença por print. Correção: remover o item e manter a menção geral em "Limites conhecidos" (`:31-32`), que o blog já declara (O14). Tirar também o detalhe dos 13 px (`:30`), que é QA interno.
10. **Comando de erros incompleto** (`docs/AMBIENTES.md:399`): a consulta de erros deve incluir `ASSISTANT_RESEARCH_FAILED` e `ASSISTANT_RAG_EMBEDDING_FAILED`. Preferir ligar as flags pelo painel: o token no `curl` aparece na lista de processos.
11. **Sem teto de tamanho para `results`** (`sql/026_lia_pesquisas.sql:29`): o código já limita, mas, como a 026 ainda não foi aplicada, dá para acrescentar de graça `CHECK (pg_column_size(results) <= 16384)`.
12. **`ux.css` (arquivo quente) foi alterado fora das fichas** (hero em 375 px). A mudança está sob `data-flag-ux-v2-enabled`. Rodar `node scripts/e2e/run.js hero-ux2` de novo depois do merge.

## Verificações por tema
- **(1) Flags desligadas.**
  - `ragService.retrieve` sem `rerank` não mudou (`ragService.js:117-118`).
  - No `assistantService` só houve mudanças deliberadas: (a) tabela vazia → IA sem RAG; (b) um `SELECT 1` a mais quando a busca não acha nada; (c) três leituras de flag a mais, com cache de 60 s.
  - No front, os rótulos das fontes mudam mesmo com as flags desligadas, de propósito (pedido 5). O resto só aparece com os campos novos.
- **(1) Tabela vazia (`hasIndexedChunks`).** O comportamento está correto: equivale a `rag_enabled` desligada, e um erro na checagem cai na mensagem fixa (lado seguro).
  - Cota: o membro gasta 1 pergunta de IA por pergunta aberta, como antes do RAG. Não é gasto acidental: antes da mudança ele recebia uma resposta inútil sem gastar cota.
  - Ficam valendo o cache semântico, a cota diária e o orçamento de 450 mil tokens.
  - Risco residual: a resposta sai sem base (a IA pode errar sobre a plataforma). Isso termina na reindexação.
- **(2) LGPD e segurança: OK.**
  - O registro não guarda `profile_id`, só aceita o que passa por `isCacheable` e sanitiza nas duas pontas.
  - Saem do servidor só os termos (até 8) com `SRC:MED`; a Europe PMC vê o IP do Worker, não o da pessoa.
  - Limite de 10 pesquisas por hora depois do cache, timeout de 5 s, log de erro sem os termos.
  - No front: sem `innerHTML`, link só https da lista branca, `rel="noopener noreferrer"`.
- **(3) Conteúdo novo.** 73 trechos (35 antigos + 38 novos). Os fatos têm fonte em `FATOS_VERIFICADOS` ou no `kb.js`. Os avisos de saúde são coerentes: sem dose nem conduta, procurar atendimento. Fora isso, só os itens 3, 4 e 9.
- **(4) Migração 026.**
  - Idempotente: `IF NOT EXISTS` e restrições declaradas dentro do `CREATE`.
  - Índices: GIN trigrama e `expires_at`. O down apaga a tabela e a linha do ledger.
  - Retenção pela validade (30 e 7 dias) com limpeza diária.
  - Numeração: a `main` não tem 025, e a branch da F4 tem `025_shared_assets.sql`. Proposta: Lia = 026, F4 = 025, inscrição nativa = 027. O runner aplica o que falta no ledger, então a 025 depois da 026 não dá problema (tabelas independentes). Corrigir `TIME_CONTRATO.md:20,45`.
- **(5) Calibração.** `rag_rerank_enabled` fica **desligada**. O `bge-reranker-base` não tem português confirmado (`SELECAO.md:17-18`), e ligar com limiares `null` só reordena, o que pode tirar a seção certa do top 4.
  - Falta uma ficha de calibração (L11): script no staging (Neon de homologação + Workers AI pela API REST, com token que o dono digita) que rode `rag-eval.json` com e sem rerank, meça o recall@4 e os falsos positivos e proponha `ANSWERABLE_MIN`, `MIN_SCORE` e `MIN_VECTOR_SCORE` (O36). Só liga se o recall não cair.
  - Religar `rag_enabled` só depois que a reindexação mostrar `total` 73, `embedded` 73 e `embeddingAvailable: true`, com `rollout_pct = 100` e `conditions = {}` (para o cron).
- **(6) Fim de linha.** Os blobs estão em LF (0 CR nos arquivos conferidos). Na cópia de trabalho há CRLF (`core.autocrlf=true`) misturado com LF (arquivos dos agentes), e o git normaliza, então o diff não fica sujo. Sugestão para um PR separado: `.gitattributes` com `* text=auto eol=lf`.
- **(7) Para depois.**
  - Jev (ficha J2): pré-requisitos são o dono confirmar o nome, a Política citar a TypeSafe e o OpenRouter (EUA), a chave como segredo do Worker e um teto de custo. A API está em `SELECAO.md:7`, e answerability e injeção não estão confirmadas.
  - PubMed direto, quando houver chave institucional.
  - OpenAlex e SciELO/DeCS na v2.
  - Painel de lacunas no admin.

## Veredito
PR: **sim, depois dos itens 1 a 4.** Os itens 5 a 12 podem ir no mesmo PR ou no seguinte.
Ordem em produção: (1) mesclar e publicar; (2) reindexar pelo painel e conferir 73/73/true; (3) religar `rag_enabled` (100%, sem condições); (4) aplicar a 026 (simulação, depois aplicação); (5) ligar `rag_cache_enabled` e observar 24 h; (6) `rag_rerank_enabled` só depois do L11; (7) `research_enabled` só depois do OK jurídico, primeiro só admin, depois todos.
