# Dossiê jurídico da plataforma de membros da LAIFT

Preparado em 20/10/2026 para a reunião do presidente (Daniel Pires Francisco) com o advogado da Liga. Objetivo: dar ao advogado um retrato fiel do que a plataforma faz com dados pessoais e com inteligência artificial (IA), para parecer sobre LGPD e temas correlatos.

**Como ler.** Linguagem simples; termos técnicos vêm explicados. Cada fato foi conferido no código e nos documentos do repositório (referências entre parênteses). Onde não foi possível confirmar, está escrito **A CONFIRMAR**. "Base legal sugerida" é a que a própria Política de Privacidade (versão 2026-10-08) já indica, **a validar pelo advogado**. Nenhuma chave ou senha consta aqui. Os textos jurídicos atuais (Termos, Política, Edital) são **minutas sem revisão de advogado** (risco J2 de `docs/riscos-residuais.md`).

---

## 1. O que é a plataforma e quem usa

- **O que é.** Sistema web da Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia (LAIFT, UNINASSAU, Salvador) em `laift.com.br`. Reúne cadastro, eventos e presença, propostas e votações, tarefas, mensagens entre membros, área de estudo ("Aprender": simulados, casos clínicos, laboratório virtual, Atlas 3D), Biblioteca de artigos científicos, blog e o **processo seletivo** de novos membros.
- **Quem opera.** A Política indica a LAIFT como controladora e um e-mail de contato (`laiftligauninassau@gmail.com`). Não há **encarregado (DPO)** nomeado (Política, seção 1). A LAIFT é associação estudantil; **não há CNPJ nem representante legal descritos no código**: A CONFIRMAR.
- **Quem usa (papéis).** Visitante (todo cadastro novo), membro, administrador e cargos funcionais (gestor, revisor, moderador, curador, mentor) que exigem verificação em duas etapas. Promoção a membro ou administrador é ato manual (Termos, seção 3) ou, para membros, a aprovação no processo seletivo.
- **Escala hoje.** Em 12/10/2026 havia cerca de 4 membros, 1 administrador e 3 visitantes (comentário em `worker/src/constants.js`). Ordem de grandeza pequena; o número atual é A CONFIRMAR.
- **Dono do código.** Licença proprietária de Daniel Pires Francisco (cabeçalho dos arquivos). Pergunta de coautoria do Claude no histórico: risco J1.

## 2. Mapa dos dados coletados, por tipo de usuário

### 2.1 Visitante não logado (sem conta)

| Dado | Finalidade | Base legal sugerida (a validar) | Onde fica |
|---|---|---|---|
| Endereço IP, navegador, página, país, desempenho (tratados pela Cloudflare) | Entregar o site, proteger contra ataques, medir audiência de forma agregada | Legítimo interesse (art. 7º, IX) | Cloudflare |
| IP, em forma de código (hash), para limitar abuso | Limite de tentativas e de uso da Guia | Legítimo interesse | Banco, tabela `rate_limit_buckets`, apagada após 8 dias |
| Texto da pergunta à Guia (prévia de IA, se a flag `lia_visitor_ai_enabled` estiver ligada, o que o doc de continuidade de 17/10 diz estar) | Responder dúvidas sobre a plataforma | Legítimo interesse / execução de contrato: A CONFIRMAR | Enviado ao Workers AI (Cloudflare); proteção Turnstile |
| Resposta do desafio Turnstile | Distinguir pessoa de robô | Legítimo interesse | Cloudflare |

Fonte: `docs/SECURITY.md`, `worker/src/services/assistantService.js`, `sql/003_rate_limits.sql`. Detalhe de armazenamento da pergunta do visitante: A CONFIRMAR (a Política só descreve a Guia para quem tem conta).

### 2.2 Visitante com conta e membro

