/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — cache local da bancada em IndexedDB (extraído do script.js na O3, mesmo comportamento).
 * Banco 'LAIFT_LocalChem_v2' com as lojas 'moleculas' e 'respostasIA'. Sem IndexedDB, tudo devolve null.
 * criarCacheLocal(indexedDB) recebe o IndexedDB por parâmetro (testável em Node com um falso).
 */
(function (raiz) {
  'use strict';

  const NOME_BANCO = 'LAIFT_LocalChem_v2';
  const chave = (k) => String(k).toLowerCase().trim();

  function criarCacheLocal(idb) {
    return {
      db: null,
      async init() {
        if (this.db) return this.db;
        return new Promise((resolve) => {
          try {
            if (!idb) return resolve(null);
            const req = idb.open(NOME_BANCO, 1);
            req.onupgradeneeded = (e) => {
              const db = e.target.result;
              if (!db.objectStoreNames.contains('moleculas')) db.createObjectStore('moleculas', { keyPath: 'chave' });
              if (!db.objectStoreNames.contains('respostasIA')) db.createObjectStore('respostasIA', { keyPath: 'pergunta' });
            };
            req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
            req.onerror = () => resolve(null);
          } catch (err) {
            resolve(null);
          }
        });
      },
      async get(loja, k) {
        if (!k) return null;
        const db = await this.init();
        if (!db) return null;
        return new Promise((resolve) => {
          try {
            const req = db.transaction(loja, 'readonly').objectStore(loja).get(chave(k));
            req.onsuccess = () => resolve(req.result ? req.result.dados : null);
            req.onerror = () => resolve(null);
          } catch (e) { resolve(null); }
        });
      },
      async set(loja, k, dados) {
        if (!k || !dados) return;
        const db = await this.init();
        if (!db) return;
        try {
          db.transaction(loja, 'readwrite').objectStore(loja).put({ chave: chave(k), pergunta: chave(k), dados, ts: Date.now() });
        } catch (e) { /* cota cheia ou banco fechado: segue sem cache */ }
      }
    };
  }

  const API = { NOME_BANCO, criarCacheLocal };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabCacheLocal = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
