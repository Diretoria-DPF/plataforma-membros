# Administração v2

Modo administrador reorganizado, **atrás da flag `admin_v2_enabled`, desligada por padrão** (migração `050`). Com a flag desligada, ou se o pacote falhar ao carregar, o modo administrador de sempre fica idêntico.

## Como funciona

`admin-v2.js` (pacote sob demanda `admin2`, `lazy-bundles.js`) **não recria os painéis**: os `panel-admin-*` e seus módulos (Seleção, Destaques, IA, Exclusões, Cargos, Biblioteca, moderação, uso, usuários etc.) seguem os mesmos nós, dados, ações, validações e reautenticações. O script só acrescenta, e `reset()` desfaz tudo:

- **Barra de seções** no topo (fixa ao rolar), com **Voltar** sempre visível à esquerda e as seções roláveis: Painel, Seleção, Destaques, Flags, IA, Exclusões, Cargos e as demais de sempre. Cada seção abre o painel de sempre; só aparecem as seções que o modo administrador de sempre mostraria. A barra de baixo do modo administrador fica escondida só por CSS enquanto a v2 está montada.
- **Faixa "Pendências da gestão"** (só no Painel), com números de leituras que já existem: inscrições a analisar (`apiSelectionCommitteeOverview`), exclusões em andamento (`apiAdminListDeletionRequests`), propostas em análise (indicadores do Painel, `apiAdminDashboard`) e flags não salvas (estado local). Mostra "…" ao carregar e "—" se a leitura falhar.
- **Seção Flags** (`panel-admin-flags`), com `apiAdminListFeatureFlags` e `apiAdminSetFeatureFlag` (já existiam na API; não havia tela): busca, interruptores, contador de alterações, confirmação antes de salvar e envio só de `{ enabled }` para cada flag alterada (percentual e condições ficam como estão). `mfa_required` fica só leitura (exige reautenticação).

## Diferenças da prévia

- Voltar e as seções reaproveitam a navegação de sempre (não é um conjunto de abas com `role="tablist"`: são botões com `aria-current`, porque cada um abre um painel de sempre).
- A prévia tinha só seis abas; a v2 mantém todas as seções existentes.
- "Flags não salvas" na faixa só conta o que está na seção Flags desta sessão.

## Acessibilidade

Alvos de 44 px ou mais, fontes de 12 px ou mais, foco visível, `prefers-reduced-motion` respeitado, claro e escuro pelos tokens. Sem `innerHTML` e sem estilo inline. O texto próprio da v2 usa "a Guia"; não há "Lia" visível nos painéis de sempre.

## Ligar e desligar

Pela API `apiAdminSetFeatureFlag` ou pela seção Flags desta tela. Reversão da flag: `sql/down/050_*`.

## Testes

`frontend/scripts/admin-v2.test.mjs` e `frontend/scripts/e2e/admin-v2.e2e.js`.
