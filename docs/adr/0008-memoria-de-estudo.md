# ADR 0008: Memória de estudo (opt-in, em outro banco)

Status: aceita em 2026-10-12 (alfa, atrás de `memory_enabled`, desligada). Complementa o ADR 0007. Origem: plano "Operação LAIFT Agêntica, trilha de produto (v1)", seções B, C e J.

## Contexto
O Tutor Clínico explica melhor quando sabe em que o estudante está forte, onde tem dúvida e como prefere estudar. Isso é dado pessoal de comportamento de estudo e pode, mal desenhado, virar dado de saúde (o estudante digita um caso). O dono decidiu: só maiores de 18 anos; só membro e admin; opt-in explícito, revogável e apagável; retenção de 180 dias sem uso e 12 meses no máximo.

## Decisão
- **Sem texto livre, por construção.** A tabela `memory_items` só tem tipo, tema de um vocabulário controlado (`memory/vocabulary.js`), nível 1–5, valor de lista fechada, origem e datas. CHECKs do banco recusam qualquer outra coisa. A escrita vem só de sinais determinísticos (simulado, palavra-chave mapeada ao vocabulário, escolha do próprio membro), **nunca de um modelo**.
- **Outro banco (Neon `laift-memory`)**, com pseudônimo `HMAC-SHA256(MEMORY_SUBJECT_KEY, profile_id)` e RLS forçada por pessoa (`app.subject_id`), papel `laift_memory_worker` criado por SQL (sem `BYPASSRLS`, sem DDL). Protege de `WHERE` esquecido, **não** de Worker comprometido (documentado).
- **Consentimento no núcleo** (`member_memory_consent`, `sql/036`), com a versão da finalidade (`MEMORY.PURPOSE_VERSION`): mudou o texto, a leitura fecha até novo aceite. Conferido a cada chamada do tutor (sem cache).
- **Apagar sem FK**: como a memória está em outro banco, o gatilho `AFTER DELETE ON profiles` enfileira em `memory_purge_queue`; cron diário e limpeza oportunista drenam (meta 24 h); varredura diária (particionada acima de 150 consentimentos, sem teto) apaga quem não tem consentimento vigente. Revogar grava no núcleo primeiro (falha fechada).
- **Falha nunca derruba o tutor**: sem URL/chave/consentimento ou com erro, timeout (1,2 s) ou teto, o tutor segue sem memória; a escrita roda em `waitUntil`.
- **Ledger e pasta próprios**: `sql/memory/` + `memory_schema_migrations` (`tools/db/migrate.mjs --memory`), nunca lidos pelo fluxo do núcleo.

## Consequências
- Rollback por flag; `DATABASE_URL_MEMORY` ausente desliga tudo o que toca no banco de memória (inclusive o cron).
- Custo no Neon Free: o banco só acorda com membro consentido ou na limpeza (que pula o banco quando não há consentimento nem fila). Alerta manual a 70 CU-h.
- O tutor `tutor-clinico` passou a `1.1.0` (`memory: { read: true, write: true }` e a seção "USO DA MEMÓRIA" no prompt).
- Passos do dono (criar o projeto, definir a senha do papel, secrets, flags): `docs/runbook-memoria.md`. Texto de consentimento e seções 5 e 7 da Política: `docs/memoria-consentimento-RASCUNHO.md` (aguarda aprovação).
- Fora desta decisão: memória semântica em texto livre (pgvector fica ligado e sem uso), serviço externo de memória, front da memória (outro worktree).