| Dado | Obrigatório? | Finalidade | Base legal sugerida (Política seção 3) |
|---|---|---|---|
| Nome completo, nome de usuário, e-mail, telefone | Sim | Identificar e autenticar | Execução de contrato (art. 7º, V) |
| Senha | Sim | Entrar; guardada só como hash bcrypt, calculado no banco | Execução de contrato |
| Foto de perfil, LinkedIn, Instagram, escolaridade, interesses | Não | Enriquecer o perfil | Consentimento (art. 7º, I) |
| Inscrições em eventos, propostas, votos, tarefas, comentários, feedback | Uso | Governança da liga | Execução de contrato |
| Presença em eventos (data, hora, forma do check-in) | Uso | Registrar presença | Execução de contrato |
| Resultados de simulados e casos clínicos, formulações do laboratório | Uso | Estatísticas e conquistas | Execução de contrato |
| Textos digitados nos recursos de IA (paciente virtual, preceptor, laboratório, Guia) | Uso | Gerar a resposta da IA | Execução de contrato; métricas: legítimo interesse |
| Consentimentos (documento, versão, data) | Sim | Prova do aceite | Cumprimento de obrigação / exercício de direitos: A CONFIRMAR |
| Sessão (código do token em hash, navegador, validade) | Sim | Manter o login | Execução de contrato |
| Mensagens entre membros | Uso | Comunicação; criptografia ponta a ponta (E2EE: só os participantes leem), chave privada fica no aparelho (`docs/riscos-residuais.md` S9) | Execução de contrato |
| Dias de atividade (um registro por pessoa por dia, sem hora nem página) e contadores agregados | Automático | Medir uso do produto (DAU/MAU) | Legítimo interesse; guardado 400 dias |
| Favoritos e sugestões na Biblioteca | Uso | Mostrar a lista do membro | Execução de contrato (Política menciona; ver lacunas) |
| Memória de estudo (nível por tema, preferências, em lista fechada, sem texto livre) | Só com opt-in | Personalizar o tutor | Consentimento; flag `memory_enabled`, desligada (`docs/FEATURE_FLAGS.md`) |

Fontes: `sql/001_schema.sql`, `005`, `007`, `009`, `012`, `013`, `029`, `036`, `040`, `sql/memory/001_memory.sql`, `frontend/privacidade.html`. **Não há** campo de data de nascimento, CPF, endereço ou RG no cadastro.

### 2.3 Administrador e comissão

Além do acima, administradores **veem**: nome, e-mail e todas as respostas dos candidatos do processo seletivo; lista de usuários; auditoria; painel de moderação da Guia (sem nome; só trecho do identificador). Ações administrativas ficam em `audit_logs`. Exigência de MFA: conferida pela flag `mfa_required`, que em 17/10 estava **desligada** (`docs/CONTINUIDADE.md`); cargos funcionais privilegiados exigem MFA sempre. Se todos os administradores atuais usam MFA: A CONFIRMAR.

## 3. Processo seletivo contínuo (candidatos)

**Estado do código.** Fatias 1 e 2 prontas na branch principal (migrações 042 e 043; `worker/src/services/selectionService.js`, `selectionCommitteeService.js`, `frontend/selection.js`). Duas flags: `selection_enabled` (jornada) e `selection_ai_enabled` (triagem por IA). **Estão LIGADAS em produção desde 20/10/2026** (migrações 042 e 043 aplicadas no mesmo dia, com cópia de segurança do banco antes). As inscrições estão, portanto, abertas; o parecer pode exigir ajustes de aviso, retenção e idade. Se a flag for desligada, o site volta ao Google Forms (plano B, `frontend/liga.js`).

**Fluxo.** (1) Criar conta e confirmar e-mail. Quem já é membro não se inscreve. (2) "Antes de começar": três aceites obrigatórios (edital; tratamento de dados pela comissão; aviso de que uma IA organiza e resume as respostas, não decide nem elimina, e que a pessoa pode pedir revisão). (3) Perfil e disponibilidade. (4) Análise de cenário (400 a 2.000 caracteres). (5) Quatro perguntas abertas sobre a forma de pensar. (6) Três situações de conduta. (7) Revisão e envio, com comprovante. (8) Acompanhamento do status. Versão v2 do banco de perguntas: sem questões objetivas.

**Dados do candidato.** Os do cadastro (nome, e-mail, telefone) mais: curso, instituição, semestre, áreas de interesse, horas por semana e dias/turnos, motivação, as respostas livres, data de envio e código do comprovante. O formulário **bloqueia** e-mail, telefone e CPF digitados no texto livre e **marca com sinal** (sem punir) texto que parece dado de saúde ou tentativa de manipular a IA. Eventos da inscrição guardam só metadados (não o texto).

**Prazos do sistema.** Inscrição sempre aberta; prazo individual padrão de 7 dias para concluir; análise em lotes (padrão a cada 15 dias); nova tentativa após 14 dias no código (o plano dizia 30 dias; o **código vale**, `RESTART_COOLDOWN_DAYS = 14`).

**Quem decide.** A comissão, que no código é **qualquer administrador** (diretoria administrativa; `requireAdmin`). Decisões possíveis: em análise, entrevista, aprovado, lista de espera, não selecionado, com observação interna. Aprovar muda o papel da pessoa para membro (registrado em auditoria) e envia e-mail. O candidato vê só o próprio status. Quem compõe a comissão e quem revisa recursos: A CONFIRMAR (pendência 3 do plano).

**Recurso (art. 20).** Após "não selecionado" ou "lista de espera", a pessoa pode pedir revisão (até 600 caracteres), uma vez por inscrição; aparece numa fila do painel. O código **não impede** que quem revisa seja a mesma pessoa que decidiu: A CONFIRMAR se isso importa ao advogado.

