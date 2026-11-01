# Processo seletivo contínuo da LAIFT: plano de execução

Decidido com o dono em 2026-10-19. Substitui o formulário externo (Google Forms) por uma jornada dentro da plataforma, com inscrição sempre aberta, teste interativo, triagem por IA que **nunca elimina** e o Guia como guia.

## 1. Decisões já tomadas

| Tema | Decisão |
|---|---|
| Entrada | **Conta na plataforma** (e-mail confirmado). Reaproveita login, limites, auditoria e o Guia. |
| Ritmo | **Inscrição sempre aberta.** Cada pessoa tem prazo individual para concluir (padrão 7 dias, configurável). A comissão analisa em **lotes** (padrão: a cada 15 dias). A página mostra "Próxima análise: dd/mm" em vez de "a divulgar". |
| Teste | Perfil e disponibilidade + análise de cenário + questões objetivas de base + situações de conduta e ética. |
| IA | Faz a **triagem prévia**: resume, organiza e sugere prioridade de leitura. **Não decide, não nota para eliminar, não exclui ninguém.** A comissão decide. |
| Segurança | Mantém o padrão atual (sessão, limites, Turnstile, auditoria, moderação) e acrescenta o que o processo exige (seção 7). |

## 2. O que as referências ensinam (e o que adotamos)

- **Ligas acadêmicas** (editais da UNIMONTES, UFES, UNIFOR e outras): o padrão é prova escrita (objetivas + discursivas) seguida de entrevista; o histórico muitas vezes entra como documento, sem peso; há prazo curto para recurso (a UFES dá 24 horas). **Adotamos:** objetivas curtas como sinal de nível, discursiva (análise de cenário), entrevista da comissão só para quem passa à etapa final, e **recurso** com prazo claro.
- **Testes de julgamento situacional** (síntese do HumRRO, *Personnel Assessment and Decisions*, 2020): cenários **curtos e específicos**, baseados em incidentes reais, validam melhor e cansam menos; o método de pontuação muda muito a ordem dos candidatos. **Adotamos:** 5 cenários curtos, pontuação simples e transparente, usada **só como sinal de apoio** para a comissão, nunca como corte.
- **LGPD, art. 20** (revisão de decisões automatizadas): o direito de revisão pesa quando a decisão é **unicamente** automatizada. **Adotamos:** nenhuma decisão é automática; toda inscrição é lida por uma pessoa da comissão; o candidato é informado de que a IA organiza as informações e pode **pedir revisão**. Texto final do aviso passa pelo advogado.

