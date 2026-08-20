/* Charme — logica di dominio
   Clienti, listino, appuntamenti, calcolo degli orari liberi.
   Qui non si tocca l'interfaccia: solo dati e regole. */

import * as db from './db.js';
import * as cfg from './impostazioni.js';
import {
  uid, normalizza, nomeCompleto, dayKey, isoLocale, daIsoLocale,
  minutiDaHHMM, hhmmDaMinuti, addDays, startOfDay
} from './util.js';

/* =========================================================================
   CLIENTI
   ========================================================================= */

export async function elencoClienti() {
  const c = await db.leggiTutti('clienti');
  return c.sort((a, b) => nomeCompleto(a).localeCompare(nomeCompleto(b), 'it'));
}

export async function leggiCliente(id) {
  return db.leggi('clienti', id);
}

/** Ricerca per nome, cognome o numero. Tollerante ad accenti e maiuscole. */
export async function cercaClienti(testo, limite = 40) {
  const q = normalizza(testo);
  const tutti = await elencoClienti();
  if (!q) return tutti.slice(0, limite);

  const soloCifre = q.replace(/\D/g, '');
  const punteggio = (c) => {
    const nome = normalizza(nomeCompleto(c));
    const tel = String(c.telefono || '').replace(/\D/g, '');
    if (nome.startsWith(q)) return 3;
    if (nome.split(/\s+/).some(p => p.startsWith(q))) return 2;
    if (nome.includes(q)) return 1;
    if (soloCifre && tel.includes(soloCifre)) return 1;
    return 0;
  };

  return tutti
    .map(c => ({ c, p: punteggio(c) }))
    .filter(x => x.p > 0)
    .sort((a, b) => b.p - a.p || nomeCompleto(a.c).localeCompare(nomeCompleto(b.c), 'it'))
    .slice(0, limite)
    .map(x => x.c);
}

export async function salvaCliente(dati) {
  const adesso = new Date().toISOString();
  const cliente = {
    id: dati.id || uid('cli'),
    nome: (dati.nome || '').trim(),
    cognome: (dati.cognome || '').trim(),
    telefono: (dati.telefono || '').trim(),
    email: (dati.email || '').trim(),
    note: dati.note || '',
    allergie: dati.allergie || '',
    promemoriaAttivo: dati.promemoriaAttivo !== undefined
      ? !!dati.promemoriaAttivo
      : cfg.get('messaggi').promemoriaAttivoPerNuove,
    creatoIl: dati.creatoIl || adesso,
    modificatoIl: adesso
  };
  cliente.ricerca = normalizza(nomeCompleto(cliente));
  await db.salva('clienti', cliente);
  return cliente;
}

export async function eliminaCliente(id) {
  const appuntamenti = await db.leggiPerIndice('appuntamenti', 'clienteId', id);
  for (const a of appuntamenti) await db.elimina('appuntamenti', a.id);
  await db.elimina('clienti', id);
  return appuntamenti.length;
}

/** Riepilogo per l'intestazione della scheda cliente. */
export async function storicoCliente(clienteId) {
  const tutti = (await db.leggiPerIndice('appuntamenti', 'clienteId', clienteId))
    .sort((a, b) => b.inizio.localeCompare(a.inizio));

  const oggi = isoLocale(new Date());
  const passati = tutti.filter(a => a.inizio < oggi && a.stato !== 'annullato');
  const futuri = tutti.filter(a => a.inizio >= oggi && a.stato !== 'annullato')
                      .sort((a, b) => a.inizio.localeCompare(b.inizio));
  const contabili = passati.filter(a => a.stato !== 'assente');
  const totale = contabili.reduce((s, a) => s + (Number(a.prezzo) || 0), 0);

  return {
    tutti, passati, futuri,
    visite: contabili.length,
    totaleSpeso: totale,
    scontrinoMedio: contabili.length ? totale / contabili.length : 0,
    ultimaVisita: contabili.length ? daIsoLocale(contabili[0].inizio) : null,
    prossimo: futuri[0] || null
  };
}

/* =========================================================================
   LISTINO
   ========================================================================= */

export async function elencoCategorie() {
  return (await db.leggiTutti('categorie')).sort((a, b) => (a.ordine || 0) - (b.ordine || 0));
}

