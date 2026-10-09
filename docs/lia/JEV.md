# Jev (TypeSafe AI) na Lia: intenção e roteiro

Registrado em 2026-10-09. **Nada disto está implementado.** É a intenção do dono, guardada para qualquer chat retomar.
Fatos pesquisados (API, preço, retenção, acesso): `docs/lia/pesquisa/SELECAO.md` §1. Plano da Lia: `docs/lia/PLANO.md` §3.

## 1. Decisão do dono (2026-10-09)
- "jev" é o **Jev, da TypeSafe AI** (identidade confirmada pelo dono).
- O dono diz que há **modelos em formato gratuito no GitHub**. Isso **não foi verificado**: falta achar o repositório, a licença, o
  tamanho e o suporte a português.
- Quer usar **a arquitetura ou o próprio serviço** para a plataforma ter "uma direção maior, uma linha de raciocínio maior" do que o
  LLM que a Lia usa hoje.
- Por ora: **só registrar**. Integrar no futuro, depois de verificar as possibilidades.

## 2. O que já existe no código para receber o Jev
- `worker/src/services/rerankService.js`: camada de seleção **neutra de provedor** (hoje só `workers-ai`, modelo
  `@cf/baai/bge-reranker-base`). Foi escrita para aceitar outro provedor sem mexer no resto.
- Flags desligadas por padrão, entregues na PR #46: `rag_rerank_enabled`, `rag_cache_enabled`, `research_enabled`.
- `lia_pesquisas` (migração 026, ainda não aplicada): registro das pesquisas por versão da base; serve para medir o Jev contra a base atual.
- `worker/test/fixtures/rag-eval.json` (56 casos, recall@4 0,738, 0 falsos positivos): é a régua para comparar qualquer seleção nova.

## 3. Três caminhos possíveis (escolher depois de verificar)
| Caminho | O que é | Prós | Contras |
|---|---|---|---|
| A. Serviço | Chamar a API do Jev (`POST https://api.typesafe.ai/v1/systemone`, direto, via OpenRouter ou Vercel AI Gateway) | Rápido de ligar; calibrado; preço baixo segundo o fornecedor | Operador novo nos EUA; chave; Política §5; preço e retenção por confirmar |
| B. Modelo aberto | Rodar o modelo do GitHub em host próprio | Dados não saem do nosso controle | Workers não roda modelo grande; exige servidor; manutenção; custo fixo |
| C. Só a arquitetura | Copiar a ideia ("estado + perguntas objetivas com probabilidade") usando o LLM atual | Sem terceiro novo; sem custo de operador | Menos calibrado; mais chamadas ao LLM |

## 4. Usos concretos (do mais barato ao mais ambicioso)
1. **Rerank e "dá para responder?"** depois da busca híbrida (`answerable`), antes de chamar o LLM.
2. **Roteador de intenção**: a pergunta é de saúde? exige fonte? tem tentativa de injeção? é do escopo da Liga?
3. **Decidir se vale pesquisar fora** (Europe PMC) ou se a base já cobre.
4. **Moderação de segunda camada** sobre o que a moderação atual deixar passar.
5. **Linha de raciocínio maior**: quebrar a pergunta em sub-perguntas objetivas (`choice`, `score`, `noul`), decidir com probabilidade e
   só então pedir ao LLM a síntese com as fontes. É a ideia de "ver mais longe" que o dono pediu.

## 5. Verificar antes de qualquer código (checklist para o próximo chat)
- [ ] Ler `https://docs.typesafe.ai` e `https://console.typesafe.ai` (hoje só o quickstart foi lido): preço, retenção, treino, região, termos para saúde e educação, lista de espera.
- [ ] Procurar o que é aberto: `gh search repos typesafe jev`, `gh search code`, Hugging Face. Anotar licença, tamanho, idiomas, se roda em CPU.
- [ ] Confirmar se "answerability" e sinal de injeção existem (o `noul`, pergunta de 0 a 1, pode servir).
- [ ] Testar em **staging** com o golden set: meta = recall@4 ≥ 0,738 e 0 falsos positivos; medir latência e custo por pergunta.
- [ ] Testar em português do Brasil (o reranker atual também não confirma PT).
- [ ] Decidir A, B ou C e registrar a decisão e a data aqui.

## 6. Pré-requisitos do dono e do jurídico (se for A)
- Política de Privacidade §5: citar TypeSafe (e OpenRouter, se for o caminho) como operador nos EUA, com retenção.
- Chave como **segredo do Worker** (`wrangler secret put <NOME>`), nunca em arquivo nem no chat.
- Teto de custo mensal.
- Regra técnica: antes de enviar, a pergunta passa por `isCacheable` (sem dado pessoal, sem instrução); nunca enviar id de pessoa.

## 7. Ficha J2 (esboço do adaptador, só depois do OK)
- Dono: Haiku 5.5, ≤ 3 arquivos: `worker/src/services/rerankService.js` (provedor `'jev'`), `worker/src/research/jevClient.js` (novo, `fetch` com
  timeout, sem retry em loop), `worker/test/jevClient.test.js`.
- Flag nova `jev_enabled`, **desligada**; se falhar ou estourar o tempo, cai no `workers-ai` e, depois, na fusão RRF (a Lia nunca fica sem resposta).
- Aceite: `cd worker && npm test -- -i` verde; teste do golden set; nenhum segredo no diff.
- Ligar a flag: só o dono, em staging primeiro, depois produção, com a PR de Política mesclada.

## 8. Como retomar
Abra um chat novo no repositório e diga: "Leia `docs/CONTINUIDADE.md` e `docs/lia/JEV.md` e continue pelo checklist da seção 5; Opus 5.5
orquestra, Haiku 5.5 executam."
