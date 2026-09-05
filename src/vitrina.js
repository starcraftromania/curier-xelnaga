// Vitrina - clasamentul publicat pe site (starcraftromania.github.io/clasament.json).
// La 10 minute construieste un JSON si il comite prin API-ul GitHub Contents.
// Fara GITHUB_TOKEN modulul tace complet (un singur console.warn la boot).
// Nu comite daca nu s-a schimbat nimic: amprenta SHA-256 a JSON-ului (fara
// campul `generat`) se tine in vitrina.json.
// Nu face NICIUN apel la SC2 Pulse: ladder-ul vine din buletin.json, daca exista.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import store from './store.js';
import { citesteJson, scrieJson, guildul, fetchCuTimeout } from './comun.js';

const AICI = path.dirname(fileURLToPath(import.meta.url));

export const DEFINITII = [];

export const IMPLICIT = {
  intervalMinute: 10,
  primulTickSecunde: 90,
  owner: 'starcraftromania',
  repo: 'starcraftromania.github.io',
  branch: 'main',
  fisier: 'clasament.json',
  numeAnonim: false,
  caleIndexNou: path.join(AICI, 'site-index-nou.html'),
  timeoutMs: 15_000,
};

export const LIGI = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster'];
const CREDIT_PULSE = 'https://sc2pulse.nephest.com/sc2';
const CACHE_NUME_MS = 10 * 60 * 1000;
const FISIER_STARE = 'vitrina.json';

function tokenul() {
  return process.env.GITHUB_TOKEN || null;
}

// ---------------------------------------------------------------------------
// Nume
// ---------------------------------------------------------------------------

const cacheNume = new Map(); // id -> { nume, cand }

export function anonimizeaza(nume) {
  const s = String(nume ?? '');
  return s.slice(0, 2).toLowerCase() + '****';
}

async function numeleLui(guild, id) {
  const acum = Date.now();
  const c = cacheNume.get(id);
  if (c && acum - c.cand < CACHE_NUME_MS) return c.nume;
  let nume = `pilot ${String(id).slice(-4)}`;
  try {
    if (guild) nume = (await guild.members.fetch(id)).displayName;
  } catch { /* plecat de pe server */ }
  cacheNume.set(id, { nume, cand: acum });
  return nume;
}

export function golesteCacheNume() { cacheNume.clear(); }

// ---------------------------------------------------------------------------
// Ladder din buletin.json (fara Pulse)
// ---------------------------------------------------------------------------

// echipe: { [legacyUid]: { rating, leagueType, wins, losses, race, nume, season } }
export function ladderDinBuletin(buletin) {
  const echipe = buletin?.echipe;
  if (!echipe || typeof echipe !== 'object') return [];
  const toate = Object.values(echipe).filter((e) => e && typeof e === 'object' && e.nume);
  if (toate.length === 0) return [];
  const sezonMax = Math.max(...toate.map((e) => Number(e.season) || 0));
  const peNume = new Map();
  for (const e of toate) {
    if ((Number(e.season) || 0) !== sezonMax) continue;
    const mmr = Number(e.rating) || 0;
    const existent = peNume.get(e.nume);
    if (existent && existent.mmr >= mmr) continue;
    peNume.set(e.nume, {
      nume: String(e.nume),
      mmr,
      liga: LIGI[Number(e.leagueType)] ?? 'necunoscuta',
      rasa: e.race ? String(e.race) : 'necunoscuta',
      meciuri: (Number(e.wins) || 0) + (Number(e.losses) || 0),
    });
  }
  return [...peNume.values()].sort((a, b) => b.mmr - a.mmr);
}

// ---------------------------------------------------------------------------
// Constructia JSON-ului
// ---------------------------------------------------------------------------

export async function construiesteClasament(guild, c = IMPLICIT) {
  const nume = async (id) => {
    const n = await numeleLui(guild, id);
    return c.numeAnonim ? anonimizeaza(n) : n;
  };

  const topCredite = store.clasament(10);
  const credite = [];
  for (let k = 0; k < topCredite.length; k++) {
    credite.push({ loc: k + 1, nume: await nume(topCredite[k].id), credite: topCredite[k].valoare });
  }
  // Schema pe care o citeste index.html de pe site: regi = LISTA [{loc, nume, credite, titlu}]
  // (site-ul are propriile subtitluri; un obiect in loc de lista ii crapa scriptul si tabelele raman goale).
  const TITLURI_REGI = ['Regele Regilor', 'Marele Uzurpator', 'Boierul de Vespene'];
  const regi = credite.slice(0, 3).map((r, k) => ({ loc: k + 1, nume: r.nume, credite: r.credite, titlu: TITLURI_REGI[k] }));

  const topTrivia = store.clasamentDupa('triviaCastigate', 10);
  const trivia = [];
  for (let k = 0; k < topTrivia.length; k++) {
    trivia.push({ loc: k + 1, nume: await nume(topTrivia[k].id), victorii: topTrivia[k].valoare });
  }

  const topVoce = store.clasamentDupa('minuteVoice', 10);
  const voce = [];
  for (let k = 0; k < topVoce.length; k++) {
    voce.push({ loc: k + 1, nume: await nume(topVoce[k].id), minute: topVoce[k].valoare });
  }

  const buletin = citesteJson('buletin.json', null);
  let ladder = ladderDinBuletin(buletin);
  if (c.numeAnonim) ladder = ladder.map((r) => ({ ...r, nume: anonimizeaza(r.nume) }));

  const toti = Object.values(store.totiUtilizatorii());
  const statistici = {
    membri: toti.filter((u) => (u.sold || 0) > 0 || (u.totalCastigat || 0) > 0).length,
    inCirculatie: toti.reduce((s, u) => s + (u.sold || 0), 0),
    conturiLegate: Object.keys(buletin?.conturi || {}).length,
    piloti: toti.length,
  };

  return {
    generat: new Date().toISOString(),
    sursa: 'Curierul Xel\'Naga',
    creditSC2Pulse: CREDIT_PULSE,
    regi,
    credite,
    ladder,
    trivia,
    voce,
    statistici,
  };
}

