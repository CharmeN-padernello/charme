/* Charme — impostazioni.
   Ogni valore modificabile dell'app vive qui. Niente è scritto nel codice. */

import * as db from '../db.js';
import * as store from '../store.js';
import * as cfg from '../impostazioni.js';
import * as wa from '../whatsapp.js';
import * as ui from '../ui.js';
import { esc, euro, durataUmana, scaricaFile, nomeFileConData, dataNumerica, ora as oraDi } from '../util.js';

export const VERSIONE_APP = '1.0.0';

const SEZIONI = [
  { id: 'negozio',   emoji: '🏪', titolo: 'Negozio' },
  { id: 'listino',   emoji: '✂️', titolo: 'Listino servizi' },
  { id: 'messaggi',  emoji: '💬', titolo: 'Messaggi WhatsApp' },
  { id: 'agenda',    emoji: '📅', titolo: 'Agenda' },
  { id: 'cliente',   emoji: '👤', titolo: 'Scheda cliente' },
  { id: 'colore',    emoji: '🎨', titolo: 'Colore e formule' },
  { id: 'incassi',   emoji: '💶', titolo: 'Incassi' },
  { id: 'backup',    emoji: '💾', titolo: 'Backup' },
  { id: 'sistema',   emoji: '🔧', titolo: 'Sistema' }
];

let sezioneAttiva = 'negozio';
let alCambioListino = null;

export function inizializza({ suListinoCambiato } = {}) {
  alCambioListino = suListinoCambiato;
  const menu = document.getElementById('menu-impostazioni');
  menu.innerHTML = SEZIONI.map(s => `
    <button class="impostazioni__voce${s.id === sezioneAttiva ? ' is-attiva' : ''}" data-sezione="${s.id}" type="button">
      <span class="emoji">${s.emoji}</span>${esc(s.titolo)}
    </button>`).join('');

  ui.su(menu, 'click', '[data-sezione]', (e, el) => {
    sezioneAttiva = el.dataset.sezione;
    menu.querySelectorAll('.impostazioni__voce').forEach(b =>
      b.classList.toggle('is-attiva', b.dataset.sezione === sezioneAttiva));
    disegna();
  });
}

export async function disegna() {
  const pannello = document.getElementById('pannello-impostazioni');
  const disegnatori = {
    negozio: dNegozio, listino: dListino, messaggi: dMessaggi, agenda: dAgenda,
    cliente: dCliente, colore: dColore, incassi: dIncassi, backup: dBackup, sistema: dSistema
  };
  pannello.scrollTop = 0;
  await disegnatori[sezioneAttiva](pannello);
}

/* helper: campo di testo che salva quando perde il fuoco */
function campo(id, etichetta, valore, { tipo = 'text', aiuto = '', segnaposto = '', area = false } = {}) {
  return `<div class="campo">
    <label class="campo__etichetta" for="${id}">${esc(etichetta)}</label>
    ${area
      ? `<textarea class="area" id="${id}" placeholder="${esc(segnaposto)}">${esc(valore || '')}</textarea>`
      : `<input class="input" id="${id}" type="${tipo}" value="${esc(valore == null ? '' : valore)}" placeholder="${esc(segnaposto)}">`}
    ${aiuto ? `<p class="campo__aiuto">${aiuto}</p>` : ''}
  </div>`;
}

function leva(id, etichetta, attivo, sotto = '') {
  return `<label class="interruttore">
    <input type="checkbox" id="${id}" ${attivo ? 'checked' : ''}>
    <span class="interruttore__leva"></span>
    <span class="interruttore__testo">${esc(etichetta)}${sotto ? `<small>${esc(sotto)}</small>` : ''}</span>
  </label>`;
}

function collega(radice, sezione, mappa) {
  for (const [id, chiave] of Object.entries(mappa)) {
    const el = radice.querySelector('#' + id);
    if (!el) continue;
    const evento = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'change';
    el.addEventListener(evento, async () => {
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number') v = v === '' ? null : Number(v);
      await cfg.imposta(sezione, { [chiave]: v });
      ui.ok('Salvato');
    });
  }
}

/* ========================== NEGOZIO ========================== */

async function dNegozio(p) {
  const n = cfg.get('negozio');
  p.innerHTML = `
    <h2>Negozio</h2>
    <p class="testo-tenue">Questi dati compaiono nei messaggi WhatsApp e nelle stampe. Modificarli qui li aggiorna ovunque.</p>
    <div class="blocco">
      ${campo('n-nome', 'Nome del negozio', n.nome)}
      ${campo('n-titolare', 'Titolare', n.titolare)}
      ${campo('n-indirizzo', 'Indirizzo', n.indirizzo)}
      <div class="riga-campi">
        ${campo('n-telefono', 'Telefono', n.telefono, { tipo: 'tel', segnaposto: '0422 000000' })}
        ${campo('n-whatsapp', 'Numero WhatsApp', n.whatsapp, { tipo: 'tel', segnaposto: '333 1234567',
          aiuto: 'Il numero da cui partono i messaggi. Se è lo stesso del telefono, ripetilo qui.' })}
      </div>
      ${campo('n-email', 'Email', n.email, { tipo: 'email' })}
    </div>

    <div class="blocco">
      <h3 class="blocco__titolo">Logo</h3>
      <p class="blocco__nota">Facoltativo. Comparirà nell'intestazione dell'app. Formato quadrato consigliato.</p>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div id="anteprima-logo" style="width:76px;height:76px;border-radius:14px;background:var(--crema);
             display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--bordo)">
          ${n.logo ? `<img src="${esc(n.logo)}" alt="Logo" style="width:100%;height:100%;object-fit:cover">`
                   : '<span style="font-family:var(--serif);font-size:28px;color:var(--oro)">C</span>'}
        </div>
        <label class="btn btn--fantasma">Scegli immagine
          <input type="file" id="n-logo" accept="image/*" hidden>
        </label>
        ${n.logo ? '<button class="btn btn--fantasma" id="n-logo-via">Rimuovi</button>' : ''}
      </div>
    </div>`;

  collega(p, 'negozio', {
    'n-nome': 'nome', 'n-titolare': 'titolare', 'n-indirizzo': 'indirizzo',
    'n-telefono': 'telefono', 'n-whatsapp': 'whatsapp', 'n-email': 'email'
  });

  p.querySelector('#n-logo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await ridimensiona(file, 320);
    await cfg.imposta('negozio', { logo: dataUrl });
    ui.ok('Logo aggiornato');
    disegna();
  });
  const via = p.querySelector('#n-logo-via');
  if (via) via.addEventListener('click', async () => {
    await cfg.imposta('negozio', { logo: null }); ui.ok('Logo rimosso'); disegna();
  });
}