**Retenção.** Proposta: apagar dados da inscrição em **12 meses** (`docs/planos/PROCESSO-SELETIVO.md`, seção 7). **Rotina automática implementada em 20/10/2026** (`selectionRetentionService.js`, chamada pelo cron diário em `maintenance.js`; em publicação): inscrições finalizadas (aprovada, não selecionada, retirada, expirada) com mais de 12 meses têm as respostas, o resumo de IA e as observações apagados, mantendo só uma linha mínima (datas e situação); rascunhos parados há mais de 60 dias expiram; eventos antigos são apagados. Além disso, os dados saem se a conta for apagada (cascata).

**Divergência importante.** O **Edital publicado** (`frontend/edital.html`) ainda descreve o Google Forms ("só a comissão trata os dados… fora o Google") e **não menciona IA**, triagem, recurso nem prazo de retenção. O aviso de IA existe apenas dentro da jornada (caixa de aceite).

## 4. Uso de inteligência artificial

### 4.1 Onde a IA é usada

| Recurso | Quem aciona | O que a IA recebe | Provedor | Estado |
|---|---|---|---|---|
| Paciente virtual, preceptor da clínica, geração de casos, preceptor do laboratório | Visitante, membro, admin (com cota diária) | Texto digitado e contexto do caso fictício; **sem** nome/e-mail/ID | Groq | Em uso (Política) |
| Guia (assistente da plataforma) | Qualquer logado; visitante em prévia | Pergunta, últimas mensagens, trechos da base de conhecimento; **sem** nome/e-mail/ID | Groq; vetor da pergunta pelo Workers AI (Cloudflare); prévia do visitante no Workers AI | Em uso |
| Moderação da Guia (juiz) | Automático quando há termo ofensivo | Texto da mensagem ofensiva | Groq | Em uso (Política) |
| Resumo de artigos na Biblioteca | Curadoria | Resumo **público** do artigo (não é dado de pessoa) | Workers AI | Flag ligada |
| **Triagem do processo seletivo** | Comissão (botão), flag `selection_ai_enabled` | Perfil resumido (curso, semestre, áreas, horas, motivação), análise de cenário, respostas abertas e de conduta; **sem nome, e-mail, telefone** | Groq (modelo "inteligente") | Código pronto; **estado da flag A CONFIRMAR** |
| Tutor e agentes, simulação clínica, memória | Maiores de 18 | Texto do estudo | Groq | Desligados por flag (`agents_*`, `clinical_sim_enabled`, `memory_enabled`), exceto se ligados depois: A CONFIRMAR |

### 4.2 Triagem do processo seletivo: garantias no código

Conferido em `worker/src/selection/triage.js` e `selectionCommitteeService.js`:

- A IA devolve só: resumo (até 500 caracteres), até 4 pontos fortes e até 3 pontos a conferir. **Não dá nota, não ordena, não compara candidatos, não recomenda aprovar ou recusar.**
- Se a resposta contiver palavras como aprovar, reprovar, eliminar, recusar, nota ou "x/10", ela é **descartada** (filtro automático).
- O texto do candidato vai entre marcadores como **dado**, com instrução de ignorar ordens escritas nele (defesa contra "prompt injection").
- A IA só roda quando um administrador aciona (no máximo 5 por vez); **nunca** muda o status. A mudança de status só ocorre em `decide`, que grava **quem decidiu** (`decided_by`), quando e a observação, e registra em auditoria.
- Falha ou cota esgotada da IA: a inscrição segue normal, sem resumo.
- O candidato **não vê** o resumo da IA (só o status). O pedido de acesso ao resumo como "dado pessoal" é pergunta ao advogado.
- Limite: o resumo fica **ao lado** das respostas originais no painel (plano); a comissão pode, na prática, confiar demais no resumo (risco de viés de automação). A mitigação é de processo, não de código.

### 4.3 Direito de revisão (LGPD, art. 20)

Fundamento adotado: não há decisão **unicamente** automatizada, pois toda decisão é humana; mesmo assim o candidato é avisado e pode pedir revisão. O texto do aviso foi redigido pela equipe técnica, **sem revisão jurídica** (plano, pendência 4).

### 4.4 Cuidados já existentes nos recursos de IA

Cotas diárias por pessoa; orçamento global de tokens; textos da conversa **não são gravados** (só métrica: recurso, quando, tokens, sucesso) nos simuladores; na Guia a pergunta é guardada **só como código (hash)** e a resposta por 180 dias; avisos "não escreva dados pessoais" nos formulários e na Política.

