// Depozitul de date al Curierului Xel'Naga.
// Un singur fisier JSON, scris atomic (.tmp + rename), tinut si in memorie.
// Forma: { utilizatori: { <id>: {...} }, dueluri: {}, predictie: null, flags: {} }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eExclus } from './exclusi.js';

const AICI = path.dirname(fileURLToPath(import.meta.url));
const RADACINA = process.env.DATA_DIR || path.join(AICI, '..');
const CALE = path.join(RADACINA, 'data.json');

try { fs.mkdirSync(RADACINA, { recursive: true }); } catch { /* exista deja */ }

const GOL = () => ({ utilizatori: {}, dueluri: {}, predictie: null, flags: {} });

function citesteDeLaInceput() {
  try {
    const brut = fs.readFileSync(CALE, 'utf8');
    const d = JSON.parse(brut);
    return {
      utilizatori: d.utilizatori && typeof d.utilizatori === 'object' ? d.utilizatori : {},
      dueluri: d.dueluri && typeof d.dueluri === 'object' ? d.dueluri : {},
      predictie: d.predictie ?? null,
      flags: d.flags && typeof d.flags === 'object' ? d.flags : {},
    };
  } catch {
    return GOL();
  }
}

const data = citesteDeLaInceput();

let scriereInCurs = false;
let scriereCeruta = false;

export function salveaza() {
  if (scriereInCurs) { scriereCeruta = true; return; }
  scriereInCurs = true;
  const tmp = CALE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, CALE);
  } catch (e) {
    console.error('[store] nu am putut salva data.json:', e.message);
  } finally {
    scriereInCurs = false;
    if (scriereCeruta) { scriereCeruta = false; salveaza(); }
  }
}

export function undeSalvez() {
  return CALE;
}

// Ziua curenta pe fusul serverului (Europe/Bucharest), ca sirul 2026-09-04.
export function ziCurenta(acum = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(acum);
}

const SABLON = () => ({
  sold: 0,
  totalCastigat: 0,
  minuteStream: 0,
  minuteVoice: 0,
  castigatAzi: 0,
  triviaAzi: 0,
  zi: ziCurenta(),
  inventar: [],
  triviaCastigate: 0,
  dueluriV: 0,
  dueluriP: 0,
  streakDaily: 0,
  ziDaily: null,
});

export function utilizator(id) {
  const cheie = String(id);
  if (!data.utilizatori[cheie]) data.utilizatori[cheie] = SABLON();
  const u = data.utilizatori[cheie];
  // completeaza campurile aparute mai tarziu, fara sa strice ce exista
  for (const [k, v] of Object.entries(SABLON())) {
    if (u[k] === undefined) u[k] = v;
  }
  const azi = ziCurenta();
  if (u.zi !== azi) { u.zi = azi; u.castigatAzi = 0; u.triviaAzi = 0; }
  return u;
}

// Acorda credite respectand plafonul zilnic comun (voce, stream, ladder...).
// Intoarce cat s-a acordat efectiv.
export function acorda(id, suma, plafonZilnic = Infinity) {
  const u = utilizator(id);
  const ramas = Math.max(0, plafonZilnic - u.castigatAzi);
  const dat = Math.max(0, Math.min(Math.round(suma), ramas));
  if (dat > 0) {
    u.sold += dat;
    u.totalCastigat += dat;
    u.castigatAzi += dat;
    salveaza();
  }
  return dat;
}

// Trivia are propriul plafon. Dupa plafon nu se opreste nimeni: se da 1 credit
// simbolic si victoria se numara oricum.
export function acordaTrivia(id, suma, plafonZilnic = Infinity) {
  const u = utilizator(id);
  const ramas = Math.max(0, plafonZilnic - u.triviaAzi);
  let dat = Math.max(0, Math.min(Math.round(suma), ramas));
  if (dat === 0) dat = 1;
  u.sold += dat;
  u.totalCastigat += dat;
  u.triviaAzi += dat;
  u.triviaCastigate += 1;
  salveaza();
  return dat;
}

// Ajusteaza DOAR soldul (folosit de picaturi si de comenzile de admin).
// NU atinge totalCastigat, deci nu urca rangul din /profil.
export function ajusteaza(id, suma) {
  const u = utilizator(id);
  u.sold = Math.max(0, u.sold + Math.round(suma));
  salveaza();
  return u.sold;
}

export function clasament(limita = 10) {
  return Object.entries(data.utilizatori)
    .filter(([id]) => !eExclus(id))
    .map(([id, u]) => ({ id, valoare: u.sold ?? 0 }))
    .sort((a, b) => b.valoare - a.valoare)
    .slice(0, limita);
}

// Clasament generic dupa orice camp numeric (triviaCastigate, minuteVoice...).
// Doar valori > 0, ca sa nu se umple topul cu zerouri.
export function clasamentDupa(camp, limita = 10) {
  return Object.entries(data.utilizatori)
    .filter(([id]) => !eExclus(id))
    .map(([id, u]) => ({ id, valoare: Number(u[camp]) || 0 }))
    .filter((r) => r.valoare > 0)
    .sort((a, b) => b.valoare - a.valoare)
    .slice(0, limita);
}

// Ridica un fanion o singura data in viata botului. Intoarce true doar prima oara.
export function flagODataSingura(nume) {
  if (data.flags[nume]) return false;
  data.flags[nume] = new Date().toISOString();
  salveaza();
  return true;
}

export function flag(nume) {
  return data.flags[nume];
}

export function seteazaFlag(nume, valoare) {
  data.flags[nume] = valoare;
  salveaza();
}

export const dueluri = data.dueluri;

export function predictie(noua) {
  if (noua !== undefined) { data.predictie = noua; salveaza(); }
  return data.predictie;
}

export function totiUtilizatorii() {
  return data.utilizatori;
}

export function inCirculatie() {
  return Object.values(data.utilizatori).reduce((s, u) => s + (u.sold || 0), 0);
}

export default {
  utilizator, acorda, acordaTrivia, ajusteaza, clasament, clasamentDupa,
  salveaza, undeSalvez, flagODataSingura, flag, seteazaFlag, dueluri,
  predictie, totiUtilizatorii, inCirculatie, ziCurenta,
};
