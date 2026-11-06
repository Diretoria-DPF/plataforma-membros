# Cargos candidatos (para ajustar no futuro)

Hoje existem 6 cargos funcionais ativos (`worker/src/roles/capabilities.js`): gestor, revisor de conteúdo, moderador, curador, mentor e **secretaria** (portaria: presença e crachás, exige verificação em duas etapas).

O gestor reúne seis capacidades que podem virar cargos menores, para delegar sem dar poder demais. O banco (`sql/051`) já reserva os nomes abaixo; **enquanto não houver entrada no catálogo do Worker, a concessão é recusada**.

| Nome reservado | Capacidades que liberaria (já existem) | Para quem faria sentido |
|---|---|---|
| `coordenador_eventos` | `events.manage` | Quem organiza simpósios e encontros |
| `coordenador_tarefas` | `tasks.manage` | Quem distribui e acompanha tarefas da liga |
| `relator_propostas` | `proposals.review` | Quem conduz a análise das propostas |
| `comunicacao` | `home.curate` | Quem cuida dos destaques da Início e da divulgação |

Capacidade sem cargo menor ainda: `orgchart.edit` (continua no gestor e no admin).

## Como criar ou ajustar um cargo
1. `ROLE_CAPS`: o que o cargo libera (só capacidades que já existem).
2. `ROLE_CATALOG`: rótulo curto e descrição em linguagem de gente (a tela de cargos lê daqui).
3. `PRIVILEGED_ROLES`: se mexe em dado de outras pessoas, entra aqui (exige MFA).
4. Teste em `worker/test/roleCapabilities.test.js`. Nome fora da lista reservada exige nova migração do CHECK.
5. Nenhum ajuste na tela: o painel de cargos adota o catálogo que o Worker envia.

Regras que valem para todos: só o admin concede e retira, com reautenticação e registro em auditoria; visitante nunca tem cargo; o acesso nunca vem automático pela posição na diretoria.
