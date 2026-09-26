/**
 * MOTOR DE CONSULTA CIENTÍFICA PARA O QUIZ DE FARMACOLOGIA (LAIFT)
 * Conexão com RxNav/RxClass, PubChem e ChEBI.
 */
const QuizAPIEngine = {

  // Dicionário de normalização (Português -> Inglês) usado só para o RxNav: o
  // RxNorm indexa nomenclatura em inglês. PubChem e ChEBI já resolvem sinônimos
  // em português diretamente, então mantêm o nome original (não normalizar aqui
  // evita perder o nome exibido/consultado nas outras duas bases).
  TERMOS_INTERNACIONAIS: {
    'aspirina': 'aspirin',
    'ácido acetilsalicílico': 'aspirin',
    'acido acetilsalicilico': 'aspirin',
    'paracetamol': 'acetaminophen',
    'acetaminofeno': 'acetaminophen',
    'dipirona': 'metamizole',
    'metamizol': 'metamizole',
    'ibuprofeno': 'ibuprofen',
    'diclofenaco': 'diclofenac',
    'omeprazol': 'omeprazole',
    'losartana': 'losartan',
    'metformina': 'metformin',
    'sinvastatina': 'simvastatin',
    'atorvastatina': 'atorvastatin',
    'amoxicilina': 'amoxicillin',
    'varfarina': 'warfarin',
    'digoxina': 'digoxin',
    'fenitoína': 'phenytoin',
    'fenitoina': 'phenytoin',
    'furosemida': 'furosemide',
    'hidroclorotiazida': 'hydrochlorothiazide'
  },

  /** Normaliza o nome do fármaco para o termo em inglês exigido pelo RxNav/RxNorm */
  normalizarNome(termo) {
    if (!termo) return '';
    const chave = termo.trim().toLowerCase();
    return this.TERMOS_INTERNACIONAIS[chave] || termo.trim();
  },

  /** fetch com timeout — RxNav/PubChem/EBI às vezes demoram alguns segundos para responder */
  async fetchComTimeout(url, options = {}, timeoutMs = 6000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  },

  // 1. RxNav / RxClass: Busca Classe Terapêutica (ATC) e Mecanismo de Ação (MoA)
  async buscarPerfilFarmacologico(nomeFarmaco) {
    const termoIngles = this.normalizarNome(nomeFarmaco);
    try {
      // Passo A: Obter o identificador RxCUI (nome exato)
      const urlRxcui = `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(termoIngles)}`;
      const resRxcui = await this.fetchComTimeout(urlRxcui);
      let rxcui = null;
      if (resRxcui.ok) {
        const dataRxcui = await resRxcui.json();
        rxcui = dataRxcui?.idGroup?.rxnormId?.[0] || null;
      }

      // Passo A2: Sem correspondência exata — tenta o termo aproximado (grafias/variações)
      if (!rxcui) {
        const urlApprox = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(termoIngles)}&maxEntries=1`;
        const resApprox = await this.fetchComTimeout(urlApprox);
        if (resApprox.ok) {
          const dataApprox = await resApprox.json();
          rxcui = dataApprox?.approximateGroup?.candidate?.[0]?.rxcui || null;
        }
      }

      if (!rxcui) return null;

      // Passo B: Buscar classes associadas na RxClass (ATC e Mecanismo de Ação)
      const urlClasses = `https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json?rxcui=${encodeURIComponent(rxcui)}&relaSource=ATC`;
      const resClasses = await this.fetchComTimeout(urlClasses);
      let classesEncontradas = [];

      if (resClasses.ok) {
        const dataClasses = await resClasses.json();
        const lista = dataClasses?.rxclassDrugInfoList?.rxclassDrugInfo || [];
        classesEncontradas = lista
          .map(item => item?.rxclassMinConceptItem?.className)
          .filter(Boolean);
      }

      return {
        rxcui: rxcui,
        classes: classesEncontradas.slice(0, 3) // Retorna as principais classes ATC
      };
    } catch (e) {
      console.warn('[Quiz API] RxNav indisponível:', e);
      return null;
    }
  },

  // 2. PubChem: Extração de Estrutura para Projeção Molecular 2D
  async buscarEstruturaMolecular(nomeFarmaco) {
    try {
      // CanonicalSMILES/IsomericSMILES seguem aceitos como alias na requisição,
      // mas desde 2025 o PubChem devolve as propriedades como ConnectivitySMILES/SMILES.
      // PubChem resolve sinônimos em português diretamente — não precisa normalizar.
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(nomeFarmaco.trim())}/property/CanonicalSMILES,MolecularWeight,MolecularFormula,IUPACName/JSON`;
      const res = await this.fetchComTimeout(url);
      if (!res.ok) return null;
      const data = await res.json();
      const prop = data?.PropertyTable?.Properties?.[0];

      return prop ? {
        smiles: prop.CanonicalSMILES || prop.ConnectivitySMILES || prop.SMILES || prop.IsomericSMILES || null,
        pesoMolecular: prop.MolecularWeight,
        formula: prop.MolecularFormula,
        iupac: prop.IUPACName,
        cid: prop.CID
      } : null;
    } catch (e) {
      console.warn('[Quiz API] PubChem indisponível:', e);
      return null;
    }
  },

  // 3. ChEBI: Definição Biológica e Farmacológica
  async buscarDefinicaoBiologica(nomeFarmaco) {
    try {
      const url = `https://www.ebi.ac.uk/ebisearch/ws/rest/chebi?query=${encodeURIComponent(nomeFarmaco.trim())}&format=json&fields=name,definition`;
      const res = await this.fetchComTimeout(url);
      if (!res.ok) return null;
      const data = await res.json();
      const hit = data?.entries?.[0];
      if (!hit) return null;

      const defBruta = hit.fields?.definition?.[0] || '';
      const defFormatada = defBruta.replace(/<[^>]*>?/gm, '').trim();

      return {
        chebiId: hit.id,
        definicao: defFormatada || null
      };
    } catch (e) {
      console.warn('[Quiz API] ChEBI indisponível:', e);
      return null;
    }
  },

  // 4. Orquestrador: Consolida o dossiê da questão em tempo real
  async gerarDossieFarmaco(nomeFarmaco) {
    const [farmacoInfo, pubchemInfo, chebiInfo] = await Promise.all([
      this.buscarPerfilFarmacologico(nomeFarmaco),
      this.buscarEstruturaMolecular(nomeFarmaco),
      this.buscarDefinicaoBiologica(nomeFarmaco)
    ]);

    return {
      farmaco: nomeFarmaco,
      rxcui: farmacoInfo?.rxcui || '--',
      classesATC: farmacoInfo?.classes?.length ? farmacoInfo.classes.join(' • ') : 'Não indexado',
      smiles: pubchemInfo?.smiles || null,
      formula: pubchemInfo?.formula || '--',
      pesoMolecular: pubchemInfo?.pesoMolecular || '--',
      iupac: pubchemInfo?.iupac || '--',
      definicao: chebiInfo?.definicao || 'Definição farmacológica em análise clínica.'
    };
  }
};
