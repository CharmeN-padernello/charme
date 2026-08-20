/* Charme — impostazioni e dati iniziali
   ---------------------------------------------------------------------------
   REGOLA: nessun valore configurabile è scritto nel codice dell'interfaccia.
   Tutto quello che si può cambiare vive qui come valore predefinito, viene
   copiato nel database al primo avvio e da quel momento appartiene ai DATI.
   Un aggiornamento dell'app non lo tocca più.
   --------------------------------------------------------------------------- */

import * as db from './db.js';
import { uid, normalizza } from './util.js';

export const PREDEFINITE = {

  negozio: {
    nome: 'Charme Parrucchieri',
    titolare: 'Veronica Nasato',
    indirizzo: 'Via Sottana, Padernello di Paese (TV)',
    telefono: '',
    whatsapp: '',
    email: '',
    logo: null            // immagine caricata dalle impostazioni (data URL)
  },

  agenda: {
    oraInizio: '08:00',
    oraFine: '20:00',
    passoMinuti: 15,        // granularità degli orari proposti
    durataPredefinita: 30,  // per un appuntamento senza servizio
    avvisoSovrapposizione: 'avvisa',   // 'avvisa' | 'silenzioso' | 'off'
    mostraPrezzi: true,
    densita: 'comoda',      // 'comoda' | 'compatta'
    minutiPerPixel: 1.6
  },

  messaggi: {
    conferma:
      'Ciao {nome}, ti aspetto {giorno} alle {ora} per {servizio}.\n' +
      'A presto!\n{negozio}',
    promemoria:
      'Ciao {nome}, ti ricordo il tuo appuntamento di domani, {giorno}, alle {ora} per {servizio}.\n' +
      'Se hai un imprevisto avvisami pure.\n' +
      'A presto!\n{negozio}',
    promemoriaAttivoPerNuove: true,
    oraNotificaSerale: '19:00',
    firma: ''
  },

  cliente: {
    prefissoTelefonico: '+39',
    richiediTelefono: true,
    richiediCognome: false
  },

  incassi: {
    valuta: '€',
    metodiPagamento: ['Contanti', 'Bancomat', 'Carta', 'Satispay'],
    includiAnnullati: false
  },

  colore: {
    marche: ["L'Oréal", 'Wella', 'Schwarzkopf', 'Davines', 'Framesi', 'Kérastase'],
    volumi: ['10 vol', '20 vol', '30 vol', '40 vol'],
    tempiPosa: [10, 15, 20, 25, 30, 35, 40, 45]
  },

  backup: {
    oraPromemoria: '19:30',
    giorniAvviso: 3,        // dopo quanti giorni senza backup compare l'avviso
    ultimoBackup: null,
    includiFotoNelBackup: false
  }
};

/* ---------- listino di esempio ---------- */
/* Va sostituito con quello vero dalle impostazioni o con l'import da Excel.
   Serve solo perché l'app sia usabile al primo avvio. */

export const CATEGORIE_ESEMPIO = [
  { nome: 'Taglio',        colore: '#B08D57', ordine: 1 },
  { nome: 'Piega',         colore: '#C98F86', ordine: 2 },
  { nome: 'Colore',        colore: '#9B6A7D', ordine: 3 },
  { nome: 'Trattamenti',   colore: '#7E9478', ordine: 4 },
  { nome: 'Sposa e eventi',colore: '#A8743F', ordine: 5 }
];

export const SERVIZI_ESEMPIO = [
  // categoria,        nome,                        durata, prezzo, posa
  ['Taglio',        'Taglio donna',                    30,  20, 0],
  ['Taglio',        'Taglio uomo',                     20,  15, 0],
  ['Taglio',        'Taglio bambino',                  20,  12, 0],
  ['Taglio',        'Spuntatina',                      15,  10, 0],
  ['Piega',         'Piega corta',                     30,  15, 0],
  ['Piega',         'Piega media',                     40,  18, 0],
  ['Piega',         'Piega lunga',                     45,  22, 0],
  ['Piega',         'Acconciatura',                    60,  45, 0],
  ['Colore',        'Colore radici',                   45,  35, 30],
  ['Colore',        'Colore completo',                 60,  45, 35],
  ['Colore',        'Colpi di sole',                   90,  65, 40],
  ['Colore',        'Balayage',                       120,  90, 45],
  ['Colore',        'Decolorazione',                   90,  70, 40],
  ['Colore',        'Tonalizzante',                    30,  25, 20],
  ['Trattamenti',   'Shampoo e trattamento',           20,  10, 0],
  ['Trattamenti',   'Trattamento ristrutturante',      30,  25, 15],
  ['Trattamenti',   'Maschera idratante',              20,  15, 10],
  ['Trattamenti',   'Cheratina',                      120, 120, 30],
  ['Sposa e eventi','Prova sposa',                     60,  50, 0],
  ['Sposa e eventi','Acconciatura sposa',              90, 120, 0]
];

