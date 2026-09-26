/* ========================================================================= */
/* ARQUIVO: anatomia-3d/js/api-cache.js                                     */
/* ========================================================================= */

/**
 * GATEWAY DE APIS BIOMÉDICAS & MOTOR DE CACHE PERPÉTUO (INDEXEDDB)
 * Ecossistema LAIFT - Módulo Master 3D / Bio-Twin
 * - Fontes Integradas: Human Reference Atlas (HRA), NIH 3D, RCSB PDB e PubChem
 * - Estratégia Write-Through com IndexedDB nativo (Zero consultas duplicadas)
 * - Emissão de Dossiê / Certificado Acadêmico em PDF de Alta Resolução
 */

const ApiCache = (() => {
  // Configurações de Armazenamento
  const DB_NAME = "LAIFT_BioTwin_DB";
  const DB_VERSION = 1;
  const STORE_MODELS = "cached_models_3d";   // Armazena Blobs de .GLB, .PDB e malhas
  const STORE_PAYLOADS = "cached_api_data";  // Armazena JSONs de APIs (HRA, NIH, PubChem)
  const STORE_HISTORY = "academic_history";  // Registros de simulação de horas

  // Fase 4: o backup em nuvem no Apps Script (salvarBackupApi) foi removido
  // (Contrato 4). Os dados das APIs continuam no cache local em IndexedDB.
  const html = LaiftDom.html;
  const setHtml = LaiftDom.setHtml;

  /** Identidade vinda da Plataforma de Membros (ver ../shared/laift-identity.js). */
  function lerIdentidade() {
    return (window.LaiftIdentity && window.LaiftIdentity.get()) || {};
  }

  // Endpoints das APIs Biomédicas Abertas
  const API_ENDPOINTS = {
    HRA_BASE: "https://apps.humanatlas.io/api/v1",
    HRA_COLLECTION: "https://purl.humanatlas.io/collection/hra",
    NIH_3D_BASE: "https://3d.nih.gov/api/v1",
    PDB_DATA: "https://files.rcsb.org/download",
    PUBCHEM: "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound"
  };

  let dbInstance = null;

  // =========================================================================
  // 1. INICIALIZAÇÃO DO BANCO INDEXEDDB BINÁRIO
  // =========================================================================
  function init() {
    console.log("[ApiCache] Inicializando Gateway de APIs e Armazenamento IndexedDB...");
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_MODELS)) {
          db.createObjectStore(STORE_MODELS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_PAYLOADS)) {
          db.createObjectStore(STORE_PAYLOADS, { keyPath: "queryKey" });
        }
        if (!db.objectStoreNames.contains(STORE_HISTORY)) {
          db.createObjectStore(STORE_HISTORY, { keyPath: "id" });
        }
      };

      request.onsuccess = (e) => {
        dbInstance = e.target.result;
        console.log("[ApiCache] IndexedDB conectado e pronto para caching binário.");
        configurarBotoesAcervo();
        renderizarHistoricoLocal();
        resolve(dbInstance);
      };

      request.onerror = (e) => {
        console.error("[ApiCache] Falha ao abrir IndexedDB. Operando com fallbacks:", e);
        resolve(null);
      };
    });
  }

  // Métodos Utilitários para Operações no IndexedDB
  function getFromStore(storeName, key) {
    return new Promise((resolve) => {
      if (!dbInstance) {
        resolve(null);
        return;
      }
      try {
        const tx = dbInstance.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  function saveToStore(storeName, data) {
    return new Promise((resolve) => {
      if (!dbInstance) {
        resolve(false);
        return;
      }
      try {
        const tx = dbInstance.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        store.put(data);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  // =========================================================================
  // 2. CONSULTAS COM CACHE AUTOMÁTICO E BACKUP (WRITE-THROUGH)
  // =========================================================================

  /**
   * Consulta a API do Human Reference Atlas (HRA) com cache perpétuo.
   * Retorna os metadados de órgãos, células e links dos modelos 3D no padrão CCF.
   */
  async function consultarHRA(orgaoNome) {
    const key = `hra_${orgaoNome.toLowerCase().trim()}`;
    
    // 1. Verifica cache local
    const cached = await getFromStore(STORE_PAYLOADS, key);
    if (cached) {
      console.log(`[ApiCache] ⚡ HRA [${orgaoNome}] retornado do cache local.`);
      return cached.payload;
    }

    // 2. Consulta à API da HRA
    console.log(`[ApiCache] 🌐 Consultando HRA para o órgão: ${orgaoNome}...`);
    try {
      const url = `${API_ENDPOINTS.HRA_BASE}/reference-organs?organ=${encodeURIComponent(orgaoNome)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Órgão não localizado na API HRA.");
      
      const payload = await res.json();

      // 3. Salva no cache perpétuo
      await saveToStore(STORE_PAYLOADS, {
        queryKey: key,
        payload: payload,
        timestamp: Date.now()
      });

      // 4. Envia backup assíncrono para o GAS/Sheets

      return payload;
    } catch (err) {
      console.warn(`[ApiCache] Falha na consulta HRA (${orgaoNome}):`, err);
      return null;
    }
  }

  /**
   * Consulta o NIH 3D Print Exchange para modelos 3D de macromoléculas/vírus/órgãos.
   */
  async function consultarNIH3D(termoBusca) {
    const key = `nih3d_${termoBusca.toLowerCase().trim()}`;
    
    const cached = await getFromStore(STORE_PAYLOADS, key);
    if (cached) {
      console.log(`[ApiCache] ⚡ NIH 3D [${termoBusca}] retornado do cache local.`);
      return cached.payload;
    }

    console.log(`[ApiCache] 🌐 Consultando NIH 3D para: ${termoBusca}...`);
    try {
      const url = `${API_ENDPOINTS.NIH_3D_BASE}/entries?search=${encodeURIComponent(termoBusca)}&limit=5`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Consulta ao NIH 3D sem retorno.");
      
      const payload = await res.json();

      await saveToStore(STORE_PAYLOADS, {
        queryKey: key,
        payload: payload,
        timestamp: Date.now()
      });


      return payload;
    } catch (err) {
      console.warn(`[ApiCache] Falha no NIH 3D (${termoBusca}):`, err);
      return null;
    }
  }

  /**
   * Busca e armazena o binário de um modelo 3D (.glb ou .pdb).
   * Se já estiver em cache, cria uma URL de objeto local (Blob URL) instantânea.
   */
  async function obterModelo3DBinario(idModelo, urlDownload) {
    const cached = await getFromStore(STORE_MODELS, idModelo);
    if (cached && cached.blob) {
      console.log(`[ApiCache] ⚡ Modelo 3D [${idModelo}] carregado da memória binária local.`);
      return URL.createObjectURL(cached.blob);
    }

    console.log(`[ApiCache] 🌐 Baixando binário do modelo 3D [${idModelo}] pela primeira vez...`);
    try {
      const res = await fetch(urlDownload);
      if (!res.ok) throw new Error("Erro ao transferir arquivo 3D.");
      
      const blob = await res.blob();

      // Grava no IndexedDB como Blob bruto
      await saveToStore(STORE_MODELS, {
        id: idModelo,
        blob: blob,
        tamanhoBytes: blob.size,
        dataSalvo: new Date().toISOString()
      });

      console.log(`[ApiCache] 💾 Binário [${idModelo}] salvo no cache local permanente.`);
      return URL.createObjectURL(blob);
    } catch (err) {
      console.warn(`[ApiCache] Erro ao obter binário 3D (${idModelo}):`, err);
      return urlDownload; // Fallback para a URL original da rede
    }
  }

  /**
   * Busca de Compostos e Fármacos (PubChem) com cache local automático.
   */
  async function buscarProtocolo(query) {
    const termo = query.toLowerCase().trim();
    const key = `pubchem_${termo}`;

    // 1. Tenta memória da base estática local
    const baseLocal = (typeof ATLAS_DATABASE !== "undefined" && ATLAS_DATABASE.protocols) ||
                      (typeof BioDatabase !== "undefined" && BioDatabase.protocols) || [];

    const locais = baseLocal.filter((p) =>
      p.nome.toLowerCase().includes(termo) ||
      (p.tags && p.tags.some((t) => t.toLowerCase().includes(termo))) ||
      (p.viaMetabolica && p.viaMetabolica.toLowerCase().includes(termo))
    );

    if (locais.length > 0) {
      return locais;
    }

    // 2. Tenta cache do IndexedDB
    const cached = await getFromStore(STORE_PAYLOADS, key);
    if (cached && cached.payload) {
      return [cached.payload];
    }

    // 3. Consulta PubChem PUG REST
    try {
      const url = `${API_ENDPOINTS.PUBCHEM}/name/${encodeURIComponent(termo)}/property/MolecularWeight,XLogP,CanonicalSMILES/JSON`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Composto não encontrado no PubChem.");

      const data = await res.json();
      const props = data.PropertyTable.Properties[0];

      const novoProtocolo = {
        id: `composto_${Date.now()}`,
        nome: termo.charAt(0).toUpperCase() + termo.slice(1),
        icone: "🔬",
        viaMetabolica: "Metabolismo & Farmacocinética Exógena",
        mecanismoAcao: `Massa Molecular: ${props.MolecularWeight} g/mol | XLogP: ${props.XLogP || "N/D"}.<br>SMILES: <span style="font-family:monospace; font-size:0.7rem;">${props.CanonicalSMILES}</span>`,
        tags: ["PubChem Backup", "Princípio Ativo"],
        cofatores: [],
        sistema: "digestorio",
        targetMesh: "liver",
        pkData: {
          route: "ORAL",
          dose: 100,
          f: 0.75,
          vd: 40,
          halfLife: 4.0,
          ka: 1.2,
          targetOrgan: "liver"
        }
      };

      // Grava no IndexedDB
      await saveToStore(STORE_PAYLOADS, {
        queryKey: key,
        payload: novoProtocolo,
        timestamp: Date.now()
      });


      return [novoProtocolo];
    } catch (e) {
      console.warn("[ApiCache] PubChem sem resultados para:", termo);
      return [];
    }
  }

  // =========================================================
  // 4. REGISTRO DE SIMULAÇÃO E EMISSÃO DE DOSSIÊ EM PDF
  // =========================================================
  async function registrarSimulacao(nomeComposto, viaAdministracao) {
    const novo = {
      id: "SIM-" + Date.now().toString(36).toUpperCase(),
      data: new Date().toLocaleDateString("pt-BR"),
      hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      timestamp: Date.now(),
      composto: nomeComposto,
      via: (viaAdministracao || "ORAL").toUpperCase(),
      horasAcademicas: 0.5
    };

    // Grava no IndexedDB
    await saveToStore(STORE_HISTORY, novo);

    // Mantém fallback no localStorage para compatibilidade imediata
    const historico = lerHistorico();
    historico.unshift(novo);
    localStorage.setItem("laift_atlas_history", JSON.stringify(historico.slice(0, 30)));

    renderizarHistoricoLocal();
  }

  function renderizarHistoricoLocal() {
    const box = document.getElementById("historyListContainer") ||
                document.getElementById("history-list-container");
    if (!box) return;

    const hist = lerHistorico();

    if (hist.length === 0) {
      setHtml(box, html`
        <div style="font-size:0.75rem; color:#64748b; text-align:center; padding:16px; border:1px dashed #334155; border-radius:6px;">
          Nenhuma simulação registrada até o momento.
        </div>
      `);
      return;
    }

    // O histórico vem do localStorage (e o nome do composto pode ter sido
    // digitado pelo usuário): tudo escapado pelo html``.
    setHtml(box, html`${hist.slice(0, 8).map((h) => html`
      <div style="background:#020617; border-left:3px solid #38bdf8; padding:8px 10px; border-radius:4px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong style="color:#f8fafc; font-size:0.8rem;">${h.composto}</strong>
          <div style="color:#64748b; font-size:0.7rem; margin-top:2px;">
            ${h.data} às ${h.hora || ""} • Via ${h.via}
          </div>
        </div>
        <span style="font-size:0.7rem; color:#38bdf8; font-weight:700; background:rgba(56,189,248,0.12); padding:2px 8px; border-radius:12px;">
          +${h.horasAcademicas || 0.5}h
        </span>
      </div>
    `)}`);
  }

  function lerHistorico() {
    try {
      const raw = localStorage.getItem("laift_atlas_history");
      const hist = raw ? JSON.parse(raw) : [];
      return Array.isArray(hist) ? hist : [];
    } catch (e) {
      return [];
    }
  }

  function configurarBotoesAcervo() {
    const btnExportar = document.getElementById("btn-export-csv") ||
                        document.getElementById("btnExportCsv") ||
                        document.getElementById("btn-export-pdf-acervo");
    // O clique vem do data-action no HTML (ApiCache.exportarDossiePDF);
    // atribuir onclick aqui também abriria o dossiê duas vezes.
    if (btnExportar) btnExportar.innerText = "📄 Emitir Dossiê PDF";
  }

  function exportarDossiePDF() {
    const historico = lerHistorico();

    if (historico.length === 0) {
      alert("Não há registros de simulação para emitir o dossiê.");
      return;
    }

    const sessao = lerIdentidade();
    // Tudo entra pelo html`` (escapa cada valor). Antes, nome e e-mail eram
    // escapados mas composto/via do histórico (localStorage) iam crus para
    // document.write numa janela da mesma origem.
    const nomeAluno = sessao.name || "Acadêmico(a) de Farmácia";
    const idAluno = sessao.identifier || "---";
    const vinculo = sessao.type || "Membro Efetivo / Pesquisador";
    const dataEmissao = new Date().toLocaleDateString("pt-BR");
    const horaEmissao = new Date().toLocaleTimeString("pt-BR");

    const totalHoras = historico.reduce((acc, cur) => acc + (cur.horasAcademicas || 0.5), 0);
    const authCode = `LAIFT-CCF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const linhasTabela = historico.map((h, i) => html`
      <tr>
        <td style="text-align:center;">${String(i + 1).padStart(2, "0")}</td>
        <td>${h.data} às ${h.hora || ""}</td>
        <td><strong>${h.composto}</strong></td>
        <td style="text-align:center;">${h.via}</td>
        <td style="text-align:center;">Modelo Unicompartimental / Bateman</td>
        <td style="text-align:center; font-weight:bold; color:#0369a1;">+${h.horasAcademicas || 0.5} h</td>
      </tr>
    `);

    const win = window.open("", "_blank");
    if (!win) {
      alert("Habilite pop-ups para gerar o documento PDF.");
      return;
    }

    // Monta o documento pelo DOM (sem document.write nem <script> inline):
    // estilo constante via textContent, corpo via html`` e a impressão é
    // disparada daqui.
    const doc = win.document;
    doc.documentElement.lang = "pt-BR";
    doc.title = "Dossiê de Simulação Farmacocinética — LAIFT";
    const estilo = doc.createElement("style");
    estilo.textContent = DOSSIE_CSS;
    doc.head.appendChild(estilo);
    setHtml(doc.body, html`
        <div class="header-box">
          <div>
            <div class="institution">Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia</div>
            <div class="main-title">Dossiê de Simulação Biomédica & Farmacocinética 3D</div>
            <div style="font-size: 8.5pt; color: #334155;">Comprovante de Atividades Complementares e Modelagem Farmacológica</div>
          </div>
          <div class="badge-cert">DOCUMENTO OFICIAL<br>UNINASSAU Salvador / LAIFT</div>
        </div>

        <div class="student-box">
          <div><strong>Estudante / Pesquisador</strong>${nomeAluno}</div>
          <div><strong>E-mail</strong>${idAluno}</div>
          <div><strong>Vínculo</strong>${vinculo}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:30px; text-align:center;">#</th>
              <th style="width:110px;">Data / Hora</th>
              <th>Princípio Ativo / Protocolo</th>
              <th style="width:60px; text-align:center;">Via</th>
              <th style="width:140px; text-align:center;">Método de Análise</th>
              <th style="width:70px; text-align:center;">Carga</th>
            </tr>
          </thead>
          <tbody>${linhasTabela}</tbody>
        </table>

        <div class="total-box">
          <div>
            <strong style="color:#166534; font-size:9pt;">Carga Horária Prática Total Computada:</strong>
            <div style="font-size:7.5pt; color:#475569;">Válida para horas complementares no portal acadêmico e Currículo Lattes.</div>
          </div>
          <div class="total-hours">${totalHoras.toFixed(1)} Horas Acadêmicas</div>
        </div>

        <div class="statement">
          Certificamos, para os devidos fins acadêmicos e curriculares, que o(a) estudante acima identificado(a) participou ativamente das sessões de simulação e modelagem farmacocinética computacional, análise de trajetórias de biodisponibilidade por vias de administração e inspeção de estruturas macromoleculares (RCSB PDB / HRA) na Plataforma LAIFT Bio-Twin.
        </div>

        <div class="sig-row">
          <div class="sig-line"><strong>${nomeAluno}</strong><br>Discente / Pesquisador</div>
          <div class="sig-line"><strong>Diretoria de Ensino e Pesquisa</strong><br>LAIFT — UNINASSAU Salvador</div>
        </div>

        <div class="footer-auth">
          <span>Autenticação: ${authCode}</span>
          <span>Emitido em: ${dataEmissao} às ${horaEmissao}</span>
          <span>Validação: apps.humanatlas.io • laift.edu</span>
        </div>
    `);
    setTimeout(() => { try { win.focus(); win.print(); } catch (e) { /* janela fechada */ } }, 300);
  }

  const DOSSIE_CSS = `
          @page { size: A4 portrait; margin: 14mm 12mm; }
          * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; }
          body { margin: 0; padding: 0; font-size: 10pt; line-height: 1.45; }
          .header-box { border-bottom: 2px solid #0284c7; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
          .institution { font-size: 8pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
          .main-title { font-size: 13pt; font-weight: 800; color: #0369a1; margin: 2px 0; }
          .badge-cert { background: #e0f2fe; border: 1px solid #bae6fd; color: #0284c7; padding: 6px 12px; border-radius: 6px; text-align: right; font-size: 7.5pt; font-weight: bold; }
          .student-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; font-size: 8.5pt; }
          .student-box strong { display: block; color: #475569; font-size: 7.5pt; text-transform: uppercase; margin-bottom: 2px; }
          table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 14px; }
          th { background: #0f172a; color: #fff; font-weight: 700; text-align: left; padding: 6px 8px; font-size: 7.5pt; text-transform: uppercase; }
          td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
          tr:nth-child(even) { background: #f8fafc; }
          .total-box { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px 14px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
          .total-hours { font-size: 13pt; font-weight: 800; color: #16a34a; }
          .statement { font-size: 8pt; color: #475569; text-align: justify; margin-bottom: 24px; line-height: 1.5; }
          .sig-row { display: flex; justify-content: space-between; margin-top: 36px; padding: 0 20px; }
          .sig-line { width: 42%; border-top: 1px solid #0f172a; text-align: center; padding-top: 6px; font-size: 8pt; color: #334155; }
          .footer-auth { border-top: 1px dashed #cbd5e1; padding-top: 8px; margin-top: 20px; display: flex; justify-content: space-between; font-size: 7pt; color: #94a3b8; font-family: monospace; }
  `;

  return {
    init,
    consultarHRA,
    consultarNIH3D,
    obterModelo3DBinario,
    buscarProtocolo,
    registrarSimulacao,
    renderizarHistoricoLocal,
    exportarDossiePDF
  };
})();

// Exposto em window para data-action ("ApiCache.exportarDossiePDF"): `const`
// no topo não vira propriedade de window.
window.ApiCache = ApiCache;

// Inicialização imediata
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ApiCache.init);
} else {
  ApiCache.init();
}

/* ========================================================================= */
/* FIM DO ARQUIVO: anatomia-3d/js/api-cache.js                               */
/* ========================================================================= */
