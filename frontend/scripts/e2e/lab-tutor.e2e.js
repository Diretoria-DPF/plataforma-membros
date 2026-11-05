/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lab-tutor.e2e.js — O4: trilha e Missão 1 jogável no motor (chave labMotor).
 * Desligado: nada muda. Ligado: a trilha abre, a Missão 1 troca a bancada clássica pelo motor só enquanto dura,
 * o "!" aponta o controle correto, o lote sai conforme, o progresso fica no aparelho e a investigação abre depois.
 */
const { startApp, check } = require('./harness');

async function abrir(flags, viewport, ajuda) {
  const app = await startApp({ role: 'member', viewport: viewport || { width: 1280, height: 800 }, theme: 'dark' });
  const csp = [];
  await app.context.exposeBinding('__e2eTutorCsp', (src, v) => { csp.push(v); });
  await app.context.addInitScript(([f, a]) => {
    if (f) window.__labFlags = f;
    if (a) { try { localStorage.setItem('laift_lab_ajuda_v1', JSON.stringify(a)); } catch (e) { /* sem armazenamento */ } }
    window.__competencias = [];
    document.addEventListener('lab:competencia', (e) => { window.__competencias.push(e.detail); });
    document.addEventListener('securitypolicyviolation', (e) => {
      try { window.__e2eTutorCsp({ d: e.effectiveDirective, b: e.blockedURI }); } catch (err) { /* sem binding */ }
    });
  }, [flags || null, ajuda || null]);
  await app.login();
  const frame = await app.openModule('lab');
  await frame.waitForSelector('#faixaMissao');
  await frame.waitForTimeout(300);
  return { app, frame, csp };
}

async function abrirTrilha(frame) {
  await frame.evaluate(() => { if (window.switchRightTab) window.switchRightTab('tabMissao'); if (window.innerWidth < 640 && window.setMobileView) window.setMobileView('analise'); });
  await frame.click('#btnTrilha');
  await frame.waitForSelector('#labMotorTela #ttTitulo');
}

const visivel = (frame, sel) => frame.evaluate((s) => { const n = document.querySelector(s); return !!n && !n.hidden && n.getClientRects().length > 0; }, sel);

async function jogarMissao1(frame) {
  const usar = async (id) => { await frame.click(`#tmBtn-${id}`); await frame.waitForTimeout(40); };
  for (const e of ['jaleco', 'luvas-nitrila', 'oculos']) await frame.check(`#tm-painelSeguranca-epi-${e}`);
  await usar('painelSeguranca');
  await frame.fill('#tmResposta', '0,9');
  await usar('balancaTara');
  await frame.fill('#tm-reagente-NaCl-s-massaG', '0,90');
  await usar('reagente-NaCl-s');
  await frame.fill('#tm-reagente-H2O-l-volumeMl', '70');
  await usar('reagente-H2O-l');
  await usar('btnAgitar');
  await frame.check('#tm-btnTransferir-enxague');
  await usar('btnTransferir');
  await frame.fill('#tm-btnAvolumar-volumeFinalMl', '100');
  await usar('btnAvolumar');
  await usar('btnAgitar');
  await frame.check('#tm-phmetroCalibrar-tampoes-4');
  await frame.check('#tm-phmetroCalibrar-tampoes-7');
  await usar('phmetroCalibrar');
  await frame.fill('#tmResposta', '308');
  await usar('phmetro');
  await usar('btnEnvasar');
  const rotulo = { produto: 'Solução de cloreto de sódio', concentracao: '0,9 % p/v', lote: 'L01', fabricacao: '05/11/2026', validade: '30 dias', responsavel: 'Turma A' };
  for (const [k, v] of Object.entries(rotulo)) await frame.fill(`#tm-painelRotulo-${k}`, v);
  await usar('painelRotulo');
  await frame.selectOption('#tm-painelDescarte-destino', 'pia');
  await usar('painelDescarte');
  await frame.waitForSelector('#tmResumo');
}

async function cenarioDesligado() {
  console.log('  chave desligada (?flags=-labMotor)');
  const { app, frame } = await abrir({ labMotor: false });
  try {
    check(await frame.evaluate(() => !document.getElementById('btnTrilha')), 'sem botão da trilha com a chave desligada');
    check(await frame.evaluate(() => typeof window.LabTutor === 'undefined' && typeof window.LabTrilha === 'undefined'), 'tutor não carregado');
    check(await frame.evaluate(() => !document.documentElement.classList.contains('lab-motor-ativo')), 'bancada clássica é o padrão');
    check(app.errors.length === 0, 'sem erro de JavaScript');
  } finally { await app.close(); }
}

