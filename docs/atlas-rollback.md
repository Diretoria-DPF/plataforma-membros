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

## 5. Proxy de moléculas (PR 3.2, Bloco E)
No modo Moléculas, o atlas busca o `.pdb` (RCSB) e as propriedades (PubChem) pela Worker, com as ações `apiLearnAtlasPdb` e `apiLearnAtlasPubchem`. O `connect-src` do atlas não libera mais `files.rcsb.org` nem `pubchem.ncbi.nlm.nih.gov`.

- **Ordem do deploy:** o Pages e a Worker publicam juntos no merge, sem ordem garantida.
  - Se o front chegar antes, a Worker antiga responde "Ação desconhecida.", e a tela mostra "Serviço de moléculas indisponível" com "Tentar de novo". Não há erro de JavaScript.
  - Quando a Worker nova sobe, "Tentar de novo" carrega a estrutura.
- **Se o proxy falhar em produção** (RCSB ou PubChem fora do ar, Cache API com problema):
  1. O resto do atlas não é afetado; só o modo Moléculas mostra o aviso.
  2. Conferir em `wrangler tail`: as falhas do serviço externo voltam como `unavailable: true`, sem log de erro, e os erros inesperados aparecem com `correlationId`.
  3. Para reverter, use o `git revert` do merge (seção 1). Ele devolve as chamadas diretas **e** a CSP antiga juntas.
     - Não basta reabrir o `connect-src` à mão: o front novo não chama mais o RCSB direto.
- **Cache:** respostas boas ficam 7 dias na Cache API da Worker, por data center. Uma estrutura corrigida no RCSB aparece no atlas em até 7 dias. Não há purga manual.
