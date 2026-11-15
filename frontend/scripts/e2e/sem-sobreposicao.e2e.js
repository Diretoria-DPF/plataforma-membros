/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * sem-sobreposicao.e2e.js — nas telas Início, Aprender, Propostas e Tarefas, em celulares de 375 e 320 px,
 * nenhum par de elementos interativos visíveis (links, botões, campos, barra fixa, FAB, Guia) se sobrepõe,
 * e nada fica coberto pela barra fixa ao rolar até o fim. Mede por geometria (getBoundingClientRect).
 * E2E_OVERLAP_DEBUG=1 imprime os pares achados e salva capturas em /tmp.
 */
const { startApp, check } = require('./harness');

const PHONES = [{ w: 375, h: 812 }, { w: 320, h: 568 }, { w: 768, h: 1024 }, { w: 1280, h: 800 }];
const PANELS = [['Início', 'panel-home'], ['Aprender', 'panel-learn'], ['Propostas', 'panel-proposals'], ['Tarefas', 'panel-tasks']];
const MIN_AREA = 16; // px² de interseção para contar como sobreposição
const LONGO = 'Campanha de conscientização sobre o uso racional de medicamentos em comunidades ribeirinhas';
const DESC = 'Descrição longa o bastante para quebrar em várias linhas no celular e testar o espaçamento entre blocos.';
const iso = (d) => new Date(Date.now() + d * 86400000).toISOString();
/** Dados fartos (títulos longos, vários itens) para expor sobreposição que as listas vazias escondem. */
const HANDLERS = {
  apiGetHomeSummary: () => ({ success: true, summary: {
    nextEvents: [{ id: 'e1', title: LONGO, startsAt: iso(2), location: 'Auditório do Centro de Ciências da Saúde' }, { id: 'e2', title: 'Aula aberta', startsAt: iso(5), location: 'Online' }],
    tasks: { myPendingCount: 3, availableCount: 4, next: { id: 't1', title: LONGO, dueDate: iso(3) } },
    voting: { openCount: 2, pendingCount: 2, nextClosesAt: iso(1) },
    learning: { accuracyPct: 72, questionsAnswered: 120, totalActivities: 9, unlockedBadges: 3, totalBadges: 12 },
    inbox: { unreadMessages: 4, pendingConnectionRequests: 2 } } }),
  apiListTasks: () => ({ success: true, tasks: [1, 2, 3].map((i) => ({ id: 't' + i, title: LONGO, description: DESC, dueDate: iso(i), signupCount: i, alreadySignedUp: i === 2, completed: false })) }),
  apiListMyProposals: () => ({ success: true, proposals: [1, 2].map((i) => ({ id: 'p' + i, title: LONGO, description: DESC, status: i === 1 ? 'pending' : 'approved', created_at: iso(-i) })) }),
  apiListOpenProposalsForVoting: () => ({ success: true, proposals: [1, 2].map((i) => ({ id: 'v' + i, title: LONGO, description: DESC, votingClosesAt: iso(i), alreadyVoted: i === 2 })) }),
  apiListEvents: () => ({ success: true, events: [1, 2].map((i) => ({ id: 'e' + i, title: LONGO, description: DESC, startsAt: iso(i), location: 'Auditório' })) }),
};