## 5. Para onde os dados vão (operadores e subprocessadores)

Conferido em `worker/wrangler.toml`, `worker/src/ai/*`, `worker/src/mailer.js`, `frontend/privacidade.html`.

| Operador | Papel | Recebe texto de usuário? | Onde (país) | Estado |
|---|---|---|---|---|
| **Neon** (PostgreSQL) | Banco principal | Sim, tudo que é gravado | **AWS São Paulo (`aws-sa-east-1`), confirmado agora no painel do projeto; plano gratuito**; histórico de recuperação de 6 horas | Em uso |
| **Neon, segundo projeto `laift-memory`** | Memória de estudo (pseudonimizada) | Só códigos e níveis, sem texto livre | Região: **A CONFIRMAR** | Desligado (`memory_enabled`) |
| **Cloudflare** (Workers, rede/CDN, DNS) | Hospeda site e API | Trafega tudo | Rede global (a execução pode ocorrer fora do Brasil) | Em uso |
| **Cloudflare KV** | Cache temporário (60 s) de leituras públicas e contadores | Não deve guardar texto de usuário: A CONFIRMAR | Global | Em uso |
| **Cloudflare R2** | Fotos de perfil, imagens de eventos (**URL pública**) e backups cifrados (bucket privado separado) | Fotos sim | Global | Em uso |
| **Cloudflare Workers AI** | Vetores das perguntas da Guia; prévia do visitante; resumos de artigos | Sim (pergunta) | Global | Em uso |
| **Cloudflare Turnstile** | Antirrobô | Dados técnicos do navegador | Global | Em uso (prévia do visitante) |
| **Groq, Inc.** | IA generativa | **Sim**: texto digitado, incluindo o da triagem do seletivo | **EUA** (transferência internacional, art. 33) | Em uso |
| **Brevo** | E-mail transacional | E-mail do usuário e, quando usado, nome | **A CONFIRMAR** (país dos servidores) | Em uso; remetente Gmail (OPS-04) |
| **NVIDIA** | Reserva de IA | Receberia os mesmos textos do Groq | EUA | **Desligada** (`nvidia_fallback`, `docs/CONTINUIDADE.md` 17/10; confirmar hoje) e sem uso no código além da reserva |
| **OpenRouter** | Só no teste de segurança automatizado do código (CI, "Strix") | **Não** recebe dado de usuário; recebe trechos do **código-fonte** | EUA | Opcional (job é pulado sem chave) |
| **jsDelivr** (CDN de bibliotecas) | Carrega gráficos/moléculas/leitor QR em módulos | Só IP do navegador | Global | Em uso nas páginas de módulo (risco O31b) |
| **PubChem/NCBI, CACTUS/NCI** | Estruturas químicas no laboratório | Só nome/estrutura pesquisada + IP | EUA | Em uso |
| **Crossref, Europe PMC, OpenAlex, Unpaywall, PubMed** | Metadados da Biblioteca | Só DOI/PMID e e-mail da Liga | Vários | Em uso pelo servidor; nenhum dado de usuário |
| **Google (Forms)** | Plano B do seletivo | Sim, enquanto a flag nova estiver desligada | EUA | Em uso no Edital atual |
| **GitHub** | Código, deploy, backup mensal | Backup cifrado | EUA | Em uso; repositório privado desde 17/10 |

**Contratos de operador (DPA).** O repositório não contém acordos/aceites de tratamento de dados com esses fornecedores. Se foram aceitos nos termos padrão de cada um: A CONFIRMAR.

**Sobre o Google Ads.** Ver seção 9.

## 6. Retenção hoje e exclusão

Prazos aplicados por rotina diária (03:17 de Brasília, `worker/src/maintenance.js`, `RETENTION`):

| Dado | Prazo | Declarado na Política? |
|---|---|---|
| `audit_logs` (ações administrativas e de segurança, com ID do autor e detalhes) | **730 dias (2 anos)** | **Não** (risco J4) |
| `error_logs` (diagnóstico técnico) | **30 dias** | **Não** (J4) |
| `ai_usage_log` (métricas de IA, sem texto) | 180 dias | Parcial (180 dias de exclusão geral) |
| Resposta registrada da Guia | 180 dias | Sim |
| Comentário de avaliação da Guia | texto apagado aos 90 dias | Sim |
| Avaliação (polegar, categoria) | 365 dias | Sim |
| Incidentes de moderação da Guia (sem texto) | 365 dias na tabela; **mas a cópia em `audit_logs` fica 730 dias** | Política diz 365 (risco O22) |
| Rastros dos agentes | 90 dias | Não |
| Telemetria do Atlas 3D (anônima) | 90 dias | Não: A CONFIRMAR |
| Dias de atividade e contadores | 400 dias | Aviso na tela de admin; Política: não |
| Sessões, tokens, limites de taxa | Dias após o vencimento | Não detalhado |
| Cadastros nunca confirmados (visitante, sem sessão) | Apagados após 7 dias | Não |
| Memória de estudo | 180 dias sem uso / 12 meses | Fora da Política atual |
| Backup diário cifrado | 7 dias; mensal 400 dias (R2) | Não |
| **Dados do processo seletivo** | **Proposto 12 meses; NÃO implementado** | Não |
| Conta e demais dados | Apagados a pedido em até **180 dias** | Sim |

