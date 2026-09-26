/**
 * ============================================================================
 * LAIFT — Web Worker de Indexação de Compostos
 * Arquivo: studio/workers/indexer.worker.js
 * Versão: 4.0 FINAL
 * ============================================================================
 *
 * RESPONSABILIDADE:
 *   Recebe as bases de dados brutas do laboratório e devolve um catálogo
 *   unificado, classificado, deduplicado e ordenado — tudo em thread
 *   separada para não bloquear a UI principal.
 *
 * MENSAGENS RECEBIDAS:
 *   { tipo: 'INDEXAR', payload: { labDb, synthDb, expandidoDb, reserva } }
 *
 * MENSAGENS ENVIADAS:
 *   { tipo: 'PROGRESSO', etapa: string, percentual: 0-100 }
 *   { tipo: 'INDEXADO', compostos: Array<Composto> }
 *   { tipo: 'ERRO', mensagem: string }
 *
 * ESTRUTURA DE UM COMPOSTO:
 *   {
 *     id: string,              // Identificador único normalizado
 *     chaveOriginal: string,   // Chave original da base (ex.: 'AAS_s')
 *     nome: string,            // Nome legível
 *     formula: string,         // Fórmula molecular
 *     molarMass: number|string,// Massa molar em g/mol
 *     smiles: string,          // SMILES canônico
 *     categoria: string,       // 'farmacos' | 'reagentes' | 'solventes' | 'toxicos' | 'custom'
 *     pubchemQuery: string     // Nome preferido para consulta PubChem
 *   }
 *
 * FONTES DE DADOS (em ordem de precedência):
 *   1. labDb.species            → Base primária do laboratório virtual
 *   2. synthDb (array)          → Banco de sínteses farmacêuticas
 *   3. expandidoDb (array)      → Catálogo químico expandido
 *   4. reserva (array)          → Acervo de reserva (nunca-vazio)
 *
 * ============================================================================
 */

'use strict';

// ============================================================================
// UTILITÁRIO: ENVIO DE PROGRESSO
// Permite feedback visual no main thread durante o processamento.
// ============================================================================
function reportarProgresso(etapa, percentual) {
  try {
    self.postMessage({
      tipo: 'PROGRESSO',
      etapa: etapa || '',
      percentual: Math.max(0, Math.min(100, percentual || 0))
    });
  } catch (e) {
    // postMessage não deve falhar, mas protegemos contra ambiente restrito
  }
}

// ============================================================================
// CLASSIFICAÇÃO DE CATEGORIA
// Mesma lógica utilizada no main thread (classificarCategoria) para garantir
// consistência entre indexação assíncrona e fallback síncrono.
//
// Ordem de prioridade: custom > toxicos > solventes > reagentes > farmacos
// ============================================================================
function classificarCategoria(chave, label) {
  const txt = ((chave || '') + ' ' + (label || '')).toLowerCase();

  // Compostos editados/derivados sempre vão para 'custom'
  if (/custom|derivado|editado|análogo|scaffold_/.test(txt)) return 'custom';

  // Substâncias controladas, toxinas e agentes de guerra química
  if (/sarin|vx|estricnina|toxina|mostarda|cianeto|arsênio|arsenio|fentanil/.test(txt)) {
    return 'toxicos';
  }

  // Solventes comuns de laboratório
  if (/agua|água|etanol|metanol|acetona|hexano|cloroformio|clorofórmio|dmso|thf|tolueno|benzeno|dichlorometano/.test(txt)) {
    return 'solventes';
  }

  // Reagentes inorgânicos e ácidos/bases
  if (/acido|ácido|hidroxido|hidróxido|cloreto|sulfato|nitrato|anidrido|sodio|sódio|potassio|potássio|carbonato|fosfato/.test(txt)) {
    return 'reagentes';
  }

  // Padrão: fármacos
  return 'farmacos';
}

// ============================================================================
// NORMALIZAÇÃO DE ID
// Remove sufixos de fase (estado físico) do identificador.
// Ex.: 'AAS_s' → 'AAS', 'Etanol_l' → 'Etanol', 'HCl_aq' → 'HCl'
// ============================================================================
function normalizarId(chave) {
  if (!chave || typeof chave !== 'string') return '';
  return chave.replace(/_s$|_l$|_aq$|_g$/g, '');
}

