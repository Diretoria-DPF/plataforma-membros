/**
 * FARMACOS-LEXICON.js — léxico PT→EN dos fármacos citados no banco de
 * questões do Simulador de Farmacologia (questions.js) e detector de
 * fármaco-alvo por questão.
 *
 * Por que existe: renderMolecularStructure e o botão "Ficha Farmacológica"
 * (app.js) só chamam PubChem/RxNav/ChEBI quando a questão tem farmacoAlvo —
 * e nenhuma das 240 questões de questions.js trazia esse campo, então as
 * APIs nunca eram acionadas em uso normal. detectarFarmacoAlvo() varre a
 * alternativa correta, o enunciado e a explicação da questão em busca de um
 * nome de fármaco conhecido e devolve o nome em português (para exibição) e
 * o termo em inglês (para PubChem/RxNav, que indexam por INN em inglês).
 *
 * Só substâncias individuais entram aqui — nenhuma classe terapêutica
 * (ex.: "betabloqueadores"), porque PubChem/RxNav/ChEBI não resolvem classes.
 *
 * Carregado como <script src> comum (a CSP do módulo proíbe inline); expõe
 * window.LAIFT_FARMACOS e window.detectarFarmacoAlvo. Ver quiz/app.js.
 */
const LAIFT_FARMACOS = [
  // Farmacodinâmica / autonômico
  { pt: 'Adrenalina', aliases: ['epinefrina'], en: 'epinephrine' },
  { pt: 'Noradrenalina', aliases: ['norepinefrina'], en: 'norepinephrine' },
  { pt: 'Histamina', en: 'histamine' },
  { pt: 'Atropina', en: 'atropine' },
  { pt: 'Pilocarpina', en: 'pilocarpine' },
  { pt: 'Salbutamol', en: 'albuterol' },
  { pt: 'Formoterol', en: 'formoterol' },
  { pt: 'Propranolol', en: 'propranolol' },
  { pt: 'Metoprolol', en: 'metoprolol' },
  { pt: 'Atenolol', en: 'atenolol' },
  { pt: 'Esmolol', en: 'esmolol' },
  { pt: 'Dobutamina', en: 'dobutamine' },
  { pt: 'Neostigmina', en: 'neostigmine' },
  { pt: 'Rocurônio', aliases: ['rocuronio'], en: 'rocuronium' },
  { pt: 'Clonidina', en: 'clonidine' },
  { pt: 'Fenilefrina', en: 'phenylephrine' },
  { pt: 'Biperideno', en: 'biperiden' },
  { pt: 'Triexifenidil', en: 'trihexyphenidyl' },
  { pt: 'Tiotrópio', aliases: ['tiotropio'], en: 'tiotropium' },
  { pt: 'Prazosina', en: 'prazosin' },
  { pt: 'Tansulosina', en: 'tamsulosin' },
  { pt: 'Toxina Botulínica', aliases: ['toxina botulinica'], en: 'botulinum toxin' },
  { pt: 'Betanecol', en: 'bethanechol' },
  { pt: 'Ranitidina', en: 'ranitidine' },

  // AINEs / analgésicos
  { pt: 'Ácido Acetilsalicílico', aliases: ['acido acetilsalicilico', 'aas', 'aspirina'], en: 'aspirin' },
  { pt: 'Paracetamol', aliases: ['acetaminofeno'], en: 'acetaminophen' },
  { pt: 'Ibuprofeno', en: 'ibuprofen' },
  { pt: 'Diclofenaco', en: 'diclofenac' },
  { pt: 'Naproxeno', en: 'naproxen' },
  { pt: 'Celecoxibe', en: 'celecoxib' },
  { pt: 'Cetoprofeno', en: 'ketoprofen' },
  { pt: 'N-acetilcisteína', aliases: ['acetilcisteina', 'n-acetilcisteina'], en: 'acetylcysteine' },

  // Anti-hipertensivos / cardiovascular
  { pt: 'Captopril', en: 'captopril' },
  { pt: 'Enalapril', en: 'enalapril' },
  { pt: 'Losartana', aliases: ['losartano'], en: 'losartan' },
  { pt: 'Nitroprussiato de Sódio', aliases: ['nitroprussiato de sodio', 'nitroprussiato'], en: 'sodium nitroprusside' },
  { pt: 'Anlodipino', aliases: ['amlodipina'], en: 'amlodipine' },
  { pt: 'Nifedipino', en: 'nifedipine' },
  { pt: 'Verapamil', en: 'verapamil' },
  { pt: 'Diltiazem', en: 'diltiazem' },
  { pt: 'Hidralazina', en: 'hydralazine' },
  { pt: 'Metildopa', en: 'methyldopa' },
  { pt: 'Minoxidil', en: 'minoxidil' },
  { pt: 'Sildenafila', aliases: ['sildenafil'], en: 'sildenafil' },
  { pt: 'Digoxina', en: 'digoxin' },

  // Diuréticos
  { pt: 'Furosemida', en: 'furosemide' },
  { pt: 'Hidroclorotiazida', en: 'hydrochlorothiazide' },
  { pt: 'Clortalidona', en: 'chlorthalidone' },
  { pt: 'Indapamida', en: 'indapamide' },
  { pt: 'Espironolactona', en: 'spironolactone' },
  { pt: 'Eplerenona', en: 'eplerenone' },
  { pt: 'Amilorida', en: 'amiloride' },
  { pt: 'Triantereno', en: 'triamterene' },
  { pt: 'Manitol', en: 'mannitol' },
  { pt: 'Acetazolamida', en: 'acetazolamide' },

  // Coagulação / antitrombóticos
  { pt: 'Varfarina', en: 'warfarin' },
  { pt: 'Heparina', aliases: ['heparina nao fracionada', 'heparina não fracionada'], en: 'heparin' },
  { pt: 'Enoxaparina', en: 'enoxaparin' },
  { pt: 'Rivaroxabana', aliases: ['rivaroxabano'], en: 'rivaroxaban' },
  { pt: 'Dabigatrana', aliases: ['dabigatrano'], en: 'dabigatran' },
  { pt: 'Clopidogrel', en: 'clopidogrel' },
  { pt: 'Alteplase', en: 'alteplase' },
  { pt: 'Ácido Tranexâmico', aliases: ['acido tranexamico'], en: 'tranexamic acid' },
  { pt: 'Abciximabe', en: 'abciximab' },
  { pt: 'Tirofibana', en: 'tirofiban' },
  { pt: 'Protamina', aliases: ['sulfato de protamina'], en: 'protamine' },
  { pt: 'Vitamina K', aliases: ['fitomenadiona'], en: 'phytomenadione' },
  { pt: 'Omeprazol', en: 'omeprazole' },

  // Dislipidemias
  { pt: 'Sinvastatina', en: 'simvastatin' },
  { pt: 'Atorvastatina', en: 'atorvastatin' },
  { pt: 'Ezetimiba', en: 'ezetimibe' },
  { pt: 'Fenofibrato', en: 'fenofibrate' },
  { pt: 'Genfibrozila', en: 'gemfibrozil' },
  { pt: 'Colestiramina', en: 'cholestyramine' },
  { pt: 'Niacina', aliases: ['ácido nicotínico', 'acido nicotinico'], en: 'niacin' },
  { pt: 'Evolocumabe', en: 'evolocumab' },
  { pt: 'Alirocumabe', aliases: ['alicumabe'], en: 'alirocumab' },

  // Glicocorticoides
  { pt: 'Dexametasona', en: 'dexamethasone' },
  { pt: 'Betametasona', en: 'betamethasone' },
  { pt: 'Prednisona', en: 'prednisone' },
  { pt: 'Prednisolona', en: 'prednisolone' },
  { pt: 'Hidrocortisona', en: 'hydrocortisone' },
  { pt: 'Fludrocortisona', en: 'fludrocortisone' },
  { pt: 'Fluticasona', en: 'fluticasone' },

  // Antimicrobianos
  { pt: 'Meticilina', en: 'methicillin' },
  { pt: 'Penicilina', en: 'penicillin' },
  { pt: 'Amoxicilina', en: 'amoxicillin' },
  { pt: 'Ácido Clavulânico', aliases: ['acido clavulanico'], en: 'clavulanic acid' },
  { pt: 'Sulbactam', en: 'sulbactam' },
  { pt: 'Tazobactam', en: 'tazobactam' },
  { pt: 'Cefalexina', en: 'cephalexin' },
  { pt: 'Cefoxitina', en: 'cefoxitin' },
  { pt: 'Cefuroxima', en: 'cefuroxime' },
  { pt: 'Ceftriaxona', en: 'ceftriaxone' },
  { pt: 'Ceftazidima', en: 'ceftazidime' },
  { pt: 'Cefepima', en: 'cefepime' },
  { pt: 'Ceftarolina', en: 'ceftaroline' },
  { pt: 'Aztreonam', en: 'aztreonam' },
  { pt: 'Azitromicina', en: 'azithromycin' },
  { pt: 'Eritromicina', en: 'erythromycin' },
  { pt: 'Clindamicina', en: 'clindamycin' },
  { pt: 'Ciprofloxacino', en: 'ciprofloxacin' },
  { pt: 'Levofloxacino', en: 'levofloxacin' },
  { pt: 'Moxifloxacino', en: 'moxifloxacin' },
  { pt: 'Trovafloxacino', en: 'trovafloxacin' },
  { pt: 'Delafloxacino', en: 'delafloxacin' },
  { pt: 'Polimixinas', aliases: ['polimixina'], en: 'polymyxin b' },
  { pt: 'Cetoconazol', en: 'ketoconazole' },

  // Psicofármacos
  { pt: 'Fluoxetina', en: 'fluoxetine' },
  { pt: 'Paroxetina', en: 'paroxetine' },
  { pt: 'Venlafaxina', en: 'venlafaxine' },
  { pt: 'Duloxetina', en: 'duloxetine' },
  { pt: 'Mirtazapina', en: 'mirtazapine' },
  { pt: 'Bupropiona', en: 'bupropion' },
  { pt: 'Amitriptilina', en: 'amitriptyline' },
  { pt: 'Haloperidol', en: 'haloperidol' },
  { pt: 'Clozapina', en: 'clozapine' },
  { pt: 'Risperidona', en: 'risperidone' },
  { pt: 'Olanzapina', en: 'olanzapine' },
  { pt: 'Quetiapina', en: 'quetiapine' },
  { pt: 'Ziprasidona', en: 'ziprasidone' },
  { pt: 'Aripiprazol', en: 'aripiprazole' },
  { pt: 'Diazepam', en: 'diazepam' },
  { pt: 'Clonazepam', en: 'clonazepam' },
  { pt: 'Midazolam', en: 'midazolam' },
  { pt: 'Triazolam', en: 'triazolam' },
  { pt: 'Clordiazepóxido', aliases: ['clordiazepoxido'], en: 'chlordiazepoxide' },
  { pt: 'Flumazenil', en: 'flumazenil' },

  // Farmacologia endócrina
  { pt: 'Metformina', en: 'metformin' },
  { pt: 'Glibenclamida', en: 'glyburide' },
  { pt: 'Pioglitazona', en: 'pioglitazone' },
  { pt: 'Sitagliptina', en: 'sitagliptin' },
  { pt: 'Dapagliflozina', en: 'dapagliflozin' },
  { pt: 'Empagliflozina', en: 'empagliflozin' },
  { pt: 'Liraglutida', en: 'liraglutide' },
  { pt: 'Semaglutida', en: 'semaglutide' },
  { pt: 'Exenatida', en: 'exenatide' },
  { pt: 'Lixisenatida', en: 'lixisenatide' },
  { pt: 'Insulina Lispro', en: 'insulin lispro' },
  { pt: 'Insulina Glargina', en: 'insulin glargine' },
  { pt: 'Insulina NPH', en: 'insulin isophane' },
  { pt: 'Insulina Degludeca', en: 'insulin degludec' },
  { pt: 'Insulina Asparta', en: 'insulin aspart' },
  { pt: 'Insulina Detemir', en: 'insulin detemir' },
  { pt: 'Insulina Regular', en: 'regular insulin' },
];

