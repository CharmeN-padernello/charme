/* Charme — livello dati
   ---------------------------------------------------------------------------
   PRINCIPIO FONDANTE: i dati sono separati dall'applicazione.
   Il codice dell'app sta nella cache del service worker e viene sostituito a
   ogni aggiornamento. I dati stanno qui, in IndexedDB, e non vengono MAI
   toccati da un aggiornamento.

   Le modifiche alla struttura sono solo ADDITIVE e passano dall'elenco
   MIGRAZIONI qui sotto: si aggiungono store o indici, non si cancella nulla.
   Prima di ogni migrazione viene salvata automaticamente una copia integrale
   dei dati in un DATABASE SEPARATO (charme-snapshot), che sopravvive anche se
   la migrazione fallisce.
   --------------------------------------------------------------------------- */

const DB_NOME = 'charme';
const DB_SNAPSHOT = 'charme-snapshot';

/* Ogni voce è una migrazione additiva. Per aggiungere una versione futura si
   accoda un elemento in fondo: MAI modificare o rimuovere quelli esistenti. */
const MIGRAZIONI = [
  {
    versione: 1,
    descrizione: 'Struttura iniziale: impostazioni, categorie, servizi, clienti, appuntamenti',
    // applica(db, vecchiaVersione, transazione) — la transazione permette di
    // modificare archivi già esistenti senza ricrearli.
    applica(db) {
      const impostazioni = db.createObjectStore('impostazioni', { keyPath: 'chiave' });

      const categorie = db.createObjectStore('categorie', { keyPath: 'id' });
      categorie.createIndex('ordine', 'ordine');

      const servizi = db.createObjectStore('servizi', { keyPath: 'id' });
      servizi.createIndex('categoriaId', 'categoriaId');
      servizi.createIndex('ordine', 'ordine');
      servizi.createIndex('attivo', 'attivo');

      const clienti = db.createObjectStore('clienti', { keyPath: 'id' });
      clienti.createIndex('ricerca', 'ricerca');
      clienti.createIndex('telefono', 'telefono');
      clienti.createIndex('creatoIl', 'creatoIl');

      const appuntamenti = db.createObjectStore('appuntamenti', { keyPath: 'id' });
      appuntamenti.createIndex('giorno', 'giorno');
      appuntamenti.createIndex('clienteId', 'clienteId');
      appuntamenti.createIndex('inizio', 'inizio');
      appuntamenti.createIndex('stato', 'stato');

      // Predisposti da subito perché le fasi successive li riempiranno senza
      // dover toccare la struttura mentre l'app è già in uso.
      const formule = db.createObjectStore('formule', { keyPath: 'id' });
      formule.createIndex('clienteId', 'clienteId');
      formule.createIndex('data', 'data');

      const foto = db.createObjectStore('foto', { keyPath: 'id' });
      foto.createIndex('clienteId', 'clienteId');
      foto.createIndex('data', 'data');
    }
  }
];

export const VERSIONE_DATI = MIGRAZIONI[MIGRAZIONI.length - 1].versione;
export const STORE = ['impostazioni','categorie','servizi','clienti','appuntamenti','formule','foto'];

let _db = null;

/* ---------- apertura e migrazione ---------- */

function apri(nome, versione, onUpgrade) {
  return new Promise((risolvi, rifiuta) => {
    const req = versione ? indexedDB.open(nome, versione) : indexedDB.open(nome);
    req.onupgradeneeded = (e) => onUpgrade && onUpgrade(req.result, e.oldVersion, req.transaction);
    req.onsuccess = () => risolvi(req.result);
    req.onerror = () => rifiuta(req.error);
    req.onblocked = () => rifiuta(new Error('Database bloccato da un\'altra scheda aperta. Chiudi le altre schede di Charme e riprova.'));
  });
}

/** Versione del database attualmente sul dispositivo (0 se non esiste). */
async function versioneAttuale() {
  if (indexedDB.databases) {
    try {
      const elenco = await indexedDB.databases();
      const trovato = elenco.find(d => d.name === DB_NOME);
      return trovato ? (trovato.version || 0) : 0;
    } catch { /* Safari e qualche browser vecchio: si passa al piano B */ }
  }
  const db = await apri(DB_NOME, undefined, null);
  const v = db.objectStoreNames.length ? db.version : 0;
  db.close();
  return v;
}

