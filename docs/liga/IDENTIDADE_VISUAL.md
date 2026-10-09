# Identidade visual da Liga (proposta para escolha)

Status: proposta para a diretoria escolher A ou B (ou mesclar). Nada aqui é publicado.
Nome oficial, vagas, datas, pesos e critérios: a definir pela diretoria.
Prévia navegável (abre por arquivo local, sem rede): `docs/liga/previa/liga-previa.html`.
Fontes de referência: `docs/liga/REFERENCIAS_LIGAS.md`.

## 1. Os dois caminhos

- **A · Institucional**: base clara, sóbria. A marca (teal) aparece como acento: botão, passos da linha do tempo e capa do Instagram. A Lia é pequena e fica dentro do cartão de apresentação. Indicada para a página pública e o formulário.
- **B · Laboratório vivo**: painel profundo no topo e na linha do tempo, com a Lia maior e um filete amarelo que destaca o processo. Indicada para as redes sociais e os destaques.

Diferenças detalhadas na seção 7.

## 2. Paleta

Todos os valores vêm de `frontend/modulos/shared/laift-tokens.css`. Nenhuma cor nova foi criada; a prévia copia os mesmos valores para as classes `.va.claro`, `.va.escuro`, `.vb.claro` e `.vb.escuro`.

| Papel | Claro | Escuro | Token de origem |
|---|---|---|---|
| Página (camada 0) | #fafaf7 | #0e1114 | `--layer-0` / `--dk-layer-0` |
| Cartão (camada 1) | #f4f3ef | #14181c | `--layer-1` / `--dk-layer-1` |
| Bloco (camada 2) | #edebe5 | #1a1f24 | `--layer-2` / `--dk-layer-2` |
| Poço (camada 3) | #e4e1d8 | #22282e | `--layer-3` / `--dk-layer-3` |
| Texto | #1c2333 | #e7ebf3 | `--laift-text` / `--dk-text` |
| Texto secundário | #5b6478 | #9aa5bb | `--laift-muted` / `--dk-muted` |
| Marca (acento) | #0f6f62 | #3fcfb6 | `--laift-primary` / `--dk-primary` |
| Texto sobre a marca | #ffffff | #06231e | `--laift-on-primary` / `--dk-on-primary` |
| Eliminatória (texto) | #b3261e | #ff7a70 | `--laift-danger` / `--dk-danger` |
| Eliminatória (fundo) | #fbe6e4 | #3a1c1c | `--laift-danger-soft` / `--dk-danger-soft` |
| Destaque amarelo (B) | - | #ffc857 | `--dk-warning` (B, nos dois temas) |
| Placa da marca | #fafaf7 | #fafaf7 | valor fixo igual a `--layer-0` claro |

A variante B usa o painel profundo (`--dk-layer-1` e `--dk-warning`) nos dois temas. Sobre o painel, a Lia recebe `--lia-line` #cfe9e3 e halo #3fcfb6.

### Contraste medido (WCAG 2.x, luminância relativa)

Todos os pares de texto usados na prévia estão em 4,5:1 ou mais, nos dois temas.

| Variante e tema | Par (texto / fundo) | Razão |
|---|---|---|
| A claro | #5b6478 / #edebe5 (texto secundário sobre bloco) | 4,98 |
| A claro | #0f6f62 / #edebe5 (capa de destaque) | 5,08 |
| A claro | #b3261e / #fbe6e4 (eliminatória) | 5,46 |
| A claro | #ffffff / #0f6f62 (botão) | 6,05 |
| A claro | #1c2333 / #fafaf7 (texto na página) | 15,01 |
| A escuro | #ff7a70 / #3a1c1c (eliminatória) | 6,07 |
| A escuro | #9aa5bb / #1a1f24 (texto secundário sobre bloco) | 6,70 |
| A escuro | #06231e / #3fcfb6 (botão) | 8,53 |
| A escuro | #e7ebf3 / #0e1114 (texto na página) | 15,85 |
| B (painel, nos dois temas) | #ff7a70 / #3a1c1c (eliminatória) | 6,07 |
| B (painel, nos dois temas) | #9aa5bb / #14181c (texto secundário) | 7,20 |
| B (painel, nos dois temas) | #3fcfb6 / #14181c (rótulo do topo) | 9,18 |
| B (painel, nos dois temas) | #0e1114 / #ffc857 (número do passo) | 12,31 |

Menor par de cada variante: A claro 4,98:1; A escuro 6,07:1; B 6,07:1.

## 3. Tipografia, grade, raio, camadas e movimento