/** Remove acentos e caixa — casamento fica insensível a ambos. */
function normalizarTermoFarmaco(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function escaparRegExpFarmaco(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lista achatada (um item por alias/nome) ordenada da maior para a menor, para "maior correspondência vence". */
const LAIFT_FARMACOS_INDICE = (function construirIndiceFarmacos() {
  const vistos = Object.create(null);
  const lista = [];
  LAIFT_FARMACOS.forEach(function (f) {
    const termos = [f.pt].concat(f.aliases || []);
    termos.forEach(function (termo) {
      const norm = normalizarTermoFarmaco(termo);
      if (norm && !vistos[norm]) {
        vistos[norm] = true;
        lista.push({ norm: norm, pt: f.pt, en: f.en });
      }
    });
  });
  lista.sort(function (a, b) { return b.norm.length - a.norm.length; });
  return lista;
})();

/** Acha o fármaco de maior correspondência (mais caracteres) dentro de um texto, por palavra completa. */
function encontrarFarmacoNoTexto(texto) {
  const normalizado = normalizarTermoFarmaco(texto);
  if (!normalizado) return null;
  for (let i = 0; i < LAIFT_FARMACOS_INDICE.length; i++) {
    const termo = LAIFT_FARMACOS_INDICE[i];
    const re = new RegExp('(?:^|[^a-z0-9])' + escaparRegExpFarmaco(termo.norm) + '(?:$|[^a-z0-9])');
    if (re.test(normalizado)) return termo;
  }
  return null;
}

/**
 * Detecta o fármaco-alvo de uma questão do quiz, na ordem de prioridade:
 * alternativa correta → enunciado → explicação. Devolve
 * { farmacoAlvo, farmacoConsulta } (nome em PT para exibição, termo em EN
 * para as APIs) ou null se nenhum fármaco individual for reconhecido —
 * como nas questões puramente conceituais, que continuam sem fármaco.
 */
function detectarFarmacoAlvo(questao) {
  if (!questao) return null;
  const fontes = [];
  if (Array.isArray(questao.options) && typeof questao.correct === 'number' && questao.options[questao.correct]) {
    fontes.push(questao.options[questao.correct]);
  }
  if (questao.question) fontes.push(questao.question);
  if (questao.explanation) fontes.push(questao.explanation);
  for (let i = 0; i < fontes.length; i++) {
    const achado = encontrarFarmacoNoTexto(fontes[i]);
    if (achado) return { farmacoAlvo: achado.pt, farmacoConsulta: achado.en };
  }
  return null;
}

window.LAIFT_FARMACOS = LAIFT_FARMACOS;
window.detectarFarmacoAlvo = detectarFarmacoAlvo;
