/* Charme — inserimento appuntamento rapido.
   Una schermata sola, pochi tocchi: è il pezzo che si usa con le mani occupate
   e la cliente al telefono. */

import * as store from '../store.js';
import * as cfg from '../impostazioni.js';
import * as wa from '../whatsapp.js';
import * as ui from '../ui.js';
import {
  esc, dayKey, fromDayKey, addDays, dataEstesa, GIORNI_BREVI, MESI_BREVI,
  euro, durataUmana, nomeCompleto, iniziali, tempoFa, telefonoLeggibile,
  debounce, isToday, daIsoLocale, ora as oraDi
} from '../util.js';

let listino = null;   // caricato una volta e riusato

export async function apri({ data = new Date(), oraSuggerita = null, appuntamento = null, cliente = null } = {}) {
  listino = await store.listinoPerCategoria();
  const valuta = cfg.get('incassi').valuta;
  const modifica = !!appuntamento;

  const stato = {
    cliente: cliente || null,
    servizi: [],
    data: appuntamento ? fromDayKey(appuntamento.giorno) : new Date(data),
    ora: appuntamento ? appuntamento.inizio.slice(11) : oraSuggerita,
    durataManuale: null,
    prezzoManuale: null,
    note: appuntamento ? appuntamento.note : ''
  };

  if (appuntamento) {
    stato.cliente = await store.leggiCliente(appuntamento.clienteId);
    const tutti = await store.elencoServizi();
    stato.servizi = (appuntamento.servizi || []).map(s =>
      tutti.find(x => x.id === s.servizioId) ||
      { id: s.servizioId, nome: s.nome, durata: s.durata, prezzo: s.prezzo, posaMinuti: s.posaMinuti || 0 }
    );
    const sommaDurata = stato.servizi.reduce((t, s) => t + s.durata, 0);
    const sommaPrezzo = stato.servizi.reduce((t, s) => t + s.prezzo, 0);
    if (appuntamento.durata !== sommaDurata) stato.durataManuale = appuntamento.durata;
    if (appuntamento.prezzo !== sommaPrezzo) stato.prezzoManuale = appuntamento.prezzo;
  }

  const p = ui.pannello({
    titolo: modifica ? 'Modifica appuntamento' : 'Nuovo appuntamento',
    ampio: true,
    contenuto: '<div id="rapido"></div>',
    azioni: `
      <div id="riepilogo-rapido" style="margin-right:auto;font-size:13.5px;color:var(--bruno-tenue)"></div>
      <button class="btn btn--fantasma" data-azione="annulla">Annulla</button>
      <button class="btn btn--principale" data-azione="salva" disabled>${modifica ? 'Salva modifiche' : 'Salva appuntamento'}</button>
    `
  });

  const radice = p.elemento.querySelector('#rapido');
  const btnSalva = p.elemento.querySelector('[data-azione="salva"]');
  const riepilogo = p.elemento.querySelector('#riepilogo-rapido');
  p.elemento.querySelector('[data-azione="annulla"]').addEventListener('click', () => p.chiudi());

  const durata = () => stato.durataManuale != null
    ? stato.durataManuale
    : (stato.servizi.reduce((t, s) => t + s.durata, 0) || cfg.get('agenda').durataPredefinita);
  const prezzo = () => stato.prezzoManuale != null
    ? stato.prezzoManuale
    : stato.servizi.reduce((t, s) => t + s.prezzo, 0);
  const posa = () => stato.servizi.reduce((t, s) => t + (s.posaMinuti || 0), 0);

  /* ---------------- struttura ---------------- */

  radice.innerHTML = `
   <div class="rapido">
    <div class="rapido__col rapido__col--sinistra">
    <!-- 1. cliente -->
    <div class="passo">
      <div class="passo__titolo"><span class="passo__numero">1</span> Cliente
        <button class="btn btn--fantasma btn--piccolo passo__coda" id="btn-nuova-al-volo" type="button">+ Nuova cliente</button>
      </div>
      <div id="zona-cliente"></div>
    </div>

    <!-- 2. servizi -->
    <div class="passo">
      <div class="passo__titolo"><span class="passo__numero">2</span> Servizi
        <span class="passo__coda testo-tenue" id="etichetta-servizi"></span>
      </div>
      <div id="zona-servizi"></div>
    </div>

    </div><!-- /colonna sinistra -->

    <div class="rapido__col rapido__col--destra">
    <!-- 3. quando -->
    <div class="passo">
      <div class="passo__titolo"><span class="passo__numero">3</span> Quando</div>
      <div class="selettore-giorni" id="zona-giorni"></div>
      <div style="margin-top:12px" id="zona-orari"></div>
    </div>

    <div class="passo" id="zona-avvisi"></div>

    <details class="passo" id="dettagli-extra">
      <summary style="cursor:pointer;font-size:13.5px;color:var(--bruno-tenue);padding:8px 0;min-height:40px">
        Regola durata, prezzo o aggiungi una nota
      </summary>
      <div style="padding-top:12px">
        <div class="riga-campi--tre riga-campi">
          <div class="campo">
            <label class="campo__etichetta" for="ex-durata">Durata (minuti)</label>
            <input class="input" id="ex-durata" type="number" min="5" step="5" inputmode="numeric">
          </div>
          <div class="campo">
            <label class="campo__etichetta" for="ex-prezzo">Prezzo (${esc(valuta)})</label>
            <input class="input" id="ex-prezzo" type="number" min="0" step="0.5" inputmode="decimal">
          </div>
          <div class="campo">
            <label class="campo__etichetta" for="ex-posa">Di cui posa</label>
            <input class="input" id="ex-posa" type="number" min="0" step="5" inputmode="numeric" disabled>
          </div>
        </div>
        <div class="campo" style="margin-bottom:0">
          <label class="campo__etichetta" for="ex-note">Nota per questo appuntamento</label>
          <textarea class="area" id="ex-note" placeholder="Es. vuole provare un tono più caldo" style="min-height:70px"></textarea>
        </div>
      </div>
    </details>
    </div><!-- /colonna destra -->
   </div>
  `;

  /* ---------------- 1. cliente ---------------- */

  const zonaCliente = radice.querySelector('#zona-cliente');

  function disegnaCliente() {
    if (stato.cliente) {
      const c = stato.cliente;
      zonaCliente.innerHTML = `
        <div class="cliente-scelto">
          <div class="pastiglia">${esc(iniziali(c.nome, c.cognome))}</div>
          <div style="min-width:0;flex:1">
            <div class="cliente-scelto__nome">${esc(nomeCompleto(c))}</div>
            <div class="testo-tenue">${c.telefono ? esc(telefonoLeggibile(c.telefono)) : 'nessun numero di telefono'}</div>
          </div>
          <button class="btn btn--fantasma btn--piccolo" id="cambia-cliente" type="button">Cambia</button>
        </div>
        ${c.allergie ? `<div class="riquadro-allergie" style="margin-top:10px"><span>⚠</span><div><strong>Attenzione</strong>${esc(c.allergie)}</div></div>` : ''}
      `;
      zonaCliente.querySelector('#cambia-cliente').addEventListener('click', () => {
        stato.cliente = null; disegnaCliente(); aggiorna();
      });
    } else {
      zonaCliente.innerHTML = `
        <div class="ricerca-avvolgi">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input class="input" id="cerca-cliente" type="search" placeholder="Scrivi le prime lettere del nome…" autocomplete="off" data-fuoco>
        </div>
        <div class="risultati-clienti" id="risultati"></div>
      `;
      const campo = zonaCliente.querySelector('#cerca-cliente');
      const risultati = zonaCliente.querySelector('#risultati');

      const cerca = async () => {
        const trovate = await store.cercaClienti(campo.value, 25);
        if (!trovate.length) {
          risultati.innerHTML = campo.value.trim()
            ? `<div style="padding:16px;text-align:center">
                 <p class="testo-tenue" style="margin-bottom:10px">Nessuna cliente trovata</p>
                 <button class="btn btn--principale btn--piccolo" id="crea-da-ricerca" type="button">Crea «${esc(campo.value.trim())}»</button>
               </div>`
            : '';
          const crea = risultati.querySelector('#crea-da-ricerca');
          if (crea) crea.addEventListener('click', () => nuovaClienteAlVolo(campo.value.trim()));
          return;
        }
        risultati.innerHTML = trovate.map(c => `
          <div class="riga-cliente" data-id="${esc(c.id)}">
            <div class="pastiglia">${esc(iniziali(c.nome, c.cognome))}</div>
            <div style="min-width:0">
              <div class="riga-cliente__nome">${esc(nomeCompleto(c))}</div>
              <div class="riga-cliente__dettaglio">${c.telefono ? esc(telefonoLeggibile(c.telefono)) : '—'}</div>
            </div>
          </div>`).join('');
      };

      campo.addEventListener('input', debounce(cerca, 120));
      campo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const prima = risultati.querySelector('.riga-cliente');
          if (prima) prima.click();
        }
      });
      ui.su(risultati, 'click', '.riga-cliente', async (e, el) => {
        stato.cliente = await store.leggiCliente(el.dataset.id);
        disegnaCliente(); aggiorna();
      });
      cerca();
    }
  }

  async function nuovaClienteAlVolo(nomeIniziale = '') {
    const parti = nomeIniziale.split(/\s+/);
    const c = cfg.get('cliente');
    const sotto = ui.pannello({
      titolo: 'Nuova cliente',
      sottotitolo: 'Bastano nome e numero: il resto si completa con calma dopo.',
      contenuto: `
        <div class="riga-campi">
          <div class="campo">
            <label class="campo__etichetta" for="nc-nome">Nome</label>
            <input class="input" id="nc-nome" value="${esc(parti[0] || '')}" data-fuoco autocomplete="off">
          </div>
          <div class="campo">
            <label class="campo__etichetta" for="nc-cognome">Cognome</label>
            <input class="input" id="nc-cognome" value="${esc(parti.slice(1).join(' '))}" autocomplete="off">
          </div>
        </div>
        <div class="campo">
          <label class="campo__etichetta" for="nc-tel">Telefono</label>
          <input class="input" id="nc-tel" type="tel" inputmode="tel" placeholder="333 123 4567" autocomplete="off">
          <p class="campo__aiuto">Serve per i messaggi WhatsApp. Puoi aggiungerlo anche dopo.</p>
        </div>
        <label class="interruttore">
          <input type="checkbox" id="nc-prom" ${cfg.get('messaggi').promemoriaAttivoPerNuove ? 'checked' : ''}>
          <span class="interruttore__leva"></span>
          <span class="interruttore__testo">Promemoria WhatsApp il giorno prima
            <small>Si può cambiare in qualsiasi momento dalla sua scheda</small></span>
        </label>
      `,
      azioni: `<button class="btn btn--fantasma" data-x="no">Annulla</button>
               <button class="btn btn--principale" data-x="si">Crea e continua</button>`
    });

    sotto.elemento.querySelector('[data-x="no"]').addEventListener('click', () => sotto.chiudi());
    sotto.elemento.querySelector('[data-x="si"]').addEventListener('click', async () => {
      const nome = sotto.elemento.querySelector('#nc-nome').value.trim();
      if (!nome) { ui.errore('Il nome è obbligatorio'); return; }
      const tel = sotto.elemento.querySelector('#nc-tel').value.trim();
      if (c.richiediTelefono && !tel) {
        const senza = await ui.conferma({
          titolo: 'Salvare senza numero?',
          testo: 'Senza telefono non potrai inviarle conferme né promemoria su WhatsApp.',
          confermaTesto: 'Salva comunque'
        });
        if (!senza) return;
      }
      stato.cliente = await store.salvaCliente({
        nome,
        cognome: sotto.elemento.querySelector('#nc-cognome').value.trim(),
        telefono: tel,
        promemoriaAttivo: sotto.elemento.querySelector('#nc-prom').checked
      });
      sotto.chiudi();
      ui.ok(`${stato.cliente.nome} aggiunta`);
      setTimeout(() => { disegnaCliente(); aggiorna(); }, 60);
    });
  }

  radice.querySelector('#btn-nuova-al-volo').addEventListener('click', () => nuovaClienteAlVolo());

  /* ---------------- 2. servizi ---------------- */

  const zonaServizi = radice.querySelector('#zona-servizi');

  function chip(s, colore) {
    const scelto = stato.servizi.some(x => x.id === s.id);
    return `<button class="chip${scelto ? ' is-scelto' : ''}" data-servizio="${esc(s.id)}" type="button">
      <span class="chip__punto" style="background:${esc(colore)}"></span>
      ${esc(s.nome)}
      <span class="chip__meta">${s.durata}′ · ${euro(s.prezzo, valuta)}</span>
    </button>`;
  }

  function disegnaServizi() {
    const scorrimento = zonaServizi.scrollTop;   // non far saltare la lista sotto le dita
    const coloreDi = (id) => {
      const g = listino.gruppi.find(x => x.categoria.id === id);
      return g ? g.categoria.colore : '#9A8E80';
    };
    let html = '';
    if (listino.preferiti.length) {
      html += `<div class="gruppo-listino">
        <div class="gruppo-listino__titolo">★ Più usati</div>
        <div class="chip-servizi">${listino.preferiti.map(s => chip(s, coloreDi(s.categoriaId))).join('')}</div>
      </div>`;
    }
    for (const g of listino.gruppi) {
      const restanti = g.servizi.filter(s => !s.preferito);
      if (!restanti.length) continue;
      html += `<div class="gruppo-listino">
        <div class="gruppo-listino__titolo">
          <span class="punto-colore" style="background:${esc(g.categoria.colore)}"></span>${esc(g.categoria.nome)}
        </div>
        <div class="chip-servizi">${restanti.map(s => chip(s, g.categoria.colore)).join('')}</div>
      </div>`;
    }
    if (!html) {
      html = ui.statoVuoto({
        titolo: 'Il listino è vuoto',
        testo: 'Aggiungi i servizi dalle impostazioni per poterli selezionare qui.'
      });
    }
    zonaServizi.innerHTML = html;
    zonaServizi.scrollTop = scorrimento;
  }

  ui.su(zonaServizi, 'click', '[data-servizio]', async (e, el) => {
    const id = el.dataset.servizio;
    const tutti = await store.elencoServizi();
    const s = tutti.find(x => x.id === id);
    if (!s) return;
    const i = stato.servizi.findIndex(x => x.id === id);
    if (i >= 0) stato.servizi.splice(i, 1); else stato.servizi.push(s);
    stato.durataManuale = null; stato.prezzoManuale = null;
    disegnaServizi(); aggiorna(true);
  });

  /* ---------------- 3. quando ---------------- */

  const zonaGiorni = radice.querySelector('#zona-giorni');
  const zonaOrari = radice.querySelector('#zona-orari');

  function disegnaGiorni() {
    const oggi = new Date();
    const giorni = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(oggi, i);
      giorni.push({
        data: d,
        etichetta: i === 0 ? 'Oggi' : i === 1 ? 'Domani' : `${GIORNI_BREVI[d.getDay()]}`,
        sotto: `${d.getDate()} ${MESI_BREVI[d.getMonth()]}`
      });
    }
    const scelto = dayKey(stato.data);
    const fuoriElenco = !giorni.some(g => dayKey(g.data) === scelto);

    zonaGiorni.innerHTML = giorni.map(g => `
      <button class="giorno-btn${dayKey(g.data) === scelto ? ' is-scelto' : ''}" data-giorno="${dayKey(g.data)}" type="button">
        <strong>${esc(g.etichetta)}</strong><span>${esc(g.sotto)}</span>
      </button>`).join('') + `
      <label class="giorno-btn${fuoriElenco ? ' is-scelto' : ''}" style="display:flex;flex-direction:column;justify-content:center;position:relative">
        <strong>📅</strong><span>${fuoriElenco ? esc(`${stato.data.getDate()} ${MESI_BREVI[stato.data.getMonth()]}`) : 'altra data'}</span>
        <input type="date" id="data-libera" value="${dayKey(stato.data)}"
               style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%">
      </label>`;

    zonaGiorni.querySelectorAll('[data-giorno]').forEach(b => b.addEventListener('click', () => {
      stato.data = fromDayKey(b.dataset.giorno); stato.ora = null;
      disegnaGiorni(); aggiorna(true);
    }));
    zonaGiorni.querySelector('#data-libera').addEventListener('change', (e) => {
      if (!e.target.value) return;
      stato.data = fromDayKey(e.target.value); stato.ora = null;
      disegnaGiorni(); aggiorna(true);
    });
  }

  async function disegnaOrari() {
    const d = durata();
    const slot = await store.orariLiberi(stato.data, d, { escludiId: appuntamento ? appuntamento.id : null });
    const scelotFuoriFascia = stato.ora && !slot.some(s => s.ora === stato.ora);

    if (!slot.length) {
      zonaOrari.innerHTML = `<div class="avviso-riquadro avviso-riquadro--attenzione">
        <span>⚠</span><div><strong>Nessun orario libero</strong>
        La giornata è piena per una durata di ${durataUmana(d)}. Puoi scegliere un altro giorno,
        oppure indicare l'orario a mano qui sotto.</div></div>
        <div style="margin-top:11px;display:flex;gap:10px;align-items:center">
          <input class="input" id="ora-manuale" type="time" step="300" style="max-width:170px" value="${esc(stato.ora || '')}">
          <span class="testo-tenue">orario libero</span>
        </div>`;
    } else {
      // Si propone un orario solo se non ne è ancora stato scelto uno.
      // Un orario indicato a mano non viene mai sostituito d'ufficio, nemmeno
      // se è occupato: l'avviso lo segnala, la decisione resta sua.
      if (!stato.ora) {
        const primo = slot.find(s => !s.durantePosa) || slot[0];
        stato.ora = primo ? primo.ora : null;
      }
      zonaOrari.innerHTML = `
        <div class="griglia-orari">
          ${slot.map(s => `
            <button class="ora-btn${s.ora === stato.ora ? ' is-scelto' : ''}${s.durantePosa ? ' is-posa' : ''}"
                    data-ora="${s.ora}" type="button"
                    title="${s.durantePosa ? 'Durante la posa di ' + esc(nomeCliente(s.appuntamentoInPosa)) : 'Libero'}">
              ${s.ora}${s.durantePosa ? '<small>in posa</small>' : ''}
            </button>`).join('')}
        </div>
        <div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <span class="testo-tenue">${scelotFuoriFascia ? 'Orario scelto a mano:' : 'Oppure a mano:'}</span>
          <input class="input" id="ora-manuale" type="time" step="300" style="max-width:150px${scelotFuoriFascia ? ';border-color:var(--oro);background:var(--oro-tenue)' : ''}" value="${esc(stato.ora || '')}">
        </div>`;
    }

    zonaOrari.querySelectorAll('[data-ora]').forEach(b => b.addEventListener('click', async () => {
      stato.ora = b.dataset.ora;
      await disegnaOrari();
      await aggiorna();
    }));
    const manuale = zonaOrari.querySelector('#ora-manuale');
    if (manuale) manuale.addEventListener('change', async (e) => {
      if (!e.target.value) return;
      stato.ora = e.target.value;
      await disegnaOrari();
      await aggiorna();
    });
  }

  function nomeCliente(app) {
    return app && app.cliente ? nomeCompleto(app.cliente) : 'un\'altra cliente';
  }

  /* ---------------- avvisi, riepilogo, salvataggio ---------------- */

  const zonaAvvisi = radice.querySelector('#zona-avvisi');

  async function aggiornaAvvisi() {
    zonaAvvisi.innerHTML = '';
    if (!stato.ora) return;
    const modo = cfg.get('agenda').avvisoSovrapposizione;
    if (modo === 'off') return;

    const inizio = `${dayKey(stato.data)}T${stato.ora}`;
    const c = await store.verificaConflitti(inizio, durata(), { escludiId: appuntamento ? appuntamento.id : null });

    if (c.attivi.length) {
      const nomi = [];
      for (const a of c.attivi) {
        const cl = await store.leggiCliente(a.clienteId);
        nomi.push(`${cl ? nomeCompleto(cl) : 'una cliente'} alle ${a.inizio.slice(11)}`);
      }
      zonaAvvisi.innerHTML = `<div class="avviso-riquadro">
        <span>⚠</span><div><strong>Si sovrappone a un altro appuntamento</strong>
        ${esc(nomi.join(' · '))}. Puoi salvare comunque se sai di farcela.</div></div>`;
    } else if (c.durantePosa.length) {
      const cl = await store.leggiCliente(c.durantePosa[0].clienteId);
      zonaAvvisi.innerHTML = `<div class="avviso-riquadro avviso-riquadro--info">
        <span>✓</span><div><strong>Cade durante la posa${cl ? ' di ' + esc(nomeCompleto(cl)) : ''}</strong>
        Perfetto: in quel tempo sei libera.</div></div>`;
    }
  }

  function aggiornaExtra() {
    radice.querySelector('#ex-durata').value = durata();
    radice.querySelector('#ex-prezzo').value = prezzo();
    radice.querySelector('#ex-posa').value = posa();
    radice.querySelector('#ex-note').value = stato.note || '';
  }

  radice.querySelector('#ex-durata').addEventListener('change', (e) => {
    const v = Number(e.target.value);
    stato.durataManuale = v > 0 ? v : null;
    aggiorna(true);
  });
  radice.querySelector('#ex-prezzo').addEventListener('change', (e) => {
    stato.prezzoManuale = e.target.value === '' ? null : Number(e.target.value);
    aggiorna();
  });
  radice.querySelector('#ex-note').addEventListener('input', (e) => { stato.note = e.target.value; });

  async function aggiorna(ridisegnaOrari = false) {
    radice.querySelector('#etichetta-servizi').textContent = stato.servizi.length
      ? `${durataUmana(durata())} · ${euro(prezzo(), valuta)}`
      : '';
    if (ridisegnaOrari) await disegnaOrari();
    await aggiornaAvvisi();
    aggiornaExtra();

    const pronto = !!(stato.cliente && stato.ora);
    btnSalva.disabled = !pronto;
    riepilogo.innerHTML = pronto
      ? `<strong style="color:var(--bruno);font-size:15px">${esc(nomeCompleto(stato.cliente))}</strong> ·
         ${esc(dataEstesa(stato.data).toLowerCase())} alle ${esc(stato.ora)} ·
         ${durataUmana(durata())} · ${euro(prezzo(), valuta)}`
      : (!stato.cliente ? 'Scegli la cliente per continuare' : 'Scegli un orario');
  }

  btnSalva.addEventListener('click', async () => {
    if (!stato.cliente || !stato.ora) return;
    btnSalva.disabled = true;
    const salvato = await store.salvaAppuntamento({
      id: appuntamento ? appuntamento.id : undefined,
      clienteId: stato.cliente.id,
      inizio: `${dayKey(stato.data)}T${stato.ora}`,
      durata: durata(),
      posaMinuti: posa(),
      prezzo: prezzo(),
      servizi: stato.servizi.map(s => ({
        servizioId: s.id, nome: s.nome, durata: s.durata, prezzo: s.prezzo, posaMinuti: s.posaMinuti || 0
      })),
      note: stato.note,
      stato: appuntamento ? appuntamento.stato : 'previsto',
      confermaInviata: appuntamento ? appuntamento.confermaInviata : null,
      promemoriaInviato: appuntamento ? appuntamento.promemoriaInviato : null,
      creatoIl: appuntamento ? appuntamento.creatoIl : undefined
    });
    p.chiudi();
    if (modifica) ui.ok('Appuntamento aggiornato');
    else setTimeout(() => proponiConferma(salvato, stato.cliente), 240);
  });

  /* ---------------- avvio ---------------- */
  disegnaCliente();
  disegnaServizi();
  disegnaGiorni();
  await disegnaOrari();
  await aggiorna();
}

