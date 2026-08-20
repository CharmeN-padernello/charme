/* Charme — utilità generiche
   Nessuna dipendenza esterna. Tutte le funzioni sono pure e riutilizzabili. */

export const GIORNI = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
export const GIORNI_BREVI = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
export const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno',
                     'luglio','agosto','settembre','ottobre','novembre','dicembre'];
export const MESI_BREVI = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];

/* ---------- date ---------- */

/** Chiave giorno YYYY-MM-DD in ora locale (mai UTC: evita lo sfasamento di fuso). */
export function dayKey(d) {
  const x = new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const g = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${g}`;
}

export function fromDayKey(key) {
  const [y, m, g] = key.split('-').map(Number);
  return new Date(y, m - 1, g, 0, 0, 0, 0);
}

export function startOfDay(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}

export function addDays(d, n) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}

export function addMinutes(d, n) {
  return new Date(new Date(d).getTime() + n * 60000);
}

export function sameDay(a, b) { return dayKey(a) === dayKey(b); }

export function isToday(d) { return sameDay(d, new Date()); }

/** "Giovedì 20 agosto" */
export function dataEstesa(d) {
  const x = new Date(d);
  return `${GIORNI[x.getDay()]} ${x.getDate()} ${MESI[x.getMonth()]}`;
}

/** "gio 20 ago" */
export function dataBreve(d) {
  const x = new Date(d);
  return `${GIORNI_BREVI[x.getDay()]} ${x.getDate()} ${MESI_BREVI[x.getMonth()]}`;
}

/** "20/08/2026" */
export function dataNumerica(d) {
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}/${x.getFullYear()}`;
}

/** "15:30" */
export function ora(d) {
  const x = new Date(d);
  return `${String(x.getHours()).padStart(2,'0')}:${String(x.getMinutes()).padStart(2,'0')}`;
}

/** "oggi" / "domani" / "giovedì 20 agosto" — per i messaggi WhatsApp */
export function quandoUmano(d) {
  const oggi = startOfDay(new Date());
  const g = startOfDay(d);
  const diff = Math.round((g - oggi) / 86400000);
  if (diff === 0) return 'oggi';
  if (diff === 1) return 'domani';
  if (diff === 2) return 'dopodomani';
  const x = new Date(d);
  return `${GIORNI[x.getDay()].toLowerCase()} ${x.getDate()} ${MESI[x.getMonth()]}`;
}

/** "3 giorni fa", "2 mesi fa" — per lo storico cliente */
export function tempoFa(d) {
  if (!d) return '—';
  const giorni = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (giorni < 0) return 'in programma';
  if (giorni === 0) return 'oggi';
  if (giorni === 1) return 'ieri';
  if (giorni < 30) return `${giorni} giorni fa`;
  const mesi = Math.round(giorni / 30.4);
  if (mesi < 12) return mesi === 1 ? 'un mese fa' : `${mesi} mesi fa`;
  const anni = Math.floor(giorni / 365);
  return anni === 1 ? 'un anno fa' : `${anni} anni fa`;
}

/** minuti dalla mezzanotte, da "08:30" */
export function minutiDaHHMM(s) {
  const [h, m] = String(s).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function hhmmDaMinuti(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

/** "1h 30min" */
export function durataUmana(min) {
  if (min == null) return '';
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

/* ---------- numeri e testo ---------- */

export function euro(n, valuta = '€') {
  if (n == null || n === '') return '—';
  const v = Number(n);
  return `${valuta} ${v.toFixed(2).replace('.', ',').replace(/,00$/, '')}`;
}

/** Rimuove accenti e maiuscole: per la ricerca "istantanea" sul nome. */
export function normalizza(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function iniziali(nome, cognome) {
  const a = (nome || '').trim()[0] || '';
  const b = (cognome || '').trim()[0] || '';
  return (a + b).toUpperCase() || '?';
}

export function nomeCompleto(c) {
  if (!c) return '';
  return [c.nome, c.cognome].filter(Boolean).join(' ').trim();
}

/** Numero in formato internazionale per i link WhatsApp: 3331234567 -> 393331234567 */
export function telefonoInternazionale(tel, prefisso = '+39') {
  let t = String(tel || '').replace(/[^\d+]/g, '');
  if (!t) return '';
  if (t.startsWith('00')) t = '+' + t.slice(2);
  if (!t.startsWith('+')) t = prefisso + t;
  return t.replace(/\D/g, '');
}

export function telefonoLeggibile(tel) {
  const t = String(tel || '').replace(/\s+/g, '');
  if (/^\d{10}$/.test(t)) return `${t.slice(0,3)} ${t.slice(3,6)} ${t.slice(6)}`;
  return tel || '';
}

/** Testo sicuro dentro HTML. Usata ovunque si interpoli input dell'utente. */
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function uid(prefisso = '') {
  const r = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefisso ? `${prefisso}_${r}` : r;
}

export function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

/** Arrotonda i minuti al passo dell'agenda (es. 15) */
export function arrotondaAlPasso(minuti, passo) {
  return Math.round(minuti / passo) * passo;
}

export function debounce(fn, ms = 180) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Scarica un contenuto come file: usata dai backup e dagli export. */
export function scaricaFile(nomeFile, contenuto, tipo = 'application/json') {
  const blob = contenuto instanceof Blob ? contenuto : new Blob([contenuto], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeFile;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Nome file con la data: charme-dati-2026-08-20.json */
export function nomeFileConData(base, estensione) {
  return `${base}-${dayKey(new Date())}.${estensione}`;
}

/** "2026-08-20T15:00" — ora locale, ordinabile alfabeticamente, senza fusi orari. */
export function isoLocale(d) {
  const x = new Date(d);
  return `${dayKey(x)}T${String(x.getHours()).padStart(2,'0')}:${String(x.getMinutes()).padStart(2,'0')}`;
}

export function daIsoLocale(s) {
  if (!s) return null;
  const [data, orario] = String(s).split('T');
  const [y, m, g] = data.split('-').map(Number);
  const [h, mi] = (orario || '00:00').split(':').map(Number);
  return new Date(y, m - 1, g, h, mi, 0, 0);
}
