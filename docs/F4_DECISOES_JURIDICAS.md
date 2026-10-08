# F4 — Decisões jurídicas pendentes (checklist e minutas)

> **MINUTA — revisão jurídica pendente.** Este documento não é parecer nem texto final. As cláusulas sugeridas são propostas para o advogado da liga revisar, e nenhuma delas vale como cláusula antes dessa revisão. Foi escrito pelo time técnico em 2026-10-08 com base na Política de Privacidade (versão 2026-10-08) e nos Termos de Uso (versão 2026-09-25), e conferido contra o código de `worker/` e `frontend/` na mesma data.

## Escopo e estado

Os itens (a) a (e) ficam fora desta rodada porque dependem de decisão jurídica. Nenhum deles está implementado: a busca no repositório em 2026-10-08 não achou `client_events`, `shared_assets`, mentores, NPS, PubMed/NCBI nem medição de Web Vitals no front. A F4 começa com `shared_assets` (migração 025, em `feat/v5-f4-acervo`, `docs/TIME_CONTRATO.md`), e os itens abaixo entram depois que o dono decidir.

## Quadro-resumo

| Item | Decisão necessária | Recomendação técnica | Ponto de partida legal |
|---|---|---|---|
| (a) Mentores | Quem pode ser mentor, o que aparece, se existe página pública | Só listagem para membros; página pública apenas com opt-in e campos escolhidos pelo mentor | Consentimento (art. 7º, I); Política seções 2, 3, 4 e 8 |
| (b) Casos clínicos colaborativos | Quem vê, quem remove, como o termo é aceito | Só casos aprovados, visíveis a membros; termo proíbe dado real de paciente; remoção com motivo em auditoria | Dado de saúde é sensível (art. 5º, II; art. 11); RIPD (J3) |
| (c) `client_events`, NPS, Web Vitals | Base legal, retenção e opt-out | Telemetria sem identificador de conta; NPS opt-in; atualizar a Política antes de ligar | Política seção 5 já promete atualização antes de script de analytics no navegador |
| (d) Bibliografia (PubMed) | Titular da chave, origem da chamada, direitos autorais | Chave institucional como segredo do Worker; guardar só metadados e link | Política seção 5 (terceiros); direitos de editoras |
| (e) Acervo `shared_assets` | Autoria, moderação, licença, remoção, retenção após exclusão | Autoria opt-in e anônima para membros, identificada para admins; licença não exclusiva com retirada | Código de Conduta ("usar seu nome e perfil reais") |

## Regras comuns a todos os itens

- **Versões.** `LEGAL_VERSIONS` em `worker/src/constants.js` tem `TERMS: '2026-09-25'` e `PRIVACY: '2026-10-08'`. Cada item que mudar o texto de forma material sobe a versão no código, na página e no documento, juntos (cabeçalho da Política). A Política seção 10 diz que a plataforma hoje não pede novo aceite a cada versão; os Termos seção 8 dizem que contas existentes podem precisar reaceitar. Se o item depender de consentimento, recomenda-se pedir reaceite antes de ligar.
- **Dono do arquivo.** `LEGAL_VERSIONS` mora em `worker/src/constants.js`, arquivo do backend. A mudança é feita pelo dono do backend, não pelo time de documentação.
- **Dado pessoal dentro de conteúdo.** A Política (seções 4 e 5) já pede que não se escreva dado pessoal nas conversas com a IA. Nos conteúdos colaborativos (b, e), a Política e o termo precisam dizer o mesmo.
- **Encarregado (LGPD, art. 41).** A Política (seção 1) indica só um canal de contato e não nomeia encarregado. O advogado precisa confirmar se a liga se enquadra em dispensa para agente de pequeno porte (regra da ANPD a confirmar) ou se deve nomear o encarregado.
- **Revisão de todo o texto.** O risco J2 (`docs/riscos-residuais.md`) continua valendo: as minutas atuais não têm revisão de advogado.

## (a) Mentores

**Estado.** Inexistente no código. Está previsto na F4 (`docs/ANDAMENTO.md`, linha 137).

**Decisões necessárias.**
1. Quem pode virar mentor: qualquer membro que peça, ou só quem a diretoria indicar?
2. Onde o perfil aparece: só para membros logados, ou também em página pública `/mentores/<slug>`?
3. Quais dados aparecem, e quem escolhe o canal de contato.

**Opções.**
- A. Listagem só para membros autenticados. Nenhuma exposição pública.
- B. Página pública por mentor, com opt-in e campos escolhidos pelo próprio mentor.
- C. Nenhum perfil de mentor nesta fase.