**Exclusão de conta.** Feita **manualmente** pelo responsável, por pedido ao e-mail; **não há botão**. Ao apagar o perfil, a maior parte sai por cascata (sessões, consentimentos, inscrição do seletivo, favoritos); autoria em alguns registros vira "vazio"; auditoria pode permanecer sem vínculo. Um gatilho enfileira a limpeza da memória no outro banco. O prazo de 180 dias é longo para a maioria dos casos e o advogado pode querer reduzi-lo.

**Backups.** Os backups conservam dados já apagados até o vencimento (7 dias diário; 400 dias mensal). A Política não diz isso.

## 7. Segurança (LGPD, art. 46)

Resumo de controles conferidos no código e em `docs/SECURITY.md`:

- **Senhas:** hash bcrypt feito no banco; tempo de resposta uniforme para não revelar se o e-mail existe.
- **Sessão:** token aleatório; só o hash com "pepper" (segredo do servidor) é gravado; validado no banco a cada chamada. Validade de 30 minutos no navegador; cookie HttpOnly (`__Host-pm_session`, Secure, SameSite=Lax) **ligado em produção desde 17/10** para o domínio próprio.
- **MFA (verificação em duas etapas, TOTP):** disponível; obrigatória para cargos privilegiados; para administradores só com a flag `mfa_required` (desligada em 17/10).
- **Limites de taxa:** por conta, por IP (guardado em hash) e globais para login, cadastro, redefinição de senha, IA, seletivo, mensagens etc.
- **Isolamento no banco (RLS):** cada tabela com acesso restrito por papel de banco com privilégio mínimo (migrações 031/032); a memória de estudo tem RLS por pessoa e pseudônimo (HMAC) em banco separado.
- **Proteção do navegador:** CSP (política de scripts permitidos) por página, sem scripts inline; `frame-ancestors 'self'`; HSTS de 7 dias subindo por degraus; `nosniff`; Referrer-Policy; Permissions-Policy (câmera só do próprio site, para o QR de presença).
- **Registros (logs):** auditoria de ações; erros sem corpo de dados pessoais.
- **Backup:** diário, **cifrado (age)** antes de sair do runner, no R2 privado; chave privada guardada pelo dono. **A restauração completa nunca foi treinada** (risco O1/OPS-03).
- **Pontos fracos conhecidos** (`docs/riscos-residuais.md`): módulos em iframe do mesmo domínio (S4); `window.App.getState()` expõe o estado a scripts da mesma origem (O37); códigos de IP em hash simples (SHA-256 sem segredo, reversível por força bruta em IPv4: observação desta equipe, não consta nos riscos); Semgrep só informativo (O6); sem plano formal de **resposta a incidentes** nem prazo de comunicação à ANPD documentado no repositório (A CONFIRMAR); o banco está no plano gratuito, sem recuperação de longo prazo.

## 8. Menores de idade

Conferido em `sql/`, `worker/src`, `frontend/index.html`:

- **O cadastro não pergunta idade nem data de nascimento e não tem declaração "tenho 18 anos ou mais".** Os Termos (seção 3) dizem que "qualquer pessoa pode solicitar cadastro". A Política e os Termos **não tratam de menores**. Portanto **a plataforma não impede nem identifica** um menor que se cadastre.
- O código parte da **premissa** (documentada em `worker/src/agents/eligibility.js`) de que conta existente = maior de 18 anos, e usa isso para liberar tutor, agentes, memória e simulação clínica "só para maiores de 18". Como o dado não existe, a premissa não é verificada.
- O Edital atual exige estar matriculado ou formado em curso da saúde (em regra, maiores). O formulário antigo do Google (relatado em `docs/riscos-residuais.md` J7) aceitava a faixa de 12 a 17 anos. A flag `minors_enabled` **não existe no código** (apenas mencionada em documentação).
- Risco J7 classificado como **Alto, certo** de ocorrer quando houver abertura ampla. Decisão pendente do advogado: exigir declaração de maioridade? coletar data de nascimento? aceitar 16 a 17 com assistência dos responsáveis (art. 14)? bloquear o seletivo para menores?

