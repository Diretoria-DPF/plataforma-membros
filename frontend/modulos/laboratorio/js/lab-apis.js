/**
 * SISTEMA UNIFICADO DE SERVIÇOS CIENTÍFICOS & QUEMOINFORMÁTICA (LAIFT)
 * Conexão assíncrona com PubChem, CACTUS (NCI/NIH), Wikidata SPARQL e ChEBI (EMBL-EBI).
 */

const ChemicalAPIEngine = {

  // Dicionário de normalização (Português -> Nomenclatura Internacional em Inglês)
  TERMOS_INTERNACIONAIS: {
    "ácido acetilsalicílico": "Aspirin",
    "aspirina": "Aspirin",
    "paracetamol": "Acetaminophen",
    "acetaminofeno": "Acetaminophen",
    "ácido salicílico": "Salicylic acid",
    "anidrido acético": "Acetic anhydride",
    "4-aminofenol": "4-Aminophenol",
    "p-aminofenol": "4-Aminophenol",
    "salicilato de metila": "Methyl salicylate",
    "acetanilida": "Acetanilide",
    "acetato de isopentila": "Isoamyl acetate",
    "benzoato de metila": "Methyl benzoate",
    "ácido acético": "Acetic acid",
    "álcool isopentílico": "Isoamyl alcohol",
    "anilina": "Aniline",
    "ácido benzóico": "Benzoic acid",
    "cloreto de prata": "Silver chloride",
    "iodeto de chumbo": "Lead(II) iodide",
    "sulfato de bário": "Barium sulfate"
  },

  /**
   * Executa requisições fetch protegidas por timeout para evitar travamento de interface
   */
  async fetchComTimeout(url, options = {}, timeoutMs = 4500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return response;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  },

  /**
   * Normaliza o nome do composto para consulta em bases internacionais
   */
  normalizarNome(termo) {
    if (!termo) return "";
    const chave = termo.trim().toLowerCase();
    return this.TERMOS_INTERNACIONAIS[chave] || termo.trim();
  },

  // 1. PUBCHEM PUG-REST: Propriedades Físico-Químicas, Massa e SMILES Canônico
  async fetchPubChem(name) {
    const termoIngles = this.normalizarNome(name);
    try {
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(termoIngles)}/property/MolecularWeight,MolecularFormula,CanonicalSMILES,IUPACName/JSON`;
      const res = await this.fetchComTimeout(url);
      if (!res.ok) return null;

      const data = await res.json();
      const prop = data?.PropertyTable?.Properties?.[0];
      if (!prop) return null;

      return {
        origem: 'PubChem PUG-REST',
        cid: prop.CID,
        pubchemCid: prop.CID,
        formula: prop.MolecularFormula,
        molarMass: parseFloat(prop.MolecularWeight),
        pesoMolecular: parseFloat(prop.MolecularWeight),
        smiles: prop.CanonicalSMILES,
        iupac: prop.IUPACName
      };
    } catch (e) {
      console.warn(`[ChemicalAPIEngine] PubChem indisponível para "${termoIngles}":`, e.message || e);
      return null;
    }
  },

  // 2. CACTUS (NCI/NIH): Motor de Contingência Estrutural Rápida
  async fetchCactus(name, representation = 'smiles') {
    const termoIngles = this.normalizarNome(name);
    try {
      const url = `https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(termoIngles)}/${representation}`;
      const res = await this.fetchComTimeout(url, {}, 3500);
      if (!res.ok) return null;

      const text = await res.text();
      const limpo = text.trim();
      return limpo.includes("<!DOCTYPE") || limpo.includes("Page not found") ? null : limpo;
    } catch (e) {
      console.warn(`[ChemicalAPIEngine] CACTUS (${representation}) indisponível para "${termoIngles}":`, e.message || e);
      return null;
    }
  },

  // 3. WIKIDATA SPARQL: Cruzamento de Registros Globais (Nº CAS, ChEMBL ID e CID)
  async fetchWikidata(name) {
    const termoIngles = this.normalizarNome(name);
    try {
      const sparqlQuery = `
        SELECT ?item ?cas ?chembl ?pubchem WHERE {
          ?item ?label "${termoIngles}"@en.
          OPTIONAL { ?item wdt:P231 ?cas. }
          OPTIONAL { ?item wdt:P592 ?chembl. }
          OPTIONAL { ?item wdt:P662 ?pubchem. }
        } LIMIT 1
      `;
      const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=json`;
      const res = await this.fetchComTimeout(url, { headers: { 'Accept': 'application/sparql-results+json' } }, 4000);
      if (!res.ok) return null;

      const data = await res.json();
      const binding = data?.results?.bindings?.[0];
      if (!binding) return null;

      return {
        cas: binding.cas?.value || null,
        chemblId: binding.chembl?.value || null,
        pubchemCid: binding.pubchem?.value || null
      };
    } catch (e) {
      console.warn(`[ChemicalAPIEngine] Wikidata indisponível para "${termoIngles}":`, e.message || e);
      return null;
    }
  },

  // 4. ChEBI via EBI Search REST: Papel Biológico e Aplicação Farmacêutica
  async fetchChebiOntology(name) {
    const termoIngles = this.normalizarNome(name);
    try {
      const url = `https://www.ebi.ac.uk/ebisearch/ws/rest/chebi?query=${encodeURIComponent(termoIngles)}&format=json&fields=name,definition`;
      const res = await this.fetchComTimeout(url, {}, 4000);
      if (!res.ok) return null;

      const data = await res.json();
      const hit = data?.entries?.[0];
      if (!hit) return null;

      const defBruta = hit.fields?.definition?.[0] || '';
      const defFormatada = defBruta.replace(/<[^>]*>?/gm, '').trim();

      return {
        chebiId: hit.id,
        definicao: defFormatada || 'Papel farmacológico consolidado em compêndios terapêuticos.'
      };
    } catch (e) {
      console.warn(`[ChemicalAPIEngine] ChEBI indisponível para "${termoIngles}":`, e.message || e);
      return null;
    }
  },

  // 5. ORQUESTRADOR EM CASCATA: Consolidação Multibases com Fallback
  async resolveCompleteCompound(name) {
    if (!name || name === 'Nenhum' || name === '--') return null;

    // Etapa A: Tenta resolução primária via PubChem
    let compoundData = await this.fetchPubChem(name);

    // Etapa B: Caso a PubChem falhe, aciona o CACTUS (NIH) em paralelo
    if (!compoundData) {
      const [smiles, iupac, formula] = await Promise.all([
        this.fetchCactus(name, 'smiles'),
        this.fetchCactus(name, 'iupac_name'),
        this.fetchCactus(name, 'formula')
      ]);

      if (smiles) {
        compoundData = {
          origem: 'CACTUS Fallback (NCI/NIH)',
          cid: '--',
          pubchemCid: '--',
          formula: formula || 'Indeterminada',
          molarMass: '--',
          pesoMolecular: '--',
          smiles: smiles,
          iupac: iupac || name
        };
      }
    }

    // Se nenhuma base estrutural respondeu, aborta para preservar a interface
    if (!compoundData) return null;

    // Etapa C: Enriquecimento ontológico e catalogação cruzada em paralelo
    const [wikiInfo, chebiInfo] = await Promise.all([
      this.fetchWikidata(name),
      this.fetchChebiOntology(name)
    ]);

    return {
      ...compoundData,
      cas: wikiInfo?.cas || '--',
      chemblId: wikiInfo?.chemblId || '--',
      chebiId: chebiInfo?.chebiId || '--',
      papelBiologico: chebiInfo?.definicao || 'Propriedades biológicas descritas na Farmacopeia Brasileira.'
    };
  }
};

// Exportação global para o escopo do navegador
if (typeof window !== "undefined") {
  window.ChemicalAPIEngine = ChemicalAPIEngine;
}
