/* Configuração ESLint (formato legado .eslintrc, compatível com eslint-plugin-html para varrer <script> dentro dos .html do Apps Script). */
module.exports = {
  root: true,
  env: {
    es2021: true,
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'script',
  },
  extends: ['eslint:recommended'],
  plugins: ['html'],
  settings: {
    'html/html-extensions': ['.html'],
  },
  ignorePatterns: [
    'node_modules/**',
    'coverage/**',
    // src/ui/Index.html tem tags de template do Apps Script (`<?= ... ?>`)
    // dentro de um <script>, injetadas pelo HtmlService no servidor ANTES de
    // chegar ao navegador. Não é JavaScript válido do ponto de vista de um
    // parser estático — eslint-plugin-html não consegue processar esse
    // arquivo por esse motivo estrutural (não é um erro real de código; os
    // demais .html não têm scriptlets dentro de <script> e são linted normalmente).
    'src/ui/Index.html',
  ],
  overrides: [
    {
      // Arquivos .gs: rodam no runtime V8 do Apps Script (servidor).
      // Globais dos serviços do Apps Script + namespaces do próprio projeto.
      files: ['src/**/*.gs'],
      globals: {
        App: 'readonly',
        SpreadsheetApp: 'readonly',
        HtmlService: 'readonly',
        PropertiesService: 'readonly',
        ScriptApp: 'readonly',
        Session: 'readonly',
        Utilities: 'readonly',
        MailApp: 'readonly',
        Jdbc: 'readonly',
        JdbcConnection: 'readonly',
        Logger: 'readonly',
        LockService: 'readonly',
        CacheService: 'readonly',
        console: 'readonly',
      },
      rules: {
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        eqeqeq: ['error', 'always'],
        'no-implicit-globals': 'off',
      },
    },
    {
      // Config.gs é o ÚNICO arquivo que declara `var App = {}`; nos demais
      // .gs, App é tratado como global pré-existente (ver bloco acima). Sem
      // este override, Config.gs dispararia no-redeclare contra seu próprio
      // global declarado logo acima.
      files: ['src/Config.gs'],
      globals: { App: 'off' },
    },
    {
      // <script> dentro dos .html: roda no navegador do usuário (cliente).
      files: ['src/ui/*.html'],
      globals: {
        google: 'readonly',
        window: 'readonly',
        document: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
      },
      rules: {
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        eqeqeq: ['error', 'always'],
      },
    },
    {
      // Testes Jest (Node.js).
      files: ['tests/**/*.js'],
      env: {
        node: true,
        jest: true,
      },
      rules: {
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      },
    },
  ],
};
