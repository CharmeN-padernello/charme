/* Charme — coda dei promemoria WhatsApp.
   Una cliente sotto l'altra: tocca, invia, torna, tocca la successiva. */

import * as store from '../store.js';
import * as cfg from '../impostazioni.js';
import * as wa from '../whatsapp.js';
import * as ui from '../ui.js';
import {
  esc, iniziali, nomeCompleto, telefonoLeggibile, addDays, dayKey,
  dataEstesa, dataBreve, fromDayKey, daIsoLocale, ora as oraDi, durataUmana, euro
} from '../util.js';

let giornoScelto = dayKey(addDays(new Date(), 1));

export function inizializza() {
  const scelta = document.getElementById('giorno-promemoria');
  const oggi = new Date();
  scelta.innerHTML = Array.from({ length: 8 }, (_, i) => {
    const d = addDays(oggi, i);
    const k = dayKey(d);
    const etichetta = i === 0 ? 'Oggi' : i === 1 ? 'Domani' : dataBreve(d);
    return `<option value="${k}">${esc(etichetta)} — ${esc(dataEstesa(d).toLowerCase())}</option>`;
  }).join('');
  scelta.value = giornoScelto;
  scelta.addEventListener('change', () => { giornoScelto = scelta.value; disegna(); });

  ui.su(document.getElementById('elenco-promemoria'), 'click', '[data-invia]', async (e, el) => {
    await invia(el.dataset.invia);
  });
  ui.su(document.getElementById('elenco-promemoria'), 'click', '[data-salta]', async (e, el) => {
    await store.segnaMessaggioInviato(el.dataset.salta, 'promemoria');
    ui.avviso('Segnato come già avvisata');
    disegna();
  });

  document.addEventListener('dati:cambiati', () => aggiornaPallino());
}

async function invia(appuntamentoId) {
  const a = await store.leggiAppuntamento(appuntamentoId);
  if (!a) return;
  const cliente = await store.leggiCliente(a.clienteId);
  if (!cliente || !cliente.telefono) { ui.errore('Manca il numero di telefono'); return; }
  const testo = wa.testoPromemoria(cliente, a);
  if (wa.apri(cliente, testo)) {
    await store.segnaMessaggioInviato(appuntamentoId, 'promemoria');
    ui.ok(`WhatsApp aperto per ${cliente.nome}: tocca invia`);
    disegna();
  } else ui.errore('Numero non valido');
}

export async function disegna() {
  const elenco = document.getElementById('elenco-promemoria');
  const data = fromDayKey(giornoScelto);
  const valuta = cfg.get('incassi').valuta;

  const appuntamenti = (await store.giornataCompleta(data)).filter(a => a.stato !== 'annullato');
  const daInviare = [], gia = [], esclusi = [];

  for (const a of appuntamenti) {
    const c = a.cliente;
    if (!c) continue;
    if (!c.promemoriaAttivo) { esclusi.push({ a, c, motivo: 'promemoria disattivato nella sua scheda' }); continue; }
    if (!c.telefono) { esclusi.push({ a, c, motivo: 'manca il numero di telefono' }); continue; }
    (a.promemoriaInviato ? gia : daInviare).push({ a, c });
  }

  document.getElementById('sottotitolo-promemoria').textContent =
    daInviare.length === 0
      ? (appuntamenti.length ? 'tutti i promemoria di questa giornata sono a posto' : 'nessun appuntamento in questa giornata')
      : `${daInviare.length} ${daInviare.length === 1 ? 'messaggio da inviare' : 'messaggi da inviare'}`;

  const carta = ({ a, c }, inviato) => {
    const d = daIsoLocale(a.inizio);
    const testo = wa.testoPromemoria(c, a);
    return `
      <div class="carta-promemoria${inviato ? ' carta-promemoria--inviato' : ''}">
        <div class="pastiglia">${esc(iniziali(c.nome, c.cognome))}</div>
        <div class="carta-promemoria__corpo">
          <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
            <strong style="font-size:16.5px">${esc(nomeCompleto(c))}</strong>
            <span class="pillola pillola--oro">${esc(oraDi(d))}</span>
            <span class="testo-tenue">${esc((a.servizi || []).map(s => s.nome).join(', ') || 'appuntamento')} · ${durataUmana(a.durata)}</span>
          </div>
          <div class="testo-tenue" style="margin-top:2px">${esc(telefonoLeggibile(c.telefono))}</div>
          ${inviato ? '' : `<div class="anteprima-messaggio">${esc(testo)}</div>`}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0">
          ${inviato
            ? '<span class="pillola pillola--verde">✓ inviato</span>'
            : `<button class="btn btn--verde" data-invia="${esc(a.id)}" type="button">Apri WhatsApp</button>
               <button class="btn btn--fantasma btn--piccolo" data-salta="${esc(a.id)}" type="button">Già avvisata</button>`}
        </div>
      </div>`;
  };

  let html = '';

  if (daInviare.length) {
    html += `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
      <h3 style="font-size:17px">Da inviare</h3>
      <span class="pillola pillola--rossa">${daInviare.length}</span>
      <span class="testo-tenue">Ogni messaggio si apre in WhatsApp già scritto: tocca invia e torna qui.</span>
    </div>`;
    html += daInviare.map(x => carta(x, false)).join('');
  } else if (appuntamenti.length) {
    html += `<div class="avviso-riquadro avviso-riquadro--info" style="margin-bottom:18px">
      <span>✓</span><div><strong>Tutto a posto</strong>
      Non ci sono promemoria in sospeso per ${esc(dataEstesa(data).toLowerCase())}.</div></div>`;
  } else {
    html += ui.statoVuoto({
      icona: '💬',
      titolo: 'Nessun appuntamento',
      testo: `Per ${dataEstesa(data).toLowerCase()} non c'è niente in agenda.`
    });
  }

  if (gia.length) {
    html += `<h3 style="font-size:17px;margin:26px 0 12px">Già inviati</h3>`;
    html += gia.map(x => carta(x, true)).join('');
  }

  if (esclusi.length) {
    html += `<h3 style="font-size:17px;margin:26px 0 8px">Non ricevono il promemoria</h3>`;
    html += esclusi.map(({ a, c, motivo }) => `
      <div class="carta-promemoria" style="opacity:.62">
        <div class="pastiglia">${esc(iniziali(c.nome, c.cognome))}</div>
        <div class="carta-promemoria__corpo">
          <strong style="font-size:15.5px">${esc(nomeCompleto(c))}</strong>
          <span class="pillola" style="margin-left:8px">${esc(a.inizio.slice(11))}</span>
          <div class="testo-tenue" style="margin-top:2px">${esc(motivo)}</div>
        </div>
      </div>`).join('');
  }

  elenco.innerHTML = html;
  aggiornaPallino();
}

/** Numero rosso sulla voce di menu: quanti promemoria mancano per domani. */
export async function aggiornaPallino() {
  // Solo il giorno dopo: è la scelta fatta in fase di progetto.
  // Gli appuntamenti di oggi restano consultabili cambiando giorno nel menu.
  const domani = await store.promemoriaDaInviare(addDays(new Date(), 1));
  const totale = domani.length;
  const pallino = document.getElementById('pallino-promemoria');
  pallino.hidden = totale === 0;
  pallino.textContent = totale > 99 ? '99+' : totale;
  return totale;
}

export function vaiADomani() {
  giornoScelto = dayKey(addDays(new Date(), 1));
  const scelta = document.getElementById('giorno-promemoria');
  if (scelta) scelta.value = giornoScelto;
}
