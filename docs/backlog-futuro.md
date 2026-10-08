# Backlog futuro

Itens adiados de propósito. Cada um tem um **gatilho** objetivo: enquanto o gatilho não ocorrer, o item não entra em desenvolvimento. Revisar este arquivo a cada trimestre. Origem: Plano de Produção v1.0, revisado pelo Plano Consolidado v5.0.

## Infraestrutura e custo
| Item | Por que foi adiado | Gatilho de reconsideração |
|---|---|---|
| Neon pago | Plano gratuito atende o volume atual (confirmar o limite real no painel) | Uso acima de 800 MB, ou alerta de 80% do armazenamento |
| Workers pago ($5/mês) | Plano gratuito atende (~100 mil req/dia) | Mais de 80 mil req/dia por 3 dias seguidos |
| KV → Neon (cache) | O plano gratuito do KV permite ~1.000 escritas/dia; novos caches já nascem no Cache API ou no Neon | Mais de 100 usuários ativos, ou mais de 800 escritas de KV por dia |
| 9drive / Google Drive como storage pesado | Projeto não verificado; R2 e KV bastam. Fica só a documentação em `infra/9drive/` (sem VPS e sem DNS `storage.laift.com.br` até existir servidor) | **Técnico:** R2 acima de 8 GB, ou KV acima de 800 mil leituras/dia, ou backup exigindo retenção > 30 dias. **Intenção:** o responsável autorizar VPS própria ou patrocinada. Antes de ativar, confirmar os termos do Google para agregar várias contas |
| Módulos em subdomínio próprio (`modulos.laift.com.br`) | Hoje os módulos são same-origin e usam `window.top.App`; isolar quebra a ponte de identidade/API, o `postMessage` entre módulos, o `localStorage` de progresso, a CSP (`frame-src`) e a câmera do QR. Custo alto, benefício baixo enquanto nenhum módulo renderiza conteúdo de usuário | Algum módulo passar a renderizar conteúdo escrito por usuários, ou a plataforma abrir ao público geral |

## IA
| Item | Por que foi adiado | Gatilho de reconsideração |
|---|---|---|
| NVIDIA NIM como **fallback** do Groq | O cliente e a flag (desligada) são construídos na Fase 3; o uso ativo depende de confirmar os termos do nível gratuito para produção e dos IDs de modelo em `/v1/models` | Groq acima de 80% do teto de tokens por 3 dias seguidos; **ou** 429 em mais de 5% das requisições; **ou** mais de 30 usuários ativos por dia |
| NVIDIA NIM como **validador clínico assíncrono** (parecer sobre casos antes da moderação) | O admin continua sendo quem aprova; a IA só ajuda a priorizar | Fila de casos clínicos pendentes acima de 20 |
| NVIDIA NIM como **auditoria noturna de qualidade** | Sem métrica de qualidade ainda | Qualidade medida das respostas abaixo de 85% |
| Groq pago | Plano gratuito (200 mil tokens/dia por modelo, limite por organização) atende até ~25 ativos/dia | Consumo acima de 80% do teto por 7 dias, depois de cache semântico e NVIDIA |
| RAGFlow | Exige VPS (≥ 4 núcleos, 16 GB RAM, 50 GB) e modelo de embedding; custo de ~R$ 95–155/mês | Chatbot com mais de 100 perguntas/semana **e** patrocínio ou orçamento aprovado |
| ML para recomendações | Cold start; regras simples resolvem a maior parte | Mais de 10.000 interações gravadas em `client_events` |