## 9. Cookies e scripts de terceiros

- **Google Ads / Google Analytics / pixels de redes sociais:** **nenhum** código encontrado em `index.html`, nas demais páginas HTML, em `_headers` ou nos scripts do repositório (busca por gtag, googletagmanager, doubleclick, adsbygoogle, fbq, hotjar, clarity). Além disso, a política de segurança de conteúdo (CSP) de `index.html` só permite scripts do próprio site e de `challenges.cloudflare.com` (Turnstile), de modo que uma etiqueta do Google **seria bloqueada** no app. Um script injetado fora do repositório (por exemplo, recurso do painel da Cloudflare como Zaraz ou Web Analytics automático, ou página externa como o Google Forms): **A CONFIRMAR no painel**. Se a Liga pretende fazer campanhas no Google Ads, será preciso consentimento e atualizar a Política.
- **Cookies reais:** um só, de **sessão** (`__Host-pm_session`), estritamente necessário, **sem consentimento** pedido. Não há banner de cookies. A Política diz "não usamos cookies de rastreamento", mas **não menciona o cookie de sessão** (a seção 6 fala só do `localStorage`).
- **Armazenamento no navegador:** a Política cita só o token de sessão. O front também grava `laift_resolved_cases`, `laift_atlas_history` e `laift_composto_transferido` (risco J5) e cache do aplicativo instalável (PWA): não descritos.
- **Scripts de terceiros que carregam em páginas de módulo:** jsDelivr (3Dmol, smiles-drawer, html5-qrcode), com versão fixa e verificação de integridade. A Política os declara.
- **Mapa:** na página da Liga, mapa só por clique (OpenStreetMap), conforme `docs/CONTINUIDADE.md`; a Política ainda não cita (pendência do dono).
- **Medição de acesso:** feita pela Cloudflare "de forma agregada, sem cookies"; a Política se compromete a atualizar antes de qualquer script de analytics no navegador.

## 10. Textos jurídicos atuais: resumo e lacunas

### 10.1 Termos de Uso (versão 2026-09-25)

Resumo: aceite registrado e versionado; cadastro aberto a qualquer pessoa; conta nasce visitante; promoções manuais; responsabilidade pela senha; nome completo não editável; conteúdo enviado com licença para exibir aos demais membros; votos pessoais; "como está" e limitação de responsabilidade; Código de Conduta (respeito, nome real, proibição de doxing, múltiplas contas, testes de vulnerabilidade sem aviso); banimento.

Lacunas: **nada sobre IA** (limites, erro clínico, dever de não inserir dados pessoais ou de pacientes); **nada sobre menores**; nada sobre o processo seletivo; Código de Conduta pede "nome e perfil reais" (conflito com a futura autoria anônima do acervo, J6); a cláusula de responsabilidade não trata de conteúdo clínico educativo; não há foro nem lei aplicável; versão pede reaceite, mas a Política diz que hoje não pede (inconsistência entre seção 8 dos Termos e seção 10 da Política).

### 10.2 Política de Privacidade (versão 2026-10-08)

Cobre: controlador, dados, finalidades e base legal por dado (tabela), o que não fazemos, onde ficam e operadores, Guia, Biblioteca, retenção da Guia, direitos do art. 18, revisão humana da suspensão da Guia (art. 20), ANPD.

Lacunas conhecidas:
1. **Processo seletivo** não consta (nem dados, nem IA do seletivo, nem recurso, nem prazo de 12 meses).
2. **Retenção** de `audit_logs` (2 anos) e `error_logs` (30 dias), telemetria, atividade, backups, memória e demais (J4).
3. **Cookie de sessão** e outras chaves do navegador (J5).
4. **Menores** e idade mínima (J7).
5. **Encarregado (art. 41)** não nomeado; contato único é um Gmail.
6. **Transferência internacional (art. 33):** citada de forma genérica; não indica o mecanismo (cláusulas contratuais, consentimento específico etc.).
7. **Dados sensíveis (art. 11):** a Política pede para não escrever dados de saúde, mas o simulador e o seletivo podem recebê-los por engano; o texto não explica o que ocorre se acontecer.
8. **Exclusão manual em até 180 dias:** não há canal automatizado nem confirmação de identidade descrita.
9. **Mensageria (E2EE), conexões/bloqueios/denúncias, tarefas, QR de presença, crachá virtual:** pouco ou nada descritos.
10. **Incidente de segurança:** não há compromisso de comunicação.
11. **Brevo e outros operadores:** países e salvaguardas não informados.
12. Inconsistência: Política diz que incidentes de moderação duram 365 dias, mas a cópia em auditoria dura 730 (O22).
13. Texto diz que "o aceite corresponde à versão vigente"; versões antigas não são reapresentadas.

