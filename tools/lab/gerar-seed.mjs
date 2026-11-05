#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * gerar-seed.mjs — gera frontend/modulos/laboratorio/data/lab-seed.js, o seed único do Laboratório.
 *
 * Unifica as fontes paralelas que existiam antes (catálogo LAB_DATABASE, DICIONARIO_MOLECULAR do
 * script.js, ACERVO_RESERVA do Estúdio, smiles-corrigidos.js, catálogo da bancada e BANCO_SINTESES)
 * em um arquivo com proveniência por valor (fonte, data, unidade, confiança), InChIKey por
 * substância e nivel_conteudo ('completo' | 'educacional').
 *
 * Uso (a partir da raiz do repositório):
 *   node tools/lab/gerar-seed.mjs            # grava o seed
 *   node tools/lab/gerar-seed.mjs --check    # sai com código 1 se o arquivo gravado diferir do gerado
 * Precisa do RDKit (WASM): RDKIT_DIST=<pasta dist do @rdkit/rdkit> ou o espelho em
 * frontend/scripts/e2e/cdn-mirror/node_modules/@rdkit/rdkit/dist. A saída é determinística (sem
 * relógio): a data de coleta é fixa por fonte, abaixo.
 *
 * Regras de conteúdo (decisão do dono, 2026-11-05): nenhuma rota é criada ou ampliada aqui. Processos
 * de espécie restrita saem do seed SEM campos procedimentais (reagentes, temperaturas, tempos,
 * rendimentos); processos indisponíveis também. O arquivo de sínteses original não é alterado.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { massaDaFormula } from './formula.mjs';
import { validarSeed } from './validar-seed.mjs';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LAB = path.join(RAIZ, 'frontend', 'modulos', 'laboratorio');
const SAIDA = path.join(LAB, 'data', 'lab-seed.js');

export const SCHEMA_VERSION = 1;
export const DATA_VERSION = '2026-11-05.2';
const DATA_CURADORIA = '2026-11-05';
const DATA_PUBCHEM_CORRECAO = '2026-11-04';

const FONTES = {
  curadoria_laift: {
    nome: 'Curadoria LAIFT (valores herdados do catálogo, origem original não registrada)',
    url: null,
    licenca: 'proprietaria-laift',
    atribuicao: null,
    redistribuivel: true,
    uso_comercial: null,
    observacao: 'Valores sem fonte rastreável na época em que foram escritos; ficam em fila de reverificação (confiança 2).',
  },
  pubchem: {
    nome: 'PubChem (NCBI/NLM)',
    url: 'https://pubchem.ncbi.nlm.nih.gov',
    licenca: 'public-domain',
    atribuicao: 'PubChem, National Library of Medicine',
    redistribuivel: true,
    uso_comercial: true,
    observacao: 'Dados de substâncias e compostos em domínio público; conteúdo de terceiros anotado no registro pode ter termos próprios.',
  },
};

// ---- Classificação de conteúdo (nivel_conteudo) ----
const RESTRICAO_POR_ID = {
  C17H19NO3_s: 'opioide_sintese',
  C20H22N2O2_s: 'toxina_potente',
  C11H17N3O8_s: 'toxina_potente',
  C31H42N2O6_s: 'toxina_potente',
};
const RESTRICAO_POR_PRODUTO = {
  Codeina_s: 'opioide_sintese',
  Oxicodona_s: 'opioide_sintese',
  Tramadol_s: 'opioide_sintese',
  Dextrometorfano_s: 'opioide_sintese',
};
const CONTROLADO_BR = { C17H19NO3_s: 'A1', C14H14N2O3_s: 'B1' };