export async function elencoServizi({ soloAttivi = false } = {}) {
  let s = await db.leggiTutti('servizi');
  if (soloAttivi) s = s.filter(x => x.attivo);
  return s.sort((a, b) => (a.ordine || 0) - (b.ordine || 0));
}

/** Servizi raggruppati per categoria, con i preferiti in testa. */
export async function listinoPerCategoria() {
  const [categorie, servizi] = await Promise.all([elencoCategorie(), elencoServizi({ soloAttivi: true })]);
  const gruppi = categorie.map(c => ({
    categoria: c,
    servizi: servizi.filter(s => s.categoriaId === c.id)
  }));
  const orfani = servizi.filter(s => !categorie.some(c => c.id === s.categoriaId));
  if (orfani.length) {
    gruppi.push({ categoria: { id: null, nome: 'Senza categoria', colore: '#9A8E80' }, servizi: orfani });
  }
  return { gruppi, preferiti: servizi.filter(s => s.preferito) };
}

export async function salvaCategoria(dati) {
  const categorie = await elencoCategorie();
  const c = {
    id: dati.id || uid('cat'),
    nome: (dati.nome || '').trim(),
    colore: dati.colore || '#B08D57',
    ordine: dati.ordine != null ? dati.ordine : (categorie.length + 1)
  };
  await db.salva('categorie', c);
  return c;
}

/** Elimina una categoria: i servizi non si perdono, restano senza categoria. */
export async function eliminaCategoria(id) {
  const servizi = await db.leggiPerIndice('servizi', 'categoriaId', id);
  for (const s of servizi) await db.salva('servizi', { ...s, categoriaId: null });
  await db.elimina('categorie', id);
  return servizi.length;
}

export async function salvaServizio(dati) {
  const esistenti = await elencoServizi();
  const s = {
    id: dati.id || uid('srv'),
    nome: (dati.nome || '').trim(),
    categoriaId: dati.categoriaId || null,
    durata: Number(dati.durata) || cfg.get('agenda').durataPredefinita,
    prezzo: dati.prezzo === '' || dati.prezzo == null ? 0 : Number(dati.prezzo),
    posaMinuti: Number(dati.posaMinuti) || 0,
    note: dati.note || '',
    attivo: dati.attivo === undefined ? 1 : (dati.attivo ? 1 : 0),
    preferito: dati.preferito ? 1 : 0,
    ordine: dati.ordine != null ? dati.ordine : (esistenti.length + 1)
  };
  s.ricerca = normalizza(s.nome);
  if (s.posaMinuti >= s.durata) s.posaMinuti = Math.max(0, s.durata - 5);
  await db.salva('servizi', s);
  await cfg.segnaListinoPersonalizzato();
  return s;
}

export async function eliminaServizio(id) {
  await db.elimina('servizi', id);
  await cfg.segnaListinoPersonalizzato();
}

export async function riordinaServizi(idOrdinati) {
  const servizi = await elencoServizi();
  const mappa = Object.fromEntries(servizi.map(s => [s.id, s]));
  const aggiornati = idOrdinati.map((id, i) => ({ ...mappa[id], ordine: i + 1 })).filter(Boolean);
  await db.salvaMolti('servizi', aggiornati);
}

/** Aumento percentuale, su tutto il listino o su una sola categoria. */
export async function aumentaPrezzi(percentuale, { categoriaId = null, arrotondaA = 0.5 } = {}) {
  const servizi = (await elencoServizi()).filter(s => !categoriaId || s.categoriaId === categoriaId);
  const modifiche = servizi.map(s => {
    const nuovo = s.prezzo * (1 + percentuale / 100);
    const arrotondato = arrotondaA ? Math.round(nuovo / arrotondaA) * arrotondaA : nuovo;
    return { servizio: s, da: s.prezzo, a: Number(arrotondato.toFixed(2)) };
  });
  return modifiche;
}

export async function applicaAumento(modifiche) {
  await db.salvaMolti('servizi', modifiche.map(m => ({ ...m.servizio, prezzo: m.a })));
  await cfg.segnaListinoPersonalizzato();
}

/* =========================================================================
   APPUNTAMENTI
   ========================================================================= */

export async function appuntamentiDelGiorno(data) {
  const g = dayKey(data);
  const a = await db.leggiPerIndice('appuntamenti', 'giorno', g);
  return a.sort((x, y) => x.inizio.localeCompare(y.inizio));
}

