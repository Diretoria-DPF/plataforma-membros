# Identidade digital da Liga: plano (v1, 2026-10-09)

Pedido do dono (2026-10-09): "Conheça a LAIFT" vira a identidade digital da Liga, com interface moderna, processo seletivo em
abas, edital novo, instituição com prédio e mapa, blog na tela inicial e instalável, ícones e "Voltar" em todo módulo.
Contrato técnico: `docs/identidade/CONTRATO.md`. Fichas e ondas: `docs/identidade/fichas/ORDEM.md`.
Branch: `feat/identidade-liga`, a partir de `origin/main` (b589fed). O `main` local está atrasado (0d9cf2a): não use.

## 1. Diagnóstico (o que existe x o que o dono pede)
| Tema | Hoje | Pedido | Ação |
|---|---|---|---|
| `/liga` (`liga.html`, 135 l.) | Texto corrido; "em revisão" 4 vezes; áreas antigas do Forms; "Campus Pituba"; CTA "Inscrever-se" direto ao Forms; sem favicon; carrega `styles.css` inteiro | Hero com nome, lema e oferta; cards verticais; áreas gerais; compromissos e benefícios; contato; instituição | Reescrever (H1, D2) |
| Processo seletivo | Seção dentro de `/liga`; FAQ de 4 itens | Botão "Processo seletivo" → aba de instruções → "Participar do processo seletivo" → formulário | Nova `processo-seletivo.html` (H2, D1) |
| Edital | "Edital 2026 em revisão"; v2 é proposta com "pendente" | Edital novo, vinculado ao ciclo, "clicar e abrir" | Nova `edital.html` a partir do antigo (E1) |
| Instituição | "Campus UNINASSAU, Pituba" | UNINASSAU, Rua Direita da Piedade, 358, mapa, abrir no aparelho, prédio grande | Prédio SVG (S1), mapa sob demanda (J1) |
| Tela inicial (`index.html:114-118`) | Aviso da flag, "Conheça a LAIFT", "Conheça a plataforma" | Link direto ao blog e aviso de nova publicação | Link + `blog-novidade.js` (J3, sessão principal) |
| Blog | Topo com marca, Instagram e e-mail; sem favicon, manifest ou voltar; CSP `worker-src 'none'` | "Início", "Entrar", "Cadastrar" no topo; voltar; ícone; instalável | Barra pública (B1), PWA do blog (W1) |
| Cadastro e login por link | `app.js` só lê `?mode=` e `#atlas=` | Abrir cadastro e login a partir da barra | `/#cadastro` e `/#entrar` (sessão principal) |
| "Voltar" | Só termos e privacidade (`static-page.js`, `data-history-back`) e "← Módulos" no visualizador | Botão no canto superior esquerdo em todo módulo | Barra pública + `voltar-app.js` (V1) |

## 2. Decisões
1. **Fluxo do processo seletivo.** Hero de `/liga`: com a flag `selection_open` ligada, botão principal "Processo seletivo"; com ela
   desligada (ou erro), link "Conheça o processo seletivo". Os dois levam a `/processo-seletivo` (a aba de instruções: antes de
   começar, etapas, FAQ, resumo do edital). Lá, o botão fixo "Participar do processo seletivo" (`#liga-cta-inscricao`) só aparece
   com a flag ligada e abre o formulário de `liga-ciclo.json` em nova aba. Sem JS: tudo lido, estado "fechado".
2. **FAQ** (texto literal do dono): Como se inscrever; Quem pode participar?; Quando são as inscrições?; Quantas vagas há?; Como acompanho o resultado?
3. **Edital.** Rota `/edital` (`edital.html`), texto novo a partir de `docs/liga/fontes/edital-original-2026.txt` e do v2, sem
   "proposta/pendente". Datas e vagas vêm de `liga-ciclo.json` (`data-ciclo-*`, "a divulgar" sem fonte). Botão "Imprimir ou salvar em PDF".
