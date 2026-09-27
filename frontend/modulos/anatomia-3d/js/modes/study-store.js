/**
 * study-store.js — armazenamento persistente de histórico, fixadores e anotações
 * para o modo "Meu estudo" (anatomia-3d).
 *
 * Wrapper IndexedDB com fallback em-memória para navegadores em modo privado.
 * Todos os métodos retornam Promise.
 */

export function createStudyStore({
  dbName = 'LAIFT_AtlasV2',
  indexedDB: idb = globalThis.indexedDB
} = {}) {
  const STORE_HISTORY = 'history';
  const STORE_PINS = 'pins';
  const STORE_NOTES = 'notes';
  const DB_VERSION = 1;
  const MAX_HISTORY = 200;

  let dbInstance = null;
  let isPersistentMode = idb !== undefined && idb !== null;
  let dbInitPromise = null;

  // Fallback em-memória
  const memory = {
    history: [],
    pins: new Map(),
    notes: new Map(),
  };

  if (!isPersistentMode) {
    console.log('[StudyStore] IndexedDB indisponível; usando fallback em-memória');
  }

  // =========================================================================
  // Inicialização do IndexedDB
  // =========================================================================

  async function initDb() {
    if (dbInitPromise) return dbInitPromise;

    if (!isPersistentMode) {
      return null;
    }

    dbInitPromise = (async () => {
      if (dbInstance) return dbInstance;

      return new Promise((resolve) => {
        try {
          const req = idb.open(dbName, DB_VERSION);

          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_HISTORY)) {
              db.createObjectStore(STORE_HISTORY, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(STORE_PINS)) {
              db.createObjectStore(STORE_PINS, { keyPath: 'sid' });
            }
            if (!db.objectStoreNames.contains(STORE_NOTES)) {
              db.createObjectStore(STORE_NOTES, { keyPath: 'sid' });
            }
          };

          req.onsuccess = (e) => {
            dbInstance = e.target.result;
            resolve(dbInstance);
          };

          req.onerror = () => {
            console.log('[StudyStore] Falha ao abrir IndexedDB; usando fallback em-memória');
            isPersistentMode = false;
            resolve(null);
          };
        } catch (err) {
          console.log('[StudyStore] Exceção ao abrir IndexedDB:', err.message);
          isPersistentMode = false;
          resolve(null);
        }
      });
    })();

    return dbInitPromise;
  }

  // =========================================================================
  // Utilitários
  // =========================================================================

  function readStore(storeName, query) {
    return new Promise((resolve) => {
      if (!dbInstance) {
        resolve(null);
        return;
      }
      try {
        const tx = dbInstance.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = query ? store.get(query) : store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  function writeStore(storeName, data, mode = 'readwrite') {
    return new Promise((resolve) => {
      if (!dbInstance) {
        resolve(false);
        return;
      }
      try {
        const tx = dbInstance.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = Array.isArray(data) ? data.reduce((r, d) => store.put(d) || r, undefined) : store.put(data);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  function clearStore(storeName) {
    return new Promise((resolve) => {
      if (!dbInstance) {
        resolve(false);
        return;
      }
      try {
        const tx = dbInstance.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  // =========================================================================
  // API Pública
  // =========================================================================

  return {
    async addHistory({ type, sid, label, at }) {
      await initDb();

      const entry = {
        type,
        sid,
        label,
        at: at || Date.now(),
      };

      if (isPersistentMode && dbInstance) {
        const all = await readStore(STORE_HISTORY);
        const arr = all || [];

        // Mantém últimas 200
        if (arr.length >= MAX_HISTORY) {
          const toDelete = arr.slice(0, arr.length - MAX_HISTORY + 1);
          if (dbInstance) {
            const tx = dbInstance.transaction(STORE_HISTORY, 'readwrite');
            const store = tx.objectStore(STORE_HISTORY);
            toDelete.forEach(item => store.delete(item.id));
          }
        }

        await writeStore(STORE_HISTORY, entry);
      } else {
        memory.history.push(entry);
        if (memory.history.length > MAX_HISTORY) {
          memory.history.splice(0, memory.history.length - MAX_HISTORY);
        }
      }
    },

    async listHistory({ limit } = {}) {
      await initDb();

      let entries;
      if (isPersistentMode && dbInstance) {
        entries = await readStore(STORE_HISTORY) || [];
      } else {
        entries = [...memory.history];
      }

      // Mais recentes primeiro
      entries = entries.sort((a, b) => (b.at || 0) - (a.at || 0));

      if (limit) {
        entries = entries.slice(0, limit);
      }

      return entries;
    },

    async togglePin({ sid, label }) {
      await initDb();

      if (isPersistentMode && dbInstance) {
        const existing = await readStore(STORE_PINS, sid);
        if (existing) {
          const tx = dbInstance.transaction(STORE_PINS, 'readwrite');
          const store = tx.objectStore(STORE_PINS);
          store.delete(sid);
          return new Promise(resolve => {
            tx.oncomplete = () => resolve(false);
            tx.onerror = () => resolve(false);
          });
        } else {
          await writeStore(STORE_PINS, { sid, label, at: Date.now() });
          return true;
        }
      } else {
        if (memory.pins.has(sid)) {
          memory.pins.delete(sid);
          return false;
        } else {
          memory.pins.set(sid, { sid, label, at: Date.now() });
          return true;
        }
      }
    },

    async listPins() {
      await initDb();

      let pins;
      if (isPersistentMode && dbInstance) {
        pins = await readStore(STORE_PINS) || [];
      } else {
        pins = Array.from(memory.pins.values());
      }

      return pins;
    },

    async setNote(sid, text) {
      await initDb();

      const note = { sid, text, at: Date.now() };

      if (isPersistentMode && dbInstance) {
        await writeStore(STORE_NOTES, note);
      } else {
        memory.notes.set(sid, note);
      }
    },

    async getNote(sid) {
      await initDb();

      if (isPersistentMode && dbInstance) {
        const note = await readStore(STORE_NOTES, sid);
        return note ? note.text : null;
      } else {
        const note = memory.notes.get(sid);
        return note ? note.text : null;
      }
    },

    isPersistent() {
      return isPersistentMode;
    },
  };
}