### 10.3 Edital do Processo Seletivo 2026 (`frontend/edital.html`)

Publica três etapas, "a divulgar" para datas, vagas e pesos; avaliação com análise de cenário; compromissos do membro (inclui confidencialidade de dados). **Seção 8 (Privacidade)** diz que os dados são tratados só pela comissão e só para triagem de currículo e comunicação oficial; que, fora o Google, não são compartilhados. **Lacunas:** reflete o Google Forms, não a jornada nativa; **sem aviso de IA**; sem direito de revisão/recurso; sem retenção; sem base legal; sem idade mínima; "só a comissão" não bate com o fato de que **qualquer administrador** acessa; se a Groq (EUA) recebe os textos, a frase "não são compartilhados com terceiros" ficará imprecisa; candidatos reprovados que mantêm conta ficam como visitantes.

## 11. Riscos residuais conhecidos (jurídicos e de dados)

Extraídos de `docs/riscos-residuais.md` (revisão em 03/10 e 08/10/2026; as linhas J7 e O22 etc. seguem abertas):

| # | Risco | Situação |
|---|---|---|
| J1 | Coautoria do Claude em 224 commits (e 242 com trailer) pode afetar registro no INPI | Histórico não reescrito; INPI adiado; vai ao advogado |
| J2 | Termos e Política sem revisão de advogado | A mitigar |
| J3 | Casos clínicos escritos por usuários podem conter dado de paciente (dado sensível) | A mitigar: termo de anonimização, moderação, RIPD (Relatório de Impacto) |
| J4 | Política não declara retenção de `audit_logs` e `error_logs` | A mitigar |
| J5 | Política não descreve outras chaves do navegador | A mitigar |
| J6 | Código de Conduta ("nome real") x autoria anônima do acervo | A mitigar antes da F4 |
| J7 | **Menores**: sem controle de idade | A mitigar, antes da abertura ampla |
| BI3 | Artigos com licença não comercial | Parecer jurídico pedido |
| BI6 | Política sem parágrafo sobre favoritos/sugestões da Biblioteca | A Política atual já tem o parágrafo "Biblioteca LAIFT" (conferido na versão 2026-10-08); o doc de riscos está desatualizado |
| O19 | Texto ofensivo é enviado à Groq para confirmação | Aceito; declarado na Política |
| O22 | Prazo divergente (365 x 730) do incidente | A decidir |
| O1 | Restauração de backup nunca treinada | A mitigar (técnico) |
| OPS-04 | Remetente de e-mail é um Gmail | A mitigar |

Decisões jurídicas pendentes da próxima fase (`docs/F4_DECISOES_JURIDICAS.md`): mentores com página pública, casos clínicos colaborativos, telemetria no navegador/NPS, bibliografia (PubMed) e acervo compartilhado. Nenhum está implementado.

## 12. Perguntas ao advogado (numeradas)

**Prioridade alta**
1. **Menores.** A plataforma e o seletivo devem exigir declaração de maioridade, data de nascimento ou bloquear menores? Se aceitar 16 a 17 anos, qual o procedimento (art. 14, consentimento dos responsáveis)? Existe base para manter o que já foi coletado?
2. **Triagem por IA no seletivo.** O fluxo atual (a IA só resume; a decisão é de pessoa; aviso e aceite na jornada; pedido de revisão) afasta o art. 20 da LGPD? O candidato tem direito de acessar o resumo gerado? O que deve constar no aviso?
3. **Transferência internacional.** Enviar texto de candidatos e usuários à Groq (EUA) exige consentimento específico, cláusulas-padrão ou outro mecanismo (art. 33)? Os contratos padrão dos operadores bastam como DPA?
4. **Base legal do seletivo.** É execução de procedimentos preliminares de contrato, legítimo interesse ou consentimento? Como lidar com texto que contenha dado de saúde (art. 11) enviado por engano?
5. **Retenção.** Aprovam 12 meses para dados do seletivo (e para aprovados, o que migra)? E os prazos hoje aplicados (auditoria 2 anos, erro 30 dias, atividade 400 dias, backup 400 dias)? O prazo de exclusão de conta de 180 dias é adequado ou deve ser menor?
6. **Encarregado.** A Liga (associação estudantil sem fins lucrativos, pequeno porte) pode ser dispensada do encarregado ou deve nomear um? Quem assina como controlador (CNPJ/representante)?