// ---- O5: formulações de farmacotécnica, saneantes e cosméticos ----
// Ingredientes dos processos (ids do motor) → id legado do seed (substância de estrutura definida).
const INGREDIENTE_PARA_SUBSTANCIA = {
  H2O_l: 'H2O_l', NaCl_s: 'NaCl_s', AcidoAscorbico_s: 'C6H8O6_s', AcidoCitrico_s: 'C6H8O7_s', Glicerina_l: 'C3H5(OH)3_l',
  Sacarose_s: 'Sacarose_s', Lactose_s: 'Lactose_s', HidroxidoMg_s: 'HidroxidoMg_s', OxidoZinco_s: 'OxidoZinco_s',
  Trietanolamina_l: 'Trietanolamina_l', MetilParabeno_s: 'MetilParabeno_s', Fenoxietanol_l: 'Fenoxietanol_l',
};
// Misturas e polímeros sem estrutura única (sem InChIKey): ficam em `excipientes`.
const EXCIPIENTES_MISTURA = {
  Etanol96_l: { nome_pt: 'Álcool etílico 96 °GL', natureza: 'mistura', funcao: 'ativo antisséptico / solvente' },
  Carbomer_s: { nome_pt: 'Carbômero', natureza: 'polimero', funcao: 'gelificante' },
  GomaXantana_s: { nome_pt: 'Goma xantana', natureza: 'polimero', funcao: 'agente suspensor' },
  Vaselina_s: { nome_pt: 'Vaselina sólida', natureza: 'mistura', funcao: 'base oleosa' },
  Lanolina_s: { nome_pt: 'Lanolina anidra', natureza: 'mistura', funcao: 'emoliente' },
  LaurilEterSulfatoNa_l: { nome_pt: 'Lauril éter sulfato de sódio (solução a 27 %)', natureza: 'mistura', funcao: 'tensoativo' },
  CocoamidopropilBetaina_l: { nome_pt: 'Cocoamidopropil betaína (solução a 30 %)', natureza: 'mistura', funcao: 'tensoativo anfótero' },
  Polissorbato20_l: { nome_pt: 'Polissorbato 20', natureza: 'mistura', funcao: 'solubilizante' },
  Fragrancia_l: { nome_pt: 'Fragrância', natureza: 'mistura', funcao: 'fragrância' },
  AguaSanitaria_l: { nome_pt: 'Água sanitária (hipoclorito de sódio, 2,5 % de cloro ativo)', natureza: 'mistura', funcao: 'ativo desinfetante' },
  HCl_01M_l: { nome_pt: 'Solução de ácido clorídrico 0,1 mol/L (amostra de controle de qualidade)', natureza: 'mistura', funcao: 'amostra de controle de qualidade' },
};

function carregarFormulacoes() {
  const dir = path.join(LAB, 'data', 'processos');
  const procs = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const formulacoes = procs.filter((p) => p.formulacao).map((p) => ({
    id: p.id, nome_pt: p.titulo, forma: p.forma, setor: p.setor, via: p.via || null, base: p.formulacao.base,
    itens: p.formulacao.itens.map((i) => ({ ingrediente: i.especie, funcao: i.funcao, quantidade: i.quantidade.valor, unidade: i.quantidade.unidade, qsp: Boolean(i.quantidade.qsp) })),
    fontes_oficiais: p.fontesOficiais, cq: p.cq,
    nivel_conteudo: 'completo', restricao: null, fonte: 'curadoria_laift', data: DATA_CURADORIA, confianca: 2, revisado_por: null,
  }));
  const usados = new Set(formulacoes.flatMap((f) => f.itens.map((i) => i.ingrediente)));
  const excipientes = Object.keys(EXCIPIENTES_MISTURA).filter((id) => usados.has(id)).sort().map((id) => ({
    id, ...EXCIPIENTES_MISTURA[id], nivel_conteudo: 'completo', restricao: null, fonte: 'curadoria_laift', data: DATA_CURADORIA, confianca: 2, revisado_por: null,
  }));
  return { formulacoes, excipientes };
}