/** Copia integrale dei dati in un database separato, prima di migrare. */
async function salvaSnapshot(daVersione, aVersione) {
  let sorgente;
  try {
    sorgente = await apri(DB_NOME, undefined, null);
  } catch { return null; }

  const store = [...sorgente.objectStoreNames];
  if (!store.length) { sorgente.close(); return null; }

  const dati = {};
  for (const nome of store) {
    dati[nome] = await new Promise((ok) => {
      try {
        const r = sorgente.transaction(nome, 'readonly').objectStore(nome).getAll();
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ok([]);
      } catch { ok([]); }
    });
  }
  sorgente.close();

  const snapDb = await apri(DB_SNAPSHOT, 1, (db) => {
    if (!db.objectStoreNames.contains('copie')) {
      db.createObjectStore('copie', { keyPath: 'id' });
    }
  });

  const copia = {
    id: `pre-v${aVersione}-${Date.now()}`,
    creataIl: new Date().toISOString(),
    daVersione, aVersione,
    motivo: 'copia automatica prima di un aggiornamento della struttura dati',
    dati
  };

  await new Promise((ok, ko) => {
    const tx = snapDb.transaction('copie', 'readwrite');
    tx.objectStore('copie').put(copia);
    tx.oncomplete = ok; tx.onerror = () => ko(tx.error);
  });

  // Si conservano solo le ultime 5 copie automatiche.
  await new Promise((ok) => {
    const tx = snapDb.transaction('copie', 'readwrite');
    const s = tx.objectStore('copie');
    const r = s.getAllKeys();
    r.onsuccess = () => {
      const chiavi = r.result.sort();
      chiavi.slice(0, Math.max(0, chiavi.length - 5)).forEach(k => s.delete(k));
    };
    tx.oncomplete = ok; tx.onerror = ok;
  });

  snapDb.close();
  return copia.id;
}

export async function elencoSnapshot() {
  try {
    const db = await apri(DB_SNAPSHOT, 1, (d) => {
      if (!d.objectStoreNames.contains('copie')) d.createObjectStore('copie', { keyPath: 'id' });
    });
    const copie = await new Promise((ok) => {
      const r = db.transaction('copie', 'readonly').objectStore('copie').getAll();
      r.onsuccess = () => ok(r.result); r.onerror = () => ok([]);
    });
    db.close();
    return copie
      .map(({ id, creataIl, daVersione, aVersione, motivo, dati }) => ({
        id, creataIl, daVersione, aVersione, motivo,
        conteggi: Object.fromEntries(Object.entries(dati || {}).map(([k, v]) => [k, v.length]))
      }))
      .sort((a, b) => b.creataIl.localeCompare(a.creataIl));
  } catch { return []; }
}

/** Apre il database applicando le migrazioni necessarie. */
export async function inizializza() {
  if (_db) return _db;

  const attuale = await versioneAttuale();
  let snapshotId = null;

  if (attuale > 0 && attuale < VERSIONE_DATI) {
    try {
      snapshotId = await salvaSnapshot(attuale, VERSIONE_DATI);
      console.info('[Charme] copia di sicurezza creata prima della migrazione:', snapshotId);
    } catch (e) {
      console.warn('[Charme] copia di sicurezza non riuscita, si procede comunque:', e);
    }
  }

  _db = await apri(DB_NOME, VERSIONE_DATI, (db, vecchia, transazione) => {
    for (const m of MIGRAZIONI) {
      if (m.versione > vecchia) {
        console.info(`[Charme] migrazione dati → v${m.versione}: ${m.descrizione}`);
        // La transazione serve a chi deve toccare archivi già esistenti
        // (aggiungere un indice, adeguare i record). Passarla è obbligatorio.
        m.applica(db, vecchia, transazione);
      }
    }
  });

  _db.onversionchange = () => { _db.close(); _db = null; };
  return _db;
}

function db() {
  if (!_db) throw new Error('Database non inizializzato');
  return _db;
}

/* ---------- operazioni di base ---------- */