/* Subito dopo il salvataggio: il messaggio di conferma, pronto da inviare. */
export function proponiConferma(appuntamento, cliente) {
  const testo = wa.testoConferma(cliente, appuntamento);
  const d = daIsoLocale(appuntamento.inizio);
  const senzaNumero = !cliente.telefono;

  const p = ui.pannello({
    titolo: 'Appuntamento salvato',
    sottotitolo: `${nomeCompleto(cliente)} · ${dataEstesa(d).toLowerCase()} alle ${oraDi(d)}`,
    contenuto: senzaNumero
      ? `<div class="avviso-riquadro avviso-riquadro--attenzione">
           <span>⚠</span><div><strong>Manca il numero di ${esc(cliente.nome)}</strong>
           Aggiungilo nella sua scheda per poterle inviare conferme e promemoria.</div></div>`
      : `<p class="testo-tenue" style="margin-bottom:6px">Questo messaggio si aprirà in WhatsApp già scritto. Basterà toccare invia.</p>
         <div class="bolla-anteprima">${esc(testo)}</div>`,
    azioni: senzaNumero
      ? `<button class="btn btn--principale btn--largo" data-x="chiudi">Va bene</button>`
      : `<button class="btn btn--fantasma" data-x="chiudi">Non adesso</button>
         <button class="btn btn--verde" data-x="invia" data-fuoco>Apri WhatsApp</button>`
  });

  p.elemento.querySelector('[data-x="chiudi"]').addEventListener('click', () => p.chiudi());
  const invia = p.elemento.querySelector('[data-x="invia"]');
  if (invia) invia.addEventListener('click', async () => {
    if (wa.apri(cliente, testo)) {
      await store.segnaMessaggioInviato(appuntamento.id, 'conferma');
      ui.ok('WhatsApp aperto: tocca invia');
    } else ui.errore('Numero non valido');
    p.chiudi();
  });
}
