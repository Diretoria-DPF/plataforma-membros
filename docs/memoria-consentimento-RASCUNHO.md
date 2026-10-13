# RASCUNHO PARA APROVAÇÃO DO DONO: consentimento da memória de estudo e Política de Privacidade (seções 5 e 7)

> **RASCUNHO PARA APROVAÇÃO DO DONO.** Nada deste arquivo está em vigor. Ele **não** altera `LEGAL_VERSIONS` (`worker/src/constants.js`), nem `docs/POLITICA_DE_PRIVACIDADE.md`, nem os Termos. Também não passou por revisão jurídica. Quando você aprovar (com ajustes), o texto da tela vai para o front (cartão "Memória de estudo" do Perfil), as seções 5 e 7 entram na Política e, **juntos**, `LEGAL_VERSIONS.PRIVACY` e `MEMORY.PURPOSE_VERSION` mudam. Descrição técnica: `docs/agentic-layer.md`.
>
> Versão da finalidade deste texto: `memoria-2026-10-v1` (a que o código exige hoje). Se você mudar o sentido do texto abaixo, aumente `MEMORY.PURPOSE_VERSION`: todos terão que aceitar de novo.

## A. Tela de consentimento (tela própria, separada dos Termos de Uso)

**Título:** Memória de estudo

**Para que serve.** Se você ativar, o Tutor Clínico e a plataforma lembram, entre uma conversa e outra, do que ajuda a adaptar suas explicações ao seu jeito de estudar: em quais temas você está mais forte ou com mais dúvida, como prefere as explicações (exemplos, resumo, passo a passo) e o seu objetivo (prova, revisão, aprofundamento, monitoria). É opcional: o Tutor funciona igual sem a memória.

**O que guardamos.** Só itens de uma lista fixa: tema de estudo (por exemplo, "Farmacocinética" ou "Antimicrobianos"), um nível de 1 a 5, uma marca de "dúvida recorrente" e as preferências e objetivos que **você** escolher. Eles vêm de três fontes: o resultado dos seus simulados, os temas que aparecem nas suas perguntas ao Tutor e o que você mesmo marcar.

**O que NÃO guardamos.** O texto das suas perguntas, as respostas do Tutor, a conversa, seu nome, e-mail ou telefone, e **nenhum dado de saúde**, seu ou de outra pessoa. A memória não tem onde guardar texto livre.

**Onde fica.** Em um banco de dados separado do restante da plataforma, ligado à sua conta por um código que, sozinho, não identifica você.

**Por quanto tempo.** Cada item é apagado se ficar **180 dias sem uso**, e em **no máximo 12 meses** depois de criado. Há um limite de 60 itens por pessoa.

**Quem pode ver.** Você, no seu Perfil. A administração **não** lê a sua memória (vê apenas números totais). A memória só é usada para montar as respostas do Tutor para você.

**Seus controles.** Em "Memória de estudo", no Perfil, você pode: ver tudo o que está guardado, apagar um item, apagar tudo, baixar uma cópia (JSON) e desativar a memória a qualquer momento. Desativar apaga a memória: a exclusão é imediata ou, se houver falha técnica, concluída em até 24 horas. Desativar não prejudica o uso da plataforma nem do Tutor.

**Quem pode usar.** Somente maiores de 18 anos.

**Base legal.** Seu consentimento (LGPD, art. 7º, I). Você pode revogá-lo quando quiser (art. 8º, §5º), de forma tão fácil quanto foi dado.

Botões: **Ativar a memória de estudo** (registra a data e a versão deste texto) · **Agora não**.

Se este texto mudar, pediremos um novo aceite antes de voltar a usar ou gravar a memória.

---

## B. Política de Privacidade: texto proposto para a seção 5 ("Onde os dados ficam e como são protegidos")

Acrescentar, depois do parágrafo "Lia, assistente da plataforma":

**Tutor Clínico e memória de estudo.** O Tutor Clínico, na área "Aprender", ajuda você a estudar farmacologia e toxicologia e é destinado a maiores de 18 anos. Ele não atende casos reais e não orienta condutas. Quando você o usa:

