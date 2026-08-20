/* Charme — vista Agenda: la giornata ora per ora. */

import * as store from '../store.js';
import * as cfg from '../impostazioni.js';
import * as wa from '../whatsapp.js';
import * as ui from '../ui.js';
import {
  dataEstesa, ora, euro, esc, addDays, dayKey, isToday, minutiDaHHMM,
  hhmmDaMinuti, durataUmana, nomeCompleto, iniziali, daIsoLocale, telefonoLeggibile
} from '../util.js';

let dataCorrente = new Date();
let apriNuovo = null;      // iniettata da app.js per evitare dipendenze circolari
let apriCliente = null;
let temporizzatoreAdesso = null;

export function inizializza({ suNuovoAppuntamento, suApriCliente }) {
  apriNuovo = suNuovoAppuntamento;
  apriCliente = suApriCliente;

  document.getElementById('giorno-prec').addEventListener('click', () => vaiA(addDays(dataCorrente, -1)));
  document.getElementById('giorno-succ').addEventListener('click', () => vaiA(addDays(dataCorrente, 1)));
  document.getElementById('vai-oggi').addEventListener('click', () => vaiA(new Date()));
  document.getElementById('btn-nuovo').addEventListener('click', () => apriNuovo({ data: dataCorrente }));

  const agenda = document.getElementById('agenda');
  ui.su(agenda, 'click', '.app-blocco', (e, el) => mostraDettaglio(el.dataset.id));
  ui.su(agenda, 'click', '.agenda__vuoto', (e, el) => {
    apriNuovo({ data: dataCorrente, oraSuggerita: el.dataset.ora });
  });

  document.addEventListener('dati:cambiati', () => disegna());
  document.addEventListener('impostazioni:cambiate', () => disegna());
}

export function vaiA(data) {
  dataCorrente = new Date(data);
  return disegna();
}

export function dataVisualizzata() { return new Date(dataCorrente); }

/* ---------- disegno ---------- */