// ---- Substâncias do catálogo da bancada que não tinham dado nenhum (identidade apenas) ----
// Massa molar calculada da fórmula; densidade e pontos não são inventados.
const COMPLEMENTOS = {
  Na2CO3_aq: { label: 'Carbonato de Sódio', formula: 'Na2CO3', smiles: '[Na+].[Na+].[O-]C([O-])=O', pubchemQuery: 'Sodium carbonate', iupac: 'disodium;carbonate' },
  NaHCO3_aq: { label: 'Bicarbonato de Sódio', formula: 'NaHCO3', smiles: '[Na+].OC([O-])=O', pubchemQuery: 'Sodium bicarbonate', iupac: 'sodium;hydrogen carbonate' },
  K2CO3_aq: { label: 'Carbonato de Potássio', formula: 'K2CO3', smiles: '[K+].[K+].[O-]C([O-])=O', pubchemQuery: 'Potassium carbonate', iupac: 'dipotassium;carbonate' },
  CaOH2_aq: { label: 'Água de Cal', formula: 'CaH2O2', smiles: '[Ca+2].[OH-].[OH-]', pubchemQuery: 'Calcium hydroxide', iupac: 'calcium;dihydroxide' },
  NaClO_aq: { label: 'Hipoclorito de Sódio', formula: 'NaClO', smiles: '[Na+].[O-]Cl', pubchemQuery: 'Sodium hypochlorite', iupac: 'sodium;hypochlorite' },
  Li_s: { label: 'Lítio Metálico', formula: 'Li', smiles: '[Li]', pubchemQuery: 'Lithium', iupac: 'lithium' },
  Zn_s: { label: 'Zinco', formula: 'Zn', smiles: '[Zn]', pubchemQuery: 'Zinc', iupac: 'zinc' },
  Al_s: { label: 'Alumínio', formula: 'Al', smiles: '[Al]', pubchemQuery: 'Aluminum', iupac: 'aluminum' },
  Ca_s: { label: 'Cálcio', formula: 'Ca', smiles: '[Ca]', pubchemQuery: 'Calcium', iupac: 'calcium' },
  Fe_s: { label: 'Ferro', formula: 'Fe', smiles: '[Fe]', pubchemQuery: 'Iron', iupac: 'iron' },
  Cu_s: { label: 'Cobre', formula: 'Cu', smiles: '[Cu]', pubchemQuery: 'Copper', iupac: 'copper' },
  H2O2_aq: { label: 'Peróxido de Hidrogênio', formula: 'H2O2', smiles: 'OO', pubchemQuery: 'Hydrogen peroxide', iupac: 'hydrogen peroxide' },
  CuSO4_aq: { label: 'Sulfato de Cobre', formula: 'CuSO4', smiles: '[Cu+2].[O-]S([O-])(=O)=O', pubchemQuery: 'Copper(II) sulfate', iupac: 'copper(2+);sulfate' },
  FeCl3_aq: { label: 'Cloreto de Ferro III', formula: 'FeCl3', smiles: '[Fe+3].[Cl-].[Cl-].[Cl-]', pubchemQuery: 'Iron(III) chloride', iupac: 'iron(3+);trichloride' },
  ZnSO4_aq: { label: 'Sulfato de Zinco', formula: 'ZnSO4', smiles: '[Zn+2].[O-]S([O-])(=O)=O', pubchemQuery: 'Zinc sulfate', iupac: 'zinc;sulfate' },
  NiCl2_aq: { label: 'Cloreto de Níquel', formula: 'NiCl2', smiles: '[Ni+2].[Cl-].[Cl-]', pubchemQuery: 'Nickel(II) chloride', iupac: 'nickel(2+);dichloride' },
  CaCl2_aq: { label: 'Cloreto de Cálcio', formula: 'CaCl2', smiles: '[Ca+2].[Cl-].[Cl-]', pubchemQuery: 'Calcium chloride', iupac: 'calcium;dichloride' },
  BaCl2_aq: { label: 'Cloreto de Bário', formula: 'BaCl2', smiles: '[Ba+2].[Cl-].[Cl-]', pubchemQuery: 'Barium chloride', iupac: 'barium(2+);dichloride' },
  fenolftaleina: { label: 'Fenolftaleína (indicador)', formula: 'C20H14O4', smiles: 'O=C1OC(c2ccccc12)(c1ccc(O)cc1)c1ccc(O)cc1', pubchemQuery: 'Phenolphthalein', iupac: '3,3-bis(4-hydroxyphenyl)-2-benzofuran-1-one', phase: 's' },
  // O5 (farmacotécnica): ativos e excipientes de estrutura definida usados nas formulações.
  Sacarose_s: { label: 'Sacarose', formula: 'C12H22O11', smiles: 'OCC1OC(OC2(CO)OC(CO)C(O)C2O)C(O)C(O)C1O', pubchemQuery: 'Sucrose', iupac: 'sucrose' },
  Lactose_s: { label: 'Lactose', formula: 'C12H22O11', smiles: 'OCC1OC(OC2C(O)C(O)C(O)OC2CO)C(O)C(O)C1O', pubchemQuery: 'Lactose', iupac: 'lactose' },
  HidroxidoMg_s: { label: 'Hidróxido de Magnésio', formula: 'H2MgO2', smiles: '[Mg+2].[OH-].[OH-]', pubchemQuery: 'Magnesium hydroxide', iupac: 'magnesium;dihydroxide', phase: 's' },
  OxidoZinco_s: { label: 'Óxido de Zinco', formula: 'OZn', smiles: '[Zn]=O', pubchemQuery: 'Zinc oxide', iupac: 'oxozinc', phase: 's' },
  Trietanolamina_l: { label: 'Trietanolamina', formula: 'C6H15NO3', smiles: 'OCCN(CCO)CCO', pubchemQuery: 'Triethanolamine', iupac: '2-[bis(2-hydroxyethyl)amino]ethanol' },
  MetilParabeno_s: { label: 'Metilparabeno', formula: 'C8H8O3', smiles: 'COC(=O)c1ccc(O)cc1', pubchemQuery: 'Methylparaben', iupac: 'methyl 4-hydroxybenzoate' },
  Fenoxietanol_l: { label: 'Fenoxietanol', formula: 'C8H10O2', smiles: 'OCCOc1ccccc1', pubchemQuery: 'Phenoxyethanol', iupac: '2-phenoxyethanol' },
};

