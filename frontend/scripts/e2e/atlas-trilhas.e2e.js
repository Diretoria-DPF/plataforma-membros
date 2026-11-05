/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlas-trilhas.e2e.js — Trilhas e desafios (A4), atrás da flag `trilhas`.
 *  - Com a flag desligada o modo não aparece e setMode('trilhas') não faz nada.
 *  - Trilha guiada: passo a passo seleciona a estrutura, grava o progresso no aparelho e conclui.
 *  - Encontre a estrutura: acerto por toque no 3D e nome pela lista.
 *  - Desafio diário: 3 questões, resultado salvo e sem refazer no mesmo dia; sem tocar no 3D.
 */
const { startApp, check } = require('./harness');

async function ready(frame) {
  await frame.waitForFunction(() => { const I = window.__atlasInternals; return !!I && I.store.get().loadedSystems.includes('esqueletico'); }, null, { timeout: 60000 });
}

// waitForSelector usa requestAnimationFrame e engasga quando o 3D por software está ocupado; aqui a espera é por intervalo.
const has = (frame, selector) => frame.waitForFunction((s) => !!document.querySelector(s), selector, { polling: 100, timeout: 30000 });

const FLAGS_OFF = { onboarding: false, hints: false };
const FLAGS_ON = { onboarding: false, hints: false, trilhas: true };

