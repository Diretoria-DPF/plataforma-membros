# Consentimento da memória de estudo e Política de Privacidade (seções 5 e 7)

Versão da finalidade: `memoria-2026-10-v1` (`MEMORY.PURPOSE_VERSION`, `worker/src/constants.js`). O texto da tela está em `frontend/memory-core.js` (`CONSENT_SECTIONS`, fonte única) e a Política em `frontend/privacidade.html`. Se o sentido do texto mudar, aumente `MEMORY.PURPOSE_VERSION` e `LEGAL_VERSIONS.PRIVACY` juntos: todas as pessoas terão que aceitar de novo. Descrição técnica: `docs/agentic-layer.md`.

## Conferência com o código

| Afirmação do texto | Onde está no código |
|---|---|
| Itens de lista fixa (tema, nível 1 a 5, dúvida recorrente, preferência, objetivo), sem texto livre | `worker/src/memory/vocabulary.js`, `sql/memory/001_memory.sql` (CHECKs) |
| Três origens: simulado, tema citado ao Tutor, escolha da pessoa | `worker/src/memory/signals.js`, `docs/agentic-layer.md` §2 |
| 60 itens, 180 dias sem uso, 12 meses no máximo | `MEMORY` em `worker/src/constants.js`, `memory/policy.js` (`computeExpiry`) |
| Só a pessoa vê; a administração vê totais e apaga a pedido | `memory/admin.js` |
| Itens vão à Groq, Inc. só nas conversas com o Tutor, sem identificar | `agents/memoryProvider.js`, `agents/promptBuilder.js` |
| Apagar, baixar, desativar no Perfil; apagar vale com a flag desligada | `frontend/memory.js`, `memory/service.js` |
| Falha ao apagar: fila e conclusão em até 3 meses (meta técnica de 24 h) | `memory/cleanup.js`, `docs/agentic-layer.md` §2.7 |
| Maiores de 18 anos | `agents/eligibility.js` (premissa de cadastro, ver abaixo) |

## Maioridade (18 anos)

- O sistema não coleta idade. `isEligibleAdult` trata conta existente como maior de 18 anos; contas de menor não existem (J7 em `docs/riscos-residuais.md`). Por isso o texto diz que não há acesso para menores de 18 anos e não oferece caminho alternativo.
- A tela exige a marcação "Declaro que tenho 18 anos ou mais e li o texto acima" antes de ativar. A declaração é **só da tela**: o servidor registra a data e a versão do texto aceito, não a declaração. Gravar a declaração (`adultConfirmed`) exige mudança no Worker e migração (decisão do dono).

## Jornada guiada (front)

Primeiro acesso: se `apiMemoryGet` responde com o cartão disponível e a pessoa ainda não consentiu, o onboarding ganha o passo "Memória de estudo (opcional)" (só membro e admin). "Conhecer a memória de estudo" leva ao Perfil. O cartão tem 3 passos (o que é, o que será registrado, consentimento com declaração) e, depois do aceite, o atalho "Abrir o Tutor". "Agora não" recolhe o cartão para uma linha e não reabre sozinho na mesma sessão. Sem telemetria nova: nenhuma chamada além das que o Perfil já faz.

## Texto da tela

**Para que serve.** Se você ativar, o Tutor lembra de dados de estudo para adaptar as explicações: temas em que você tem mais domínio ou mais dúvida, como prefere estudar e qual é o seu objetivo. É opcional: o Tutor funciona sem a memória.

**O que é guardado.** Itens de uma lista fixa: tema, nível de 1 a 5, marca de dúvida recorrente, preferências de estudo e objetivo. Vêm do resultado dos seus simulados, dos temas que aparecem nas suas perguntas ao Tutor e do que você escolher aqui. Ao ativar, você autoriza essas três origens.

**O que não é guardado.** O texto das suas perguntas, as respostas do Tutor, a conversa, nome, e-mail, telefone e dados de saúde. A memória não tem campo de texto livre.

**Quem vê e para quem vai.** Só você vê os itens, aqui no Perfil. A administração vê apenas totais e pode apagar a memória de uma pessoa a pedido dela; não lê o conteúdo. Nas conversas com o Tutor, os itens são enviados à Groq, Inc., sem identificar você, para gerar a resposta. Essa empresa pode estar fora do Brasil.

**Onde fica.** Em um banco de dados separado do restante da plataforma, ligado à sua conta por um código que, sozinho, não identifica você.

**Por quanto tempo.** Cada item é apagado se ficar {unusedDays} dias sem uso e, no máximo, {maxMonths} meses depois de criado. O limite é de {maxItems} itens por pessoa. Se a sua conta for excluída, a memória é apagada em até 3 meses.

**Apagar e baixar.** Aqui no Perfil você vê tudo o que está guardado, apaga um item, apaga tudo, baixa uma cópia (JSON) e desativa a memória quando quiser. Ao desativar, a memória é apagada na hora ou, se houver falha técnica, em até 3 meses; até lá, ela não é lida nem gravada. Desativar não prejudica o uso da plataforma nem do Tutor.

**Limite do Tutor.** O Tutor é um recurso de estudo. Não substitui a orientação de professor, farmacêutico, médico ou outro profissional e não atende casos reais.

**Maioridade.** Somente para maiores de 18 anos. Não há acesso ao Tutor nem à memória de estudo para menores de 18 anos.

**Base legal.** Seu consentimento (LGPD, art. 7º, I). Você pode revogá-lo quando quiser (art. 8º, § 5º), de forma tão fácil quanto foi dado.

Declaração: Declaro que tenho 18 anos ou mais e li o texto acima.

Botões: Ativar memória de estudo (registra a data e a versão do texto) e Agora não. Se o texto mudar, pedimos novo aceite antes de voltar a usar ou gravar a memória.

## Pendências do dono

1. Confirmar a base legal (consentimento, art. 7º, I).
2. Prazo de apagamento: o texto promete "na hora ou, em caso de falha técnica, até 3 meses" (a meta técnica é 24 h).
3. Região do banco `laift-memory`: se for fora do Brasil, a Política já cita transferência internacional (art. 33) para Neon e Groq.
4. Encarregado e canal de privacidade: hoje `laiftligauninassau@gmail.com`.
5. Frase sobre comprometimento do servidor (seção 5): mantida por ser a limitação real.
6. Certificados: prazo de guarda do registro mínimo depois da exclusão da conta (hoje sem prazo; a Política diz "enquanto puder ser conferido") e botão para retirar a permissão pública (hoje por pedido ao canal).
7. Subir `LEGAL_VERSIONS.PRIVACY` junto com a publicação das seções novas de `privacidade.html`; não foi alterado nesta mudança.