4. **Instituição.** Coordenadas confirmadas em fonte aberta (2026-10-09): OpenStreetMap, edifício `way 1225245762` "UNINASSAU",
   `building:levels=4`, centro **-12.98658, -38.51689** (Nominatim); ViaCEP: CEP 40070-190 = Rua Direita da Piedade, Barris,
   Salvador/BA. Prédio = SVG próprio de 4 andares (`icons/predio-instituicao.svg`), em `<img>`, paleta fixa como um emoji.
5. **Mapa sob demanda (LGPD).** Nada de terceiro carrega sozinho. Botão "Ver o mapa aqui" cria o `<iframe>` do OpenStreetMap
   (embed oficial) e o aviso diz que o provedor recebe o IP. "Abrir no app de mapas": `geo:` no Android, Apple Mapas no iPhone/iPad,
   Google Maps nos demais; links fixos para Google, Apple e OSM. CSP de `/liga`: `frame-src https://www.openstreetmap.org`.
6. **Aviso do blog.** `blog-novidade.js` lê `blog/index.json`; escolhe a maior `data`, empate a favor de `serie: "campanhas"`, depois a
   ordem do índice. Selo "Nova publicação no blog" se tiver até 14 dias e não estiver em `localStorage.laift_blog_visto`.
   Falha de rede, JSON inválido ou `href` fora de `^blog/[a-z0-9-]+\.html$`: o bloco fica escondido, sem erro. Tela inicial: 1 item; `/liga`: 3.
7. **Barra superior pública** (`publico.css`): `Voltar` (esquerda), marca, `Início` (`/`), `Entrar` (`/#entrar`), `Cadastrar`
   (`/#cadastro`); nas páginas da Liga também `Blog`; no blog também `Instalar`. Celular: 2 linhas; desktop: 1 linha.
8. **Voltar: regra única "volta à tela anterior; se não houver, ao destino de reserva".** Páginas públicas usam
   `a[data-history-back]` + `static-page.js` (histórico só se o referrer for do próprio site). No app, `voltar-app.js` guarda a pilha
   de painéis (evento `laift:panelchange`) e chama `App.showPanel`.

| Página ou módulo | Botão | Reserva |
|---|---|---|
| `liga.html` | `.pub-voltar` | `./` (início) |
| `processo-seletivo.html` | `.pub-voltar` | `liga.html` |
| `edital.html` | `.pub-voltar` | `processo-seletivo.html` |
| `blog.html` | `.pub-voltar` | `/` |
| `blog/<slug>.html` e `blog/404.html` | `.pub-voltar` | `/blog.html` |
| `termos.html`, `privacidade.html` | "← Voltar" já existente | `./` |
| `404.html` | "← Voltar" novo no topo (sessão principal) | `./` |
| Cadastro e "Esqueci minha senha" (`index.html`) | "← Voltar" novo no topo do card | tela de login |
| 17 painéis do app (Aprender, Eventos, Propostas, Tarefas, Equipe, Mensagens, Perfil e 10 do admin) | `.app-voltar` | `panel-home`; no admin, `panel-admin-dashboard` e, dele, sair do modo admin |
| Módulos no visualizador (quiz, toxicologia, clínica, laboratório, anatomia 3D) | `#learn-back` "← Voltar" (o `.app-voltar` do painel some com o módulo aberto) | hub de módulos |
| Conversa em Mensagens | `#btn-messaging-back` já existente | lista de conversas |

9. **Ícones.** Toda página pública declara `favicon-32.png`, `icon-192.png` (Google pede múltiplo de 48 px) e `apple-touch-icon.png`;
   `build.js` grava `dist/favicon.ico` (ICO com o PNG de 32 px) para quem pede `/favicon.ico`.
