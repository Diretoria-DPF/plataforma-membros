# Roteiro de teste com leitores de tela

Quem executa: o dono do projeto, manualmente, com NVDA, JAWS e VoiceOver. Nenhum agente faz esse teste. A evidência automática (árvore de acessibilidade e axe) está em `docs/qa/A11Y_EVIDENCIA_2026-10.md`. Ela não substitui o teste com leitor.

## Preparação

- **NVDA:** gratuito, para Windows. Anote a versão.
- **JAWS:** para Windows, com demonstração de 40 minutos. Anote a versão.
- **VoiceOver:** já vem no iPhone e no Mac. No iPhone, ligue em Ajustes > Acessibilidade > VoiceOver (ou triplo clique no botão lateral). No Mac, Cmd+F5.
- **Navegador:** anote o nome e a versão. Sugestão: Chrome ou Edge com NVDA e JAWS; Safari com VoiceOver.
- **Ambiente:** [URL do ambiente de teste, o dono preenche].
- **Conta:** use uma conta de teste criada pelo dono. Não escreva senha, e-mail real ou dado pessoal neste roteiro, nem em prints ou gravações.
- **Ações:** não confirme exclusão ou envio real. Quando a tela pedir confirmação, cancele, a menos que o teste peça o contrário no ambiente de teste.
- **Ordem sugerida:** NVDA, depois JAWS, depois VoiceOver. Antes de cada tela, recarregue a página e comece do topo.
- **Teclas:** confira na versão instalada. Elas podem variar entre versões.

## Atalhos básicos

| Ação | NVDA (Windows) | JAWS (Windows) | VoiceOver (Mac) |
|---|---|---|---|
| Ligar ou desligar o leitor | Ctrl+Alt+N | Ctrl+Alt+J | Cmd+F5 |
| Ler a página toda | Insert+seta para baixo | Insert+seta para baixo | VO+A |
| Próximo título | H | H | Rotor (VO+U), opção Títulos |
| Próximo marco (região) | D | D | Rotor (VO+U), opção Marcos |
| Próximo botão | B | B | Rotor (VO+U), opção Controles |
| Próximo campo de edição | E | E | Rotor (VO+U), opção Campos |
| Próximo controle na ordem da tela | Tab | Tab | VO+seta para a direita |
| Parar a fala | Ctrl | Ctrl | Ctrl |

No iPhone, use o rotor (girar com dois dedos) para escolher Títulos ou Controles, e deslize para a direita ou para a esquerda para passar de um item a outro.

## Telas

Falha, em qualquer tela: o leitor não anuncia nome, papel ou estado; anuncia nome errado; a ordem não faz sentido; o foco se perde; uma mensagem de erro ou de sucesso não é anunciada; uma informação só aparece por cor ou ícone.

### 1. Login (`#screen-welcome`, `frontend/index.html`, linhas 75 a 105)

Passos:
1. Abra a página inicial. Ouça o marco principal e o título.
2. Percorra os títulos (H) e depois os controles (Tab) até o fim da tela.
3. Digite e-mail e senha de teste nos campos. A senha não entra no roteiro.
4. Envie com senha errada e ouça a mensagem de erro.

Deve anunciar:
- região "Entrar" e título de nível 1 "Entrar".
- campos "E-mail" e "Senha", cada um com seu nome.
- botões "Entrar", "Criar conta" e "Esqueci minha senha".
- a mensagem de erro do login (`#msg-login`, `role="alert"`) assim que aparecer.

Critério de falha: campo ou botão sem nome; erro não anunciado; foco que não volta ao campo depois do erro.
Conferir: se "Plataforma de Membros" é lido como texto comum.

### 2. Cadastro (`#screen-register`)

Passos:
1. A partir do login, ative "Criar conta".
2. Ouça o título "Criar conta" e a frase que explica que a conta começa como visitante.
3. Percorra os campos com Tab e ouça o rótulo de cada um.
4. Marque e desmarque os dois aceites. Ouça o rótulo de cada um, inclusive o link para os termos.
5. Envie com um campo obrigatório vazio e ouça a mensagem de erro (`#msg-register`, `role="alert"`).

Deve anunciar:
- título de nível 1 "Criar conta".
- "Nome completo", "Nome de usuário", "E-mail" e "Telefone". Esses rótulos têm asterisco. Conferir se o leitor diz "obrigatório".
- "Perfil do LinkedIn (opcional)", "Instagram (opcional)", "Escolaridade (opcional)", "Assuntos de interesse (opcional)" e "Senha (mínimo 8 caracteres)".
- caixa "Li e aceito os Termos de Uso e o Código de Conduta (versão 2026-09-25)", com o estado marcado ou desmarcado. O link para os termos também deve ser anunciado.
- botão "Enviar cadastro".
- a mensagem de erro, se houver.

Critério de falha: rótulo ausente em algum campo; caixa de aceite sem texto; estado marcado ou desmarcado não anunciado; erro não anunciado; foco perdido depois do envio.
Conferir: o campo "Validação da conta" (rótulo e função) e o controle de foto de perfil (escolher foto deve ter nome).
Não envie cadastro real. Use o ambiente de teste.

### 3. Início (painel de membro)

Passos:
1. Entre com a conta de teste de membro. Ouça o título da tela.
2. Ouça os quatro números de destaque: eventos dos últimos 30 dias, tarefas pendentes, horas de estudo e acerto em porcentagem.
3. Percorra a barra inferior por Tab e ouça o nome de cada aba.
4. Chegue ao gráfico principal e veja se ele recebe foco e se tem texto alternativo.

