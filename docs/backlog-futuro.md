# Backlog futuro

Itens adiados de propósito no Plano de Produção v1.0. Cada um tem um **gatilho** objetivo: enquanto o gatilho não ocorrer, o item não entra em desenvolvimento. Revisar este arquivo a cada trimestre.

| Item | Por que foi adiado | Gatilho de reconsideração |
|---|---|---|
| MFA WebAuthn / passkeys | Recuperação de acesso é complexa; TOTP cobre quase todos os casos | Dados clínicos reais ou pagamentos na plataforma |
| RLS completo no Neon | O driver HTTP roda cada query em transação própria; exigiria envolver `runWithSession` em `sql.transaction` | Spike em branch do Neon com latência ≤ 150 ms, ou suporte nativo no driver |
| RAGFlow | Exige VPS (≥ 4 núcleos, 16 GB RAM, 50 GB) e modelo de embedding; custo de ~R$ 95–155/mês | Chatbot com mais de 100 perguntas/semana **e** patrocínio ou orçamento aprovado |
| ToolJet | AGPL-3.0 (copyleft de rede), custo de VPS, e o painel admin atual atende | Painel admin com mais de 5 usuários simultâneos |
| ML para recomendações | Cold start; regras simples resolvem a maior parte | Mais de 10.000 interações gravadas em `client_events` |
| CRM (Odoo/HubSpot) | Já existe mini-CRM em `profiles` + tags | Gestão de mentores, doadores e parceiros que exija funil de engajamento |
| Microsoft Clarity | Gravação de sessão exige alterar Privacidade e CSP | Orçamento para revisão jurídica da Privacidade |
| 9drive / Google Drive como storage pesado | Projeto não verificado; R2 e KV bastam | R2 acima de 8 GB; **ou** KV acima de 800 mil leituras/dia; **ou** VPS patrocinada por parceiro; **ou** backup exigindo retenção > 30 dias |

## Regras
- Sem custo recorrente sem decisão explícita.
- Se o gatilho do 9drive não ocorrer em 12 meses, o item volta para revisão.
- Ao ativar um item, mover a linha para o plano da fase correspondente e registrar a decisão no `docs/CHANGELOG.md`.
