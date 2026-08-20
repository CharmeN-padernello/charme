/* Charme — componenti di interfaccia riutilizzabili
   Pannelli, avvisi, conferme. Tutto dimensionato per essere usato col dito. */

import { esc } from './util.js';

/* ---------- avvisi temporanei ---------- */

let contenitoreAvvisi = null;

export function avviso(testo, tipo = 'info', durata = 3200) {
  if (!contenitoreAvvisi) {
    contenitoreAvvisi = document.createElement('div');
    contenitoreAvvisi.className = 'avvisi';
    document.body.appendChild(contenitoreAvvisi);
  }
  const el = document.createElement('div');
  el.className = `avviso avviso--${tipo}`;
  el.innerHTML = `<span>${esc(testo)}</span>`;
  contenitoreAvvisi.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visibile'));
  setTimeout(() => {
    el.classList.remove('is-visibile');
    setTimeout(() => el.remove(), 300);
  }, durata);
  return el;
}

export const ok = (t) => avviso(t, 'ok');
export const errore = (t) => avviso(t, 'errore');

/* ---------- pannello a scomparsa (bottom sheet) ---------- */

/* I pannelli si impilano: aprirne uno secondario (una cliente nuova, una
   conferma) NON deve chiudere quello sotto. */
const pila = [];

/**
 * Apre un pannello dal basso.
 * @returns {{chiudi:Function, elemento:HTMLElement, corpo:HTMLElement}}
 */
export function pannello({ titolo, sottotitolo = '', contenuto, azioni = '', ampio = false, alChiudere = null }) {
  const livello = pila.length;
  const zSfondo = 60 + livello * 10;

  const sfondo = document.createElement('div');
  sfondo.className = 'sfondo-modale';
  sfondo.style.zIndex = zSfondo;

  const el = document.createElement('div');
  el.className = `pannello${ampio ? ' pannello--ampio' : ''}`;
  el.style.zIndex = zSfondo + 1;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', titolo || 'Pannello');
  el.innerHTML = `
    <div class="pannello__maniglia" aria-hidden="true"></div>
    <header class="pannello__testa">
      <div>
        <h2 class="pannello__titolo">${esc(titolo || '')}</h2>
        ${sottotitolo ? `<p class="pannello__sottotitolo">${esc(sottotitolo)}</p>` : ''}
      </div>
      <button class="btn-icona pannello__chiudi" type="button" aria-label="Chiudi">&times;</button>
    </header>
    <div class="pannello__corpo"></div>
    ${azioni ? `<footer class="pannello__azioni">${azioni}</footer>` : ''}
  `;

  const corpo = el.querySelector('.pannello__corpo');
  if (typeof contenuto === 'string') corpo.innerHTML = contenuto;
  else if (contenuto instanceof Node) corpo.appendChild(contenuto);

  document.body.appendChild(sfondo);
  document.body.appendChild(el);
  document.body.classList.add('senza-scorrimento');

  const riferimento = { chiudi: null, elemento: el, corpo };

  const chiudi = () => {
    if (!el.isConnected) return;
    el.classList.remove('is-aperto');
    sfondo.classList.remove('is-aperto');
    setTimeout(() => { el.remove(); sfondo.remove(); }, 240);
    document.removeEventListener('keydown', suEsc);
    const i = pila.indexOf(riferimento);
    if (i >= 0) pila.splice(i, 1);
    if (!pila.length) document.body.classList.remove('senza-scorrimento');
    if (alChiudere) alChiudere();
  };
  riferimento.chiudi = chiudi;

  // Esc chiude solo il pannello più in alto.
  const suEsc = (e) => {
    if (e.key !== 'Escape') return;
    if (pila[pila.length - 1] !== riferimento) return;
    chiudi();
  };
  document.addEventListener('keydown', suEsc);
  sfondo.addEventListener('click', chiudi);
  el.querySelector('.pannello__chiudi').addEventListener('click', chiudi);

  requestAnimationFrame(() => {
    el.classList.add('is-aperto');
    sfondo.classList.add('is-aperto');
    const primo = el.querySelector('[data-fuoco]');
    if (primo) setTimeout(() => primo.focus(), 260);
  });

  pila.push(riferimento);
  return riferimento;
}

/** Chiude il pannello più in alto. */
export function chiudiPannello() {
  if (pila.length) pila[pila.length - 1].chiudi();
}

/** Chiude tutti i pannelli aperti. */
export function chiudiTuttiIPannelli() {
  while (pila.length) pila[pila.length - 1].chiudi();
}

/* ---------- conferme ---------- */

export function conferma({ titolo, testo, confermaTesto = 'Conferma', annullaTesto = 'Annulla', pericolo = false }) {
  return new Promise((risolvi) => {
    let deciso = false;
    const p = pannello({
      titolo,
      contenuto: `<p class="testo-lungo">${esc(testo)}</p>`,
      azioni: `
        <button class="btn btn--fantasma" data-azione="no">${esc(annullaTesto)}</button>
        <button class="btn ${pericolo ? 'btn--pericolo' : 'btn--principale'}" data-azione="si" data-fuoco>${esc(confermaTesto)}</button>
      `,
      alChiudere: () => { if (!deciso) risolvi(false); }
    });
    p.elemento.querySelectorAll('[data-azione]').forEach(b => {
      b.addEventListener('click', () => {
        deciso = true;
        risolvi(b.dataset.azione === 'si');
        p.chiudi();
      });
    });
  });
}

/* ---------- utilità DOM ---------- */

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function svuota(nodo) { while (nodo.firstChild) nodo.removeChild(nodo.firstChild); }

/** Delegazione eventi: sopravvive al ridisegno delle liste. */
export function su(radice, evento, selettore, gestore) {
  radice.addEventListener(evento, (e) => {
    const bersaglio = e.target.closest(selettore);
    if (bersaglio && radice.contains(bersaglio)) gestore(e, bersaglio);
  });
}

export function statoVuoto({ icona = '', titolo, testo = '', azione = '' }) {
  return `
    <div class="stato-vuoto">
      ${icona ? `<div class="stato-vuoto__icona">${icona}</div>` : ''}
      <h3>${esc(titolo)}</h3>
      ${testo ? `<p>${esc(testo)}</p>` : ''}
      ${azione}
    </div>`;
}
