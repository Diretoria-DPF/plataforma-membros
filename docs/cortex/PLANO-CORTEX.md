# Plano LAIFT-Córtex: Biblioteca primeiro (v1, 2026-10-10)

Planejamento só: nada foi implementado. Base: os 11 documentos de `Desktop\cortex\`, resumidos em `docs/cortex/resumos/` (01 a 11), e 4 rodadas de
perguntas ao dono (2026-10-10). Plano de escala do banco: `ESCALA-BANCO.md`.

## 1. Decisões do dono (não reabrir sem motivo)
| # | Tema | Decisão |
|---|---|---|
| 1 | Público | Membros e estudantes da LAIFT primeiro; abrir a estudantes de saúde em geral depois |
| 2 | Primeira entrega | **Biblioteca de artigos** no site, com curadoria humana; o gerador de conteúdo (agentes) vem depois |
| 3 | Revisão humana | Automática **só para referências** (título, DOI, link, resumo curto marcado "gerado por IA"); texto que afirma conduta, dose ou interação é revisado por um revisor com nome e data |
| 4 | PDFs | Só quando a licença permitir (acesso aberto), registrando a licença; nos demais casos, link oficial e resumo próprio |
| 5 | Onde roda | Biblioteca no Cloudflare + Neon agora; o Python (LangGraph, CrewAI) só numa fase posterior |
| 6 | Custo | Teto R$ 0 para começar (camadas gratuitas); usar também a IA da Cloudflare (Workers AI) |
| 7 | Escala | Meta de **500 pessoas ao mesmo tempo**; banco em camadas: Neon principal, Neon de logs e D1 replicado para leitura pública |
| 8 | Curadoria | Curadores cadastram por DOI/PMID (a plataforma completa os dados); membros também podem sugerir, com aprovação |
| 9 | Acesso | Catálogo público (título, autores, link); resumo, coleções e favoritos só para membros |
| 10 | Lia | A Lia cita artigos aprovados da Biblioteca, com o botão "Ver na Biblioteca" |
| 11 | Resumo por IA | Workers AI como novo provedor do orquestrador, dentro do orçamento; o curador aprova antes de aparecer |
| 12 | Curadores | Diretoria Científica aprova referências; um professor orientador é o revisor clínico |
| 13 | Meta de lançamento | 50 a 100 artigos, uma área por vez (farmacologia clínica e toxicologia), com critério de inclusão escrito |

## 2. O que os planos antigos trazem, e o que fazemos com cada parte
| Do pacote antigo | Decisão | Por quê |
|---|---|---|
| Biblioteca (Plano 4.0): metadados, busca, citar | **Entra** (fase B), reescrita sobre o que já existe | Reaproveita Neon, Worker, busca e Lia. Corrige os erros do plano: `ON CONFLICT` sem `UNIQUE` (artigos se perdem em silêncio), `is_public` que nunca vira verdadeiro, sem campo de licença, busca em português para texto em inglês, rotas sem autenticação |
| 9Drive e PDFs de qualquer fonte | **Sai** | Sem direito de redistribuir; PDF só com licença aberta (guardado no R2, fase posterior) |
| LangGraph + CrewAI + AutoGen (Blocos 3 a 6) | **Adiado** (fase C) | Exigem servidor Python; código dos Blocos tem funções não definidas, limite de iterações fora das arestas e confiança autoavaliada pela mesma IA |
| App Flutter offline com LLM local (Prova de Fogo) | **Fora do escopo agora** | Troca de paradigma grande; metas de adoção sem linha de base |
| "Publicação automática" (Fase 3 do Órgão Híbrido) | **Sai** para conteúdo clínico | Entra em conflito com a revisão humana que o próprio plano exige |
| Patrocínio farmacêutico, pacientes virtuais, TTS e vídeo, consultoria | **Backlog**, só com parecer jurídico | PLs citados no próprio plano e conflito com curadoria independente |
| Números de limite (Groq, NVIDIA, OpenRouter, "custo zero") | **Não usar como fato** | Nenhum tem fonte; limites gratuitos mudam. Usar só números verificados (ver `ESCALA-BANCO.md`) |
| Terceiros recebendo dado de estudante | **Só com base legal** | LGPD não é tratada nos planos antigos; consulta de aluno não guarda `user_id` sem consentimento |

## 3. Biblioteca: o que construir
**Estados de um artigo:** `sugerido` → `em triagem` → `aprovado` → `publicado` (ou `rejeitado` / `removido`, sempre com motivo e auditoria).
**Papéis:** curador (Diretoria Científica), revisor clínico (professor orientador), membro (sugere), visitante (lê o catálogo).
**Cadastro:** o curador cola DOI ou PMID; o Worker busca título, autores, revista, ano, resumo original e licença no Crossref, PubMed e Europe PMC
(chamadas só pelo Worker); duplicata por DOI é recusada; a IA sugere resumo curto de 3 a 5 linhas, marcado "gerado por IA" até o aprovador revisar.
**Dados (Neon principal):** `library_articles` (doi único, título, ano, revista, idioma, tipo, `license`, `oa_status`, `landing_url`, estado, `approved_by`,
`approved_at`, `summary_text`, `summary_origin`), `library_authors` e `library_article_authors`, `library_topics`, `library_collections` e itens,
`library_suggestions`, `library_audit` (reaproveita `audit_logs`). **Regra:** só `publicado` aparece; `is_public` não existe, o estado decide.
**Leitura pública:** modelo de leitura enxuto no D1 (só `publicado`), com busca FTS5 e cache; resumo e coleções passam pelo Worker, que confere a sessão.
**Interface:** catálogo com busca e filtros (área, ano, tipo, "acesso aberto"); ficha do artigo (abrir link oficial, salvar, citar em ABNT e Vancouver);
membros: resumo, coleções, favoritos; admin: fila de triagem, aprovar, rejeitar, remover.
**Flags (todas nascem desligadas):** `library_enabled`, `library_member_suggest`, `library_ai_summary`, `lia_library_enabled`.
**Lia:** consulta só `publicado`; devolve até 3 referências com link; nunca inventa artigo; segue as regras de segurança da Lia (lista branca de botões, sem escrita).

## 4. Fases, ordem e critério de pronto
| Fase | O quê | Quem (equipe) | Pronto quando |
|---|---|---|---|
| **B0** Contrato (1 semana) | Critérios de inclusão por escrito, termos do "gerado por IA", RIPD curto, contrato técnico e fichas | Opus + dono | Dono aprova critérios e áreas do 1º lote |
| **B1** Dados e curadoria | Migração, serviço, ações do Worker, fila admin, busca no Neon, testes TDD | 1 Sonnet (Worker e migração) + Haiku (testes, docs) + Opus revisa | Testes verdes; cadastro por DOI e fila funcionam em staging; banco com backup antes da migração |
| **B2** Interface | Catálogo público, ficha, busca, citar, favoritos e coleções, SEO | Haiku (arquivos disjuntos) + sessão principal nos arquivos quentes | Portão visual aprovado (375 e 1280 px, claro e escuro); Lighthouse e axe sem regressão |
| **B3** Resumo por IA e revisão clínica | Provedor Workers AI no orquestrador, marca "gerado por IA", fluxo do revisor | 1 Sonnet + Haiku | Orçamento por modelo respeitado; nada clínico publica sem revisor |
| **B4** Lia e Biblioteca | Busca da Lia sobre `publicado`, botão "Ver na Biblioteca", testes de injeção | 1 Sonnet + Haiku | `ragEval` e corpus de injeção verdes; flag `lia_library_enabled` ligável por papel |
| **E1** Escala do banco (em paralelo a B2 e B3) | Ver `ESCALA-BANCO.md` | 1 Sonnet + Haiku | Gatilhos medidos no painel; teste de carga simulando o pico |
| **C** Agentes (Córtex Python) | Só depois de B1 a B4 em produção | A decidir | Nova rodada de perguntas sobre onde roda e custo real, com os números medidos da Biblioteca |

Cada fase tem flag desligada por padrão, rollback por flag, migração com `down`, branch de backup do Neon e PR com mescla do dono.

## 5. Riscos que valem decisão do dono
- **Números dos planos antigos não têm fonte** (RPM, latência, "custo zero", estudos citados). Só entram no plano quando verificados.
- **Limites gratuitos mudam sem aviso** (a Cloudflare já passou modelos de IA para o plano pago e passou a aplicar limites do D1 em 2026-09-01); o plano tem fallback e gatilho de pagamento (`ESCALA-BANCO.md` §5).
- **Direito autoral:** nada de PDF sem licença; o link leva ao site oficial.
- **LGPD:** buscas dos membros podem revelar interesse em saúde; guardar só agregados, sem `user_id`, e dizer isso na Política (versão sem mudar aceite: avaliar com jurídico).
- **Segurança clínica:** a IA só sugere resumo; afirmação de conduta, dose ou interação exige revisor; verificador e autor não são a mesma IA.
- **Sugestões de membros** abrem porta para spam e link malicioso: limite por hora, lista de domínios aceitos (DOI, PubMed, SciELO, Europe PMC), nada de HTML.

## 6. Do dono (não bloqueia B0)
1. Nomear a Diretoria Científica e o professor revisor clínico.
2. Escrever, com a diretoria, o critério de inclusão e as duas primeiras áreas.
3. Decidir o teto para depois do R$ 0 (gatilhos em `ESCALA-BANCO.md`).
4. Parecer jurídico: "gerado por IA" e Política (consultas de membros).

## 7. Perguntas ainda abertas (próximas rodadas)
Nome do módulo; taxonomia das áreas; formatos de citação além de ABNT e Vancouver; estrutura de coleções (por trilha, por evento); métricas de sucesso
(uso por membro, citações da Lia, tempo de aprovação); relação com `docs/lia/JEV.md` e com o RAG híbrido do backlog; se e quando o blog passa a citar a Biblioteca.