const lerTexto = (rel) => fs.readFileSync(path.join(LAB, rel), 'utf8');

function carregarFontes() {
  const lab = new Function('window', `${lerTexto('data/lab-database.js')}; return LAB_DATABASE;`)({});
  const sinteses = new Function('window', `${lerTexto('data/sinteses-database.js')}; return BANCO_SINTESES_LAIFT;`)({});
  const corrigidos = require(path.join(LAB, 'studio', 'smiles-corrigidos.js'));

  const script = lerTexto('js/script.js');
  const iniDic = script.indexOf('const DICIONARIO_MOLECULAR = {');
  const fimDic = script.indexOf('\n  };', iniDic);
  if (iniDic < 0 || fimDic < 0) throw new Error('DICIONARIO_MOLECULAR não encontrado em script.js');
  const dicionario = vm.runInNewContext(`(${script.slice(iniDic + 'const DICIONARIO_MOLECULAR = '.length, fimDic + 4)})`);

  const iniCat = script.indexOf('function construirCatalogo()');
  const fimCat = script.indexOf('// ====', iniCat);
  if (iniCat < 0) throw new Error('construirCatalogo não encontrado em script.js');
  const catalogo = [...script.slice(iniCat, fimCat < 0 ? undefined : fimCat).matchAll(/\['([^']+)',\s*'([^']+)'\]/g)].map((m) => ({ id: m[1], label: m[2] }));

  const studio = lerTexto('studio/studio.js');
  const iniAc = studio.indexOf('const ACERVO_RESERVA = [');
  const fimAc = studio.indexOf('\n  ];', iniAc);
  if (iniAc < 0 || fimAc < 0) throw new Error('ACERVO_RESERVA não encontrado em studio.js');
  const acervo = vm.runInNewContext(studio.slice(iniAc + 'const ACERVO_RESERVA = '.length, fimAc + 4));
  return { lab, sinteses, corrigidos, dicionario, catalogo, acervo };
}

async function carregarRDKit() {
  const candidatos = [
    process.env.RDKIT_DIST,
    path.join(RAIZ, 'frontend/scripts/e2e/cdn-mirror/node_modules/@rdkit/rdkit/dist'),
    path.resolve(RAIZ, '../../../frontend/scripts/e2e/cdn-mirror/node_modules/@rdkit/rdkit/dist'),
  ].filter(Boolean);
  const dist = candidatos.find((d) => fs.existsSync(path.join(d, 'RDKit_minimal.js')) && fs.existsSync(path.join(d, 'RDKit_minimal.wasm')));
  if (!dist) throw new Error('RDKit indisponível: defina RDKIT_DIST=<pasta dist do @rdkit/rdkit>.');
  const init = require(path.join(dist, 'RDKit_minimal.js'));
  return init({ locateFile: (f) => path.join(dist, f) });
}