**Recomendação.** A como padrão. B só com consentimento expresso, revogação que tira a página do ar e pede a remoção dos buscadores. Telefone e e-mail não aparecem, salvo quando o próprio mentor escolher um canal de contato; nesse caso a Política precisa dizer isso.

**Base legal e riscos.** Consentimento específico para a finalidade (art. 7º, I; art. 8º, §4º). A Política (seção 4) diz que não exibimos telefone nem e-mail completo em nenhuma listagem, e a página pública segue a mesma regra. Os Termos (seção 5) concedem exibição "para os demais membros/administradores"; página pública fica fora dessa concessão.

**Minuta para a Política.**
- Seção 2: "Dados de mentoria: nome de exibição, área de atuação, descrição e canal de contato, se você escolher informá-lo."
- Seção 3: linha nova, finalidade "publicar seu perfil de mentor", base "consentimento (inciso I), revogável a qualquer momento".
- Seção 4: "Se você for mentor com perfil público, esse perfil fica acessível a qualquer pessoa na internet."
- Seção 8: "Ao revogar, o perfil sai da página pública em [PRAZO A DEFINIR] e a liga pede a remoção dos buscadores."

**Minuta para os Termos.** Cláusula nova: "O mentor responde pelo conteúdo do próprio perfil. A liga pode retirar o perfil por violação do Código de Conduta."

**Decisão do dono.** Prazo de retirada e se a página entra no mapa do site (sitemap).

## (b) Termo de casos clínicos colaborativos

**Estado.** O acervo de casos já existe em parte. `caseSource` aceita `builtin`, `acervo` ou `ia` (`docs/PLANO_FASES_2_3_4.md`, linha 131). A listagem só mostra casos `approved` (`worker/src/services/clinicalService.js`, linha 251), e um admin aprova e publica o caso no acervo (linhas 357 a 373). O acervo coletivo com moderação está planejado (`docs/PLANO_FASES_2_3_4.md`, linha 138). O risco J3 (`docs/riscos-residuais.md`) trata de dado pessoal de paciente em caso escrito por usuário.

**Dado de saúde.** Caso clínico escrito por pessoa real pode trazer dado de saúde de paciente. Dado de saúde é dado pessoal sensível (art. 5º, II), e seu tratamento tem regras próprias (art. 11). A recomendação é proibir dado real no termo e tratar o acervo como conteúdo fictício. O advogado precisa confirmar se a varredura de dados pessoais e a moderação bastam, ou se é preciso relatório de impacto (RIPD, art. 38), como o J3 já prevê.

**Decisões necessárias.**
1. Quem vê os casos colaborativos: membros, depois de aprovados; só administradores; ou público.
2. Quem pode remover um caso, e com qual motivo.
3. Como o termo é aceito e versionado: a cada caso enviado, ou uma vez por conta.

**Opções e recomendação.**
- Visibilidade: A) membros, depois de aprovados; B) só administradores; C) público. Recomendado A. C fica fora desta fase.
- Remoção: o admin remove com motivo de uma lista fechada (dado pessoal, conteúdo impróprio, direito autoral, pedido do autor, erro clínico). A remoção fica em `audit_logs`, o caso sai da listagem na hora, e o autor é informado do motivo. O autor pode pedir a retirada a qualquer momento (art. 18, VI, para dados tratados com consentimento).
- Aceite: termo versionado, com chave própria em `LEGAL_VERSIONS`, aceito a cada envio. A versão aceita fica gravada junto ao caso.

**Minuta para o termo.** "Ao enviar um caso, você declara que ele é fictício ou anonimizado: não contém nome, data de nascimento, documento, endereço, imagem nem qualquer dado que permita identificar uma pessoa real. Você concede à liga licença não exclusiva para exibir o caso aos membros aprovados e para revisá-lo. Você pode pedir a retirada a qualquer momento."

**O que a Política precisa dizer.** Seção 2: casos colaborativos enviados por você, com a data do envio e a versão do termo aceito. Seção 3: execução de contrato (inciso V) e aceite do termo. Seção 4 ou 5: não enviar dado de paciente real. Seção 7: retenção do caso após a exclusão da conta (ver item e).

**O que os Termos precisam dizer.** Seção 5: a licença acima, expressa e separada da concessão geral. Seção 7: o conteúdo clínico colaborativo é educativo e não substitui orientação profissional. Hoje a seção 7 limita responsabilidade de forma genérica e não trata desse conteúdo.

## (c) `client_events`, NPS e Web Vitals

**Estado.** Não existe no código. O front não tem medição de Web Vitals nem `navigator.sendBeacon`. A Política diz hoje que a medição de acesso é feita só pela Cloudflare, de forma agregada, sem cookies e sem script de analytics no navegador (seções 4 e 5). E diz: "Se um dia passarmos a carregar um script de analytics no navegador, esta Política será atualizada antes." Esse compromisso vale para `client_events` e Web Vitals.

