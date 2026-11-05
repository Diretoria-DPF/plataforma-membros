/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — desempenho pessoal por competência (O8; antes "boletim"), puro. Soma os eventos 'lab:competencia' do tutor em seis grupos
 * definidos em dados (trilha_v1.json, `boletim`; rubrica proposta, decisão D-4 do dono) e devolve um nível de
 * proficiência por grupo. Sem nota, sem posição, sem comparação. Os limiares (rubrica.limiares, rubrica.pesoDica,
 * rubrica.dominioSemApoio) são DADOS aprovados pelo dono: definem o rótulo de cada competência e quando sugerir
 * treino (`sugestao`). O cartão "Desempenho" do Perfil (desempenho.js) lê o mesmo armazenamento. Guardado só no aparelho; a versão na conta é a
 * migração 055 (escrita, não aplicada, atrás da flag lab_boletim_conta_enabled): `paraConta` é o contrato dela.
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const CHAVE = 'laift_lab_boletim_v1';
  const TETO = 100000;
  // Campo do contador por resultado do tutor; "acerto" também soma em semApoio quando feito na Prova.
  const CAMPO = Object.freeze({ acerto: 'acertos', erro: 'erros', dica: 'dicas', pulado: 'pulos', fora_de_ordem: 'foraDeOrdem' });
  const COLUNAS_CONTA = Object.freeze(['acertos', 'erros', 'dicas', 'pulos', 'fora_de_ordem', 'sem_apoio']);
  const CONTADORES = Object.freeze(['acertos', 'erros', 'dicas', 'pulos', 'foraDeOrdem', 'semApoio']);
  const ID = /^[a-z_]{1,20}$/;
  const ORDEM = ['sem_registro', 'iniciando', 'em_desenvolvimento', 'proficiente', 'dominio'];

  const vazio = () => ({ v: 1, c: {} });
  const zero = () => Object.fromEntries(CONTADORES.map((k) => [k, 0]));
  const inteiro = (v) => (Number.isInteger(v) && v > 0 ? Math.min(v, TETO) : 0);

  function normalizar(bruto) {
    const b = vazio();
    const c = bruto && typeof bruto === 'object' && bruto.c && typeof bruto.c === 'object' ? bruto.c : {};
    for (const g of Object.keys(c)) {
      if (!ID.test(g) || !c[g] || typeof c[g] !== 'object') continue;
      b.c[g] = Object.fromEntries(CONTADORES.map((k) => [k, inteiro(c[g][k])]));
    }
    return b;
  }

  function grupoDe(rubrica, competencia) {
    return Object.keys(rubrica.grupos).find((g) => rubrica.grupos[g].fontes.includes(competencia)) || null;
  }

  /** Novo boletim com o evento somado; evento inválido ou competência fora da rubrica não muda nada. */
  function registrar(boletim, evento, rubrica) {
    const e = evento && typeof evento === 'object' ? evento : {};
    const campo = CAMPO[e.resultado];
    const g = e.tipo === 'competencia' && campo && typeof e.competencia === 'string' ? grupoDe(rubrica, e.competencia) : null;
    if (!g) return boletim;
    const base = normalizar(boletim);
    const atual = base.c[g] || zero();
    const novo = { ...atual, [campo]: inteiro(atual[campo] + 1) };
    if (e.resultado === 'acerto' && e.ajuda === 'prova') novo.semApoio = inteiro(atual.semApoio + 1);
    return { v: 1, c: { ...base.c, [g]: novo } };
  }

  function nivelDe(r, g, rubrica) {
    const tentativas = r.acertos + r.erros + r.pulos;
    if (!tentativas) return 'sem_registro';
    if (tentativas < g.minimo) return 'iniciando';
    const taxa = Math.max(0, r.acertos - rubrica.pesoDica * r.dicas) / tentativas;
    const L = rubrica.limiares;
    if (taxa >= L.dominio && r.semApoio >= rubrica.dominioSemApoio) return 'dominio';
    if (taxa >= L.proficiente) return 'proficiente';
    return taxa >= L.em_desenvolvimento ? 'em_desenvolvimento' : 'iniciando';
  }

  function descrever(r) {
    if (!r.acertos && !r.erros && !r.pulos) return 'Ainda sem prática neste grupo.';
    const com = r.acertos - r.semApoio;
    return `${r.acertos} acerto(s): ${r.semApoio} sem apoio, ${com} com ajuda. A refazer: ${r.erros + r.pulos}. Dicas pedidas: ${r.dicas}.`;
  }

  /** Uma linha por grupo, na ordem da rubrica. */
  function resumo(boletim, rubrica) {
    const b = normalizar(boletim);
    return Object.keys(rubrica.grupos).map((id) => {
      const g = rubrica.grupos[id];
      const r = b.c[id] || zero();
      const nivel = nivelDe(r, g, rubrica);
      return { id, nome: g.nome, nivel, rotulo: rubrica.rotulos[nivel], tentativas: r.acertos + r.erros + r.pulos, acertos: r.acertos, erros: r.erros, semApoio: r.semApoio, texto: descrever(r) };
    });
  }

  /** Competência a treinar: a de menor nível abaixo de "proficiente" (empate: ordem da rubrica); null se nenhuma. */
  function sugestao(boletim, rubrica) {
    let melhor = null;
    for (const g of resumo(boletim, rubrica)) {
      const i = ORDEM.indexOf(g.nivel);
      if (i < ORDEM.indexOf('proficiente') && (!melhor || i < melhor.i)) melhor = { i, id: g.id, nome: g.nome };
    }
    return melhor ? { id: melhor.id, nome: melhor.nome } : null;
  }

  /** Erros de forma da rubrica: cada competência da trilha em exatamente um grupo; fontes existentes. */
  function validarRubrica(trilha) {
    const r = trilha && trilha.boletim;
    if (!r || !r.grupos) return ['trilha sem rubrica de boletim'];
    const erros = [];
    const vistas = {};
    for (const id of Object.keys(r.grupos)) {
      const g = r.grupos[id];
      if (!ID.test(id) || !g.nome || !Array.isArray(g.fontes) || !g.fontes.length || !(g.minimo >= 1)) erros.push(`grupo ${id} malformado`);
      for (const f of g.fontes || []) {
        if (vistas[f]) erros.push(`competência ${f} em dois grupos (${vistas[f]} e ${id})`);
        vistas[f] = id;
        if (!(trilha.competencias || {})[f]) erros.push(`${id}: fonte desconhecida ${f}`);
      }
    }
    for (const c of Object.keys(trilha.competencias || {})) if (!vistas[c]) erros.push(`competência ${c} sem grupo`);
    for (const n of ORDEM) if (!(r.rotulos || {})[n]) erros.push(`sem rótulo para ${n}`);
    return erros;
  }

  function ler(armazenamento) {
    try {
      const t = armazenamento && armazenamento.getItem(CHAVE);
      return normalizar(t ? JSON.parse(t) : null);
    } catch (e) { return vazio(); }
  }
  function salvar(armazenamento, boletim) {
    try { armazenamento.setItem(CHAVE, JSON.stringify(normalizar(boletim))); return true; } catch (e) { return false; }
  }
  function apagar(armazenamento) {
    try { armazenamento.removeItem(CHAVE); return true; } catch (e) { return false; }
  }

  /** Contrato da tabela lab_boletim_competencia (055): uma linha por grupo com prática. Não é enviada hoje. */
  function paraConta(boletim) {
    const b = normalizar(boletim);
    return Object.keys(b.c).map((g) => {
      const r = b.c[g];
      return { competencia: g, acertos: r.acertos, erros: r.erros, dicas: r.dicas, pulos: r.pulos, fora_de_ordem: r.foraDeOrdem, sem_apoio: r.semApoio };
    });
  }

  const API = { CHAVE, ORDEM, COLUNAS_CONTA, sugestao, vazio, normalizar, registrar, resumo, validarRubrica, ler, salvar, apagar, paraConta };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabBoletim = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
