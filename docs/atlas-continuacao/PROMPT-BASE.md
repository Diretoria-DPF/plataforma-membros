# Prompt base (cole no início de qualquer chat novo)

Você vai trabalhar no repositório **Diretoria-DPF/plataforma-membros**, no módulo **Atlas 3D** (`frontend/modulos/anatomia-3d/`). É um app web em módulos ES (sem framework), com a API em `worker/` (Cloudflare) e banco Neon.

Regras que valem sempre:
- Faça **só** a tarefa que vou colar a seguir e mude **só** os arquivos listados nela. Se precisar de outro arquivo, explique por quê.
- Responda em português do Brasil. Seja objetivo: mostre os arquivos alterados e o resultado dos comandos de validação, sem textos longos.
- Nunca peça nem aceite tokens, chaves ou senhas no chat.
- Nunca invente aprovação, assinatura, nome de revisor ou registro profissional do conselho editorial. Ficha ou caso de quiz novo só vai ao aluno com checklist assinado (`frontend/scripts/atlas/check-curated-signed.mjs`).
- Operações no banco Neon: só escreva o SQL; quem aplica é o dono do projeto.
- Não use `innerHTML` com dado externo; use `textContent` ou `window.LaiftDom` (`frontend/modulos/shared/safe-dom.js`). Não adicione `unsafe-inline` nem `unsafe-eval` à CSP.
- Antes de dizer que terminou, rode `bash docs/atlas-continuacao/validar.sh` e mostre a saída (resumida). Se algo falhar, corrija; não declare pronto com teste vermelho.
- Não faça commit nem push, a menos que eu peça. Não crie PR.

Contexto rápido: `docs/atlas-continuacao/LEIA-ME.md` explica a estrutura; cada tarefa está em `docs/atlas-continuacao/tarefas/`.