const FASE_DO_ID = (id, phase) => {
  if (phase) return phase;
  const m = /_(s|l|g|aq)$/.exec(id);
  return m ? m[1] : null;
};

const r = (n) => (n === null || n === undefined ? null : Number(n));

/** Linha de propriedade com proveniência. */
function prop(valor, unidade, fonte, data, confianca, extra) {
  return Object.assign({ v: valor, u: unidade, s: fonte, d: data, c: confianca }, extra || {});
}

function registrarPropriedades(sub, entradas) {
  // entradas: [{ fase, valores: { massa_molar, densidade, bp, fp }, fonte, data, conf }]
  const chaves = ['massa_molar', 'densidade', 'bp', 'fp'];
  const unidades = { massa_molar: 'g/mol', densidade: 'g/cm³', bp: '°C', fp: '°C' };
  chaves.forEach((chave) => {
    const grupos = new Map();
    entradas.forEach((e) => {
      const v = r(e.valores[chave]);
      if (v === null || Number.isNaN(v)) return;
      const k = `${v}|${e.fonte}|${e.data}|${e.conf}`;
      if (!grupos.has(k)) grupos.set(k, { v, e, fases: [] });
      grupos.get(k).fases.push(e.fase);
    });
    const lista = [...grupos.values()];
    if (!lista.length) return;
    sub.props[chave] = lista.map((g) => {
      const extra = lista.length > 1 ? { fases: g.fases.filter(Boolean) } : {};
      return prop(g.v, unidades[chave], g.e.fonte, g.e.data, g.e.conf, extra);
    });
  });
}

