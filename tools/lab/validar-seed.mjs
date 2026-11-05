#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * validar-seed.mjs — validador do seed do Laboratório (roda no CI por frontend/scripts/lab-seed.test.mjs).
 *
 * Regras:
 *  - estrutura e proveniência: toda propriedade tem valor, unidade, fonte cadastrada, data e confiança 1..5;
 *    toda fonte é redistribuível; InChIKey bem formado e único; ids legados únicos;
 *  - massa molar declarada confere com a fórmula (tolerância do campo TOLERANCIA_MASSA);
 *  - nivel_conteudo ('completo' | 'educacional'): REPROVA processo 'completo' para espécie restrita
 *    (agentes de guerra, drogas ilícitas por nome ou por metadado; rota de síntese de espécie
 *    'educacional'); processo 'educacional' ou indisponível não carrega campo procedimental;
 *  - nenhum agente de guerra química no catálogo (armas químicas saíram na PR #150: não reintroduzir).
 * Uso: node tools/lab/validar-seed.mjs [caminho do lab-seed.js]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { massaDaFormula } from './formula.mjs';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CAMINHO_SEED = path.join(RAIZ, 'frontend', 'modulos', 'laboratorio', 'data', 'lab-seed.js');

export const NIVEIS = ['completo', 'educacional'];
export const RESTRICOES = ['agente_guerra', 'ilicita', 'opioide_sintese', 'psicoestimulante_sintese', 'toxina_potente'];
/** Restrições que não admitem processo 'completo' de nenhum tipo. */
export const RESTRICOES_ABSOLUTAS = ['agente_guerra', 'ilicita'];
export const TOLERANCIA_MASSA = { absoluta: 0.5, relativa: 0.01 };
export const CAMPOS_PROCEDIMENTAIS = ['reagentes', 'catalisador', 'solvente', 'temp_min_c', 'temp_max_c', 'tempo', 'rendimento_pc', 'agitacao', 'perigos'];

const ESTADOS_PROCESSO = ['disponivel', 'indisponivel'];

// Agentes de guerra (química/biológica/radiológica), por nome, sigla inequívoca, fórmula e SMILES.
export const NOMES_GUERRA = /sarin|soman|tabun|ciclosarin|cyclosarin|novichok|\bVX\b|mostarda|mustard|lewisit|iperita|yperite|C4H10FO2P|C11H26NO2PS|C4H8Cl2S|antraz|anthrax|ricina|\bricin\b|abrina|\babrin\b|polonio|polonium/i;
export const SMILES_GUERRA = ['CC(C)OP(C)(=O)F', 'CCOP(=O)(C)SCCN(C(C)C)C(C)C', 'ClCCSCCCl'];
// Drogas ilícitas (e opioides sintéticos de abuso) por nome.
export const NOMES_ILICITAS = /metanfetamina|methamphetamine|\bmeth\b|cocaina|cocaína|cocaine|\bcrack\b|heroina|heroína|heroin|\blsd\b|\bmdma\b|ecstasy|extase|êxtase|fentanil|fentanyl|carfentanil|mefedrona|mephedrone|catinona|nitazen|\bghb\b|\bgbl\b|fenciclidina|\bpcp\b/i;

const RE_INCHIKEY = /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

const textoDe = (...partes) => partes.filter((p) => typeof p === 'string').join(' | ');

/** Carrega o seed do disco (UMD do navegador, também CommonJS). */
export function carregarSeed(arquivo = CAMINHO_SEED) {
  const resolvido = path.resolve(arquivo);
  delete require.cache[resolvido];
  return require(resolvido);
}

/** @returns {string[]} lista de erros (vazia = válido). */
export function validarSeed(seed) {
  const erros = [];
  const erro = (m) => erros.push(m);
  if (!seed || typeof seed !== 'object') return ['seed ausente'];
  if (!Number.isInteger(seed.schema_version)) erro('schema_version ausente');
  if (typeof seed.data_version !== 'string' || !seed.data_version) erro('data_version ausente');

  const fontes = seed.fontes && typeof seed.fontes === 'object' ? seed.fontes : {};
  if (!Object.keys(fontes).length) erro('nenhuma fonte cadastrada');
  Object.entries(fontes).forEach(([slug, f]) => {
    if (!f.nome) erro(`fonte ${slug}: sem nome`);
    if (!f.licenca) erro(`fonte ${slug}: sem licença`);
    if (f.redistribuivel !== true) erro(`fonte ${slug}: não redistribuível não pode entrar no seed`);
  });

  const substancias = Array.isArray(seed.substancias) ? seed.substancias : [];
  const alias = new Map();
  const chaves = new Set();
  substancias.forEach((s) => {
    const rot = `substância ${s && s.id}`;
    if (!s || !s.id) { erro('substância sem id'); return; }
    if (!RE_INCHIKEY.test(s.inchikey || '')) erro(`${rot}: InChIKey inválido`);
    else if (chaves.has(s.inchikey)) erro(`${rot}: InChIKey repetido (${s.inchikey})`);
    chaves.add(s.inchikey);
    if (!s.smiles || !s.smiles_canon) erro(`${rot}: sem SMILES`);
    if (!s.formula) erro(`${rot}: sem fórmula`);
    if (!NIVEIS.includes(s.nivel_conteudo)) erro(`${rot}: nivel_conteudo inválido (${s.nivel_conteudo})`);
    if (s.restricao !== null && s.restricao !== undefined && !RESTRICOES.includes(s.restricao)) erro(`${rot}: restricao inválida (${s.restricao})`);
    if (s.restricao && s.nivel_conteudo !== 'educacional') erro(`${rot}: espécie restrita (${s.restricao}) precisa de nivel_conteudo 'educacional'`);
    const nomes = textoDe(s.id, s.nome_pt, s.formula, s.iupac, s.pubchem_query, ...(s.aliases || []).flatMap((a) => [a.id, a.label]));
    if (NOMES_GUERRA.test(nomes) || SMILES_GUERRA.includes(s.smiles)) erro(`${rot}: agente de guerra no catálogo (não reintroduzir)`);
    if (NOMES_ILICITAS.test(nomes) && s.nivel_conteudo !== 'educacional') erro(`${rot}: droga ilícita precisa de nivel_conteudo 'educacional'`);
    if (!Array.isArray(s.aliases) || !s.aliases.length) erro(`${rot}: sem alias (id legado)`);
    (s.aliases || []).forEach((a) => {
      if (!a.id) { erro(`${rot}: alias sem id`); return; }
      if (alias.has(a.id)) erro(`id legado repetido: ${a.id}`);
      alias.set(a.id, s);
    });
    const props = s.props || {};
    if (!props.massa_molar) erro(`${rot}: sem massa molar`);
    Object.entries(props).forEach(([chave, linhas]) => {
      if (!Array.isArray(linhas) || !linhas.length) { erro(`${rot}.${chave}: sem valores`); return; }
      linhas.forEach((p) => {
        const loc = `${rot}.${chave}`;
        if (typeof p.v !== 'number' || !Number.isFinite(p.v)) erro(`${loc}: valor não numérico`);
        if (!p.u) erro(`${loc}: sem unidade`);
        if (!fontes[p.s]) erro(`${loc}: fonte desconhecida (${p.s})`);
        if (!RE_DATA.test(p.d || '')) erro(`${loc}: data inválida`);
        if (!Number.isInteger(p.c) || p.c < 1 || p.c > 5) erro(`${loc}: confiança fora de 1..5`);
      });
    });
    if (s.formula && props.massa_molar) {
      let calc = null;
      try { calc = massaDaFormula(s.formula); } catch (e) { erro(`${rot}: fórmula ilegível (${s.formula})`); }
      if (calc !== null) {
        props.massa_molar.forEach((p) => {
          const tol = Math.max(TOLERANCIA_MASSA.absoluta, calc * TOLERANCIA_MASSA.relativa);
          if (Math.abs(p.v - calc) > tol) erro(`${rot}: massa molar ${p.v} não confere com a fórmula ${s.formula} (${calc.toFixed(2)})`);
        });
      }
    }
    if (s.smiles_corrigido && (!s.smiles_fonte || !fontes[s.smiles_fonte.s])) erro(`${rot}: SMILES corrigido sem fonte`);
  });

  const ids = new Set();
  const reacoes = Array.isArray(seed.reacoes) ? seed.reacoes : [];
  reacoes.forEach((x) => {
    if (ids.has('r:' + x.id)) erro(`reação repetida: ${x.id}`);
    ids.add('r:' + x.id);
    if (!fontes[x.fonte]) erro(`reação ${x.id}: fonte desconhecida`);
    [x.produto_id, ...(x.reagentes || [])].forEach((id) => { if (!alias.has(id)) erro(`reação ${x.id}: substância ${id} fora do catálogo`); });
    [x.produto_id, ...(x.reagentes || [])].forEach((id) => {
      const s = alias.get(id);
      if (s && s.nivel_conteudo === 'educacional') erro(`reação ${x.id}: processo completo para espécie restrita (${id})`);
    });
  });

  const processos = Array.isArray(seed.processos) ? seed.processos : [];
  processos.forEach((p) => {
    const rot = `processo ${p && p.id}`;
    if (!p || !p.id) { erro('processo sem id'); return; }
    if (ids.has('p:' + p.id)) erro(`processo repetido: ${p.id}`);
    ids.add('p:' + p.id);
    if (!fontes[p.fonte]) erro(`${rot}: fonte desconhecida`);
    if (!ESTADOS_PROCESSO.includes(p.estado)) erro(`${rot}: estado inválido`);
    if (!NIVEIS.includes(p.nivel_conteudo)) erro(`${rot}: nivel_conteudo inválido`);
    if (p.restricao && !RESTRICOES.includes(p.restricao)) erro(`${rot}: restricao inválida`);
    const completo = p.nivel_conteudo === 'completo';
    const tocadas = [p.produto_id, ...(p.reagentes || [])].map((id) => alias.get(id)).filter(Boolean);
    const nomes = textoDe(p.id, p.nome_pt, p.produto_id, p.equacao, ...(p.reagentes || []));
    if (completo && (NOMES_GUERRA.test(nomes) || NOMES_ILICITAS.test(nomes))) erro(`${rot}: processo completo para espécie restrita (por nome)`);
    if (completo && RESTRICOES_ABSOLUTAS.includes(p.restricao)) erro(`${rot}: processo completo para espécie restrita (${p.restricao})`);
    if (completo && p.restricao) erro(`${rot}: processo completo para espécie restrita (${p.restricao})`);
    tocadas.forEach((s) => {
      if (completo && RESTRICOES_ABSOLUTAS.includes(s.restricao)) erro(`${rot}: processo completo para espécie restrita (${s.id})`);
      if (completo && p.tipo === 'sintese' && s.nivel_conteudo === 'educacional') erro(`${rot}: rota de síntese 'completo' para espécie 'educacional' (${s.id})`);
    });
    if (!completo || p.estado === 'indisponivel') {
      CAMPOS_PROCEDIMENTAIS.forEach((campo) => {
        if (p[campo] !== undefined) erro(`${rot}: ${completo ? 'processo indisponível' : 'processo educacional'} não pode carregar campo procedimental (${campo})`);
      });
    }
  });
  // ---- O5: excipientes (misturas e polímeros) e formulações de farmacotécnica, saneantes e cosméticos ----
  const excip = new Map();
  (Array.isArray(seed.excipientes) ? seed.excipientes : []).forEach((x) => {
    const rot = `excipiente ${x && x.id}`;
    if (!x || !x.id) { erro('excipiente sem id'); return; }
    if (excip.has(x.id) || alias.has(x.id)) erro(`${rot}: id repetido`);
    excip.set(x.id, x);
    if (!x.nome_pt) erro(`${rot}: sem nome`);
    if (x.nivel_conteudo !== 'completo' || x.restricao) erro(`${rot}: excipiente precisa ser 'completo' e sem restrição`);
    if (!fontes[x.fonte]) erro(`${rot}: fonte desconhecida`);
    if (NOMES_GUERRA.test(textoDe(x.id, x.nome_pt)) || NOMES_ILICITAS.test(textoDe(x.id, x.nome_pt))) erro(`${rot}: espécie restrita no catálogo de excipientes`);
  });
  const mapa = seed.mapa_ingredientes && typeof seed.mapa_ingredientes === 'object' ? seed.mapa_ingredientes : {};
  const idsForm = new Set();
  (Array.isArray(seed.formulacoes) ? seed.formulacoes : []).forEach((f) => {
    const rot = `formulação ${f && f.id}`;
    if (!f || !f.id) { erro('formulação sem id'); return; }
    if (idsForm.has(f.id)) erro(`${rot}: repetida`);
    idsForm.add(f.id);
    if (!fontes[f.fonte]) erro(`${rot}: fonte desconhecida`);
    if (f.nivel_conteudo !== 'completo' || f.restricao) erro(`${rot}: formulação precisa ser 'completo' e sem restrição`);
    if (!Array.isArray(f.fontes_oficiais) || !f.fontes_oficiais.length || f.fontes_oficiais.some((o) => !o.tipo || !o.citacao)) erro(`${rot}: precisa citar ao menos uma fonte oficial (tipo e citação)`);
    if (!Array.isArray(f.cq) || !f.cq.length) erro(`${rot}: sem critérios de controle de qualidade`);
    if (!Array.isArray(f.itens) || !f.itens.length) { erro(`${rot}: sem itens`); return; }
    f.itens.forEach((i) => {
      if (!(i.quantidade > 0) || !i.unidade) erro(`${rot}: item ${i.ingrediente} sem quantidade e unidade`);
      const sub = alias.get(mapa[i.ingrediente] || i.ingrediente);
      if (!sub && !excip.has(i.ingrediente)) { erro(`${rot}: ingrediente ${i.ingrediente} fora do catálogo`); return; }
      if (sub && (sub.nivel_conteudo === 'educacional' || RESTRICOES_ABSOLUTAS.includes(sub.restricao))) erro(`${rot}: formulação completa para espécie restrita (${i.ingrediente})`);
    });
    if (NOMES_GUERRA.test(textoDe(f.id, f.nome_pt)) || NOMES_ILICITAS.test(textoDe(f.id, f.nome_pt))) erro(`${rot}: formulação completa para espécie restrita (por nome)`);
  });
  return erros;
}

function principal() {
  const arquivo = process.argv[2] || CAMINHO_SEED;
  const erros = validarSeed(carregarSeed(arquivo));
  if (erros.length) {
    console.error(`Seed inválido (${erros.length} problema(s)):\n` + erros.map((e) => '  - ' + e).join('\n'));
    process.exit(1);
  }
  console.log('Seed válido.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) principal();