export async function disegna() {
  const agenda = cfg.get('agenda');
  const valuta = cfg.get('incassi').valuta;
  const inizioMin = minutiDaHHMM(agenda.oraInizio);
  const fineMin = minutiDaHHMM(agenda.oraFine);
  const ppm = agenda.densita === 'compatta' ? 1.1 : (agenda.minutiPerPixel || 1.6);

  // intestazione
  const etichetta = document.getElementById('etichetta-giorno');
  etichetta.innerHTML = `${esc(dataEstesa(dataCorrente))}<small>${isToday(dataCorrente) ? 'oggi' : dayKey(dataCorrente).split('-').reverse().join('/')}</small>`;
  document.getElementById('vai-oggi').hidden = isToday(dataCorrente);

  const [appuntamenti, riepilogo] = await Promise.all([
    store.giornataCompleta(dataCorrente),
    store.riepilogoGiorno(dataCorrente)
  ]);

  document.getElementById('riassunto-giorno').innerHTML = `
    <div class="riassunto__voce">
      <div class="riassunto__valore">${riepilogo.totale}</div>
      <div class="riassunto__etichetta">${riepilogo.totale === 1 ? 'cliente' : 'clienti'}</div>
    </div>
    <div class="riassunto__voce">
      <div class="riassunto__valore">${durataUmana(riepilogo.minutiOccupati)}</div>
      <div class="riassunto__etichetta">di lavoro</div>
    </div>
    ${agenda.mostraPrezzi ? `
    <div class="riassunto__voce">
      <div class="riassunto__valore">${euro(riepilogo.previsto, valuta)}</div>
      <div class="riassunto__etichetta">previsto</div>
    </div>` : ''}
  `;

  // griglia
  const altezza = (fineMin - inizioMin) * ppm;
  const contenitore = document.getElementById('agenda');
  const attivi = appuntamenti.filter(a => a.stato !== 'annullato');
  const colonne = disponiInColonne(attivi);

  let html = `<div class="agenda__griglia" style="height:${altezza}px">`;

  // linee orarie e fasce vuote cliccabili
  for (let m = inizioMin; m <= fineMin; m += 30) {
    const y = (m - inizioMin) * ppm;
    const intera = m % 60 === 0;
    html += `<div class="agenda__linea${intera ? '' : ' agenda__linea--mezza'}" style="top:${y}px"></div>`;
    if (m < fineMin) {
      html += `<div class="agenda__ora${intera ? '' : ' agenda__ora--mezza'}" style="top:${y}px">${hhmmDaMinuti(m)}</div>`;
      html += `<div class="agenda__vuoto" data-ora="${hhmmDaMinuti(m)}"
                    style="position:absolute;left:0;right:0;top:${y}px;height:${30 * ppm}px;cursor:pointer"></div>`;
    }
  }

  // riga dell'ora corrente
  if (isToday(dataCorrente)) {
    const adesso = new Date();
    const m = adesso.getHours() * 60 + adesso.getMinutes();
    if (m >= inizioMin && m <= fineMin) {
      html += `<div class="agenda__adesso" style="top:${(m - inizioMin) * ppm}px"></div>`;
    }
  }

  // appuntamenti
  for (const a of attivi) {
    const inizio = minutiDaHHMM(a.inizio.slice(11));
    const top = (inizio - inizioMin) * ppm;
    const alt = Math.max(38, a.durata * ppm - 3);
    const col = colonne.get(a.id) || { indice: 0, totale: 1 };
    const larghezza = 100 / col.totale;
    const sinistra = larghezza * col.indice;
    const corto = alt < 62;
    const colore = a._colore || 'var(--oro)';

    const nome = a.cliente ? nomeCompleto(a.cliente) : 'Cliente eliminata';
    const servizi = (a.servizi || []).map(s => s.nome).join(', ') || 'Appuntamento';
    const posaAlt = a.posaMinuti ? Math.min(alt - 2, a.posaMinuti * ppm) : 0;

    html += `
      <div class="app-blocco${corto ? ' app-blocco--corto' : ''} app-blocco--${esc(a.stato)}"
           data-id="${esc(a.id)}"
           style="top:${top}px;height:${alt}px;left:calc(${sinistra}% + 2px);width:calc(${larghezza}% - 6px);border-left-color:${esc(colore)}">
        ${posaAlt > 8 ? `<div class="app-blocco__posa" style="height:${posaAlt}px"></div>` : ''}
        <div class="app-blocco__ora">${ora(daIsoLocale(a.inizio))}${corto ? '' : ` – ${ora(new Date(daIsoLocale(a.inizio).getTime() + a.durata * 60000))}`}</div>
        <div class="app-blocco__nome">${esc(nome)}</div>
        ${corto ? '' : `<div class="app-blocco__servizi">${esc(servizi)}</div>`}
        ${corto || alt < 96 ? '' : `
          <div class="app-blocco__coda">
            ${agenda.mostraPrezzi && a.prezzo ? `<span class="pillola pillola--oro">${euro(a.prezzo, valuta)}</span>` : ''}
            ${a.posaMinuti ? `<span class="pillola">posa ${a.posaMinuti}′</span>` : ''}
            <span class="segno-invio segno-invio--${a.confermaInviata ? 'ok' : 'no'}"
                  title="${a.confermaInviata ? 'Conferma inviata' : 'Conferma non ancora inviata'}">${a.confermaInviata ? '✓' : '!'}</span>
          </div>`}
      </div>`;
  }

  html += '</div>';

  if (!attivi.length) {
    html += `<div style="position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);text-align:center;pointer-events:none">
      <div style="font-family:var(--serif);font-size:20px;color:var(--bruno-tenue)">Nessun appuntamento</div>
      <div style="font-size:13.5px;color:var(--bruno-tenue);margin-top:5px">Tocca una fascia oraria per fissarne uno</div>
    </div>`;
  }

  contenitore.innerHTML = html;

  // primo disegno: porta in vista l'ora corrente
  if (isToday(dataCorrente) && !contenitore.dataset.giaScorso) {
    const adesso = new Date();
    const m = adesso.getHours() * 60 + adesso.getMinutes();
    const corpo = document.getElementById('corpo-agenda');
    corpo.scrollTop = Math.max(0, (m - inizioMin) * ppm - 160);
    contenitore.dataset.giaScorso = '1';
  }

  clearTimeout(temporizzatoreAdesso);
  temporizzatoreAdesso = setTimeout(() => { if (isToday(dataCorrente)) disegna(); }, 60000);
}

/** Appuntamenti sovrapposti affiancati invece che uno sopra l'altro. */
function disponiInColonne(appuntamenti) {
  const mappa = new Map();
  const ordinati = [...appuntamenti].sort((a, b) => a.inizio.localeCompare(b.inizio));
  let gruppo = [], fineGruppo = -1;

  const chiudi = () => {
    if (!gruppo.length) return;
    const colonne = [];
    for (const a of gruppo) {
      const inizio = minutiDaHHMM(a.inizio.slice(11));
      let posto = colonne.findIndex(c => c <= inizio);
      if (posto === -1) { colonne.push(inizio + a.durata); posto = colonne.length - 1; }
      else colonne[posto] = inizio + a.durata;
      mappa.set(a.id, { indice: posto, totale: 1 });
    }
    for (const a of gruppo) mappa.get(a.id).totale = colonne.length;
    gruppo = []; fineGruppo = -1;
  };

  for (const a of ordinati) {
    const inizio = minutiDaHHMM(a.inizio.slice(11));
    if (gruppo.length && inizio >= fineGruppo) chiudi();
    gruppo.push(a);
    fineGruppo = Math.max(fineGruppo, inizio + a.durata);
  }
  chiudi();
  return mappa;
}

/* ---------- dettaglio appuntamento ---------- */