export function leggi(store, chiave) {
  return new Promise((ok, ko) => {
    const r = db().transaction(store, 'readonly').objectStore(store).get(chiave);
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
}

export function leggiTutti(store) {
  return new Promise((ok, ko) => {
    const r = db().transaction(store, 'readonly').objectStore(store).getAll();
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
}

export function leggiPerIndice(store, indice, valore) {
  return new Promise((ok, ko) => {
    const r = db().transaction(store, 'readonly').objectStore(store)
      .index(indice).getAll(valore);
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
}

export function leggiIntervallo(store, indice, da, a) {
  return new Promise((ok, ko) => {
    const r = db().transaction(store, 'readonly').objectStore(store)
      .index(indice).getAll(IDBKeyRange.bound(da, a));
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
}

export function salva(store, oggetto) {
  return new Promise((ok, ko) => {
    const tx = db().transaction(store, 'readwrite');
    tx.objectStore(store).put(oggetto);
    tx.oncomplete = () => ok(oggetto); tx.onerror = () => ko(tx.error);
  });
}

export function salvaMolti(store, oggetti) {
  return new Promise((ok, ko) => {
    const tx = db().transaction(store, 'readwrite');
    const s = tx.objectStore(store);
    oggetti.forEach(o => s.put(o));
    tx.oncomplete = () => ok(oggetti); tx.onerror = () => ko(tx.error);
  });
}

export function elimina(store, chiave) {
  return new Promise((ok, ko) => {
    const tx = db().transaction(store, 'readwrite');
    tx.objectStore(store).delete(chiave);
    tx.oncomplete = ok; tx.onerror = () => ko(tx.error);
  });
}

export function svuota(store) {
  return new Promise((ok, ko) => {
    const tx = db().transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = ok; tx.onerror = () => ko(tx.error);
  });
}

export function conta(store) {
  return new Promise((ok, ko) => {
    const r = db().transaction(store, 'readonly').objectStore(store).count();
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
}

/* ---------- esportazione e ripristino ---------- */

/** Esporta i dati. Le foto sono escluse di default: pesano e hanno un backup a parte. */
export async function esporta({ includiFoto = false } = {}) {
  const pacchetto = {
    formato: 'charme-backup',
    versioneDati: VERSIONE_DATI,
    creatoIl: new Date().toISOString(),
    dati: {}
  };
  for (const store of STORE) {
    if (store === 'foto' && !includiFoto) continue;
    pacchetto.dati[store] = await leggiTutti(store);
  }
  return pacchetto;
}

/** Esporta la sola configurazione: si ripristina senza toccare i dati clienti. */
export async function esportaConfigurazione() {
  return {
    formato: 'charme-configurazione',
    versioneDati: VERSIONE_DATI,
    creatoIl: new Date().toISOString(),
    dati: {
      impostazioni: await leggiTutti('impostazioni'),
      categorie: await leggiTutti('categorie'),
      servizi: await leggiTutti('servizi')
    }
  };
}

/**
 * Ripristina da un pacchetto.
 * modalita 'sostituisci' svuota gli store presenti nel file;
 * modalita 'unisci' aggiunge senza cancellare quello che c'è.
 */
export async function ripristina(pacchetto, { modalita = 'sostituisci' } = {}) {
  if (!pacchetto || !String(pacchetto.formato || '').startsWith('charme-')) {
    throw new Error('Il file scelto non è un backup di Charme.');
  }
  if (pacchetto.versioneDati > VERSIONE_DATI) {
    throw new Error('Il backup proviene da una versione più recente dell\'app. Aggiorna Charme e riprova.');
  }
  const riepilogo = {};
  for (const [store, righe] of Object.entries(pacchetto.dati || {})) {
    if (!STORE.includes(store) || !Array.isArray(righe)) continue;
    if (modalita === 'sostituisci') await svuota(store);
    if (righe.length) await salvaMolti(store, righe);
    riepilogo[store] = righe.length;
  }
  return riepilogo;
}

/* ---------- diagnostica ---------- */

export async function statistiche() {
  const conteggi = {};
  for (const store of STORE) conteggi[store] = await conta(store);

  let spazio = null;
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const s = await navigator.storage.estimate();
      spazio = { usato: s.usage, disponibile: s.quota };
    } catch { /* non disponibile su tutti i browser */ }
  }

  let persistente = null;
  if (navigator.storage && navigator.storage.persisted) {
    try { persistente = await navigator.storage.persisted(); } catch { /* idem */ }
  }

  return { versioneDati: VERSIONE_DATI, conteggi, spazio, persistente };
}

/** Chiede ad Android di non liberare mai questi dati per fare spazio. */
export async function chiediArchiviazionePersistente() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch { return false; }
  }
  return false;
}