export function amprenta(clasament) {
  const { generat, ...rest } = clasament;
  return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

// ---------------------------------------------------------------------------
// GitHub Contents API
// ---------------------------------------------------------------------------

function anteturi(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

function urlContinut(c, fisier) {
  return `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${fisier}`;
}

async function shaExistent(c, fisier, token) {
  const r = await fetchCuTimeout(`${urlContinut(c, fisier)}?ref=${encodeURIComponent(c.branch)}`, {
    method: 'GET', headers: anteturi(token),
  }, c.timeoutMs);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${fisier}: HTTP ${r.status}`);
  const j = await r.json();
  return j?.sha ?? null;
}

// Comite `continut` (string) ca `fisier` in repo. Intoarce true la succes.
export async function comiteFisier(c, fisier, continut, mesaj, token = tokenul()) {
  if (!token) return false;
  const sha = await shaExistent(c, fisier, token);
  const corp = {
    message: mesaj,
    content: Buffer.from(continut, 'utf8').toString('base64'),
    branch: c.branch,
  };
  if (sha) corp.sha = sha;
  const r = await fetchCuTimeout(urlContinut(c, fisier), {
    method: 'PUT', headers: anteturi(token), body: JSON.stringify(corp),
  }, c.timeoutMs);
  if (!r.ok) {
    let detaliu = '';
    try { detaliu = (await r.text()).slice(0, 200); } catch { /* nimic */ }
    throw new Error(`PUT ${fisier}: HTTP ${r.status} ${detaliu}`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

function citesteStarea() {
  return { amprenta: null, ultimulCommit: null, ...citesteJson(FISIER_STARE, {}) };
}

// One-shot: daca exista src/site-index-nou.html, il comite ca index.html si il sterge local.
export async function publicaIndexNou(c, token = tokenul()) {
  if (!token) return false;
  let html;
  try { html = fs.readFileSync(c.caleIndexNou, 'utf8'); } catch { return false; }
  const ok = await comiteFisier(c, 'index.html', html, `vitrina: index nou ${new Date().toISOString()}`, token);
  if (ok) {
    try { fs.unlinkSync(c.caleIndexNou); } catch (e) { console.error('[vitrina] nu am putut sterge index-ul local:', e.message); }
    console.log('[vitrina] index.html publicat pe site');
  }
  return ok;
}

// Intoarce { comis: bool, motiv } ca sa se poata testa.
export async function tick(client, cfg) {
  const c = { ...IMPLICIT, ...(cfg?.vitrina ?? {}) };
  const token = tokenul();
  if (!token) return { comis: false, motiv: 'fara token' };

  const guild = guildul(client, cfg);
  const clasament = await construiesteClasament(guild, c);
  const amp = amprenta(clasament);
  const stare = citesteStarea();

  let comis = false;
  if (amp !== stare.amprenta) {
    const text = JSON.stringify(clasament, null, 2) + '\n';
    comis = await comiteFisier(c, c.fisier, text, `vitrina: clasament ${clasament.generat}`, token);
    if (comis) {
      scrieJson(FISIER_STARE, { amprenta: amp, ultimulCommit: clasament.generat });
      console.log(`[vitrina] clasament publicat (${clasament.credite.length} la credite, ${clasament.ladder.length} pe ladder)`);
    }
  }

  try { await publicaIndexNou(c, token); } catch (e) { console.error('[vitrina] index nou:', e.message); }

  return { comis, motiv: comis ? 'comis' : 'amprenta neschimbata', amprenta: amp, clasament };
}

export function porneste(client, cfg) {
  const c = { ...IMPLICIT, ...(cfg?.vitrina ?? {}) };
  if (!tokenul()) {
    console.warn('[vitrina] lipseste GITHUB_TOKEN - clasamentul NU se publica pe site');
    return;
  }
  client.once('clientReady', () => {
    const ruleaza = () => tick(client, cfg).catch((e) => console.error('[vitrina]', e.message));
    setTimeout(ruleaza, Math.max(1, c.primulTickSecunde) * 1000);
    setInterval(ruleaza, Math.max(1, c.intervalMinute) * 60 * 1000);
  });
}

export const _intern = {
  construiesteClasament, amprenta, ladderDinBuletin, comiteFisier, publicaIndexNou, tick, anonimizeaza, golesteCacheNume, LIGI, FISIER_STARE,
};
export default { porneste, DEFINITII, _intern };
