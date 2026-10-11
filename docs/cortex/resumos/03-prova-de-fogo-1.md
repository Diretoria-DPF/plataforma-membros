# Resumo 03: PROVA DE FOGO 1 (Análise Brutal do LAIFT-Córtex)
Fonte: cortex\PROVA DE FOGO — Análise Brutal do LAIFT-Córtex.md (232 linhas)

## Propósito
Avaliação crítica do Córtex (multiagente em nuvem), que conclui ser um protótipo de pesquisa, não um produto. Propõe troca de paradigma: app Flutter offline-first com LLM local e base curada local, com o backend Python como serviço assíncrono de enriquecimento.

## Arquitetura e componentes
- App Flutter com 4 abas: Chat, Explorar, Praticar, Progresso.
- LLM on-device: Gemma 3 1B INT4 via LiteRT-LM (flutter_litert_lm).
- Embeddings: all-MiniLM-L6-v2 (TFLite, ~80 MB). Banco vetorial: mobile_rag_engine (HNSW).
- Cache local: SQLite ou ObjectBox. Sync opcional: Europe PMC e medical-mcp.
- Córtex Python mantido só para casos complexos, em modo não bloqueante.

## Serviços externos, modelos e custos citados
- Groq plano gratuito: 14.400 req/dia e 500.000 tokens/dia. Citado no texto; não verificado.
- Consumo estimado de 8.000–15.000 tokens por artigo; 33 artigos/dia para estourar o limite (cálculo do texto).
- Custo: $0.003–$0.010 por artigo (estimativa; o próprio texto admite que assume zero rate limit); $0.20–$0.30 no mês 1; $5–$10/dia com 50 estudantes. Estimativas, não verificadas.
- Gemma 3 1B: 529 MB (INT4 ~300 MB); 2.585 tokens/s em prefill. Não verificado.
- Europe PMC "40M+ artigos, sem rate limit"; 77% migram para ChatGPT; 79% das falhas são de especificação; TinyLlama com 1,35 min. Não verificado.

## Infraestrutura exigida
- Android como plataforma primária; iOS só com CPU e funções reduzidas.
- Armazenamento para o modelo (~300–529 MB), embeddings (~80 MB), base vetorial e cache.
- RAM mínima: não especificada. NPU/GPU (OpenCL, Qualcomm HTP) opcional, com fallback para CPU.
- Backend Python assíncrono. Local de execução do medical-mcp não definido.

## Riscos e contradições
- Escopo: em 4 semanas, 500 artigos processados, LLM on-device, RAG e UI de 4 abas. Muito ambicioso.
- Público-alvo: estudantes aqui; pacientes e público geral no arquivo 01; vários públicos no arquivo 02.
- Descarta Groq e NCBI, mas o backend "para casos complexos" ainda depende de Groq. Custo "zero" é parcial.
- Meta de "<3 s" no chat: o dado de 2.585 tok/s é de prefill; a velocidade de geração não é citada.
- 62% e 62,76% de interações em mobile: números diferentes no mesmo texto.
- Metas D7 >40%, NPS >50 e migração <20% sem linha de base medida.
- Licença para distribuir texto de artigos dentro do app não é tratada. Segurança clínica de um LLM de 1B com "checklist no prompt" não é avaliada.

## Decisões abertas
- Aceitar a troca de paradigma (offline-first) ou manter o Córtex em nuvem como núcleo?
- Nesta fase, somente Android?
- Público: estudantes, pacientes ou ambos?
- Quem cura a base de 500–1.000 artigos e qual a licença de uso?
- Orçamento aceitável do backend Groq após a mudança?
- Quem responde pela segurança clínica e pelo aviso de uso educacional?
- Onde roda o medical-mcp e qual sua dependência?
