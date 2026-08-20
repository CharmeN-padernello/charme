/* Charme — vista Clienti: anagrafica, ricerca e scheda con lo storico. */

import * as store from '../store.js';
import * as cfg from '../impostazioni.js';
import * as wa from '../whatsapp.js';
import * as ui from '../ui.js';
import {
  esc, iniziali, nomeCompleto, telefonoLeggibile, tempoFa, euro, durataUmana,
  dataBreve, dataEstesa, daIsoLocale, ora as oraDi, debounce, normalizza
} from '../util.js';

let apriNuovoAppuntamento = null;
let filtro = '';

export function inizializza({ suNuovoAppuntamento }) {
  apriNuovoAppuntamento = suNuovoAppuntamento;

  const ricerca = document.getElementById('ricerca-clienti');
  ricerca.addEventListener('input', debounce(() => { filtro = ricerca.value; disegna(); }, 130));

  document.getElementById('btn-nuova-cliente').addEventListener('click', () => modulo());

  ui.su(document.getElementById('elenco-clienti'), 'click', '.carta-cliente', (e, el) => scheda(el.dataset.id));
  document.addEventListener('dati:cambiati', () => { if (visibile()) disegna(); });
}

function visibile() {
  return document.getElementById('vista-clienti').classList.contains('is-attiva');
}

export async function disegna() {
  const elenco = document.getElementById('elenco-clienti');
  const tutte = await store.elencoClienti();
  const mostrate = filtro.trim() ? await store.cercaClienti(filtro, 200) : tutte;

  document.getElementById('conteggio-clienti').textContent =
    tutte.length === 0 ? 'nessuna cliente ancora'
    : tutte.length === 1 ? '1 cliente' : `${tutte.length} clienti`;

  if (!mostrate.length) {
    elenco.innerHTML = ui.statoVuoto({
      icona: '👤',
      titolo: filtro.trim() ? 'Nessuna cliente trovata' : 'Ancora nessuna cliente',
      testo: filtro.trim()
        ? 'Prova con meno lettere, o con il numero di telefono.'
        : 'Le clienti si aggiungono anche al volo mentre fissi un appuntamento.',
      azione: filtro.trim() ? '' : '<button class="btn btn--principale" id="vuoto-nuova">Aggiungi la prima cliente</button>'
    });
    const b = elenco.querySelector('#vuoto-nuova');
    if (b) b.addEventListener('click', () => modulo());
    return;
  }

  // riepiloghi per mostrare "ultima visita" senza una query per riga
  const storici = new Map();
  for (const c of mostrate.slice(0, 300)) {
    storici.set(c.id, await store.storicoCliente(c.id));
  }

  let html = '';
  let letteraCorrente = '';
  const raggruppa = !filtro.trim();

  for (const c of mostrate) {
    const lettera = (normalizza(nomeCompleto(c))[0] || '#').toUpperCase();
    if (raggruppa && lettera !== letteraCorrente) {
      letteraCorrente = lettera;
      html += `<div class="lettera-gruppo">${esc(lettera)}</div>`;
    }
    const s = storici.get(c.id) || { visite: 0, ultimaVisita: null, prossimo: null };
    html += `
      <div class="carta-cliente" data-id="${esc(c.id)}">
        <div class="pastiglia">${esc(iniziali(c.nome, c.cognome))}</div>
        <div class="carta-cliente__corpo">
          <div class="carta-cliente__nome">${esc(nomeCompleto(c))}</div>
          <div class="carta-cliente__meta">
            ${c.telefono ? `<span>${esc(telefonoLeggibile(c.telefono))}</span>` : '<span style="color:var(--rosso)">senza numero</span>'}
            <span>${s.visite} ${s.visite === 1 ? 'visita' : 'visite'}</span>
            ${s.ultimaVisita ? `<span>ultima ${esc(tempoFa(s.ultimaVisita))}</span>` : ''}
          </div>
        </div>
        <div class="carta-cliente__coda">
          ${s.prossimo
            ? `<span class="pillola pillola--oro">${esc(dataBreve(daIsoLocale(s.prossimo.inizio)))} · ${esc(s.prossimo.inizio.slice(11))}</span>`
            : ''}
          ${c.allergie ? '<span class="pillola pillola--rossa" title="Allergie o sensibilità">⚠</span>' : ''}
          ${!c.promemoriaAttivo ? '<span class="pillola" title="Promemoria WhatsApp disattivato">🔕</span>' : ''}
        </div>
      </div>`;
  }
  elenco.innerHTML = html;
}

/* ---------- scheda cliente ---------- */

