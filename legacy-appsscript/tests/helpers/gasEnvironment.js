/**
 * gasEnvironment.js
 * Carrega o código-fonte real dos arquivos .gs (src/**) dentro de um
 * contexto vm do Node, com os serviços do Apps Script mockados. Isso permite
 * testar a lógica de negócio real (não uma reimplementação paralela em JS de
 * teste) sem depender de PropertiesService/Jdbc/MailApp reais.
 *
 * Escopo deliberado: App.Database é substituído por um mock simples
 * (query/execute/withTransaction como jest.fn()) na maioria dos testes de
 * serviço, porque o comportamento real de SQL (constraints, triggers,
 * concorrência) só pode ser validado contra um Postgres de verdade — ver
 * docs/DEPLOYMENT.md, seção "Verificações pendentes". Os testes que exercitam
 * especificamente Database.gs usam um fake de Jdbc dedicado (ver
 * tests/services.test.js, bloco "Database.gs").
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SRC_ROOT = path.join(__dirname, '..', '..', 'src');

const CORE_FILES = ['Config.gs', 'Constants.gs', 'Security.gs', 'Logging.gs'];
const SERVICE_FILES = [
  'services/AuthService.gs',
  'services/ProfileService.gs',
  'services/EventService.gs',
  'services/ProposalService.gs',
  'services/TaskService.gs',
  'services/AdminService.gs',
  'services/AuditService.gs',
];

function makeScriptPropertiesMock(initial) {
  const store = Object.assign({}, initial || {});
  return {
    getProperty: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setProperty: function (key, value) {
      store[key] = value;
    },
    _store: store,
  };
}

function makeCacheMock() {
  const store = new Map();
  return {
    get: function (key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    put: function (key, value, ttlSeconds) {
      store.set(key, { value: value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
    },
    remove: function (key) {
      store.delete(key);
    },
    _store: store,
  };
}

function bytesFromDigest(buffer) {
  return Array.from(buffer.values());
}

function buildSandbox(options) {
  const opts = options || {};
  const scriptProperties = makeScriptPropertiesMock(
    Object.assign(
      {
        DB_JDBC_URL: 'jdbc:postgresql://localhost:5432/test',
        DB_USER: 'test_user',
        DB_PASSWORD: 'test_password',
        SESSION_TOKEN_PEPPER: 'test-pepper-value-not-for-production',
        APP_BASE_URL: 'https://script.google.com/macros/s/fake-deployment/exec',
        MAIL_FROM_NAME: 'Plataforma de Membros (teste)',
      },
      opts.scriptProperties || {}
    )
  );

  const cache = makeCacheMock();
  const sentEmails = [];

  const sandbox = {
    console: console,
    PropertiesService: { getScriptProperties: function () { return scriptProperties; } },
    CacheService: { getScriptCache: function () { return cache; } },
    Utilities: {
      getUuid: function () { return crypto.randomUUID(); },
      computeDigest: function (_algorithm, value) {
        const hash = crypto.createHash('sha256').update(String(value), 'utf8').digest();
        return bytesFromDigest(hash);
      },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
    },
    MailApp: {
      sendEmail: function (options) {
        if (opts.mailShouldThrow) throw new Error('Falha simulada de envio de e-mail.');
        sentEmails.push(options);
      },
    },
    Logger: { log: function () {} },
    ScriptApp: { getService: function () { return { getUrl: function () { return opts.appUrl || 'https://script.google.com/macros/s/fake-deployment/exec'; } }; } },
    Session: { getScriptTimeZone: function () { return 'America/Sao_Paulo'; } },
    Jdbc: opts.jdbc || {
      Types: { VARCHAR: 12 },
      getConnection: function () {
        throw new Error('Jdbc real não deve ser usado nestes testes; injete um Database mock.');
      },
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: function (text) {
        return {
          _text: text,
          _mimeType: null,
          setMimeType: function (mimeType) {
            this._mimeType = mimeType;
            return this;
          },
        };
      },
    },
  };

  const context = vm.createContext(sandbox);
  return { context: context, scriptProperties: scriptProperties, cache: cache, sentEmails: sentEmails };
}

function loadFiles(context, relativePaths) {
  relativePaths.forEach(function (relativePath) {
    const fullPath = path.join(SRC_ROOT, relativePath);
    const source = fs.readFileSync(fullPath, 'utf8');
    const script = new vm.Script(source, { filename: relativePath });
    script.runInContext(context);
  });
}

/**
 * Carrega Config/Constants/Security/Logging + serviços, com App.Database
 * substituído por um mock controlável pelo teste (query/execute/withTransaction).
 */
function createServiceEnvironment(options) {
  const built = buildSandbox(options);
  loadFiles(built.context, CORE_FILES);

  const databaseMock = {
    query: jest.fn(),
    execute: jest.fn(),
    withTransaction: jest.fn(),
  };
  built.context.App.Database = databaseMock;

  loadFiles(built.context, SERVICE_FILES);

  return { App: built.context.App, database: databaseMock, cache: built.cache, sentEmails: built.sentEmails, scriptProperties: built.scriptProperties };
}

/** Carrega só Config/Constants/Security/Logging, sem serviços nem Database mockado (para testes de Security.gs isolado). */
function createCoreEnvironment(options) {
  const built = buildSandbox(options);
  loadFiles(built.context, CORE_FILES);
  return { App: built.context.App, cache: built.cache, sentEmails: built.sentEmails, scriptProperties: built.scriptProperties };
}

/** Carrega Config/Constants/Logging + o Database.gs real, com um fake de Jdbc fornecido pelo teste. */
function createDatabaseEnvironment(fakeJdbc) {
  const built = buildSandbox({ jdbc: fakeJdbc });
  loadFiles(built.context, ['Config.gs', 'Constants.gs']);
  loadFiles(built.context, ['Database.gs']);
  return { App: built.context.App };
}

/**
 * Como createServiceEnvironment, mas também carrega Main.gs, expondo as
 * funções de nível superior chamáveis por google.script.run (apiLogin,
 * apiAdminBanUser, ...) diretamente no contexto retornado.
 */
function createFullEnvironment(options) {
  const built = buildSandbox(options);
  loadFiles(built.context, CORE_FILES);
  const databaseMock = { query: jest.fn(), execute: jest.fn(), withTransaction: jest.fn() };
  built.context.App.Database = databaseMock;
  loadFiles(built.context, SERVICE_FILES);
  loadFiles(built.context, ['Main.gs']);

  return {
    App: built.context.App,
    context: built.context,
    database: databaseMock,
    cache: built.cache,
    sentEmails: built.sentEmails,
    scriptProperties: built.scriptProperties,
  };
}

module.exports = {
  createServiceEnvironment: createServiceEnvironment,
  createCoreEnvironment: createCoreEnvironment,
  createDatabaseEnvironment: createDatabaseEnvironment,
  createFullEnvironment: createFullEnvironment,
};