## Segurança e produto
| Item | Por que foi adiado | Gatilho de reconsideração |
|---|---|---|
| MFA WebAuthn / passkeys | Recuperação de acesso é complexa; TOTP cobre quase todos os casos | Dados clínicos reais ou pagamentos na plataforma |
| RLS completo no Neon | O driver HTTP roda cada query em transação própria; exigiria envolver `runWithSession` em `sql.transaction` | Spike em branch do Neon com latência ≤ 150 ms, ou suporte nativo no driver |
| ToolJet | AGPL-3.0 (copyleft de rede), custo de VPS, e o painel admin atual atende | Painel admin com mais de 5 usuários simultâneos |
| CRM (Odoo/HubSpot) | Já existe mini-CRM em `profiles` + tags | Gestão de mentores, doadores e parceiros que exija funil de engajamento |
| Microsoft Clarity | Gravação de sessão exige alterar Privacidade e CSP | Orçamento para revisão jurídica da Privacidade |
| API pública com token | Sem parceiro que a consuma | Primeira parceria institucional |
| Modo DPO (busca por titular, exportação, anonimização) | Atendimento manual cabe no volume atual | Primeiro pedido formal de titular, ou mais de 5 pedidos por ano |
| Internacionalização (`pt-BR.json` + `data-i18n`) | Público único | Parceria com liga de outro país |
| Página de status pública | O painel da Cloudflare e o health check de admin bastam | Primeiro incidente que os membros percebam |
| Modo apresentação | Conveniência | Pedido da diretoria |
| Texto com menos de 11 px nos módulos (82 ocorrências; 46 em `studio.css`) | A interface densa do estúdio de laboratório depende dele | Revisão de acessibilidade dos módulos |
| Tirar o `sessionToken` de `window.App.getState()` e expor `callApiAuthed(action, input)` (O37) | `getState()` (`frontend/app.js`, linha 2500) devolve o `state` com o token, e qualquer script da mesma origem o lê. A mudança toca todos os módulos e os scripts do app, por isso foi aceita nesta rodada como risco. Um `getIdentity` já existe sem o token (linhas 2501 a 2503) | Qualquer script de terceiro na mesma origem, ou módulo que passe a renderizar conteúdo de usuário (ver O37 em `docs/riscos-residuais.md`) |

## Lia e RAG (entrega UX v2, 2026-10-08)
Itens fora desta entrega. Os gatilhos desta seção são **propostas** desta revisão; confirmar com o dono antes de usá-los.

| Item | Por que foi adiado | Gatilho de reconsideração (proposto) |
|---|---|---|
| Crawl4AI (coleta automática de páginas e scraping para a base da Lia) | Fora do stack atual (decisão de escopo da entrega UX v2/Lia). A base é escrita à mão em `worker/src/assistant/docs.js` e `worker/src/assistant/kb.js` e entra no Neon por reindexação | Acervo com mais de 200 fontes externas que precisem de atualização periódica, ou fonte que não possa ser copiada à mão |
| Ollama + FAISS (embeddings e índice locais) | Fora do stack atual: embeddings no Workers AI (`@cf/baai/bge-m3`) e índice no pgvector do Neon | Custo mensal do Workers AI acima do teto a definir (`docs/AMBIENTES.md`, seção 6), ou exigência de que o texto não saia da Cloudflare e do Neon |
| RAG vetorial com reranker | A fusão RRF com piso por lista já atende o golden set; um reranker acrescenta latência e custo sem medição | Recall@4 do golden set abaixo do piso de regressão com embeddings ligados e calibrados (ver `docs/riscos-residuais.md`, O21) |
| Avaliação contínua da Lia (RAGAS ou equivalente) | Hoje a qualidade é medida pelo golden set (`worker/test/fixtures/rag-eval.json`) e pelo polegar; não há avaliação automática das respostas em produção | Dois meses seguidos de satisfação abaixo de 80% no painel "Satisfação da Lia", ou troca do modelo de embedding |
| Re-aceite da Política de Privacidade | Só o cadastro grava o aceite (`worker/src/services/authService.js`); quem já tem conta não tem registro da versão 2026-10-08 | Decisão jurídica de que a alteração é material (ADR 0005, "Versão da política"), ou nova versão publicada |

## Regras
- Sem custo recorrente sem decisão explícita.
- Se o gatilho do 9drive não ocorrer em 12 meses, o item volta para revisão.
- Ao ativar um item, mover a linha para o plano da fase correspondente e registrar a decisão num changelog (o `docs/CHANGELOG.md` citado aqui ainda não existe no repositório).