export async function gerarSeed() {
  const R = await carregarRDKit();
  const { lab, sinteses, corrigidos, dicionario, catalogo, acervo } = await Promise.resolve(carregarFontes());
  const conflitos = [];

  // 1) Todos os ids legados e seus dados, na ordem: LAB_DATABASE, dicionário, acervo, complementos.
  const ids = new Map();
  const unir = (id, dados, origem) => {
    const atual = ids.get(id) || { id, origens: [], dados: {} };
    atual.origens.push(origem);
    Object.entries(dados).forEach(([k, v]) => {
      if (v === undefined) return;
      if (!(k in atual.dados) || atual.dados[k] === null) { atual.dados[k] = v; return; }
      if (v !== null && JSON.stringify(atual.dados[k]) !== JSON.stringify(v)) conflitos.push(`${id}.${k}: ${JSON.stringify(atual.dados[k])} (${atual.origens[0]}) x ${JSON.stringify(v)} (${origem})`);
    });
    ids.set(id, atual);
  };
  Object.entries(lab.species).forEach(([id, v]) => unir(id, v, 'lab-database'));
  Object.entries(dicionario).forEach(([id, v]) => unir(id, v, 'script.js'));
  acervo.forEach((a) => unir(a.chaveOriginal, { label: a.nome, formula: a.formula, molarMass: a.molarMass, smiles: a.smiles, pubchemQuery: a.pubchemQuery }, 'studio'));
  Object.entries(COMPLEMENTOS).forEach(([id, v]) => unir(id, { label: v.label, formula: v.formula, smiles: v.smiles, pubchemQuery: v.pubchemQuery, iupac: v.iupac, phase: v.phase }, 'complemento'));
  catalogo.forEach((c) => { if (!ids.has(c.id)) conflitos.push(`catálogo sem dados: ${c.id}`); });

  // 2) Cada id vira (InChIKey) uma substância; ids com o mesmo InChIKey são aliases.
  const porChave = new Map();
  for (const item of ids.values()) {
    const { id, dados } = item;
    const acv = acervo.find((a) => a.chaveOriginal === id);
    const corr = corrigidos[id] || (acv && corrigidos[acv.id]) || null;
    const smiles = corr ? corr.smiles : dados.smiles;
    if (!smiles) { conflitos.push(`sem SMILES: ${id}`); continue; }
    const mol = R.get_mol(smiles);
    if (!mol) throw new Error(`SMILES inválido para ${id}: ${smiles}`);
    const inchikey = R.get_inchikey_for_inchi(mol.get_inchi());
    const canon = mol.get_smiles();
    mol.delete();
    const fase = FASE_DO_ID(id, dados.phase);
    const rotuloCat = (catalogo.find((c) => c.id === id) || {}).label || null;
    if (!porChave.has(inchikey)) {
      porChave.set(inchikey, { inchikey, smiles, smiles_canon: canon, smiles_corrigido: Boolean(corr), formula: dados.formula, iupac: dados.iupac || null, pubchem_query: dados.pubchemQuery || null, pubchem_cid: corr ? corr.cid : null, aliases: [], entradas: [] });
    }
    const sub = porChave.get(inchikey);
    if (corr && !sub.smiles_corrigido) { sub.smiles = smiles; sub.smiles_canon = canon; sub.smiles_corrigido = true; sub.pubchem_cid = corr.cid; }
    if (!sub.iupac && dados.iupac) sub.iupac = dados.iupac;
    if (!sub.pubchem_query && dados.pubchemQuery) sub.pubchem_query = dados.pubchemQuery;
    sub.aliases.push({ id, fase, label: dados.label || rotuloCat || id, rotulo_catalogo: rotuloCat, dissociation: dados.dissociation === undefined ? null : dados.dissociation });
    const complemento = item.origens.length === 1 && item.origens[0] === 'complemento';
    const valores = complemento
      ? { massa_molar: Number(massaDaFormula(dados.formula).toFixed(3)) }
      : { massa_molar: dados.molarMass, densidade: dados.density, bp: dados.bp, fp: dados.fp };
    sub.entradas.push({ fase, valores, fonte: 'curadoria_laift', data: DATA_CURADORIA, conf: complemento ? 3 : 2 });
  }

  // 3) Monta as substâncias finais, ordenadas pelo primeiro alias para saída estável.
  const substancias = [...porChave.values()].map((s) => {
    const primeiro = s.aliases[0].id;
    const restricaoId = s.aliases.map((a) => RESTRICAO_POR_ID[a.id]).find(Boolean) || null;
    const controlado = s.aliases.map((a) => CONTROLADO_BR[a.id]).find(Boolean) || null;
    const sub = {
      id: primeiro,
      inchikey: s.inchikey,
      formula: s.formula,
      smiles: s.smiles,
      smiles_canon: s.smiles_canon,
      iupac: s.iupac,
      pubchem_query: s.pubchem_query,
      pubchem_cid: s.pubchem_cid,
      nome_pt: s.aliases[0].label,
      nivel_conteudo: restricaoId ? 'educacional' : 'completo',
      restricao: restricaoId,
      controlado_br: controlado,
      revisado_por: null,
      aliases: s.aliases,
      props: {},
    };
    if (s.smiles_corrigido) {
      sub.smiles_corrigido = true;
      sub.smiles_fonte = { s: 'pubchem', d: DATA_PUBCHEM_CORRECAO, c: 4, cid: s.pubchem_cid };
    }
    registrarPropriedades(sub, s.entradas);
    return sub;
  }).sort((a, b) => a.id.localeCompare(b.id));

  // 4) Reações simuláveis (as 6 do catálogo) e processos (sínteses), sem ampliar nenhum campo.
  const reacoes = lab.reactions.map((x) => ({
    id: x.id, nome_pt: x.nomeComposto, produto_id: x.produtoId, reagentes: x.reagentesObrigatorios, catalisador: x.catalisador || null,
    temp_min_c: r(x.tempMinima), temp_max_c: r(x.tempMaxima), tempo_min: r(x.tempoReacaoMin), rendimento_pc: r(x.rendimentoPercentual),
    agitacao: Boolean(x.precisaAgitador), cor_precipitado: x.corPrecipitado || null, equacao: x.equacaoQuimica,
    estequiometria: x.estequiometria || null, precipitacao_ionica: Boolean(x.precipitacaoIonica), descricao: x.descricao,
    estado: 'simulavel', fonte: 'curadoria_laift', data: DATA_CURADORIA, confianca: 2, revisado_por: null,
  }));

  const processos = sinteses.map((x) => {
    const restricao = RESTRICAO_POR_PRODUTO[x.produtoId] || null;
    const educacional = Boolean(restricao);
    const disponivel = !x.indisponivel;
    const p = {
      id: x.id, nome_pt: x.nomeComposto, produto_id: x.produtoId, tipo: 'sintese', tipo_reacao: x.tipoReacao || null,
      estado: disponivel ? 'disponivel' : 'indisponivel',
      nivel_conteudo: educacional ? 'educacional' : 'completo', restricao,
      equacao: educacional ? null : (x.equacaoQuimica || null),
      fonte: 'curadoria_laift', data: DATA_CURADORIA, confianca: 2, revisado_por: null,
    };
    if (!disponivel) p.motivo_estado = x.motivoIndisponivel || null;
    if (disponivel && !educacional) {
      Object.assign(p, {
        reagentes: x.reagentesObrigatorios || [], catalisador: x.catalisador || null, solvente: x.solvente || null,
        temp_min_c: r(x.tempMinima), temp_max_c: r(x.tempMaxima), tempo: x.tempoReacao || null,
        rendimento_pc: r(x.rendimentoPercentual), agitacao: Boolean(x.precisaAgitador), perigos: x.perigos || [],
      });
    }
    return p;
  });

  const { formulacoes, excipientes } = carregarFormulacoes();
  const seed = { schema_version: SCHEMA_VERSION, data_version: DATA_VERSION, gerado_por: 'tools/lab/gerar-seed.mjs', fontes: FONTES, substancias, reacoes, processos, excipientes, formulacoes, mapa_ingredientes: INGREDIENTE_PARA_SUBSTANCIA };
  return { seed, conflitos };
}