/* ---------- accesso alle impostazioni ---------- */

let _cache = null;

/** Unione profonda: le chiavi nuove introdotte da un aggiornamento compaiono
    con il loro valore predefinito, quelle già personalizzate restano. */
function unisci(predefinito, salvato) {
  if (salvato == null) return structuredClone(predefinito);
  if (Array.isArray(predefinito)) return Array.isArray(salvato) ? salvato : structuredClone(predefinito);
  if (typeof predefinito !== 'object') return salvato;
  const out = {};
  for (const k of Object.keys(predefinito)) out[k] = unisci(predefinito[k], salvato[k]);
  for (const k of Object.keys(salvato)) if (!(k in out)) out[k] = salvato[k];
  return out;
}

export async function carica() {
  const righe = await db.leggiTutti('impostazioni');
  const salvate = Object.fromEntries(righe.map(r => [r.chiave, r.valore]));
  _cache = {};
  for (const sezione of Object.keys(PREDEFINITE)) {
    _cache[sezione] = unisci(PREDEFINITE[sezione], salvate[sezione]);
  }
  return _cache;
}

/** Lettura sincrona: l'interfaccia la usa ovunque senza await. */
export function get(sezione) {
  if (!_cache) throw new Error('Impostazioni non caricate');
  return sezione ? _cache[sezione] : _cache;
}

export async function imposta(sezione, valori) {
  _cache[sezione] = { ..._cache[sezione], ...valori };
  await db.salva('impostazioni', { chiave: sezione, valore: _cache[sezione] });
  document.dispatchEvent(new CustomEvent('impostazioni:cambiate', { detail: { sezione } }));
  return _cache[sezione];
}

export async function ripristinaSezione(sezione) {
  _cache[sezione] = structuredClone(PREDEFINITE[sezione]);
  await db.salva('impostazioni', { chiave: sezione, valore: _cache[sezione] });
  document.dispatchEvent(new CustomEvent('impostazioni:cambiate', { detail: { sezione } }));
  return _cache[sezione];
}

/* ---------- primo avvio ---------- */

export async function primoAvvio() {
  const serviziEsistenti = await db.conta('servizi');
  if (serviziEsistenti > 0) return false;

  const categorie = CATEGORIE_ESEMPIO.map(c => ({ id: uid('cat'), ...c }));
  await db.salvaMolti('categorie', categorie);

  const perNome = Object.fromEntries(categorie.map(c => [c.nome, c.id]));
  const servizi = SERVIZI_ESEMPIO.map(([cat, nome, durata, prezzo, posa], i) => ({
    id: uid('srv'),
    nome,
    categoriaId: perNome[cat],
    durata,
    prezzo,
    posaMinuti: posa,
    note: '',
    attivo: 1,
    preferito: i < 6 ? 1 : 0,
    ordine: i + 1,
    ricerca: normalizza(nome)
  }));
  await db.salvaMolti('servizi', servizi);

  await db.salva('impostazioni', { chiave: '_esempio', valore: { listinoDiEsempio: true, creatoIl: new Date().toISOString() } });
  return true;
}

/** true finché il listino non è stato personalizzato: l'app mostra un avviso. */
export async function listinoEsempioAncoraPresente() {
  const r = await db.leggi('impostazioni', '_esempio');
  return !!(r && r.valore && r.valore.listinoDiEsempio);
}

export async function segnaListinoPersonalizzato() {
  await db.salva('impostazioni', { chiave: '_esempio', valore: { listinoDiEsempio: false } });
}
