# Regras fixas de toda ficha (leia antes de começar)

Repo: `C:\Users\Administrador\Desktop\plataforma membro` (branch `feat/blog-plataforma`). Comandos de aceite rodam a partir de `frontend/`.

1. **Só edite os arquivos de que a sua ficha é DONA.** Precisa mudar outro arquivo? Não mude: escreva no relatório o que precisa e por quê.
2. **Não use git** (nada de add/commit/stash/checkout/reset). A sessão principal comita.
3. CSP de todas as páginas: `script-src 'self'; style-src 'self'` → sem `<script>` inline, sem `style=""`, sem `innerHTML`;
   o JS só muda estilo por CSSOM (`el.style.setProperty('--v', x)`) e cria nós com `createElement`/`textContent`.
4. Arquivos `.js`, `.css`, `.mjs` novos começam com este cabeçalho (cópia de `frontend/scripts/build-blog.test.mjs:1-5`):
   ```
   /*
    * Plataforma de Membros LAIFT
    * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
    * Licença proprietária: ver LICENSE na raiz do repositório.
    */
   ```
5. Movimento só em `transform`/`opacity`; `@media (prefers-reduced-motion: reduce)` mostra o estado final; JS que anima checa
   `matchMedia('(prefers-reduced-motion: reduce)').matches`. Alvo de toque ≥ 44 px. `:hover` só em `@media (hover: hover)`.
   A página lê bem sem JS (`<details>`, `<table>`).
6. Textos em português do Brasil, tom de `docs/blog/ESTILO.md`. Sem nome de pessoa, sem e-mail pessoal. Sem emoji
   (exceção: bloco `habitos` e a legenda do Instagram, ver a ficha). Conteúdo de saúde é educativo e não substitui profissional.
7. Contrato: `docs/blog/CAMPANHAS.md` (campanhas) e `docs/blog/WIREFRAME.md` (blog). Nomes de classe/ids/atributos são exatamente os de lá.
8. **GateGuard:** se um hook pedir fatos na primeira criação/edição de um arquivo, escreva 2 linhas — quem usa o arquivo e a
   instrução do usuário (a frase da sua ficha) — e repita a MESMA chamada.
9. Não leia arquivos grandes inteiros sem precisar (use Grep/offset). Economize tokens.
10. **Relatório final (≤ 12 linhas):** `id` · arquivos criados/alterados · comando(s) de aceite e resultado (passou/falhou + 1 linha de saída) ·
    pendências para outros donos · riscos. Nada de colar código.
