### A Liga

Alvos: `liga.html` (página pública, sem login) e a faixa "Conheça a LAIFT" da tela de entrada de `index.html`. A automação (`frontend/scripts/e2e/liga.e2e.js`) cobre a lógica, o CSP, o axe e os alvos de 44 px; este roteiro cobre o que o leitor de tela anuncia.

Preparação:
1. Confirme com a diretoria o estado da flag pública `selection_open` no painel admin. Não altere a flag para o teste; teste os dois estados (desligada e ligada) só com a flag que a diretoria já definiu.
2. Desktop: NVDA com Chrome. Celular: VoiceOver com Safari em iPhone (ou simulador) na largura de 375 px.
3. Abra `liga.html` (não `/liga`) e recarregue a página antes de cada estado.

Passos:
1. Landmarks (no NVDA, tecla D; no VoiceOver, rotor): cabeçalho com "← Início" e o logo LAIFT; "conteúdo principal"; navegação "Inscrição".
2. Título: a página tem um único nível 1, "Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia (LAIFT)".
3. Status (`#liga-status`, logo abaixo do título): ouça o texto completo ao carregar.
   - Flag desligada: "Inscrições fechadas no momento. Acompanhe @laift.liga."
   - Flag ligada: "Processo seletivo aberto".
4. Navegação "Inscrição": com a flag ligada, o primeiro link é "Inscrever-se" e o segundo é "Saiba mais". Com a flag desligada, só "Saiba mais".
5. Seção "Processo seletivo", bloco de perguntas logo depois da lista de etapas: na pergunta "Quem pode participar?", ative para expandir e de novo para recolher.
6. Ative "Inscrever-se" (só com a flag ligada) e verifique se a página da Liga continua na aba de origem.
7. Seção "Contato": ouça o link "@laift.liga".
8. Tela de entrada (`index.html`): depois de "Criar conta" e "Esqueci minha senha", ache o texto "Processo seletivo aberto" (só com a flag ligada) e o link "Conheça a LAIFT". Ative o link: deve abrir `liga.html` na mesma aba.

O leitor deve anunciar:
- Os landmarks "cabeçalho", "conteúdo principal" e a navegação "Inscrição", com nome.
- O título de nível 1 completo.
- O texto completo do status, no passo 3 de cada estado.
- Cada link com o nome visível e a função "link".
- Cada pergunta frequente como "expandido" ou "recolhido" (estado do disclosure).
- Na faixa de `index.html`, o aviso antes do link "Conheça a LAIFT".

Critério de falha:
- Falta algum landmark, ou a navegação não se chama "Inscrição".
- O status não é lido, ou é lido sem o texto completo do estado.
- "Inscrever-se" aparece com a flag desligada, ou não aparece com a flag ligada.
- Uma pergunta frequente não informa "expandido" ou "recolhido".
- O link "Conheça a LAIFT" não é anunciado como link, ou não leva a `liga.html`.
- O aviso "Processo seletivo aberto" aparece com a flag desligada, ou não aparece com a flag ligada.
- Link que abre em nova aba sem aviso no nome acessível ("Inscrever-se" e "@laift.liga"). Estado atual: falha (achado conhecido). A correção cabe ao dono da página, por exemplo um texto oculto "(abre em nova aba)" no nome do link.