export async function mostraDettaglio(id) {
  const a = await store.leggiAppuntamento(id);
  if (!a) return;
  const cliente = await store.leggiCliente(a.clienteId);
  const valuta = cfg.get('incassi').valuta;
  const d = daIsoLocale(a.inizio);
  const fine = new Date(d.getTime() + a.durata * 60000);

  const servizi = (a.servizi || []).map(s =>
    `<div class="riga-info">
       <span class="riga-info__etichetta">${esc(s.nome)} · ${durataUmana(s.durata)}</span>
       <span class="riga-info__valore">${euro(s.prezzo, valuta)}</span>
     </div>`).join('') || '<p class="testo-tenue">Nessun servizio indicato</p>';

  const p = ui.pannello({
    titolo: cliente ? nomeCompleto(cliente) : 'Appuntamento',
    sottotitolo: `${dataEstesa(d)} · ${ora(d)}–${ora(fine)}`,
    contenuto: `
      ${cliente && cliente.allergie ? `
        <div class="riquadro-allergie">
          <span>⚠</span><div><strong>Attenzione</strong>${esc(cliente.allergie)}</div>
        </div>` : ''}

      <div class="blocco" style="padding:16px;margin-bottom:14px">
        ${servizi}
        <div class="riga-info" style="border-top:1.5px solid var(--bordo);margin-top:6px;padding-top:11px">
          <span class="riga-info__etichetta"><strong>Totale</strong> · ${durataUmana(a.durata)}${a.posaMinuti ? ` (di cui ${a.posaMinuti}′ di posa)` : ''}</span>
          <span class="riga-info__valore" style="font-size:18px">${euro(a.prezzo, valuta)}</span>
        </div>
      </div>

      ${a.note ? `<div class="campo"><span class="campo__etichetta">Note dell'appuntamento</span><p class="testo-lungo">${esc(a.note)}</p></div>` : ''}

      <div class="campo">
        <span class="campo__etichetta">Stato</span>
        <div class="chip-servizi">
          ${[['previsto','Previsto'],['concluso','Concluso'],['assente','Non venuta'],['annullato','Annullato']]
            .map(([v, t]) => `<button class="chip${a.stato === v ? ' is-scelto' : ''}" data-stato="${v}" type="button">${t}</button>`).join('')}
        </div>
      </div>

      <div class="campo">
        <span class="campo__etichetta">WhatsApp</span>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn ${a.confermaInviata ? 'btn--fantasma' : 'btn--verde'}" data-wa="conferma" type="button">
            ${a.confermaInviata ? '↻ Reinvia conferma' : '✓ Invia conferma'}
          </button>
          <button class="btn btn--fantasma" data-wa="promemoria" type="button">Invia promemoria</button>
        </div>
        ${cliente && !cliente.telefono
          ? '<p class="campo__aiuto" style="color:var(--rosso)">Questa cliente non ha un numero di telefono: aggiungilo nella sua scheda.</p>'
          : `<p class="campo__aiuto">${a.confermaInviata ? 'Conferma già inviata.' : 'Il messaggio si apre in WhatsApp già scritto: basta toccare invia.'}</p>`}
      </div>
    `,
    azioni: `
      <button class="btn btn--fantasma" data-azione="elimina" style="margin-right:auto;color:var(--rosso)">Elimina</button>
      <button class="btn btn--fantasma" data-azione="cliente">Scheda cliente</button>
      <button class="btn btn--principale" data-azione="modifica">Modifica</button>
    `
  });

  p.elemento.querySelectorAll('[data-stato]').forEach(b => b.addEventListener('click', async () => {
    await store.cambiaStato(id, b.dataset.stato);
    ui.ok('Stato aggiornato');
    p.chiudi();
  }));

  p.elemento.querySelectorAll('[data-wa]').forEach(b => b.addEventListener('click', async () => {
    if (!cliente || !cliente.telefono) { ui.errore('Manca il numero di telefono della cliente'); return; }
    const tipo = b.dataset.wa;
    const testo = tipo === 'conferma' ? wa.testoConferma(cliente, a) : wa.testoPromemoria(cliente, a);
    if (wa.apri(cliente, testo)) {
      await store.segnaMessaggioInviato(id, tipo);
      ui.ok('WhatsApp aperto: tocca invia');
      p.chiudi();
    } else ui.errore('Numero non valido');
  }));

  p.elemento.querySelector('[data-azione="elimina"]').addEventListener('click', async () => {
    const sicuro = await ui.conferma({
      titolo: 'Eliminare l\'appuntamento?',
      testo: 'L\'appuntamento sparisce dall\'agenda e dallo storico della cliente. L\'operazione non si può annullare.',
      confermaTesto: 'Elimina', pericolo: true
    });
    if (sicuro) { await store.eliminaAppuntamento(id); ui.ok('Appuntamento eliminato'); p.chiudi(); }
  });

  p.elemento.querySelector('[data-azione="cliente"]').addEventListener('click', () => {
    p.chiudi();
    if (cliente) setTimeout(() => apriCliente(cliente.id), 260);
  });

  p.elemento.querySelector('[data-azione="modifica"]').addEventListener('click', () => {
    p.chiudi();
    setTimeout(() => apriNuovo({ appuntamento: a }), 260);
  });
}
