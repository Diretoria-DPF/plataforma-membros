/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Publicações (série "campanhas"): deck de cartas com filtro e placar, contadores dos KPIs,
// barras animadas e sumário ativo. Progressivo: sem JS a página já está completa.
// Só CSSOM (setProperty) e textContent.

const DURACAO_CONTAGEM_MS = 900;
const LIMIAR_VISIVEL = 0.4;
const LINHA_SUMARIO = 0.3;
const FAIXA_SUMARIO = '-30% 0px -60% 0px';

const REDUZIR = movimentoReduzido();

function movimentoReduzido() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function executarSeguro(nome, parte) {
  try {
    parte();
  } catch (erro) {
    console.warn(`Publicação: falha em ${nome}.`, erro);
  }
}

function palavraCarta(n) {
  return n === 1 ? 'carta' : 'cartas';
}

// Deck ---------------------------------------------------------------

function iniciarDecks() {
  document.querySelectorAll('[data-deck]').forEach((deck) => {
    executarSeguro('deck', () => configurarDeck(deck));
  });
}

function configurarDeck(deck) {
  const cartas = Array.from(deck.querySelectorAll('.blog-carta'));
  if (!cartas.length) return;
  const filtros = deck.querySelector('.blog-deck__filtros');
  const placar = deck.querySelector('.blog-deck__placar');
  const total = cartas.length;
  const abertas = new Set();
  const dizer = (texto) => {
    if (placar) placar.textContent = texto;
  };
  const dizerAbertas = () => dizer(`Você abriu ${abertas.size} de ${total} ${palavraCarta(total)}.`);

  ligarCartas(cartas, abertas, dizerAbertas);
  if (filtros) {
    ligarFiltros(filtros, cartas, dizer);
    filtros.removeAttribute('hidden');
  }
  if (placar) placar.removeAttribute('hidden');
  dizerAbertas();
}

function ligarCartas(cartas, abertas, aoAbrir) {
  cartas.forEach((carta) => {
    const detalhes = carta.querySelector('details');
    if (!detalhes) return;
    if (detalhes.open) abertas.add(carta);
    detalhes.addEventListener('toggle', () => {
      if (!detalhes.open) return;
      abertas.add(carta);
      aoAbrir();
    });
  });
}

function ligarFiltros(filtros, cartas, dizer) {
  const chips = Array.from(filtros.querySelectorAll('[data-filtro]'));
  filtros.addEventListener('click', (evento) => {
    const chip = evento.target.closest('[data-filtro]');
    if (!chip || !chips.includes(chip)) return;
    const visiveis = aplicarFiltro(cartas, chips, chip.dataset.filtro);
    dizer(`Mostrando ${visiveis} ${palavraCarta(visiveis)}.`);
  });
}

function aplicarFiltro(cartas, chips, veredito) {
  cartas.forEach((carta) => {
    carta.hidden = veredito !== 'todas' && carta.dataset.veredito !== veredito;
  });
  chips.forEach((chip) => {
    chip.setAttribute('aria-pressed', String(chip.dataset.filtro === veredito));
  });
  return cartas.filter((carta) => !carta.hidden).length;
}

// KPIs ---------------------------------------------------------------

function iniciarKpis() {
  const nums = Array.from(document.querySelectorAll('.blog-kpi__num[data-valor]'));
  if (REDUZIR || !nums.length || !('IntersectionObserver' in window)) return;
  const textosFinais = new Map(nums.map((el) => [el, el.textContent]));
  let pendentes = nums.length;
  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      observador.unobserve(entrada.target);
      contar(entrada.target, textosFinais.get(entrada.target));
      pendentes -= 1;
      if (pendentes === 0) observador.disconnect();
    });
  }, { threshold: LIMIAR_VISIVEL });
  nums.forEach((el) => observador.observe(el));
}

function contar(el, textoFinal) {
  const alvo = Number(el.dataset.valor);
  if (!Number.isFinite(alvo)) return;
  const casas = Number(el.dataset.casas) || 0;
  const formato = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const inicio = performance.now();
  el.textContent = formato.format(0);
  const quadro = (agora) => {
    try {
      const t = Math.max(0, Math.min(1, (agora - inicio) / DURACAO_CONTAGEM_MS));
      el.textContent = t < 1 ? formato.format(alvo * (1 - (1 - t) ** 3)) : textoFinal;
      if (t < 1) requestAnimationFrame(quadro);
    } catch {
      el.textContent = textoFinal;
    }
  };
  requestAnimationFrame(quadro);
}

// Barras -------------------------------------------------------------

function iniciarBarras() {
  const figuras = Array.from(document.querySelectorAll('.blog-grafico'));
  if (!figuras.length) return;
  const semMovimento = REDUZIR || !('IntersectionObserver' in window);
  if (semMovimento) {
    figuras.forEach((figura) => definirBarras(figura, (barra) => barra.dataset.v));
    return;
  }
  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      definirBarras(entrada.target, (barra) => barra.dataset.v);
      observador.unobserve(entrada.target);
    });
  }, { threshold: LIMIAR_VISIVEL });
  figuras.forEach((figura) => {
    definirBarras(figura, () => '0');
    observador.observe(figura);
  });
}

function definirBarras(figura, valorDe) {
  figura.querySelectorAll('.blog-grafico__barra[data-v]').forEach((barra) => {
    barra.style.setProperty('--v', valorDe(barra));
  });
}

// Sumário ------------------------------------------------------------

function iniciarSumario() {
  const sumario = document.querySelector('.blog-sumario');
  const secoes = Array.from(document.querySelectorAll('h2[id^="s-"]'));
  if (!sumario || !secoes.length || !('IntersectionObserver' in window)) return;
  const links = Array.from(sumario.querySelectorAll('.blog-sumario__link'));
  let agendado = false;
  const agendar = () => {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => {
      agendado = false;
      marcarSecaoAtiva(secoes, links);
    });
  };
  const observador = new IntersectionObserver(agendar, { rootMargin: FAIXA_SUMARIO });
  secoes.forEach((secao) => observador.observe(secao));
  // O scroll cobre saltos rápidos que atravessam a faixa sem disparar o observador.
  window.addEventListener('scroll', agendar, { passive: true });
  marcarSecaoAtiva(secoes, links);
}

function marcarSecaoAtiva(secoes, links) {
  const linha = window.innerHeight * LINHA_SUMARIO;
  const ativa = secoes.filter((secao) => secao.getBoundingClientRect().top <= linha).pop();
  const destino = ativa ? `#${ativa.id}` : '';
  links.forEach((link) => {
    if (destino && link.getAttribute('href') === destino) {
      link.setAttribute('aria-current', 'true');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

// Entrada ------------------------------------------------------------

function iniciar() {
  executarSeguro('deck', iniciarDecks);
  executarSeguro('kpis', iniciarKpis);
  executarSeguro('barras', iniciarBarras);
  executarSeguro('sumário', iniciarSumario);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
