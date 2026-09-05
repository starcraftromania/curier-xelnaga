// Buletinul de ladder - urmarirea automata a ladderului SC2 (SC2 Pulse) pentru
// membrii care si-au legat contul.
//
//  - /leaga-contul, /cont lega|sterge|lista, /buletin, /ladder
//  - polling la 10 minute: 8 credite per victorie (plafon propriu 300/zi, camp `ladderAzi`),
//    anunt + bonus la promovare (racire 30 min per om per liga)
//  - buletin zilnic la 23:00 in #buletin-ladder
//  - cursa saptamanala de MMR: snapshot luni 00:00, anunt luni 11:00, premiu + rol hoistat
//
// Starea proprie sta in buletin.json. Creditele se dau DOAR prin store.
// Date: SC2 Pulse (necomercial, cu credit in footer). Toate cererile trec prin galeata(12, 4).

import { EmbedBuilder, MessageFlags } from 'discord.js';
import store from './store.js';
import {
  citesteJson, scrieJson, oraLocala, ziLocala, inceputSaptamanii, guildul, gasesteCanal,
  asiguraCanal, asiguraRol, potMutaRolul, numeleLui, trimite, galeata, fetchCuTimeout, pad,
} from './comun.js';

export const BAZA = 'https://sc2pulse.nephest.com/sc2';
export const LIGI = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster'];
export const REGIUNI = { 1: 'US', 2: 'EU', 3: 'KR', 5: 'CN' };
export const COZI = { LOTV_1V1: 201, LOTV_2V2: 202 };
export const NUME_ROL = '📈 Ascensiunea Saptamanii';
export const FOOTER = 'Date: SC2 Pulse · https://sc2pulse.nephest.com/sc2';

const FISIER = 'buletin.json';
const ETICHETE = { LOTV_1V1: '1v1', LOTV_2V2: '2v2' };
const RASE = { TERRAN: 'Terran', PROTOSS: 'Protoss', ZERG: 'Zerg', RANDOM: 'Random' };
const RACIRE_PROMOVARE_MS = 30 * 60 * 1000;
const PRIMUL_POLL_MS = 2 * 60 * 1000;
const TICK_MS = 60 * 1000;

const IMPLICIT = {
  intervalMinute: 10,
  perVictorie: 8,
  plafonZi: 300,
  bonusPromovare: 150,
  oraBuletin: 23,
  canalBuletin: 'buletin-ladder',
  cursa: { ziua: 1, ora: 11, premiu: 500, minimMeciuri: 5 },
};

// ---------------------------------------------------------------------------
// Stare
// ---------------------------------------------------------------------------

const GOL = () => ({
  conturi: {},
  echipe: {},
  snapshotZi: { data: null, echipe: {} },
  snapshotSapt: { inceput: null, echipe: {} },
  promovari: {},
  cursa: { ultimaAnuntata: null, inAsteptare: null },
  ultimulBuletin: null,
});

let stare = GOL();
let cfgModul = { ...IMPLICIT, moneda: '◈' };
let clientul = null;

function incarcaStarea() {
  const s = citesteJson(FISIER, null);
  stare = { ...GOL(), ...(s ?? {}) };
  for (const k of ['conturi', 'echipe', 'promovari']) if (!stare[k] || typeof stare[k] !== 'object') stare[k] = {};
  stare.snapshotZi = { data: null, echipe: {}, ...(stare.snapshotZi ?? {}) };
  stare.snapshotSapt = { inceput: null, echipe: {}, ...(stare.snapshotSapt ?? {}) };
  stare.cursa = { ultimaAnuntata: null, inAsteptare: null, ...(stare.cursa ?? {}) };
  return stare;
}

function salveazaStarea() {
  scrieJson(FISIER, stare);
}

// ---------------------------------------------------------------------------
// Pulse: cereri
// ---------------------------------------------------------------------------

const ia = galeata(12, 4);

async function pulse(cale) {
  await ia();
  const r = await fetchCuTimeout(BAZA + cale, {}, 8000);
  if (!r.ok) throw new Error(`Pulse HTTP ${r.status} la ${cale}`);
  return r.json();
}

