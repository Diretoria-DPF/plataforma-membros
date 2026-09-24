/**
 * Config.gs
 * Namespace global único do projeto (App) e leitura de configuração sensível
 * via PropertiesService.getScriptProperties(). Nenhum segredo é lido em
 * módulo/topo de arquivo: tudo é lido sob demanda, para que a ausência de uma
 * propriedade só quebre a operação que realmente precisa dela (e não o
 * carregamento do script inteiro).
 *
 * Propriedades esperadas em Script Properties (nunca versionadas):
 *   DB_JDBC_URL            ex.: jdbc:postgresql://<host>:5432/<db>
 *                          (SEM parâmetros de query — ver docs/DEPLOYMENT.md,
 *                          seção 2: o driver JDBC nativo do Apps Script rejeita
 *                          sslmode/ssl/channel_binding com erro fatal)
 *   DB_USER
 *   DB_PASSWORD
 *   SESSION_TOKEN_PEPPER   string aleatória longa, só existe no servidor
 *   APP_BASE_URL           opcional; fallback quando ScriptApp.getService().getUrl() falhar
 *   MAIL_FROM_NAME         opcional; nome de exibição do remetente dos e-mails
 */
// Usa `var` (não `const`) deliberadamente: no runtime V8 do Apps Script os
// dois se comportam de forma equivalente no escopo de topo compartilhado do
// projeto, mas `var` é o que permite ao harness de testes (tests/helpers/
// gasEnvironment.js, que roda cada .gs via Node `vm`) enxergar `App` como
// propriedade do contexto depois da execução — bindings `const`/`let` de
// nível superior não ficam visíveis como propriedade do sandbox do `vm`.
// eslint-disable-next-line no-unused-vars, no-var
var App = {};

App.Config = (function () {
  function props() {
    return PropertiesService.getScriptProperties();
  }

  function required(key) {
    const value = props().getProperty(key);
    if (!value) {
      throw new Error('Propriedade de script ausente ou vazia: ' + key);
    }
    return value;
  }

  function optional(key, fallback) {
    const value = props().getProperty(key);
    return value === null || value === undefined || value === '' ? fallback : value;
  }

  return {
    getDbUrl: function () {
      return required('DB_JDBC_URL');
    },
    getDbUser: function () {
      return required('DB_USER');
    },
    getDbPassword: function () {
      return required('DB_PASSWORD');
    },
    getSessionPepper: function () {
      return required('SESSION_TOKEN_PEPPER');
    },
    getAppBaseUrl: function () {
      try {
        const url = ScriptApp.getService().getUrl();
        if (url) return url;
      } catch (err) {
        // ScriptApp.getService() só funciona em contexto de Web App implantado.
      }
      return optional('APP_BASE_URL', '');
    },
    getMailFromName: function () {
      return optional('MAIL_FROM_NAME', 'Plataforma de Membros');
    },
  };
})();
