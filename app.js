/* Charme — avvio e navigazione. */

import * as db from './db.js';
import * as cfg from './impostazioni.js';
import * as ui from './ui.js';
import * as agenda from './views/agenda.js';
import * as clienti from './views/clienti.js';
import * as nuovo from './views/nuovo.js';
import * as promemoria from './views/promemoria.js';
import * as impostazioni from './views/impostazioni.js';

const VISTE = ['agenda', 'clienti', 'promemoria', 'impostazioni'];
let vistaCorrente = 'agenda';

async function avvia() {
  try {
    await db.inizializza();
    await cfg.carica();
    const primo = await cfg.primoAvvio();
    if (primo) console.info('[Charme] primo avvio: caricato il listino di esempio');

    // Android non deve poter liberare i dati per fare spazio.
    db.chiediArchiviazionePersistente().then(esito => {
      if (!esito) console.warn('[Charme] archiviazione persistente non concessa: i backup sono essenziali');
    });

    agenda.inizializza({
      suNuovoAppuntamento: (opzioni) => nuovo.apri(opzioni),
      suApriCliente: (id) => clienti.scheda(id)
    });
    clienti.inizializza({ suNuovoAppuntamento: (opzioni) => nuovo.apri(opzioni) });
    promemoria.inizializza();
    impostazioni.inizializza({ suListinoCambiato: () => agenda.disegna() });

    document.querySelectorAll('.nav__voce').forEach(b =>
      b.addEventListener('click', () => vaiA(b.dataset.vista)));

    await agenda.disegna();
    await promemoria.aggiornaPallino();

    const parametri = new URLSearchParams(location.search);
    if (parametri.get('vista') && VISTE.includes(parametri.get('vista'))) vaiA(parametri.get('vista'));
    if (parametri.get('azione') === 'nuovo') setTimeout(() => nuovo.apri({ data: new Date() }), 400);

    mostraApp();
    registraServiceWorker();
    avviaControlloPromemoria();
    scorciatoieTastiera();

  } catch (errore) {
    console.error('[Charme] avvio non riuscito', errore);
    document.getElementById('avvio').innerHTML = `
      <div class="avvio__marchio">Charme</div>
      <div style="max-width:420px;text-align:center;padding:0 24px">
        <p style="color:var(--rosso);font-weight:600;margin-bottom:8px">L'app non è riuscita ad aprirsi</p>
        <p class="avvio__testo" style="line-height:1.55">${errore.message}</p>
        <button class="btn btn--principale" style="margin-top:18px" onclick="location.reload()">Riprova</button>
      </div>`;
  }
}

function mostraApp() {
  document.getElementById('app').hidden = false;
  const avvio = document.getElementById('avvio');
  avvio.classList.add('is-nascosta');
  setTimeout(() => avvio.remove(), 450);
}

export function vaiA(vista) {
  if (!VISTE.includes(vista)) return;
  vistaCorrente = vista;
  VISTE.forEach(v =>
    document.getElementById('vista-' + v).classList.toggle('is-attiva', v === vista));
  document.querySelectorAll('.nav__voce').forEach(b =>
    b.classList.toggle('is-attiva', b.dataset.vista === vista));

  if (vista === 'clienti') clienti.disegna();
  if (vista === 'promemoria') promemoria.disegna();
  if (vista === 'impostazioni') impostazioni.disegna();
  if (vista === 'agenda') agenda.disegna();
}

/* ---------- service worker e aggiornamenti ---------- */

async function registraServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });

    reg.addEventListener('updatefound', () => {
      const nuovoSw = reg.installing;
      if (!nuovoSw) return;
      nuovoSw.addEventListener('statechange', () => {
        if (nuovoSw.state === 'installed' && navigator.serviceWorker.controller) {
          proponiAggiornamento(reg);
        }
      });
    });

    // controlla una volta al giorno, senza disturbare
    setInterval(() => reg.update().catch(() => {}), 24 * 3600 * 1000);
  } catch (e) {
    console.warn('[Charme] service worker non registrato', e);
  }
}

function proponiAggiornamento(reg) {
  const p = ui.pannello({
    titolo: 'Aggiornamento disponibile',
    contenuto: `<p class="testo-lungo">C'è una versione nuova di Charme.
      L'aggiornamento riguarda solo il funzionamento dell'app: <strong>clienti, appuntamenti e impostazioni
      restano esattamente come sono</strong>.</p>`,
    azioni: `<button class="btn btn--fantasma" data-x="dopo">Più tardi</button>
             <button class="btn btn--principale" data-x="ora">Aggiorna adesso</button>`
  });
  p.elemento.querySelector('[data-x="dopo"]').addEventListener('click', () => p.chiudi());
  p.elemento.querySelector('[data-x="ora"]').addEventListener('click', () => {
    if (reg.waiting) reg.waiting.postMessage({ tipo: 'attiva-subito' });
    p.chiudi();
    setTimeout(() => location.reload(), 400);
  });
}

/* ---------- promemoria serale ---------- */

function avviaControlloPromemoria() {
  const controlla = async () => {
    const totale = await promemoria.aggiornaPallino();
    const oraPromemoria = cfg.get('messaggi').oraNotificaSerale;
    const adesso = new Date();
    const [h, m] = oraPromemoria.split(':').map(Number);
    const chiave = 'charme-avvisato-' + adesso.toDateString();

    if (totale > 0 &&
        (adesso.getHours() > h || (adesso.getHours() === h && adesso.getMinutes() >= m)) &&
        !sessionStorage.getItem(chiave)) {
      sessionStorage.setItem(chiave, '1');
      ui.avviso(`Ci sono ${totale} promemoria WhatsApp da inviare`, 'info', 8000);
      notificaSistema(totale);
    }
  };
  controlla();
  setInterval(controlla, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) controlla(); });
}

async function notificaSistema(totale) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'denied') return;
  if (Notification.permission === 'default') {
    try { if (await Notification.requestPermission() !== 'granted') return; } catch { return; }
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const opzioni = {
      body: `${totale} ${totale === 1 ? 'cliente da avvisare' : 'clienti da avvisare'} per domani.`,
      icon: 'icons/icona-192.png',
      badge: 'icons/icona-192.png',
      tag: 'charme-promemoria'
    };
    if (reg) await reg.showNotification('Promemoria da inviare', opzioni);
    else new Notification('Promemoria da inviare', opzioni);
  } catch { /* la notifica è un di più: se non parte, pazienza */ }
}

/* ---------- tastiera (il tablet ha la cover con tastiera) ---------- */

function scorciatoieTastiera() {
  document.addEventListener('keydown', (e) => {
    const dentroCampo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (dentroCampo || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); nuovo.apri({ data: agenda.dataVisualizzata() }); }
    if (e.key === 'c' || e.key === 'C') { e.preventDefault(); vaiA('clienti'); document.getElementById('ricerca-clienti').focus(); }
    if (e.key === 'o' || e.key === 'O') { e.preventDefault(); vaiA('agenda'); agenda.vaiA(new Date()); }
  });
}

document.addEventListener('DOMContentLoaded', avvia);