// ============================================================================
// INDEXAÇÃO PRINCIPAL
// Percorre todas as fontes, deduplica por ID normalizado, classifica e ordena.
// Emite progresso em cada fase para feedback visual no main thread.
// ============================================================================
function indexarAcervo(labDb, synthDb, expandidoDb, reserva) {
  const mapaUnico = new Map();

  // ────────────────────────────────────────────────────────────────────────
  // FASE 1 — Base primária do laboratório (LAB_DATABASE.species)
  // ────────────────────────────────────────────────────────────────────────
  reportarProgresso('Indexando base primária...', 5);

  if (labDb && typeof labDb === 'object' && labDb.species && typeof labDb.species === 'object') {
    const chaves = Object.keys(labDb.species);
    const total = chaves.length;
    let processados = 0;

    for (let i = 0; i < chaves.length; i++) {
      const chave = chaves[i];
      const dados = labDb.species[chave];
      if (!dados || typeof dados !== 'object') continue;

      const id = normalizarId(chave);
      const norm = id.toLowerCase();

      // Preserva a primeira ocorrência (deduplicação)
      if (!mapaUnico.has(norm)) {
        mapaUnico.set(norm, {
          id: id,
          chaveOriginal: chave,
          nome: dados.label || id,
          formula: dados.formula || '--',
          molarMass: dados.molarMass || '--',
          smiles: dados.smiles || '--',
          categoria: classificarCategoria(chave, dados.label),
          pubchemQuery: dados.pubchemQuery || dados.label || id,
          fonte: 'lab-database'
        });
      }

      processados++;
      // Reporta progresso a cada 100 itens (evita spam de postMessage)
      if (processados % 100 === 0 || processados === total) {
        const pct = 5 + Math.round((processados / total) * 25); // 5% → 30%
        reportarProgresso('Base primária: ' + processados + '/' + total, pct);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // FASE 2 — Banco de sínteses farmacêuticas
  // ────────────────────────────────────────────────────────────────────────
  reportarProgresso('Indexando sínteses farmacêuticas...', 32);

  if (synthDb && Array.isArray(synthDb)) {
    const total = synthDb.length;

    for (let i = 0; i < total; i++) {
      const synth = synthDb[i];
      if (!synth || typeof synth !== 'object') continue;
      if (!synth.nomeComposto) continue;

      const id = synth.produtoId || synth.id || synth.nomeComposto;
      const norm = String(id).toLowerCase();

      if (!mapaUnico.has(norm)) {
        mapaUnico.set(norm, {
          id: id,
          chaveOriginal: synth.produtoId || synth.id || id,
          nome: synth.nomeComposto,
          formula: synth.formula || '--',
          molarMass: synth.molarMass || '--',
          smiles: synth.smiles || '--',
          categoria: 'farmacos', // Sínteses farmacêuticas → sempre fármacos
          pubchemQuery: synth.pubchemQuery || synth.nomeComposto,
          fonte: 'sinteses-database'
        });
      }

      if (i % 100 === 0 || i === total - 1) {
        const pct = 32 + Math.round((i / total) * 13); // 32% → 45%
        reportarProgresso('Sínteses: ' + i + '/' + total, pct);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // FASE 3 — Catálogo químico expandido
  // ────────────────────────────────────────────────────────────────────────
  reportarProgresso('Indexando catálogo expandido...', 47);

  if (expandidoDb && Array.isArray(expandidoDb)) {
    const total = expandidoDb.length;

    for (let i = 0; i < total; i++) {
      const c = expandidoDb[i];
      if (!c || typeof c !== 'object') continue;
      if (!c.nome) continue;

      const idRaw = c.id || c.nome;
      const norm = String(idRaw).toLowerCase();

      if (!mapaUnico.has(norm)) {
        mapaUnico.set(norm, {
          id: idRaw,
          chaveOriginal: c.chave || c.id || c.nome,
          nome: c.nome,
          formula: c.formula || '--',
          molarMass: c.molarMass || '--',
          smiles: c.smiles || '--',
          categoria: c.categoria || classificarCategoria(c.chave || '', c.nome),
          pubchemQuery: c.pubchemQuery || c.nome,
          fonte: 'expandido'
        });
      }

      if (i % 100 === 0 || i === total - 1) {
        const pct = 47 + Math.round((i / total) * 23); // 47% → 70%
        reportarProgresso('Expandido: ' + i + '/' + total, pct);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // FASE 4 — Acervo de reserva (garantia de nunca-vazio)
  // ────────────────────────────────────────────────────────────────────────
  reportarProgresso('Aplicando acervo de reserva...', 75);

  if (reserva && Array.isArray(reserva)) {
    const total = reserva.length;

    for (let i = 0; i < total; i++) {
      const comp = reserva[i];
      if (!comp || typeof comp !== 'object') continue;
      if (!comp.id) continue;

      const norm = String(comp.id).toLowerCase();

      // Reserva só é usada se o ID ainda não existir
      if (!mapaUnico.has(norm)) {
        mapaUnico.set(norm, {
          id: comp.id,
          chaveOriginal: comp.chaveOriginal || comp.id,
          nome: comp.nome,
          formula: comp.formula || '--',
          molarMass: comp.molarMass || '--',
          smiles: comp.smiles || '--',
          categoria: comp.categoria || 'farmacos',
          pubchemQuery: comp.pubchemQuery || comp.nome,
          fonte: 'reserva'
        });
      }

      if (i % 5 === 0 || i === total - 1) {
        const pct = 75 + Math.round((i / total) * 15); // 75% → 90%
        reportarProgresso('Reserva: ' + i + '/' + total, pct);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // FASE 5 — Ordenação alfabética (pt-BR)
  // ────────────────────────────────────────────────────────────────────────
  reportarProgresso('Ordenando catálogo...', 92);

  const arrayOrdenado = Array.from(mapaUnico.values());
  arrayOrdenado.sort(function (a, b) {
    return (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' });
  });

  reportarProgresso('Concluído: ' + arrayOrdenado.length + ' compostos', 100);

  return arrayOrdenado;
}

// ============================================================================
// HANDLER DE MENSAGENS
// Ponto de entrada do Worker. Recebe comandos e delega ao indexador.
// ============================================================================
self.onmessage = function (event) {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  const tipo = data.tipo;

  // ────────────────────────────────────────────────────────────────────────
  // COMANDO: INDEXAR
  // ────────────────────────────────────────────────────────────────────────
  if (tipo === 'INDEXAR') {
    try {
      const payload = data.payload || {};
      const labDb = payload.labDb || null;
      const synthDb = payload.synthDb || null;
      const expandidoDb = payload.expandidoDb || null;
      const reserva = payload.reserva || [];

      const compostos = indexarAcervo(labDb, synthDb, expandidoDb, reserva);

      self.postMessage({
        tipo: 'INDEXADO',
        compostos: compostos
      });
    } catch (err) {
      self.postMessage({
        tipo: 'ERRO',
        mensagem: (err && err.message) ? err.message : String(err)
      });
    }
    return;
  }

  // ────────────────────────────────────────────────────────────────────────
  // COMANDO: PING (healthcheck opcional)
  // ────────────────────────────────────────────────────────────────────────
  if (tipo === 'PING') {
    self.postMessage({ tipo: 'PONG', timestamp: Date.now() });
    return;
  }

  // ────────────────────────────────────────────────────────────────────────
  // COMANDO DESCONHECIDO
  // ────────────────────────────────────────────────────────────────────────
  self.postMessage({
    tipo: 'ERRO',
    mensagem: 'Comando desconhecido: ' + tipo
  });
};

// ============================================================================
// HANDLER DE ERROS GLOBAIS
// Captura exceções não tratadas dentro do Worker e as propaga ao main thread.
// ============================================================================
self.onerror = function (erro) {
  try {
    self.postMessage({
      tipo: 'ERRO',
      mensagem: 'Erro global no Worker: ' + (erro.message || String(erro))
    });
  } catch (e) {
    // Último recurso
  }
};

// ============================================================================
// HANDLER DE REJEIÇÃO DE PROMISE
// Cobre o caso de async/await dentro do Worker (não usado aqui, mas defensivo).
// ============================================================================
self.onunhandledrejection = function (event) {
  try {
    self.postMessage({
      tipo: 'ERRO',
      mensagem: 'Promise rejeitada no Worker: ' + (event.reason ? String(event.reason) : 'desconhecido')
    });
  } catch (e) {}
};

// ============================================================================
// NOTIFICAÇÃO DE PRONTIDÃO
// Avisa o main thread que o Worker terminou de carregar e está pronto.
// ============================================================================
try {
  self.postMessage({ tipo: 'PROGRESSO', etapa: 'Worker pronto', percentual: 0 });
} catch (e) {
  // Silencioso
}

// ============================================================================
// FIM DO ARQUIVO indexer.worker.js — v4.0
// ============================================================================