/** Texto do arquivo: uma substância/reação/processo por linha, para diffs legíveis. */
export function serializar(seed) {
  const linhas = (lista) => '[\n' + lista.map((x) => '    ' + JSON.stringify(x)).join(',\n') + '\n  ]';
  const corpo = [
    `    "schema_version": ${seed.schema_version},`,
    `    "data_version": ${JSON.stringify(seed.data_version)},`,
    `    "gerado_por": ${JSON.stringify(seed.gerado_por)},`,
    `    "fontes": ${JSON.stringify(seed.fontes)},`,
    `    "substancias": ${linhas(seed.substancias).replace(/\n/g, '\n  ')},`,
    `    "reacoes": ${linhas(seed.reacoes).replace(/\n/g, '\n  ')},`,
    `    "processos": ${linhas(seed.processos).replace(/\n/g, '\n  ')},`,
    `    "excipientes": ${linhas(seed.excipientes).replace(/\n/g, '\n  ')},`,
    `    "formulacoes": ${linhas(seed.formulacoes).replace(/\n/g, '\n  ')},`,
    `    "mapa_ingredientes": ${JSON.stringify(seed.mapa_ingredientes)}`,
  ].join('\n');
  return `/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lab-seed.js — seed único do Laboratório (GERADO por tools/lab/gerar-seed.mjs; não edite à mão).
 * Substâncias por InChIKey, valores com proveniência (fonte, data, unidade, confiança), reações,
 * processos e nivel_conteudo. Orçamento de peso: < 700 KB (frontend/scripts/lab-orcamento.test.mjs).
 * Validador: tools/lab/validar-seed.mjs (roda no CI por frontend/scripts/lab-seed.test.mjs).
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LAB_SEED = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return {
${corpo}
  };
});
`;
}

async function principal() {
  const { seed, conflitos } = await gerarSeed();
  const erros = validarSeed(seed);
  if (erros.length) {
    console.error('Seed inválido:\n' + erros.map((e) => '  - ' + e).join('\n'));
    process.exit(1);
  }
  const texto = serializar(seed);
  if (process.argv.includes('--check')) {
    const atual = fs.existsSync(SAIDA) ? fs.readFileSync(SAIDA, 'utf8') : '';
    if (atual !== texto) { console.error('lab-seed.js desatualizado: rode node tools/lab/gerar-seed.mjs'); process.exit(1); }
    console.log('lab-seed.js em dia.');
    return;
  }
  fs.writeFileSync(SAIDA, texto);
  console.log(`Gravado ${path.relative(RAIZ, SAIDA)}: ${(Buffer.byteLength(texto) / 1024).toFixed(1)} KB, ${seed.substancias.length} substâncias, ${seed.reacoes.length} reações, ${seed.processos.length} processos.`);
  if (conflitos.length) console.log('Conflitos/avisos entre fontes (primeira fonte prevaleceu):\n' + conflitos.map((c) => '  - ' + c).join('\n'));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) principal();
