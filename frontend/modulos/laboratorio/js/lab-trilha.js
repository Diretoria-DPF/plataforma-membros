/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — trilha de missões do Laboratório (O4). Funções puras, sem DOM.
 *
 * A trilha é dado (data/trilha/trilha_v1.json): níveis 0 a 8, cada missão com objetivos e, quando jogável,
 * o processo do motor (processoRef). Missão sem processo aparece como "Em preparação". O progresso fica só no
 * aparelho (localStorage, sempre com try/catch). O boletim por competência é da O8: aqui só há o resumo da missão.
 */
(function (raiz) {
  'use strict';

  const CHAVE = 'laift_lab_trilha_v1';
  const ID = /^[a-z0-9_]{1,40}$/;
  const TIPOS = Object.freeze(['processo', 'investigacao']);
  const ESTADOS = Object.freeze({ concluida: 'Concluída', disponivel: 'Disponível', bloqueada: 'Bloqueada', em_preparacao: 'Em preparação' });

  function progressoVazio() { return { v: 1, missoes: {} }; }

  function normalizarRegistro(r) {
    const o = r && typeof r === 'object' ? r : {};
    const inteiro = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    return {
      vezes: inteiro(o.vezes),
      conforme: o.conforme === true,
      menorDesvios: Number.isInteger(o.menorDesvios) && o.menorDesvios >= 0 ? o.menorDesvios : null
    };
  }

  function normalizarProgresso(bruto) {
    const p = progressoVazio();
    const m = bruto && typeof bruto === 'object' && bruto.missoes && typeof bruto.missoes === 'object' ? bruto.missoes : {};
    for (const id of Object.keys(m)) if (ID.test(id)) p.missoes[id] = normalizarRegistro(m[id]);
    return p;
  }

  function lerProgresso(armazenamento) {
    try {
      const t = armazenamento && armazenamento.getItem(CHAVE);
      return normalizarProgresso(t ? JSON.parse(t) : null);
    } catch (e) { return progressoVazio(); }
  }

  function salvarProgresso(armazenamento, progresso) {
    try {
      if (!armazenamento) return false;
      armazenamento.setItem(CHAVE, JSON.stringify(normalizarProgresso(progresso)));
      return true;
    } catch (e) { return false; }
  }

  /** Novo progresso com a missão concluída; guarda o melhor resultado (conforme e menor número de desvios). */
  function registrarConclusao(progresso, missaoId, res) {
    if (!ID.test(missaoId)) throw new Error('missão inválida');
    const base = normalizarProgresso(progresso);
    const antes = base.missoes[missaoId] || normalizarRegistro(null);
    const desvios = Number.isInteger(res && res.desvios) && res.desvios >= 0 ? res.desvios : 0;
    const novo = {
      vezes: antes.vezes + 1,
      conforme: antes.conforme || !!(res && res.conforme),
      menorDesvios: antes.menorDesvios === null ? desvios : Math.min(antes.menorDesvios, desvios)
    };
    return { v: 1, missoes: { ...base.missoes, [missaoId]: novo } };
  }

  function concluida(progresso, id) { return !!(progresso.missoes[id] && progresso.missoes[id].vezes > 0); }

  function nomeCurto(trilha, id) {
    const m = trilha.missoes.find((x) => x.id === id);
    return m ? m.titulo.split(':')[0] : id;
  }

  /** Estado de cada missão para a tela: concluida | disponivel | bloqueada | em_preparacao. */
  function situacao(trilha, progresso) {
    const p = normalizarProgresso(progresso);
    return trilha.missoes.map((m) => {
      if (!m.processoRef) return { missao: m, estado: 'em_preparacao', motivo: 'Em preparação.' };
      const faltam = (m.requer || []).filter((id) => !concluida(p, id));
      if (faltam.length) return { missao: m, estado: 'bloqueada', motivo: `Conclua antes: ${faltam.map((id) => nomeCurto(trilha, id)).join(', ')}.` };
      if (concluida(p, m.id)) {
        const r = p.missoes[m.id];
        return { missao: m, estado: 'concluida', motivo: r.conforme ? 'Concluída com lote conforme.' : 'Concluída; dá para repetir e melhorar.' };
      }
      return { missao: m, estado: 'disponivel', motivo: 'Disponível.' };
    });
  }

  /** Missões agrupadas por nível, na ordem: [{ nivel, nome, missoes }]. */
  function porNivel(trilha) {
    const grupos = [];
    for (const m of trilha.missoes) {
      let g = grupos.find((x) => x.nivel === m.nivel);
      if (!g) { g = { nivel: m.nivel, nome: (trilha.niveis && trilha.niveis[m.nivel]) || `Nível ${m.nivel}`, missoes: [] }; grupos.push(g); }
      g.missoes.push(m);
    }
    return grupos.sort((a, b) => a.nivel - b.nivel);
  }

  /** Erros de forma e de conteúdo. `processos` = { id: processo }. Missão jogável só com processo completo. */
  function validarTrilha(trilha, processos) {
    const erros = [];
    if (!trilha || !Array.isArray(trilha.missoes) || !trilha.missoes.length) return ['trilha sem missões'];
    const comp = trilha.competencias || {};
    const ids = new Set();
    for (const m of trilha.missoes) {
      const r = m && m.id ? m.id : '(sem id)';
      if (!m || !ID.test(m.id || '')) erros.push(`${r}: id inválido`);
      if (ids.has(m.id)) erros.push(`${r}: id repetido`);
      ids.add(m.id);
      if (!Number.isInteger(m.nivel) || m.nivel < 0 || m.nivel > 8) erros.push(`${r}: nível fora de 0 a 8`);
      if (!TIPOS.includes(m.tipo)) erros.push(`${r}: tipo inválido`);
      if (typeof m.titulo !== 'string' || !m.titulo.trim()) erros.push(`${r}: sem título`);
      if (!Array.isArray(m.objetivos) || !m.objetivos.length) erros.push(`${r}: sem objetivos`);
      for (const c of m.competencias || []) if (!comp[c]) erros.push(`${r}: competência desconhecida ${c}`);
      for (const id of m.requer || []) if (!trilha.missoes.some((x) => x.id === id)) erros.push(`${r}: requer missão inexistente ${id}`);
      if (!m.processoRef) continue;
      const p = processos && processos[m.processoRef];
      if (!p) { erros.push(`${r}: processo inexistente ${m.processoRef}`); continue; }
      if (p.nivel_conteudo !== 'completo') { erros.push(`${r}: processo de nível educacional não é jogável`); continue; }
      if (m.tipo === 'processo') {
        for (const e of p.etapas || []) if (!comp[(m.etapas || {})[e.id]]) erros.push(`${r}: etapa ${e.id} sem competência`);
      }
      if (m.tipo === 'investigacao') {
        const c = m.cenario || {};
        if (!(p.etapas || []).some((e) => e.id === c.etapaCausa)) erros.push(`${r}: etapa da causa inexistente`);
        for (const k of ['enunciado', 'explicacao', 'acaoCorretiva']) if (typeof c[k] !== 'string' || !c[k]) erros.push(`${r}: cenário sem ${k}`);
      }
    }
    return erros;
  }

  const API = { CHAVE, ESTADOS, progressoVazio, lerProgresso, salvarProgresso, registrarConclusao, situacao, porNivel, validarTrilha };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabTrilha = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
