/**
 * loadOrder.test.js
 *
 * Regressão: o Apps Script avalia o código de nível superior de TODOS os
 * arquivos .gs do projeto em ordem ALFABÉTICA pelo nome (não por
 * dependência, não pela ordem em que aparecem no repositório). Isso já
 * quebrou a aplicação em produção uma vez ("Code.gs" rodava antes de
 * "Config.gs" porque "Code" < "Config" alfabeticamente, então App.Dispatch
 * era atribuído a um `App` ainda `undefined`).
 *
 * Os outros arquivos de teste carregam os .gs numa ordem escolhida à mão
 * (ver gasEnvironment.js), então não pegam esse tipo de problema. Este
 * arquivo carrega exatamente na ordem alfabética real, simulando o
 * comportamento do Apps Script, para pegar isso automaticamente se alguém
 * criar ou renomear um arquivo no futuro de um jeito que quebre a ordem.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SRC_ROOT = path.join(__dirname, '..', 'src');

function listGsFilesClaspStyle() {
  const results = [];
  function walk(dir, prefix) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const fullPath = path.join(dir, entry.name);
      const claspName = prefix + entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, claspName + '/');
      } else if (entry.name.endsWith('.gs')) {
        results.push({ claspName: claspName.replace(/\.gs$/, ''), fullPath: fullPath });
      }
    });
  }
  walk(SRC_ROOT, '');
  // Ordem alfabética simples por nome completo (o que o Apps Script usa),
  // igual ao comportamento padrão de Array.prototype.sort para strings.
  results.sort((a, b) => (a.claspName < b.claspName ? -1 : a.claspName > b.claspName ? 1 : 0));
  return results;
}

test('todos os .gs carregam sem erro quando avaliados na ordem alfabética real do Apps Script', () => {
  const files = listGsFilesClaspStyle();
  expect(files.length).toBeGreaterThan(0);

  const sandbox = {
    console: console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'stub' }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeDigest: (_a, v) => Array.from(crypto.createHash('sha256').update(String(v)).digest()),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
    },
    MailApp: { sendEmail: () => {} },
    Logger: { log: () => {} },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://example.invalid/exec' }) },
    Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
    Jdbc: { Types: { VARCHAR: 12 }, getConnection: () => { throw new Error('not used in this test'); } },
  };
  const context = vm.createContext(sandbox);

  files.forEach(({ claspName, fullPath }) => {
    const source = fs.readFileSync(fullPath, 'utf8');
    expect(() => {
      new vm.Script(source, { filename: claspName }).runInContext(context);
    }).not.toThrow();
  });

  expect(context.App).toBeDefined();
  expect(typeof context.App).toBe('object');
  expect(context.App.Dispatch).toBeDefined();
  expect(context.App.Security).toBeDefined();
  expect(context.App.Database).toBeDefined();
  expect(context.App.AuthService).toBeDefined();
  expect(typeof context.doGet).toBe('function');
  expect(typeof context.apiLogin).toBe('function');
});

test('o arquivo que declara var App roda antes do arquivo de entrada (Main.gs), na ordem alfabética real', () => {
  const files = listGsFilesClaspStyle().map((f) => f.claspName);
  const namespaceFileIndex = files.findIndex((name) => fs.readFileSync(path.join(SRC_ROOT, name + '.gs'), 'utf8').includes('var App ='));
  const entryFileIndex = files.findIndex((name) => fs.readFileSync(path.join(SRC_ROOT, name + '.gs'), 'utf8').includes('App.Dispatch ='));

  expect(namespaceFileIndex).toBeGreaterThanOrEqual(0);
  expect(entryFileIndex).toBeGreaterThanOrEqual(0);
  expect(namespaceFileIndex).toBeLessThan(entryFileIndex);
});
