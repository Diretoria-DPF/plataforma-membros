# Rollback do Atlas 3D

O merge na `main` publica **direto em produção** (workflow `deploy-frontend.yml` → GitHub Pages da plataforma). Os testes com pessoas acontecem depois do merge (risco aceito no plano da Onda 2), então reverter rápido é parte do processo.

**Tempo máximo aceitável fora do ar ou quebrado: 30 min.**

## 1. Reverter um merge que quebrou a produção
Quem: qualquer pessoa com permissão de merge (não precisa do Claude).

Pelo site do GitHub (mais rápido):
1. Abra o PR que foi mesclado → botão **Revert** (canto inferior do PR). O GitHub cria um PR "Revert …".
2. Espere o check **atlas-e2e** ficar verde (≈ 4 min) e clique em **Merge**.
3. O Pages republica em ≈ 1–3 min (aba **Actions → Deploy frontend**). Confira abrindo Aprender → Anatomia com Ctrl+Shift+R.
4. Avise o time: "Bug em produção: <descrição>. Rollback feito (PR #N)."

Pela linha de comando (equivalente):
```bash
git fetch origin main
git checkout -b revert-pr-N origin/main
git revert -m 1 <commit-do-merge>      # -m 1 = manter o lado da main
git push -u origin revert-pr-N         # abrir PR → CI verde → merge
```
Nunca use `git push --force` na `main`.

### Teste do procedimento (02/10/2026)
`git revert -m 1 ba5a6ab` (merge do PR #8) numa branch local descartável: revert limpo em < 1 s (49 arquivos), build ok e e2e `atlas` + `smoke` verdes no estado revertido. A branch foi apagada sem publicar nada.

## 2. Desligar uma novidade sem reverter tudo (feature flags)
As novidades da Onda 2 têm chave em `frontend/modulos/anatomia-3d/js/core/flags.js` (`ATLAS_FLAGS`).
1. Troque a chave para `false` (ex.: `onboarding: false`) num PR de 1 linha.
2. CI verde → merge → Pages republica.

Para testar sem publicar: abra o atlas com `?flags=-onboarding,-hints` (o sinal de menos desliga).

## 3. Service worker (Onda 4)
Quando existir `sw.js`: aumentar a versão do cache no build faz os aparelhos trocarem de versão na próxima visita; em emergência, publicar um `sw.js` que só chama `self.registration.unregister()`. (Será detalhado na Onda 4.)

## 4. Migração no Neon (Onda 4)
Toda migração nova vem com o script de volta (`down`) e é aplicada primeiro num branch temporário do Neon. Para desfazer em produção: restaurar o branch a partir do ponto anterior à migração (Neon → Branches → Restore) — sempre com confirmação do responsável.
