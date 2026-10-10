# Auditoria de usabilidade — entrada, cadastro, app logado e módulos (2026-10-09)

**Como foi medido:** Playwright (`frontend/node_modules`) sobre o `frontend/dist` já construído desta branch, com o simulador da Worker do
`scripts/e2e/harness.js` e a flag `ux_v2_enabled` ligada (como em produção). Celular **375x812** e desktop **1280x800**. Medidas são
`getBoundingClientRect` e `getComputedStyle` reais; nada estimado. Leitura de código por amostragem (`index.html`, `styles.css`, `ux.css`,
`app.js`, `home.js`, `learning.js`, `blog.css`, `blog/post.js`). Gravidade: **Alta** (atrapalha a tarefa principal), **Média** (atrito
frequente), **Baixa** (polimento). Esforço: P (≤ 1 ficha), M (2–3 fichas), G (mais).

## Resumo: os 3 mais graves
1. **A1 — barra inferior do app com 8 itens** (9 para admin): alvos de 47 px (42 px no admin) e rótulos de **10 px**, 1 a 3 rótulos cortados.
2. **K1 — cadastro com 12 campos soltos** (7 obrigatórios, senha depois de 4 opcionais) e uma escolha que não existe (SMS desabilitado).
3. **E1/E2 — primeira tela sem hierarquia** para quem chega: "Criar conta" é um link de 79 px ao lado de "Esqueci minha senha"; campos com
   13 px fazem o iPhone ampliar a tela ao tocar.

## 1. Entrada (`#screen-welcome`)
| id | Achado (medida) | Onde | Lei | Grav. | Esf. | Lote |
|---|---|---|---|---|---|---|
| E1 | "Criar conta" é link de texto **79x44 px**, mesmo peso de "Esqueci minha senha" (151x44), lado a lado em `.auth-links` (y 519 a 375). O caminho de quem chega pela 1ª vez não se destaca | `index.html:112-115`; `styles.css:185,195` | Hierarquia, Hick | Alta | P | B |
| E2 | Campos com **13 px** (`#login-email` 13 px a 375 e a 1280): no iPhone, foco em campo < 16 px amplia a página | `styles.css:145` (label 13 px) + `:147` (`font: inherit`) | Jakob (padrão do iOS) | Alta | P | B (público); C (app) |
| E3 | Sem "Mostrar senha" | `index.html:96-98` | Jakob | Média | P | B |
| E4 | Trocar de tela não leva foco nem rolagem: depois de "Criar conta" com a página rolada 300 px, o foco fica no `<body>` e o título do cadastro a **−118 px** (fora da tela) | `app.js:474-481`, `:516-520` | Orientação, a11y | Média | P | B |
| E5 | Duas frases antes do formulário empurram o e-mail para y = 295 px a 375 | `index.html:90` | Hierarquia | Baixa | P | B |
| E6 | Lia flutuante (fixa no canto) passa por cima da borda direita de "Conheça a LAIFT" durante a rolagem (captura `capturas/entrada-claro-375.png`); o e2e só confere o fim da rolagem | `assistant.js` (lançador) | Fitts | Baixa | P | C |
| E7 | Atalhos "Conheça a LAIFT" e "Acessar blog": 56 px, largura total — **bom** (manter) | `ux.css` (ajustes-2) | Fitts | — | — | — |

## 2. Cadastro (`#screen-register`)
| id | Achado (medida) | Onde | Lei | Grav. | Esf. | Lote |
|---|---|---|---|---|---|---|
| K1 | **12 campos** à vista, 7 obrigatórios, página de **1.541 px** a 375 (1,9 tela); a senha (obrigatória) vem depois de 4 opcionais | `index.html:130-191` | Hick, Gestalt | Alta | M | B |
| K2 | Escolha sem escolha: "Validação da conta" com uma opção ("SMS (indisponível na V1)" desabilitado) | `index.html:171-176` | Hick | Média | P | B |
| K3 | Duas convenções juntas: `*` nos obrigatórios e "(opcional)" em 5 rótulos | `index.html:144-165` | Consistência | Média | P | B |
| K4 | "(não pode ser alterado depois)" dentro do rótulo do nome: o leitor de tela lê como parte do nome do campo | `index.html:144` | a11y | Baixa | P | B |
| K5 | Ação com nome diferente do título: título "Criar conta", botão "Enviar cadastro" | `index.html:127,191` | Consistência | Baixa | P | B |
| K6 | Telefone obrigatório (decisão de produto; AVALIACAO §5) | `index.html:153` | Hick | Média | P | dono |
| K7 | Links "Termos" e "Política" com 17 px de altura a 1280 (34 px a 375), dentro da caixa do checkbox (alvo de 44 px na linha toda: aceitável) | `index.html:182-189` | Fitts | Baixa | — | — |
Ensaio do Lote B (CONTRATO §6): mesma tela com **1.171 px** (−24%), 5 campos + 2 aceites à vista, opcional recolhido, foco no título.

