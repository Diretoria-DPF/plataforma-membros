# Evidência automática de acessibilidade (2026-10-08)

Ficha R2-3 (Rodada 3). Base: `docs/ops-rotina-2026-10`. Roteiro com leitores de tela (teste manual do dono): `docs/QA_LEITORES_DE_TELA.md`. Esta evidência não substitui o teste com NVDA, JAWS e VoiceOver.

## Como foi medido

- **Build:** `cd frontend && node scripts/build.js` (saída 0; 101 arquivos no precache).
- **Telas públicas (login, termos, privacidade):** script auxiliar fora do repositório, `C:/Users/Administrador/AppData/Local/Temp/laift-a11y-r2/medir-a11y.cjs`. Serve `frontend/dist/` com `startStaticServer()` do harness, Chromium do Playwright 1.63.0, viewport 375x812. Árvore: `locator('body').ariaSnapshot()`. Axe: axe-core 4.13.0 (`frontend/node_modules/axe-core/axe.min.js`), `axe.run(document)` com as regras padrão.
- **`bypassCSP: true` valeu só para esta medição** (para injetar o axe). O produto não foi alterado.
- **Telas logadas:** `cd frontend && node scripts/e2e/run.js visual-qa`, uma única execução. Saída 0, "223 verificações ok, 2 aviso(s)". O axe-gate do cenário reprova só serious e critical; minor e moderate não foram contados nesse cenário.
- Data e horário da execução do e2e: 2026-10-08, 18:47 a 18:49 (-03).

## Telas públicas, 375x812

Contagem de nós por impacto (axe):

| Página | Rota | critical | serious | moderate | minor | Erros de página |
|---|---|---|---|---|---|---|
| Login | `/` | 0 | 0 | 0 | 0 | 0 |
| Termos de Uso | `/termos.html` | 0 | 0 | 3 | 0 | 0 |
| Política de Privacidade | `/privacidade.html` | 0 | 0 | 2 | 0 | 0 |

Violações (seletor entre parênteses):

- Termos: `heading-order` (`h3:nth-child(26)`, salto de h1 para h3 na seção "Código de Conduta"); `landmark-one-main` (`html`); `region` (`.legal-shell`).
- Privacidade: `landmark-one-main` (`html`); `region` (`.legal-shell`).
- **Nenhuma violação serious ou critical.** Nada foi corrigido nesta ficha.

Árvore resumida (de `aria-login.yml`, `aria-termos.yml`, `aria-privacidade.yml`, nos arquivos auxiliares):

- **Login (`/`):** região `main` com nome "Entrar"; título h1 "Entrar"; caixas "E-mail" e "Senha"; botões "Entrar", "Criar conta", "Esqueci minha senha". Aparece também o alerta "Sistema temporariamente indisponível": a medição rodou sem API (servidor estático), então é provável que a mensagem venha do ambiente. Confirmar em produção.
- **Termos (`/termos.html`):** sem landmark `main`; link "← Voltar"; h1 "Termos de Uso"; h2 de "1. Aceitação" a "9. Contato"; h1 "Código de Conduta" seguido de h3 (causa do `heading-order`).
- **Privacidade (`/privacidade.html`):** sem landmark `main`; h1 "Política de Privacidade"; h2 de "1. Quem é o controlador dos dados" a "11. Autoridade Nacional de Proteção de Dados (ANPD)".

## Telas logadas (cenário visual-qa)

Resultado: 223 verificações ok e 2 avisos não bloqueantes. Axe (serious e critical): 32 de 32 checagens ok.

| Tela | Claro/Escuro | 375x812 | 1280x800 |
|---|---|---|---|
| Início | ok | ok | ok |
| Eventos | ok | ok | ok |
| Propostas | ok | ok | ok |
| Aprender | ok | ok | ok |
| Perfil | ok | ok | ok |
| Lia fechada | ok | ok | ok |
| Lia aberta | ok | ok | ok |
| Admin: IA | ok | ok | ok |

- **Avisos (não bloqueiam):** "pref-email-notif" em Perfil, 13x44 px, abaixo de 44x44, nos temas claro e escuro, em 375x812.
- Árvore de acessibilidade das telas logadas **não foi coletada** (o cenário não gera árvore). Pendência.

## Sem evidência automática nesta rodada

- **Cadastro, recuperação de senha, redefinição de senha:** nenhum cenário rodado cobre estas telas.
- **Onboarding, Lia (estados de aviso e suspensão), assistente:** têm axe-gate em `onboarding.e2e.js`, `lia-estados.e2e.js` e `assistant.e2e.js`, mas não foram executados nesta rodada (a ficha pede um cenário só).
- **Atalhos de teclado (Ctrl/Cmd+/ e Ctrl/Cmd+K):** sem cenário com axe.
- **Confirmações (`#modal-confirm`):** `confirm-a11y.e2e.js` não usa axe; sem evidência automática.
- **A Liga:** a página ainda não existe.
- **Contagem de minor e moderate nas telas logadas:** não registrada pelo cenário.

## Comando de aceite e resultado

```
grep -cE "^### " docs/QA_LEITORES_DE_TELA.md
grep -ciE "serious|critical" docs/qa/A11Y_EVIDENCIA_2026-10.md
git diff --name-only HEAD~1 HEAD
git status --porcelain
```

Os resultados e o commit estão no relatório final do agente.

## Limites desta evidência

- Axe automatiza só parte da acessibilidade. Ele não diz o que o leitor de tela fala, nem a ordem de leitura, nem se o foco faz sentido. Isso é do roteiro manual.
- Os números são de um ambiente de build local, sem API. Divergências em produção devem ser conferidas no navegador real.
- Os avisos de alvo de toque e as violações moderate estão listados; não foram corrigidos (escopo da ficha).
