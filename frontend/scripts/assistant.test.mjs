/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Lia (frontend/assistant.js): lista branca de destinos, histórico enviado,
// condição de exibição e fiação da página. O DOM é coberto pelo e2e assistant.e2e.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const Lia = require('../assistant.js');
const Moderation = require('../assistant-moderation.js');

test('a lista de destinos do front é IGUAL à do Worker (assistant/targets.js)', async () => {
  const workerTargets = await import(pathToFileURL(path.join(root, 'worker', 'src', 'assistant', 'targets.js')).href);
  assert.deepEqual(Lia.ACTION_KEYS, workerTargets.ACTION_KEYS);
});

test('isAllowedAction: só tipo+destino da lista, nunca URL, script ou chave de protótipo', () => {
  assert.equal(Lia.isAllowedAction({ type: 'navigate', target: 'panel-events' }), true);
  assert.equal(Lia.isAllowedAction({ type: 'open_module', target: 'lab' }), true);
  assert.equal(Lia.isAllowedAction({ type: 'open_credential', target: 'credential' }), true);
  for (const bad of [
    { type: 'navigate', target: 'javascript:alert(1)' },
    { type: 'navigate', target: 'https://evil.example' },
    { type: 'navigate', target: 'panel-nao-existe' },
    { type: 'open_module', target: '__proto__' },
    { type: 'open_module', target: 'constructor' },
    { type: 'run_script', target: 'panel-events' },
    { type: 'navigate' },
    { target: 'panel-events' },
    null, undefined, 'navigate:panel-events', 42, [],
    { type: 'navigate', target: { toString: () => 'panel-events' } },
  ]) assert.equal(Lia.isAllowedAction(bad), false, JSON.stringify(bad));
});

test('sanitizeActions: descarta o inválido, repetidos e limita a 4; rótulo vira texto curto', () => {
  const out = Lia.sanitizeActions([
    { type: 'navigate', target: 'panel-events', label: 'Eventos' },
    { type: 'navigate', target: 'panel-events', label: 'Eventos de novo' },
    { type: 'navigate', target: 'https://evil.example', label: 'Clique' },
    { type: 'open_module', target: 'lab', label: 'x'.repeat(200) },
    { type: 'open_module', target: 'anatomia', label: 'Atlas 3D' },
    { type: 'open_module', target: 'farmaco', label: 'Farmacologia' },
    { type: 'open_module', target: 'toxico', label: 'Toxicologia' },
  ]);
  assert.equal(out.length, 4);
  assert.equal(out[0].label, 'Eventos');
  assert.ok(out[1].label.length <= 40);
  assert.deepEqual(Lia.sanitizeActions(null), []);
  assert.deepEqual(Lia.sanitizeActions('panel-events'), []);
});

test('pickHistory: só as últimas 5 perguntas da PESSOA, nunca as respostas da Lia', () => {
  const messages = [];
  for (let i = 1; i <= 8; i += 1) {
    messages.push({ role: 'user', text: 'pergunta ' + i });
    messages.push({ role: 'lia', text: 'resposta ' + i });
  }
  const history = Lia.pickHistory(messages);
  assert.equal(history.length, 5);
  assert.deepEqual(history[0], { role: 'user', text: 'pergunta 4' });
  assert.deepEqual(history[4], { role: 'user', text: 'pergunta 8' });
  assert.ok(history.every((h) => h.role === 'user'));
  assert.deepEqual(Lia.pickHistory([]), []);
});

test('shouldShow: só com a flag chatbot_enabled exatamente verdadeira', () => {
  assert.equal(Lia.shouldShow({ chatbot_enabled: true }), true);
  assert.equal(Lia.shouldShow({ chatbot_enabled: false }), false);
  assert.equal(Lia.shouldShow({ chatbot_enabled: 'true' }), false);
  assert.equal(Lia.shouldShow({}), false);
  assert.equal(Lia.shouldShow(null), false);
  assert.equal(Lia.shouldShow(undefined), false);
});

test('clip: corta no limite e ignora o que não é texto', () => {
  assert.equal(Lia.clip('abcdef', 3), 'abc');
  assert.equal(Lia.clip(null, 3), '');
  assert.equal(Lia.clip({}, 3), '');
});

