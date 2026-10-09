# Registro de mudanças

Mudanças relevantes da plataforma, da mais recente para a mais antiga. As datas são as de mescla na `main` (UTC). Detalhes e decisões ficam em `docs/ANDAMENTO.md`, `docs/riscos-residuais.md` e `docs/adr/`.

## [Não publicado]

Rodada 3 (operação e Liga), em andamento nas branches `docs/ops-rotina-2026-10` e `feat/liga-identidade`.

### Adicionado
- `tools/ci/registrar-segredos-backup.ps1`: cadastra os 6 secrets do workflow "Backup do banco" sem passar valores pelo chat (`-SomenteVerificar` lista só os nomes). Hoje os 6 estão em falta.
- `docs/LIGHTHOUSE_2026-10-08b.md`: medição da produção (`laift.com.br`). Mobile, mediana de 3 rodadas: Performance 94, Acessibilidade 100, Boas práticas 100, SEO 100, CLS 0,000.
- `docs/liga/`: fontes da Liga (Edital 2026 original e estrutura do Forms atual), referências de ligas acadêmicas, proposta de Edital v2 e resumo visual (propostas; a diretoria aprova).
- Seção "Rodada 3" em `docs/TIME_CONTRATO.md` (1 orquestrador Opus 5.5 e executores Haiku 5.5).

### Alterado
- A Lia passa a responder sobre o processo seletivo, as áreas e o contato da Liga (intenção `liga_processo` e fonte `liga` na base de conhecimento). Nenhum dado de candidato é lido.

### Corrigido
- `docs/BACKUP_RESTORE.md`: o job agendado falha (fica vermelho) sem os secrets; só a execução manual termina com aviso.
- `docs/AMBIENTES.md`: lista de secrets do staging inclui `MFA_ENCRYPTION_KEY` e `NVIDIA_API_KEY`.
- `docs/SECURITY.md`: o site roda no Worker `laift-web` da Cloudflare, e o clickjacking está mitigado por `frame-ancestors 'self'` (`frontend/_headers`).

## #40: Lia ondas 2–4, rosto mais leve, onboarding e moderação admin (2026-10-08)
Branch `feat/v5-fechamento`. 100 arquivos, +9.637 −311.

### Adicionado
- Lia: 7 cenas em código (Laboratório, Clínica, Atlas, Aprender, aviso, suspensa e redenção, confusa), props sob demanda e efeito de digitação.
- Onboarding por papel, atalhos `Ctrl/Cmd+/` e `Ctrl/Cmd+K`, hero do login com a cabeça da Lia.
- Tela "Moderação da Lia" no painel admin (agregados e por pessoa, sem nome).
- Cobertura de assuntos da Lia (propostas, equipe, mensagens, feedback, redenção, limite de IA e telas de admin, estas só para admin).

### Alterado
- Rosto da Lia mais leve (variante "suave" aprovada pelo dono); partes do corpo sobrepostas corrigidas.
- Painel admin sem Chart.js/CDN (SVG próprio, tabela alternativa); CSP sem jsDelivr (O31).
- `openConfirm` acessível (foco preso, Esc, foco devolvido, fundo `inert`); `h1` por tela; alvos de 44 px; reduced-motion consolidado.

### Segurança
- Suspensão da Lia relida do banco (O17), alerta de reindex sem embeddings (O20), respostas com fontes fora do cache (O27); `profile.id` do próprio perfil nas respostas de login.

Verificação: worker 1506 testes; front 899 (2 falhas só no Windows, `_headers`); e2e 319 ✔.

## #39: CI verde na `main` após a #38 (2026-10-08)
Branch `fix/ci-pos-fusao`. 6 arquivos, +196 −128.

### Corrigido
- Cabeçalho de copyright em 3 testes (`lia-anim`, `nav-a11y`, `ux-v2`).
- `sharp` 0.35.4 → 0.35.5 em `tools/atlas-pipeline` (GHSA-wq5f-xc86-pv6w).

## #38: UX v2, Lia viva, RAG, feedback e moderação (2026-10-08)
Branch `feat/v5-ux-fundacao`. 128 arquivos, +21.484 −508.

### Adicionado
- Fundação visual (flag `ux_v2_enabled`): camadas por tom, motion tokens, cartões sem borda, vidro com fallback, skeletons, splash.
- Início editorial: números com contagem animada, gráficos em SVG próprio, tabela alternativa.
- Lia viva: personagem SVG modular (ADR 0003), estados, humor e variações, dicas por módulo.
- RAG com busca híbrida (pgvector e pg_trgm) e citações; feedback 👍/👎 e painel "Satisfação da Lia"; moderação em 4 níveis com redenção.
- Migrações 020 a 024 (ainda **não aplicadas em produção**; ver runbook em `docs/AMBIENTES.md`).

### Segurança
- Revisões de segurança, banco, RAG e acessibilidade; nenhum crítico; todos os altos corrigidos e cobertos por testes.

Verificação: worker 1424 testes; front 650 (2 falhas só no Windows); QA visual com 222 verificações.

## Treino de restauração

Registre aqui cada treino (a cada trimestre e depois de qualquer mudança no processo), conforme `docs/BACKUP_RESTORE.md`.

| Data | Dump (arquivo) | Branch de teste | Contagens conferidas | Resultado |
|---|---|---|---|---|
| — | — | — | — | Nenhum treino registrado ainda |