async function cenarioMissao(viewport, nome) {
  console.log(`  Missão 1 no motor (${nome})`);
  const { app, frame, csp } = await abrir({ labMotor: true }, viewport);
  try {
    check(await frame.evaluate(() => typeof window.LabTutor === 'undefined'), 'tutor só baixa ao abrir a trilha');
    await abrirTrilha(frame);
    check(await frame.evaluate(() => getComputedStyle(document.getElementById('mainGrid')).display === 'none'), 'bancada clássica oculta enquanto a tela do motor está aberta');
    check(await frame.evaluate(() => document.querySelector('[data-missao="m1_nacl_09"]').dataset.estado === 'disponivel'), 'Missão 1 disponível');
    check(await frame.evaluate(() => document.querySelector('[data-missao="m8_desvio_nacl"]').dataset.estado === 'bloqueada'), 'investigação bloqueada antes da Missão 1');
    check(await frame.evaluate(() => document.querySelectorAll('.lmt-nivel').length === 9), 'nove níveis (0 a 8) na trilha');
    await frame.click('#ttJogar-m1_nacl_09');
    await frame.waitForSelector('#tmProgresso');
    check(/Etapa 1 de 10: Paramentação/.test(await frame.textContent('#tmProgresso')), 'abre na etapa 1');
    check(/O que está acontecendo/.test(await frame.textContent('#tmAcontecendo')), 'mostra o que está acontecendo');
    check(await frame.evaluate(() => document.querySelector('.lab-alvo') && document.querySelector('.lab-alvo').dataset.tutor === 'painelSeguranca'), '"!" no painel de segurança');
    check(await visivel(frame, '#tmMarca'), 'selo "!" visível');
    check(await frame.evaluate(() => document.getElementById('tmPorque').dataset.lido === '0' && !document.getElementById('tmPorque').open), 'o porquê do Preceptor aparece como novo na etapa nova, sem empurrar os controles');
    await frame.click('#tmBtn-btnAvolumar');
    check(/Ainda não é a vez/.test(await frame.textContent('#tmRetorno')), 'controle fora de ordem recebe aviso');
    check(/A Guia, próximo passo/.test(await frame.textContent('#tmInstrucao')), 'a Guia diz o próximo passo');
    await frame.click('#tmDica');
    check(await frame.evaluate(() => document.querySelectorAll('#tmDicas li').length === 1), 'primeiro degrau da dica');
    check(await frame.evaluate(() => document.getElementById('tmPorque').dataset.lido === '1'), 'o Preceptor não marca de novo o porquê já mostrado');
    check(await frame.evaluate(() => { const g = document.querySelector('#tmInstrucao'); const r = g.getBoundingClientRect(); const f = document.getElementById('faixaMissao'); return getComputedStyle(g).position === 'static' && (!f || f.getBoundingClientRect().bottom <= r.top + 1 || getComputedStyle(f).display === 'none' || r.top >= 0); }), 'texto da Guia não se sobrepõe à faixa');
    await jogarMissao1(frame);
    check(/Lote conforme/.test(await frame.textContent('#tmResumo')), 'Missão 1 concluída com lote conforme');
    check(/A Guia: missão concluída/.test(await frame.textContent('#tmGuiaFim')), 'a Guia sugere o próximo passo ao fim da missão');
    check(await frame.evaluate(() => JSON.parse(localStorage.getItem('laift_lab_trilha_v1')).missoes.m1_nacl_09.vezes === 1), 'progresso guardado no aparelho');
    check(await frame.evaluate(() => window.__competencias.filter((e) => e.resultado === 'acerto' && e.competencia !== 'calculo').length === 10), 'eventos de competência emitidos (ponto de extensão da O8)');
    await frame.click('#tmVerTrilha');
    await frame.waitForSelector('#ttTitulo');
    check(await frame.evaluate(() => document.querySelector('[data-missao="m1_nacl_09"]').dataset.estado === 'concluida'), 'Missão 1 marcada como concluída');
    await frame.click('#ttJogar-m8_desvio_nacl');
    await frame.waitForSelector('#tiRegistros');
    await frame.check('#tiCausa-e5');
    await frame.click('#tiConfirmar');
    check(/Causa encontrada/.test(await frame.textContent('#tiRetorno')), 'investigação: causa encontrada na etapa 5');
    check(await frame.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem rolagem horizontal');
    check(await frame.evaluate(() => { const b = JSON.parse(localStorage.getItem('laift_lab_boletim_v1')); return b.c.seguranca.acertos >= 2 && b.c.calculo.acertos === 2 && b.c.desvio.acertos === 1; }), 'desempenho registra os eventos no aparelho');
    await frame.click('#tmTrilha');
    await frame.waitForSelector('#ttTitulo');
    check(/A Guia sugere/.test(await frame.textContent('#ttGuia')), 'a Guia sugere a próxima missão na trilha');
    await frame.click('#ttBoletim');
    await frame.waitForSelector('#tbLista');
    check(await frame.evaluate(() => document.querySelectorAll('#tbLista li').length === 6), 'desempenho com seis competências');
    check(await frame.evaluate(() => /nota|ranking|posição/i.test(document.getElementById('labMotorTela').textContent.replace(/não tem nota, posição nem comparação/, '')) === false), 'desempenho sem nota nem ranking');
    check(await frame.evaluate(() => /certificad|carga hor/i.test(document.getElementById('labMotorTela').textContent) === false && document.documentElement.scrollWidth <= window.innerWidth + 1 && !!document.getElementById('tbSugestao')), 'desempenho sem certificado nem carga horária; com sugestão de treino; sem rolagem horizontal');
    await frame.click('#tbApagar');
    await frame.click('#tbApagar');
    await frame.waitForSelector('#tbLista');
    check(await frame.evaluate(() => JSON.parse(localStorage.getItem('laift_lab_boletim_v1') || '{"c":{}}').c.seguranca === undefined), 'apagar o desempenho limpa o aparelho');
    await frame.click('#tmTrilha');
    await frame.waitForSelector('#ttTitulo');
    check(await frame.evaluate(() => document.querySelector('[data-missao="m_xarope"]').dataset.estado === 'disponivel'), 'nível 6 (xarope) abre depois da Missão 1');
    await frame.click('#ttJogar-m_xarope');
    await frame.waitForSelector('#tmProgresso');
    check(/Etapa 1 de \d+/.test(await frame.textContent('#tmProgresso')), 'xarope (processo da O5) abre no motor');
    await frame.check('#tm-painelSeguranca-epi-jaleco');
    await frame.check('#tm-painelSeguranca-epi-luvas-nitrila');
    await frame.check('#tm-painelSeguranca-epi-oculos');
    await frame.click('#tmBtn-painelSeguranca');
    check(/Etapa 2 de/.test(await frame.textContent('#tmProgresso')), 'xarope avança pela etapa 1');
    await frame.click('#tmSair');
    check(await frame.evaluate(() => !document.getElementById('labMotorTela') && getComputedStyle(document.getElementById('mainGrid')).display !== 'none'), 'sair devolve a bancada clássica');
    check(await frame.evaluate(() => window.sys.especies.size === 0), 'a bancada clássica não foi tocada pelo motor');
    check(csp.length === 0, `sem violação de CSP (${JSON.stringify(csp)})`);
    check(app.errors.length === 0, `sem erro de JavaScript (${app.errors.join(' | ')})`);
  } finally { await app.close(); }
}

async function cenarioProva() {
  console.log('  modo Prova: sem "!", sem porquê e sem dica');
  const { app, frame } = await abrir({ labMotor: true }, { width: 1280, height: 800 }, { ligada: true, nivel: 'prova' });
  try {
    await abrirTrilha(frame);
    await frame.click('#ttJogar-m1_nacl_09');
    await frame.waitForSelector('#tmProgresso');
    check(await frame.evaluate(() => !document.querySelector('.lab-alvo')), 'sem controle marcado');
    check(!(await visivel(frame, '#tmMarca')) && !(await visivel(frame, '#tmPorque')) && !(await visivel(frame, '#tmDica')), 'sem selo, porquê nem dica');
    await frame.check('#tm-painelSeguranca-epi-jaleco');
    await frame.click('#tmBtn-painelSeguranca');
    check((await frame.textContent('#tmRetorno')).trim() === 'Registrado no caderno.', 'Prova não explica na hora');
    await frame.selectOption('#ajudaNivel', 'completa');
    await frame.waitForTimeout(80);
    check(await frame.evaluate(() => document.querySelector('.lab-alvo') && document.querySelector('.lab-alvo').dataset.tutor === 'painelSeguranca'), 'trocar para Completa na faixa liga o "!" na hora');
    check(app.errors.length === 0, `sem erro de JavaScript (${app.errors.join(' | ')})`);
  } finally { await app.close(); }
}

module.exports = async function () {
  await cenarioDesligado();
  await cenarioMissao({ width: 1280, height: 800 }, 'desktop');
  await cenarioMissao({ width: 390, height: 844 }, 'celular');
  await cenarioProva();
};
