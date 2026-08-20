/* Charme — messaggi WhatsApp
   L'app compone il testo e apre WhatsApp con il messaggio già scritto nella
   chat giusta. L'invio resta un tocco di Veronica: è l'unico modo gratuito e
   conforme ai termini di servizio di WhatsApp. */

import * as cfg from './impostazioni.js';
import {
  daIsoLocale, dataEstesa, dataNumerica, ora, durataUmana, euro,
  telefonoInternazionale, nomeCompleto, quandoUmano
} from './util.js';

/** Campi disponibili nei testi delle impostazioni. */
export const CAMPI = [
  { chiave: '{nome}',        descrizione: 'Nome della cliente',            esempio: 'Maria' },
  { chiave: '{cognome}',     descrizione: 'Cognome della cliente',         esempio: 'Rossi' },
  { chiave: '{giorno}',      descrizione: 'Giorno esteso',                 esempio: 'giovedì 20 agosto' },
  { chiave: '{quando}',      descrizione: 'Oggi / domani / giorno esteso', esempio: 'domani' },
  { chiave: '{data}',        descrizione: 'Data in cifre',                 esempio: '20/08/2026' },
  { chiave: '{ora}',         descrizione: 'Ora di inizio',                 esempio: '15:00' },
  { chiave: '{servizio}',    descrizione: 'Servizi prenotati',             esempio: 'taglio e piega' },
  { chiave: '{durata}',      descrizione: 'Durata prevista',               esempio: '1h 15min' },
  { chiave: '{prezzo}',      descrizione: 'Importo previsto',              esempio: '€ 38' },
  { chiave: '{negozio}',     descrizione: 'Nome del negozio',              esempio: 'Charme Parrucchieri' },
  { chiave: '{titolare}',    descrizione: 'Nome della titolare',           esempio: 'Veronica' },
  { chiave: '{indirizzo}',   descrizione: 'Indirizzo del negozio',         esempio: 'Via Sottana, Padernello' },
  { chiave: '{telefono}',    descrizione: 'Telefono del negozio',          esempio: '0422 000000' }
];

function elencoServizi(app) {
  const nomi = (app.servizi || []).map(s => s.nome.toLowerCase());
  if (!nomi.length) return 'il tuo appuntamento';
  if (nomi.length === 1) return nomi[0];
  return nomi.slice(0, -1).join(', ') + ' e ' + nomi[nomi.length - 1];
}

export function valoriCampi(cliente, appuntamento) {
  const negozio = cfg.get('negozio');
  const valuta = cfg.get('incassi').valuta;
  const d = daIsoLocale(appuntamento.inizio);
  return {
    '{nome}': (cliente && cliente.nome) || '',
    '{cognome}': (cliente && cliente.cognome) || '',
    '{giorno}': dataEstesa(d).toLowerCase(),
    '{quando}': quandoUmano(d),
    '{data}': dataNumerica(d),
    '{ora}': ora(d),
    '{servizio}': elencoServizi(appuntamento),
    '{durata}': durataUmana(appuntamento.durata),
    '{prezzo}': euro(appuntamento.prezzo, valuta),
    '{negozio}': negozio.nome || '',
    '{titolare}': (negozio.titolare || '').split(' ')[0] || '',
    '{indirizzo}': negozio.indirizzo || '',
    '{telefono}': negozio.telefono || ''
  };
}

export function componi(modello, cliente, appuntamento) {
  const valori = valoriCampi(cliente, appuntamento);
  let testo = String(modello || '');
  for (const [campo, valore] of Object.entries(valori)) {
    testo = testo.split(campo).join(valore);
  }
  const firma = cfg.get('messaggi').firma;
  if (firma && !testo.includes(firma)) testo += `\n${firma}`;
  return testo.replace(/\n{3,}/g, '\n\n').trim();
}

export function testoConferma(cliente, appuntamento) {
  return componi(cfg.get('messaggi').conferma, cliente, appuntamento);
}

export function testoPromemoria(cliente, appuntamento) {
  return componi(cfg.get('messaggi').promemoria, cliente, appuntamento);
}

/** Anteprima nelle impostazioni, con una cliente inventata. */
export function anteprima(modello) {
  const clienteFinto = { nome: 'Maria', cognome: 'Rossi' };
  const oggi = new Date();
  const domani = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + 1, 15, 0);
  const appFinto = {
    inizio: `${domani.getFullYear()}-${String(domani.getMonth()+1).padStart(2,'0')}-${String(domani.getDate()).padStart(2,'0')}T15:00`,
    durata: 75,
    prezzo: 38,
    servizi: [{ nome: 'Taglio' }, { nome: 'Piega' }]
  };
  return componi(modello, clienteFinto, appFinto);
}

export function linkWhatsApp(telefono, testo) {
  const numero = telefonoInternazionale(telefono, cfg.get('cliente').prefissoTelefonico);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(testo)}`;
}

/** Apre WhatsApp. Restituisce false se manca il numero della cliente. */
export function apri(cliente, testo) {
  const link = linkWhatsApp(cliente && cliente.telefono, testo);
  if (!link) return false;
  window.open(link, '_blank', 'noopener');
  return true;
}

export function nomePerMessaggio(cliente) {
  return cliente ? (cliente.nome || nomeCompleto(cliente)) : '';
}
