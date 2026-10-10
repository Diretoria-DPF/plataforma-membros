/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Trocas EXATAS dos arquivos quentes do Lote B (docs/ux-progresso/CONTRATO.md §6), para a SESSÃO PRINCIPAL.
// Nenhuma ficha é dona destes arquivos. Cada trecho antigo precisa aparecer UMA vez; se não aparecer, nada é gravado.
// Mantém o fim de linha do arquivo (CRLF ou LF). Uso, da RAIZ:
//   node docs/ux-progresso/aplicar-quentes.js --conferir   (só confere; não grava)
//   node docs/ux-progresso/aplicar-quentes.js              (grava index.html, scripts/build.js e sw.js)
//   --frontend <pasta>  aplica numa cópia (ensaio)
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const CONFERIR = args.includes('--conferir');
const iFront = args.indexOf('--frontend');
const FRONT = iFront >= 0 ? path.resolve(args[iFront + 1]) : path.resolve(__dirname, '..', '..', 'frontend');

const TROCAS = {
  'index.html': [
    // §6.1 cartão de login: texto curto, "Mostrar senha" e "Esqueci" junto da senha, "Criar conta" como botão secundário.
    ['          <p class="muted">LAIFT — Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia. Acompanhe eventos, participe de votações e organize tarefas coletivas.</p>',
      '          <p class="muted">LAIFT — Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia.</p>'],
    [`              <input type="password" id="login-password" autocomplete="current-password" required>
            </label>
            <button type="submit">Entrar</button>`,
    `              <input type="password" id="login-password" autocomplete="current-password" required>
            </label>
            <div class="auth-senha-linha">
              <label class="auth-mostrar" for="login-mostrar"><input type="checkbox" id="login-mostrar" data-senha-visivel="login-password"><span>Mostrar senha</span></label>
              <button type="button" class="link-btn auth-esqueci" data-nav="screen-forgot">Esqueci minha senha</button>
            </div>
            <button type="submit">Entrar</button>`],
    [`          <div class="auth-links">
            <button type="button" class="link-btn" data-nav="screen-register">Criar conta</button>
            <button type="button" class="link-btn" data-nav="screen-forgot">Esqueci minha senha</button>
          </div>`,
    `          <div class="auth-criar">
            <p class="auth-criar__texto">Primeira vez aqui?</p>
            <button type="button" class="secondary auth-criar__botao" data-nav="screen-register">Criar conta</button>
          </div>`],
    // §6.2 cadastro: grupos "Seus dados" e "Senha"; o opcional recolhido; sem a escolha de SMS.
    [`        <p class="muted">Sua conta começa como visitante; a confirmação por e-mail é obrigatória para entrar.</p>

        <form id="form-register" novalidate>
          <label class="avatar-picker-row" for="reg-avatar-input">`,
    `        <p class="muted">Sua conta começa como visitante. Confirme o e-mail para entrar.</p>

        <form id="form-register" novalidate>
          <fieldset class="cadastro-grupo">
            <legend>Seus dados</legend>
            <label for="reg-name">Nome completo
              <input type="text" id="reg-name" autocomplete="name" required minlength="3" maxlength="150" aria-describedby="reg-name-dica">
            </label>
            <p id="reg-name-dica" class="cadastro-dica">O nome não pode ser alterado depois.</p>
            <label for="reg-username">Nome de usuário
              <input type="text" id="reg-username" autocomplete="username" required minlength="3" maxlength="30" pattern="[a-zA-Z0-9_.]+">
            </label>
            <label for="reg-email">E-mail
              <input type="email" id="reg-email" autocomplete="email" required>
            </label>
            <label for="reg-phone">Telefone
              <input type="tel" id="reg-phone" autocomplete="tel" required minlength="8" maxlength="30">
            </label>
          </fieldset>
          <fieldset class="cadastro-grupo">
            <legend>Senha</legend>
            <label for="reg-password">Senha (mínimo 8 caracteres)
              <input type="password" id="reg-password" autocomplete="new-password" required minlength="8">
            </label>
            <label class="auth-mostrar" for="reg-mostrar"><input type="checkbox" id="reg-mostrar" data-senha-visivel="reg-password"><span>Mostrar senha</span></label>
          </fieldset>
          <details class="cadastro-opcional">
            <summary>Completar perfil (opcional)</summary>
          <label class="avatar-picker-row" for="reg-avatar-input">`],
    ['              <strong>Foto de perfil (opcional)</strong>', '              <strong>Foto de perfil</strong>'],
    [`          <div id="msg-reg-avatar" class="status-msg" role="alert" aria-live="polite"></div>

          <label for="reg-name">*Nome completo <span class="muted">(não pode ser alterado depois)</span>
            <input type="text" id="reg-name" autocomplete="name" required minlength="3" maxlength="150">
          </label>
          <label for="reg-username">*Nome de usuário
            <input type="text" id="reg-username" autocomplete="username" required minlength="3" maxlength="30" pattern="[a-zA-Z0-9_.]+">
          </label>
          <label for="reg-email">*E-mail
            <input type="email" id="reg-email" autocomplete="email" required>
          </label>
          <label for="reg-phone">*Telefone
            <input type="tel" id="reg-phone" autocomplete="tel" required minlength="8" maxlength="30">
          </label>
          <label for="reg-linkedin">Perfil do LinkedIn (opcional)`,
    `          <div id="msg-reg-avatar" class="status-msg" role="alert" aria-live="polite"></div>
          <label for="reg-linkedin">Perfil do LinkedIn`],
    ['          <label for="reg-instagram">Instagram (opcional)', '          <label for="reg-instagram">Instagram'],
    ['          <label for="reg-education">Escolaridade (opcional)', '          <label for="reg-education">Escolaridade'],
    [`          <label for="reg-interests">Assuntos de interesse (opcional)
            <textarea id="reg-interests" maxlength="500"></textarea>
          </label>
          <label for="reg-password">Senha (mínimo 8 caracteres)
            <input type="password" id="reg-password" autocomplete="new-password" required minlength="8">
          </label>
          <label for="reg-validation">Validação da conta
            <select id="reg-validation">
              <option value="email">E-mail</option>
              <option value="sms" disabled>SMS (indisponível na V1)</option>
            </select>
          </label>
`,
    `          <label for="reg-interests">Assuntos de interesse
            <textarea id="reg-interests" maxlength="500"></textarea>
          </label>
          </details>
          <input type="hidden" id="reg-validation" value="email">
`],
    ['          <button type="submit">Enviar cadastro</button>', '          <button type="submit">Criar conta</button>'],
    // §6.4 comportamento novo (Mostrar senha e foco no título), carregado depois de app.js.
    ['  <script src="app.js" defer></script>\n</body>', '  <script src="app.js" defer></script>\n  <script src="entrada.js" defer></script>\n</body>'],
  ],
  'scripts/build.js': [
    ["'voltar-app.css', 'blog-sw.js']", "'voltar-app.css', 'blog-sw.js', 'entrada.js']"],
  ],
  'sw.js': [
    ["'voltar-app.js', 'voltar-app.css',", "'voltar-app.js', 'voltar-app.css', 'entrada.js',"],
  ],
};