- **Fonte**: pilha do sistema em `--laift-font` ("Segoe UI", Inter, system-ui, -apple-system, Roboto, sans-serif). Nenhuma fonte é baixada. Inter fica na pilha, mas só aparece se estiver instalada no aparelho.
- **Escala**: título do hero 22 px; rótulo em caixa-alta 13 px; texto 15 px; nota 14 px. Legendas e etiquetas de destaque com 12 px no mínimo.
- **Grade**: margem lateral de 16 px no celular. Cartões com 20 px de respiro interno e 16 px entre blocos. Na tela de 1280 px, a linha do tempo fica em três colunas e o cartão de áreas ao lado do botão. A troca acontece por largura do quadro (consulta de contêiner a 700 px), não por tamanho de janela.
- **Raio**: 28 a 32 px para telas e cartões; 24 px para os slides do Instagram; pílula (999 px) para chips e botão.
- **Camadas**: separação por tom (`--layer-0` a `--layer-3`), sem bordas de cartão. Elevação por luz (`--elev-1` e `--elev-2`: filete claro no topo mais sombra suave). Filete amarelo de 3 px no topo da linha do tempo da variante B.
- **Alvos de toque**: botão com altura mínima de 44 px (`--laift-touch`).
- **Foco**: contorno de 3 px com `--laift-focus-color` (a marca), do próprio token.
- **Movimento**: a prévia não anima. Qualquer animação futura usa só `transform` e `opacity`, duração com `--dur-*`, curva com `--ease-*`, e respeita o bloco de `prefers-reduced-motion` do `laift-tokens.css`.

## 4. Uso da logo e da Lia

- **Logo** (`frontend/modulos/cracha/laift-marca.png`, 500 x 500, com transparência): sempre sobre a placa clara circular (#fafaf7), mesmo no tema escuro, porque o anel roxo some sobre fundo escuro. Tamanho mínimo de 64 px na tela. Sem distorção, sem troca de cor, sem recorte.
- **Texto da arte**: a arte traz "LIGA ACADÊMICA DE FARMACOLOGIA E TOXICOLOGIA", "LAIFT" e "EST. 2026". Esse texto é o da arte já feita. O nome oficial depende da diretoria, e a arte deve ser revista se o nome mudar.
- **Lia** (`frontend/modulos/shared/lia/lia.svg`, versão neutra, sem cenas nem adereços): as cores vêm de `lia.css`. A prévia copia o desenho para um `<symbol>` interno, porque uma `<img>` não aplica o CSS da Lia e ela sairia preta.
- **Lia e dados**: a Lia nunca altera dados, não é botão e não recebe dado pessoal (LGPD). Na identidade, ela é ilustração.

## 5. Tom de voz

Base: `docs/liga/REFERENCIAS_LIGAS.md`, seções (c) e (e).

Fazer:
1. Informar com data, horário e formato quando eles existirem (refs. 2 e 8, eventos datados). Enquanto não houver data, dizer "a definir pela diretoria".
2. Explicar a seleção em etapas curtas, com o critério escrito (refs. 2, 3, 4, 5 e 9).
3. Ter um canal oficial único: a bio aponta para laift.com.br/liga, que reúne edital, inscrição e redes (refs. 2 e 8).

Evitar:
1. Prometer vagas, datas, pesos ou critérios que a diretoria ainda não definiu.
2. Orientar uso ou dose de medicamento em post. Conteúdo sobre fármaco exige fonte e revisão docente.
3. Copiar arte, cores, logotipo ou formato de outra liga. As referências servem de estrutura, não de arte.

## 6. Direito de imagem

- A identidade não usa foto de pessoa. A marca e a Lia são arte da Liga.
- Nome, foto ou @ de estudante ou membro só com autorização por escrito (LGPD). Depoimentos e imagens de membros: a definir pela diretoria.
- Nenhum conteúdo com menor de idade entra na identidade antes do parecer jurídico. A flag `minors_enabled` nasce desligada.
- Nenhuma imagem de terceiros foi baixada ou usada. A prévia usa só a marca e a Lia do próprio repositório.

## 7. Diferenças entre A e B

| Aspecto | A · Institucional | B · Laboratório vivo |
|---|---|---|
| Base | Clara (`--layer-0` #fafaf7) | Painel profundo (#14181c) no topo e na linha do tempo; o resto segue o tema |
| Acento | Teal da marca (#0f6f62 claro, #3fcfb6 escuro) | #3fcfb6 e, na linha do tempo, #ffc857 |
| Lia | 96 x 144 px no celular, 128 x 192 px no desktop, sem halo | 150 x 225 px no celular, 240 x 360 px no desktop, com halo #3fcfb6 |
| Linha do tempo | Lista em camada 2, passos de 40 px | Painel com filete amarelo, passos de 56 px |
| Tom | Institucional e sóbrio | Didático e experimental |
| Uso sugerido | Página pública, formulário | Redes sociais, destaques |
| Instagram | Capa em teal, slides claros | Capa e slides em painel profundo, número em amarelo |

## 8. Pendências (a definir pela diretoria)

- Escolher A, B ou uma mescla.
- Nome oficial da Liga, para a bio, os destaques, os slides e o formulário.
- Confirmar as áreas do cartão (Farmacologia e Toxicologia vêm do texto da arte, não de uma decisão registrada).
- Vagas, datas, pesos, critérios e instrumentos do processo seletivo.
- Paleta e logotipo definitivos. Se a paleta mudar, mudam os tokens, e a prévia é refeita a partir deles.
- Ritmo de publicação e uso de depoimentos.