**Lacuna que já existe.** A Política (seção 6) cita só o token de sessão no `localStorage`. O front grava outros dados no navegador, em módulos de produção: `laift_resolved_cases` (`frontend/modulos/clinica/clinic-engine.js`), `laift_atlas_history` (`frontend/modulos/anatomia-3d/js/api-cache.js`) e `laift_composto_transferido` (`frontend/modulos/laboratorio/studio/studio.js`). É preciso confirmar se cada chave guarda dado pessoal e, se guardar, descrevê-la na seção 6.

**Decisões necessárias.**
1. Base legal de cada dado: consentimento (art. 7º, I) ou legítimo interesse (art. 7º, IX), com o teste de balanceamento registrado.
2. Se o evento leva identificador de conta.
3. Prazo de retenção e como a pessoa desliga a coleta.

**Recomendação por item.**
- Web Vitals: sem identificador de conta e sem conteúdo, agregado. Legítimo interesse, como a Política já faz para desempenho (seção 3), com o teste de balanceamento registrado. Só liga depois da Política atualizada.
- `client_events`: sem texto livre. Sem identificador de conta, legítimo interesse. Com identificador, consentimento. Pseudonimização de curta duração é alternativa a avaliar.
- NPS: consentimento. Responder é opcional e a pergunta não reaparece depois da resposta ou da recusa.
- Opt-out: uma opção em "Meu perfil" (onde já estão as preferências) desliga `client_events` e NPS. Web Vitals não tem opt-out se não identificar a pessoa, e a Política deve dizer isso.
- Retenção (proposta a validar): eventos brutos por até 30 dias e, depois, só agregados sem identificador. O risco J4 (`docs/riscos-residuais.md`) mostra que a Política ainda não declara prazos de `audit_logs` e `error_logs`; a revisão deve tratar os dois juntos.

**Minuta para a Política.**
- Seção 2: "Métricas de uso e desempenho da plataforma (eventos de navegação e tempo de carregamento) e respostas de pesquisa de satisfação (NPS), quando você as envia."
- Seção 3: uma linha por dado, com finalidade e base legal.
- Seção 4: a frase "não usamos cookies... nem scripts de analytics" só continua verdadeira sem script próprio de eventos. Se `client_events` for enviado pelo próprio site, a frase muda.
- Seção 6: descrever as chaves do `localStorage` que guardam dado vinculado à conta.
- Seção 7: prazos de retenção aprovados.
- Seção 8: "Você pode desativar a coleta de eventos de uso em 'Meu perfil' e não responder à pesquisa. Essa escolha não afeta o uso da plataforma."

## (d) Bibliografia (PubMed/NCBI)

**Estado.** Não existe no código. Está prevista na F4 (`docs/ANDAMENTO.md`, linha 137). A Política (seção 5) cita o NCBI só pelo laboratório virtual, para estruturas químicas. Uma busca bibliográfica é outro serviço e precisa de linha própria.

**Decisões necessárias.**
1. Titular da chave de API: conta institucional da liga, não conta pessoal.
2. De onde sai a chamada: do Worker (o servidor envia o termo) ou do navegador (o endereço IP da pessoa vai ao NCBI). Recomendação: Worker.
3. O que guardar e exibir: metadados e link, ou também o resumo.

**Pontos.**
- **Chave.** Segredo do Worker, nunca no repositório nem no chat (`docs/TIME_CONTRATO.md`, regra de segredo).
- **Limites.** Conferir na documentação do NCBI E-utilities a taxa vigente, com e sem chave, antes de fixar o limite interno. Referência a confirmar: 3 requisições por segundo sem chave e 10 com chave.
- **Direitos autorais.** Resumos e textos de periódicos têm direitos das editoras. Recomendação: guardar só metadados (título, autores, revista, ano, PMID, DOI) e o link, sem reproduzir resumo nem texto integral. O advogado confirma o que a política do NCBI permite exibir.
- **Cache.** Prazo curto para respostas em cache. Sem base espelho dos registros bibliográficos.
- **Dado pessoal.** O termo digitado pelo membro sai para o NCBI. A Política precisa dizer isso, e a orientação de não escrever dado pessoal vale aqui também.

**Minuta para a Política.** Seção 5, lista de terceiros: "NCBI (PubMed), para busca de referências bibliográficas. Enviamos apenas os termos que você pesquisa, nunca dados da sua conta. [Se a chamada sair do navegador: o serviço pode registrar o seu endereço IP.]" Seção 3: finalidade "buscar referências bibliográficas", base "execução de contrato (inciso V)".