Fontes: [edital de liga (UNIMONTES)](https://unimontes.br/wp-content/uploads/2025/03/edital-2025_250310_184024.pdf), [edital de liga (UFES)](https://ccens.ufes.br/sites/alegre.ufes.br/files/field/anexo/edital_de_selecao_2020.pdf), [HumRRO: boas práticas de SJT](https://www.humrro.org/blog/evidence-and-experience-based-best-practices-situational-judgment-tests/), [Confidata: art. 20 da LGPD](https://confidata.com.br/blog/decisoes-automatizadas-lgpd-direitos-obrigacoes).

## 3. Jornada do candidato (cerca de 25 minutos, pode parar e voltar)

1. **Entrar** (criar conta ou fazer login). Quem já é membro não se inscreve.
2. **Antes de começar**: resumo do edital, tempo estimado, o que a comissão espera, aviso de privacidade e da triagem por IA, aceite do edital.
3. **Perfil**: curso, instituição, semestre, áreas de interesse, disponibilidade (dias e turnos).
4. **Análise de cenário**: um mecanismo, uma evidência ou uma notícia recente; a escolha e o impacto (limite de caracteres, contador, aviso para não escrever dado de saúde).
5. **Questões objetivas** (8): base de farmacologia, toxicologia e raciocínio científico. Só podem ser respondidas **uma vez**; o resumo de acertos aparece depois do envio, só como sinal.
6. **Situações de conduta** (5 cenários): escolher a melhor e a pior atitude e justificar em uma frase. Alinhadas aos compromissos do edital.
7. **Revisão e envio**: resumo do que foi preenchido; confirma e envia. Recebe um **comprovante** e o status passa a "Em análise".
8. **Acompanhar**: linha do tempo do status (Em andamento, Enviada, Em análise, Entrevista, Resultado) e a data da próxima análise.

Rascunho salvo automaticamente a cada etapa. Prazo individual avisado na tela. Quem não concluir no prazo pode **reiniciar** (nova tentativa após 30 dias).

## 4. O teste (conteúdo versionado e editável pela comissão)

O conteúdo vive num arquivo versionado (`worker/src/selection/banco.js`, versão `v1`), com rubrica; mudar uma questão é um commit, não uma migração. Cada inscrição guarda a **versão** do banco que respondeu.

- **Perfil e disponibilidade**: campos do formulário atual (já conhecidos pela comissão).
- **Análise de cenário** (rubrica 0 a 3 em quatro critérios, usada pela comissão e pela IA como roteiro de leitura): (1) precisão científica, (2) uso de evidência, (3) relevância e impacto, (4) clareza e organização.
- **Objetivas**: sorteio de 8 entre um banco maior (reduz repasse de respostas). Mostra acerto na hora, sem gabarito comentado antes do envio.
- **Conduta e ética**: 5 cenários curtos (prazo e entrega, confidencialidade de dados, convivência na equipe), escolha de melhor/pior atitude + justificativa curta.

Pendência da comissão: revisar o banco inicial (propomos um rascunho com 10 objetivas e 5 cenários de conduta, revisado pela diretoria administrativa) e fixar pesos. **Até lá, nenhum número vira corte.**

## 5. Triagem por IA (apoio, nunca decisão)

Roda quando a inscrição é enviada, em segundo plano, com o modelo "inteligente" do Groq (cota própria).

- **Entrada**: respostas do candidato tratadas **como dado, nunca como instrução** (mesmo escudo de injeção de prompt do Guia). Sem nome, e-mail ou telefone no prompt.
- **Saída (JSON validado)**: resumo de 3 linhas; pontos fortes; pontos a esclarecer na entrevista; leitura da rubrica por critério (com a frase que justifica); **sinais de atenção** (texto genérico ou copiado, tentativa de manipular a IA, dado de saúde escrito, respostas incoerentes); **prioridade de leitura** (alta, média, ler com atenção). Sem nota final e sem "reprovar".
- **Comissão** vê o resumo **ao lado** das respostas originais; a IA nunca esconde nada. Sinal de atenção **não penaliza**: só chama uma pessoa para ler.
- **Falha ou cota esgotada**: a inscrição segue normal, marcada "sem triagem automática"; nada trava.
- **Custo**: ~3 mil tokens por inscrição. Há teto diário próprio e alerta no painel de IA.

## 6. O Guia como guia do processo

- **Contexto por etapa**: o botão do Guia no assistente sabe em que etapa a pessoa está e oferece perguntas prontas daquela etapa.
- **O que ela faz**: explica o processo, as etapas, os prazos, o que a comissão espera, como preencher cada campo, como funciona a triagem, privacidade, status e recurso; resolve dúvidas de uso da tela.
- **O que ela não faz**: não escreve a análise do candidato, não diz a resposta de questão, não opina sobre as chances. Pergunta de conteúdo recebe: "posso explicar o que se espera, mas a resposta tem de ser sua".
- **Conteúdo**: novo documento da base de conhecimento (`processo-seletivo`), novas intenções por regra e botões que levam à etapa certa. Vale também para quem ainda não tem conta (visitante).

## 7. Segurança e abuso

Reaproveita: sessão (cookie HttpOnly), limite por hora por pessoa e IP, Turnstile, filtro de injeção e de ofensa, auditoria, MFA na comissão. **Acrescenta:**

- Uma inscrição **ativa** por pessoa (restrição única no banco); envio idempotente (reenviar não duplica).
- Conta com **e-mail confirmado** e política de criação já existente; limites próprios (rascunho, envio, reinício).
- Campo isca (honeypot); tempo mínimo de preenchimento (5 minutos) e teto de tamanho por campo, validados **no servidor**. O Turnstile no envio fica de fora por ora: conta com e-mail confirmado e os limites já seguram; entra se aparecer abuso.
- Texto livre sanitizado e exibido sempre por `textContent`; varredura de **dado de saúde** e de contato nos campos livres (aviso ao candidato antes de enviar; marca para a comissão).
- Prazos e estados validados no servidor (não dá para pular etapa, nem editar depois de enviar).
- Acesso da comissão **por cargo**, com tudo registrado em `audit_logs` (quem abriu, quem decidiu). Candidato só enxerga a **própria** inscrição.
- Retenção: dados da inscrição apagados em 12 meses (aprovados migram só para o perfil de membro); candidato pode pedir exclusão.
- Tudo atrás de flags (seção 9) e com **plano B**: o botão do formulário externo continua disponível enquanto a flag nova estiver desligada.

## 8. Painel da comissão

- Fila por status e por **lote**, ordenada pela prioridade de leitura (a comissão pode reordenar).
- Ficha da inscrição: respostas, resumo da IA, sinais de atenção, rubrica para a comissão preencher (a nota da comissão é a que vale), anotações.
- Decisões: **seguir para entrevista**, **aprovado**, **lista de espera**, **não selecionado neste ciclo** (com motivo escrito e nova inscrição permitida depois), **pedir complemento**. Decisão em lote para os claramente aprovados.
- Aprovação cria o acesso de **membro** (reaproveita o fluxo atual de papel) e dispara e-mail.
- Recursos: candidato pede revisão pela plataforma; entra em fila separada, lida por outra pessoa da comissão.
- Métricas: inscrições por semana, tempo até a análise, taxa de conclusão por etapa.

## 9. Fatias de entrega (cada uma vai à produção atrás de flag)

| Fatia | Entrega | Flag |
|---|---|---|
| **1. Base e jornada** (feita; PR da fatia 1) | Migração (`selection_applications`, `selection_events`, `selection_settings`), serviço do Worker, jornada do candidato (etapas 1 a 8), banco v1, segurança da seção 7, página pública com fluxo contínuo e "Próxima análise" | `selection_enabled` |
| **2. Triagem por IA e painel** | Pipeline de triagem, painel da comissão, decisões, e-mails de status | `selection_ai_enabled` |
| **3. Guia guia** | Documento e intenções do processo, contexto por etapa, botões | (usa `chatbot_enabled`) |
| **4. Fechamento** | Edital e avisos atualizados (sem "a divulgar"), recurso, retenção/exclusão, testes de carga e de segurança, treinamento da comissão (`docs/`) | desliga o formulário externo |

Para reduzir PRs, as fatias 1 e 3 vão juntas; 2 e 4 vão juntas.

**Definição de pronto:** candidato novo percorre tudo em 375 px e no computador; comissão decide pelo painel; Guia responde as dúvidas da jornada sem escrever pelo candidato; todos os testes e o e2e verdes; revisão de segurança sem achado alto; deploy conferido em produção; documentação e `CONTINUIDADE.md` atualizados.

## 10. Pendências que dependem da comissão e do jurídico

1. Revisar o banco v1 (questões objetivas e cenários de conduta) e definir pesos e critério de desempate (hoje "a divulgar" no edital).
2. Confirmar prazo individual (7 dias), tamanho e frequência do lote (15 dias) e número de vagas por ciclo.
3. Definir quem compõe a comissão (cargo na plataforma) e quem revisa recursos.
4. Parecer jurídico sobre o aviso de triagem por IA, a retenção de 12 meses e candidatos menores de idade.
5. Domínio de e-mail para os avisos de status (hoje o remetente é Gmail; ver OPS-04).