- **A IA recebe o texto.** A pergunta, as últimas mensagens da conversa, o módulo e o tema que você informar e trechos de artigos publicados na Biblioteca são enviados à **Groq, Inc.** para gerar a resposta. Não enviamos seu nome, e-mail ou identificador da conta, mas o que você digitar vai junto: não escreva dados pessoais ou de saúde reais seus ou de terceiros.
- **Registro técnico sem conteúdo.** Guardamos, por chamada, apenas dados de uso: qual agente e versão, quando, quantos tokens, tempo de resposta e o resultado das verificações automáticas (sem o texto da pergunta nem da resposta). Esses registros são vinculados à sua conta e apagados após 90 dias.
- **Memória de estudo (somente se você ativar).** Guardamos, em um banco de dados **separado** (também operado pelo provedor Neon), itens de uma lista fixa: tema de estudo, nível de 1 a 5, dúvida recorrente e as preferências e objetivos de estudo que você escolher. Cada item é ligado à sua conta por um **código pseudonimizado** (HMAC) cuja chave fica somente no servidor da aplicação; esse banco, sozinho, não identifica você. Não há campo de texto livre: **não guardamos suas perguntas, respostas, nem dados de saúde**. O conteúdo da memória é enviado à Groq, Inc., como contexto, **somente** nas conversas com o Tutor e **sem** identificar você.
- **Quem acessa.** Você vê, exporta e apaga a sua memória no Perfil. A administração vê apenas totais e pode apagar a memória de uma pessoa a pedido dela; não lê o conteúdo.
- **Proteções.** Acesso restrito a cada pessoa no próprio banco (segurança por linha), conexão sempre criptografada (TLS), conta de acesso do servidor sem permissão de alterar a estrutura do banco e registro de auditoria sem conteúdo das suas ações sobre a memória. Nenhum sistema é totalmente imune a falhas: se o servidor da aplicação for comprometido, os itens da memória (que não contêm texto livre nem dados de saúde) podem ser expostos.

## C. Política de Privacidade: texto proposto para a seção 7 ("Retenção e exclusão dos seus dados")

Acrescentar, depois do trecho sobre a Lia:

**Tutor Clínico e memória de estudo.**

- **Registros técnicos dos agentes** (sem o texto das perguntas e respostas): apagados após **90 dias**, por rotina diária.
- **Memória de estudo:** cada item é apagado após **180 dias sem uso** e, de qualquer forma, no máximo **12 meses** depois de criado, por rotina diária.
- **Quando você desativa a memória, apaga um item ou apaga tudo**, o apagamento é imediato. Se houver falha técnica, ele fica registrado em uma fila e é concluído em até **24 horas** (nossa meta). Enquanto isso, a memória já não é lida nem gravada.
- **Quando sua conta é excluída**, a memória é apagada em até **24 horas** em rotina automática, independentemente do prazo geral de até 180 dias para a exclusão da conta e dos demais dados. Uma varredura semanal remove qualquer item que, por falha, tenha ficado sem consentimento vigente.
- **Consentimento:** guardamos a data e a versão do texto aceito (sem conteúdo da memória), apagados junto com a conta.
- **Alteração do texto:** se a finalidade da memória mudar, pediremos um novo consentimento antes de voltar a usá-la; a memória antiga permanece sem uso até o novo aceite (você pode apagá-la ou baixá-la).

## D. Ajustes de coerência sugeridos (não redigidos aqui)

1. **Seção 2 (Dados que coletamos):** incluir "itens de memória de estudo (somente se ativada)" e "registro técnico dos agentes".
2. **Seção 3 (Finalidades e base legal):** memória = consentimento (art. 7º, I); Tutor = execução do serviço educacional que você pediu.
3. **Seção 8 (Direitos):** citar o acesso, a portabilidade (exportação JSON), a correção (editar preferências) e a eliminação (apagar item/tudo/desativar) feitos pela própria tela.
4. **Seção 4 (O que NÃO fazemos):** "não usamos a memória para publicidade, perfilamento comercial nem decisões automatizadas sobre você".
5. **Termos de Uso:** Tutor e memória são apenas para maiores de 18 anos; o Tutor é recurso educacional, não aconselhamento médico.

## E. Pontos para você decidir

1. A base legal de consentimento é a que você quer? (a alternativa, legítimo interesse, não é recomendada para dado de comportamento de estudo com opt-in.)
2. O prazo de **24 h** para apagar a memória em exclusão de conta é uma meta técnica (cron diário): quer prometê-lo no texto ou escrever "até 7 dias" (cobre também a varredura semanal)?
3. O banco `laift-memory` fica em qual região do Neon? Se for fora do Brasil, citar a transferência internacional (LGPD, art. 33), como já é feito para Neon, Groq e Cloudflare.
4. Quem é o encarregado (DPO) e o canal de privacidade? Hoje a Política usa `laiftligauninassau@gmail.com`.
5. O texto "se o servidor for comprometido, os itens podem ser expostos" na seção 5 deve ficar assim, mais genérico, ou sair? (É a limitação real; recomendo manter.)
