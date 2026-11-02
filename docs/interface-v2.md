# Nova interface (v2): como cada tela entra

Todas as telas seguem o visual do Início v3 (`docs/inicio-v3.md`): cabeçalho em gradiente, cartões grandes arredondados, faixas rolantes com encaixe, tema claro e escuro pelos tokens de `modulos/shared/laift-tokens.css`. As prévias aprovadas ficam em `frontend/previa/` (ambiente local, fora do repositório).

## Uma flag por tela (migração 050)

| Tela | Flag |
|---|---|
| Aprender | `learn_v2_enabled` |
| Eventos | `events_v2_enabled` |
| Perfil | `profile_v2_enabled` |
| Propostas | `proposals_v2_enabled` |
| Tarefas | `tasks_v2_enabled` |
| Mensagens | `messages_v2_enabled` |
| Equipe | `team_v2_enabled` |
| Biblioteca | `library_v2_enabled` |
| Mentoria | `mentoring_v2_enabled` |
| Processo seletivo | `selection_v2_enabled` |
| Administração | `admin_v2_enabled` |

Todas nascem desligadas, são públicas (`PUBLIC_FLAGS`) e viram o atributo `data-flag-<chave-com-hifen>` no `<html>` (`ux-v2.js`). Desligar a flag devolve a tela de sempre, sem recarregar dados.

## Regras de implementação

1. **Mesma função, novo visual.** Nenhuma ação, campo ou validação existente some; muda apresentação. A lógica e as chamadas à API continuam as da tela atual.
2. **Pacote sob demanda** em `frontend/lazy-bundles.js` (como `inicio3`): o JS e o CSS novos só baixam com a flag ligada; se falhar, a tela de sempre carrega.
3. **Sem `innerHTML`**, sem estilo inline, sem script inline (CSP). Ícones SVG por `createElementNS` ou pelo sprite.
4. **Acessibilidade:** alvos de toque de pelo menos 44 px, fonte de pelo menos 12 px, foco visível, `aria-*` nos controles, `prefers-reduced-motion`.
5. **Texto:** a assistente é "a Guia"; linguagem neutra; sem diminutivos; sem a palavra "grátis".
6. **Testes:** unitário (`frontend/scripts/<tela>-v2.test.mjs`) e e2e (`frontend/scripts/e2e/<tela>-v2.e2e.js`) em 375x812, 768x1024 e 1280x800, claro e escuro, flag ligada e desligada.
7. Arquivos novos com cabeçalho de licença (`node tools/license/apply-headers.mjs --write`).