10. **Blog instalável.** Manifest próprio `blog/manifest.webmanifest` (`id`/`start_url`/`scope` = `/blog`, "Blog LAIFT", ícones da
    plataforma). Service worker próprio `blog-sw.js` na raiz com `scope: '/blog'` (rede primeiro, posts lidos ficam offline,
    `/blog.html` e `/blog` na mesma chave). `blog/instalar.js`: botão "Instalar" via `beforeinstallprompt`; no iPhone/iPad, diálogo
    "Compartilhar → Adicionar à Tela de Início". CSP do blog passa a `worker-src 'self'`.
11. **Design.** Variante A "Institucional" já aprovada (`docs/liga/IDENTIDADE_VISUAL.md`): base clara, teal como acento, camadas por tom,
    raio 24 a 32 px, só tokens de `laift-tokens.css` (o tema escuro vem dele). Emojis do dono como ícones decorativos (`aria-hidden`).
    Cards verticais em carrossel com scroll-snap no celular e grade no desktop. Revelação por rolagem só com
    `animation-timeline: view()` dentro de `@supports` e `prefers-reduced-motion: no-preference`: sem JS de animação, sem biblioteca (ADR 0006).
12. **Páginas da Liga não carregam `styles.css`** (só tokens + `publico.css` + CSS da página): CSP com `style-src 'self'`, sem `'unsafe-inline'`.

## 3. Riscos
- Arquivos quentes (`index.html`, `app.js`, `build.js`, `sw.js`) só pela sessão principal, com os trechos de `CONTRATO.md` §12.
  O checkout principal tem mudanças da Lia não comitadas nesses arquivos: trabalhe num worktree e espere conflito pequeno no merge da Lia.
- Worktree novo não tem `frontend/node_modules`: `npm ci` em `frontend/` (ou junção para o do checkout principal) antes da onda 3.
- Testes que mudam de propósito: `liga.e2e.js` (marcação nova) e `blog.e2e.js` (contatos saem do topo). Q1 e Q3 reescrevem.
- `visual-qa` mede só abas e cabeçalho; se a geometria mudar, regravar a baseline (`UPDATE_GEOMETRY=1`) só depois da revisão.
- Embed do OSM: a política de tiles pede Referer (não usar `referrerpolicy="no-referrer"`) e atribuição (o embed já mostra).
- Cloudflare redireciona `/blog.html` → `/blog`: o SW do blog normaliza a chave; `start_url` usa `/blog`.
- O Google Forms ainda lista as 6 áreas antigas e "Campus Pituba": a página e o Forms ficam diferentes até o dono editar o Forms.
- `animation-timeline` não existe em todo navegador: sem suporte, a página aparece estática (correto).

## 4. Precisa do OK ou do dado do dono (antes da PR)
1. **Texto do novo edital** (`edital.html`), incluindo a cláusula "casos não previstos: diretoria" e a nota de que o formulário é um Google Forms.
2. **Endereço**: a página passa a mostrar Rua Direita da Piedade, 358 (Barris); o edital antigo e o Forms dizem "Campus Pituba, CEP 41810-205".
3. **Áreas**: as 5 do dono + 3 propostas (Farmacologia clínica e terapêutica; Toxicologia ambiental e ocupacional; Comunicação científica e extensão). E atualizar o Forms.
4. **Frase incompleta** "no bloco conheça a laift, onde tem processo seletivo, ...": o botão "Processo seletivo" do blog passa a levar às instruções. Confirmar.
5. **Benefícios e diferencial** (CONTRATO §11): nada promete certificado nem horas complementares. Confirmar o texto.
6. **Idade e menores**: o texto público não fala de idade; o Forms aceita 12 a 17 anos. Fica para o parecer jurídico.
7. **Dados da diretoria**: vagas, datas, carga horária mínima, pesos (hoje "a divulgar" em `liga-ciclo.json`).
8. **Mapa**: OpenStreetMap como provedor, por clique; ver se a Política de Privacidade cita mapa de terceiro (advogado).
9. **App do blog**: nome "Blog LAIFT" e o mesmo ícone da plataforma.
10. **Portão visual**: aprovar as capturas de `docs/identidade/capturas/` (375 e 1280 px, claro e escuro). A PR só abre depois.
