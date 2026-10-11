# Resumo: PLANO 4.0 — Biblioteca de Artigos LAIFT (LAIFT Library)

Fonte: `C:\Users\Administrador\Desktop\cortex\PLANO 4.0 — Biblioteca de Artigos LAIFT (LAIFT Library).md` (1114 linhas)

**Propósito**
Acervo público e curado de artigos sobre farmacologia, toxicologia e interações, alimentado pelas consultas do Córtex. Metadados no Neon (PostgreSQL), PDFs no 9Drive, API FastAPI em /api/library e aba "Biblioteca" no app Flutter.

**Arquitetura e componentes**
- Schema Neon: 13 tabelas (articles, authors, journals, keywords, queries, citations, collections e tabelas pivô), views article_summary e topic_stats, função search_articles (tsvector 'portuguese' + GIN).
- persistence_node no LangGraph: grava artigos e registra cada consulta.
- NeonClient (psycopg3 + pool) e ArticleRepository em src/db/.
- NineDriveClient (httpx + tenacity), upload via POST /api/v1/uploads.
- Endpoints /api/library: articles, search, keywords, topics, ingest, collections.

**Serviços externos, modelos e custos citados**
- Neon Free Tier: 100 projetos, 1 GB cada (citado, não verificado).
- 9Drive: contas Google Drive de 15 GB agregadas (citado, não verificado). Alternativa: Neon Object Storage de 5 GB por projeto (citado).
- Fontes de artigos: PubMed, SciELO, ANVISA, manual. IDs OpenAlex e ORCID. Schema "inspirado" no DBLP Augmented (Zenodo, 2026): não verificado.
- Nenhum modelo de IA neste plano. Custo declarado: zero.

**Infraestrutura exigida**
Neon PostgreSQL 16+ (DATABASE_URL); 9Drive (NINEDRIVE_URL, NINEDRIVE_API_KEY); servidor FastAPI; app Flutter; download de PDFs de PubMed e SciELO.

**Fontes de artigos e direitos autorais/licenças**
- Atribuição: autores, DOI, revista e ano são preservados; ações Ler, Salvar e Citar (ABNT/APA).
- Licença: o plano não define política de licença, nem campo de licença ou acesso aberto no schema.
- PDFs: a seção 5.3 baixa PDFs de PubMed/SciELO e sobe ao 9Drive quando há pdf_url, sem checagem de direitos.
- Curadoria: "só metadados completos entram no acervo público", mas nenhum código seta is_public = TRUE; a persistência grava tudo com is_public FALSE.
- A dúvida 4 pergunta sobre direitos autorais de PDF, mas o upload já está no fluxo. LGPD não é citada.

**Riscos e contradições**
- Bug: ON CONFLICT (name) em authors e journals, sem UNIQUE(name) no schema. O INSERT falha e persistence_node registra warning e pula o artigo.
- persistence_node cria NeonClient() novo a cada execução, sem close, em vez do singleton existente.
- update_drive_info e download_pdf são chamados e não definidos.
- Busca em 'portuguese' com artigos de PubMed em inglês (language default 'en').
- POST /articles/ingest e /collections sem autenticação descrita; user_id solto.
- Consultas (possivelmente dados de saúde) gravadas com user_id, sem regra de consentimento.
- ILIKE sem escape de % e _; upsert faz várias queries por autor e palavra-chave.
- Conflito com a Prova de Fogo 2.0: lá, offline-first com aba "Explorar"; aqui, depende de Neon e 9Drive online, com aba "Biblioteca".

**Decisões abertas**
1. Dúvida 1 do plano: 9Drive já está deployado com API key, ou usamos Neon Object Storage?
2. Dúvida 2: quem faz a curadoria dos 500 artigos iniciais?
3. Dúvida 3: a interface será no app Flutter ou no site LAIFT?
4. Dúvida 4: há restrição de direitos autorais para PDFs (guardar o arquivo ou só o link)?
5. Consultas dos alunos podem ser salvas com user_id? Qual consentimento e base LGPD?
6. Quem define is_public = TRUE, e com que critério?
7. Quem autoriza ingestão e coleções (autenticação)?
