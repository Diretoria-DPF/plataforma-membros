# Guia de estilo dos posts do blog LAIFT

Quem escreve os posts (H3) segue este guia. Quem revisa (sessão principal) confere contra ele.
Fonte única de fatos: `docs/blog/FATOS_VERIFICADOS_2026-10-09.md`. **Se o fato não está lá, não entra.**

## Para quem escrevemos
Uma pessoa que **ainda não entrou** na plataforma: calouro ou estudante de Farmácia/Saúde, curioso,
de celular, com pouco tempo. Ela quer saber: *o que é isso, o que eu encontro, é confiável, como entro*.

## Tom
- Português do Brasil, tratamento por **"você"**. Acolhedor e direto, sem gíria e sem formalismo de edital.
- Frases curtas (até ~25 palavras). Voz ativa. Um assunto por parágrafo.
- Explique a sigla na primeira vez (OSCE, PWA, E2EE, MFA). Prefira a palavra simples: "mensagens
  cifradas de ponta a ponta" a "E2EE".
- **Sem superlativos e sem promessa**: nada de "o melhor", "revolucionário", "garantido", "100% seguro".
  Descreva o que existe, o que cada coisa faz e o que **ainda não** existe.
- Sem emoji. Sem pontos de exclamação seguidos. Sem "clique aqui": o texto do link diz para onde ele leva.

## Estrutura de um post
- `titulo` até 90 caracteres, `resumo` até 200 (é o que aparece no card e no Google).
- Corpo de 150 a 300 palavras; um `h2` a cada ~120 palavras; no máximo 1 `destaque` por post.
- Ordem sugerida: o que é → o que você encontra (lista) → como usar ou como chegar → limites → contato.
- Blocos aceitos: `p`, `h2`, `lista`, `destaque`, `fatos`, `cta`, `etapas`, `cartoes`, `contato`
  (veja `frontend/blog/conteudo/_EXEMPLO.json`). Nada de HTML dentro do texto; link só no formato
  `[rótulo](destino)` e só para a lista permitida.

## Honestidade sobre o estado de cada coisa
Cada post tem um `status`:
- `ativo` — funciona hoje em produção (o fato diz isso, com fonte).
- `pronto-aguardando-ativacao` — o código existe, mas falta ativar (ex.: depende de migração ou de flag).
- `planejado` — está em documento da equipe, sem código ainda. **Nunca com data.**
- `em-estudo` — depende de decisão externa (parecer jurídico, diretoria).
Use a mesma palavra no texto: "ainda não está ativo", "em estudo". Não escreva "em breve" sem selo.

## Proibido (o gerador recusa várias destas)
- Dizer que o conteúdo do Atlas é "revisado" ou "aprovado". Diga **"em revisão"** e que a revisão profissional
  ainda vai acontecer.
- Prometer segurança absoluta. Diga o que existe (CSP, MFA, criptografia de mensagens, backup cifrado) e o que
  ainda é limite (ex.: QR de presença sem validade).
- Datas, número de vagas, pesos ou notas do processo seletivo: escreva **"a divulgar"**.
- Nome, foto, cargo-com-nome, e-mail pessoal ou @ de qualquer pessoa. A Liga tem Instagram próprio (`@laift.liga`);
  quem quiser conhecer os membros vai lá.
- Qualquer coisa sobre menores de idade fora de "em estudo, depende de parecer jurídico".
- Número que não esteja em `FATOS_VERIFICADOS` (questões, testes, estruturas, notas de Lighthouse).

## Aviso de conteúdo clínico
Posts sobre Farmacologia, Toxicologia, Clínica, Laboratório e Anatomia terminam com um `destaque` de tom
`atencao`: *"Material educacional para estudo. Não substitui orientação de profissional de saúde."*

## Como citar a fonte (campo `fontes`)
Uma ou mais linhas curtas: `arquivo:linha` ou nome do documento, e a data da checagem quando o fato muda.
Exemplos: `frontend/learning.js:62`, `docs/BACKUP_RESTORE.md (checado em 2026-10-09)`.
Post sem `fontes` não passa no gerador.

## Contato no fim do post
Todo post termina com o bloco `contato` (Instagram + e-mail). No post do Processo Seletivo o convite é
**"Acompanhe o seletivo no Instagram"**; nos posts de módulos, **"Tire dúvidas por e-mail"**. Enquanto a diretoria
não confirmar o e-mail, o bloco mostra "e-mail a divulgar" e o texto do post **não** manda ninguém escrever.

## Vocabulário fixo
- **LAIFT** (a plataforma e a Liga); nome completo: Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia.
- **Lia** (a guia da plataforma), **Atlas** (anatomia e PK 3D), **Crachá virtual**, **Aprender** (a área dos módulos).
- Nomes dos módulos exatamente como na barra inferior e no hub Aprender.
