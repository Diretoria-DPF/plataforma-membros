/**
 * apiRouter.test.js
 * Testa o roteador HTTP/JSON (doPost, em Main.gs) que existe para o
 * front-end externo (fora do Apps Script) chamar a API por fetch(), em vez
 * de google.script.run. O ponto central deste teste é a allowlist: doPost
 * só pode invocar exatamente os nomes de função listados em API_REGISTRY,
 * nunca um identificador resolvido dinamicamente contra o escopo global
 * (o que abriria caminho para chamar algo como App.Config.getDbPassword
 * se alguém adivinhasse/enumerar o nome certo).
 */
const { createFullEnvironment } = require('./helpers/gasEnvironment');

function callDoPost(context, bodyObject) {
  const raw = typeof bodyObject === 'string' ? bodyObject : JSON.stringify(bodyObject);
  const output = context.doPost({ postData: { contents: raw } });
  return JSON.parse(output._text);
}

describe('doPost — roteador JSON da API externa', () => {
  test('rejeita corpo que não é JSON válido, sem vazar detalhe interno', () => {
    const env = createFullEnvironment();
    const result = callDoPost(env.context, 'isto não é json {{{');
    expect(result.success).toBe(false);
    expect(result.message).toBe('Requisição inválida.');
  });

  test('rejeita uma action desconhecida', () => {
    const env = createFullEnvironment();
    const result = callDoPost(env.context, { action: 'apiDeleteEverything', args: [] });
    expect(result.success).toBe(false);
    expect(result.message).toBe('Ação desconhecida.');
  });

  test('rejeita nomes herdados de Object.prototype como action (toString, constructor, hasOwnProperty)', () => {
    const env = createFullEnvironment();
    ['toString', 'constructor', 'hasOwnProperty', 'valueOf', '__proto__'].forEach((action) => {
      const result = callDoPost(env.context, { action: action, args: [] });
      expect(result.success).toBe(false);
      expect(result.message).toBe('Ação desconhecida.');
    });
  });

  test('invoca a função real da allowlist com os args na ordem recebida', () => {
    const env = createFullEnvironment();
    // apiLogin com credenciais vazias falha na validação ANTES de tocar o
    // banco — prova que o roteador chega até a função real (AuthService.login)
    // com os argumentos corretos, sem precisar mockar App.Database aqui.
    const result = callDoPost(env.context, { action: 'apiLogin', args: ['', ''] });
    expect(result.success).toBe(false);
    expect(result.message).toBe(env.App.Constants.GENERIC_AUTH_FAILURE_MESSAGE);
    expect(env.database.query).not.toHaveBeenCalled();
  });

  test('args ausente ou não-array é tratado como lista vazia, sem lançar erro do roteador', () => {
    const env = createFullEnvironment();
    const result = callDoPost(env.context, { action: 'apiLogin' });
    expect(result.success).toBe(false);
  });

  test('resposta sempre é JSON via ContentService com MimeType JSON', () => {
    const env = createFullEnvironment();
    const output = env.context.doPost({ postData: { contents: JSON.stringify({ action: 'apiLogin', args: ['', ''] }) } });
    expect(output._mimeType).toBe('JSON');
    expect(() => JSON.parse(output._text)).not.toThrow();
  });
});
