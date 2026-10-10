# Plano de escala do banco para 500 acessos simultâneos (v1, 2026-10-10)

Pedido do dono: dividir o banco (2 ou 3 bases compartilhando o fluxo) para a plataforma não cair com muitos acessos, a custo R$ 0 para começar.
Decisão: **camadas** (Neon principal + Neon de logs + D1 replicado para leitura pública). Só planejamento; nada foi alterado.

## 1. Números verificados (documentação oficial, 2026-10-10)
| Serviço | Plano gratuito | Observação |
|---|---|---|
| Neon | 100 projetos; 1 GB por projeto (20 GB no total); **100 CU-horas por mês por projeto**; até 2 CU; 10 branches por projeto | O limite de computação é **por projeto**: dois projetos dão duas cotas. Réplicas de leitura: a página de planos não diz se existem no plano gratuito (a verificar) |
| Cloudflare D1 | 5 milhões de linhas lidas por dia; 100 mil escritas por dia; 5 GB no total | Aplicado desde 2026-09-01: passou do limite, a consulta falha até 00:00 UTC. **Réplicas de leitura em todas as regiões, sem custo extra**, usando a Sessions API |
| Hyperdrive | 100 mil consultas por dia; pool e cache de consultas incluídos | Exige driver TCP; o Worker usa o driver HTTP do Neon (`neon()` em `worker/src/db.js`), então **não entra agora** |
| Workers AI | 10.000 neurons por dia | Alguns modelos grandes passaram a exigir o plano pago (US$ 5 por mês); seguem gratuitos, entre outros, `glm-4.7-flash`, `gemma-4-26b-a4b-it` e `nemotron-3-120b-a12b` |
| Workers (requisições) | Não reverificado hoje | O backlog do projeto usa 100 mil requisições por dia como teto e 80 mil como gatilho (`docs/backlog-futuro.md`) |

O binding de IA (`[ai]`) já existe em `worker/wrangler.toml`; o D1 ainda não está ligado.

## 2. Hipótese de carga (a medir, não é fato)
500 pessoas ao mesmo tempo, 1 requisição a cada 10 s por pessoa: 50 requisições por segundo. Uma hora assim são cerca de **180 mil requisições**, acima de 100 mil por dia.
Conclusão provisória: **um pico real desse tamanho pode exigir o Workers Paid (US$ 5 por mês)**. O R$ 0 vale para o uso normal; o pico tem gatilho de pagamento (§5).
No Neon, 100 CU-horas por projeto equivalem a cerca de 400 horas de computação a 0,25 CU (estimativa, mínimo de CU do plano gratuito não verificado): tráfego contínuo pode esgotar a cota
antes do fim do mês. Por isso o objetivo é **deixar a maior parte da leitura fora do Neon** (cache e D1) para o computador do banco poder dormir.

## 3. Arquitetura em camadas
| Camada | O que fica nela | Como protege |
|---|---|---|
| 0. Cache de borda (Cache API) | Páginas públicas, `blog/index.json`, catálogo da Biblioteca, listas que mudam pouco | TTL de 60 s a 10 min com atualização em segundo plano; **modo degradado**: se o banco cair, o catálogo e o blog continuam de um instantâneo estático gerado no build |
| 1. D1 (leitura pública) | Só artigos `publicado` da Biblioteca, com busca FTS5 | Réplicas em várias regiões; atualizado quando o curador publica e conferido por uma rotina diária; resumo e coleções passam pelo Worker, que confere a sessão |
| 2. Neon principal | Membros, sessões, eventos, tarefas, propostas, mensagens, Lia, curadoria da Biblioteca | Tráfego só de quem está logado; limites por IP, perfil e global (já existem; correção do P0 do login no item I1) |
| 3. Neon de logs | `audit_logs`, `error_logs`, `ai_usage_log`, `ai_metrics_daily`, `atlas_telemetry`, `lia_pesquisas` | Escritas frequentes saem do banco principal; retenção atual (auditoria 2 anos, erros 30 dias) continua; segredo novo `DATABASE_URL_LOGS` |
| 4. Proteção | Disjuntores e alertas | Se o Neon falhar, leitura pública segue (camadas 0 e 1) e só o login e as ações de membro ficam indisponíveis; alertas por consumo (§5) |

Por que logs separados: são o tipo de dado que mais escreve, e um pico de escrita ali não pode acordar nem travar o banco dos membros.
Por que D1 só para leitura pública: é dado de baixa escrita (50 a 100 artigos no início) e muito lido; D1 replica de graça, e o limite de 100 mil escritas por dia não é problema.

## 4. Passos e donos (fase E1, em paralelo à Biblioteca)
| Passo | O quê | Equipe | Pronto quando |
|---|---|---|---|
| E1a | Mapear o acoplamento entre logs e membros (consultas do painel de auditoria, métricas e `maintenance.js` que juntam `audit_logs` com `profiles`) | Haiku, leitura | Relatório com cada consulta que cruza as duas bases e a solução (guardar só `profile_id` e nome no momento do registro, sem junção) |
| E1b | Cache de borda e instantâneo estático para modo degradado | Haiku + sessão principal | Teste simulando o Neon fora do ar: blog e catálogo respondem |
| E1c | Segundo Neon (logs): projeto novo, migração, `logging.js` e `maintenance.js` com o segundo `sql`, backup dos dois (o `backup.yml` hoje cobre um banco) | 1 Sonnet + revisão de segurança | Testes do Worker verdes; staging com os dois bancos; backup dos dois restaurado em branch vazia |
| E1d | D1 com leitura pública da Biblioteca e sincronização na publicação | 1 Sonnet + Haiku | A busca pública não consulta o Neon; reconciliação diária sem diferença |
| E1e | Teste de carga (500 simultâneos simulados) e painel de consumo | Haiku + sessão principal | Números medidos substituem a hipótese do §2 |

Cada passo atrás de flag, com rollback (voltar a escrever os logs no banco principal e a ler do Neon) e migração com `down`. Branch de backup do Neon antes de qualquer migração.

## 5. Gatilhos numéricos (quando agir ou pagar)
| Sinal | Limite | Ação |
|---|---|---|
| Requisições do Worker | acima de 80% do teto diário por 3 dias | Workers Paid (US$ 5 por mês); depois, rever cache |
| CU-horas do Neon (por projeto) | acima de 70% no mês | Mais leitura para cache e D1; se persistir, plano Launch |
| Armazenamento do Neon (por projeto) | acima de 800 MB | Arquivar logs antigos; projeto novo para o grupo que mais cresce |
| D1: linhas lidas | acima de 4 milhões por dia | Aumentar TTL do cache e revisar índices |
| Workers AI: neurons | acima de 8.000 por dia | Limite por membro e fila; modelo menor |

Medir no painel de IA e no painel de consumo (E1e); avisar o dono por e-mail quando algum sinal passar de 80%.

## 6. Riscos
- **Duas bases não têm transação entre si**: nenhuma regra de negócio pode depender de gravar nas duas ao mesmo tempo (por isso os logs guardam cópias do que precisam e a Biblioteca publica por sincronização com conferência diária).
- **Complexidade operacional**: segredos, backup, staging e testes dobram; por isso E1a vem primeiro e o corte é por flag.
- **Limites mudam**: reverificar os números do §1 a cada fase (a Cloudflare mudou regras de IA e de D1 em 2026).
- **Mensagens e dados de membros ficam no Neon principal**: nada de dado pessoal no D1 nem nos logs além de identificadores.