**Minuta para os Termos.** Cláusula de conteúdo de terceiros: "As referências bibliográficas vêm de bases externas, e a origem de cada registro é indicada. A liga não garante a exatidão desses registros."

## (e) Acervo compartilhado (`shared_assets`)

**Estado.** Não existe no código. É a primeira fatia da F4 (migração 025, `feat/v5-f4-acervo`). A Política (seção 5) já descreve um precedente: casos gerados com IA podem ir à biblioteca depois de revisão da diretoria, com o vínculo de autor visível só para administradores.

**Decisões necessárias.**
1. Autoria: opt-in e anônima por padrão (já previsto no plano). Quem vê o autor: só administradores?
2. Moderação: quem aprova, e o que acontece com recusas.
3. Licença e retirada.
4. Retenção quando a conta é excluída.

**Pontos.**
- **Autoria anônima x Código de Conduta.** Os Termos (Código de Conduta, "O que se espera de você") pedem "usar seu nome e perfil reais". Isso conflita com autoria anônima para membros. O mesmo Código já diz que "a plataforma não é anônima entre seus administradores, mesmo quando um recurso for exibido sem identificação direta a outros membros". Recomendação: alinhar o Código a essa segunda frase, com autoria anônima para membros e identificada para administradores.
- **Moderação.** Só o que for aprovado aparece na listagem, como no acervo de casos (`clinicalService.js`, linha 251). Recusa e remoção registram motivo.
- **Licença.** Os Termos (seção 5) hoje cobrem só "exibir dentro da plataforma". Proposta: licença não exclusiva, sem remuneração, enquanto o item estiver publicado, com retirada pelo autor e efeito imediato na listagem.
- **Cópias fora da plataforma.** A fatia 1 prevê impressão (`print.js`, segundo o plano de execução v2 da F4). Cópias impressas ou baixadas ficam fora do controle da liga, e os Termos precisam dizer isso.
- **Retenção após exclusão de conta.** A Política (seção 7) mantém de forma anonimizada só auditoria, votos e participações em decisões coletivas. O acervo precisa de regra própria: (A) remover o conteúdo; (B) manter o conteúdo sem vínculo, como histórico da liga. Recomendação: B só se a varredura confirmar que o conteúdo não tem dado pessoal, e a Política precisa dizer isso. Caso contrário, A.
- **Dado pessoal no conteúdo.** Mesma regra do item (b).

**O que a Política precisa dizer.** Seção 2: autoria de itens do acervo, quando você opta por aparecer, e o conteúdo que você publica. Seção 3: consentimento (inciso I) para exibir a autoria; execução de contrato (inciso V) para o restante. Seção 7: a regra escolhida após a exclusão da conta. Seção 8: revogação e retirada.

**O que os Termos precisam dizer.** Seção 5: a licença acima. Código de Conduta: trocar "usar seu nome e perfil reais" pela autoria anônima para membros e identificada para administradores. Seção 8: reaceite das contas existentes, se a licença for nova.

## Checklist para o dono e o advogado

- [ ] (a) Escolher A, B ou C; prazo de retirada do perfil público; decidir sobre sitemap.
- [ ] (b) Visibilidade; lista de motivos de remoção; decidir se é preciso RIPD.
- [ ] (c) Base legal por dado; prazos de retenção; local do opt-out; chaves do `localStorage` a descrever.
- [ ] (d) Titular da chave do NCBI; taxa confirmada na documentação; regra de direitos autorais; origem da chamada.
- [ ] (e) Autoria anônima e alinhamento do Código de Conduta; licença; regra após a exclusão da conta.
- [ ] Transversal: encarregado (art. 41); prazos de `audit_logs` e `error_logs` (J4); versões de `LEGAL_VERSIONS`; reaceite; revisão de todo o texto pelo advogado (J2).

## Base de verificação (2026-10-08)

- Lidos: `docs/POLITICA_DE_PRIVACIDADE.md` (2026-10-08), `docs/TERMOS_DE_USO.md` (2026-09-25), `docs/TIME_CONTRATO.md`, `docs/ANDAMENTO.md` (linha 137), `docs/PLANO_FASES_2_3_4.md` (linhas 131 e 138), `docs/riscos-residuais.md` (J2, J3, J4).
- Código: `worker/src/constants.js` (`LEGAL_VERSIONS`), `worker/src/services/clinicalService.js` (linhas 236 a 251 e 357 a 373), `localStorage` em `frontend/modulos/clinica/clinic-engine.js`, `frontend/modulos/anatomia-3d/js/api-cache.js` e `frontend/modulos/laboratorio/studio/studio.js`.
- Sem ocorrências no repositório: `client_events`, `shared_assets`, PubMed, mentores, NPS; sem medição de Web Vitals no front.
