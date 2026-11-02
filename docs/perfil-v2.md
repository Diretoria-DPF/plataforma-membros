# Perfil v2

Perfil reorganizado, aprovado pelo dono e **atrás da flag `profile_v2_enabled`, desligada por padrão** (migração `050`). Com a flag desligada, ou se o pacote falhar ao carregar, o Perfil de sempre fica idêntico.

## Como funciona

`profile-v2.js` (pacote sob demanda `perfil2`, `lazy-bundles.js`) **não recria nada**: só reposiciona os elementos que já existem, com os mesmos ids, para que `app.js`, `mfa.js`, `privacy.js`, `whats-new.js` e `credential.js` sigam funcionando. Tudo o que ele faz é registrado e desfeito por `reset()` quando a flag é desligada.

- **Cabeçalho** em gradiente: foto, nome, usuário, "Trocar foto" e "Meu crachá virtual" (os botões de sempre).
- **Duas colunas** a partir de 900 px: Meus dados, Minhas métricas e Meu desempenho; Preferências, Feedback, Verificação em duas etapas, Meus dados e privacidade e Atualizar o aplicativo.
- **Seções recolhíveis** (botão com `aria-expanded`). Abertas ao entrar: Meus dados e Preferências.
- **Meu desempenho** (de `home-v3.js`, flag `home_v2_enabled`) entra na coluna da esquerda; sem aquela flag ele não existe, como hoje.
- **Final**: "Ver novidades" (o botão de sempre) e "Sair" (aciona o botão Sair do cabeçalho do app).

## Fora desta versão

A prévia mostrava "Densidade" e interruptores no lugar das caixas de seleção. O Perfil real não tem preferência de densidade e os controles de Preferências (tema, e-mail, vibração) seguem os de sempre, para não alterar dados nem validações.

## Acessibilidade

Alvos de 44 px ou mais, fontes de 12 px ou mais, foco visível, `prefers-reduced-motion` respeitado, claro e escuro pelos tokens. Sem `innerHTML` e sem estilo inline.

## Ligar e desligar

Painel de flags do modo admin. Reversão da migração: `sql/down/050_profile_v2_flag.sql`.

## Testes

`frontend/scripts/profile-v2.test.mjs`, `frontend/scripts/e2e/profile-v2.e2e.js` e `worker/test/profileV2FlagMigration.test.js`.