function ridimensiona(file, lato) {
  return new Promise((ok, ko) => {
    const lettore = new FileReader();
    lettore.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const s = Math.min(lato / img.width, lato / img.height, 1);
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        ok(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = ko; img.src = lettore.result;
    };
    lettore.onerror = ko;
    lettore.readAsDataURL(file);
  });
}

/* ========================== LISTINO ========================== */

async function dListino(p) {
  const { gruppi } = await store.listinoPerCategoria();
  const categorie = await store.elencoCategorie();
  const servizi = await store.elencoServizi();
  const valuta = cfg.get('incassi').valuta;
  const esempio = await cfg.listinoEsempioAncoraPresente();

  const perCategoria = categorie.map(c => ({
    categoria: c, servizi: servizi.filter(s => s.categoriaId === c.id)
  }));
  const orfani = servizi.filter(s => !categorie.some(c => c.id === s.categoriaId));
  if (orfani.length) perCategoria.push({ categoria: { id: null, nome: 'Senza categoria', colore: '#9A8E80' }, servizi: orfani });

  p.innerHTML = `
    <h2>Listino servizi</h2>
    <p class="testo-tenue">Durata e prezzo di ogni servizio vengono proposti automaticamente quando fissi un appuntamento, e restano sempre modificabili sul singolo appuntamento.</p>

    ${esempio ? `<div class="avviso-riquadro avviso-riquadro--attenzione" style="max-width:780px;margin-bottom:18px">
      <span>ℹ</span><div><strong>Questo è il listino di esempio</strong>
      Sostituiscilo con quello vero: modifica le voci una a una, oppure esporta il foglio, sistemalo al computer e ricaricalo.</div></div>` : ''}

    <div class="blocco" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <button class="btn btn--principale" id="l-nuovo-servizio">+ Nuovo servizio</button>
      <button class="btn btn--fantasma" id="l-nuova-categoria">+ Categoria</button>
      <div style="flex:1"></div>
      <button class="btn btn--fantasma" id="l-esporta">Esporta foglio</button>
      <label class="btn btn--fantasma">Importa foglio<input type="file" id="l-importa" accept=".csv,text/csv" hidden></label>
      <button class="btn btn--fantasma" id="l-aumenta">Aumento prezzi</button>
    </div>

    ${perCategoria.map(({ categoria, servizi: elenco }) => `
      <div class="blocco">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span class="punto-colore" style="background:${esc(categoria.colore)};width:15px;height:15px"></span>
          <h3 class="blocco__titolo" style="margin:0;flex:1">${esc(categoria.nome)}</h3>
          <span class="testo-tenue">${elenco.length} ${elenco.length === 1 ? 'servizio' : 'servizi'}</span>
          ${categoria.id ? `<button class="btn-icona" data-mod-cat="${esc(categoria.id)}" title="Modifica categoria">✎</button>` : ''}
        </div>
        ${elenco.length ? `
        <table class="tabella">
          <thead><tr><th>Servizio</th><th class="num">Durata</th><th class="num">Posa</th><th class="num">Prezzo</th><th></th></tr></thead>
          <tbody>
            ${elenco.map(s => `
              <tr class="${s.attivo ? '' : 'is-spento'}">
                <td>${s.preferito ? '<span title="Fra i più usati">★</span> ' : ''}${esc(s.nome)}
                    ${s.attivo ? '' : '<span class="pillola" style="margin-left:6px">non attivo</span>'}</td>
                <td class="num">${s.durata}′</td>
                <td class="num">${s.posaMinuti ? s.posaMinuti + '′' : '—'}</td>
                <td class="num">${euro(s.prezzo, valuta)}</td>
                <td class="azioni"><button class="btn-icona" data-mod-srv="${esc(s.id)}" title="Modifica">✎</button></td>
              </tr>`).join('')}
          </tbody>
        </table>` : '<p class="testo-tenue">Nessun servizio in questa categoria.</p>'}
      </div>`).join('')}
  `;

  p.querySelector('#l-nuovo-servizio').addEventListener('click', () => moduloServizio(null, categorie));
  p.querySelector('#l-nuova-categoria').addEventListener('click', () => moduloCategoria(null));
  ui.su(p, 'click', '[data-mod-srv]', (e, el) =>
    moduloServizio(servizi.find(s => s.id === el.dataset.modSrv), categorie));
  ui.su(p, 'click', '[data-mod-cat]', (e, el) =>
    moduloCategoria(categorie.find(c => c.id === el.dataset.modCat)));
  p.querySelector('#l-esporta').addEventListener('click', () => esportaListino(servizi, categorie));
  p.querySelector('#l-importa').addEventListener('change', (e) => importaListino(e.target.files[0]));
  p.querySelector('#l-aumenta').addEventListener('click', () => moduloAumento(categorie));
}