export async function appuntamentiIntervallo(daData, aData) {
  const a = await db.leggiIntervallo('appuntamenti', 'giorno', dayKey(daData), dayKey(aData));
  return a.sort((x, y) => x.inizio.localeCompare(y.inizio));
}

export async function leggiAppuntamento(id) {
  return db.leggi('appuntamenti', id);
}

/**
 * Salva un appuntamento.
 * I servizi vengono copiati dentro l'appuntamento (nome, durata, prezzo del
 * momento): se domani il listino cambia, lo storico resta fedele a com'era.
 */
export async function salvaAppuntamento(dati) {
  const adesso = new Date().toISOString();
  const inizio = typeof dati.inizio === 'string' ? dati.inizio : isoLocale(dati.inizio);
  const servizi = (dati.servizi || []).map(s => ({
    servizioId: s.servizioId || s.id || null,
    nome: s.nome,
    durata: Number(s.durata) || 0,
    prezzo: Number(s.prezzo) || 0,
    posaMinuti: Number(s.posaMinuti) || 0
  }));

  const durata = dati.durata != null
    ? Number(dati.durata)
    : (servizi.reduce((s, x) => s + x.durata, 0) || cfg.get('agenda').durataPredefinita);

  const app = {
    id: dati.id || uid('app'),
    clienteId: dati.clienteId,
    giorno: inizio.slice(0, 10),
    inizio,
    durata,
    posaMinuti: dati.posaMinuti != null
      ? Number(dati.posaMinuti)
      : servizi.reduce((s, x) => s + x.posaMinuti, 0),
    servizi,
    prezzo: dati.prezzo != null && dati.prezzo !== ''
      ? Number(dati.prezzo)
      : servizi.reduce((s, x) => s + x.prezzo, 0),
    stato: dati.stato || 'previsto',      // previsto | concluso | annullato | assente
    note: dati.note || '',
    metodoPagamento: dati.metodoPagamento || null,
    confermaInviata: dati.confermaInviata || null,
    promemoriaInviato: dati.promemoriaInviato || null,
    creatoIl: dati.creatoIl || adesso,
    modificatoIl: adesso
  };

  await db.salva('appuntamenti', app);
  document.dispatchEvent(new CustomEvent('dati:cambiati', { detail: { tipo: 'appuntamento', id: app.id } }));
  return app;
}

export async function eliminaAppuntamento(id) {
  await db.elimina('appuntamenti', id);
  document.dispatchEvent(new CustomEvent('dati:cambiati', { detail: { tipo: 'appuntamento', id } }));
}

export async function cambiaStato(id, stato) {
  const a = await db.leggi('appuntamenti', id);
  if (!a) return null;
  return salvaAppuntamento({ ...a, stato });
}

export async function segnaMessaggioInviato(id, tipo) {
  const a = await db.leggi('appuntamenti', id);
  if (!a) return null;
  const campo = tipo === 'promemoria' ? 'promemoriaInviato' : 'confermaInviata';
  return salvaAppuntamento({ ...a, [campo]: new Date().toISOString() });
}

/* ---------- occupazione e orari liberi ---------- */

/* La parte "attiva" di un appuntamento è quella in cui lei ha le mani occupate.
   Il tempo di posa sta in fondo al servizio ed è tempo in cui può prendere
   un'altra cliente: per questo non conta come occupato. */
function finestraAttiva(app) {
  const da = minutiDaHHMM(app.inizio.slice(11));
  const attivo = Math.max(5, (app.durata || 0) - (app.posaMinuti || 0));
  return { da, a: da + attivo, totaleA: da + (app.durata || 0) };
}

function siSovrappongono(a1, a2, b1, b2) { return a1 < b2 && b1 < a2; }

/**
 * Conflitti con altri appuntamenti nella stessa giornata.
 * Restituisce { attivi, durantePosa }: i primi sono veri conflitti, i secondi
 * sono orari che cadono nella posa di un'altra cliente (spesso desiderabili).
 */
export async function verificaConflitti(inizioIso, durata, { escludiId = null } = {}) {
  const giorno = inizioIso.slice(0, 10);
  const esistenti = (await appuntamentiDelGiorno(giorno))
    .filter(a => a.id !== escludiId && a.stato !== 'annullato');

  const da = minutiDaHHMM(inizioIso.slice(11));
  const a = da + Number(durata || 0);

  const attivi = [], durantePosa = [];
  for (const altro of esistenti) {
    const f = finestraAttiva(altro);
    if (siSovrappongono(da, a, f.da, f.a)) attivi.push(altro);
    else if (siSovrappongono(da, a, f.a, f.totaleA)) durantePosa.push(altro);
  }
  return { attivi, durantePosa, nessuno: attivi.length === 0 };
}