module.exports = async function atlasTrilhas() {
  // ---- flag desligada ----
  let app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, atlasFlags: FLAGS_OFF });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await ready(frame);
    const modos = await frame.evaluate(() => [...document.querySelectorAll('#atlas-mode-list button')].map((b) => b.dataset.arg));
    check(!modos.includes('trilhas') && modos.length === 6, `flag desligada: o seletor tem os 6 modos de sempre (${modos.join(',')})`);
    await frame.evaluate(() => window.AtlasShell.setMode('trilhas'));
    await frame.waitForTimeout(300);
    check(await frame.evaluate(() => window.__atlasInternals.store.get().mode) === 'explorar', 'flag desligada: setMode("trilhas") é ignorado');
  } finally { await app.close(); }

  // ---- flag ligada ----
  app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, atlasFlags: FLAGS_ON });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await ready(frame);
    const modos = await frame.evaluate(() => [...document.querySelectorAll('#atlas-mode-list button')].map((b) => b.dataset.arg));
    check(modos.includes('trilhas'), 'flag ligada: "Trilhas e desafios" aparece no seletor');
    await frame.evaluate(() => window.AtlasShell.setMode('trilhas'));
    await has(frame, '#trilhasBtnTrilhas');
    const textoInicio = await frame.evaluate(() => document.getElementById('trilhasCard').innerText);
    check(/Trilhas guiadas/.test(textoInicio) && /Encontre a estrutura/.test(textoInicio) && /Desafio diário/.test(textoInicio), 'início com as 3 atividades');
    check(!/revisad|rascunho/i.test(textoInicio) && !/\bIA\b/.test(textoInicio), 'sem texto de revisão, rascunho ou IA');

    // Trilha guiada
    await frame.locator('#trilhasBtnTrilhas').click();
    await has(frame, '[data-trilha="coracao-circulacao"]');
    check(await frame.evaluate(() => document.querySelectorAll('[data-trilha]').length) === 4, 'quatro trilhas listadas');
    await frame.locator('[data-trilha="coracao-circulacao"]').click();
    await frame.waitForFunction(() => /passo 1 de 5/.test(document.querySelector('.quiz-step').textContent), null, { timeout: 5000 });
    await frame.waitForFunction(() => window.__atlasInternals.store.get().selectedSid === 'za:right-atrium', null, { timeout: 10000 });
    check(true, 'passo 1 seleciona o átrio direito no 3D');
    for (let i = 0; i < 4; i++) await frame.locator('.trilhas-primario').click();
    await frame.waitForFunction(() => /passo 5 de 5/.test(document.querySelector('.quiz-step').textContent), null, { timeout: 5000 });
    check(await frame.evaluate(() => window.__atlasInternals.store.get().selectedSid) === 'za:left-ventricle', 'último passo seleciona o ventrículo esquerdo');
    await frame.locator('.trilhas-primario').click();
    await frame.waitForFunction(() => /Trilha concluída/.test(document.getElementById('trilhasCard').innerText), null, { timeout: 5000 });
    const salvo = await frame.evaluate(() => JSON.parse(localStorage.getItem('laift.atlas.trilhas.v1')));
    check(salvo && salvo.trails['coracao-circulacao'].visited.length === 5, 'progresso da trilha salvo no aparelho (5 de 5)');
    await frame.locator('.trilhas-primario').click(); // Outras trilhas
    await has(frame, '[data-trilha]');
    check(await frame.evaluate(() => /Concluída/.test(document.querySelector('[data-trilha="coracao-circulacao"]').innerText)), 'a lista marca a trilha como concluída');

    // Encontre a estrutura: por toque
    await frame.locator('.trilhas-voltar').click();
    await frame.locator('#trilhasBtnEncontre').click();
    await has(frame, '.quiz-prompt');
    const alvo = await frame.evaluate(() => document.querySelector('.quiz-prompt').textContent);
    check(/^Toque na estrutura: .+/.test(alvo), `pede uma estrutura (${alvo})`);
    await frame.evaluate(() => window.__atlasInternals.selection.select('za:duodenum', 'pick'));
    await has(frame, '.trilhas-feedback:not([hidden])');
    const fb1 = await frame.evaluate(() => document.querySelector('.trilhas-feedback').dataset.kind);
    check(fb1 === 'acerto' || fb1 === 'erro', `toque no 3D gera retorno (${fb1})`);
    const f1 = await frame.evaluate(() => JSON.parse(localStorage.getItem('laift.atlas.trilhas.v1')).find);
    check(f1.tries === 1, 'a tentativa foi contada uma vez');

    // Encontre a estrutura: dizer o nome
    await frame.getByRole('button', { name: 'Dizer o nome' }).click();
    await has(frame, '[data-correta="1"]');
    check(await frame.evaluate(() => document.querySelectorAll('.trilhas-opcoes button').length) >= 2, 'lista de nomes possíveis');
    await frame.locator('[data-correta="1"]').click();
    await has(frame, '.trilhas-feedback[data-kind="acerto"]');
    check(true, 'escolher o nome certo mostra acerto');

    // Desafio diário
    await frame.locator('.trilhas-voltar').click();
    await frame.locator('#trilhasBtnDesafio').click();
    await frame.waitForFunction(() => /questão 1 de 3/.test(document.querySelector('.quiz-step').textContent), null, { timeout: 5000 });
    const q1 = await frame.evaluate(() => document.querySelector('.quiz-prompt').textContent);
    for (let i = 1; i <= 3; i++) {
      await frame.waitForFunction((n) => new RegExp(`questão ${n} de 3`).test(document.querySelector('.quiz-step').textContent), i, { timeout: 5000 });
      await frame.locator('.trilhas-lista-btn').click(); // sem tocar no 3D
      await has(frame, '.trilhas-opcoes:not([hidden]) [data-correta="1"]');
      await frame.locator('.trilhas-opcoes [data-correta="1"]').click();
      await has(frame, '.trilhas-feedback[data-kind="acerto"]');
      await frame.locator('.quiz-next').click();
    }
    await frame.waitForFunction(() => /Desafio de hoje concluído/.test(document.getElementById('trilhasCard').innerText), null, { timeout: 5000 });
    check(await frame.evaluate(() => /acertou 3 de 3/.test(document.querySelector('.trilhas-placar').textContent)), 'resultado do dia: 3 de 3 pela lista');
    const dia = await frame.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('laift.atlas.trilhas.v1')).daily));
    check(dia.length === 1, `resultado do dia salvo (${dia.join(',')})`);

    // Mesmo dia: não refaz, e o desafio é o mesmo depois de recarregar
    await frame.locator('.trilhas-primario').click();
    await frame.locator('#trilhasBtnDesafio').click();
    await frame.waitForFunction(() => /Desafio de hoje concluído/.test(document.getElementById('trilhasCard').innerText), null, { timeout: 5000 });
    check(true, 'no mesmo dia o desafio não é refeito');
    await frame.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.daily = {}; localStorage.setItem(k, JSON.stringify(s)); }, 'laift.atlas.trilhas.v1');
    await frame.goto(frame.url(), { waitUntil: 'load' });
    await ready(frame);
    await frame.evaluate(() => window.AtlasShell.setMode('trilhas'));
    await has(frame, '#trilhasBtnDesafio');
    await frame.locator('#trilhasBtnDesafio').click();
    await frame.waitForFunction(() => /questão 1 de 3/.test(document.querySelector('.quiz-step').textContent), null, { timeout: 5000 });
    const q1b = await frame.evaluate(() => document.querySelector('.quiz-prompt').textContent);
    check(q1 === q1b, 'a mesma data dá a mesma primeira questão depois de recarregar');
  } finally { await app.close(); }
};