function moduloServizio(servizio, categorie) {
  const nuovo = !servizio;
  const s = servizio || { nome: '', categoriaId: categorie[0] ? categorie[0].id : null,
                          durata: 30, prezzo: 0, posaMinuti: 0, attivo: 1, preferito: 0, note: '' };
  const valuta = cfg.get('incassi').valuta;

  const p = ui.pannello({
    titolo: nuovo ? 'Nuovo servizio' : 'Modifica servizio',
    contenuto: `
      ${campo('s-nome', 'Nome del servizio', s.nome)}
      <div class="campo">
        <label class="campo__etichetta" for="s-cat">Categoria</label>
        <select class="scelta" id="s-cat">
          ${categorie.map(c => `<option value="${esc(c.id)}" ${c.id === s.categoriaId ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
          <option value="" ${!s.categoriaId ? 'selected' : ''}>Senza categoria</option>
        </select>
      </div>
      <div class="riga-campi--tre riga-campi">
        ${campo('s-durata', 'Durata (min)', s.durata, { tipo: 'number' })}
        ${campo('s-posa', 'Di cui posa (min)', s.posaMinuti, { tipo: 'number' })}
        ${campo('s-prezzo', `Prezzo (${valuta})`, s.prezzo, { tipo: 'number' })}
      </div>
      <p class="campo__aiuto" style="margin:-8px 0 16px">
        Il <strong>tempo di posa</strong> è la parte finale del servizio in cui hai le mani libere:
        l'app te la mostra in agenda e ti propone quegli orari per un'altra cliente.
      </p>
      ${leva('s-preferito', 'Fra i più usati', s.preferito, 'Compare in cima nella schermata di inserimento rapido')}
      ${leva('s-attivo', 'Attivo', s.attivo, 'Se spento sparisce dai menu, ma resta negli appuntamenti già registrati')}
    `,
    azioni: `${nuovo ? '' : '<button class="btn btn--fantasma" data-x="del" style="margin-right:auto;color:var(--rosso)">Elimina</button>'}
             <button class="btn btn--fantasma" data-x="no">Annulla</button>
             <button class="btn btn--principale" data-x="si">Salva</button>`
  });

  p.elemento.querySelector('[data-x="no"]').addEventListener('click', () => p.chiudi());
  p.elemento.querySelector('[data-x="si"]').addEventListener('click', async () => {
    const nome = p.elemento.querySelector('#s-nome').value.trim();
    if (!nome) { ui.errore('Il nome è obbligatorio'); return; }
    await store.salvaServizio({
      id: servizio ? servizio.id : undefined,
      ordine: servizio ? servizio.ordine : undefined,
      nome,
      categoriaId: p.elemento.querySelector('#s-cat').value || null,
      durata: Number(p.elemento.querySelector('#s-durata').value),
      posaMinuti: Number(p.elemento.querySelector('#s-posa').value),
      prezzo: Number(p.elemento.querySelector('#s-prezzo').value),
      preferito: p.elemento.querySelector('#s-preferito').checked,
      attivo: p.elemento.querySelector('#s-attivo').checked
    });
    ui.ok('Servizio salvato'); p.chiudi(); disegna(); if (alCambioListino) alCambioListino();
  });
  const del = p.elemento.querySelector('[data-x="del"]');
  if (del) del.addEventListener('click', async () => {
    const sicuro = await ui.conferma({
      titolo: `Eliminare «${servizio.nome}»?`,
      testo: 'Gli appuntamenti già registrati con questo servizio non cambiano: conservano il nome e il prezzo di allora.',
      confermaTesto: 'Elimina', pericolo: true
    });
    if (!sicuro) return;
    await store.eliminaServizio(servizio.id);
    ui.ok('Servizio eliminato'); p.chiudi(); disegna(); if (alCambioListino) alCambioListino();
  });
}

function moduloCategoria(categoria) {
  const nuova = !categoria;
  const c = categoria || { nome: '', colore: '#B08D57' };
  const tavolozza = ['#B08D57','#C98F86','#9B6A7D','#7E9478','#A8743F','#6E8CA0','#9A8E80','#8C6C3C'];

  const p = ui.pannello({
    titolo: nuova ? 'Nuova categoria' : 'Modifica categoria',
    contenuto: `
      ${campo('c-nome', 'Nome', c.nome)}
      <div class="campo">
        <span class="campo__etichetta">Colore in agenda</span>
        <div class="chip-servizi" id="c-colori">
          ${tavolozza.map(col => `<button class="chip${col === c.colore ? ' is-scelto' : ''}" data-colore="${col}" type="button">
            <span class="chip__punto" style="background:${col}"></span>${col === c.colore ? 'scelto' : '&nbsp;&nbsp;'}
          </button>`).join('')}
        </div>
      </div>`,
    azioni: `${nuova ? '' : '<button class="btn btn--fantasma" data-x="del" style="margin-right:auto;color:var(--rosso)">Elimina</button>'}
             <button class="btn btn--fantasma" data-x="no">Annulla</button>
             <button class="btn btn--principale" data-x="si">Salva</button>`
  });

  let colore = c.colore;
  ui.su(p.elemento, 'click', '[data-colore]', (e, el) => {
    colore = el.dataset.colore;
    p.elemento.querySelectorAll('[data-colore]').forEach(b => b.classList.toggle('is-scelto', b.dataset.colore === colore));
  });
  p.elemento.querySelector('[data-x="no"]').addEventListener('click', () => p.chiudi());
  p.elemento.querySelector('[data-x="si"]').addEventListener('click', async () => {
    const nome = p.elemento.querySelector('#c-nome').value.trim();
    if (!nome) { ui.errore('Il nome è obbligatorio'); return; }
    await store.salvaCategoria({ id: categoria ? categoria.id : undefined, ordine: categoria ? categoria.ordine : undefined, nome, colore });
    ui.ok('Categoria salvata'); p.chiudi(); disegna(); if (alCambioListino) alCambioListino();
  });
  const del = p.elemento.querySelector('[data-x="del"]');
  if (del) del.addEventListener('click', async () => {
    const sicuro = await ui.conferma({
      titolo: `Eliminare «${categoria.nome}»?`,
      testo: 'I servizi di questa categoria non vengono eliminati: restano nel listino senza categoria.',
      confermaTesto: 'Elimina', pericolo: true
    });
    if (!sicuro) return;
    await store.eliminaCategoria(categoria.id);
    ui.ok('Categoria eliminata'); p.chiudi(); disegna(); if (alCambioListino) alCambioListino();
  });
}

/* --- foglio del listino (CSV con punto e virgola: si apre in Excel) --- */

function esportaListino(servizi, categorie) {
  const nomeCat = Object.fromEntries(categorie.map(c => [c.id, c.nome]));
  const righe = [['Categoria','Servizio','Durata (min)','Posa (min)','Prezzo','Più usato','Attivo']];
  for (const s of servizi) {
    righe.push([
      nomeCat[s.categoriaId] || '', s.nome, s.durata, s.posaMinuti || 0,
      String(s.prezzo).replace('.', ','), s.preferito ? 'sì' : 'no', s.attivo ? 'sì' : 'no'
    ]);
  }
  const csv = righe.map(r => r.map(v => {
    const t = String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  }).join(';')).join('\r\n');
  scaricaFile(nomeFileConData('charme-listino', 'csv'), '﻿' + csv, 'text/csv;charset=utf-8');
  ui.ok('Foglio del listino scaricato');
}

async function importaListino(file) {
  if (!file) return;
  const testo = (await file.text()).replace(/^﻿/, '');
  const righe = testo.split(/\r?\n/).filter(r => r.trim());
  if (righe.length < 2) { ui.errore('Il foglio sembra vuoto'); return; }

  const separatore = (righe[0].match(/;/g) || []).length >= (righe[0].match(/,/g) || []).length ? ';' : ',';
  const dividi = (r) => {
    const out = []; let corrente = '', dentro = false;
    for (let i = 0; i < r.length; i++) {
      const ch = r[i];
      if (ch === '"') { if (dentro && r[i+1] === '"') { corrente += '"'; i++; } else dentro = !dentro; }
      else if (ch === separatore && !dentro) { out.push(corrente); corrente = ''; }
      else corrente += ch;
    }
    out.push(corrente);
    return out.map(x => x.trim());
  };

  const dati = righe.slice(1).map(dividi).filter(r => r[1]);
  if (!dati.length) { ui.errore('Nessuna riga valida trovata'); return; }

  const sicuro = await ui.conferma({
    titolo: 'Sostituire il listino?',
    testo: `Il foglio contiene ${dati.length} servizi. Il listino attuale verrà sostituito. ` +
           `Gli appuntamenti già registrati non cambiano: conservano nome e prezzo del momento in cui sono stati creati.`,
    confermaTesto: 'Sostituisci listino'
  });
  if (!sicuro) return;

  const categorieEsistenti = await store.elencoCategorie();
  const perNome = Object.fromEntries(categorieEsistenti.map(c => [c.nome.toLowerCase(), c.id]));
  const tavolozza = ['#B08D57','#C98F86','#9B6A7D','#7E9478','#A8743F','#6E8CA0'];

  for (const s of await store.elencoServizi()) await store.eliminaServizio(s.id);

  let i = 0;
  for (const r of dati) {
    const [cat, nome, durata, posa, prezzo, preferito, attivo] = r;
    let categoriaId = perNome[(cat || '').toLowerCase()];
    if (cat && !categoriaId) {
      const nuova = await store.salvaCategoria({ nome: cat, colore: tavolozza[Object.keys(perNome).length % tavolozza.length] });
      perNome[cat.toLowerCase()] = nuova.id;
      categoriaId = nuova.id;
    }
    await store.salvaServizio({
      nome, categoriaId: categoriaId || null,
      durata: Number(String(durata).replace(',', '.')) || 30,
      posaMinuti: Number(String(posa).replace(',', '.')) || 0,
      prezzo: Number(String(prezzo).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0,
      preferito: /^(s|y|1|x|v)/i.test(preferito || ''),
      attivo: attivo === undefined || attivo === '' ? 1 : /^(s|y|1|x|v)/i.test(attivo),
      ordine: ++i
    });
  }
  ui.ok(`${dati.length} servizi importati`);
  disegna(); if (alCambioListino) alCambioListino();
}

async function moduloAumento(categorie) {
  const valuta = cfg.get('incassi').valuta;
  const p = ui.pannello({
    titolo: 'Aumento prezzi',
    sottotitolo: 'Vedrai l\'anteprima prima di confermare.',
    ampio: true,
    contenuto: `
      <div class="riga-campi">
        <div class="campo">
          <label class="campo__etichetta" for="a-perc">Percentuale</label>
          <input class="input" id="a-perc" type="number" step="0.5" value="5">
        </div>
        <div class="campo">
          <label class="campo__etichetta" for="a-cat">Applica a</label>
          <select class="scelta" id="a-cat">
            <option value="">Tutto il listino</option>
            ${categorie.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="campo">
        <label class="campo__etichetta" for="a-arr">Arrotonda a</label>
        <select class="scelta" id="a-arr">
          <option value="0.5">50 centesimi</option>
          <option value="1">1 ${esc(valuta)}</option>
          <option value="5">5 ${esc(valuta)}</option>
          <option value="0">non arrotondare</option>
        </select>
      </div>
      <div id="a-anteprima"></div>`,
    azioni: `<button class="btn btn--fantasma" data-x="no">Annulla</button>
             <button class="btn btn--principale" data-x="si">Applica</button>`
  });

  let modifiche = [];
  const calcola = async () => {
    modifiche = await store.aumentaPrezzi(
      Number(p.elemento.querySelector('#a-perc').value) || 0,
      { categoriaId: p.elemento.querySelector('#a-cat').value || null,
        arrotondaA: Number(p.elemento.querySelector('#a-arr').value) }
    );
    const cambiati = modifiche.filter(m => m.a !== m.da);
    p.elemento.querySelector('#a-anteprima').innerHTML = `
      <h3 style="font-size:15px;margin:14px 0 8px">Anteprima — ${cambiati.length} servizi cambiano</h3>
      <table class="tabella"><tbody>
        ${modifiche.map(m => `<tr>
          <td>${esc(m.servizio.nome)}</td>
          <td class="num" style="color:var(--bruno-tenue)">${euro(m.da, valuta)}</td>
          <td class="num" style="width:24px">→</td>
          <td class="num"><strong>${euro(m.a, valuta)}</strong></td>
        </tr>`).join('')}
      </tbody></table>`;
  };
  ['#a-perc', '#a-cat', '#a-arr'].forEach(sel =>
    p.elemento.querySelector(sel).addEventListener('change', calcola));
  await calcola();

  p.elemento.querySelector('[data-x="no"]').addEventListener('click', () => p.chiudi());
  p.elemento.querySelector('[data-x="si"]').addEventListener('click', async () => {
    await store.applicaAumento(modifiche);
    ui.ok('Prezzi aggiornati'); p.chiudi(); disegna(); if (alCambioListino) alCambioListino();
  });
}

/* ========================== MESSAGGI ========================== */

async function dMessaggi(p) {
  const m = cfg.get('messaggi');
  p.innerHTML = `
    <h2>Messaggi WhatsApp</h2>
    <p class="testo-tenue">L'app scrive il messaggio, WhatsApp si apre con il testo pronto e resta un solo tocco da fare.
    Scrivi i testi come preferisci: le parti fra graffe vengono sostituite automaticamente.</p>

    <div class="blocco">
      <h3 class="blocco__titolo">Conferma</h3>
      <p class="blocco__nota">Proposto subito dopo aver fissato un appuntamento.</p>
      <textarea class="area" id="m-conferma" style="min-height:120px">${esc(m.conferma)}</textarea>
      <div class="campi-disponibili" data-per="m-conferma">
        ${wa.CAMPI.map(c => `<button class="campo-tag" data-campo="${esc(c.chiave)}" title="${esc(c.descrizione)}" type="button">${esc(c.chiave)}</button>`).join('')}
      </div>
      <div class="bolla-anteprima" id="ant-conferma"></div>
    </div>

    <div class="blocco">
      <h3 class="blocco__titolo">Promemoria</h3>
      <p class="blocco__nota">Proposto il giorno prima, per le clienti che hanno il promemoria attivo nella loro scheda.</p>
      <textarea class="area" id="m-promemoria" style="min-height:130px">${esc(m.promemoria)}</textarea>
      <div class="campi-disponibili" data-per="m-promemoria">
        ${wa.CAMPI.map(c => `<button class="campo-tag" data-campo="${esc(c.chiave)}" title="${esc(c.descrizione)}" type="button">${esc(c.chiave)}</button>`).join('')}
      </div>
      <div class="bolla-anteprima" id="ant-promemoria"></div>
    </div>

    <div class="blocco">
      <h3 class="blocco__titolo">Comportamento</h3>
      ${leva('m-nuove', 'Promemoria attivo per le clienti nuove', m.promemoriaAttivoPerNuove,
             'Vale come impostazione di partenza: su ogni singola cliente si può cambiare')}
      <div class="riga-campi" style="margin-top:12px">
        ${campo('m-ora', 'Ora della notifica serale', m.oraNotificaSerale, { tipo: 'time',
          aiuto: 'A quest\'ora l\'app ricorda i promemoria da inviare per il giorno dopo.' })}
        ${campo('m-firma', 'Firma (facoltativa)', m.firma, { aiuto: 'Aggiunta in fondo a ogni messaggio, se non già presente.' })}
      </div>
    </div>`;

  const aggiornaAnteprime = () => {
    p.querySelector('#ant-conferma').textContent = wa.anteprima(p.querySelector('#m-conferma').value);
    p.querySelector('#ant-promemoria').textContent = wa.anteprima(p.querySelector('#m-promemoria').value);
  };
  aggiornaAnteprime();

  ['m-conferma', 'm-promemoria'].forEach(id => {
    const area = p.querySelector('#' + id);
    area.addEventListener('input', aggiornaAnteprime);
    area.addEventListener('change', async () => {
      await cfg.imposta('messaggi', { [id === 'm-conferma' ? 'conferma' : 'promemoria']: area.value });
      ui.ok('Testo salvato');
    });
  });

  ui.su(p, 'click', '[data-campo]', (e, el) => {
    const id = el.closest('[data-per]').dataset.per;
    const area = p.querySelector('#' + id);
    const pos = area.selectionStart || area.value.length;
    area.value = area.value.slice(0, pos) + el.dataset.campo + area.value.slice(area.selectionEnd || pos);
    area.focus();
    area.selectionStart = area.selectionEnd = pos + el.dataset.campo.length;
    aggiornaAnteprime();
    area.dispatchEvent(new Event('change'));
  });

  collega(p, 'messaggi', { 'm-nuove': 'promemoriaAttivoPerNuove', 'm-ora': 'oraNotificaSerale', 'm-firma': 'firma' });
}

/* ========================== AGENDA ========================== */

async function dAgenda(p) {
  const a = cfg.get('agenda');
  p.innerHTML = `
    <h2>Agenda</h2>
    <p class="testo-tenue">Il negozio non ha orari fissi: questa fascia serve solo a decidere quanta griglia mostrare.
    Puoi comunque fissare un appuntamento a qualsiasi ora scrivendola a mano.</p>

    <div class="blocco">
      <h3 class="blocco__titolo">Fascia mostrata</h3>
      <div class="riga-campi">
        ${campo('a-inizio', 'Dalle', a.oraInizio, { tipo: 'time' })}
        ${campo('a-fine', 'Alle', a.oraFine, { tipo: 'time' })}
      </div>
    </div>

    <div class="blocco">
      <h3 class="blocco__titolo">Comportamento</h3>
      <div class="campo">
        <label class="campo__etichetta" for="a-passo">Ogni quanti minuti proporre un orario</label>
        <select class="scelta" id="a-passo">
          ${[5,10,15,20,30].map(v => `<option value="${v}" ${a.passoMinuti === v ? 'selected' : ''}>${v} minuti</option>`).join('')}
        </select>
        <p class="campo__aiuto">Più piccolo è il passo, più orari compaiono nella schermata di inserimento.</p>
      </div>
      ${campo('a-durata', 'Durata di un appuntamento senza servizio (min)', a.durataPredefinita, { tipo: 'number' })}
      <div class="campo">
        <label class="campo__etichetta" for="a-sovr">Se due appuntamenti si sovrappongono</label>
        <select class="scelta" id="a-sovr">
          <option value="avvisa" ${a.avvisoSovrapposizione === 'avvisa' ? 'selected' : ''}>Avvisa, ma lascia salvare</option>
          <option value="silenzioso" ${a.avvisoSovrapposizione === 'silenzioso' ? 'selected' : ''}>Non dire niente</option>
          <option value="off" ${a.avvisoSovrapposizione === 'off' ? 'selected' : ''}>Nessun controllo</option>
        </select>
      </div>
      <div class="campo">
        <label class="campo__etichetta" for="a-densita">Densità della griglia</label>
        <select class="scelta" id="a-densita">
          <option value="comoda" ${a.densita === 'comoda' ? 'selected' : ''}>Comoda</option>
          <option value="compatta" ${a.densita === 'compatta' ? 'selected' : ''}>Compatta (più ore a schermo)</option>
        </select>
      </div>
      ${leva('a-prezzi', 'Mostra i prezzi in agenda', a.mostraPrezzi,
             'Spegnilo se preferisci che gli importi non si vedano quando la cliente sbircia lo schermo')}
    </div>`;

  collega(p, 'agenda', {
    'a-inizio': 'oraInizio', 'a-fine': 'oraFine', 'a-passo': 'passoMinuti',
    'a-durata': 'durataPredefinita', 'a-sovr': 'avvisoSovrapposizione',
    'a-densita': 'densita', 'a-prezzi': 'mostraPrezzi'
  });
  p.querySelectorAll('select, input').forEach(el =>
    el.addEventListener('change', () => document.dispatchEvent(new CustomEvent('impostazioni:cambiate'))));
}

/* ========================== SCHEDA CLIENTE ========================== */

async function dCliente(p) {
  const c = cfg.get('cliente');
  p.innerHTML = `
    <h2>Scheda cliente</h2>
    <p class="testo-tenue">Cosa serve per creare una cliente nuova al volo, mentre si è al telefono.</p>
    <div class="blocco">
      ${campo('cl-prefisso', 'Prefisso internazionale', c.prefissoTelefonico,
        { aiuto: 'Aggiunto ai numeri scritti senza prefisso, per i link WhatsApp.' })}
      ${leva('cl-tel', 'Chiedi conferma se manca il telefono', c.richiediTelefono,
             'Senza numero non si possono inviare conferme né promemoria')}
      ${leva('cl-cognome', 'Cognome obbligatorio', c.richiediCognome,
             'Di norma basta il nome: il cognome si aggiunge con calma dopo')}
    </div>`;
  collega(p, 'cliente', { 'cl-prefisso': 'prefissoTelefonico', 'cl-tel': 'richiediTelefono', 'cl-cognome': 'richiediCognome' });
}

/* ========================== COLORE ========================== */

async function dColore(p) {
  const c = cfg.get('colore');
  const lista = (titolo, id, valori, nota) => `
    <div class="blocco">
      <h3 class="blocco__titolo">${esc(titolo)}</h3>
      <p class="blocco__nota">${esc(nota)}</p>
      <textarea class="area" id="${id}" style="min-height:110px">${esc(valori.join('\n'))}</textarea>
      <p class="campo__aiuto">Una voce per riga.</p>
    </div>`;

  p.innerHTML = `
    <h2>Colore e formule</h2>
    <p class="testo-tenue">Queste liste alimentano i menu della scheda colore. Aggiungi una marca qui e comparirà ovunque serva.</p>
    ${lista('Marche', 'co-marche', c.marche, 'I prodotti che usi abitualmente.')}
    ${lista('Volumi di ossigeno', 'co-volumi', c.volumi, 'Compaiono come scelta rapida nella formula.')}
    ${lista('Tempi di posa proposti (minuti)', 'co-tempi', c.tempiPosa.map(String), 'Solo numeri, uno per riga.')}
  `;

  const salva = async (id, chiave, numerico = false) => {
    const el = p.querySelector('#' + id);
    el.addEventListener('change', async () => {
      let v = el.value.split('\n').map(x => x.trim()).filter(Boolean);
      if (numerico) v = v.map(Number).filter(n => !isNaN(n));
      await cfg.imposta('colore', { [chiave]: v });
      ui.ok('Salvato');
    });
  };
  salva('co-marche', 'marche');
  salva('co-volumi', 'volumi');
  salva('co-tempi', 'tempiPosa', true);
}

/* ========================== INCASSI ========================== */

async function dIncassi(p) {
  const i = cfg.get('incassi');
  p.innerHTML = `
    <h2>Incassi</h2>
    <p class="testo-tenue">Somma gestionale degli appuntamenti conclusi. Non sostituisce scontrini né registratore di cassa.</p>
    <div class="blocco">
      ${campo('i-valuta', 'Simbolo della valuta', i.valuta)}
      <div class="campo">
        <label class="campo__etichetta" for="i-metodi">Metodi di pagamento</label>
        <textarea class="area" id="i-metodi" style="min-height:100px">${esc(i.metodiPagamento.join('\n'))}</textarea>
        <p class="campo__aiuto">Uno per riga.</p>
      </div>
    </div>
    <div class="avviso-riquadro avviso-riquadro--info" style="max-width:780px">
      <span>ℹ</span><div><strong>In arrivo</strong>
      Totali del giorno e del mese ed export per il commercialista fanno parte della prossima fase.</div></div>`;

  collega(p, 'incassi', { 'i-valuta': 'valuta' });
  p.querySelector('#i-metodi').addEventListener('change', async (e) => {
    await cfg.imposta('incassi', { metodiPagamento: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) });
    ui.ok('Salvato');
  });
}

/* ========================== BACKUP ========================== */

async function dBackup(p) {
  const b = cfg.get('backup');
  const st = await db.statistiche();
  const copie = await db.elencoSnapshot();
  const giorniDaUltimo = b.ultimoBackup
    ? Math.floor((Date.now() - new Date(b.ultimoBackup)) / 86400000) : null;
  const inRitardo = giorniDaUltimo === null || giorniDaUltimo >= b.giorniAvviso;

  p.innerHTML = `
    <h2>Backup</h2>
    <p class="testo-tenue">I dati vivono nel tablet. Il backup è l'assicurazione: se il tablet si rompe o si perde,
    da un file si ricostruisce tutto su un altro dispositivo.</p>

    <div class="avviso-riquadro ${inRitardo ? '' : 'avviso-riquadro--info'}" style="max-width:780px;margin-bottom:18px">
      <span>${inRitardo ? '⚠' : '✓'}</span>
      <div><strong>${inRitardo ? 'Backup da fare' : 'Backup recente'}</strong>
      ${b.ultimoBackup
        ? `Ultima copia il ${esc(dataNumerica(new Date(b.ultimoBackup)))} alle ${esc(oraDi(new Date(b.ultimoBackup)))}${giorniDaUltimo ? ` (${giorniDaUltimo} giorni fa)` : ' (oggi)'}.`
        : 'Non è ancora stata fatta nessuna copia.'}</div>
    </div>

    <div class="blocco">
      <h3 class="blocco__titolo">Salva una copia</h3>
      <p class="blocco__nota">Tocca «Salva copia dati», poi scegli Google Drive dal menu di Android.
      Sono tre tocchi in tutto e mettono al sicuro clienti, appuntamenti e storico.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn--principale" id="b-dati">Salva copia dati</button>
        <button class="btn btn--fantasma" id="b-config">Salva copia configurazione</button>
      </div>
      <p class="campo__aiuto">La <strong>configurazione</strong> contiene solo listino, testi e preferenze:
      si può ripristinare senza toccare i dati delle clienti.</p>
    </div>

    <div class="blocco">
      <h3 class="blocco__titolo">Ripristina</h3>
      <p class="blocco__nota">Da un file di backup salvato in precedenza. Fai sempre una copia prima di ripristinare.</p>
      <label class="btn btn--fantasma">Scegli file di backup<input type="file" id="b-ripristina" accept=".json,application/json" hidden></label>
    </div>

    <div class="blocco">
      <h3 class="blocco__titolo">Promemoria</h3>
      <div class="riga-campi">
        ${campo('b-ora', 'Ora del promemoria serale', b.oraPromemoria, { tipo: 'time' })}
        ${campo('b-giorni', 'Avvisa dopo quanti giorni senza backup', b.giorniAvviso, { tipo: 'number' })}
      </div>
    </div>

    <div class="blocco">
      <h3 class="blocco__titolo">Copie automatiche interne</h3>
      <p class="blocco__nota">L'app salva da sola una copia prima di ogni aggiornamento che tocca la struttura dei dati.
      Restano dentro il tablet, in un archivio separato: non sostituiscono il backup esterno.</p>
      ${copie.length
        ? copie.map(c => `<div class="riga-info">
            <span class="riga-info__etichetta">${esc(dataNumerica(new Date(c.creataIl)))} ${esc(oraDi(new Date(c.creataIl)))} — v${c.daVersione} → v${c.aVersione}</span>
            <span class="riga-info__valore">${Object.entries(c.conteggi).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(', ') || 'vuota'}</span>
          </div>`).join('')
        : '<p class="testo-tenue">Nessuna copia automatica: la struttura dati non è mai cambiata da quando l\'app è installata.</p>'}
    </div>`;

  collega(p, 'backup', { 'b-ora': 'oraPromemoria', 'b-giorni': 'giorniAvviso' });

  p.querySelector('#b-dati').addEventListener('click', async () => {
    const pacchetto = await db.esporta({ includiFoto: cfg.get('backup').includiFotoNelBackup });
    scaricaFile(nomeFileConData('charme-dati', 'json'), JSON.stringify(pacchetto));
    await cfg.imposta('backup', { ultimoBackup: new Date().toISOString() });
    ui.ok('Copia salvata: scegli Drive dal menu di Android');
    disegna();
  });

  p.querySelector('#b-config').addEventListener('click', async () => {
    const pacchetto = await db.esportaConfigurazione();
    scaricaFile(nomeFileConData('charme-configurazione', 'json'), JSON.stringify(pacchetto));
    ui.ok('Configurazione salvata');
  });

  p.querySelector('#b-ripristina').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    let pacchetto;
    try { pacchetto = JSON.parse(await file.text()); }
    catch { ui.errore('Il file non è leggibile'); return; }

    const soloConfig = pacchetto.formato === 'charme-configurazione';
    const sicuro = await ui.conferma({
      titolo: soloConfig ? 'Ripristinare la configurazione?' : 'Ripristinare i dati?',
      testo: soloConfig
        ? 'Listino, testi e preferenze verranno sostituiti con quelli del file. I dati delle clienti non vengono toccati.'
        : `Copia del ${new Date(pacchetto.creatoIl || Date.now()).toLocaleDateString('it-IT')}. ` +
          'Tutti i dati attuali verranno sostituiti con quelli del file.',
      confermaTesto: 'Ripristina', pericolo: !soloConfig
    });
    if (!sicuro) return;

    try {
      const riepilogo = await db.ripristina(pacchetto);
      await cfg.carica();
      ui.ok('Ripristino completato: ' + Object.entries(riepilogo).map(([k, v]) => `${v} ${k}`).join(', '));
      document.dispatchEvent(new CustomEvent('dati:cambiati'));
      disegna();
    } catch (err) {
      ui.errore(err.message);
    }
  });
}

/* ========================== SISTEMA ========================== */

async function dSistema(p) {
  const st = await db.statistiche();
  const mb = (n) => n == null ? '—' : `${(n / 1048576).toFixed(1)} MB`;

  p.innerHTML = `
    <h2>Sistema</h2>
    <p class="testo-tenue">Stato dell'installazione. Il codice dell'app e i dati sono due cose separate:
    un aggiornamento sostituisce il primo e non tocca i secondi.</p>

    <div class="blocco">
      <h3 class="blocco__titolo">Versioni</h3>
      <div class="riga-info"><span class="riga-info__etichetta">Versione dell'app</span><span class="riga-info__valore">${VERSIONE_APP}</span></div>
      <div class="riga-info"><span class="riga-info__etichetta">Versione della struttura dati</span><span class="riga-info__valore">v${st.versioneDati}</span></div>
      <div class="riga-info"><span class="riga-info__etichetta">Installata come app</span>
        <span class="riga-info__valore">${matchMedia('(display-mode: standalone)').matches ? 'sì' : 'no, aperta nel browser'}</span></div>
      <div class="riga-info"><span class="riga-info__etichetta">Dati protetti da cancellazione automatica</span>
        <span class="riga-info__valore">${st.persistente === null ? 'non verificabile' : st.persistente ? 'sì' : 'non ancora'}</span></div>
      <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn--fantasma" id="s-aggiorna">Verifica aggiornamenti</button>
        ${st.persistente === false ? '<button class="btn btn--fantasma" id="s-persisti">Proteggi i dati</button>' : ''}
      </div>
    </div>

    <div class="blocco">
      <h3 class="blocco__titolo">Contenuto del database</h3>
      ${Object.entries(st.conteggi).map(([k, v]) =>
        `<div class="riga-info"><span class="riga-info__etichetta">${esc(k)}</span><span class="riga-info__valore">${v}</span></div>`).join('')}
      <div class="riga-info"><span class="riga-info__etichetta">Spazio occupato</span>
        <span class="riga-info__valore">${mb(st.spazio && st.spazio.usato)}${st.spazio && st.spazio.disponibile ? ` su ${mb(st.spazio.disponibile)}` : ''}</span></div>
    </div>

    <div class="blocco">
      <h3 class="blocco__titolo">Manutenzione</h3>
      <p class="blocco__nota">Da usare solo se qualcosa non torna. Fai prima una copia di backup.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn--fantasma" id="s-cache">Svuota la cache dell'app</button>
        <button class="btn btn--fantasma" id="s-listino" style="color:var(--rosso)">Ripristina listino di esempio</button>
      </div>
      <p class="campo__aiuto">Svuotare la cache ricarica il codice dell'app dalla rete.
      <strong>Non tocca i dati</strong>: clienti e appuntamenti restano dove sono.</p>
    </div>`;

  p.querySelector('#s-aggiorna').addEventListener('click', async () => {
    if (!('serviceWorker' in navigator)) { ui.errore('Aggiornamenti non disponibili'); return; }
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { ui.errore('App non installata'); return; }
    await reg.update();
    ui.ok(reg.waiting ? 'Aggiornamento pronto: riapri l\'app' : 'Sei già alla versione più recente');
  });

  const persisti = p.querySelector('#s-persisti');
  if (persisti) persisti.addEventListener('click', async () => {
    const esito = await db.chiediArchiviazionePersistente();
    esito ? ui.ok('Dati protetti') : ui.errore('Android non ha concesso la protezione: usa comunque i backup');
    disegna();
  });

  p.querySelector('#s-cache').addEventListener('click', async () => {
    const sicuro = await ui.conferma({
      titolo: 'Svuotare la cache?',
      testo: 'Il codice dell\'app verrà riscaricato al prossimo avvio. I dati delle clienti non vengono toccati in alcun modo.',
      confermaTesto: 'Svuota'
    });
    if (!sicuro) return;
    if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
    ui.ok('Cache svuotata: ricarico…');
    setTimeout(() => location.reload(), 900);
  });

  p.querySelector('#s-listino').addEventListener('click', async () => {
    const sicuro = await ui.conferma({
      titolo: 'Ripristinare il listino di esempio?',
      testo: 'Il listino attuale verrà sostituito da quello di esempio. Appuntamenti e clienti non vengono toccati.',
      confermaTesto: 'Ripristina', pericolo: true
    });
    if (!sicuro) return;
    for (const s of await store.elencoServizi()) await db.elimina('servizi', s.id);
    for (const c of await store.elencoCategorie()) await db.elimina('categorie', c.id);
    await db.elimina('impostazioni', '_esempio');
    await cfg.primoAvvio();
    ui.ok('Listino di esempio ripristinato');
    if (alCambioListino) alCambioListino();
    disegna();
  });
}