let problemas = 0;
const prontos = [];
for (const [relativo, trocas] of Object.entries(TROCAS)) {
  const arquivo = path.join(FRONT, relativo);
  const original = fs.readFileSync(arquivo, 'utf8');
  const crlf = original.includes('\r\n');
  let texto = original.replace(/\r\n/g, '\n');
  for (const [antes, depois] of trocas) {
    const vezes = texto.split(antes).length - 1;
    if (vezes !== 1) {
      problemas += 1;
      console.log(`✘ ${relativo}: trecho encontrado ${vezes} vez(es): ${antes.split('\n')[0].trim().slice(0, 90)}`);
      continue;
    }
    texto = texto.replace(antes, () => depois);
  }
  prontos.push({ arquivo, texto: crlf ? texto.replace(/\n/g, '\r\n') : texto, relativo, n: trocas.length });
}

if (problemas) {
  console.log(`\n${problemas} trecho(s) não conferem. Nada foi gravado.`);
  process.exitCode = 1;
} else if (CONFERIR) {
  prontos.forEach((p) => console.log(`✔ ${p.relativo}: ${p.n} troca(s) conferida(s)`));
  console.log('\nConferido. Nada foi gravado (--conferir).');
} else {
  prontos.forEach((p) => { fs.writeFileSync(p.arquivo, p.texto); console.log(`✔ ${p.relativo}: ${p.n} troca(s) gravada(s)`); });
}
