# Ata — revisão das fichas do PR 3.2 antes do merge (gate 0.2)

- **Data do registro:** 02/10/2026
- **Registro:** feito pelo Claude a partir da confirmação do usuário (Diretoria LAIFT) nesta data: "Conselho já concordou".

## Decisão
O conselho editorial da LAIFT (monitores, doutores e PhD) **revisa 100% das fichas de cada onda ANTES de ela entrar no PR** (revisão pré-merge, não pós-merge).

## Como funciona
1. O Claude prepara a onda (curador + revisor editorial automático + validador) em `docs/atlas-conteudo/fichas/pendente/onda-NN/` — o atlas **não** lê essa pasta.
2. Um membro do conselho revisa e assina `docs/atlas-conteudo/revisao-onda-NN.md` (modelo: `revisao-onda-modelo.md`).
3. Só com a assinatura "aprovado" ou "aprovado com ressalvas" (e as ressalvas aplicadas) a onda é movida para `data/atlas/curated/` num commit próprio.
4. "Reprovado" devolve a onda para refazer, com o motivo.

## Declaração a ser assinada (gate 0.2 — **pendente de assinatura**)
> "Ciente de que cada onda de 20–30 fichas será revisada integralmente por membro do conselho antes de entrar em produção."

O registro do usuário ("conselho já concordou") cobre a aprovação do processo; esta declaração deixa explícito o compromisso de revisar **100% das ~300 fichas em 10 ondas**. Enquanto não estiver assinada, as ondas podem ser **preparadas** em `pendente/`, mas nenhuma entra em `curated/` (trava automática: `frontend/scripts/atlas/check-curated-signed.mjs`, rodada pelo build).

## Assinaturas
| Membro do conselho | Função | Data | Assinatura |
|---|---|---|---|
| ___ | ___ | ___ | ___ |
