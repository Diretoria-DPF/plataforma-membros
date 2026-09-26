/**
 * MOTOR DE CONSULTA CIENTÍFICA PARA O QUIZ DE FARMACOLOGIA (LAIFT)
 * Conexão com RxNav/RxClass, PubChem e ChEBI.
 */
const QuizAPIEngine = {

  // 1. RxNav / RxClass: Busca Classe Terapêutica (ATC) e Mecanismo de Ação (MoA)
  async buscarPerfilFarmacologico(nomeFarmaco) {
    try {
      // Passo A: Obter o identificador RxCUI
      const urlRxcui = `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(nomeFarmaco.trim())}`;
      const resRxcui = await fetch(urlRxcui);
      if (!resRxcui.ok) return null;
      const dataRxcui = await resRxcui.json();
      const rxcui = dataRxcui?.idGroup?.rxnormId?.[0];
      if (!rxcui) return null;

      // Passo B: Buscar classes associadas na RxClass (ATC e Mecanismo de Ação)
      const urlClasses = `https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json?rxcui=${rxcui}&relaSource=ATC`;
      const resClasses = await fetch(urlClasses);
      let classesEncontradas = [];
      
      if (resClasses.ok) {
        const dataClasses = await resClasses.json();
        const lista = dataClasses?.rxclassDrugInfoList?.rxclassDrugInfo || [];
        classesEncontradas = lista.map(item => item.rxclassMinConceptItem.className);
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
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(nomeFarmaco.trim())}/property/CanonicalSMILES,MolecularWeight,MolecularFormula,IUPACName/JSON`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const prop = data?.PropertyTable?.Properties?.[0];

      return prop ? {
        smiles: prop.CanonicalSMILES,
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
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const hit = data?.entries?.[0];

      return hit ? {
        chebiId: hit.id,
        definicao: hit.fields?.definition?.[0] || null
      } : null;
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
