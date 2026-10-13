/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * agents-tutor.e2e.js — Tutor clínico na tela Aprender (frontend/agents-tutor.js, ADR 0007, etapa 5).
 * A "flag" é o próprio mock de apiAgentsList: sem o tutor-clinico na lista (flag desligada, menor de idade, erro)
 * o cartão não existe e a tela Aprender segue normal; com ele, a conversa roda: resposta por textContent (HTML vira
 * texto), fonte só de host permitido, recusa que não é erro, erros amigáveis, histórico sem recusa e lista pedida
 * uma única vez por sessão. No celular a barra inferior não cobre o campo.
 */
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const TOKEN = 'e2e-session-token';
const TUTOR = {
  id: 'tutor-clinico', name: 'Tutor Clínico', version: '1.0.0', description: 'Tutor de estudo.', capabilities: ['explicar_mecanismo'],
  quota: { used: 0, limit: 30, remaining: 30, resetsAt: null }, memory: { available: false },
};
const LIST_ON = () => ({ success: true, alpha: true, apiVersion: 'agents/v1-alpha', agents: [TUTOR] });
const EVIL = '<img src=x onerror="window.__tutorXss=1"> A atropina bloqueia receptores muscarínicos [1].';
const SOURCE = { ref: 1, id: 'a1', title: 'Farmacologia da atropina', authors: 'Silva A', journal: 'Rev Tox', year: 2021, url: 'https://doi.org/10.1000/atropina' };

/** Servidor do Tutor: a pergunta decide a resposta (histórico e token ficam em `calls.worker`). */
function invoke(args) {
  const message = String((args[1] && args[1].message) || '').toLowerCase();
  if (message.includes('atropina')) {
    return new Promise((resolve) => {
      setTimeout(() => resolve({
        success: true, alpha: true, traceId: 't1', reply: EVIL, sources: [SOURCE, { ref: 2, title: 'Fora da lista', url: 'javascript:alert(1)' }],
        usage: { tokensIn: 10, tokensOut: 20, estimated: false }, memory: { available: false, used: false },
      }), 250);
    });
  }
  if (message.includes('dose')) {
    return { success: true, refused: true, rule: 'I6', reply: 'Não informo doses nem posologia. Posso explicar o mecanismo.', sources: [], usage: { tokensIn: 0, tokensOut: 0, estimated: false } };
  }
  if (message.includes('cota')) return { success: false, code: 'QUOTA', message: 'cota do servidor' };
  return { success: false, code: 'AI_UNAVAILABLE', message: 'x' };
}

const calls = (app, action) => app.calls.worker.filter((c) => c.action === action);

/** Escreve a pergunta, envia com Ctrl+Enter e espera o fim da chamada (botão volta a ficar ativo). */
async function pergunta(page, texto) {
  await page.fill('#agents-tutor-input', texto);
  await page.press('#agents-tutor-input', 'Control+Enter');
  await page.waitForSelector('#agents-tutor-log[aria-busy="false"]');
}

async function semCartao() {
  const cenarios = [
    ['flag desligada (resposta sem lista)', undefined],
    ['lista vazia', () => ({ success: true, alpha: true, agents: [] })],
    ['menor de idade (unavailable)', () => ({ success: true, alpha: true, agents: [], unavailable: 'age' })],
    ['AGENT_DISABLED', () => ({ success: false, code: 'AGENT_DISABLED', reason: 'flag', message: 'O agente está indisponível no momento.' })],
  ];
  for (const [nome, handler] of cenarios) {
    const app = await startApp({ role: 'member', workerHandlers: handler ? { apiAgentsList: handler } : {} });
    try {
      await app.login();
      await app.showPanel('panel-learn');
      await app.page.waitForSelector('.learn-card');
      check(await app.page.locator('#agents-tutor').count() === 0, `${nome}: o cartão do Tutor não aparece`);
      check(await app.page.locator('.learn-card').count() >= 5, `${nome}: os módulos de estudo continuam na tela`);
      await app.showPanel('panel-home');
      await app.showPanel('panel-learn');
      check(calls(app, 'apiAgentsList').length === 1, `${nome}: a lista foi pedida uma vez só, mesmo reabrindo a tela`);
      check(app.errors.length === 0, `${nome}: sem erros de página (${app.errors.join('; ')})`);
    } finally {
      await app.close();
    }
  }
}

