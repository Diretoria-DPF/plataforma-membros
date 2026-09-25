# Auditoria de segurança e prontidão para escala — 2026-09-25

> Gerada por revisão de código (sem testes ao vivo contra produção — ver "Nota de escopo" abaixo). Nenhum achado foi corrigido automaticamente; esta é uma lista de triagem para o dono da plataforma priorizar.

## Nota de escopo

O pedido original incluía uma simulação de ataque ao vivo contra a produção. A auditoria optou por revisão de código-fonte completa em vez de ataques ao vivo, pelos seguintes motivos, item a item:

- **IDOR ao vivo** exigiria testar acesso a `profileId`/`connectionId`/`reportId` de contas reais de outras pessoas — mesmo com sucesso na rejeição, o teste em si arrisca expor PII real de alguém que não consentiu. A revisão de código já é conclusiva sem esse risco.
- **Injeção SQL/XSS ao vivo** arriscaria o banco real por benefício marginal: o driver Neon usa exclusivamente tagged-template `sql\`...\`` (parametrização automática) ou `sql(texto, params)` com o texto sempre vindo de allowlists fechadas — verificável com certeza lendo o código.
- **Rate limit ao vivo** exigiria se aproximar deliberadamente dos limiares reais de login contra uma conta real — um "quase-DoS" funcional, fora do escopo autorizado.

Onde o código não é conclusivo por si só, isso é dito explicitamente abaixo.

## Parte A — Achados de segurança

### CRITICAL / HIGH
Nenhum encontrado.

### MEDIUM

**M1 — `apiSubmitProposal` / `apiListMyProposals` / `apiGetProposalResults` sem `S.requireRole`.**
`worker/src/services/proposalService.js:9,25,91` não restringem por papel, diferente de todo o resto do sistema (conexões, votação, tarefas, fluxograma, eventos sempre chamam `S.requireRole([MEMBER, ADMIN])`). Uma conta `visitor` recém-confirmada pode hoje submeter/ver propostas.
- Decidir se é intencional (visitante pode sugerir propostas como engajamento pré-associação) ou descuido de porte do Apps Script original.
- Se não for intencional: adicionar `S.requireRole(identity, [C.ROLES.MEMBER, C.ROLES.ADMIN])` nas três funções.

**M2 — Login sem rate limit global/por IP.**
`worker/src/constants.js:134-147`: `REGISTER` e `RESET_REQUEST` têm bucket por-identificador + global; `LOGIN` só tem por-e-mail (8 tentativas/15min), sem teto agregado nem limitação por IP (`CF-Connecting-IP` não é usado em nenhum lugar do código).
- Adicionar `LOGIN_GLOBAL` e considerar `CF-Connecting-IP` como segundo identificador de rate limit.

**M3 — `linkedinUrl` sem validação de esquema no backend.**
`authService.js:52` / `profileService.js:115` só checam tamanho (≤255). Hoje não é explorável (o frontend sempre renderiza como texto via `text()`, nunca como `href`), mas é defesa em profundidade caso o campo vire link clicável no futuro.
- Validar prefixo `https://` no backend antes de aceitar.

### LOW

**L1 — Comentário desatualizado em `worker/src/security.js:11-14`.**
Diz que o token de sessão só existe em memória JS, mas `frontend/app.js:60` grava em `localStorage` (decisão de produto já documentada e assumida em `docs/SECURITY.md:55-90`). Corrigir o comentário; reforça a prioridade do CSP já planejado na Fase 3f do plano de mensageria.

### Pontos fortes confirmados
- Nenhuma SQL injection ou XSS encontrada (parametrização consistente; DOM só via `h()`/`text()`, nunca `innerHTML`).
- CORS com allowlist exata, sem wildcard.
- Erros nunca vazam stack/SQL ao cliente — só `correlationId` + log interno visível a admin.
- IDOR bem desenhado: toda leitura/escrita própria é filtrada por `identity.profileId` da sessão, nunca por id vindo do cliente.
- Regras de negócio críticas reforçadas em dobro (service + trigger de banco).
- Rate limiting real e no servidor (UPSERT atômico com lock de linha), dimensionado para "liga pequena" de propósito.
- Nenhum segredo hardcoded.

## Parte B — Prontidão para escala (ordem de prioridade)

1. **Confirmar o tier do Cloudflare Worker ANTES da mensageria ir ao ar.** Plano gratuito = 100k requisições/dia; polling de mensageria (a cada 5-30s por aba aberta, ver `docs/PLANO_FASE3_MENSAGERIA.md:680-688`) pode se aproximar disso rápido, e ao bater o teto a API para por completo (não degrada suave).
2. **Polling de mensageria mantém o Neon sempre "acordado"** (nunca faz scale-to-zero enquanto houver aba aberta) — medir compute-hours reais logo após a Fase 3f e ter gatilho numérico definido para migrar a Durable Objects/WebSocket (já cotado como v2 no próprio plano).
3. **Backup/DR do Neon não está confirmado.** Verificar a janela de retenção de point-in-time restore do plano atual; se curta, implementar export periódico independente — o banco tem PII real.
4. **Zero cache em leituras quentes** (`getOrgChart`, `listEvents`) — toda leitura bate direto no Neon. Cache simples via KV do Worker (TTL 30-60s, invalidado nas mutações) resolveria os dois endpoints mais repetidos.
5. `frontend/app.js` com quase 2000 linhas (teto do projeto é 800) vai crescer ainda mais com a UI de mensageria — considerar dividir por domínio via `<script type="module">` antes/durante a Fase 3f.
6. `API_REGISTRY` (hoje 39 ações) vai passar de ~50-55 com mensageria — considerar sub-objetos por domínio mesclados em `handlers.js`, mantendo a mesma allowlist fechada.
7. Pares "query principal + count" sequenciais em `adminService.listUsers`, `moderationService.listReports`, `auditService.listAuditLogs` podem virar `Promise.all` (padrão já usado em `profileService.getMyMetrics`) — ganho de latência em telas admin.
8. Avatares/imagens sem redimensionamento automático (R2 puro, sem Cloudflare Image Resizing) — a tela de fluxograma carrega todos os avatares de uma vez; ativar Image Resizing evita crescimento linear de peso de página com o número de membros.

---
Auditoria completa (código revisado): `worker/src/{handlers,security,errors,index,db,logging,mailer,constants}.js`, `worker/wrangler.toml`, todos os `worker/src/services/*.js`, `frontend/app.js`, `docs/{SECURITY,DEPLOYMENT,PLANO_FASE3_MENSAGERIA}.md`, migrações relevantes em `sql/`.