Deve anunciar:
- título "Início" (a página tem um título oculto para leitores de tela).
- barra "Navegação principal", com as abas Início, Aprender, Eventos, Propostas e Tarefas. Conferir as demais abas e se a aba atual é indicada como atual.
- cada um dos quatro números com seu rótulo. Conferir o texto exato.
- gráfico com nome e alternativa textual. Conferir.

Critério de falha: número sem rótulo; aba atual não indicada; gráfico que recebe foco sem nome; título ausente.

### 4. Lia (assistente)

Passos:
1. Use Tab até o botão "Abrir a Lia", ou use Ctrl/Cmd+K. Ouça o nome e o estado do botão.
2. Abra a Lia. Ouça o painel e confira em que lugar o foco foi parar.
3. Digite uma pergunta de teste genérica e envie. Ouça a resposta quando chegar.
4. Feche pelo botão "Fechar a Lia" e, em outra execução, com Esc. Ouça onde o foco volta.
5. Se o ambiente de teste tiver uma conta com aviso ou suspensão, ouça a faixa de aviso e o pedido de redenção.

Deve anunciar:
- botão "Abrir a Lia", com estado recolhido ou expandido.
- painel "Lia" e botão "Fechar a Lia".
- campo "Pergunte à Lia", com a dica "Pergunte sobre a plataforma".
- botão "Enviar".
- "Lia está digitando…" enquanto ela responde. Conferir se é anunciado.
- faixa de aviso (`role="status"`), com o texto "Aviso N de 3".
- com suspensão: botão "Pedir redenção" e campo de pergunta desabilitado.

Critério de falha: o foco não vai ao campo ao abrir a Lia; a resposta não é anunciada; botão sem nome; foco que não volta ao botão ao fechar.
Conferir: a área de mensagens (`#lia-log`) não tem papel nem `aria-live` na leitura do código em `frontend/assistant.js` (linha 571). Se a resposta não for anunciada, registre como falha.
Não digite dado pessoal na pergunta.

### 5. Onboarding (primeira entrada)

Passos:
1. Entre com uma conta de teste que nunca viu o onboarding. Use um perfil limpo do navegador.
2. Ouça o diálogo ao abrir. Ouça o título e o texto do primeiro passo.
3. Use Tab e Shift+Tab. O foco deve ficar dentro do diálogo.
4. Avance com "Próximo" até o último passo, o crachá. Ouça o botão "Concluir".
5. Em execuções separadas, teste "Voltar", "Pular" e Esc.

Deve anunciar:
- diálogo com título e descrição do passo atual.
- "Passo 1 de N" e a atualização a cada passo. N depende do papel da conta. Conferir.
- botões "Pular", "Voltar" e "Próximo". No último passo, "Concluir".
- o crachá como último passo.

Critério de falha: o foco sai do diálogo; o progresso não é anunciado; Esc não fecha o diálogo; ao fechar, o foco não volta para a tela.

### 6. Atalhos de teclado (Ctrl/Cmd+/ e Ctrl/Cmd+K)

Passos:
1. Fora de campo de texto, pressione Ctrl+/ no Windows ou Cmd+/ no Mac.
2. Ouça o diálogo e a lista de atalhos.
3. Use Tab. O foco deve ficar no diálogo.
4. Feche com Esc ou com o botão "Fechar". Ouça onde o foco volta.
5. Pressione Ctrl+K (ou Cmd+K). A Lia deve abrir e o foco deve ir para o campo "Pergunte à Lia".
6. Dentro de um campo de texto, Ctrl+K não dispara. Isso é esperado: o atalho pertence ao campo.

Deve anunciar:
- diálogo com o título "Atalhos de teclado" (título de nível 3). Conferir.
- botão "Fechar".
- os dois itens: "Ctrl/Cmd + /: Mostra esta lista de atalhos" e "Ctrl/Cmd + K: Abre a Lia e foca o campo de pergunta".

Critério de falha: a lista não é lida; o foco não entra no diálogo; ao fechar, o foco se perde; a combinação não é a informada no diálogo.

### 7. Confirmações (`#modal-confirm`, `frontend/index.html`, linha 861)

Passos:
1. Em conta de teste, acione uma ação que pede confirmação. Não confirme exclusão de dado real. Conferir qual ação existe no ambiente de teste.
2. Ouça o diálogo: título e mensagem.
3. Use Tab entre "Cancelar" e "Confirmar". Ouça cada um.
4. Cancele. Ouça onde o foco volta.
5. Repita e confirme, só no ambiente de teste.

Deve anunciar:
- diálogo "Confirmar ação".
- a mensagem da ação, lida como descrição do diálogo.
- botões "Cancelar" e "Confirmar". O segundo é a ação que confirma.

Critério de falha: mensagem não lida; foco que não entra no diálogo; botão sem nome; foco perdido ao cancelar.
Conferir: foco inicial e comportamento da tecla Esc.

### 8. A Liga

A preencher quando a página existir.

## Tabela de resultado

| Data | Leitor e versão | Navegador | Tela | Esperado | Ouvido | OK/Falha | Obs |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## Como reportar uma falha

1. Marque "Falha" na tabela de resultado.
2. Anote: tela, passo, o que foi ouvido (texto exato), o que era esperado, leitor e versão, navegador e data.
3. Classifique a gravidade:
   - Bloqueante: não consegue concluir a tarefa.
   - Alta: informação essencial não é anunciada.
   - Média: nome ou ordem confuso.
   - Baixa: detalhe.
4. Não inclua dado pessoal (nome, e-mail, telefone, senha) em print ou gravação. Use a conta de teste.
5. Registre a falha como issue no repositório, com o título "a11y: <tela> - <leitor>", e encaminhe ao responsável técnico.