async function conversa() {
  const app = await startApp({ role: 'member', workerHandlers: { apiAgentsList: LIST_ON, apiAgentsInvoke: invoke } });
  try {
    await app.login();
    check(calls(app, 'apiAgentsList').length === 0, 'antes de abrir Aprender a lista não é pedida');
    await app.showPanel('panel-learn');
    const page = app.page;
    await page.waitForSelector('#agents-tutor');
    check(/O Tutor explica conceitos de estudo\. Não substitui orientação profissional e não analisa casos reais\./.test(await page.textContent('.agents-tutor-notice')), 'a faixa fixa de aviso aparece');
    check(await page.getAttribute('#agents-tutor-input', 'maxlength') === '1000', 'o campo respeita o limite de 1000 caracteres do servidor');
    check(await page.locator('label[for="agents-tutor-input"]').count() === 1, 'o campo tem rótulo');
    check(await page.getAttribute('#agents-tutor-log', 'aria-live') === 'polite', 'a conversa é uma região aria-live polite');

    // Resposta com HTML malicioso e fonte hostil
    await page.fill('#agents-tutor-input', 'Como a atropina age?');
    await page.press('#agents-tutor-input', 'Control+Enter');
    await page.waitForSelector('.agents-tutor-wait:not([hidden])');
    check(await page.isDisabled('.agents-tutor-send'), 'enquanto espera, o botão fica desligado e o indicador aparece');
    await page.waitForSelector('#agents-tutor-log[aria-busy="false"]');
    const bot = '#agents-tutor-log .agents-tutor-msg-bot';
    check((await page.textContent(`${bot} .agents-tutor-text`)).includes('<img src=x onerror='), 'o HTML da resposta aparece como texto');
    check(await page.locator('#agents-tutor img').count() === 0, 'nenhuma tag <img> nasceu da resposta');
    check(await page.evaluate(() => window.__tutorXss === undefined), 'o onerror da resposta nunca rodou');
    check(await page.locator(`${bot} a`).count() === 1, 'só a fonte de host permitido virou link');
    check(await page.getAttribute(`${bot} a`, 'href') === 'https://doi.org/10.1000/atropina', 'o link da fonte é o do DOI');
    check(await page.getAttribute(`${bot} a`, 'rel') === 'noopener noreferrer', 'o link abre com rel noopener');
    check(/\[1\]/.test(await page.textContent(`${bot} .agents-tutor-ref`)), 'a fonte mostra o número [1]');
    check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'agents-tutor-input', 'o foco volta ao campo depois da resposta');
    const first = calls(app, 'apiAgentsInvoke')[0];
    check(first.args[0] === TOKEN && first.args[1].agentId === 'tutor-clinico' && first.args[1].history.length === 0, 'o envio leva token, agente e histórico vazio');

    // Recusa de guardrail não é erro
    await pergunta(page, 'Qual a dose de paracetamol?');
    check(await page.locator('#agents-tutor-log .agents-tutor-msg-refused[data-rule="I6"]').count() === 1, 'a recusa aparece como resposta do Tutor, com a regra só em data-rule');
    check(/Não informo doses/.test(await page.textContent('.agents-tutor-msg-refused .agents-tutor-text')), 'a recusa mostra o texto do servidor');
    check(!/I6/.test(await page.textContent('#agents-tutor')), 'a sigla da regra não aparece para a pessoa');
    check((await page.getAttribute('.agents-tutor-status', 'data-kind')) === null, 'recusa não acende mensagem de erro');

    // Erros amigáveis e texto de volta ao campo
    await pergunta(page, 'Minha cota acabou?');
    check(/cota de hoje/.test(await page.textContent('.agents-tutor-status')), 'QUOTA vira "cota de hoje esgotada"');
    check(await page.inputValue('#agents-tutor-input') === 'Minha cota acabou?', 'em erro, a pergunta volta ao campo');
    await pergunta(page, 'Outra dúvida qualquer');
    check(/fora do ar/.test(await page.textContent('.agents-tutor-status')), 'AI_UNAVAILABLE vira mensagem amigável');

    // Histórico: a recusa e os erros não vão ao servidor
    await pergunta(page, 'Conte mais sobre a atropina');
    const history = calls(app, 'apiAgentsInvoke').slice(-1)[0].args[1].history;
    check(history.length === 2 && history[0].role === 'user' && history[1].role === 'assistant', 'o histórico enviado tem só a primeira troca (sem recusa nem erro)');
    check(history.every((t) => t.text.length <= 500), 'cada turno do histórico respeita 500 caracteres');

    // Reabrir a tela não pede a lista de novo nem perde a conversa
    await app.showPanel('panel-home');
    await app.showPanel('panel-learn');
    check(calls(app, 'apiAgentsList').length === 1, 'a lista foi pedida uma única vez na sessão');
    check(await page.locator('#agents-tutor-log .agents-tutor-msg').count() >= 4, 'a conversa continua ao voltar para Aprender');
    await page.click('.agents-tutor-clear');
    check(await page.locator('#agents-tutor-log .agents-tutor-msg').count() === 0, '"Limpar conversa" esvazia a tela');

    await axeGate(page, 'Tutor na tela Aprender (claro, desktop)');
    check(app.errors.length === 0, `sem erros de página (${app.errors.join('; ')})`);
    check(app.calls.external.every((c) => c.method === 'GET'), 'a conversa não vai para fora da Worker');
  } finally {
    await app.close();
  }
}

async function celular() {
  const app = await startApp({
    role: 'member', theme: 'dark', viewport: { width: 360, height: 740 },
    workerHandlers: { apiAgentsList: LIST_ON, apiAgentsInvoke: invoke },
  });
  try {
    await app.login();
    await app.showPanel('panel-learn');
    const page = app.page;
    await page.waitForSelector('#agents-tutor');
    await page.focus('#agents-tutor-input');
    await page.evaluate(() => document.getElementById('agents-tutor-input').scrollIntoView({ block: 'center' }));
    const rects = await page.evaluate(() => {
      const nav = document.getElementById('app-nav').getBoundingClientRect();
      const send = document.querySelector('.agents-tutor-send').getBoundingClientRect();
      return { navTop: nav.top, sendBottom: send.bottom, sendHeight: send.height, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    check(rects.sendBottom <= rects.navTop, 'no celular a barra inferior não cobre o botão de enviar');
    check(rects.sendHeight >= 44, 'o botão de enviar tem alvo de toque de 44 px');
    check(rects.overflow <= 0, 'sem rolagem horizontal em 360 px');
    await pergunta(page, 'Como a atropina age?');
    check(await page.locator('#agents-tutor-log .agents-tutor-msg-bot').count() === 1, 'a conversa funciona no celular');
    await axeGate(page, 'Tutor na tela Aprender (escuro, 360x740)');
    check(app.errors.length === 0, `sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
}

module.exports = async function () {
  await semCartao();
  await conversa();
  await celular();
};