/** Roda no navegador: devolve pares de elementos interativos/fixos visíveis que se sobrepõem sem relação pai/filho. */
function findOverlaps([panelId, minArea, atEnd]) {
  const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [tabindex]:not([tabindex="-1"])';
  const label = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase()) + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24) + '"';
  const vw = window.innerWidth, vh = window.innerHeight;
  const clipped = (el, r) => {
    let box = { l: 0, t: 0, r: vw, b: vh };
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.position === 'fixed') break;
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowX + cs.overflowY)) {
        const pr = p.getBoundingClientRect();
        box = { l: Math.max(box.l, pr.left), t: Math.max(box.t, pr.top), r: Math.min(box.r, pr.right), b: Math.min(box.b, pr.bottom) };
      }
    }
    const w = Math.min(r.right, box.r) - Math.max(r.left, box.l), h = Math.min(r.bottom, box.b) - Math.max(r.top, box.t);
    return w <= 1 || h <= 1 ? null : { left: Math.max(r.left, box.l), top: Math.max(r.top, box.t), right: Math.min(r.right, box.r), bottom: Math.min(r.bottom, box.b) };
  };
  const isFixed = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') return true; return false; };
  const items = [];
  const consider = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0 || el.closest('[hidden],.hidden,[inert],.sr-only')) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const c = clipped(el, r);
    if (c) items.push({ el, r: c, fixed: isFixed(el) });
  };
  document.querySelectorAll(`#${panelId} :is(${SEL})`).forEach(consider);
  // Barras e botões flutuantes fixos fora do painel (nav, menu, FAB, Guia, avisos).
  document.querySelectorAll('body *').forEach((el) => {
    if (document.getElementById(panelId).contains(el)) return;
    if (getComputedStyle(el).position === 'fixed' && el.matches(SEL + ', nav, header, [role=dialog], [class*=assistant], [class*=fab]')) consider(el);
  });
  const uniq = items.filter((a, i) => !items.some((b, j) => j < i && b.el === a.el));
  const out = [];
  for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) {
    const a = uniq[i], b = uniq[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (!atEnd && a.fixed !== b.fixed) continue; // no topo, o conteúdo abaixo da dobra passa por baixo da barra: é rolagem normal
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 1 && h > 1 && w * h >= minArea) out.push(`${label(a.el)} x ${label(b.el)} (${Math.round(w)}x${Math.round(h)})`);
  }
  // Conteúdo coberto por barra fixa: item do painel cujo centro cai sob outro elemento fixo.
  (atEnd ? uniq.filter((x) => !x.fixed) : []).forEach((x) => {
    const cx = (x.r.left + x.r.right) / 2, cy = (x.r.top + x.r.bottom) / 2;
    const top = document.elementFromPoint(cx, cy);
    if (top && !x.el.contains(top) && !top.contains(x.el) && isFixed(top)) out.push(`${label(x.el)} coberto por fixo ${label(top)}`);
  });
  return [...new Set(out)];
}

module.exports = async function semSobreposicao() {
  const debug = !!process.env.E2E_OVERLAP_DEBUG;
  for (const phone of PHONES) {
    const app = await startApp({ role: 'member', workerHandlers: HANDLERS, viewport: { width: phone.w, height: phone.h } });
    try {
      await app.login();
      // as folhas decorativas não podem cruzar o conteúdo do app (eram a principal fonte da bagunça visual)
      check(await app.page.evaluate(() => { const l = document.getElementById('leaf-field'); return !l || getComputedStyle(l).display === 'none'; }), `${phone.w}: folhas decorativas fora do app autenticado`);
      for (const [nome, id] of PANELS) {
        await app.showPanel(id);
        await app.page.waitForTimeout(700);
        for (const pos of ['topo', 'fim']) {
          await app.page.evaluate((p) => { const s = document.scrollingElement; s.scrollTop = p === 'fim' ? s.scrollHeight : 0; }, pos);
          await app.page.waitForTimeout(250);
          const pares = await app.page.evaluate(findOverlaps, [id, MIN_AREA, pos === 'fim']);
          if (debug) {
            console.log(`  ${phone.w}: ${nome}/${pos}: ${pares.length}`, pares.slice(0, 12));
            await app.page.screenshot({ path: `${process.env.TEMP || '/tmp'}/sobre-${phone.w}-${id}-${pos}.png` });
          }
          check(pares.length === 0, `${phone.w}x${phone.h} ${nome} (${pos}): sem sobreposição (${pares.slice(0, 3).join(' | ')})`);
        }
      }
      check(app.errors.length === 0, `${phone.w}: sem erros de página (${app.errors.join('; ')})`);
    } finally {
      await app.close();
    }
  }
};