export async function scheda(id) {
  const c = await store.leggiCliente(id);
  if (!c) return;
  const s = await store.storicoCliente(id);
  const valuta = cfg.get('incassi').valuta;

  const storico = s.passati.length
    ? s.passati.slice(0, 40).map(a => {
        const d = daIsoLocale(a.inizio);
        const servizi = (a.servizi || []).map(x => x.nome).join(', ') || 'Appuntamento';
        return `<div class="linea-storico">
          <div class="linea-storico__data">${esc(dataBreve(d))}<br><span style="opacity:.65">${esc(oraDi(d))}</span></div>
          <div class="linea-storico__corpo">
            <div class="linea-storico__servizi">${esc(servizi)}</div>
            <div class="linea-storico__note">${durataUmana(a.durata)}${a.stato === 'assente' ? ' · non venuta' : ''}${a.note ? ' · ' + esc(a.note) : ''}</div>
          </div>
          <div class="linea-storico__prezzo">${a.stato === 'assente' ? '—' : euro(a.prezzo, valuta)}</div>
        </div>`;
      }).join('')
    : '<p class="testo-tenue" style="padding:14px 0">Nessun appuntamento passato registrato.</p>';

  const prossimi = s.futuri.length
    ? s.futuri.map(a => {
        const d = daIsoLocale(a.inizio);
        return `<div class="linea-storico">
          <div class="linea-storico__data">${esc(dataBreve(d))}<br><span style="opacity:.65">${esc(oraDi(d))}</span></div>
          <div class="linea-storico__corpo">
            <div class="linea-storico__servizi">${esc((a.servizi || []).map(x => x.nome).join(', ') || 'Appuntamento')}</div>
            <div class="linea-storico__note">${a.confermaInviata ? '✓ conferma inviata' : 'conferma non ancora inviata'}</div>
          </div>
          <div class="linea-storico__prezzo">${euro(a.prezzo, valuta)}</div>
        </div>`;
      }).join('')
    : '';

  const p = ui.pannello({
    titolo: nomeCompleto(c),
    sottotitolo: c.telefono ? telefonoLeggibile(c.telefono) : 'nessun numero di telefono',
    ampio: true,
    contenuto: `
      <div class="scheda-testa">
        <div class="pastiglia pastiglia--grande">${esc(iniziali(c.nome, c.cognome))}</div>
        <div style="flex:1;min-width:0">
          <div class="testo-tenue">
            ${s.ultimaVisita ? `Ultima visita ${esc(tempoFa(s.ultimaVisita))}` : 'Non è ancora venuta'}
            ${c.promemoriaAttivo ? '' : ' · promemoria disattivato'}
          </div>
        </div>
        <button class="btn btn--principale" data-x="appuntamento">+ Appuntamento</button>
      </div>

      ${c.allergie ? `<div class="riquadro-allergie"><span>⚠</span><div><strong>Allergie e sensibilità</strong>${esc(c.allergie)}</div></div>` : ''}

      <div class="scheda-statistiche">
        <div class="statistica"><div class="statistica__valore">${s.visite}</div><div class="statistica__etichetta">visite</div></div>
        <div class="statistica"><div class="statistica__valore">${euro(s.totaleSpeso, valuta)}</div><div class="statistica__etichetta">totale</div></div>
        <div class="statistica"><div class="statistica__valore">${euro(s.scontrinoMedio, valuta)}</div><div class="statistica__etichetta">media</div></div>
        <div class="statistica"><div class="statistica__valore">${s.futuri.length}</div><div class="statistica__etichetta">in programma</div></div>
      </div>

      ${c.note ? `<div class="blocco" style="padding:15px;margin-bottom:15px">
        <div class="blocco__titolo" style="font-size:15px;margin-bottom:6px">Note</div>
        <p class="testo-lungo" style="font-size:14.5px">${esc(c.note)}</p></div>` : ''}

      ${prossimi ? `<h3 style="font-size:16px;margin:18px 0 4px">Prossimi appuntamenti</h3>${prossimi}` : ''}

      <h3 style="font-size:16px;margin:20px 0 4px">Storico</h3>
      ${storico}
    `,
    azioni: `
      <button class="btn btn--fantasma" data-x="elimina" style="margin-right:auto;color:var(--rosso)">Elimina</button>
      ${c.telefono ? '<button class="btn btn--fantasma" data-x="whatsapp">WhatsApp</button>' : ''}
      <button class="btn btn--principale" data-x="modifica">Modifica</button>
    `
  });

  p.elemento.querySelector('[data-x="appuntamento"]').addEventListener('click', () => {
    p.chiudi();
    setTimeout(() => apriNuovoAppuntamento({ cliente: c }), 250);
  });

  p.elemento.querySelector('[data-x="modifica"]').addEventListener('click', () => {
    p.chiudi();
    setTimeout(() => modulo(c), 250);
  });

  const btnWa = p.elemento.querySelector('[data-x="whatsapp"]');
  if (btnWa) btnWa.addEventListener('click', () => {
    const link = wa.linkWhatsApp(c.telefono, '');
    if (link) window.open(link, '_blank', 'noopener'); else ui.errore('Numero non valido');
  });

  p.elemento.querySelector('[data-x="elimina"]').addEventListener('click', async () => {
    const sicuro = await ui.conferma({
      titolo: `Eliminare ${nomeCompleto(c)}?`,
      testo: `Verranno eliminati anche i suoi ${s.tutti.length} appuntamenti e tutto lo storico. L'operazione non si può annullare.`,
      confermaTesto: 'Elimina definitivamente', pericolo: true
    });
    if (!sicuro) return;
    await store.eliminaCliente(id);
    ui.ok('Cliente eliminata');
    p.chiudi();
    document.dispatchEvent(new CustomEvent('dati:cambiati'));
  });
}