## 3. App logado (barra inferior, Início, Aprender)
| id | Achado (medida) | Onde | Lei | Grav. | Esf. | Lote |
|---|---|---|---|---|---|---|
| A1 | Barra inferior: **8 itens** (membro) e **9** (admin) a 375; cada botão **47 px** (membro) e **42 px** (admin) de largura; rótulo **10 px** abaixo de 400 px (11 px até 480); "Mensagens" cortado (membro); "Aprender", "Propostas" e "Mensagens" cortados (admin) | `index.html:257-300`; `styles.css:344-347`, `:585-594` | Fitts (42 < 44), Hick, Jakob (apps usam 3 a 5) | Alta | M | C |
| A2 | Início com **12 títulos** de seção em **2.262 px** a 375 (Atividade, Eventos, Aprendizagem, Tarefas concluídas, Horas de estudo, Comparativo mensal, Selos, Agora, Próximos eventos, Votações, Caixa de entrada); "Agora" (o que fazer hoje) vem **depois** dos gráficos | `home.js` (montagem do painel) | Hierarquia, Hick | Alta | M | C |
| A3 | Falha de dados vira **6 botões "Tentar de novo"** ao mesmo tempo no Início (um por gráfico) | `home.js:279-283` | Hick | Média | P | C |
| A4 | Aprender: 5 cartões de **347x167 px** em coluna (1.605 px), sem grupo e sem sinal de avanço no cartão; "Desempenho por módulo" fica num bloco à parte, escondido sem dados | `index.html:384-391`; `learning.js:136-160` | Gradiente de meta, Gestalt | Média | M | C/D |
| A5 | Campos do app também com 13 px (perfil, propostas, mensagens) | `styles.css:145-147` | Jakob (zoom do iOS) | Média | P | C |
| A6 | 42 `style=""` no `index.html` (ex.: "Sair" `:247`, badges `:271-289`); a CSP do app ainda aceita `'unsafe-inline'` em estilo (`index.html:6`) | `index.html` | Segurança, manutenção | Baixa | M | C |

## 4. Módulos (iframes de "Aprender")
| id | Achado (medida, 1ª tela a 375) | Onde | Lei | Grav. | Esf. | Lote |
|---|---|---|---|---|---|---|
| M1 | Laboratório: **12 textos < 12 px** (rótulos do HUD com **8,32 px**, ex. "Temperatura"; botões "Tela Cheia", "Estúdio 3D", "Guia" com 11,52 px) | `modulos/laboratorio/` | Legibilidade | Média | M | D |
| M2 | Farmacologia, Toxicologia e Clínica: **0** textos < 12 px e **0** alvos < 44 px (18, 16 e 9 alvos medidos) — **bom** | `modulos/quiz`, `toxicologia`, `clinica` | Fitts | — | — | — |
| M3 | Nenhum módulo mostra quanto já foi feito com um padrão comum (cada um tem o seu ou nenhum) | `modulos/*` | Gradiente de meta, Jakob | Média | M | D (`LaiftProgress`, CONTRATO §7) |
| M4 | Visor: "← Voltar", título e "Tela cheia" na barra do topo — padrão conhecido (manter) | `index.html:394-398` | Jakob | — | — | — |

## 5. Público (blog e /liga), para o Lote A e depois
| id | Achado (medida) | Onde | Lei | Grav. | Esf. | Lote |
|---|---|---|---|---|---|---|
| P1 | Barra de leitura do post: linha de **3 px** no topo, sem marcos, sem frase, sem registro; o post da campanha tem **29.451 px** de artigo a 375 (36 telas) | `blog.css:908-921`; `blog/post.js:12-18` | Gradiente de meta | Alta | M | **A** (resolvido no ensaio) |
| P2 | `/liga` com **8.114 px** a 375 (10 telas) | `liga.html` | Hick, hierarquia | Média | M | depois |
| P3 | "Edital" **35x44** e "Blog" **29x44** na barra pública (largura < 44) | `liga.html`, `blog.html`, posts | Fitts | Baixa | P | depois |
| P4 | Feed com 5 filtros (dentro do limite de escolha) — manter | `blog.html` | Hick | — | — | — |

## 6. O que fica bom e não deve piorar
Atalhos grandes da entrada (E7), os 3 módulos de questões (M2), "Voltar" no canto superior esquerdo, foco visível de 3 px, mensagens em
`role="alert"`, `autocomplete` certo nos campos. Toda ficha nova confere estes pontos nos verificadores.
