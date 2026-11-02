# Destaques da Liga

Bloco **"Na Liga"** da tela Início, gerenciado pela diretoria. Mostra no máximo **8 itens** de uma vez.

## O que aparece

- **Itens manuais**: criados na tela de gestão (aviso, evento, edital, blog ou link).
- **Itens automáticos**: os próximos eventos (`apiListEvents`) e a publicação recente do blog (até 14 dias) entram sozinhos nas vagas que sobram. São montados no navegador, **sem gravação no banco**, e aparecem na gestão marcados como "Automático" (somente leitura).
- O teto de 8 vale para o conjunto; os manuais têm prioridade.

## Como adicionar, ocultar, ordenar e remover

Quem pode: administração (barra do modo admin, "Destaques") e quem tem a capacidade `home.curate` (cargo **gestor**, menu Gestão > "Destaques da Liga"). Cargo privilegiado exige a verificação em duas etapas ativa.

- **Adicionar destaque**: título (até 120 caracteres), tipo, texto de apoio (até 160), link opcional e data de saída opcional. Novo item entra no topo.
- **Link**: só caminho interno (começa com `/`, ex.: `/edital.html`) ou endereço `https://` de um domínio permitido (`HIGHLIGHT_LINK_HOSTS`, em `worker/src/constants.js`: `laift.com.br`, `www.laift.com.br`, `www.instagram.com`, `instagram.com`, `doi.org`, `www.gov.br`, `www.planalto.gov.br`, `pubmed.ncbi.nlm.nih.gov`). A comparação é pelo hostname exato em minúsculas; porta diferente da padrão, usuário/senha e subdomínios fora da lista são recusados. Outros formatos são recusados no navegador e no Worker; o banco (CHECK da 048) só garante https sem usuário/senha.
- **Por que a lista fica só no Worker**: ampliar um domínio é mudar uma constante e fazer deploy, sem migração do banco. O CHECK do SQL permanece genérico de propósito. Links já gravados com outro domínio continuam funcionando na leitura; só um novo salvamento os revalida.
- **Data de saída**: no fim do dia escolhido o item some sozinho (sem apagar). Sem data, fica até alguém ocultar ou remover.
- **Exibido/Oculto**: interruptor por item. **↑ / ↓**: ordem. **Remover**: pede confirmação e apaga.
- Se houver mais de 8 itens ativos, a tela avisa e só os 8 primeiros da ordem aparecem.

Toda alteração entra em `audit_logs` (`CREATE_HIGHLIGHT`, `UPDATE_HIGHLIGHT`, `SHOW_HIGHLIGHT`, `HIDE_HIGHLIGHT`, `REORDER_HIGHLIGHTS`, `DELETE_HIGHLIGHT`) e tem limite de 60 alterações por hora por pessoa.

## Flag

`highlights_enabled`, **desligada por padrão** (a migração 048 a semeia desligada). É pública (vai ao navegador) e liga-se no painel de flags do modo admin. Desligada, o bloco não aparece e o pacote `destaques` nem é baixado; a tela de gestão continua disponível para preparar os itens antes de ligar.

## Migração 048 (pendente)

`sql/048_home_highlights.sql` cria `home_highlights` (RLS forçado, privilégio mínimo ao `laift_worker`) e a flag. Reversão: `sql/down/048_home_highlights.sql` (apaga os destaques). **Não foi aplicada em nenhum banco**; aplicar pelo fluxo normal de migrações.

## Degradação segura (sem a 048)

- `apiListHighlights` e `apiAdminListHighlights` devolvem lista vazia (`tableMissing: true` na gestão), sem erro 500; a Início mostra só os automáticos, se houver.
- As ações de escrita recusam com a mensagem "Os destaques ainda não estão disponíveis. A atualização do banco está pendente.", sem detalhe do banco.

## Peças

Worker: `worker/src/services/highlightsService.js`, ações `apiListHighlights` (exige sessão) e `apiAdminListHighlights`, `apiAdminSaveHighlight`, `apiAdminSetHighlightActive`, `apiAdminReorderHighlights`, `apiAdminDeleteHighlight`. Frontend: `highlights.js` (bloco), `highlights-manage.js` (gestão), `highlights.css`, todos no pacote sob demanda `destaques` (`lazy-bundles.js`).