/* ---------- modulo nuova / modifica ---------- */

export function modulo(cliente = null) {
  const nuova = !cliente;
  const c = cliente || { nome: '', cognome: '', telefono: '', email: '', note: '', allergie: '',
                         promemoriaAttivo: cfg.get('messaggi').promemoriaAttivoPerNuove };

  const p = ui.pannello({
    titolo: nuova ? 'Nuova cliente' : 'Modifica cliente',
    contenuto: `
      <div class="riga-campi">
        <div class="campo">
          <label class="campo__etichetta" for="f-nome">Nome</label>
          <input class="input" id="f-nome" value="${esc(c.nome)}" data-fuoco autocomplete="off">
        </div>
        <div class="campo">
          <label class="campo__etichetta" for="f-cognome">Cognome</label>
          <input class="input" id="f-cognome" value="${esc(c.cognome)}" autocomplete="off">
        </div>
      </div>
      <div class="riga-campi">
        <div class="campo">
          <label class="campo__etichetta" for="f-tel">Telefono</label>
          <input class="input" id="f-tel" type="tel" inputmode="tel" value="${esc(c.telefono)}" placeholder="333 123 4567" autocomplete="off">
        </div>
        <div class="campo">
          <label class="campo__etichetta" for="f-email">Email <span style="text-transform:none;font-weight:500">(facoltativa)</span></label>
          <input class="input" id="f-email" type="email" value="${esc(c.email || '')}" autocomplete="off">
        </div>
      </div>
      <div class="campo">
        <label class="campo__etichetta" for="f-allergie">Allergie e sensibilità</label>
        <textarea class="area" id="f-allergie" placeholder="Es. reazione all'ammoniaca, cuoio capelluto sensibile" style="min-height:70px">${esc(c.allergie || '')}</textarea>
        <p class="campo__aiuto">Se compilato, compare in rosso in cima alla sua scheda e su ogni appuntamento.</p>
      </div>
      <div class="campo">
        <label class="campo__etichetta" for="f-note">Note</label>
        <textarea class="area" id="f-note" placeholder="Preferenze, abitudini, argomenti di conversazione…">${esc(c.note || '')}</textarea>
      </div>
      <label class="interruttore">
        <input type="checkbox" id="f-prom" ${c.promemoriaAttivo ? 'checked' : ''}>
        <span class="interruttore__leva"></span>
        <span class="interruttore__testo">Promemoria WhatsApp il giorno prima
          <small>Se spento, questa cliente non comparirà nella lista dei promemoria da inviare</small></span>
      </label>
    `,
    azioni: `<button class="btn btn--fantasma" data-x="no">Annulla</button>
             <button class="btn btn--principale" data-x="si">${nuova ? 'Crea cliente' : 'Salva'}</button>`
  });

  p.elemento.querySelector('[data-x="no"]').addEventListener('click', () => p.chiudi());
  p.elemento.querySelector('[data-x="si"]').addEventListener('click', async () => {
    const nome = p.elemento.querySelector('#f-nome').value.trim();
    if (!nome) { ui.errore('Il nome è obbligatorio'); return; }
    await store.salvaCliente({
      id: cliente ? cliente.id : undefined,
      creatoIl: cliente ? cliente.creatoIl : undefined,
      nome,
      cognome: p.elemento.querySelector('#f-cognome').value.trim(),
      telefono: p.elemento.querySelector('#f-tel').value.trim(),
      email: p.elemento.querySelector('#f-email').value.trim(),
      allergie: p.elemento.querySelector('#f-allergie').value.trim(),
      note: p.elemento.querySelector('#f-note').value.trim(),
      promemoriaAttivo: p.elemento.querySelector('#f-prom').checked
    });
    ui.ok(nuova ? 'Cliente aggiunta' : 'Modifiche salvate');
    p.chiudi();
    document.dispatchEvent(new CustomEvent('dati:cambiati'));
  });
}