/**
 * Orari liberi della giornata per una durata data.
 * Ogni voce: { ora, libero, durantePosa, cliente }
 */
export async function orariLiberi(data, durata, { escludiId = null, includiOccupati = false } = {}) {
  const agenda = cfg.get('agenda');
  const passo = agenda.passoMinuti || 15;
  const inizioGiornata = minutiDaHHMM(agenda.oraInizio);
  const fineGiornata = minutiDaHHMM(agenda.oraFine);

  const esistenti = (await appuntamentiDelGiorno(data))
    .filter(a => a.id !== escludiId && a.stato !== 'annullato');
  const finestre = esistenti.map(a => ({ app: a, ...finestraAttiva(a) }));

  const oggi = dayKey(new Date()) === dayKey(data);
  const adesso = new Date();
  const minutiOra = adesso.getHours() * 60 + adesso.getMinutes();

  const risultato = [];
  for (let t = inizioGiornata; t + Number(durata) <= fineGiornata; t += passo) {
    if (oggi && t < minutiOra - passo) continue;   // niente orari già passati

    const fine = t + Number(durata);
    const conflitto = finestre.find(f => siSovrappongono(t, fine, f.da, f.a));
    const inPosa = finestre.find(f => siSovrappongono(t, fine, f.a, f.totaleA));

    const voce = {
      ora: hhmmDaMinuti(t),
      minuti: t,
      libero: !conflitto,
      durantePosa: !conflitto && !!inPosa,
      appuntamentoInPosa: inPosa ? inPosa.app : null,
      conflittoCon: conflitto ? conflitto.app : null
    };
    if (voce.libero || includiOccupati) risultato.push(voce);
  }
  return risultato;
}

/** Il primo orario libero utile: quello che l'app propone già selezionato. */
export async function primoOrarioUtile(data, durata) {
  const liberi = await orariLiberi(data, durata);
  return liberi.find(s => s.libero && !s.durantePosa) || liberi[0] || null;
}

/* ---------- promemoria ---------- */

/** Appuntamenti di domani per cui va inviato il promemoria WhatsApp. */
export async function promemoriaDaInviare(data = addDays(new Date(), 1)) {
  const appuntamenti = await appuntamentiDelGiorno(data);
  const adesso = isoLocale(new Date());
  const risultato = [];
  for (const a of appuntamenti) {
    if (a.stato === 'annullato' || a.promemoriaInviato) continue;
    if (a.inizio <= adesso) continue;   // avvisare per un appuntamento già passato non serve
    const cliente = await leggiCliente(a.clienteId);
    if (!cliente || !cliente.promemoriaAttivo) continue;
    if (!cliente.telefono) continue;
    risultato.push({ appuntamento: a, cliente });
  }
  return risultato;
}

/* ---------- riepiloghi ---------- */

export async function riepilogoGiorno(data) {
  const appuntamenti = (await appuntamentiDelGiorno(data)).filter(a => a.stato !== 'annullato');
  const conclusi = appuntamenti.filter(a => a.stato === 'concluso');
  return {
    totale: appuntamenti.length,
    conclusi: conclusi.length,
    incassato: conclusi.reduce((s, a) => s + (Number(a.prezzo) || 0), 0),
    previsto: appuntamenti.filter(a => a.stato !== 'assente')
                          .reduce((s, a) => s + (Number(a.prezzo) || 0), 0),
    minutiOccupati: appuntamenti.reduce((s, a) => s + Math.max(0, a.durata - (a.posaMinuti || 0)), 0)
  };
}

/** Appuntamenti con il cliente già risolto: comodo per disegnare l'agenda. */
export async function giornataCompleta(data) {
  const appuntamenti = await appuntamentiDelGiorno(data);
  const clienti = {};
  for (const a of appuntamenti) {
    if (!clienti[a.clienteId]) clienti[a.clienteId] = await leggiCliente(a.clienteId);
  }
  return appuntamenti.map(a => ({ ...a, cliente: clienti[a.clienteId] || null }));
}