test('assistant.js nunca converte texto em HTML e não guarda a conversa no navegador', () => {
  const src = read('frontend/assistant.js');
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|document\.write|eval\(/);
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
});

test('o front não abre URL nem navega por endereço vindo da resposta', () => {
  const src = read('frontend/assistant.js');
  assert.doesNotMatch(src, /window\.open|location\.href|location\.assign|\.setAttribute\('href'/);
});

test('assistant.js está no index.html, na lista do build e no precache do service worker', () => {
  assert.match(read('frontend/index.html'), /<script src="assistant\.js" defer><\/script>/);
  assert.match(read('frontend/scripts/build.js'), /'assistant\.js'/);
  assert.match(read('frontend/sw.js'), /'assistant\.js'/);
});

test('sanitizeSources: no máximo 4 fontes, só texto curto, sem vazias', () => {
  const out = Lia.sanitizeSources([
    { source: 'Manual do aluno', section: '2.1 Crachá' },
    { source: '   ', section: 'vazia' },
    null,
    { section: 'sem fonte' },
    { source: 'a'.repeat(200), section: 's'.repeat(300) },
    { source: 'b' }, { source: 'c' }, { source: 'd' },
  ]);
  assert.equal(out.length, 4);
  assert.deepEqual(out[0], { source: 'Manual do aluno', section: '2.1 Crachá' });
  assert.ok(out[1].source.length <= 80 && out[1].section.length <= 120);
  out.forEach((s) => {
    assert.equal(typeof s.source, 'string');
    assert.equal(typeof s.section, 'string');
  });
  assert.deepEqual(Lia.sanitizeSources(null), []);
  assert.deepEqual(Lia.sanitizeSources('Manual'), []);
});

test('fontes e avisos da Lia são texto: nenhum vira link, e o card de feedback é opcional', () => {
  const src = read('frontend/assistant.js');
  assert.doesNotMatch(src, /el\(doc, 'a'/);
  assert.doesNotMatch(src, /\.href\s*=/);
  // sem o módulo carregado, a Lia segue funcionando (sem card)
  assert.match(src, /root\.LaiftAssistantFeedback \|\| null/);
});

test('o app avisa a Lia ao entrar e ao sair da conta', () => {
  const app = read('frontend/app.js');
  assert.match(app, /LaiftAssistant/);
  assert.match(app, /LaiftAssistant\.refresh\(\)/);
  // entrar, sair e sessão expirada: nos três caminhos a conversa da conta anterior precisa sumir
  assert.ok((app.match(/LaiftAssistant\.refresh\(\)/g) || []).length >= 3, 'faltam chamadas de refresh em app.js');
});

test('a Lia é montada com window.Lia: recorte da cabeça na bolha, corpo inteiro no painel, desmontada ao fechar', () => {
  const src = read('frontend/assistant.js');
  assert.match(src, /mountLia\(ui\.launcherFigure, \{ crop: 'head' \}\)/);
  assert.match(src, /mountLia\(ui\.headFigure, \{ size: PANEL_LIA_SIZE \}\)/);
  assert.match(src, /ui\.panelLia = destroyLia\(ui\.panelLia\)/);
  assert.match(src, /ui\.launcherLia = destroyLia\(ui\.launcherLia\)/);
  assert.doesNotMatch(src, /'lia-orb'/, 'o orb "L" saiu');
});

test('reações da Lia: pensa ao enviar, fala ao responder, fica confusa em degradação ou erro, comemora o 👍', () => {
  const src = read('frontend/assistant.js');
  assert.match(src, /reactLia\('think'\)/);
  assert.match(src, /speakThenRest\(\)/);
  assert.match(src, /reactLia\('setState', 'confused'\)/);
  assert.match(src, /payload\.rating === 'up'[\s\S]*reactLia\('celebrate'\)/);
});

// ---------- Moderação (ADR 0004): funções puras ----------

test('formatReturnTime: horário de Brasília em dd/mm às hh:mm, por epoch ou ISO; vazio se inválido', () => {
  assert.equal(Moderation.formatReturnTime(Date.parse('2026-10-08T17:30:00Z')), '08/10 às 14:30');
  assert.equal(Moderation.formatReturnTime('2026-10-08T17:30:00.000Z'), '08/10 às 14:30');
  assert.equal(Moderation.formatReturnTime('2026-10-09T02:05:00Z'), '08/10 às 23:05'); // 23h, nunca "24"
  for (const bad of ['lixo', '', null, undefined, NaN]) assert.equal(Moderation.formatReturnTime(bad), '', String(bad));
});

test('formatCountdown: "1 h 00 min", "59 min 59 s", "1 min 01 s" e "42 s"; abaixo de zero ou inválido vira 0 s', () => {
  assert.equal(Moderation.formatCountdown(3600), '1 h 00 min');
  assert.equal(Moderation.formatCountdown(3599), '59 min 59 s');
  assert.equal(Moderation.formatCountdown(61), '1 min 01 s');
  assert.equal(Moderation.formatCountdown(42), '42 s');
  assert.equal(Moderation.formatCountdown(-4), '0 s');
  assert.equal(Moderation.formatCountdown(NaN), '0 s');
});

test('secondsLeft: arredonda para cima e nunca fica negativo', () => {
  assert.equal(Moderation.secondsLeft(10000, 0), 10);
  assert.equal(Moderation.secondsLeft(10001, 0), 11);
  assert.equal(Moderation.secondsLeft(0, 10000), 0);
  assert.equal(Moderation.secondsLeft(NaN, 0), 0);
});

test('validateRedemption: 40 a 600 caracteres sem contar as pontas (como o servidor)', () => {
  assert.equal(Moderation.REDEEM_MIN, 40);
  assert.equal(Moderation.REDEEM_MAX, 600);
  assert.equal(Moderation.validateRedemption('a'.repeat(39)).ok, false);
  assert.equal(Moderation.validateRedemption('a'.repeat(40)).ok, true);
  assert.equal(Moderation.validateRedemption('a'.repeat(600)).ok, true);
  assert.equal(Moderation.validateRedemption('a'.repeat(601)).ok, false);
  assert.equal(Moderation.validateRedemption('   ' + 'a'.repeat(39) + '   ').ok, false);
  assert.equal(Moderation.validateRedemption(null).ok, false);
  const v = Moderation.validateRedemption('  ' + 'a'.repeat(45) + '  ');
  assert.equal(v.value.length, 45);
  assert.equal(v.counter, '45/600');
  assert.equal(Moderation.validateRedemption('a'.repeat(39)).hint, 'Escreva mais 1 caractere (mínimo 40).');
  assert.equal(Moderation.validateRedemption('a'.repeat(601)).hint, 'Remova 1 caractere (máximo 600).');
});

test('warningLabel: "Aviso 1 de 3" e "Aviso 2 de 3", em texto (nunca só cor)', () => {
  assert.equal(Moderation.warningLabel(1), 'Aviso 1 de 3');
  assert.equal(Moderation.warningLabel(2), 'Aviso 2 de 3');
});

test('suspensionText: cita o horário de retorno em Brasília e oferece a redenção', () => {
  const text = Moderation.suspensionText(Date.parse('2026-10-08T17:30:00Z'));
  assert.match(text, /suspenso até 08\/10 às 14:30 \(horário de Brasília\)/);
  assert.match(text, /pedir redenção/);
  assert.doesNotMatch(Moderation.suspensionText(null), / até /);
});

test('moderationFromChat: aviso nos níveis 1 e 2; nível 3 ou suspended vira suspensão com o fim; sem moderação, nada', () => {
  assert.deepEqual(Moderation.moderationFromChat({ moderation: { level: 1, suspended: false, until: null } }), { mode: 'warning', level: 1 });
  assert.deepEqual(Moderation.moderationFromChat({ moderation: { level: 2, suspended: false, until: null } }), { mode: 'warning', level: 2 });
  const on = Moderation.moderationFromChat({ moderation: { level: 3, suspended: true, until: '2026-10-09T17:30:00.000Z' } });
  assert.equal(on.mode, 'suspended');
  assert.equal(on.until, Date.parse('2026-10-09T17:30:00.000Z'));
  assert.equal(Moderation.moderationFromChat({ moderation: { level: 3, suspended: false, until: 'lixo' } }).until, null);
  assert.deepEqual(Moderation.moderationFromChat({ moderation: { level: 0, suspended: false, until: null } }), { mode: 'none' });
  assert.deepEqual(Moderation.moderationFromChat({ reply: 'oi' }), { mode: 'none' });
  assert.deepEqual(Moderation.moderationFromChat(null), { mode: 'none' });
});

test('moderationFromState: só a suspensão restaurada muda a tela; falha ou conta sem moderação não mudam nada', () => {
  const on = Moderation.moderationFromState({ success: true, moderated: true, level: 3, suspended: true, until: '2026-10-09T17:30:00.000Z', canRedeem: false, retryAfterSeconds: 120 });
  assert.deepEqual(on, { mode: 'suspended', until: Date.parse('2026-10-09T17:30:00.000Z'), retryAfterSeconds: 120 });
  assert.deepEqual(Moderation.moderationFromState({ success: false, message: 'falhou' }), { mode: 'none' }); // falha aberta
  assert.deepEqual(Moderation.moderationFromState({ success: true, moderated: false, level: 0, suspended: false }), { mode: 'none' });
  assert.deepEqual(Moderation.moderationFromState({ success: true, moderated: true, level: 1, suspended: false, until: null, retryAfterSeconds: 0 }), { mode: 'none' });
  assert.deepEqual(Moderation.moderationFromState({ success: true, events: [] }), { mode: 'none' }); // resposta padrão sem campos
  assert.deepEqual(Moderation.moderationFromState(undefined), { mode: 'none' });
});

test('redeemOutcome: aceita, recusa com espera de 1 h, limite com retryAfterSeconds, desligada, rede e erro', () => {
  assert.equal(Moderation.redeemOutcome({ success: true, accepted: true, level: 0, message: 'ok' }).kind, 'accepted');
  const refused = Moderation.redeemOutcome({ success: true, accepted: false, level: 3, retryAfterSeconds: 3600, message: 'não convenceu' });
  assert.deepEqual(refused, { kind: 'retry', message: 'não convenceu', retryAfterSeconds: 3600 });
  const limit = Moderation.redeemOutcome({ success: false, message: 'Você já tentou há pouco.', retryAfterSeconds: 1200 });
  assert.equal(limit.kind, 'retry');
  assert.equal(limit.retryAfterSeconds, 1200);
  assert.equal(Moderation.redeemOutcome({ success: false, message: 'Explique em 40 a 600 caracteres.' }).kind, 'error');
  assert.equal(Moderation.redeemOutcome({ success: false, disabled: true, message: 'desligada' }).kind, 'disabled');
  const net = Moderation.redeemOutcome({ success: false, networkUnavailable: true, message: 'Failed to fetch' });
  assert.equal(net.kind, 'network');
  assert.doesNotMatch(net.message, /Failed to fetch/);
  assert.match(net.message, /tente de novo/);
  assert.equal(Moderation.redeemOutcome(null).kind, 'error');
});

test('nextTickDelay: 1 s durante a contagem, até o fim da suspensão (com teto) ou nunca', () => {
  const idle = { suspended: false, until: null, retryAt: null };
  assert.equal(Moderation.nextTickDelay(idle, 0), null);
  assert.equal(Moderation.nextTickDelay({ ...idle, retryAt: 10000 }, 0), 1000);
  assert.equal(Moderation.nextTickDelay({ ...idle, retryAt: 500 }, 0), 500);
  assert.equal(Moderation.nextTickDelay({ ...idle, retryAt: 100 }, 200), null); // contagem que já acabou
  assert.equal(Moderation.nextTickDelay({ suspended: true, until: 3600000, retryAt: null }, 0), 3600000);
  assert.equal(Moderation.nextTickDelay({ suspended: true, until: 1e12, retryAt: null }, 0), 2147483647);
  assert.equal(Moderation.nextTickDelay({ suspended: true, until: 1e12, retryAt: 2000 }, 0), 1000);
});

test('lapsedSuspension: suspensão com horário passado vale como liberada, sem mudar o objeto original', () => {
  const mod = { suspended: true, until: 100, retryAt: null };
  assert.deepEqual(Moderation.lapsedSuspension(mod, 200), { suspended: false, until: null, retryAt: null });
  assert.equal(mod.suspended, true);
  assert.equal(Moderation.lapsedSuspension(mod, 50), mod);
});

test('constantes da moderação batem com o bloco MODERATION de worker/src/constants.js', () => {
  const src = read('worker/src/constants.js');
  const block = src.slice(src.indexOf('export const MODERATION'));
  assert.equal(Number(block.match(/REDEEM_MIN_CHARS:\s*(\d+)/)[1]), Moderation.REDEEM_MIN);
  assert.equal(Number(block.match(/REDEEM_MAX_CHARS:\s*(\d+)/)[1]), Moderation.REDEEM_MAX);
  assert.equal(Number(block.match(/MAX_LEVEL:\s*(\d+)/)[1]), Moderation.SUSPEND_LEVEL);
});

test('contextos da Lia usados pela moderação existem em lia-states.js com os rótulos certos', () => {
  const States = require('../modulos/shared/lia/lia-states.js');
  assert.equal(States.resolve('suspended').ariaLabel, 'Lia está suspensa');
  assert.equal(States.resolve('alert').context, 'alert');
  assert.equal(States.resolve('warning').context, 'warning');
});

test('moderação na tela: aviso com papel de status, um só relógio (sem setInterval), consulta por papel e uma vez', () => {
  const mod = read('frontend/assistant-moderation.js');
  const chat = read('frontend/assistant.js');
  assert.match(mod, /band\.setAttribute\('role', 'status'\)/);
  assert.doesNotMatch(mod + chat, /setInterval/);
  assert.match(chat, /ui\.moderation\.stop\(\); \/\/ o relógio da moderação só roda com o painel aberto/);
  assert.doesNotMatch(mod, /lia-redeem-timer[^\n]*aria-live/);
  assert.match(mod, /role === 'member' \|\| role === 'admin'/);
  assert.equal((mod.match(/'apiAssistantModerationState'/g) || []).length, 1);
  assert.equal((chat.match(/'apiAssistantModerationState'/g) || []).length, 0);
});

test('a cola da Lia delega a moderação ao módulo: cria uma vez, consulta ao abrir, pinta e para o relógio', () => {
  const src = read('frontend/assistant.js');
  assert.match(src, /var moderation = modLib\(\)\.createModeration\(moderationContext\(app, doc, composer\.input, panel\)\);/);
  assert.match(src, /root\.AssistantModeration/);
  assert.match(src, /ui\.moderation\.lapse\(\);[\s\S]*ui\.moderation\.render\(\);[\s\S]*ui\.moderation\.checkOnOpen\(\);/);
  assert.match(src, /ui\.moderation\.suspend\(mod\.until, 0\)/);
  assert.match(src, /modLib\(\)\.moderationFromChat\(res\)/);
  assert.doesNotMatch(src, /function (buildRedeem|warningBand|setSuspended|checkModerationOnce|liftSuspension)\b/);
});

// ---------- Dica contextual (assistant-hints.js): só a cola fica aqui ----------

/** Corpo de uma função de assistant.js (do sinal até a chave de fechamento de 2 espaços). */
function bodyOf(src, signature) {
  const text = src.replace(/\r\n/g, '\n'); // o checkout do Windows grava CRLF
  const start = text.indexOf(signature);
  assert.ok(start >= 0, 'falta ' + signature);
  return text.slice(start, text.indexOf('\n  }\n', start) + 4);
}

test('a cola da dica ouve os dois eventos da tela e entrega ao controlador (sem lógica de negócio)', () => {
  const src = read('frontend/assistant.js');
  assert.match(src, /doc\.addEventListener\('laift:panelchange'/);
  assert.match(src, /doc\.addEventListener\('laift:modulechange'/);
  assert.match(src, /hint\('panelChanged', evt\.detail && evt\.detail\.panel\)/);
  assert.match(src, /hint\('moduleChanged', evt\.detail && evt\.detail\.module\)/);
  assert.match(src, /root\.AssistantHints/);
  assert.match(src, /createHints\(\{ doc: doc, onOpen: openWithQuestion, flags: hintFlags \}\)/);
  assert.match(src, /function hint\(method, arg\)/);
});

test('tocar na dica abre o painel com a pergunta no campo e NÃO envia', () => {
  const body = bodyOf(read('frontend/assistant.js'), 'function openWithQuestion(text) {');
  assert.match(body, /openPanel\(\);/);
  assert.match(body, /ui\.input\.value = text;/);
  assert.doesNotMatch(body, /send\(/);
  assert.doesNotMatch(body, /callApi/);
});

test('o painel da Lia abre no contexto da tela ou do módulo (react com o prop certo)', () => {
  const src = read('frontend/assistant.js');
  assert.match(src, /reactLia\('react', hint\('context'\) \|\| moduleOf\(currentPanel\(\)\)\)/);
});

test('a dica some ao abrir a Lia, ao sair da conta e quando a Lia é desligada; a cola não guarda nada', () => {
  const src = read('frontend/assistant.js');
  assert.match(bodyOf(src, 'function openPanel() {'), /hint\('hide'\)/);
  assert.match(bodyOf(src, 'function resetConversation() {'), /hint\('reset'\)/);
  assert.match(bodyOf(src, 'function hideLauncher() {'), /hint\('hide'\)/);
  assert.doesNotMatch(src, /localStorage|sessionStorage/);
});

test('app.js emite laift:panelchange só quando a tela muda de fato; learning.js emite laift:modulechange sem repetir', () => {
  const app = read('frontend/app.js');
  assert.match(app, /var previousPanelId = currentPanelId;/);
  assert.match(app, /if \(previousPanelId !== panelId\) document\.dispatchEvent\(new CustomEvent\('laift:panelchange', \{ detail: \{ panel: panelId \} \}\)\);/);
  const learning = read('frontend/learning.js');
  assert.match(learning, /function emitModuleChange\(moduleId\) \{/);
  assert.match(learning, /if \(previousModuleId !== id\) emitModuleChange\(id\);/);
  assert.match(learning, /if \(wasOpen\) emitModuleChange\(''\);/);
});

// ---------- Humor da Lia (L7): cola em assistant.js (lógica em assistant-mood-glue.js) ----------

test('a cola do humor: sessão só na memória, zerada ao trocar de conta, eventos ligados nos pontos certos', () => {
  const src = read('frontend/assistant.js');
  assert.match(src, /function moodLib\(\) \{ return root\.AssistantMood; \}/);
  assert.match(src, /ui\.mood = moodLib\(\)\.newSession\(\);/); // refresh: login, logout ou sessão expirada
  assert.match(src, /ui\.mood = moodLib\(\)\.onQuestion\(ui\.mood, message, Date\.now\(\)\)/); // quick-reply e asks-detail
  assert.match(src, /ui\.mood = moodLib\(\)\.onReply\(ui\.mood, mod\.mode, Date\.now\(\)\)/); // negative pela moderação
  assert.match(src, /ui\.mood = moodLib\(\)\.onFeedback\(ui\.mood, payload && payload\.rating\)/); // positive no 👍
  assert.match(src, /moodLib\(\)\.greeting\(ui\.mood, Math\.random\)/); // saudação com variação
  assert.match(src, /fixedLine\('error', text\)/);
  assert.match(src, /fixedLine\('confirmation', text\)/);
  assert.doesNotMatch(src, /text: GREETING\b/, 'a frase fixa de boas-vindas saiu');
  assert.doesNotMatch(src, /setInterval/);
});

test('idle da Lia: uma pose por vez, só em repouso, parada ao fechar e ao reagir', () => {
  const src = read('frontend/assistant.js');
  const body = (name, next) => src.slice(src.indexOf(`function ${name}`), src.indexOf(`function ${next}`));
  assert.match(src, /ui\.idle = moodLib\(\)\.createIdle\(/);
  assert.match(src, /apply: function \(pose\) \{ ui\.panelLia\.setState\('idle', pose\); \}/);
  assert.match(src, /getAttribute\('data-state'\) === 'idle'/, 'só em repouso: pensando, falando e celebrando têm data-state próprio');
  assert.match(src, /ui\.restTimer === null && !ui\.moderation\.isSuspended\(\)/);
  assert.match(body('reactLia', 'speakThenRest'), /ui\.idle\.disarm\(\)/, 'qualquer reação para o idle');
  assert.match(body('closePanel', 'hideLauncher'), /ui\.idle\.disarm\(\)/, 'fechar o painel para o idle');
  assert.match(body('speakThenRest', 'failReply'), /reactLia\('setState', 'idle'\); ui\.idle\.arm\(\)/, 'volta a mexer só depois de falar');
  assert.match(body('restLiaState', 'mountPanelLia'), /ui\.idle\.arm\(\)/);
});