// Normalizeaza ce a scris omul: trim, spatii multiple, apostrof tipografic -> ASCII.
export function normalizeaza(text) {
  return String(text ?? '')
    .replace(/[\u2018\u2019\u02BC\u2032\u0060\u00B4]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Un link Battle.net / SC2 Pulse lipit: ID-ul intern nu e convertibil in BattleTag.
export function eLink(text) {
  return /https?:\/\//i.test(text) || /battle\.net|sc2pulse|nephest\.com|starcraft2\.blizzard/i.test(text);
}

function numarSezon(s) {
  return Number(s?.battlenetId ?? s?.id ?? 0);
}

async function sezonulCurent() {
  const sezoane = await pulse('/api/seasons');
  let max = 0;
  for (const s of Array.isArray(sezoane) ? sezoane : []) max = Math.max(max, numarSezon(s));
  if (!max) throw new Error('Pulse nu a intors niciun sezon');
  return max;
}

function regiuneNume(r) {
  if (typeof r === 'string') return r;
  return REGIUNI[r] ?? String(r ?? '?');
}

function eEU(r) {
  return r === 2 || r === 'EU';
}

function numeLiga(t) {
  return LIGI[Number(t)] ?? `liga ${t}`;
}

function mmrDin(c) {
  return Number(c?.currentStats?.rating ?? c?.ratingMax ?? 0) || 0;
}

// Rasa unui membru: raceGames { TERRAN: n, ... }, apoi <rasa>GamesPlayed, apoi member.race.
function rasaMembru(m) {
  if (!m) return 'necunoscuta';
  let cea = null; let max = -1;
  const jocuri = m.raceGames && typeof m.raceGames === 'object' ? m.raceGames : {};
  for (const [r, n] of Object.entries(jocuri)) {
    if (Number(n) > max) { max = Number(n); cea = r; }
  }
  if (cea === null) {
    for (const [r, camp] of [['TERRAN', 'terranGamesPlayed'], ['PROTOSS', 'protossGamesPlayed'], ['ZERG', 'zergGamesPlayed'], ['RANDOM', 'randomGamesPlayed']]) {
      const n = Number(m[camp] ?? 0);
      if (n > max) { max = n; cea = r; }
    }
    if (max <= 0) cea = null;
  }
  if (cea === null && m.race) cea = String(m.race).toUpperCase();
  return RASE[cea] ?? (cea ? cea : 'necunoscuta');
}

function rasaEchipei(echipa, characterId) {
  const membri = Array.isArray(echipa?.members) ? echipa.members : [];
  const alMeu = membri.find((m) => String(m?.character?.id) === String(characterId)) ?? membri[0];
  return rasaMembru(alMeu);
}

function ligaEchipei(t) {
  return Number(t?.leagueType ?? t?.league?.type ?? 0) || 0;
}

function dataScurta(iso) {
  if (!iso) return 'niciodata';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const l = oraLocala(d);
  return `${pad(l.zi)}.${pad(l.luna)}.${l.an} ${pad(l.ora)}:${pad(l.minut)}`;
}

function embedNou() {
  return new EmbedBuilder().setColor(0x3498DB).setFooter({ text: FOOTER }).setTimestamp(new Date());
}

// ---------------------------------------------------------------------------
// Legarea contului
// ---------------------------------------------------------------------------

export async function cautaCaractere(cautare) {
  const r = await pulse(`/api/characters?query=${encodeURIComponent(cautare)}`);
  return Array.isArray(r) ? r : [];
}

// Dintre mai multe rezultate: EU cu MMR-ul cel mai mare; altfel MMR-ul cel mai mare.
export function alegeCaracterul(rezultate) {
  if (!rezultate.length) return null;
  const eu = rezultate.filter((c) => eEU(c?.members?.character?.region));
  const lista = eu.length ? eu : rezultate;
  return lista.slice().sort((a, b) => mmrDin(b) - mmrDin(a))[0];
}

// Descopera echipele (1v1 si 2v2, o cerere per coada) si le pune in stare.
async function descoperaEchipele(discordId, cont, sezon) {
  const gasite = [];
  for (const coada of Object.keys(COZI)) {
    let echipe;
    try {
      echipe = await pulse(`/api/character-teams?characterId=${encodeURIComponent(cont.id)}&season=${sezon}&queue=${coada}`);
    } catch (e) {
      console.error(`[buletin] character-teams ${coada} pentru ${cont.id}:`, e.message);
      continue;
    }
    for (const t of Array.isArray(echipe) ? echipe : []) {
      if (!t?.legacyUid) continue;
      const inreg = {
        discordId, characterId: cont.id, nume: cont.nume, coada,
        season: Number(t.season ?? sezon), rating: Number(t.rating ?? 0) || 0,
        leagueType: ligaEchipei(t), wins: Number(t.wins ?? 0) || 0, losses: Number(t.losses ?? 0) || 0,
        race: rasaEchipei(t, cont.id), lastPlayed: t.lastPlayed ?? null, eticheta: ETICHETE[coada] ?? coada,
      };
      stare.echipe[String(t.legacyUid)] = inreg;
      gasite.push(inreg);
    }
  }
  return gasite;
}

// Leaga un cont. Intoarce { text } pentru raspunsul efemer.
export async function leaga(discordId, cautareBruta) {
  const M = cfgModul.moneda;
  const cautare = normalizeaza(cautareBruta);
  if (!cautare) return { text: 'Scrie BattleTag-ul tau, de forma `Nume#1234`.' };
  if (eLink(cautare)) {
    return { text: 'Ai lipit un link. ID-ul intern din linkurile Battle.net / SC2 Pulse nu se poate converti in cont; foloseste BattleTag-ul tau, de forma `Nume#1234`.' };
  }

  let rezultate;
  try { rezultate = await cautaCaractere(cautare); } catch (e) {
    console.error('[buletin] cautare:', e.message);
    return { text: 'SC2 Pulse nu raspunde acum. Incearca din nou in cateva minute.' };
  }
  if (!rezultate.length) return { text: `Nu am gasit niciun cont pentru \`${cautare}\`. Verifica BattleTag-ul (cu #) si ca ai jucat macar un meci de ladder.` };

  const ales = alegeCaracterul(rezultate);
  const ch = ales.members?.character ?? {};
  const cont = {
    id: Number(ch.id),
    nume: String(ch.name ?? cautare).replace(/#\d+$/, ''),
    battleTag: ales.members?.account?.battleTag ?? null,
    regiune: regiuneNume(ch.region),
  };
  if (!cont.id) return { text: 'Rezultatul de la SC2 Pulse nu are un ID de caracter. Incearca cu BattleTag-ul complet.' };

  const conturi = stare.conturi[discordId] ?? (stare.conturi[discordId] = []);
  if (!conturi.some((c) => c.id === cont.id)) conturi.push(cont);

  let sezon; let echipe = [];
  try {
    sezon = await sezonulCurent();
    echipe = await descoperaEchipele(discordId, cont, sezon);
  } catch (e) {
    console.error('[buletin] descoperire echipe:', e.message);
  }
  salveazaStarea();

  const linii = [`Cont legat: **${cont.nume}**${cont.battleTag ? ` (${cont.battleTag})` : ''} · ${cont.regiune} · id ${cont.id}`];
  if (rezultate.length > 1) linii.push(`Am gasit ${rezultate.length} rezultate; l-am ales pe cel din EU cu MMR-ul cel mai mare.`);
  if (echipe.length) {
    for (const t of echipe) linii.push(`· ${t.eticheta}: **${t.rating}** MMR · ${numeLiga(t.leagueType)} · ${t.race} · ${t.wins}W-${t.losses}L`);
    linii.push(`De acum primesti ${cfgModul.perVictorie} ${M} pe victorie (plafon ${cfgModul.plafonZi} ${M}/zi) si intri in cursa saptamanala.`);
  } else {
    linii.push(sezon ? 'Nu am gasit echipe in sezonul curent; joaca un meci si reapare.' : 'Nu am putut citi echipele acum; le caut la urmatoarea verificare.');
  }
  return { text: linii.join('\n'), cont, echipe };
}

export function stergeConturile(discordId) {
  const cate = (stare.conturi[discordId] ?? []).length;
  delete stare.conturi[discordId];
  for (const [uid, t] of Object.entries(stare.echipe)) if (t.discordId === discordId) delete stare.echipe[uid];
  delete stare.promovari[discordId];
  salveazaStarea();
  return cate;
}

export function listaConturi(discordId) {
  return stare.conturi[discordId] ?? [];
}

// ---------------------------------------------------------------------------
// Credite: plafon propriu pe zi (ladderAzi / ziLadder), separat de plafonul comun
// ---------------------------------------------------------------------------

export function acordaLadder(discordId, suma, plafon = cfgModul.plafonZi) {
  const u = store.utilizator(discordId);
  const azi = store.ziCurenta();
  if (u.ziLadder !== azi) { u.ziLadder = azi; u.ladderAzi = 0; }
  if (typeof u.ladderAzi !== 'number') u.ladderAzi = 0;
  const ramas = Math.max(0, plafon - u.ladderAzi);
  const dat = Math.max(0, Math.min(Math.round(suma), ramas));
  if (dat > 0) {
    store.ajusteaza(discordId, dat);
    u.totalCastigat += dat;
    u.ladderAzi += dat;
    store.salveaza();
  }
  return dat;
}

// Bonusurile (promovare, cursa) nu trec prin plafonul zilnic, dar urca si totalCastigat.
function acordaBonus(discordId, suma) {
  store.ajusteaza(discordId, suma);
  const u = store.utilizator(discordId);
  u.totalCastigat += Math.round(suma);
  store.salveaza();
  return Math.round(suma);
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

function sezonMaxim(echipe) {
  let max = 0;
  for (const t of echipe) max = Math.max(max, Number(t?.season ?? 0) || 0);
  return max;
}

// Verifica toate echipele urmarite. Intoarce { victorii, promovari } pentru teste/log.
export async function sondeaza(acum = new Date()) {
  const uids = Object.keys(stare.echipe);
  const rezultat = { victorii: 0, promovari: 0, credite: 0 };
  if (!uids.length) return rezultat;

  const M = cfgModul.moneda;
  const guild = clientul ? guildul(clientul, cfgModul) : null;
  const general = guild ? gasesteCanal(guild, cfgModul.canalGeneral) : null;

  for (let i = 0; i < uids.length; i += 100) {
    const lot = uids.slice(i, i + 100);
    let raspuns;
    try {
      raspuns = await pulse(`/api/teams?last&teamLegacyUid=${encodeURIComponent(lot.join(','))}`);
    } catch (e) {
      console.error('[buletin] teams?last:', e.message);
      continue;
    }
    const toate = (Array.isArray(raspuns) ? raspuns : []).filter((t) => t?.legacyUid && stare.echipe[String(t.legacyUid)]);

    // Raspunsul contine toate sezoanele: pastram, per echipa, doar sezonul maxim.
    const peUid = new Map();
    for (const t of toate) {
      const uid = String(t.legacyUid);
      const lista = peUid.get(uid) ?? [];
      lista.push(t); peUid.set(uid, lista);
    }

    for (const [uid, lista] of peUid) {
      const sezon = sezonMaxim(lista);
      const t = lista.filter((x) => Number(x.season) === sezon).sort((a, b) => Number(b.wins ?? 0) - Number(a.wins ?? 0))[0];
      const vechi = stare.echipe[uid];
      const nou = {
        ...vechi,
        season: sezon, rating: Number(t.rating ?? vechi.rating) || 0, leagueType: ligaEchipei(t) || vechi.leagueType,
        wins: Number(t.wins ?? vechi.wins) || 0, losses: Number(t.losses ?? vechi.losses) || 0,
        race: rasaEchipei(t, vechi.characterId) || vechi.race, lastPlayed: t.lastPlayed ?? vechi.lastPlayed,
      };

      const acelasiSezon = Number(vechi.season) === sezon;
      if (acelasiSezon) {
        const dif = nou.wins - (Number(vechi.wins) || 0);
        if (dif > 0) {
          const dat = acordaLadder(vechi.discordId, cfgModul.perVictorie * dif, cfgModul.plafonZi);
          rezultat.victorii += dif; rezultat.credite += dat;
        }
        if (nou.leagueType > (Number(vechi.leagueType) || 0)) {
          await anuntaPromovarea(vechi.discordId, nou, general, acum, M, rezultat);
        }
      }
      stare.echipe[uid] = nou;
    }
  }
  salveazaStarea();
  return rezultat;
}

async function anuntaPromovarea(discordId, echipa, canal, acum, M, rezultat) {
  const ultima = stare.promovari[discordId];
  const acumMs = acum.getTime();
  if (ultima && Number(ultima.leagueType) === echipa.leagueType && acumMs - Number(ultima.cand ?? 0) < RACIRE_PROMOVARE_MS) {
    return false; // aceeasi liga, in racire: nu re-anuntam si nu re-platim
  }
  stare.promovari[discordId] = { leagueType: echipa.leagueType, cand: acumMs };
  const bonus = acordaBonus(discordId, cfgModul.bonusPromovare);
  rezultat.promovari += 1;
  const liga = numeLiga(echipa.leagueType);
  await trimite(canal, `📈 <@${discordId}> (**${echipa.nume}**, ${echipa.eticheta}) a promovat in **${liga}**! Bonus: +${bonus} ${M}`);
  return true;
}

// ---------------------------------------------------------------------------
// Snapshoturi, buletin zilnic, cursa saptamanala
// ---------------------------------------------------------------------------

function snapshotEchipe() {
  const s = {};
  for (const [uid, t] of Object.entries(stare.echipe)) s[uid] = { wins: t.wins, losses: t.losses, rating: t.rating };
  return s;
}

export function asiguraSnapshotZi(acum = new Date()) {
  const azi = ziLocala(acum);
  if (stare.snapshotZi.data === azi) return false;
  stare.snapshotZi = { data: azi, echipe: snapshotEchipe() };
  salveazaStarea();
  return true;
}

// Luni 00:00: inchide saptamana (calculeaza castigatorul cursei) si porneste alta.
export function asiguraSnapshotSapt(acum = new Date()) {
  const inceput = inceputSaptamanii(acum).toISOString();
  if (stare.snapshotSapt.inceput === inceput) return false;
  if (stare.snapshotSapt.inceput && Object.keys(stare.snapshotSapt.echipe ?? {}).length) {
    const rez = rezultatulCursei(stare.snapshotSapt);
    stare.cursa.inAsteptare = { saptamana: stare.snapshotSapt.inceput, ...rez };
  }
  stare.snapshotSapt = { inceput, echipe: snapshotEchipe() };
  salveazaStarea();
  return true;
}

// Cel mai mare castig de MMR pe 1v1 fata de snapshot, cu minimul de meciuri.
export function rezultatulCursei(snapshot, minimMeciuri = cfgModul.cursa.minimMeciuri) {
  const peOm = new Map();
  for (const [uid, t] of Object.entries(stare.echipe)) {
    if (t.coada !== 'LOTV_1V1') continue;
    const s = snapshot?.echipe?.[uid];
    if (!s) continue;
    const meciuri = (t.wins + t.losses) - ((Number(s.wins) || 0) + (Number(s.losses) || 0));
    const castig = t.rating - (Number(s.rating) || 0);
    if (meciuri < minimMeciuri) continue;
    const vechi = peOm.get(t.discordId);
    if (!vechi || castig > vechi.castig) peOm.set(t.discordId, { discordId: t.discordId, nume: t.nume, castig, meciuri, rating: t.rating });
  }
  const clasament = [...peOm.values()].sort((a, b) => b.castig - a.castig);
  return { castigator: clasament[0] ?? null, clasament: clasament.slice(0, 5) };
}

async function mutaRolul(guild, discordId) {
  if (!guild) return 'fara guild';
  const rol = await asiguraRol(guild, NUME_ROL, { culoare: 0x2ECC71, hoist: true, motiv: 'Cursa saptamanala de MMR' });
  if (!rol) return 'nu pot crea rolul';
  if (!potMutaRolul(guild, rol)) return 'rolul e deasupra mea';
  try {
    for (const m of rol.members?.values?.() ?? []) if (m.id !== discordId) await m.roles.remove(rol);
    const nou = await guild.members.fetch(discordId);
    await nou.roles.add(rol);
    return null;
  } catch (e) {
    console.error('[buletin] mutare rol:', e.message);
    return e.message;
  }
}

export async function anuntaCursa(guild, acum = new Date()) {
  const p = stare.cursa.inAsteptare;
  if (!p || stare.cursa.ultimaAnuntata === p.saptamana) return false;
  const M = cfgModul.moneda;
  const canal = guild ? gasesteCanal(guild, cfgModul.canalGeneral) : null;
  const e = embedNou().setColor(0x2ECC71).setTitle('📈 Ascensiunea Saptamanii');

  if (!p.castigator) {
    e.setDescription(`Saptamana trecuta nimeni nu a jucat cel putin ${cfgModul.cursa.minimMeciuri} meciuri de 1v1 cu contul legat. Leaga-ti contul cu \`/leaga-contul\` si intra in cursa.`);
  } else {
    const c = p.castigator;
    const premiu = acordaBonus(c.discordId, cfgModul.cursa.premiu);
    const motiv = await mutaRolul(guild, c.discordId);
    const linii = [`<@${c.discordId}> (**${c.nume}**) a urcat **${c.castig >= 0 ? '+' : ''}${c.castig} MMR** in ${c.meciuri} meciuri de 1v1. Premiu: **+${premiu} ${M}**${motiv ? '' : ` si rolul ${NUME_ROL}`}.`];
    if (p.clasament.length > 1) {
      linii.push('', 'Restul plutonului:');
      p.clasament.slice(1).forEach((r, k) => linii.push(`${k + 2}. ${r.nume}: ${r.castig >= 0 ? '+' : ''}${r.castig} MMR (${r.meciuri} meciuri)`));
    }
    if (motiv) linii.push('', `(nu am putut muta rolul: ${motiv})`);
    e.setDescription(linii.join('\n'));
  }
  await trimite(canal, { embeds: [e] });
  stare.cursa.ultimaAnuntata = p.saptamana;
  stare.cursa.inAsteptare = null;
  salveazaStarea();
  return true;
}

// Sezonul cel mai nou printre echipele urmarite (1v1 primeaza).
function sezonulUrmarit() {
  return sezonMaxim(Object.values(stare.echipe));
}

function celeMaiBune1v1() {
  const sezon = sezonulUrmarit();
  const peOm = new Map();
  for (const [uid, t] of Object.entries(stare.echipe)) {
    if (t.coada !== 'LOTV_1V1' || Number(t.season) !== sezon) continue;
    const vechi = peOm.get(t.discordId);
    if (!vechi || t.rating > vechi.rating) peOm.set(t.discordId, { uid, ...t });
  }
  return [...peOm.values()].sort((a, b) => b.rating - a.rating);
}

export async function construiesteBuletin(guild) {
  const top = celeMaiBune1v1();
  const e = embedNou().setTitle('📡 Buletinul de ladder · 1v1');
  if (!top.length) {
    e.setDescription('Nimeni nu si-a legat contul inca. `/leaga-contul Nume#1234` si apari aici.');
    return e;
  }
  const linii = [];
  for (let k = 0; k < top.length && k < 20; k++) {
    const t = top[k];
    const nume = guild ? await numeleLui(guild, t.discordId) : t.discordId;
    linii.push(`**${k + 1}.** ${nume} (${t.nume}) · **${t.rating}** MMR · ${numeLiga(t.leagueType)} · ${t.race} · ${t.wins}W-${t.losses}L · ultimul meci ${dataScurta(t.lastPlayed)}`);
  }
  e.setDescription(linii.join('\n'));
  return e;
}

// Buletinul de la 23:00: meciuri jucate azi per om, promovari, MMR curent.
export async function buletinZilnic(guild, acum = new Date()) {
  const azi = ziLocala(acum);
  const snap = stare.snapshotZi?.data === azi ? stare.snapshotZi.echipe : {};
  const M = cfgModul.moneda;

  const peOm = new Map();
  for (const [uid, t] of Object.entries(stare.echipe)) {
    const s = snap[uid];
    const meciuri = s ? (t.wins + t.losses) - (s.wins + s.losses) : 0;
    const victorii = s ? t.wins - s.wins : 0;
    const dMmr = s ? t.rating - s.rating : 0;
    const o = peOm.get(t.discordId) ?? { discordId: t.discordId, nume: t.nume, meciuri: 0, victorii: 0, mmr1v1: null, dMmr: 0, liga: null };
    o.meciuri += Math.max(0, meciuri); o.victorii += Math.max(0, victorii);
    if (t.coada === 'LOTV_1V1' && (o.mmr1v1 === null || t.rating > o.mmr1v1)) { o.mmr1v1 = t.rating; o.dMmr = dMmr; o.liga = t.leagueType; }
    peOm.set(t.discordId, o);
  }
  const activi = [...peOm.values()].filter((o) => o.meciuri > 0).sort((a, b) => b.meciuri - a.meciuri);
  const promovati = Object.entries(stare.promovari).filter(([, p]) => ziLocala(new Date(p.cand)) === azi);

  const e = embedNou().setTitle(`📡 Buletinul de ladder · ${pad(oraLocala(acum).zi)}.${pad(oraLocala(acum).luna)}.${oraLocala(acum).an}`);
  const linii = [];
  if (!activi.length) linii.push('Azi nimeni cu cont legat nu a jucat ladder. Maine e alta zi.');
  else {
    linii.push(`**Meciuri jucate azi** (${activi.length} ${activi.length === 1 ? 'om' : 'oameni'}):`);
    for (const o of activi.slice(0, 15)) {
      const nume = guild ? await numeleLui(guild, o.discordId) : o.discordId;
      const mmr = o.mmr1v1 === null ? '' : ` · ${o.mmr1v1} MMR (${o.dMmr >= 0 ? '+' : ''}${o.dMmr}) ${numeLiga(o.liga)}`;
      linii.push(`· ${nume} (${o.nume}): ${o.meciuri} meciuri, ${o.victorii} victorii${mmr}`);
    }
  }
  if (promovati.length) {
    linii.push('', '**Promovari azi:**');
    for (const [id, p] of promovati) linii.push(`· <@${id}> -> ${numeLiga(p.leagueType)}`);
  }
  linii.push('', `Fiecare victorie aduce ${cfgModul.perVictorie} ${M} (plafon ${cfgModul.plafonZi} ${M}/zi). Leaga-ti contul cu \`/leaga-contul\`.`);
  e.setDescription(linii.join('\n'));
  return e;
}

async function trimiteBuletinul(guild, acum = new Date()) {
  const canal = await asiguraCanal(guild, cfgModul.canalBuletin, { readOnly: true, motiv: 'Buletinul de ladder' });
  const e = await buletinZilnic(guild, acum);
  await trimite(canal, { embeds: [e] });
  stare.ultimulBuletin = ziLocala(acum);
  salveazaStarea();
}

// Ticul de minut: snapshoturi, buletinul de 23:00, cursa de luni 11:00.
export async function tick(acum = new Date()) {
  const guild = clientul ? guildul(clientul, cfgModul) : null;
  try {
    asiguraSnapshotZi(acum);
    asiguraSnapshotSapt(acum);
    const l = oraLocala(acum);
    if (l.ora >= cfgModul.oraBuletin && stare.ultimulBuletin !== l.data && guild) await trimiteBuletinul(guild, acum);
    if (l.ziSapt === cfgModul.cursa.ziua && l.ora >= cfgModul.cursa.ora && stare.cursa.inAsteptare && guild) await anuntaCursa(guild, acum);
  } catch (e) {
    console.error('[buletin] tick:', e.message);
  }
}

// ---------------------------------------------------------------------------
// /ladder - cautare live, fara legare
// ---------------------------------------------------------------------------

export async function cautaLadder(cautareBruta) {
  const cautare = normalizeaza(cautareBruta);
  if (!cautare) return { text: 'Scrie un BattleTag sau un nume de profil.' };
  if (eLink(cautare)) return { text: 'Cauta dupa BattleTag (`Nume#1234`) sau nume de profil, nu dupa link.' };
  let rezultate;
  try { rezultate = await cautaCaractere(cautare); } catch (e) {
    console.error('[buletin] ladder:', e.message);
    return { text: 'SC2 Pulse nu raspunde acum. Incearca din nou in cateva minute.' };
  }
  if (!rezultate.length) return { text: `Nimic pe SC2 Pulse pentru \`${cautare}\`.` };
  const top = rezultate.slice().sort((a, b) => Number(b.ratingMax ?? 0) - Number(a.ratingMax ?? 0)).slice(0, 5);
  const e = embedNou().setTitle(`🔎 Ladder: ${cautare}`);
  const linii = top.map((c, k) => {
    const ch = c.members?.character ?? {};
    const tag = c.members?.account?.battleTag ? ` (${c.members.account.battleTag})` : '';
    const curent = c.currentStats?.rating ? `${c.currentStats.rating} MMR acum` : 'fara MMR curent';
    return `**${k + 1}.** ${String(ch.name ?? '?').replace(/#\d+$/, '')}${tag} · ${regiuneNume(ch.region)} · ${curent} · max ${c.ratingMax ?? '?'} · ${numeLiga(c.leagueMax)} · ${rasaMembru(c.members)}`;
  });
  if (rezultate.length > 5) linii.push(`… si inca ${rezultate.length - 5}.`);
  e.setDescription(linii.join('\n'));
  return { embed: e };
}

// ---------------------------------------------------------------------------
// Comenzi
// ---------------------------------------------------------------------------

export const DEFINITII = [
  {
    name: 'leaga-contul',
    description: 'Leaga-ti contul de SC2 (BattleTag) ca sa primesti credite pe victorii',
    options: [{ name: 'cautare', description: 'BattleTag-ul tau, de forma Nume#1234 (recomandat), sau numele de profil', type: 3, required: true }],
  },
  {
    name: 'cont',
    description: 'Conturile tale de SC2 legate de Cetate',
    options: [
      {
        name: 'lega', description: 'Leaga un cont de SC2', type: 1,
        options: [{ name: 'cautare', description: 'BattleTag-ul, de forma Nume#1234, sau numele de profil', type: 3, required: true }],
      },
      { name: 'sterge', description: 'Scoate toate conturile tale legate', type: 1 },
      { name: 'lista', description: 'Arata conturile tale legate', type: 1 },
    ],
  },
  { name: 'buletin', description: 'Topul MMR al Cetatii (1v1, sezonul curent)' },
  {
    name: 'ladder',
    description: 'Cauta un jucator pe SC2 Pulse (fara legare)',
    options: [{ name: 'jucator', description: 'BattleTag (Nume#1234) sau nume de profil', type: 3, required: true }],
  },
];

async function raspundeEfemer(i, continut) {
  const corp = typeof continut === 'string' ? { content: continut } : continut;
  try {
    if (i.deferred || i.replied) return await i.editReply(corp);
    return await i.reply({ ...corp, flags: MessageFlags.Ephemeral });
  } catch (e) { console.error('[buletin] raspuns:', e.message); return null; }
}

async function laComanda(i) {
  const guild = i.guild ?? (clientul ? guildul(clientul, cfgModul) : null);
  if (i.commandName === 'leaga-contul' || (i.commandName === 'cont' && i.options.getSubcommand(false) === 'lega')) {
    try { await i.deferReply({ flags: MessageFlags.Ephemeral }); } catch { /* raspundem oricum */ }
    const r = await leaga(i.user.id, i.options.getString('cautare', true));
    return raspundeEfemer(i, r.text);
  }
  if (i.commandName === 'cont') {
    const sub = i.options.getSubcommand(false);
    if (sub === 'sterge') {
      const cate = stergeConturile(i.user.id);
      return raspundeEfemer(i, cate ? `Am scos ${cate} ${cate === 1 ? 'cont' : 'conturi'}. Nu mai primesti credite pe victorii.` : 'Nu aveai niciun cont legat.');
    }
    const conturi = listaConturi(i.user.id);
    if (!conturi.length) return raspundeEfemer(i, 'Nu ai niciun cont legat. `/leaga-contul Nume#1234`.');
    const linii = conturi.map((c) => {
      const echipe = Object.values(stare.echipe).filter((t) => t.characterId === c.id).map((t) => `${t.eticheta} ${t.rating} ${numeLiga(t.leagueType)}`);
      return `· **${c.nume}**${c.battleTag ? ` (${c.battleTag})` : ''} · ${c.regiune}${echipe.length ? ` · ${echipe.join(' / ')}` : ''}`;
    });
    return raspundeEfemer(i, linii.join('\n'));
  }
  if (i.commandName === 'buletin') {
    try { await i.deferReply(); } catch { /* raspundem oricum */ }
    const e = await construiesteBuletin(guild);
    try { return await i.editReply({ embeds: [e] }); } catch (err) { console.error('[buletin] /buletin:', err.message); return null; }
  }
  if (i.commandName === 'ladder') {
    try { await i.deferReply(); } catch { /* raspundem oricum */ }
    const r = await cautaLadder(i.options.getString('jucator', true));
    try { return await i.editReply(r.embed ? { embeds: [r.embed] } : { content: r.text }); } catch (err) { console.error('[buletin] /ladder:', err.message); return null; }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pornire
// ---------------------------------------------------------------------------

export function configureaza(cfg = {}) {
  const b = cfg.buletin ?? {};
  cfgModul = {
    ...IMPLICIT, ...b,
    cursa: { ...IMPLICIT.cursa, ...(b.cursa ?? {}) },
    moneda: cfg.moneda ?? '◈',
    canalGeneral: cfg.canale?.general ?? 'general',
    guild: cfg.guild,
  };
  return cfgModul;
}

export function porneste(client, cfg = {}) {
  clientul = client;
  configureaza(cfg);
  incarcaStarea();

  client.on('interactionCreate', (i) => {
    if (!i.isChatInputCommand?.()) return;
    if (!['leaga-contul', 'cont', 'buletin', 'ladder'].includes(i.commandName)) return;
    laComanda(i).catch((e) => console.error('[buletin] comanda:', e.message));
  });

  client.once('clientReady', () => {
    const interval = Math.max(1, Number(cfgModul.intervalMinute) || 10) * 60 * 1000;
    const ruleaza = () => sondeaza().then((r) => {
      if (r.victorii || r.promovari) console.log(`[buletin] ${r.victorii} victorii (+${r.credite}), ${r.promovari} promovari`);
    }).catch((e) => console.error('[buletin] sondaj:', e.message));
    setTimeout(() => { ruleaza(); setInterval(ruleaza, interval).unref?.(); }, PRIMUL_POLL_MS).unref?.();
    setInterval(() => tick().catch((e) => console.error('[buletin] tick:', e.message)), TICK_MS).unref?.();
    tick().catch((e) => console.error('[buletin] tick:', e.message));
    console.log(`[buletin] pornit: ${Object.keys(stare.conturi).length} oameni, ${Object.keys(stare.echipe).length} echipe urmarite`);
  });
}

export const _intern = {
  get stare() { return stare; },
  get cfg() { return cfgModul; },
  incarcaStarea, salveazaStarea, configureaza, normalizeaza, eLink, alegeCaracterul, leaga, stergeConturile, listaConturi,
  acordaLadder, sondeaza, asiguraSnapshotZi, asiguraSnapshotSapt, rezultatulCursei, anuntaCursa, buletinZilnic,
  construiesteBuletin, cautaLadder, tick, rasaMembru, numeLiga, laComanda,
  setClient(c) { clientul = c; },
};

export default { porneste, DEFINITII };