**Prioridade média**
7. **Revisão dos textos.** Revisão completa de Termos, Política e Edital; incluir idade mínima, IA, seletivo, foro, limitação de responsabilidade para conteúdo clínico.
8. **Consentimento e reaceite.** As mudanças materiais exigem novo aceite de quem já tem conta? Como provar?
9. **Cookies.** O cookie de sessão dispensa banner? Se a Liga usar Google Ads ou analytics com cookies, qual o fluxo de consentimento e o texto?
10. **Comissão.** Basta que "diretoria administrativa" seja qualquer administrador? Convém termo de confidencialidade e registro de quem acessa? A mesma pessoa pode decidir e revisar o recurso?
11. **Incidentes.** Modelo de plano de resposta e de comunicação à ANPD e aos titulares; prazo.
12. **Dados de saúde em casos clínicos** (J3): o termo de anonimização e a moderação bastam, ou é necessário RIPD?
13. **Exclusão e direitos.** Procedimento para pedidos do art. 18 (confirmar identidade, prazo de 15 dias para acesso, portabilidade). É aceitável continuar manual?
14. **Dados em backups.** Mantê-los até o vencimento após exclusão é aceitável?
15. **Licenças e autoria:** coautoria do Claude e depósito no INPI (J1); artigos de licença não comercial na Biblioteca (BI3); direitos autorais dos casos e do acervo (F4).
16. **Mentores, acervo, NPS e telemetria:** decisões do documento `F4_DECISOES_JURIDICAS.md`.

## 13. Decisões que dependem do advogado ou do presidente

| Decisão | Depende de |
|---|---|
| Ajustes após o parecer (as flags já estão ligadas desde 20/10/2026) | Texto do aviso, retenção, regra de menores (perguntas 1, 2, 4, 5) |
| Atualizar o Edital (tirar Google Forms, incluir IA, revisão, retenção) | Advogado + comissão |
| Controle de idade no cadastro | Pergunta 1 |
| Nomear encarregado | Pergunta 6 |
| Publicar nova Política e Termos e pedir reaceite | Perguntas 7 e 8 |
| Implementar a limpeza automática de 12 meses do seletivo | Pergunta 5 (técnico já proposto) |
| Ligar `mfa_required` para todos os administradores | Presidente (técnico pronto) |
| Habilitar NVIDIA ou outro provedor de IA | Termos do provedor e atualização da Política |
| Campanhas no Google Ads | Pergunta 9 |

## 14. Próximos passos sugeridos

1. Reunião de hoje: obter orientação sobre as perguntas 1 a 6.
2. Redigir, com o advogado, o aviso de IA e a seção "Processo seletivo" da Política; atualizar o Edital.
3. Equipe técnica: implementar limpeza de 12 meses do seletivo; botão de exclusão de conta/pedido de dados; declaração de maioridade no cadastro (conforme parecer); declarar cookie de sessão e chaves do navegador; ligar MFA obrigatório a administradores; treinar restauração de backup; migrar e-mail para domínio próprio.
4. Registrar o contrato/DPA de cada operador e a região do banco de memória e do Brevo.
5. Só ligar o seletivo nativo e a triagem por IA após os itens 1 a 3.

---

## Apêndice A. O que ficou "A CONFIRMAR"

- Estado atual (produção) das flags `mfa_required`, `nvidia_fallback`, `memory_enabled`, `agents_*` (`selection_enabled` e `selection_ai_enabled` estão LIGADAS desde 20/10/2026).
- Número atual de usuários e candidatos.
- Região do banco `laift-memory` e dos servidores do Brevo.
- CNPJ e representante legal da LAIFT.
- Se há scripts injetados pelo painel da Cloudflare ou outros fora do repositório (Google Ads, Zaraz, Web Analytics).
- Contratos/DPA dos operadores; se algum guarda os dados para treinar modelos (cada provedor tem sua política; não verificada neste dossiê).
- Se todos os administradores usam MFA.
- Existência de plano de incidentes.
- Detalhes do que a prévia de IA do visitante guarda.
- Implantação da rotina de retenção do seletivo (trabalho em andamento).

## Apêndice B. Fontes consultadas

`docs/riscos-residuais.md`, `docs/F4_DECISOES_JURIDICAS.md`, `docs/CONTINUIDADE.md`, `docs/FEATURE_FLAGS.md`, `docs/BACKUP_RESTORE.md`, `docs/SECURITY.md`, `docs/planos/PROCESSO-SELETIVO.md`, `frontend/privacidade.html`, `termos.html`, `edital.html`, `processo-seletivo.html`, `index.html`, `_headers`, `frontend/wrangler.toml`, `worker/wrangler.toml`, `worker/src/maintenance.js`, `mailer.js`, `constants.js`, `sessionCookie.js`, `agents/eligibility.js`, `selection/{banco,rules,triage}.js`, `services/{selection,selectionCommittee,auth,mfa}Service.js`, `sql/001, 003, 040, 042, 043, memory/001`. Região do Neon verificada no painel do projeto em 20/10/2026.
